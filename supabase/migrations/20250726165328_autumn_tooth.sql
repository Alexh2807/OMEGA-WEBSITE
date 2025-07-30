/*
  # Fonction pour récupérer l'email d'un utilisateur

  1. Nouvelle fonction
    - `get_user_email(user_uuid)` : Récupère l'email depuis auth.users
  
  2. Sécurité
    - Accessible uniquement aux administrateurs
    - Retourne l'email ou NULL si pas trouvé
*/

-- Fonction pour récupérer l'email d'un utilisateur (admin uniquement)
CREATE OR REPLACE FUNCTION get_user_email(user_uuid UUID)
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
AS $$
  SELECT au.email
  FROM auth.users au
  WHERE au.id = user_uuid
  AND (
    -- Vérifier si l'utilisateur actuel est admin
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    OR 
    -- Ou si c'est un admin par email
    (SELECT auth.jwt() ->> 'email') = 'alexishidalgo34000@gmail.com'
  );
$$;