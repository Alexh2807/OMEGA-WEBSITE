/*
  # `bug_reports.updated_at` doit refléter l'activité RÉELLE — réponses des clients incluses

  ## Le défaut (constaté le 4 août 2026)
  L'exploitant : « le site n'actualise pas le message envoyé par le client ». En cherchant,
  on a mesuré sur la base : `updated_at` valait **exactement l'heure du dernier message de
  l'ADMIN**, alors qu'un message du CLIENT était arrivé 17 secondes plus tard.

  Cause : le trigger `bug_reports_touch()` (migration 20260802090000) fait
      UPDATE bug_reports SET updated_at = now() WHERE id = NEW.report_id;
  **sans `SECURITY DEFINER`**. Il s'exécute donc avec les droits de l'appelant — et la
  seule policy d'UPDATE sur `bug_reports` est `is_admin()`. Chez un client, cet UPDATE ne
  touche **AUCUNE ligne**, et surtout **sans la moindre erreur** : RLS ne refuse pas une
  écriture, il restreint l'ensemble des lignes visibles. Un `UPDATE … WHERE id = …` qui ne
  voit pas la ligne réussit en ayant modifié 0 ligne. Le trigger a donc l'air de marcher
  depuis le premier jour, et il n'a jamais rien fait pour la moitié des interlocuteurs.

  ## Conséquences réelles
  · le tri **« dernière activité »** du back-office MENT : un ticket où le client attend
    une réponse ne remonte jamais en tête de file ;
  · tout ce qui se fierait à cette date pour détecter du nouveau est aveugle aux clients.

  ## Le correctif
  `SECURITY DEFINER` + `SET search_path = public` (comme les autres fonctions du projet :
  sans search_path figé, une fonction en DEFINER est manipulable par l'appelant).

  ⚠ Pourquoi c'est sans risque ici, alors que `SECURITY DEFINER` demande à se justifier :
  la fonction ne s'exécute QUE comme trigger `AFTER INSERT` sur `bug_report_messages` —
  donc après une insertion déjà autorisée par les policies de cette table-là. Elle ne lit
  aucune donnée, n'en renvoie aucune, et écrit UNE seule colonne (`updated_at`) sur la
  ligne parente désignée par une clé étrangère. Le seul pouvoir qu'elle confère est
  exactement celui qu'on veut : « poster un message rend son ticket récent ».
  Elle ne touche NI `status`, NI `user_id`, NI aucun champ de décision.

  ## Rattrapage
  Les tickets existants portent une date fausse (toutes les réponses clients passées ont
  été perdues pour ce calcul). On la remet à l'heure du dernier message, quand celui-ci
  est postérieur — jamais en arrière, pour ne pas réécrire une activité admin plus récente.
*/

CREATE OR REPLACE FUNCTION bug_reports_touch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE bug_reports SET updated_at = now() WHERE id = NEW.report_id;
  RETURN NEW;
END; $$;

/* ⚠ CONTREPARTIE DU `SECURITY DEFINER` — À NE PAS OUBLIER.
   PostgreSQL accorde `EXECUTE` à `PUBLIC` par défaut sur toute fonction : en passant
   celle-ci en DEFINER, on venait de publier une fonction à privilèges élevés sur
   `/rest/v1/rpc/bug_reports_touch`, appelable par `anon` (signalé par l'advisor de
   sécurité Supabase juste après l'application). L'appel échouerait — PostgreSQL refuse
   d'exécuter une fonction trigger hors trigger — mais on ne laisse pas une porte
   ouverte au motif qu'elle donne sur un mur.
   ★ Révoquer NE CASSE PAS le trigger : le privilège `EXECUTE` d'une fonction trigger est
   vérifié à la création du trigger, pas à chaque déclenchement. (Vérifié après coup en
   se faisant passer pour un client : la date bouge toujours.) */
REVOKE EXECUTE ON FUNCTION bug_reports_touch() FROM PUBLIC, anon, authenticated;

-- Rattrapage des tickets déjà en base (voir ci-dessus).
UPDATE bug_reports r
   SET updated_at = d.dernier
  FROM (SELECT report_id, max(created_at) AS dernier
          FROM bug_report_messages
         GROUP BY report_id) d
 WHERE d.report_id = r.id
   AND d.dernier > r.updated_at;
