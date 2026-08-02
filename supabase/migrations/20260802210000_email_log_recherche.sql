/*
  # Recherche rapide dans le journal des envois

  Le journal grossit d'une ligne par destinataire et par envoi : à raison de quelques
  milliers de commandes et de messages par an, il atteint vite des centaines de
  milliers de lignes. Or une recherche « qui contient » (`ILIKE '%mot%'`) ne peut
  s'appuyer sur aucun index B-tree classique : la valeur cherchée n'est pas un début
  de chaîne. PostgreSQL lirait alors la table entière à chaque frappe.

  `pg_trgm` découpe le texte en groupes de trois caractères et les indexe : un
  `ILIKE '%dupont%'` devient une recherche indexée, y compris au MILIEU d'un mot ou
  d'une adresse.

  Les trois colonnes indexées ensemble parce qu'on cherche indifféremment sur l'une
  ou l'autre : « dupont » (destinataire), « commande » (objet) ou « order_new »
  (événement).
*/

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS email_log_destinataire_trgm
  ON public.email_log USING gin (destinataire gin_trgm_ops);

CREATE INDEX IF NOT EXISTS email_log_objet_trgm
  ON public.email_log USING gin (objet gin_trgm_ops);

CREATE INDEX IF NOT EXISTS email_log_evenement_trgm
  ON public.email_log USING gin (evenement gin_trgm_ops);
