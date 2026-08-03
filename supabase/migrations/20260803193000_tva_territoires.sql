/*
  # Territoires particuliers : Monaco et l'outre-mer

  Constaté en testant `regime_tva` sur tous les cas (3 août 2026) :
   · **Monaco sortait en « export exonéré »** — c'est FAUX. Monaco fait partie du
     territoire fiscal français pour la TVA : une vente à Monaco se facture comme une
     vente en France, à 20 %. Facturer 0 % aurait été de la TVA non collectée, donc due
     par le vendeur en cas de contrôle.
   · **Les DOM étaient traités comme la métropole** (pays « FR » → 20 %). Or une
     livraison de métropole vers la Guadeloupe, la Martinique, La Réunion, la Guyane ou
     Mayotte est EXONÉRÉE (art. 294 du CGI) : c'est le territoire de destination qui
     applique sa propre taxation à l'entrée. Facturer 20 % aurait fait payer au client
     une taxe qui n'était pas due.

  Le pays seul ne suffit donc pas : il faut le CODE POSTAL. On remplace la fonction
  plutôt que d'en ajouter une seconde — PostgREST résout les fonctions par nom
  d'argument, et deux variantes rendraient l'appel ambigu.
*/

DROP FUNCTION IF EXISTS regime_tva(text, boolean, boolean);

CREATE OR REPLACE FUNCTION regime_tva(
  p_pays        text,
  p_entreprise  boolean,
  p_vat_valide  boolean,
  p_code_postal text DEFAULT NULL
)
RETURNS TABLE (regime text, taux numeric, mention text, territoire text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pays text; v_cp text; v_ue boolean;
BEGIN
  v_pays := upper(btrim(coalesce(p_pays, 'FR')));
  IF v_pays = '' THEN v_pays := 'FR'; END IF;
  v_cp := regexp_replace(coalesce(p_code_postal, ''), '\s', '', 'g');

  -- MONACO : territoire fiscal français pour la TVA. Une vente y est une vente France.
  IF v_pays = 'MC' THEN
    RETURN QUERY SELECT 'fr'::text, 20::numeric, NULL::text, 'Monaco (territoire fiscal français)'::text;
    RETURN;
  END IF;

  -- OUTRE-MER : codes postaux 971 à 976 (+ 98x pour les collectivités du Pacifique).
  -- Exonération au départ de la métropole ; la taxation se fait à l'arrivée.
  IF v_pays = 'FR' AND v_cp ~ '^(97|98)' THEN
    RETURN QUERY SELECT 'export'::text, 0::numeric,
      'Exonération de TVA — livraison vers un département ou une collectivité d''outre-mer (art. 294 du CGI).'::text,
      'Outre-mer'::text;
    RETURN;
  END IF;

  SELECT true INTO v_ue FROM eu_vat_rates WHERE country_code = v_pays;
  v_ue := coalesce(v_ue, false);

  IF v_pays = 'FR' THEN
    RETURN QUERY SELECT 'fr'::text, 20::numeric, NULL::text, NULL::text;

  ELSIF NOT v_ue THEN
    RETURN QUERY SELECT 'export'::text, 0::numeric,
      'Exonération de TVA — exportation hors Union européenne (art. 262 I du CGI).'::text, NULL::text;

  ELSIF p_entreprise AND coalesce(p_vat_valide, false) THEN
    RETURN QUERY SELECT 'ue_b2b'::text, 0::numeric,
      'Autoliquidation — livraison intracommunautaire exonérée (art. 262 ter I du CGI). TVA due par le preneur.'::text, NULL::text;

  ELSE
    -- Entreprise UE sans numéro VÉRIFIÉ = traitée comme un particulier. Position
    -- prudente et assumée : en cas de doute on facture la TVA, quitte à régulariser,
    -- plutôt que de risquer d'en devoir une qu'on n'a jamais encaissée.
    RETURN QUERY SELECT 'ue_b2c'::text, 20::numeric, NULL::text, NULL::text;
  END IF;
END; $$;

REVOKE ALL ON FUNCTION regime_tva(text, boolean, boolean, text) FROM public;
GRANT EXECUTE ON FUNCTION regime_tva(text, boolean, boolean, text) TO anon, authenticated;

/*
  ⚠ LIMITE CONNUE ET ASSUMÉE : d'autres territoires européens sont hors du champ de la
  TVA de l'UE (Canaries, Ceuta et Melilla, Åland, Livigno, Helgoland, Büsingen…). Ils
  sont rares dans une activité française d'équipement scénique, et les traiter demanderait
  une table d'exceptions par plage de codes postaux. Si une vente s'y présente, l'admin
  doit corriger le régime à la main sur la facture — c'est pour cela que `vat_regime` est
  modifiable en base et non recalculé automatiquement.
*/
COMMENT ON FUNCTION regime_tva(text, boolean, boolean, text) IS
  'Décide le régime de TVA d''une vente. SOURCE UNIQUE : ne jamais redécider ailleurs. Gère France, Monaco (=France), outre-mer (exonéré), UE B2B autoliquidation, UE B2C, export.';
