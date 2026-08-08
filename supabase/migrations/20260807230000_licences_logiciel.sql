/*
  # LICENCES LOGICIEL OMEGADMX

  Le logiciel OMEGADMX est GRATUIT pour qui possède un boîtier OMEGA DMX : le boîtier
  s'authentifie auprès du logiciel par défi-réponse HMAC-SHA256, donc l'utilisateur n'a
  RIEN à saisir. Le logiciel reconnaît son matériel et se débloque seul.

  En revanche, piloter une interface d'une AUTRE marque (Sunlite/Nicolaudie…) suppose que
  le client n'a pas acheté de boîtier OMEGA : il doit alors participer au développement du
  logiciel en achetant une licence. C'est l'objet de ce fichier.

  ## Ce que ça crée

  1. `products.product_type` — distingue un produit MATÉRIEL d'une LICENCE logicielle.
     Une licence n'a ni poids, ni transport, ni stock : le reste du site doit pouvoir la
     traiter à part (pas de frais de port, pas d'adresse obligatoire).

  2. `licences` — une ligne = un droit d'usage, appartenant à UN compte OMEGA.
     Émise automatiquement à la commande payée, révocable depuis l'administration.

  3. `licence_activations` — les postes sur lesquels la licence a été activée.
     Une licence autorise `postes_max` machines : ça permet à un client d'avoir son PC de
     régie et son portable de secours, sans laisser une licence circuler indéfiniment.

  4. `confirmer_commande` — version étendue : émet la licence DANS la même transaction que
     la commande. Idempotent (le webhook Stripe rejoue la même fonction en filet).

  ## Sécurité

  - Un client LIT ses licences, il n'en crée ni n'en modifie AUCUNE : seules les fonctions
    SECURITY DEFINER (donc le serveur de paiement) écrivent. Sans ça, n'importe qui
    s'auto-délivrerait une licence par l'API publique.
  - L'administrateur voit et révoque tout, via `is_admin()` (déjà utilisée ailleurs, elle
    évite la récursion de policy sur `profiles`).
*/

-- ============================================================
-- 1) Type de produit : matériel ou licence logicielle
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS product_type text NOT NULL DEFAULT 'materiel';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_product_type_check'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_product_type_check
      CHECK (product_type IN ('materiel', 'licence'));
  END IF;
END $$;

COMMENT ON COLUMN products.product_type IS
  'materiel = objet expédié (port + adresse requis) ; licence = droit logiciel dématérialisé (ni port ni adresse).';

-- ============================================================
-- 2) Les licences
-- ============================================================

CREATE TABLE IF NOT EXISTS licences (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Le compte OMEGA propriétaire. La licence lui est INTRINSÈQUEMENT liée : c'est ce
  -- compte qui l'active dans le logiciel, il n'y a pas de clé qui circule.
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id     uuid REFERENCES products(id) ON DELETE SET NULL,
  order_id       uuid REFERENCES orders(id) ON DELETE SET NULL,

  -- 'active' : utilisable. 'revoquee' : coupée par l'administration (fraude, litige).
  -- 'remboursee' : commande remboursée, le droit tombe avec elle.
  statut         text NOT NULL DEFAULT 'active'
                 CHECK (statut IN ('active', 'revoquee', 'remboursee')),

  -- Nombre de postes simultanément activables (régie + secours par défaut).
  postes_max     integer NOT NULL DEFAULT 2 CHECK (postes_max BETWEEN 1 AND 50),

  -- Référence lisible affichée au client et au support (jamais un secret : la preuve,
  -- c'est le compte, pas cette chaîne).
  reference      text UNIQUE,

  notes          text,
  revoquee_le    timestamptz,
  revoquee_motif text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Idempotence : le webhook Stripe rejoue `confirmer_commande` en filet de sécurité.
-- Sans cet index, un client pourrait recevoir deux licences pour un seul paiement.
CREATE UNIQUE INDEX IF NOT EXISTS licences_commande_produit_unique
  ON licences (order_id, product_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS licences_user_idx ON licences (user_id);
CREATE INDEX IF NOT EXISTS licences_statut_idx ON licences (statut);

COMMENT ON TABLE licences IS
  'Droit d''usage d''OMEGADMX avec une interface DMX tierce. Gratuit et implicite avec un boîtier OMEGA (auth HMAC du boîtier) — cette table ne concerne QUE les interfaces d''autres marques.';

-- ============================================================
-- 3) Les postes activés
-- ============================================================

CREATE TABLE IF NOT EXISTS licence_activations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  licence_id     uuid NOT NULL REFERENCES licences(id) ON DELETE CASCADE,

  -- Empreinte de machine (hachée côté logiciel) : jamais un identifiant matériel en
  -- clair, on n'a pas besoin de savoir QUEL est le PC, seulement de les distinguer.
  machine_id     text NOT NULL,
  -- Nom lisible donné par le poste (« PC régie »), pour que le client s'y retrouve
  -- quand il doit libérer une place.
  machine_label  text,

  premiere_le    timestamptz NOT NULL DEFAULT now(),
  derniere_le    timestamptz NOT NULL DEFAULT now(),
  liberee        boolean NOT NULL DEFAULT false,

  UNIQUE (licence_id, machine_id)
);

CREATE INDEX IF NOT EXISTS licence_activations_licence_idx
  ON licence_activations (licence_id) WHERE NOT liberee;

COMMENT ON TABLE licence_activations IS
  'Postes sur lesquels une licence est activée. `machine_id` est une EMPREINTE hachée, pas un identifiant matériel en clair.';

-- ============================================================
-- 4) Sécurité (RLS)
-- ============================================================

ALTER TABLE licences ENABLE ROW LEVEL SECURITY;
ALTER TABLE licence_activations ENABLE ROW LEVEL SECURITY;

-- --- licences : lecture seule pour le propriétaire, tout pour l'admin ---
DROP POLICY IF EXISTS "Client lit ses licences" ON licences;
CREATE POLICY "Client lit ses licences" ON licences
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admin lit toutes les licences" ON licences;
CREATE POLICY "Admin lit toutes les licences" ON licences
  FOR SELECT TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "Admin modifie les licences" ON licences;
CREATE POLICY "Admin modifie les licences" ON licences
  FOR UPDATE TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admin cree une licence" ON licences;
CREATE POLICY "Admin cree une licence" ON licences
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

-- ⚠ AUCUNE policy d'INSERT/UPDATE pour un client : sinon il se délivrerait lui-même une
-- licence par l'API publique. L'émission passe exclusivement par `confirmer_commande`
-- (SECURITY DEFINER, appelée par le serveur de paiement).

-- --- activations : le client voit et libère ses postes ---
DROP POLICY IF EXISTS "Client lit ses activations" ON licence_activations;
CREATE POLICY "Client lit ses activations" ON licence_activations
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM licences l WHERE l.id = licence_id AND l.user_id = auth.uid()));

DROP POLICY IF EXISTS "Admin lit toutes les activations" ON licence_activations;
CREATE POLICY "Admin lit toutes les activations" ON licence_activations
  FOR SELECT TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "Admin gere les activations" ON licence_activations;
CREATE POLICY "Admin gere les activations" ON licence_activations
  FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- ============================================================
-- 5) Référence lisible : OMGA-LIC-XXXXXX
-- ============================================================

CREATE OR REPLACE FUNCTION licence_reference_auto()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.reference IS NULL THEN
    -- 6 caractères non ambigus (ni O/0 ni I/1) tirés de l'id : lisible au téléphone.
    NEW.reference := 'OMGA-LIC-' || upper(
      translate(substring(replace(NEW.id::text, '-', '') from 1 for 6), 'abcdef', 'GHJKMN')
    );
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS licences_reference ON licences;
CREATE TRIGGER licences_reference
  BEFORE INSERT OR UPDATE ON licences
  FOR EACH ROW EXECUTE FUNCTION licence_reference_auto();

-- ============================================================
-- 6) Émission automatique à la commande payée
-- ============================================================
/*
  Reprise EXACTE de la version en place (20260804070000_preuve_vies_et_des.sql), avec un
  SEUL ajout : la boucle d'insertion des lignes émet une licence quand le produit est de
  type `licence`. Tout le reste — garde service_role, vérification du devis, du paiement,
  idempotence — est inchangé.

  L'émission est dans la MÊME transaction que la commande : si elle échoue, la commande
  n'est pas créée et le webhook Stripe rejouera. Mieux vaut réessayer que livrer une
  commande sans le droit qu'elle contient.
*/
CREATE OR REPLACE FUNCTION public.confirmer_commande(
  p_quote_id uuid, p_payment_intent text, p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE q order_quotes%ROWTYPE; v_order_id uuid; v_existing uuid; it jsonb; v_role text;
        v_type text; v_i int;
BEGIN
  v_role := coalesce(current_setting('request.jwt.claim.role', true), '');
  IF v_role <> 'service_role' AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'La commande est enregistrée par le serveur de paiement.';
  END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'Client non identifié'; END IF;

  SELECT * INTO q FROM order_quotes WHERE id = p_quote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Devis introuvable'; END IF;
  IF q.user_id <> p_user_id THEN RAISE EXCEPTION 'Ce devis ne vous appartient pas'; END IF;
  IF coalesce(q.stripe_payment_intent_id, '') <> p_payment_intent THEN
    RAISE EXCEPTION 'Paiement étranger à ce devis';
  END IF;

  SELECT id INTO v_existing FROM orders
   WHERE stripe_payment_intent_id = p_payment_intent
      OR (quote_id IS NOT NULL AND quote_id = p_quote_id) LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('order_id', v_existing, 'deja_creee', true);
  END IF;

  INSERT INTO orders (
    user_id, stripe_payment_intent_id, quote_id,
    sub_total, tax, total, shipping_cost, shipping_method, status,
    user_type, shipping_address,
    customer_country, is_company, company_name, vat_number, vat_validated,
    vat_regime, vat_rate, vies_checked_at, vies_name, vies_address,
    vat_mention, vat_territory, shipping_cost_ht,
    shipping_carrier, shipping_service, shipping_relay
  ) VALUES (
    q.user_id, p_payment_intent, q.id,
    q.subtotal_ht, q.tax_amount, q.total_ttc, q.shipping_cost, q.shipping_method, 'confirmed',
    CASE WHEN q.is_company THEN 'pro' ELSE 'particulier' END, q.shipping_address,
    q.customer_country, q.is_company, q.company_name, q.vat_number, q.vat_validated,
    q.vat_regime, q.vat_rate, q.vies_checked_at, q.vies_name, q.vies_address,
    q.vat_mention, q.vat_territory,
    coalesce(q.shipping_cost_ht, round(coalesce(q.shipping_cost, 0) / 1.2, 2)),
    q.shipping_carrier, q.shipping_service, q.shipping_relay
  ) RETURNING id INTO v_order_id;
  -- (voir 20260808000000_confirmer_commande_course_webhook.sql : cette insertion attrape
  --  désormais la violation d'unicité, car le navigateur et le webhook Stripe peuvent
  --  appeler cette fonction EN MÊME TEMPS.)

  FOR it IN SELECT * FROM jsonb_array_elements(q.items) LOOP
    INSERT INTO order_items (order_id, product_id, quantity, price)
    VALUES (v_order_id, (it->>'product_id')::uuid, (it->>'quantity')::int, (it->>'unit_ht')::numeric);

    -- ★ AJOUT : produit de type licence → on émet le droit, autant de fois que la quantité.
    SELECT product_type INTO v_type FROM products WHERE id = (it->>'product_id')::uuid;
    IF v_type = 'licence' THEN
      FOR v_i IN 1..greatest(1, (it->>'quantity')::int) LOOP
        INSERT INTO licences (user_id, product_id, order_id)
        VALUES (q.user_id, (it->>'product_id')::uuid, v_order_id)
        ON CONFLICT DO NOTHING;   -- filet : le webhook peut rejouer
      END LOOP;
    END IF;
  END LOOP;

  UPDATE order_quotes SET consumed_at = now() WHERE id = q.id;
  RETURN jsonb_build_object('order_id', v_order_id, 'deja_creee', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.confirmer_commande(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirmer_commande(uuid, text, uuid) TO service_role;

-- ============================================================
-- 7) Le produit
-- ============================================================
/*
  249 € TTC. La TVA française à 20 % donne 207,50 € HT — le moteur `regime_tva` reste seul
  juge du taux réellement appliqué (Monaco, DOM, autoliquidation UE…), `price_ht` n'est
  qu'une base de calcul, jamais la vérité comptable.
  Stock à 0 mais `in_stock = true` : un droit dématérialisé ne s'épuise pas.
*/
INSERT INTO products (
  name, description, long_description,
  price, price_ht, product_type, category_id,
  in_stock, stock_quantity, sku, is_featured,
  shipping_class, weight_kg,
  meta_title, meta_description, tags
)
SELECT
  'Licence OMEGADMX — interface tierce',
  'Débloque le pilotage DMX depuis OMEGADMX avec une interface d''une autre marque (Sunlite/Nicolaudie, SIUDI…). Inutile si vous possédez un boîtier OMEGA DMX : le logiciel est alors déjà inclus.',
  E'OMEGADMX est fourni sans supplément avec les boîtiers OMEGA DMX : le logiciel reconnaît votre matériel tout seul, vous n''avez rien à saisir.\n\nCette licence s''adresse aux utilisateurs qui souhaitent piloter leurs projecteurs depuis OMEGADMX en conservant une interface DMX d''une autre marque. Elle finance le développement du logiciel, que l''achat d''un boîtier couvre habituellement.\n\n• Activation par simple connexion à votre compte OMEGA, directement dans le logiciel\n• Deux postes autorisés (régie + secours)\n• Fonctionne hors ligne une fois activée\n• Mises à jour incluses, sans abonnement',
  249.00, 207.50, 'licence',
  (SELECT id FROM categories WHERE name = 'Accessoires' LIMIT 1),
  true, 0, 'OMGA-LIC-DMX', false,
  'small', 0,
  'Licence OMEGADMX pour interface DMX tierce',
  'Pilotez vos projecteurs avec OMEGADMX depuis une interface Sunlite/Nicolaudie. Licence unique, sans abonnement, activation par compte OMEGA.',
  ARRAY['licence', 'logiciel', 'omegadmx', 'sunlite']
WHERE NOT EXISTS (SELECT 1 FROM products WHERE sku = 'OMGA-LIC-DMX');

NOTIFY pgrst, 'reload schema';
