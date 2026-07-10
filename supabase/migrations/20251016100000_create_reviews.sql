/*
  # Système d'avis produits

  1. Nouvelle table
    - `product_reviews` - Stocke tous les avis clients sur les produits
      - id (uuid, primary key)
      - product_id (uuid, foreign key vers products)
      - user_id (uuid, foreign key vers profiles)
      - order_id (uuid, foreign key vers orders) - Pour vérifier l'achat
      - rating (int 1-5)
      - title (text)
      - comment (text)
      - verified_purchase (boolean) - Achat vérifié
      - status (text) - pending, approved, rejected
      - admin_response (text, nullable)
      - helpful_count (int) - Nombre de "utile"
      - created_at (timestamptz)
      - updated_at (timestamptz)

  2. Sécurité
    - Enable RLS
    - Policies pour:
      - Les utilisateurs peuvent voir les avis approuvés
      - Les utilisateurs peuvent créer des avis sur leurs achats
      - Les admins peuvent tout gérer
*/

-- Créer la table product_reviews
CREATE TABLE IF NOT EXISTS product_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title TEXT NOT NULL,
  comment TEXT NOT NULL,
  verified_purchase BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_response TEXT,
  helpful_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour améliorer les performances
CREATE INDEX idx_reviews_product ON product_reviews(product_id);
CREATE INDEX idx_reviews_user ON product_reviews(user_id);
CREATE INDEX idx_reviews_status ON product_reviews(status);
CREATE INDEX idx_reviews_rating ON product_reviews(rating);

-- Enable RLS
ALTER TABLE product_reviews ENABLE ROW LEVEL SECURITY;

-- Policy : Tout le monde peut voir les avis approuvés
CREATE POLICY "Anyone can view approved reviews"
  ON product_reviews
  FOR SELECT
  TO public
  USING (status = 'approved');

-- Policy : Les utilisateurs peuvent voir leurs propres avis (même non approuvés)
CREATE POLICY "Users can view their own reviews"
  ON product_reviews
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy : Les utilisateurs authentifiés peuvent créer des avis
CREATE POLICY "Authenticated users can create reviews"
  ON product_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy : Les utilisateurs peuvent modifier leurs propres avis (seulement si pending)
CREATE POLICY "Users can update their own pending reviews"
  ON product_reviews
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND status = 'pending')
  WITH CHECK (auth.uid() = user_id);

-- Policy : Les utilisateurs peuvent supprimer leurs propres avis
CREATE POLICY "Users can delete their own reviews"
  ON product_reviews
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy : Les admins peuvent tout voir
CREATE POLICY "Admins can view all reviews"
  ON product_reviews
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Policy : Les admins peuvent tout modifier
CREATE POLICY "Admins can update all reviews"
  ON product_reviews
  FOR UPDATE
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

-- Policy : Les admins peuvent supprimer tous les avis
CREATE POLICY "Admins can delete all reviews"
  ON product_reviews
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Fonction pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_reviews_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour updated_at
CREATE TRIGGER set_reviews_updated_at
  BEFORE UPDATE ON product_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_reviews_updated_at();

-- Fonction pour calculer la note moyenne d'un produit
CREATE OR REPLACE FUNCTION get_product_average_rating(product_uuid UUID)
RETURNS NUMERIC AS $$
DECLARE
  avg_rating NUMERIC;
BEGIN
  SELECT ROUND(AVG(rating)::NUMERIC, 1)
  INTO avg_rating
  FROM product_reviews
  WHERE product_id = product_uuid
  AND status = 'approved';

  RETURN COALESCE(avg_rating, 0);
END;
$$ LANGUAGE plpgsql;

-- Fonction pour compter les avis d'un produit
CREATE OR REPLACE FUNCTION get_product_reviews_count(product_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
  reviews_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO reviews_count
  FROM product_reviews
  WHERE product_id = product_uuid
  AND status = 'approved';

  RETURN COALESCE(reviews_count, 0);
END;
$$ LANGUAGE plpgsql;
