/*
  # Correction RLS pour le système de planning

  Ce fichier ajoute les politiques RLS manquantes pour les tables du planning.

  1. Activation de RLS sur les tables principales
  2. Politiques d'accès pour les administrateurs (lecture, écriture, mise à jour, suppression)
  3. Politiques de lecture pour les utilisateurs authentifiés
*/

-- ========================================
-- ACTIVATION DE RLS
-- ========================================

ALTER TABLE planning_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_locations ENABLE ROW LEVEL SECURITY;

-- ========================================
-- POLITIQUES POUR planning_events
-- ========================================

-- Les administrateurs peuvent tout gérer
DROP POLICY IF EXISTS "Admins can manage events" ON planning_events;
CREATE POLICY "Admins can manage events"
  ON planning_events
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Tous les utilisateurs authentifiés peuvent lire les événements
DROP POLICY IF EXISTS "Authenticated users can view events" ON planning_events;
CREATE POLICY "Authenticated users can view events"
  ON planning_events
  FOR SELECT
  TO authenticated
  USING (true);

-- ========================================
-- POLITIQUES POUR planning_providers
-- ========================================

-- Les administrateurs peuvent tout gérer
DROP POLICY IF EXISTS "Admins can manage providers" ON planning_providers;
CREATE POLICY "Admins can manage providers"
  ON planning_providers
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Tous les utilisateurs authentifiés peuvent lire les prestataires
DROP POLICY IF EXISTS "Authenticated users can view providers" ON planning_providers;
CREATE POLICY "Authenticated users can view providers"
  ON planning_providers
  FOR SELECT
  TO authenticated
  USING (true);

-- ========================================
-- POLITIQUES POUR planning_locations
-- ========================================

-- Les administrateurs peuvent tout gérer
DROP POLICY IF EXISTS "Admins can manage locations" ON planning_locations;
CREATE POLICY "Admins can manage locations"
  ON planning_locations
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Tous les utilisateurs authentifiés peuvent lire les lieux
DROP POLICY IF EXISTS "Authenticated users can view locations" ON planning_locations;
CREATE POLICY "Authenticated users can view locations"
  ON planning_locations
  FOR SELECT
  TO authenticated
  USING (true);

-- ========================================
-- INDEX POUR PERFORMANCES
-- ========================================

-- Index pour améliorer les performances des requêtes sur les dates
CREATE INDEX IF NOT EXISTS idx_planning_events_date ON planning_events(event_date);

-- Index pour améliorer les performances des requêtes sur les lieux
CREATE INDEX IF NOT EXISTS idx_planning_events_location ON planning_events(location_id);

-- Index pour améliorer les performances des recherches de prestataires
CREATE INDEX IF NOT EXISTS idx_planning_events_providers ON planning_events USING GIN(provider_ids);
