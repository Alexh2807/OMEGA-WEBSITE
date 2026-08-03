/*
  # Boucle client ↔ développeur : problèmes connus, version corrigée, réponse sans compte

  Demande de l'exploitant (3 août 2026) :
   · « que les gens voient la liste des problèmes de cette version » ;
   · « quand je mets résolu pour la version 1.xx, le client sait que c'est traité, et ça
     sort de ma liste de bugs à traiter » ;
   · « que le client reçoive le message du développeur ET puisse re-écrire après coup ».

  ## 1. Ce qu'on N'expose PAS
  ⚠ Le texte d'un signalement est écrit par un client : il peut contenir un nom de
  soirée, un lieu, une adresse, le nom d'un confrère. **Publier `title`/`body` tels quels
  serait une fuite de données personnelles**, exactement le défaut refermé le 2 août sur
  `profiles`. La liste publique est donc OPT-IN par l'admin (`is_public`, défaut FALSE)
  et affiche un libellé qu'il maîtrise (`public_title`, à défaut `title`). Jamais le
  corps du message, jamais l'e-mail, jamais les diagnostics, jamais le show.

  ## 2. Ce que la liste publique apporte
  Un client qui voit « connu, corrigé en 1.34 » n'envoie pas un doublon et sait quoi
  faire (mettre à jour). Et un problème marqué corrigé sort de la liste « reste à
  traiter » côté back-office : la même donnée sert aux deux côtés.
*/

-- ============================================================
-- 1. Colonnes
-- ============================================================
ALTER TABLE bug_reports
  ADD COLUMN IF NOT EXISTS fixed_in_version text,
  ADD COLUMN IF NOT EXISTS is_public        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_title     text;

COMMENT ON COLUMN bug_reports.fixed_in_version IS
  'Version qui corrige ce problème (ex. « 1.34 »). Renseignée par l''admin ; affichée au client.';
COMMENT ON COLUMN bug_reports.is_public IS
  'Apparaît dans la liste publique des problèmes connus. FAUX par défaut : le texte d''un client peut contenir des données personnelles.';
COMMENT ON COLUMN bug_reports.public_title IS
  'Libellé montré publiquement. Vide = on retombe sur `title`. Permet de reformuler sans toucher au signalement d''origine.';

CREATE INDEX IF NOT EXISTS bug_reports_public_idx
  ON bug_reports (is_public, app_version, created_at DESC);

-- ============================================================
-- 2. Liste publique des problèmes connus
-- ============================================================
/*
  SECURITY DEFINER + colonnes choisies une par une : la table reste fermée à `anon`
  (aucune policy de SELECT pour lui), et c'est cette fonction — et elle seule — qui
  décide de ce qui sort. Ajouter une policy de lecture publique aurait ouvert toute
  la table, y compris les signalements non publiés.

  `p_version` : filtre sur la version d'où venait le signalement. NULL = tout.
  On renvoie aussi ce qui est DÉJÀ corrigé : c'est précisément l'information utile
  (« ton problème est connu et réglé en 1.34, mets à jour »).
*/
CREATE OR REPLACE FUNCTION known_issues(p_version text DEFAULT NULL, p_limit integer DEFAULT 100)
RETURNS TABLE (
  id               uuid,
  titre            text,
  statut           text,
  severite         text,
  version_signalee text,
  corrige_dans     text,
  signale_le       timestamptz,
  maj_le           timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id,
         coalesce(nullif(btrim(r.public_title), ''), r.title) AS titre,
         r.status, r.severity, r.app_version, r.fixed_in_version, r.created_at, r.updated_at
  FROM bug_reports r
  WHERE r.is_public = true
    AND (p_version IS NULL OR r.app_version = p_version)
  ORDER BY
    -- Ce qui n'est pas encore réglé d'abord : c'est ce qu'un utilisateur cherche.
    CASE r.status WHEN 'nouveau' THEN 0 WHEN 'en_cours' THEN 1 ELSE 2 END,
    CASE r.severity WHEN 'bloquant' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
    r.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 100), 300));
$$;

REVOKE ALL ON FUNCTION known_issues(text, integer) FROM public;
GRANT EXECUTE ON FUNCTION known_issues(text, integer) TO anon, authenticated;

-- Les versions qui ont au moins un problème publié (pour peupler un sélecteur).
CREATE OR REPLACE FUNCTION known_issue_versions()
RETURNS TABLE (version text, nb bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT app_version, count(*)
  FROM bug_reports
  WHERE is_public = true AND app_version IS NOT NULL AND btrim(app_version) <> ''
  GROUP BY app_version
  ORDER BY app_version DESC;
$$;
REVOKE ALL ON FUNCTION known_issue_versions() FROM public;
GRANT EXECUTE ON FUNCTION known_issue_versions() TO anon, authenticated;

-- ============================================================
-- 3. Le suivi par code renvoie aussi l'état de correction
-- ============================================================
CREATE OR REPLACE FUNCTION bug_report_by_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r bug_reports%ROWTYPE; msgs jsonb;
BEGIN
  IF p_code IS NULL OR char_length(p_code) < 16 THEN RETURN NULL; END IF;
  SELECT * INTO r FROM bug_reports WHERE track_code = p_code;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'created_at', m.created_at, 'is_admin', m.is_admin, 'body', m.body
         ) ORDER BY m.created_at), '[]'::jsonb)
    INTO msgs FROM bug_report_messages m WHERE m.report_id = r.id;
  RETURN jsonb_build_object(
    'title', r.title, 'body', r.body, 'status', r.status,
    'created_at', r.created_at, 'messages', msgs,
    -- Nouveau : de quoi dire au client « corrigé en 1.34 » sans qu'il ait un compte.
    'severity', r.severity,
    'app_version', r.app_version,
    'fixed_in_version', r.fixed_in_version
  );
END; $$;
REVOKE ALL ON FUNCTION bug_report_by_code(text) FROM public;
GRANT EXECUTE ON FUNCTION bug_report_by_code(text) TO anon, authenticated;

-- ============================================================
-- 4. Répondre SANS COMPTE, avec le code de suivi
-- ============================================================
/*
  Sans ça, un client anonyme reçoit la réponse du développeur et ne peut pas répondre —
  la conversation est à sens unique, ce qui vide de son sens le fait d'avoir une
  conversation. La policy d'INSERT reste `TO authenticated` : on n'ouvre RIEN sur la
  table, c'est cette fonction qui écrit, et seulement si le code exact est présenté.

  Garde-fous, parce que le code circule chez le client :
   · le code doit correspondre EXACTEMENT à un ticket (pas d'énumération : 24 hexa) ;
   · `is_admin` est forcé à FALSE — impossible de se faire passer pour le support ;
   · `author_id` reste NULL (c'est un anonyme, on ne lui invente pas d'identité) ;
   · corps borné, et refus d'écrire sur un ticket fermé depuis longtemps (30 jours) pour
     éviter qu'un vieux code serve de boîte à spam.
*/
CREATE OR REPLACE FUNCTION bug_report_reply_by_code(p_code text, p_body text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r bug_reports%ROWTYPE; v_txt text;
BEGIN
  IF p_code IS NULL OR char_length(p_code) < 16 THEN
    RAISE EXCEPTION 'Code de suivi invalide';
  END IF;
  v_txt := btrim(coalesce(p_body, ''));
  IF char_length(v_txt) < 1 THEN RAISE EXCEPTION 'Message vide'; END IF;
  IF char_length(v_txt) > 5000 THEN v_txt := left(v_txt, 5000); END IF;

  SELECT * INTO r FROM bug_reports WHERE track_code = p_code;
  IF NOT FOUND THEN RAISE EXCEPTION 'Signalement introuvable'; END IF;

  IF r.status IN ('ferme', 'doublon') AND r.updated_at < now() - interval '30 days' THEN
    RAISE EXCEPTION 'Ce signalement est clos depuis plus de 30 jours';
  END IF;

  INSERT INTO bug_report_messages (report_id, author_id, is_admin, body)
  VALUES (r.id, NULL, false, v_txt);

  RETURN jsonb_build_object('ok', true);
END; $$;

REVOKE ALL ON FUNCTION bug_report_reply_by_code(text, text) FROM public;
GRANT EXECUTE ON FUNCTION bug_report_reply_by_code(text, text) TO anon, authenticated;

-- ============================================================
-- 5. Confort back-office : compteurs pour la file de traitement
-- ============================================================
/*
  « Reste à traiter » doit être un CHIFFRE visible, pas quelque chose à recompter à l'œil
  à chaque ouverture. Réservé aux admins : la fonction vérifie is_admin() elle-même,
  puisqu'un SECURITY DEFINER court-circuite les policies.
*/
CREATE OR REPLACE FUNCTION bug_reports_stats()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE j jsonb;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Réservé aux administrateurs'; END IF;
  SELECT jsonb_build_object(
    'a_traiter',  count(*) FILTER (WHERE status IN ('nouveau','en_cours')),
    'nouveaux',   count(*) FILTER (WHERE status = 'nouveau'),
    'bloquants',  count(*) FILTER (WHERE status IN ('nouveau','en_cours') AND severity = 'bloquant'),
    'resolus',    count(*) FILTER (WHERE status = 'resolu'),
    'publics',    count(*) FILTER (WHERE is_public),
    'total',      count(*),
    'par_version', coalesce((
      SELECT jsonb_object_agg(v, n) FROM (
        SELECT coalesce(nullif(btrim(app_version), ''), '?') AS v, count(*) AS n
        FROM bug_reports WHERE status IN ('nouveau','en_cours')
        GROUP BY 1 ORDER BY 1 DESC
      ) t
    ), '{}'::jsonb)
  ) INTO j FROM bug_reports;
  RETURN j;
END; $$;

REVOKE ALL ON FUNCTION bug_reports_stats() FROM public;
GRANT EXECUTE ON FUNCTION bug_reports_stats() TO authenticated;
