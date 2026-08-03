/*
  # Relève groupée des nouveautés d'un lot de signalements

  ## Le défaut constaté (3 août 2026)
  L'exploitant a répondu depuis le back-office ; rien ne s'est affiché dans le logiciel
  du client. Cause : l'application ne vérifiait qu'au démarrage, au retour du réseau et
  à l'ouverture de la fenêtre de suivi. Une réponse écrite pendant que le logiciel
  tourne n'était donc jamais vue — c'est-à-dire le cas normal.

  Pour pouvoir vérifier RÉGULIÈREMENT sans coûter cher, il faut UN appel pour tous les
  codes suivis, au lieu d'un `bug_report_by_code` par code (10 codes = 10 aller-retours
  toutes les trois minutes, sur une liaison de salle).

  ## Ce qui sort
  Le strict nécessaire pour décider s'il y a du neuf : titre, état, version de
  correction, date du dernier message du support, nombre de messages. **Jamais le
  contenu** — le fil complet reste derrière `bug_report_by_code`, à l'ouverture.
  Comme ailleurs, il faut présenter le code EXACT : pas d'énumération possible.
*/
CREATE OR REPLACE FUNCTION bug_reports_updates(p_codes text[])
RETURNS TABLE (
  code          text,
  titre         text,
  statut        text,
  corrige_dans  text,
  signale_le    timestamptz,
  dernier_admin timestamptz,
  nb_messages   integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.track_code,
         r.title,
         r.status,
         r.fixed_in_version,
         r.created_at,
         (SELECT max(m.created_at) FROM bug_report_messages m
           WHERE m.report_id = r.id AND m.is_admin),
         (SELECT count(*)::int FROM bug_report_messages m WHERE m.report_id = r.id)
  FROM bug_reports r
  -- Plafond : un client suit quelques signalements, pas mille. Borner évite qu'un
  -- appel fabriqué demande un balayage complet de la table.
  WHERE r.track_code = ANY (p_codes[1:100]);
$$;

REVOKE ALL ON FUNCTION bug_reports_updates(text[]) FROM public;
GRANT EXECUTE ON FUNCTION bug_reports_updates(text[]) TO anon, authenticated;
