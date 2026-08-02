/*
  # Conserver le contenu des e-mails envoyés

  Le journal ne retenait que l'enveloppe : qui, quoi, quand, et le verdict du serveur.
  Impossible de relire ce qui avait réellement été écrit à un client — or c'est
  précisément ce qu'on veut vérifier quand une commande tourne mal.

  ## Le volume, puisque c'est la vraie question
  Un gabarit HTML pèse 7 à 9 ko, et une notification produit une ligne PAR
  destinataire : le même corps est donc stocké deux fois quand les deux administrateurs
  sont prévenus. PostgreSQL compresse automatiquement (TOAST) toute colonne texte
  dépassant ~2 ko, et nos gabarits, très répétitifs, se réduisent à environ un
  cinquième. L'ordre de grandeur réel est donc de 1,5 ko par ligne — soit ~150 Mo pour
  100 000 envois.

  Une table de contenus dédupliquée aurait divisé cela par deux, au prix d'une jointure
  et d'un cycle de vie à gérer. À ce volume, le gain ne justifie pas la complexité.
  ⚠ Si le journal devait dépasser le million de lignes, c'est `purger_email_log()`
  ci-dessous qu'il faudrait planifier (pg_cron), et non complexifier le modèle.
*/

ALTER TABLE public.email_log
  ADD COLUMN IF NOT EXISTS corps_html  text,
  ADD COLUMN IF NOT EXISTS corps_texte text;

COMMENT ON COLUMN public.email_log.corps_html IS
  'Le message tel qu''il a été expédié. Affiché dans une iframe cloisonnée côté admin.';

/*
  Purge d'entretien. Non planifiée : pg_cron n'est pas activé sur ce projet, et
  activer un ordonnanceur pour une table de quelques milliers de lignes serait
  disproportionné. À appeler à la main, ou à planifier le jour où le volume l'exige.

  Ne supprime QUE le contenu, jamais la ligne : la trace de l'envoi — qui, quand,
  accepté ou non — doit rester même quand le corps n'a plus d'intérêt.
*/
CREATE OR REPLACE FUNCTION public.purger_email_log(p_mois integer DEFAULT 12)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lignes integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  UPDATE email_log
     SET corps_html = NULL, corps_texte = NULL
   WHERE created_at < now() - make_interval(months => p_mois)
     AND (corps_html IS NOT NULL OR corps_texte IS NOT NULL);

  GET DIAGNOSTICS v_lignes = ROW_COUNT;
  RETURN v_lignes;
END;
$$;

REVOKE ALL ON FUNCTION public.purger_email_log(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purger_email_log(integer) TO authenticated;
