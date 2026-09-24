-- Avertissement Supabase « function_search_path_mutable » : chemin de recherche figé
-- pour les fonctions du filtre anti-robots (cf. 20260924130000).
alter function public.antirobot_paires_rares(text) set search_path = pg_catalog, public;
alter function public.antirobot_score_nom(text) set search_path = pg_catalog, public;
alter function public.antirobot_gmail_points(text) set search_path = pg_catalog, public;
