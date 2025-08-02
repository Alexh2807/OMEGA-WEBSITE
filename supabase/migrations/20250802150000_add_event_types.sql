/*
  # Ajout des types d'événements pour le planning

  1. Nouvelle Table
    - `planning_event_types`
      - `id` (uuid, primary key)
      - `name` (text, non null, unique)
      - `created_at` (timestamp)

  2. Modification de `planning_events`
    - Ajout de `event_type_id` (uuid, foreign key vers `planning_event_types`)

  3. Données initiales
    - Insertion des types de soirées demandés

  4. Sécurité
    - Activation de RLS et ajout des politiques nécessaires
*/

-- Étape 1: Créer la table pour les types d'événements
CREATE TABLE IF NOT EXISTS planning_event_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

-- Étape 2: Insérer les types de soirées par défaut (ignore les conflits si déjà existants)
INSERT INTO planning_event_types (name) VALUES
  ('Camping'),
  ('Fete de village'),
  ('Mousse'),
  ('Pool Party (Journée)'),
  ('Pool Party (Nuit)')
ON CONFLICT (name) DO NOTHING;

-- Étape 3: Ajouter la colonne de liaison à la table des événements
ALTER TABLE planning_events
ADD COLUMN IF NOT EXISTS event_type_id uuid REFERENCES planning_event_types(id) ON DELETE SET NULL;

-- Étape 4: Activer la sécurité RLS sur la nouvelle table
ALTER TABLE planning_event_types ENABLE ROW LEVEL SECURITY;

-- Étape 5: Définir les politiques de sécurité (RLS Policies)

-- Les administrateurs peuvent gérer (créer, lire, mettre à jour, supprimer) les types d'événements
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

-- Tous les utilisateurs authentifiés peuvent lire la liste des types d'événements
CREATE POLICY "Authenticated users can view event types"
  ON planning_event_types
  FOR SELECT
  TO authenticated
  USING (true);

-- Index pour améliorer les performances des requêtes
CREATE INDEX IF NOT EXISTS idx_planning_events_event_type_id ON planning_events(event_type_id);