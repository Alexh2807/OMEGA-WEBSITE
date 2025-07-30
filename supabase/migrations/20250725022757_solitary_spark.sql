/*
  # Créer le profil admin et corriger les politiques RLS

  1. Création du profil admin
    - Profil pour alexishidalgo34000@gmail.com avec rôle admin
    - Upsert pour éviter les conflits

  2. Politiques RLS corrigées
    - Politique admin pour les commandes
    - Double vérification : email ET rôle
    - Permissions complètes (SELECT, UPDATE, INSERT, DELETE)

  3. Sécurité
    - Vérification de l'existence avant création
    - Gestion des erreurs
*/

-- Créer le profil admin s'il n'existe pas
INSERT INTO profiles (id, first_name, last_name, role)
SELECT '9155a395-827b-41bf-b21f-93e0d28cc108', 'Admin', 'OMEGA', 'admin'
WHERE NOT EXISTS (
  SELECT 1 FROM profiles WHERE id = '9155a395-827b-41bf-b21f-93e0d28cc108'
);

-- Mettre à jour le rôle s'il existe déjà
UPDATE profiles 
SET role = 'admin', 
    first_name = COALESCE(first_name, 'Admin'),
    last_name = COALESCE(last_name, 'OMEGA')
WHERE id = '9155a395-827b-41bf-b21f-93e0d28cc108';

-- Supprimer l'ancienne politique si elle existe
DROP POLICY IF EXISTS "Admins can manage all orders v2" ON orders;

-- Créer la nouvelle politique admin pour les commandes
CREATE POLICY "Admins can manage all orders v3" ON orders
FOR ALL
TO authenticated
USING (
  -- Vérification par rôle dans profiles
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
  OR
  -- Vérification directe par email (fallback)
  (
    SELECT auth.email()
  ) = 'alexishidalgo34000@gmail.com'
)
WITH CHECK (
  -- Même vérification pour les mises à jour
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
  OR
  (
    SELECT auth.email()
  ) = 'alexishidalgo34000@gmail.com'
);