/*
  # Amélioration du système de planning avec types de soirées et coûts (Version Corrigée et Idempotente)

  Ce script peut être exécuté plusieurs fois sans risque d'erreur.

  1. Nouvelle Table
    - `planning_event_types`: Stocke les types de soirées (Camping, Mousse, etc.)

  2. Modifications des tables existantes
    - `planning_locations`: Ajout de `event_type_id` pour lier un lieu à un type de soirée.
    - `planning_providers`: Ajout de `costs` (jsonb) pour stocker les coûts par type de soirée.
    - `planning_events`: Suppression de l'ancienne colonne `event_type_id`.

  3. Sécurité
    - Activation de RLS et ajout de politiques de manière sécurisée.
*/

-- Étape 1: Créer la table pour les types d'événements si elle n'existe pas
CREATE TABLE IF NOT EXISTS planning_event_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

-- Étape 2: Insérer les types de soirées par défaut
INSERT INTO planning_event_types (name) VALUES
  ('Camping'),
  ('Fete de village'),
  ('Mousse'),
  ('Pool Party (Journée)'),
  ('Pool Party (Nuit)')
ON CONFLICT (name) DO NOTHING;

-- Étape 3: Modifier la table des lieux
ALTER TABLE planning_locations
ADD COLUMN IF NOT EXISTS event_type_id uuid REFERENCES planning_event_types(id) ON DELETE SET NULL;

-- Étape 4: Modifier la table des prestataires
ALTER TABLE planning_providers
ADD COLUMN IF NOT EXISTS costs jsonb DEFAULT '{}'::jsonb;

-- Étape 5: Nettoyer l'ancienne colonne sur les événements
ALTER TABLE planning_events
DROP COLUMN IF EXISTS event_type_id;

-- Étape 6: Activer la sécurité RLS
ALTER TABLE planning_event_types ENABLE ROW LEVEL SECURITY;

-- Étape 7: Définir les politiques de sécurité (RLS) de manière idempotente
DROP POLICY IF EXISTS "Admins can manage event types" ON planning_event_types;
DROP POLICY IF EXISTS "Authenticated users can view event types" ON planning_event_types;

-- Les administrateurs peuvent tout gérer
CREATE POLICY "Admins can manage event types"
  ON planning_event_types
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Les utilisateurs authentifiés peuvent lire les types
CREATE POLICY "Authenticated users can view event types"
  ON planning_event_types
  FOR SELECT
  TO authenticated
  USING (true);

-- Index pour les performances
CREATE INDEX IF NOT EXISTS idx_planning_locations_event_type_id ON planning_locations(event_type_id);