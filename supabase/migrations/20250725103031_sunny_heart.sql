/*
  # Créer le produit PRO HAZER CO²

  1. Nouvelles données
    - Catégorie "Machines" si elle n'existe pas
    - Produit "PRO HAZER CO²" avec toutes ses spécifications

  2. Sécurité
    - Utilise les politiques RLS existantes
*/

-- Créer la catégorie Machines si elle n'existe pas
INSERT INTO categories (name) 
VALUES ('Machines')
ON CONFLICT (name) DO NOTHING;

-- Créer le produit PRO HAZER CO²
INSERT INTO products (
  name,
  description,
  long_description,
  price,
  original_price,
  image,
  category_id,
  in_stock,
  stock_quantity,
  sku,
  specifications
) VALUES (
  'PRO HAZER CO²',
  'Générateur de brume professionnel ultime',
  'Le générateur de brume ultime pour les utilisateurs les plus exigeants. Une fabrication sans aucun compromis sur la qualité et la fiabilité. Particules ultra-fines de 0,2-0,3 microns avec une suspension de 3-4 heures en salle.',
  2499.00,
  2999.00,
  '/Hazer-co2-generated.png',
  (SELECT id FROM categories WHERE name = 'Machines' LIMIT 1),
  true,
  5,
  'HAZER-CO2-PRO',
  '{
    "taille_particules": "0,2 - 0,3 microns",
    "temps_suspension": "3 - 4 heures en salle",
    "efficacite_liquide": "1L = 40h de brume",
    "consommation_co2": "1,5-2kg pour 8h continu",
    "consommation_liquide": "0,2L pour 8h continu",
    "controle_temperature": "PID numérique microprocesseur",
    "classification": "IP 65",
    "garantie": "10 ans pièces et main d''œuvre",
    "fabrication": "Europe - Norme ISO 9001"
  }'::jsonb
)
ON CONFLICT (sku) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  long_description = EXCLUDED.long_description,
  price = EXCLUDED.price,
  original_price = EXCLUDED.original_price,
  image = EXCLUDED.image,
  specifications = EXCLUDED.specifications;