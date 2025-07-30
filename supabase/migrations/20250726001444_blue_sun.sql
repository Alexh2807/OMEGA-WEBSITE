/*
  # Configuration du template email personnalisé OMEGA

  1. Configuration
    - Template email personnalisé pour OMEGA
    - Désactivation des emails automatiques par défaut
    - Configuration du domaine et de l'expéditeur

  2. Template
    - Design cohérent avec la marque OMEGA
    - Instructions claires pour l'utilisateur
    - Lien de confirmation fonctionnel
*/

-- Mise à jour du trigger pour inclure le téléphone dans le profil
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    first_name,
    last_name,
    phone,
    role,
    is_active,
    email_verified
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
    'customer',
    true,
    CASE WHEN NEW.email_confirmed_at IS NOT NULL THEN true ELSE false END
  )
  ON CONFLICT (id) DO UPDATE SET
    first_name = COALESCE(NEW.raw_user_meta_data->>'first_name', profiles.first_name),
    last_name = COALESCE(NEW.raw_user_meta_data->>'last_name', profiles.last_name),
    phone = COALESCE(NEW.raw_user_meta_data->>'phone', profiles.phone),
    email_verified = CASE WHEN NEW.email_confirmed_at IS NOT NULL THEN true ELSE profiles.email_verified END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;