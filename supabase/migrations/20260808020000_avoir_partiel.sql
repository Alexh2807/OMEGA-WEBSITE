/*
  AVOIR PARTIEL — rembourser 100 € sur 1 000 € doit produire un avoir de 100 €.

  Jusqu'ici seul l'avoir TOTAL existait : un remboursement partiel rendait l'argent sans
  émettre le moindre document. Conséquences mesurées le 8 août 2026 : la vente restait
  entière au chiffre d'affaires, la TVA rendue restait déclarée, et Tiime ne recevait
  RIEN — le scénario Make n'a de route que pour `invoice.issued` et `invoice.credited`,
  et un remboursement partiel émettait `invoice.refunded_partially`, qui ne correspond à
  aucune des deux.

  ## Choix de composition : UNE ligne
  « Remboursement partiel sur facture X », au taux de TVA RÉEL de la facture d'origine.
  Un prorata ligne à ligne serait plus fidèle quand on rend un article précis, mais
  suppose de choisir les lignes — donc une interface, et une source d'erreur de plus.

  ## Idempotence
  Un avoir TOTAL est unique par facture ; un avoir PARTIEL, non (on peut rembourser
  plusieurs fois). La clé est donc le REMBOURSEMENT Stripe (`refund_id`), sans quoi un
  rejeu du webhook émettrait deux avoirs pour le même argent.

  ## Vérifié en base (transaction annulée)
  100 € sur FACT0002 → AV-0002 : HT −83,33 / TVA −16,67 / TTC −100,00, facture d'origine
  laissée en `paid`. Dépassement (300 € alors qu'il reste 238,90 €) refusé avec un message
  explicite. Plusieurs avoirs partiels acceptés sur la même facture.
*/

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS refund_id uuid REFERENCES refunds(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_refund_unique ON invoices (refund_id) WHERE refund_id IS NOT NULL;
COMMENT ON COLUMN invoices.refund_id IS
  'Remboursement Stripe à l''origine de cet avoir partiel. Unique : empêche le double avoir si le webhook rejoue.';

CREATE OR REPLACE FUNCTION public.creer_avoir_partiel_depuis_facture(
  p_invoice_id  uuid,
  p_montant_ttc numeric,
  p_motif       text DEFAULT NULL,
  p_refund_id   uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  f          invoices%ROWTYPE;
  v_serveur  boolean;
  v_existant uuid;
  v_avoir_id uuid;
  v_numero   text;
  v_taux     numeric;
  v_ht       numeric;
  v_deja     numeric;
  v_restant  numeric;
BEGIN
  v_serveur :=
       coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
    OR current_user IN ('service_role', 'supabase_admin', 'postgres');

  IF NOT v_serveur AND NOT is_admin() THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  IF p_refund_id IS NOT NULL THEN
    SELECT id INTO v_existant FROM invoices WHERE refund_id = p_refund_id LIMIT 1;
    IF v_existant IS NOT NULL THEN RETURN v_existant; END IF;
  END IF;

  SELECT * INTO f FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Facture introuvable'; END IF;
  IF coalesce(f.document_type, 'invoice') <> 'invoice' THEN
    RAISE EXCEPTION 'On n''émet pas un avoir sur un avoir (% est de type %).',
      f.invoice_number, f.document_type;
  END IF;
  IF f.status = 'draft' THEN
    RAISE EXCEPTION 'La facture % est encore un brouillon : corrigez-la, un avoir n''a pas lieu d''être.',
      f.invoice_number;
  END IF;
  IF p_montant_ttc IS NULL OR p_montant_ttc <= 0 THEN
    RAISE EXCEPTION 'Le montant de l''avoir doit être strictement positif.';
  END IF;

  SELECT coalesce(sum(-total_ttc), 0) INTO v_deja
    FROM invoices WHERE credit_note_of = f.id AND document_type = 'credit_note';
  v_restant := round(coalesce(f.total_ttc, 0) - v_deja, 2);
  IF round(p_montant_ttc, 2) > v_restant + 0.005 THEN
    RAISE EXCEPTION 'Avoir de % € impossible : il ne reste que % € à créditer sur la facture %.',
      round(p_montant_ttc, 2), v_restant, f.invoice_number;
  END IF;

  v_taux := coalesce(f.vat_rate, 0);
  -- Le HT se DÉDUIT du TTC rendu : c'est le TTC qui a réellement quitté le compte.
  v_ht   := round(p_montant_ttc / (1 + v_taux / 100), 2);

  v_numero := public.get_next_credit_note_number();

  INSERT INTO invoices (
    invoice_number, order_id, customer_id, customer_name, customer_email,
    customer_address, billing_address, status, document_type, credit_note_of,
    due_date, payment_terms, notes, legal_mentions,
    customer_country, is_company, company_name, vat_number,
    vat_regime, vat_rate, vat_mention, vat_territory, delivery_date, amount_paid,
    refund_id
  ) VALUES (
    v_numero, f.order_id, f.customer_id, f.customer_name, f.customer_email,
    f.customer_address, f.billing_address, 'draft', 'credit_note', f.id,
    current_date, f.payment_terms,
    coalesce(nullif(btrim(coalesce(p_motif, '')), ''),
             'Avoir partiel sur la facture ' || f.invoice_number),
    f.legal_mentions,
    f.customer_country, f.is_company, f.company_name, f.vat_number,
    f.vat_regime, f.vat_rate, f.vat_mention, f.vat_territory, f.delivery_date, 0,
    p_refund_id
  ) RETURNING id INTO v_avoir_id;

  INSERT INTO invoice_items (
    invoice_id, product_id, description, quantity, unit_price_ht, tax_rate,
    sort_order, line_kind)
  VALUES (
    v_avoir_id, NULL,
    'Remboursement partiel sur facture ' || f.invoice_number
      || coalesce(' — ' || nullif(btrim(coalesce(p_motif, '')), ''), ''),
    -1, v_ht, v_taux, 1, 'goods');

  UPDATE invoices SET status = 'sent', sent_at = now() WHERE id = v_avoir_id;

  /* La facture d'origine ne passe en `refunded` QUE si les avoirs la couvrent
     entièrement — sinon elle reste due pour le solde, ce qui est la réalité. */
  IF round(v_deja + p_montant_ttc, 2) >= round(coalesce(f.total_ttc, 0), 2) - 0.005 THEN
    UPDATE invoices SET status = 'refunded' WHERE id = f.id;
  END IF;

  RETURN v_avoir_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.creer_avoir_partiel_depuis_facture(uuid, numeric, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.creer_avoir_partiel_depuis_facture(uuid, numeric, text, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
