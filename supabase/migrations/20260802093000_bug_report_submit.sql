/*
  # Dépôt d'un signalement par une fonction dédiée

  ## Le défaut corrigé (constaté en sondant la base après la première migration)
  L'application a besoin du `track_code` en retour, pour donner à un utilisateur SANS
  COMPTE de quoi suivre son ticket. Elle faisait donc un INSERT … RETURNING.
  Or PostgreSQL applique aussi les policies de LECTURE sur la clause RETURNING : le rôle
  `anon` n'ayant (volontairement) aucun droit de SELECT, l'insertion partait bien mais
  la requête échouait avec « new row violates row-level security policy ».
  → L'envoi anonyme, c'est-à-dire le cas d'usage central, était cassé.

  ⚠ La mauvaise correction aurait été d'ajouter une policy de SELECT pour `anon` :
  tout signalement de tout le monde serait devenu lisible publiquement.

  ## La correction
  Une fonction SECURITY DEFINER qui insère et ne renvoie QUE le code de suivi.
  Bénéfice supplémentaire : `user_id` est posé PAR LE SERVEUR depuis `auth.uid()`.
  Le client ne le fournit plus du tout — l'usurpation devient structurellement
  impossible, au lieu de reposer sur une contrainte à ne pas oublier.
*/

CREATE OR REPLACE FUNCTION submit_bug_report(
  p_title       text,
  p_body        text,
  p_email       text DEFAULT NULL,
  p_version     text DEFAULT NULL,
  p_platform    text DEFAULT NULL,
  p_diagnostics text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE v_id uuid; v_code text; v_user uuid;
BEGIN
  -- Mêmes bornes que les contraintes de la table, mais avec un message clair :
  -- une erreur de contrainte brute ne dit rien à l'utilisateur final.
  IF p_title IS NULL OR char_length(btrim(p_title)) < 4 THEN
    RAISE EXCEPTION 'Titre trop court';
  END IF;
  IF p_body IS NULL OR char_length(btrim(p_body)) < 12 THEN
    RAISE EXCEPTION 'Description trop courte';
  END IF;

  v_user := auth.uid();   -- NULL si envoi anonyme : c'est légitime

  INSERT INTO bug_reports (user_id, contact_email, title, body, app_version, platform, diagnostics)
  VALUES (
    v_user,
    nullif(btrim(coalesce(p_email, '')), ''),
    left(btrim(p_title), 140),
    left(btrim(p_body), 20000),
    left(coalesce(p_version, ''), 40),
    left(coalesce(p_platform, ''), 120),
    left(coalesce(p_diagnostics, ''), 20000)
  )
  RETURNING id, track_code INTO v_id, v_code;

  -- On ne renvoie QUE ce dont l'expéditeur a besoin : rien du contenu d'autrui.
  RETURN jsonb_build_object('id', v_id, 'track_code', v_code, 'lie_au_compte', v_user IS NOT NULL);
END;
$$;

REVOKE ALL ON FUNCTION submit_bug_report(text, text, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION submit_bug_report(text, text, text, text, text, text) TO anon, authenticated;
