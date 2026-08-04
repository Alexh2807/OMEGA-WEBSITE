-- ============================================================================
--  L'EXONÉRATION B2B NE DOIT PAS SUFFIRE À CONNAÎTRE UN NUMÉRO DE TVA
--
--  Constat (question du client, vérifiée) : `regime_tva` ne recevait qu'un
--  booléen « numéro valide ». Elle ne voyait JAMAIS le numéro. Conséquences :
--
--   1. N'importe qui pouvait saisir le numéro d'une AUTRE société — les numéros
--      intracommunautaires sont publics, VIES les confirme à tout le monde — et
--      obtenir 0 % de TVA. Rien ne reliait le numéro à l'acheteur.
--   2. Un numéro ALLEMAND avec une livraison en ITALIE donnait aussi 0 %, alors
--      que l'exonération suppose un acquéreur identifié DANS L'ÉTAT D'ARRIVÉE.
--
--  Si l'exonération est appliquée à tort, ce n'est pas l'acheteur qui doit la
--  TVA : c'est le vendeur qui la doit à l'État, sur une somme qu'il n'a jamais
--  encaissée. D'où trois verrous, en plus de la validité VIES.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Concordance du nom : VIES renvoie, pour la plupart des États membres, la
-- raison sociale rattachée au numéro. On la compare à celle que déclare le
-- client. ⚠ Certains États (l'Allemagne notamment) ne divulguent RIEN : le
-- champ reste NULL et on s'appuie alors sur les deux autres verrous.
-- ---------------------------------------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS vat_name_match boolean;

COMMENT ON COLUMN profiles.vat_name_match IS
  'La raison sociale déclarée correspond-elle à celle que VIES rattache au numéro ? '
  'NULL = VIES ne divulgue pas de nom pour cet État membre.';

-- Ce champ appartient au serveur, comme les autres preuves de vérification :
-- sans cela, un client le mettrait à `true` par un simple PATCH.
CREATE OR REPLACE FUNCTION public.profiles_proteger_verification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE v_role text;
BEGIN
  v_role := coalesce(current_setting('request.jwt.claim.role', true), '');

  IF v_role = 'service_role' OR auth.uid() IS NULL OR is_admin() THEN
    RETURN NEW;
  END IF;

  NEW.vat_number_valid := OLD.vat_number_valid;
  NEW.vat_checked_at   := OLD.vat_checked_at;
  NEW.vat_checked_name := OLD.vat_checked_name;
  NEW.vat_name_match   := OLD.vat_name_match;

  IF coalesce(NEW.vat_number, '') IS DISTINCT FROM coalesce(OLD.vat_number, '') THEN
    NEW.vat_number_valid := NULL;
    NEW.vat_checked_at   := NULL;
    NEW.vat_checked_name := NULL;
    NEW.vat_name_match   := NULL;
  END IF;

  RETURN NEW;
END; $function$;

-- ---------------------------------------------------------------------------
-- Comparaison de raisons sociales, tolérante à ce qui varie légitimement :
-- casse, accents, ponctuation, et surtout la FORME JURIDIQUE (SRL, GmbH, BV…)
-- que le client omet presque toujours. « Motorola Solutions Italia » doit
-- correspondre à « MOTOROLA SOLUTIONS ITALIA S.R.L. ».
-- ---------------------------------------------------------------------------
-- ⚠ `unaccent_simple` DOIT être déclarée avant celle qui l'utilise : PostgreSQL
-- valide le corps d'une fonction SQL dès sa création. On retire les accents à la
-- main plutôt que d'ajouter l'extension `unaccent` pour si peu.
CREATE OR REPLACE FUNCTION public.unaccent_simple(p_texte text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT translate(coalesce(p_texte, ''),
    'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖØòóôõöøÙÚÛÜùúûüÇçÑñÝýÿŠšŽž',
    'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOOooooooUUUUuuuuCcNnYyySsZz');
$$;

CREATE OR REPLACE FUNCTION public.normaliser_societe(p_nom text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT nullif(
    regexp_replace(
      regexp_replace(
        upper(unaccent_simple(coalesce(p_nom, ''))),
        '\y(S\.?R\.?L|S\.?A\.?R\.?L|S\.?A\.?S\.?U?|S\.?P\.?A|S\.?A|GMBH|MBH|AG|BV|NV|LTD|LIMITED|PLC|OY|AB|APS|A/S|KFT|SP\.? Z ?O\.?O|EURL|SNC|SCI|E\.?I\.?R\.?L|UG)\y',
        ' ', 'g'),
      '[^A-Z0-9]', '', 'g'),
    '');
$$;

CREATE OR REPLACE FUNCTION public.noms_concordent(p_declare text, p_vies text)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
AS $function$
DECLARE a text; b text;
BEGIN
  a := normaliser_societe(p_declare);
  b := normaliser_societe(p_vies);
  -- Pas de nom côté VIES (Allemagne…) : on ne peut ni confirmer ni infirmer.
  IF b IS NULL THEN RETURN NULL; END IF;
  IF a IS NULL THEN RETURN false; END IF;
  -- L'un contient l'autre : tolère « Motorola Solutions » vs « Motorola Solutions Italia ».
  RETURN a = b OR position(a in b) > 0 OR position(b in a) > 0;
END; $function$;

-- ---------------------------------------------------------------------------
-- LE MOTEUR. Il reçoit désormais le NUMÉRO et le verdict d'identité, et il
-- explique son refus — sans quoi le client ne comprend pas pourquoi on lui
-- facture la TVA et appelle le support.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.regime_tva(text, boolean, boolean, text);

CREATE OR REPLACE FUNCTION public.regime_tva(
  p_pays text,
  p_entreprise boolean,
  p_vat_valide boolean,
  p_code_postal text DEFAULT NULL,
  p_vat_number text DEFAULT NULL,
  p_identite_ok boolean DEFAULT NULL
)
RETURNS TABLE(regime text, taux numeric, mention text, territoire text, refus text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_pays text; v_cp text; v_ue boolean; v_prefixe text;
BEGIN
  v_pays := upper(btrim(coalesce(p_pays, 'FR')));
  IF v_pays = '' THEN v_pays := 'FR'; END IF;
  v_cp := regexp_replace(coalesce(p_code_postal, ''), '\s', '', 'g');
  v_prefixe := upper(substring(regexp_replace(coalesce(p_vat_number, ''), '[^A-Za-z0-9]', '', 'g') from 1 for 2));

  -- MONACO : territoire fiscal français pour la TVA. Une vente y est une vente France.
  IF v_pays = 'MC' THEN
    RETURN QUERY SELECT 'fr'::text, 20::numeric, NULL::text,
      'Monaco (territoire fiscal français)'::text, NULL::text;
    RETURN;
  END IF;

  -- OUTRE-MER : codes postaux 971 à 976 (+ 98x pour les collectivités du Pacifique).
  IF v_pays = 'FR' AND v_cp ~ '^(97|98)' THEN
    RETURN QUERY SELECT 'export'::text, 0::numeric,
      'Exonération de TVA — livraison vers un département ou une collectivité d''outre-mer (art. 294 du CGI).'::text,
      'Outre-mer'::text, NULL::text;
    RETURN;
  END IF;

  SELECT true INTO v_ue FROM eu_vat_rates WHERE country_code = v_pays;
  v_ue := coalesce(v_ue, false);

  IF v_pays = 'FR' THEN
    RETURN QUERY SELECT 'fr'::text, 20::numeric, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF NOT v_ue THEN
    RETURN QUERY SELECT 'export'::text, 0::numeric,
      'Exonération de TVA — exportation hors Union européenne (art. 262 I du CGI).'::text,
      NULL::text, NULL::text;
    RETURN;
  END IF;

  -- ---- Union européenne : l'exonération B2B se mérite, verrou par verrou ----
  IF NOT coalesce(p_entreprise, false) THEN
    RETURN QUERY SELECT 'ue_b2c'::text, 20::numeric, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF NOT coalesce(p_vat_valide, false) THEN
    RETURN QUERY SELECT 'ue_b2c'::text, 20::numeric, NULL::text, NULL::text,
      'Numéro de TVA non vérifié auprès du fichier européen VIES.'::text;
    RETURN;
  END IF;

  -- ★ VERROU 1 : le numéro doit être délivré par l'ÉTAT DE LIVRAISON.
  -- L'exonération vise un acquéreur identifié dans l'État membre d'arrivée : un
  -- numéro allemand pour une livraison en Italie ne l'ouvre pas.
  IF v_prefixe <> v_pays THEN
    RETURN QUERY SELECT 'ue_b2c'::text, 20::numeric, NULL::text, NULL::text,
      format('Le numéro de TVA (%s) n''est pas délivré par le pays de livraison (%s).',
             coalesce(nullif(v_prefixe, ''), '—'), v_pays)::text;
    RETURN;
  END IF;

  -- ★ VERROU 2 : l'identité de l'acquéreur. `p_identite_ok = false` signifie que
  -- la raison sociale déclarée ne correspond pas à celle que VIES rattache au
  -- numéro, ou que la livraison n'est pas adressée à cette société. NULL = on n'a
  -- pas pu contrôler (État membre qui ne divulgue pas le nom) : on laisse passer,
  -- la charge de la preuve reposant alors sur le transport et la facture.
  IF p_identite_ok IS FALSE THEN
    RETURN QUERY SELECT 'ue_b2c'::text, 20::numeric, NULL::text, NULL::text,
      'Le numéro de TVA ne correspond pas à la société indiquée. Pour une livraison hors taxe, la raison sociale et le destinataire doivent être ceux du titulaire du numéro.'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'ue_b2b'::text, 0::numeric,
    'Autoliquidation — livraison intracommunautaire exonérée (art. 262 ter I du CGI). TVA due par le preneur.'::text,
    NULL::text, NULL::text;
END; $function$;

NOTIFY pgrst, 'reload schema';
