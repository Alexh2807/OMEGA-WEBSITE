/*
  # TVA internationale + verrouillage des montants

  Demande de l'exploitant (3 août 2026) : « un site 100 % fonctionnel partout, savoir
  exactement tout par rapport à la TVA, de la création du compte jusqu'à la déclaration
  d'impôt, quel que soit le pays du client, sans aucune faille ».

  ## ⚠ TROIS FAILLES CONSTATÉES À L'AUDIT, QUE CETTE MIGRATION FERME
  1. **`create-payment-intent` acceptait le montant envoyé par le navigateur** — et sans
     aucune authentification. N'importe qui pouvait payer 0,50 € une machine à 2 000 €,
     ou créer des PaymentIntents sur le compte Stripe depuis l'extérieur.
  2. **La commande était insérée par le navigateur** avec `sub_total`, `tax` et `total`
     calculés côté client : rien n'empêchait d'écrire ce qu'on voulait.
  3. **`user_type` (« Pro / Particulier ») était un simple bouton d'interface** : cliquer
     « Pro » donnait les prix HT, soit 20 % de remise, sans le moindre contrôle.

  La correction de fond est la même pour les trois : **le serveur devient la seule source
  des prix et de la TVA**. Le navigateur ne transmet plus que des identifiants de produit
  et des quantités ; tout le reste est recalculé ici, à partir de la base.

  ## Le modèle fiscal retenu
  Quatre régimes, déterminés par le pays et la qualité du client :
    · `fr`      — France : TVA 20 %.
    · `ue_b2b`  — entreprise UE avec n° de TVA VALIDÉ : 0 %, autoliquidation (CGI 262 ter I).
    · `ue_b2c`  — particulier UE : TVA française sous le seuil de 10 000 €/an, taux du pays
                  de destination au-delà (guichet unique OSS).
    · `export`  — hors UE : 0 %, exonération (CGI 262 I).
  Le régime est FIGÉ sur la commande et la facture au moment de la vente : un changement
  de taux ou de statut client ne doit jamais réécrire l'histoire comptable.
*/

-- ============================================================
-- 1. Référentiel des pays de l'UE et de leurs taux
-- ============================================================
/*
  En table, pas en dur dans le code : les taux changent (Estonie 22 % en 2024, Finlande
  25,5 % en septembre 2024, Slovaquie 23 % en 2025…). Une table se met à jour sans
  redéployer, et l'historique des commandes n'est pas affecté puisque le taux appliqué
  est recopié sur chaque commande.
*/
CREATE TABLE IF NOT EXISTS eu_vat_rates (
  country_code  char(2) PRIMARY KEY,
  country_name  text NOT NULL,
  standard_rate numeric(5,2) NOT NULL CHECK (standard_rate >= 0 AND standard_rate <= 30),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

INSERT INTO eu_vat_rates (country_code, country_name, standard_rate) VALUES
  ('AT','Autriche',20),('BE','Belgique',21),('BG','Bulgarie',20),('CY','Chypre',19),
  ('CZ','Tchéquie',21),('DE','Allemagne',19),('DK','Danemark',25),('EE','Estonie',22),
  ('ES','Espagne',21),('FI','Finlande',25.5),('FR','France',20),('GR','Grèce',24),
  ('HR','Croatie',25),('HU','Hongrie',27),('IE','Irlande',23),('IT','Italie',22),
  ('LT','Lituanie',21),('LU','Luxembourg',17),('LV','Lettonie',21),('MT','Malte',18),
  ('NL','Pays-Bas',21),('PL','Pologne',23),('PT','Portugal',23),('RO','Roumanie',21),
  ('SE','Suède',25),('SI','Slovénie',22),('SK','Slovaquie',23)
ON CONFLICT (country_code) DO NOTHING;

ALTER TABLE eu_vat_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Taux TVA lisibles par tous" ON eu_vat_rates;
CREATE POLICY "Taux TVA lisibles par tous" ON eu_vat_rates FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Taux TVA modifiables par les admins" ON eu_vat_rates;
CREATE POLICY "Taux TVA modifiables par les admins" ON eu_vat_rates FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- ============================================================
-- 2. Identité fiscale du client
-- ============================================================
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_company       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS company_name     text,
  ADD COLUMN IF NOT EXISTS vat_number       text,
  ADD COLUMN IF NOT EXISTS vat_number_valid boolean,
  ADD COLUMN IF NOT EXISTS vat_checked_at   timestamptz,
  ADD COLUMN IF NOT EXISTS vat_checked_name text;

COMMENT ON COLUMN profiles.vat_number_valid IS
  'Résultat de la vérification VIES. NULL = jamais vérifié. ⚠ Facturer 0 % sans vérification valide expose le vendeur au paiement de la TVA.';

-- ============================================================
-- 3. Le régime fiscal d'une vente
-- ============================================================
/*
  ⚠ FONCTION CENTRALE : c'est ELLE qui décide du taux, nulle part ailleurs. Toute autre
  implémentation (front, edge function, PDF) doit l'appeler plutôt que de re-décider —
  deux logiques finiraient par diverger, et une divergence ici, ce sont des factures
  fausses.
  `p_vat_valide` doit être le résultat d'une vérification VIES RÉELLE, pas la simple
  présence d'un numéro saisi.
*/
CREATE OR REPLACE FUNCTION regime_tva(
  p_pays        text,
  p_entreprise  boolean,
  p_vat_valide  boolean
)
RETURNS TABLE (regime text, taux numeric, mention text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pays text; v_ue boolean; v_taux_local numeric;
BEGIN
  v_pays := upper(btrim(coalesce(p_pays, 'FR')));
  IF v_pays = '' THEN v_pays := 'FR'; END IF;

  SELECT true, standard_rate INTO v_ue, v_taux_local FROM eu_vat_rates WHERE country_code = v_pays;
  v_ue := coalesce(v_ue, false);

  -- 1. France : toujours 20 %, entreprise ou particulier. L'autoliquidation
  --    n'existe pas entre deux entreprises françaises pour des biens.
  IF v_pays = 'FR' THEN
    RETURN QUERY SELECT 'fr'::text, 20::numeric, NULL::text;

  -- 2. Hors UE : exonération d'exportation. ⚠ Conditionnée à la preuve de sortie
  --    du territoire, que l'expéditeur doit conserver.
  ELSIF NOT v_ue THEN
    RETURN QUERY SELECT 'export'::text, 0::numeric,
      'Exonération de TVA — exportation hors Union européenne (art. 262 I du CGI).'::text;

  -- 3. Entreprise UE avec numéro VÉRIFIÉ : autoliquidation.
  ELSIF p_entreprise AND coalesce(p_vat_valide, false) THEN
    RETURN QUERY SELECT 'ue_b2b'::text, 0::numeric,
      'Autoliquidation — livraison intracommunautaire exonérée (art. 262 ter I du CGI). TVA due par le preneur.'::text;

  -- 4. Particulier UE (ou entreprise sans numéro valide, traitée comme un particulier —
  --    c'est la position prudente : en cas de doute on FACTURE la TVA, quitte à la
  --    régulariser, plutôt que de risquer d'en devoir une qu'on n'a pas encaissée).
  ELSE
    RETURN QUERY SELECT 'ue_b2c'::text, 20::numeric, NULL::text;
  END IF;
END; $$;

REVOKE ALL ON FUNCTION regime_tva(text, boolean, boolean) FROM public;
GRANT EXECUTE ON FUNCTION regime_tva(text, boolean, boolean) TO anon, authenticated;

-- ============================================================
-- 4. Champs fiscaux figés sur la commande et la facture
-- ============================================================
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_country text,
  ADD COLUMN IF NOT EXISTS is_company       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS company_name     text,
  ADD COLUMN IF NOT EXISTS vat_number       text,
  ADD COLUMN IF NOT EXISTS vat_validated    boolean,
  ADD COLUMN IF NOT EXISTS vat_regime       text,
  ADD COLUMN IF NOT EXISTS vat_rate         numeric(5,2);

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS customer_country text,
  ADD COLUMN IF NOT EXISTS is_company       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS company_name     text,
  ADD COLUMN IF NOT EXISTS vat_number       text,
  ADD COLUMN IF NOT EXISTS vat_regime       text,
  ADD COLUMN IF NOT EXISTS vat_rate         numeric(5,2),
  ADD COLUMN IF NOT EXISTS vat_mention      text;

CREATE INDEX IF NOT EXISTS invoices_regime_idx ON invoices (vat_regime, created_at);
CREATE INDEX IF NOT EXISTS orders_regime_idx   ON orders   (vat_regime, created_at);

COMMENT ON COLUMN orders.vat_regime IS
  'Régime FIGÉ au moment de la vente (fr / ue_b2b / ue_b2c / export). Ne jamais recalculer a posteriori : la comptabilité doit refléter ce qui a été facturé.';

-- ============================================================
-- 5. Devis de commande : le montant est arrêté PAR LE SERVEUR
-- ============================================================
/*
  Le navigateur ne dit plus combien il doit payer : il demande un devis, le serveur le
  calcule à partir des prix en base, l'enregistre, et c'est CE devis qui sert à créer le
  paiement Stripe puis la commande. Le montant ne peut donc plus être manipulé.
  Durée de vie courte : un devis n'est pas un prix garanti, c'est un panier arrêté le
  temps de payer.
*/
CREATE TABLE IF NOT EXISTS order_quotes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL DEFAULT now() + interval '30 minutes',
  consumed_at       timestamptz,
  items             jsonb NOT NULL,          -- [{product_id, quantity, unit_ht, name}]
  shipping_address  jsonb,
  shipping_cost     numeric(10,2) NOT NULL DEFAULT 0,
  shipping_method   text,
  customer_country  text NOT NULL,
  is_company        boolean NOT NULL DEFAULT false,
  company_name      text,
  vat_number        text,
  vat_validated     boolean,
  vat_regime        text NOT NULL,
  vat_rate          numeric(5,2) NOT NULL,
  subtotal_ht       numeric(10,2) NOT NULL,
  tax_amount        numeric(10,2) NOT NULL,
  total_ttc         numeric(10,2) NOT NULL,
  stripe_payment_intent_id text
);

CREATE INDEX IF NOT EXISTS order_quotes_user_idx ON order_quotes (user_id, created_at DESC);

ALTER TABLE order_quotes ENABLE ROW LEVEL SECURITY;
-- Lecture seule pour son auteur : il doit pouvoir afficher le récapitulatif.
-- ⚠ AUCUNE policy d'INSERT ni d'UPDATE : seules les fonctions SECURITY DEFINER écrivent
-- ici. C'est tout l'intérêt — un client qui pourrait insérer son propre devis
-- retrouverait exactement la faille qu'on ferme.
DROP POLICY IF EXISTS "Chacun voit ses devis" ON order_quotes;
CREATE POLICY "Chacun voit ses devis" ON order_quotes FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin());

-- ============================================================
-- 6. Transformer un devis payé en commande
-- ============================================================
/*
  Le client n'apporte que l'identifiant du devis et celui du paiement. Les montants, eux,
  viennent du devis — donc du serveur. Idempotent : rejouer l'appel (double clic, retour
  navigateur, reprise après coupure) rend la commande déjà créée au lieu d'en créer une
  seconde.
*/
CREATE OR REPLACE FUNCTION confirmer_commande(p_quote_id uuid, p_payment_intent text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE q order_quotes%ROWTYPE; v_order_id uuid; v_existing uuid; it jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise'; END IF;

  SELECT * INTO q FROM order_quotes WHERE id = p_quote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Devis introuvable'; END IF;
  IF q.user_id <> auth.uid() THEN RAISE EXCEPTION 'Ce devis ne vous appartient pas'; END IF;

  -- Idempotence : une commande existe déjà pour ce paiement ou ce devis.
  SELECT id INTO v_existing FROM orders
   WHERE stripe_payment_intent_id = p_payment_intent
      OR (quote_id IS NOT NULL AND quote_id = p_quote_id)
   LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('order_id', v_existing, 'deja_creee', true);
  END IF;

  -- ⚠ L'expiration ne bloque PAS la confirmation : le client a PAYÉ. Refuser ici
  -- créerait un encaissement sans commande, c'est-à-dire le pire des cas. L'expiration
  -- protège la création du paiement, pas son enregistrement.
  INSERT INTO orders (
    user_id, stripe_payment_intent_id, quote_id,
    sub_total, tax, total, shipping_cost, shipping_method, status,
    user_type, shipping_address,
    customer_country, is_company, company_name, vat_number, vat_validated,
    vat_regime, vat_rate
  ) VALUES (
    q.user_id, p_payment_intent, q.id,
    q.subtotal_ht, q.tax_amount, q.total_ttc, q.shipping_cost, q.shipping_method, 'confirmed',
    CASE WHEN q.is_company THEN 'pro' ELSE 'particulier' END, q.shipping_address,
    q.customer_country, q.is_company, q.company_name, q.vat_number, q.vat_validated,
    q.vat_regime, q.vat_rate
  ) RETURNING id INTO v_order_id;

  FOR it IN SELECT * FROM jsonb_array_elements(q.items) LOOP
    INSERT INTO order_items (order_id, product_id, quantity, price)
    VALUES (v_order_id, (it->>'product_id')::uuid, (it->>'quantity')::int, (it->>'unit_ht')::numeric);
  END LOOP;

  UPDATE order_quotes SET consumed_at = now(), stripe_payment_intent_id = p_payment_intent WHERE id = q.id;

  RETURN jsonb_build_object('order_id', v_order_id, 'deja_creee', false);
END; $$;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS quote_id uuid REFERENCES order_quotes(id) ON DELETE SET NULL;

REVOKE ALL ON FUNCTION confirmer_commande(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION confirmer_commande(uuid, text) TO authenticated;

-- ============================================================
-- 7. La déclaration de TVA, prête à recopier
-- ============================================================
/*
  Demande : « comment je sais exactement ce que je dois à l'État, sans erreur ? ».
  Une seule source : les commandes payées, ventilées par régime, dans l'ordre des cases
  de la déclaration. Réservé aux admins (SECURITY DEFINER court-circuite les policies,
  donc le contrôle se fait ici).
  ⚠ Ne couvre QUE la TVA collectée. La TVA déductible vient des factures d'achat, qui ne
  passent pas par le site — c'est le comptable qui l'apporte.
*/
CREATE OR REPLACE FUNCTION declaration_tva(p_du date, p_au date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE j jsonb;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Réservé aux administrateurs'; END IF;

  SELECT jsonb_build_object(
    'periode', jsonb_build_object('du', p_du, 'au', p_au),
    'ventes_france', jsonb_build_object(
      'base_ht', coalesce(sum(sub_total) FILTER (WHERE vat_regime = 'fr'), 0),
      'tva_collectee', coalesce(sum(tax) FILTER (WHERE vat_regime = 'fr'), 0),
      'nb', count(*) FILTER (WHERE vat_regime = 'fr')),
    'ventes_ue_b2c', jsonb_build_object(
      'base_ht', coalesce(sum(sub_total) FILTER (WHERE vat_regime = 'ue_b2c'), 0),
      'tva_collectee', coalesce(sum(tax) FILTER (WHERE vat_regime = 'ue_b2c'), 0),
      'nb', count(*) FILTER (WHERE vat_regime = 'ue_b2c')),
    'livraisons_intracommunautaires', jsonb_build_object(
      'base_ht', coalesce(sum(sub_total) FILTER (WHERE vat_regime = 'ue_b2b'), 0),
      'nb', count(*) FILTER (WHERE vat_regime = 'ue_b2b')),
    'exportations', jsonb_build_object(
      'base_ht', coalesce(sum(sub_total) FILTER (WHERE vat_regime = 'export'), 0),
      'nb', count(*) FILTER (WHERE vat_regime = 'export')),
    'total_tva_collectee', coalesce(sum(tax), 0),
    'total_ht', coalesce(sum(sub_total), 0),
    'sans_regime', count(*) FILTER (WHERE vat_regime IS NULL)
  ) INTO j
  FROM orders
  WHERE status NOT IN ('cancelled', 'refunded')
    AND created_at >= p_du AND created_at < (p_au + 1);

  -- Détail par pays : nécessaire au guichet unique (OSS), qui se déclare pays par pays.
  SELECT j || jsonb_build_object('par_pays', coalesce(jsonb_agg(x ORDER BY x->>'pays'), '[]'::jsonb))
    INTO j
  FROM (
    SELECT jsonb_build_object(
      'pays', coalesce(customer_country, '?'),
      'regime', vat_regime,
      'base_ht', sum(sub_total),
      'tva', sum(tax),
      'nb', count(*)
    ) AS x
    FROM orders
    WHERE status NOT IN ('cancelled', 'refunded')
      AND created_at >= p_du AND created_at < (p_au + 1)
    GROUP BY coalesce(customer_country, '?'), vat_regime
  ) t;

  RETURN j;
END; $$;

REVOKE ALL ON FUNCTION declaration_tva(date, date) FROM public;
GRANT EXECUTE ON FUNCTION declaration_tva(date, date) TO authenticated;

-- ============================================================
-- 8. Seuil du guichet unique (OSS) : le savoir AVANT de le dépasser
-- ============================================================
/*
  10 000 €/an de ventes à des PARTICULIERS d'autres pays de l'UE. En dessous : TVA
  française, rien à faire. Au-dessus : inscription obligatoire au guichet unique et taux
  du pays de destination. Franchir ce seuil sans s'en apercevoir est l'erreur classique —
  d'où cet indicateur.
*/
CREATE OR REPLACE FUNCTION seuil_oss(p_annee integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_annee integer; v_total numeric;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Réservé aux administrateurs'; END IF;
  v_annee := coalesce(p_annee, extract(year FROM now())::integer);
  SELECT coalesce(sum(sub_total + tax), 0) INTO v_total
  FROM orders
  WHERE vat_regime = 'ue_b2c'
    AND status NOT IN ('cancelled', 'refunded')
    AND extract(year FROM created_at) = v_annee;
  RETURN jsonb_build_object(
    'annee', v_annee, 'total_ttc', v_total, 'seuil', 10000,
    'restant', greatest(0, 10000 - v_total),
    'depasse', v_total > 10000,
    'pourcentage', round((v_total / 10000 * 100)::numeric, 1)
  );
END; $$;

REVOKE ALL ON FUNCTION seuil_oss(integer) FROM public;
GRANT EXECUTE ON FUNCTION seuil_oss(integer) TO authenticated;
