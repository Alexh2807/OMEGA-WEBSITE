/*
  # Ajouter les colonnes manquantes à contact_requests

  1. Nouvelles colonnes
    - `read_by_user` (boolean) - Indique si le message a été lu par l'utilisateur
    - `updated_at` (timestamp) - Date de dernière modification
    - `admin_response` (text) - Réponse de l'administrateur

  2. Valeurs par défaut
    - `read_by_user` : false (non lu par défaut)
    - `updated_at` : now() (date actuelle)
    - `admin_response` : null (pas de réponse par défaut)
*/

-- Ajouter la colonne read_by_user si elle n'existe pas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contact_requests' AND column_name = 'read_by_user'
  ) THEN
    ALTER TABLE contact_requests ADD COLUMN read_by_user boolean DEFAULT false;
  END IF;
END $$;

-- Ajouter la colonne updated_at si elle n'existe pas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contact_requests' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE contact_requests ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Ajouter la colonne admin_response si elle n'existe pas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contact_requests' AND column_name = 'admin_response'
  ) THEN
    ALTER TABLE contact_requests ADD COLUMN admin_response text;
  END IF;
END $$;

-- Créer une fonction pour mettre à jour automatiquement updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Créer le trigger pour mettre à jour automatiquement updated_at
DROP TRIGGER IF EXISTS update_contact_requests_updated_at ON contact_requests;
CREATE TRIGGER update_contact_requests_updated_at
    BEFORE UPDATE ON contact_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();