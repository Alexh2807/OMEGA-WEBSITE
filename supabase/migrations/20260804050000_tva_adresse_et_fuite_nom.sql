-- ============================================================================
--  1. LE SITE DONNAIT LA RÉPONSE AU FRAUDEUR
--  2. CONCORDANCE DE L'ADRESSE DE LIVRAISON
--  3. DÉROGATION ADMINISTRATEUR
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. FUITE DU NOM DU TITULAIRE (relevée par le client — le verrou s'annulait
--    lui-même).
--
--    En cas de non-concordance, on affichait « ce numéro appartient à SARL
--    OMEGA » pour aider à corriger. Résultat : il suffisait de saisir n'importe
--    quel numéro trouvé en ligne, de lire le nom qu'on venait de lui donner, de
--    le recopier — et le contrôle tombait.
--
--    Trois canaux fuyaient : le message à l'écran, la réponse JSON de la
--    fonction, et la colonne `profiles.vat_checked_name` que le client peut
--    lire sur son propre profil. Les trois sont fermés ; la preuve reste dans
--    `vies_checks`, réservée aux administrateurs.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 2. L'ADRESSE DE LIVRAISON DOIT RESSEMBLER À CELLE DU TITULAIRE.
--
--    C'est le contrôle qui rend la fraude sans intérêt : même en devinant la
--    raison sociale, il faut se faire livrer là où la société est établie —
--    donc chez elle, pas chez soi.
--
--    Tolérance volontaire : on accepte la MÊME VILLE ou le MÊME CODE POSTAL,
--    pas l'adresse exacte. Une société commande souvent depuis son siège vers
--    un entrepôt voisin, et VIES ne donne pas toujours l'adresse à jour (dans
--    nos essais : siège « 20122 MILANO », livraison « 20121 Milano » — même
--    ville, code postal différent).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.adresses_concordent(
  p_adresse_vies text,
  p_code_postal text,
  p_ville text
)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
AS $function$
DECLARE v_vies text; v_cp text; v_ville text;
BEGIN
  v_vies := regexp_replace(upper(unaccent_simple(coalesce(p_adresse_vies, ''))), '[^A-Z0-9]', '', 'g');
  -- L'État membre ne communique pas d'adresse : on ne peut ni confirmer ni infirmer.
  IF v_vies = '' THEN RETURN NULL; END IF;

  v_cp    := regexp_replace(coalesce(p_code_postal, ''), '[^0-9]', '', 'g');
  v_ville := regexp_replace(upper(unaccent_simple(coalesce(p_ville, ''))), '[^A-Z]', '', 'g');

  IF length(v_cp) >= 4 AND position(v_cp in v_vies) > 0 THEN RETURN true; END IF;
  IF length(v_ville) >= 3 AND position(v_ville in v_vies) > 0 THEN RETURN true; END IF;
  RETURN false;
END; $function$;

-- ---------------------------------------------------------------------------
-- 3. DÉROGATION. Un client légitime peut avoir un site de livraison différent
--    de son siège : refuser sèchement lui ferait payer une TVA qu'il ne doit
--    pas. L'administrateur peut donc l'autoriser après contrôle — c'est une
--    décision humaine, tracée, jamais un réglage que le client s'accorde.
-- ---------------------------------------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS vat_exempt_override boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.vat_exempt_override IS
  'Dérogation accordée par un administrateur : l''exonération intracommunautaire reste '
  'acquise même si l''adresse de livraison ne correspond pas au siège du titulaire. '
  'Le numéro doit toujours être valide et au bon nom.';

-- Comme les autres preuves : le client ne se l'accorde pas lui-même.
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

  NEW.vat_number_valid    := OLD.vat_number_valid;
  NEW.vat_checked_at      := OLD.vat_checked_at;
  NEW.vat_checked_name    := OLD.vat_checked_name;
  NEW.vat_name_match      := OLD.vat_name_match;
  NEW.vat_exempt_override := OLD.vat_exempt_override;

  IF coalesce(NEW.vat_number, '') IS DISTINCT FROM coalesce(OLD.vat_number, '') THEN
    NEW.vat_number_valid := NULL;
    NEW.vat_checked_at   := NULL;
    NEW.vat_checked_name := NULL;
    NEW.vat_name_match   := NULL;
    -- Changer de numéro annule aussi la dérogation : elle avait été accordée
    -- pour UN titulaire, pas pour le compte.
    NEW.vat_exempt_override := false;
  END IF;

  RETURN NEW;
END; $function$;

-- ---------------------------------------------------------------------------
-- LE MOTEUR : quatrième verrou.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.regime_tva(text, boolean, boolean, text, text, boolean);

CREATE OR REPLACE FUNCTION public.regime_tva(
  p_pays text,
  p_entreprise boolean,
  p_vat_valide boolean,
  p_code_postal text DEFAULT NULL,
  p_vat_number text DEFAULT NULL,
  p_identite_ok boolean DEFAULT NULL,
  p_adresse_ok boolean DEFAULT NULL,
  p_derogation boolean DEFAULT false
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

  IF v_pays = 'MC' THEN
    RETURN QUERY SELECT 'fr'::text, 20::numeric, NULL::text,
      'Monaco (territoire fiscal français)'::text, NULL::text;
    RETURN;
  END IF;

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

  IF NOT coalesce(p_entreprise, false) THEN
    RETURN QUERY SELECT 'ue_b2c'::text, 20::numeric, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF NOT coalesce(p_vat_valide, false) THEN
    RETURN QUERY SELECT 'ue_b2c'::text, 20::numeric, NULL::text, NULL::text,
      'Numéro de TVA non vérifié auprès du fichier européen VIES.'::text;
    RETURN;
  END IF;

  -- ★ VERROU 1 : numéro délivré par l'État de livraison.
  IF v_prefixe <> v_pays THEN
    RETURN QUERY SELECT 'ue_b2c'::text, 20::numeric, NULL::text, NULL::text,
      format('Le numéro de TVA (%s) n''est pas délivré par le pays de livraison (%s).',
             coalesce(nullif(v_prefixe, ''), '—'), v_pays)::text;
    RETURN;
  END IF;

  -- ★ VERROU 2 : la raison sociale déclarée est celle du titulaire.
  IF p_identite_ok IS FALSE THEN
    RETURN QUERY SELECT 'ue_b2c'::text, 20::numeric, NULL::text, NULL::text,
      'Le numéro de TVA n''est pas enregistré au nom de la société indiquée.'::text;
    RETURN;
  END IF;

  -- ★ VERROU 3 : la livraison part vers l'établissement du titulaire.
  -- C'est ce verrou qui ôte tout intérêt à l'usurpation : même en devinant la
  -- raison sociale, il faut se faire livrer là où la société est établie.
  -- La dérogation d'un administrateur le lève, après contrôle humain.
  IF p_adresse_ok IS FALSE AND NOT coalesce(p_derogation, false) THEN
    RETURN QUERY SELECT 'ue_b2c'::text, 20::numeric, NULL::text, NULL::text,
      'L''adresse de livraison ne correspond pas à l''établissement enregistré pour ce numéro de TVA. Contactez-nous pour une livraison sur un autre site.'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'ue_b2b'::text, 0::numeric,
    'Autoliquidation — livraison intracommunautaire exonérée (art. 262 ter I du CGI). TVA due par le preneur.'::text,
    NULL::text, NULL::text;
END; $function$;

NOTIFY pgrst, 'reload schema';
