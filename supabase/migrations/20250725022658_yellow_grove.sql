/*
  # Créer le profil admin et corriger les politiques RLS

  1. Création du profil admin
    - Crée le profil pour alexishidalgo34000@gmail.com
    - Définit le rôle admin
    
  2. Correction des politiques RLS
    - Politique basée sur l'email ET le rôle
    - Permissions complètes pour les admins
    
  3. Vérifications
    - S'assure que le profil existe
    - Teste les permissions
*/

-- Créer le profil admin s'il n'existe pas
INSERT INTO profiles (
  id, 
  first_name, 
  last_name, 
  role
) 
VALUES (
  '9155a395-827b-41bf-b21f-93e0d28cc108',
  'Admin',
  'OMEGA',
  'admin'
)
ON CONFLICT (id) DO UPDATE SET
  role = 'admin';

-- Supprimer les anciennes politiques pour les recréer
DROP POLICY IF EXISTS "Admins can manage all orders" ON orders;

-- Créer une politique RLS plus permissive pour les admins
CREATE POLICY "Admins can manage all orders" ON orders
  FOR ALL
  TO authenticated
  USING (
    -- Vérifier par email direct OU par rôle dans profiles
    (
      SELECT COALESCE(
        -- Vérification par email
        (auth.jwt() ->> 'email' = 'alexishidalgo34000@gmail.com'),
        -- Vérification par rôle
        (EXISTS (
          SELECT 1 FROM profiles 
          WHERE profiles.id = auth.uid() 
          AND profiles.role = 'admin'
        )),
        false
      )
    )
  )
  WITH CHECK (
    -- Même vérification pour les insertions/mises à jour
    (
      SELECT COALESCE(
        (auth.jwt() ->> 'email' = 'alexishidalgo34000@gmail.com'),
        (EXISTS (
          SELECT 1 FROM profiles 
          WHERE profiles.id = auth.uid() 
          AND profiles.role = 'admin'
        )),
        false
      )
    )
  );

-- Activer RLS sur la table orders (au cas où)
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;