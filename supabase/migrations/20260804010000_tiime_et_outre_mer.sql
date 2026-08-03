-- ============================================================================
--  1. SUIVI DES ENVOIS VERS LA COMPTABILITÉ (Tiime, via Make)
--  2. L'OUTRE-MER N'EST PAS UNE EXPORTATION
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Une facture ne doit partir qu'UNE fois vers la comptabilité.
--    Sans trace de l'envoi, un second clic (ou un envoi automatique doublé d'un
--    envoi manuel) crée une DEUXIÈME facture dans Tiime : chiffre d'affaires
--    compté deux fois, TVA déclarée deux fois. C'est cette colonne qui l'empêche.
-- ---------------------------------------------------------------------------
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tiime_sent_at timestamptz;

COMMENT ON COLUMN invoices.tiime_sent_at IS
  'Date d''envoi vers la comptabilité (Make → Tiime). Non nul = déjà transmis : '
  'un nouvel envoi doit être explicitement forcé.';

-- ---------------------------------------------------------------------------
-- 2. Guadeloupe, Martinique, Guyane, Réunion, Mayotte, Saint-Martin… sont hors
--    du champ territorial de la TVA française (art. 294 du CGI), exactement
--    comme la Suisse est hors UE. Les deux sortent donc à 0 % et notre moteur
--    leur donne le même régime « export ».
--
--    ⚠ MAIS ELLES NE SE DÉCLARENT PAS AU MÊME ENDROIT sur la CA3 : une
--    exportation hors Union européenne et une livraison vers un DOM occupent
--    deux lignes différentes. Les additionner sous « Exportations » fait
--    remplir la déclaration avec un chiffre faux.
--
--    On les distingue par le code postal (97… / 98…) de l'adresse de livraison
--    d'une commande française — la même règle que celle qui a servi à décider
--    du taux dans `regime_tva`, pour qu'il n'y ait jamais deux vérités.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.est_outre_mer(p_adresse jsonb, p_pays text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT coalesce(upper(p_pays) IN ('FR', 'FRANCE')
              AND coalesce(p_adresse ->> 'postal_code', '') ~ '^(97|98)', false);
$$;

COMMENT ON FUNCTION public.est_outre_mer(jsonb, text) IS
  'Livraison vers un DOM/COM : France + code postal 97xx/98xx. Même règle que regime_tva.';

CREATE OR REPLACE FUNCTION public.declaration_tva(p_du date, p_au date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    -- Exportations HORS Union européenne, au sens de l'art. 262 I du CGI.
    'exportations', jsonb_build_object(
      'base_ht', coalesce(sum(sub_total) FILTER (
        WHERE vat_regime = 'export' AND NOT est_outre_mer(shipping_address, customer_country)), 0),
      'nb', count(*) FILTER (
        WHERE vat_regime = 'export' AND NOT est_outre_mer(shipping_address, customer_country))),
    -- Livraisons vers les DOM/COM, art. 294 du CGI : une AUTRE ligne de CA3.
    'livraisons_outre_mer', jsonb_build_object(
      'base_ht', coalesce(sum(sub_total) FILTER (
        WHERE vat_regime = 'export' AND est_outre_mer(shipping_address, customer_country)), 0),
      'nb', count(*) FILTER (
        WHERE vat_regime = 'export' AND est_outre_mer(shipping_address, customer_country))),
    'total_tva_collectee', coalesce(sum(tax), 0),
    'total_ht', coalesce(sum(sub_total), 0),
    'sans_regime', count(*) FILTER (WHERE vat_regime IS NULL)
  ) INTO j
  FROM orders
  WHERE status NOT IN ('cancelled', 'refunded')
    AND created_at >= p_du AND created_at < (p_au + 1);

  -- Détail par pays : nécessaire au guichet unique (OSS), qui se déclare pays par pays.
  -- L'outre-mer y apparaît sous son propre libellé, sinon il se cacherait dans « FR ».
  SELECT j || jsonb_build_object('par_pays', coalesce(jsonb_agg(x ORDER BY x->>'pays'), '[]'::jsonb))
    INTO j
  FROM (
    SELECT jsonb_build_object(
      'pays', CASE WHEN est_outre_mer(shipping_address, customer_country)
                   THEN 'FR-DOM' ELSE coalesce(customer_country, '?') END,
      'regime', CASE WHEN est_outre_mer(shipping_address, customer_country)
                     THEN 'outre_mer' ELSE vat_regime END,
      'base_ht', sum(sub_total),
      'tva', sum(tax),
      'nb', count(*)
    ) AS x
    FROM orders
    WHERE status NOT IN ('cancelled', 'refunded')
      AND created_at >= p_du AND created_at < (p_au + 1)
    GROUP BY
      CASE WHEN est_outre_mer(shipping_address, customer_country)
           THEN 'FR-DOM' ELSE coalesce(customer_country, '?') END,
      CASE WHEN est_outre_mer(shipping_address, customer_country)
           THEN 'outre_mer' ELSE vat_regime END
  ) t;

  RETURN j;
END; $function$;

NOTIFY pgrst, 'reload schema';
