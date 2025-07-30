/*
  # Créer la table des demandes de contact

  1. Nouvelle Table
    - `contact_requests`
      - `id` (uuid, clé primaire)
      - `name` (text, nom du demandeur)
      - `email` (text, email du demandeur)
      - `phone` (text, téléphone optionnel)
      - `company` (text, entreprise optionnelle)
      - `subject` (text, sujet de la demande)
      - `message` (text, message détaillé)
      - `type` (text, type de demande: general, demo, quote)
      - `user_id` (uuid, référence utilisateur si connecté)
      - `status` (text, statut: pending, in_progress, resolved)
      - `created_at` (timestamp)

  2. Sécurité
    - Activer RLS sur la table `contact_requests`
    - Politique pour permettre l'insertion par tous
    - Politique pour permettre la lecture par les admins
*/

CREATE TABLE IF NOT EXISTS contact_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  company text,
  subject text NOT NULL,
  message text NOT NULL,
  type text DEFAULT 'general' CHECK (type IN ('general', 'demo', 'quote')),
  user_id uuid REFERENCES auth.users(id),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE contact_requests ENABLE ROW LEVEL SECURITY;

-- Politique pour permettre à tous d'insérer des demandes de contact
CREATE POLICY "Anyone can submit contact requests"
  ON contact_requests
  FOR INSERT
  TO public
  WITH CHECK (true);

-- Politique pour permettre aux admins de voir toutes les demandes
CREATE POLICY "Admins can view all contact requests"
  ON contact_requests
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND (auth.users.raw_user_meta_data->>'role') = 'admin'
    )
  );

-- Politique pour permettre aux utilisateurs de voir leurs propres demandes
CREATE POLICY "Users can view their own contact requests"
  ON contact_requests
  FOR SELECT
  TO public
  USING (auth.uid() = user_id);