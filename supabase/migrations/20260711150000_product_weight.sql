/*
  # Livraison v2 : poids par produit

  `products.weight_kg` : poids unitaire (kg) utilisé par le barème colis
  (tranches de poids réglables dans Admin → Paramètres → Livraison).
  NULL = poids par défaut de la config (default_weight_kg, 1 kg).

  Le gabarit `shipping_class` existant prend le sens :
    'small' = colis (tarifé au poids total)
    'large' = palette / encombrant (tarifé par unité selon la zone)
*/

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS weight_kg numeric;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_weight_kg_check'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_weight_kg_check
      CHECK (weight_kg IS NULL OR weight_kg >= 0);
  END IF;
END $$;
