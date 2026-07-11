/*
  ═══════════════════════════════════════════════════════════════════
  OMEGA — SQL CONSOLIDÉ À COLLER DANS LE SQL EDITOR SUPABASE (prod)
  https://supabase.com/dashboard/project/ebkxdndfcwowevvtoxhr/sql/new
  ═══════════════════════════════════════════════════════════════════
  Contenu (idempotent — ré-exécutable sans risque) :
    A) Migration site_settings (réglages du site + mode Vitrine)
    B) Migration livraison + décrément de stock
    C) OUVERTURE DE LA BOUTIQUE (vitrine = false → vente en ligne active)

  Équivalent CLI : npx supabase login
                   npx supabase link --project-ref ebkxdndfcwowevvtoxhr
                   npx supabase db push        (A + B, puis C à la main)
*/

-- ═════ A) site_settings ═════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS site_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site_settings_public_read" ON site_settings;
CREATE POLICY "site_settings_public_read"
  ON site_settings FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "site_settings_admin_insert" ON site_settings;
CREATE POLICY "site_settings_admin_insert"
  ON site_settings FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

DROP POLICY IF EXISTS "site_settings_admin_update" ON site_settings;
CREATE POLICY "site_settings_admin_update"
  ON site_settings FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

-- ═════ B) Livraison (gabarits + tarifs) et décrément de stock ═══════

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

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipping_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_method text;

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

-- Livraison v2 : poids par produit (barème colis au poids)
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

-- Tarifs par défaut (ne remplace pas une config déjà réglée dans l'admin ;
-- une ancienne config v1 est migrée automatiquement par le front)
INSERT INTO site_settings (key, value)
VALUES (
  'shipping_config',
  '{
    "parcel_brackets": [
      {"max_kg": 1, "price": 7.99},
      {"max_kg": 2, "price": 15.90},
      {"max_kg": 5, "price": 19.90},
      {"max_kg": 10, "price": 29.90},
      {"max_kg": 30, "price": 49.90}
    ],
    "parcel_over_price": 79.90,
    "parcel_europe_surcharge": 12,
    "default_weight_kg": 1,
    "pallet_zones": {
      "fr_0_200": 90,
      "fr_200_500": 140,
      "fr_far": 250,
      "europe": 280,
      "express_eu": 450
    },
    "near_km_max": 200,
    "mid_km_max": 500,
    "depot": {"lat": 43.43, "lng": 3.30, "label": "Montblanc (34290)"},
    "delay_days": 7
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- ═════ C) OUVERTURE DE LA BOUTIQUE (vente en ligne active) ══════════
-- (réversible à tout moment via Admin → Paramètres → Mode du site)

INSERT INTO site_settings (key, value, updated_at)
VALUES ('site_mode', '{"vitrine": false}'::jsonb, now())
ON CONFLICT (key) DO UPDATE
  SET value = '{"vitrine": false}'::jsonb, updated_at = now();

-- ═════ Vérification finale ══════════════════════════════════════════
SELECT key, value FROM site_settings ORDER BY key;
