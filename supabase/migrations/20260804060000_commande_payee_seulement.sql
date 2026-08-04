-- ============================================================================
--  ★★★ UNE COMMANDE NE S'ENREGISTRE QUE SI LE PAIEMENT A EU LIEU
--
--  Faille trouvée le 4 août, la plus grave de toutes : `confirmer_commande`
--  était appelable DIRECTEMENT par le navigateur et ne vérifiait que la
--  propriété du devis. Elle ne demandait jamais à Stripe si le paiement avait
--  abouti, et ne contrôlait même pas que l'identifiant de paiement était celui
--  du devis.
--
--  Reproduit : panier → devis → AUCUN paiement → appel direct de la fonction
--  → commande « confirmée » de 1 907,99 €, stock décrémenté. Un identifiant de
--  paiement inventé passait tout aussi bien.
--
--  Désormais la vérification auprès de Stripe se fait dans l'edge function
--  `confirmer-commande` (elle seule détient la clé secrète), et CETTE fonction
--  n'est plus joignable depuis le navigateur.
-- ============================================================================

DROP FUNCTION IF EXISTS public.confirmer_commande(uuid, text);

CREATE OR REPLACE FUNCTION public.confirmer_commande(
  p_quote_id uuid,
  p_payment_intent text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE q order_quotes%ROWTYPE; v_order_id uuid; v_existing uuid; it jsonb; v_role text;
BEGIN
  /* ★ RÉSERVÉE AU SERVEUR. C'est l'edge function `confirmer-commande` qui a interrogé
     Stripe ; l'appeler d'ailleurs, c'est justement contourner cette vérification. */
  v_role := coalesce(current_setting('request.jwt.claim.role', true), '');
  IF v_role <> 'service_role' AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'La commande est enregistrée par le serveur de paiement.';
  END IF;

  IF p_user_id IS NULL THEN RAISE EXCEPTION 'Client non identifié'; END IF;

  SELECT * INTO q FROM order_quotes WHERE id = p_quote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Devis introuvable'; END IF;
  IF q.user_id <> p_user_id THEN RAISE EXCEPTION 'Ce devis ne vous appartient pas'; END IF;
  -- Ceinture et bretelles : le paiement doit être celui du devis, même si l'edge
  -- function l'a déjà vérifié.
  IF coalesce(q.stripe_payment_intent_id, '') <> p_payment_intent THEN
    RAISE EXCEPTION 'Paiement étranger à ce devis';
  END IF;

  SELECT id INTO v_existing FROM orders
   WHERE stripe_payment_intent_id = p_payment_intent
      OR (quote_id IS NOT NULL AND quote_id = p_quote_id)
   LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('order_id', v_existing, 'deja_creee', true);
  END IF;

  -- ⚠ L'expiration ne bloque PAS la confirmation : le client a PAYÉ (l'edge function
  -- vient de le vérifier auprès de Stripe). Refuser ici créerait un encaissement sans
  -- commande, c'est-à-dire le pire des cas.
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

  UPDATE order_quotes SET consumed_at = now() WHERE id = q.id;

  RETURN jsonb_build_object('order_id', v_order_id, 'deja_creee', false);
END; $function$;

-- Le navigateur ne doit pas pouvoir l'appeler, même en connaissant son nom.
REVOKE ALL ON FUNCTION public.confirmer_commande(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirmer_commande(uuid, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.confirmer_commande(uuid, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.confirmer_commande(uuid, text, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
