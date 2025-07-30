/*
  # Ajouter système de messages pour les commandes

  1. Nouvelles colonnes
    - `admin_notes` (text) - Messages personnalisés de l'admin
    - `status_history` (jsonb) - Historique des changements de statut
    - `last_updated_by` (uuid) - Qui a fait la dernière modification

  2. Sécurité
    - Politiques RLS pour permettre aux admins de modifier
    - Politique pour que les clients voient leurs messages
*/

-- Ajouter les nouvelles colonnes à la table orders
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS admin_notes text,
ADD COLUMN IF NOT EXISTS status_history jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS last_updated_by uuid REFERENCES auth.users(id);

-- Mettre à jour les politiques RLS pour orders
DROP POLICY IF EXISTS "Admins can manage all orders." ON orders;
DROP POLICY IF EXISTS "Users can view their own orders." ON orders;
DROP POLICY IF EXISTS "Users can insert their own orders." ON orders;

-- Politique pour que les admins puissent tout faire
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

-- Politique pour que les utilisateurs voient leurs commandes
CREATE POLICY "Users can view their own orders"
  ON orders
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Politique pour que les utilisateurs créent leurs commandes
CREATE POLICY "Users can insert their own orders"
  ON orders
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);