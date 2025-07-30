/*
  # Mise à jour du système d'administration

  1. Corrections
    - Ajout des colonnes manquantes à contact_requests
    - Mise à jour des profils utilisateurs
    - Correction des données admin

  2. Sécurité
    - Politiques RLS mises à jour
    - Accès admin sécurisé
*/

-- Ajouter les colonnes manquantes à contact_requests si elles n'existent pas
DO $$ 
BEGIN
  -- Ajouter read_by_user si elle n'existe pas
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'contact_requests' AND column_name = 'read_by_user'
  ) THEN
    ALTER TABLE contact_requests ADD COLUMN read_by_user boolean DEFAULT false;
  END IF;

  -- Ajouter admin_response si elle n'existe pas
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'contact_requests' AND column_name = 'admin_response'
  ) THEN
    ALTER TABLE contact_requests ADD COLUMN admin_response text;
  END IF;

  -- Ajouter updated_at si elle n'existe pas
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'contact_requests' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE contact_requests ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Créer ou remplacer la fonction de mise à jour automatique
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Créer le trigger pour updated_at sur contact_requests
DROP TRIGGER IF EXISTS update_contact_requests_updated_at ON contact_requests;
CREATE TRIGGER update_contact_requests_updated_at
    BEFORE UPDATE ON contact_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Mettre à jour le profil admin principal
INSERT INTO profiles (id, first_name, last_name, role, updated_at)
SELECT 
  id,
  'Alexis',
  'HIDALGO',
  'admin',
  now()
FROM auth.users 
WHERE email = 'alexishidalgo34000@gmail.com'
ON CONFLICT (id) DO UPDATE SET
  first_name = 'Alexis',
  last_name = 'HIDALGO',
  role = 'admin',
  updated_at = now();

-- Politique RLS pour les admins sur toutes les tables
CREATE POLICY "Admins can manage everything" ON profiles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND auth.users.email = 'alexishidalgo34000@gmail.com'
    )
  );

-- Politique pour les contact_requests - admin peut tout voir
DROP POLICY IF EXISTS "Admins can manage all contact requests v2" ON contact_requests;
CREATE POLICY "Admins can manage all contact requests v2" ON contact_requests
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND auth.users.email = 'alexishidalgo34000@gmail.com'
    )
  );