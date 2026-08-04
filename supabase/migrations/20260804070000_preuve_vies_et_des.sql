-- ============================================================================
--  1. LA PREUVE VIES, FIGÉE SUR LA COMMANDE
--  2. L'ÉTAT RÉCAPITULATIF (DES) DES LIVRAISONS INTRACOMMUNAUTAIRES
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. La commande ne gardait que le numéro de TVA et « validé oui/non ». La
--    réponse de VIES, elle, vivait dans un cache rafraîchi toutes les 24 h et
--    indexé par numéro : dans deux ans, impossible de montrer ce que le fichier
--    européen répondait LE JOUR DE LA VENTE. C'est pourtant la pièce maîtresse
--    de la bonne foi — celle qui évite au vendeur de devoir la TVA de sa poche
--    si l'acheteur a fraudé.
--    On recopie donc la réponse sur la commande, une fois pour toutes.
-- ---------------------------------------------------------------------------
ALTER TABLE order_quotes ADD COLUMN IF NOT EXISTS vies_checked_at timestamptz;
ALTER TABLE order_quotes ADD COLUMN IF NOT EXISTS vies_name text;
ALTER TABLE order_quotes ADD COLUMN IF NOT EXISTS vies_address text;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS vies_checked_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vies_name text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vies_address text;

COMMENT ON COLUMN orders.vies_name IS
  'Raison sociale renvoyée par VIES au moment de la vente. Preuve de diligence : '
  'ne jamais la recalculer a posteriori, VIES peut avoir changé depuis.';

-- La confirmation recopie ces trois champs du devis vers la commande.
CREATE OR REPLACE FUNCTION public.confirmer_commande(
  p_quote_id uuid, p_payment_intent text, p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth'
AS $function$
DECLARE q order_quotes%ROWTYPE; v_order_id uuid; v_existing uuid; it jsonb; v_role text;
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
    vat_regime, vat_rate, vies_checked_at, vies_name, vies_address
  ) VALUES (
    q.user_id, p_payment_intent, q.id,
    q.subtotal_ht, q.tax_amount, q.total_ttc, q.shipping_cost, q.shipping_method, 'confirmed',
    CASE WHEN q.is_company THEN 'pro' ELSE 'particulier' END, q.shipping_address,
    q.customer_country, q.is_company, q.company_name, q.vat_number, q.vat_validated,
    q.vat_regime, q.vat_rate, q.vies_checked_at, q.vies_name, q.vies_address
  ) RETURNING id INTO v_order_id;

  FOR it IN SELECT * FROM jsonb_array_elements(q.items) LOOP
    INSERT INTO order_items (order_id, product_id, quantity, price)
    VALUES (v_order_id, (it->>'product_id')::uuid, (it->>'quantity')::int, (it->>'unit_ht')::numeric);
  END LOOP;

  UPDATE order_quotes SET consumed_at = now() WHERE id = q.id;
  RETURN jsonb_build_object('order_id', v_order_id, 'deja_creee', false);
END; $function$;

REVOKE ALL ON FUNCTION public.confirmer_commande(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirmer_commande(uuid, text, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. DES — état récapitulatif des livraisons intracommunautaires, à déposer
--    chaque mois. Une ligne par client : son numéro de TVA et le montant HT
--    livré sur la période. C'est ce document que l'administration recoupe avec
--    la déclaration de l'acheteur ; sans lui, l'exonération est contestable.
--
--    On y joint la preuve VIES du jour de la vente : le comptable (ou le
--    contrôleur) voit d'un coup d'œil ce que le fichier européen répondait.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.declaration_des(p_du date, p_au date)
RETURNS TABLE(
  numero_tva text, client text, pays text,
  montant_ht numeric, nb_lignes bigint,
  verifie_le timestamptz, nom_vies text, adresse_vies text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Réservé aux administrateurs'; END IF;
  RETURN QUERY
  SELECT o.vat_number::text,
         coalesce(max(o.company_name), max(o.vies_name), '—')::text,
         coalesce(o.customer_country, '?')::text,
         sum(o.sub_total)::numeric,
         count(*)::bigint,
         max(o.vies_checked_at),
         max(o.vies_name)::text,
         max(o.vies_address)::text
    FROM orders o
   WHERE o.vat_regime = 'ue_b2b'
     AND o.status NOT IN ('cancelled', 'refunded')
     AND o.created_at >= p_du AND o.created_at < (p_au + 1)
     AND o.vat_number IS NOT NULL
   GROUP BY o.vat_number, coalesce(o.customer_country, '?')
   ORDER BY 3, 1;
END; $function$;

NOTIFY pgrst, 'reload schema';
