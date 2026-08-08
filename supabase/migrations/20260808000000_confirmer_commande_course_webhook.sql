/*
  COURSE ENTRE LE NAVIGATEUR ET LE WEBHOOK STRIPE.

  `confirmer_commande` est appelée par DEUX chemins qui peuvent arriver en même temps : le
  navigateur juste après le paiement, et le webhook Stripe en filet de sécurité. Le
  contrôle d'idempotence (« une commande existe-t-elle déjà ? ») ne protège pas d'une
  exécution SIMULTANÉE : les deux lisent « non », les deux insèrent, l'une gagne et l'autre
  meurt sur `orders_stripe_payment_intent_id_key`.

  Vécu le 7 août 2026 : la commande ET la licence avaient été créées correctement, mais le
  client a vu « Enregistrement de la commande impossible ». C'est le pire des deux mondes —
  il croit avoir payé pour rien alors que tout s'est bien passé.

  Correctif : l'insertion attrape la violation d'unicité et se comporte alors exactement
  comme si elle avait vu la commande dès le départ. Arriver deuxième n'est pas une erreur,
  c'est le sens même de l'idempotence.

  ⚠ Le `RAISE` final est volontaire : une violation d'unicité sur AUTRE CHOSE que ce
  paiement reste une vraie anomalie et doit remonter.
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

  BEGIN
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
  EXCEPTION WHEN unique_violation THEN
    -- L'autre chemin nous a doublés entre le SELECT et l'INSERT : sa commande fait foi.
    SELECT id INTO v_existing FROM orders
     WHERE stripe_payment_intent_id = p_payment_intent
        OR (quote_id IS NOT NULL AND quote_id = p_quote_id) LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('order_id', v_existing, 'deja_creee', true);
    END IF;
    RAISE;
  END;

  FOR it IN SELECT * FROM jsonb_array_elements(q.items) LOOP
    INSERT INTO order_items (order_id, product_id, quantity, price)
    VALUES (v_order_id, (it->>'product_id')::uuid, (it->>'quantity')::int, (it->>'unit_ht')::numeric);

    SELECT product_type INTO v_type FROM products WHERE id = (it->>'product_id')::uuid;
    IF v_type = 'licence' THEN
      FOR v_i IN 1..greatest(1, (it->>'quantity')::int) LOOP
        INSERT INTO licences (user_id, product_id, order_id)
        VALUES (q.user_id, (it->>'product_id')::uuid, v_order_id)
        ON CONFLICT DO NOTHING;
      END LOOP;
    END IF;
  END LOOP;

  UPDATE order_quotes SET consumed_at = now() WHERE id = q.id;
  RETURN jsonb_build_object('order_id', v_order_id, 'deja_creee', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.confirmer_commande(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirmer_commande(uuid, text, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
