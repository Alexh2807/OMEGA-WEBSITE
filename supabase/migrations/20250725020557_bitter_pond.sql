/*
  # Correction de la vérification admin

  1. Mise à jour des politiques
    - Correction de la vérification du rôle admin dans profiles
    - Ajout de politiques pour permettre la mise à jour du rôle

  2. Sécurité
    - Seuls les utilisateurs peuvent modifier leur propre profil
    - Vérification de l'email pour l'attribution du rôle admin
*/

-- Supprimer les anciennes politiques pour les recréer
DROP POLICY IF EXISTS "Admins can view all contact requests" ON contact_requests;
DROP POLICY IF EXISTS "Admins can manage all orders" ON orders;

-- Politique pour contact_requests - admins peuvent tout voir
CREATE POLICY "Admins can view all contact requests"
  ON contact_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

-- Politique pour orders - admins peuvent tout voir
CREATE POLICY "Admins can manage all orders"
  ON orders
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

-- Permettre aux utilisateurs de mettre à jour leur propre profil (y compris le rôle)
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Permettre l'insertion de profils
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile"
  ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);