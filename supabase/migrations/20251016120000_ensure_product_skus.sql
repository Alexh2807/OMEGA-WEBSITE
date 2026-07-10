-- Ensure products have SKU values for detail pages
-- This migration adds SKU values to products that need them

-- Update products to add SKU if they don't have one
UPDATE products
SET sku = 'LIQ-MOUSSE-10L'
WHERE (name ILIKE '%liquide%mousse%' OR name ILIKE '%mousse%10L%' OR name ILIKE '%omega%mousse%')
  AND (sku IS NULL OR sku = '');

UPDATE products
SET sku = 'HAZER-CO2-MINI'
WHERE (name ILIKE '%mini%hazer%co2%' OR name ILIKE '%pro%hazer%co2%' OR name ILIKE '%hazer%co2%mini%')
  AND (sku IS NULL OR sku = '');

UPDATE products
SET sku = 'LIQ-HAZER-5L'
WHERE (name ILIKE '%liquide%hazer%' OR name ILIKE '%hazer%premium%5L%')
  AND (sku IS NULL OR sku = '');

-- Display updated products
SELECT id, name, sku FROM products WHERE sku IN ('LIQ-MOUSSE-10L', 'HAZER-CO2-MINI', 'LIQ-HAZER-5L');
