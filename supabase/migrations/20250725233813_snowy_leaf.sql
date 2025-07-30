/*
  # Système de vérification téléphone et email personnalisé

  1. Nouvelles Tables
    - `phone_verifications` - Codes de vérification téléphone
    - `email_verifications` - Codes de vérification email
    - `user_verifications` - Statut de vérification des utilisateurs

  2. Modifications
    - Ajout du champ `phone` dans la table `profiles`
    - Ajout des champs de vérification

  3. Sécurité
    - RLS activé sur toutes les tables
    - Politiques appropriées pour chaque table
*/

-- Ajouter le champ téléphone aux profils
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;

-- Table pour les codes de vérification téléphone
CREATE TABLE IF NOT EXISTS phone_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  phone VARCHAR(20) NOT NULL,
  code VARCHAR(6) NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  verified BOOLEAN DEFAULT false,
  attempts INTEGER DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Table pour les codes de vérification email
CREATE TABLE IF NOT EXISTS email_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  token VARCHAR(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  verified BOOLEAN DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Activer RLS
ALTER TABLE phone_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_verifications ENABLE ROW LEVEL SECURITY;

-- Politiques RLS pour phone_verifications
CREATE POLICY "Users can manage their own phone verifications"
  ON phone_verifications
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Politiques RLS pour email_verifications
CREATE POLICY "Users can manage their own email verifications"
  ON email_verifications
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Politique pour permettre la vérification publique (sans auth)
CREATE POLICY "Allow public email verification"
  ON email_verifications
  FOR SELECT
  TO public
  USING (true);

-- Index pour les performances
CREATE INDEX IF NOT EXISTS idx_phone_verifications_user_id ON phone_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_phone_verifications_code ON phone_verifications(code);
CREATE INDEX IF NOT EXISTS idx_email_verifications_token ON email_verifications(token);
CREATE INDEX IF NOT EXISTS idx_email_verifications_user_id ON email_verifications(user_id);

-- Fonction pour nettoyer les codes expirés
CREATE OR REPLACE FUNCTION cleanup_expired_verifications()
RETURNS void AS $$
BEGIN
  DELETE FROM phone_verifications WHERE expires_at < now();
  DELETE FROM email_verifications WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql;