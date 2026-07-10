/*
  AUDIT RLS — à exécuter dans le SQL Editor Supabase (prod).
  Répond au point 🟠 de l'audit du 20/06 : « Auditer les politiques RLS
  table par table » — la garde /admin étant côté client, la sécurité
  réelle des données repose ENTIÈREMENT sur ces politiques.

  Lecture des résultats :
  1) Toute table listée en « RLS DÉSACTIVÉE » est lisible/modifiable par
     n'importe quel visiteur muni de la clé anon (publique dans le bundle).
     → ALTER TABLE <table> ENABLE ROW LEVEL SECURITY; puis créer des politiques.
  2) Une table avec RLS activée mais AUCUNE politique = tout est bloqué
     (sauf service_role). C'est sûr mais peut casser une fonctionnalité.
  3) Vérifier que les politiques d'écriture sensibles exigent
     profiles.role = 'admin' et que les données personnelles (orders,
     shipping_addresses, payment_records, profiles) ne sont lisibles que
     par leur propriétaire (auth.uid()) ou un admin.
*/

-- ───────────────────────────────────────────────────────────────────
-- 1) Tables du schéma public SANS RLS (le point le plus critique)
-- ───────────────────────────────────────────────────────────────────
SELECT
  c.relname AS table_sans_rls,
  '🔴 RLS DÉSACTIVÉE — accessible via la clé anon' AS verdict
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND NOT c.relrowsecurity
ORDER BY c.relname;

-- ───────────────────────────────────────────────────────────────────
-- 2) État RLS + nombre de politiques, table par table
-- ───────────────────────────────────────────────────────────────────
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_active,
  c.relforcerowsecurity AS rls_forcee,
  COUNT(p.polname) AS nb_politiques
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'public' AND c.relkind = 'r'
GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
ORDER BY c.relrowsecurity ASC, c.relname;

-- ───────────────────────────────────────────────────────────────────
-- 3) Détail de chaque politique (qui peut faire quoi)
--    qual = condition de lecture ; with_check = condition d'écriture
-- ───────────────────────────────────────────────────────────────────
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd, policyname;

-- ───────────────────────────────────────────────────────────────────
-- 4) Politiques « ouvertes » suspectes (true sans condition) sur des
--    commandes d'écriture — à justifier une par une
-- ───────────────────────────────────────────────────────────────────
SELECT
  tablename,
  policyname,
  cmd,
  qual,
  with_check,
  '🟠 politique permissive sans condition — à vérifier' AS verdict
FROM pg_policies
WHERE schemaname = 'public'
  AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  AND (COALESCE(qual, 'true') = 'true' AND COALESCE(with_check, 'true') = 'true')
ORDER BY tablename, policyname;

-- ───────────────────────────────────────────────────────────────────
-- 5) Rappel des attendus OMEGA (grille de lecture manuelle)
--    products, categories, site_settings : SELECT public ; écriture admin.
--    orders, order_items, payment_records, shipping_addresses, cart_items,
--    profiles : SELECT/écriture limités à auth.uid() = user_id (ou admin).
--    contact_messages / devis : INSERT public éventuel, SELECT admin.
-- ───────────────────────────────────────────────────────────────────
