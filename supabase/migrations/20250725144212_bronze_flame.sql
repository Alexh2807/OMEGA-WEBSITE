/*
  # Système d'administration complet - Base de données

  1. Nouvelles tables
    - `admin_logs` - Logs d'activité admin
    - `product_variants` - Variantes de produits
    - `order_status_history` - Historique des statuts de commandes
    - `user_notes` - Notes admin sur les utilisateurs
    - `system_settings` - Paramètres système

  2. Améliorations des tables existantes
    - Ajout de colonnes pour la gestion avancée
    - Index pour les performances
    - Contraintes de sécurité

  3. Fonctions et triggers
    - Logs automatiques
    - Validation des données
    - Calculs automatiques
*/

-- Table des logs d'activité admin
CREATE TABLE IF NOT EXISTS admin_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text NOT NULL, -- 'user', 'product', 'order', 'message'
  target_id uuid,
  details jsonb DEFAULT '{}',
  ip_address inet,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- Table des variantes de produits
CREATE TABLE IF NOT EXISTS product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  name text NOT NULL,
  sku text UNIQUE,
  price numeric(10,2),
  price_ht numeric(10,2),
  stock_quantity integer DEFAULT 0,
  weight numeric(8,2),
  dimensions jsonb, -- {width, height, depth}
  attributes jsonb DEFAULT '{}', -- couleur, taille, etc.
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Table des notes admin sur les utilisateurs
CREATE TABLE IF NOT EXISTS user_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text NOT NULL,
  is_important boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Table des paramètres système
CREATE TABLE IF NOT EXISTS system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL,
  description text,
  category text DEFAULT 'general',
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz DEFAULT now()
);

-- Amélioration de la table products
DO $$
BEGIN
  -- Ajouter des colonnes si elles n'existent pas
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'weight') THEN
    ALTER TABLE products ADD COLUMN weight numeric(8,2);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'dimensions') THEN
    ALTER TABLE products ADD COLUMN dimensions jsonb;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'tags') THEN
    ALTER TABLE products ADD COLUMN tags text[];
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_featured') THEN
    ALTER TABLE products ADD COLUMN is_featured boolean DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'meta_title') THEN
    ALTER TABLE products ADD COLUMN meta_title text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'meta_description') THEN
    ALTER TABLE products ADD COLUMN meta_description text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'updated_at') THEN
    ALTER TABLE products ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Amélioration de la table orders
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'notes') THEN
    ALTER TABLE orders ADD COLUMN notes text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'priority') THEN
    ALTER TABLE orders ADD COLUMN priority text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent'));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'estimated_delivery') THEN
    ALTER TABLE orders ADD COLUMN estimated_delivery date;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'updated_at') THEN
    ALTER TABLE orders ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Amélioration de la table profiles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'birth_date') THEN
    ALTER TABLE profiles ADD COLUMN birth_date date;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'gender') THEN
    ALTER TABLE profiles ADD COLUMN gender text CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say'));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'preferences') THEN
    ALTER TABLE profiles ADD COLUMN preferences jsonb DEFAULT '{}';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'is_active') THEN
    ALTER TABLE profiles ADD COLUMN is_active boolean DEFAULT true;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'last_login') THEN
    ALTER TABLE profiles ADD COLUMN last_login timestamptz;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'total_orders') THEN
    ALTER TABLE profiles ADD COLUMN total_orders integer DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'total_spent') THEN
    ALTER TABLE profiles ADD COLUMN total_spent numeric(10,2) DEFAULT 0;
  END IF;
END $$;

-- Amélioration de la table contact_requests
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contact_requests' AND column_name = 'priority') THEN
    ALTER TABLE contact_requests ADD COLUMN priority text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent'));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contact_requests' AND column_name = 'assigned_to') THEN
    ALTER TABLE contact_requests ADD COLUMN assigned_to uuid REFERENCES auth.users(id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contact_requests' AND column_name = 'tags') THEN
    ALTER TABLE contact_requests ADD COLUMN tags text[];
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contact_requests' AND column_name = 'source') THEN
    ALTER TABLE contact_requests ADD COLUMN source text DEFAULT 'website';
  END IF;
END $$;

-- Index pour les performances
CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_id ON admin_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON admin_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_action ON admin_logs(action);
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_user_notes_user_id ON user_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_products_is_featured ON products(is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_products_tags ON products USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_orders_priority ON orders(priority);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_contact_requests_priority ON contact_requests(priority);
CREATE INDEX IF NOT EXISTS idx_contact_requests_assigned_to ON contact_requests(assigned_to);

-- Fonction pour logger les actions admin
CREATE OR REPLACE FUNCTION log_admin_action(
  p_admin_id uuid,
  p_action text,
  p_target_type text,
  p_target_id uuid DEFAULT NULL,
  p_details jsonb DEFAULT '{}'
) RETURNS void AS $$
BEGIN
  INSERT INTO admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (p_admin_id, p_action, p_target_type, p_target_id, p_details);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction pour mettre à jour les statistiques utilisateur
CREATE OR REPLACE FUNCTION update_user_stats() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE profiles SET
      total_orders = (
        SELECT COUNT(*) FROM orders WHERE user_id = NEW.user_id
      ),
      total_spent = (
        SELECT COALESCE(SUM(total), 0) FROM orders 
        WHERE user_id = NEW.user_id AND status IN ('confirmed', 'shipped', 'delivered')
      )
    WHERE id = NEW.user_id;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour mettre à jour les stats utilisateur
DROP TRIGGER IF EXISTS update_user_stats_trigger ON orders;
CREATE TRIGGER update_user_stats_trigger
  AFTER INSERT OR UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_user_stats();

-- Fonction pour mettre à jour updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers pour updated_at
DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS pour les nouvelles tables
ALTER TABLE admin_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- Policies pour admin_logs
CREATE POLICY "Admins can view all logs" ON admin_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Policies pour product_variants
CREATE POLICY "Public can view active variants" ON product_variants
  FOR SELECT TO public
  USING (is_active = true);

CREATE POLICY "Admins can manage variants" ON product_variants
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Policies pour user_notes
CREATE POLICY "Admins can manage user notes" ON user_notes
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Policies pour system_settings
CREATE POLICY "Admins can manage settings" ON system_settings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Insérer des paramètres système par défaut
INSERT INTO system_settings (key, value, description, category) VALUES
  ('site_name', '"OMEGA"', 'Nom du site', 'general'),
  ('site_description', '"Fabricant français de machines à fumée professionnelles"', 'Description du site', 'general'),
  ('contact_email', '"contact@captivision.fr"', 'Email de contact principal', 'contact'),
  ('contact_phone', '"+33 6 19 91 87 19"', 'Téléphone de contact', 'contact'),
  ('shipping_cost', '0', 'Coût de livraison par défaut', 'shipping'),
  ('free_shipping_threshold', '100', 'Seuil de livraison gratuite', 'shipping'),
  ('tax_rate', '0.20', 'Taux de TVA', 'tax'),
  ('currency', '"EUR"', 'Devise par défaut', 'general'),
  ('maintenance_mode', 'false', 'Mode maintenance', 'system'),
  ('max_file_size', '10485760', 'Taille max des fichiers (10MB)', 'system')
ON CONFLICT (key) DO NOTHING;