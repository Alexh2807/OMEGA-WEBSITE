/*
  # Système d'adresses de livraison

  1. Nouvelles Tables
    - `shipping_addresses`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key)
      - `name` (text) - Nom de l'adresse (ex: "Domicile", "Bureau")
      - `first_name` (text)
      - `last_name` (text)
      - `company` (text, optionnel)
      - `address_line_1` (text)
      - `address_line_2` (text, optionnel)
      - `city` (text)
      - `postal_code` (text)
      - `country` (text)
      - `phone` (text, optionnel)
      - `is_default` (boolean)
      - `created_at` (timestamp)

  2. Modifications
    - Mise à jour de la table `orders` pour inclure l'adresse de livraison complète
    - Ajout de colonnes pour les prix HT/TTC

  3. Sécurité
    - Enable RLS sur `shipping_addresses`
    - Politiques pour que les utilisateurs ne voient que leurs adresses
*/

-- Créer la table des adresses de livraison
CREATE TABLE IF NOT EXISTS shipping_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL DEFAULT 'Adresse principale',
  first_name text NOT NULL,
  last_name text NOT NULL,
  company text,
  address_line_1 text NOT NULL,
  address_line_2 text,
  city text NOT NULL,
  postal_code text NOT NULL,
  country text NOT NULL DEFAULT 'France',
  phone text,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE shipping_addresses ENABLE ROW LEVEL SECURITY;

-- Politiques RLS pour les adresses
CREATE POLICY "Users can manage their own shipping addresses"
  ON shipping_addresses
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Fonction pour s'assurer qu'il n'y a qu'une seule adresse par défaut par utilisateur
CREATE OR REPLACE FUNCTION ensure_single_default_address()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE shipping_addresses 
    SET is_default = false 
    WHERE user_id = NEW.user_id AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour la fonction
DROP TRIGGER IF EXISTS ensure_single_default_address_trigger ON shipping_addresses;
CREATE TRIGGER ensure_single_default_address_trigger
  BEFORE INSERT OR UPDATE ON shipping_addresses
  FOR EACH ROW
  EXECUTE FUNCTION ensure_single_default_address();

-- Ajouter des colonnes pour les prix HT/TTC dans les commandes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'price_ht'
  ) THEN
    ALTER TABLE orders ADD COLUMN price_ht numeric(10,2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'price_ttc'
  ) THEN
    ALTER TABLE orders ADD COLUMN price_ttc numeric(10,2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'user_type'
  ) THEN
    ALTER TABLE orders ADD COLUMN user_type text DEFAULT 'particulier';
  END IF;
END $$;

-- Ajouter des colonnes pour les prix HT/TTC dans les produits
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'price_ht'
  ) THEN
    ALTER TABLE products ADD COLUMN price_ht numeric(10,2);
  END IF;

  -- Calculer le prix HT pour les produits existants (prix actuel = TTC)
  UPDATE products 
  SET price_ht = ROUND(price / 1.20, 2)
  WHERE price_ht IS NULL;
END $$;