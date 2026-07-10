/*
  # Livraison (gabarits + tarifs) et décrément de stock

  1. `products.shipping_class` : gabarit d'expédition par produit
     - 'small' (petit colis, forfait) — défaut
     - 'large' (gros produit, livraison spécialisée tarifée à la distance)
  2. `orders.shipping_cost` / `orders.shipping_method` : frais réellement
     facturés et méthode retenue, enregistrés avec chaque commande.
  3. Décrément AUTOMATIQUE du stock : trigger AFTER INSERT sur `order_items`
     (corrige le P2 de l'audit du 20/06 — le stock n'était jamais décrémenté,
     risque de survente). Transactionnel avec l'insertion de la commande,
     impossible à oublier côté front.
  4. Tarifs de livraison par défaut dans `site_settings` (clé shipping_config),
     modifiables dans Admin → Paramètres → Livraison.
*/

-- 1) Gabarit d'expédition par produit
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS shipping_class text NOT NULL DEFAULT 'small';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_shipping_class_check'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_shipping_class_check
      CHECK (shipping_class IN ('small', 'large'));
  END IF;
END $$;

-- 2) Frais de livraison sur les commandes
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipping_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_method text;

-- 3) Décrément de stock à la création des lignes de commande
CREATE OR REPLACE FUNCTION decrement_stock_on_order_item()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE products
  SET stock_quantity = GREATEST(0, stock_quantity - NEW.quantity),
      in_stock = (GREATEST(0, stock_quantity - NEW.quantity) > 0)
  WHERE id = NEW.product_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_decrement_stock ON order_items;
CREATE TRIGGER trg_decrement_stock
  AFTER INSERT ON order_items
  FOR EACH ROW
  EXECUTE FUNCTION decrement_stock_on_order_item();

-- 4) Tarifs de livraison par défaut (ne remplace pas une config existante)
INSERT INTO site_settings (key, value)
VALUES (
  'shipping_config',
  '{
    "small_flat": 7.99,
    "large_near": 129,
    "large_far": 259,
    "near_departments": ["34", "11", "30", "81", "12", "66"],
    "delay_days": 7
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;
