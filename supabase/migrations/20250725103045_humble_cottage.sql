/*
  # Créer des produits d'exemple OMEGA

  1. Nouvelles données
    - Catégories : Liquides, Accessoires, Machines
    - Produits d'exemple pour chaque catégorie

  2. Structure
    - Produits avec images, prix, descriptions
    - Spécifications techniques en JSON
*/

-- Créer les catégories
INSERT INTO categories (name) VALUES 
  ('Liquides'),
  ('Accessoires'),
  ('Machines')
ON CONFLICT (name) DO NOTHING;

-- Produits Liquides
INSERT INTO products (
  name, description, long_description, price, image, 
  category_id, stock_quantity, sku, specifications
) VALUES 
(
  'Liquide Hazer Premium 5L',
  'Liquide haute qualité pour machines Hazer CO²',
  'Liquide spécialement formulé pour nos machines Hazer CO². Base huile alimentaire, sans résidu, particules ultra-fines. Rendement exceptionnel : 1 litre = 40h de brume continue.',
  89.90,
  'https://images.pexels.com/photos/1181467/pexels-photo-1181467.jpeg',
  (SELECT id FROM categories WHERE name = 'Liquides'),
  25,
  'LIQ-HAZER-5L',
  '{"volume": "5 litres", "base": "huile alimentaire", "rendement": "40h par litre", "particules": "0.2-0.3 microns"}'::jsonb
),
(
  'Liquide Mousse Biodégradable 10L',
  'Liquide mousse écologique pour soirées mousse',
  'Formule exclusive OMEGA 100% biodégradable. Mousse dense et persistante, sans danger pour la peau. Parfait pour les soirées mousse en intérieur et extérieur.',
  129.90,
  'https://images.pexels.com/photos/1181467/pexels-photo-1181467.jpeg',
  (SELECT id FROM categories WHERE name = 'Liquides'),
  15,
  'LIQ-MOUSSE-10L',
  '{"volume": "10 litres", "type": "biodégradable", "usage": "soirées mousse", "persistance": "longue durée"}'::jsonb
);

-- Produits Accessoires
INSERT INTO products (
  name, description, long_description, price, image,
  category_id, stock_quantity, sku, specifications
) VALUES
(
  'Télécommande Sans Fil DMX',
  'Télécommande professionnelle pour machines Hazer',
  'Télécommande sans fil haute précision avec contrôle DMX 0-100%. Portée 100m, écran LCD, batterie rechargeable. Compatible avec toutes nos machines Hazer CO².',
  199.90,
  'https://images.pexels.com/photos/1181467/pexels-photo-1181467.jpeg',
  (SELECT id FROM categories WHERE name = 'Accessoires'),
  10,
  'ACC-REMOTE-DMX',
  '{"portee": "100m", "controle": "DMX 0-100%", "ecran": "LCD", "batterie": "rechargeable"}'::jsonb
),
(
  'Réservoir Spécial 5L',
  'Réservoir de liquide haute capacité',
  'Réservoir spécialement conçu pour nos machines Hazer CO². Capacité 5 litres, indicateur de niveau, raccords rapides. Permet une autonomie prolongée.',
  149.90,
  'https://images.pexels.com/photos/1181467/pexels-photo-1181467.jpeg',
  (SELECT id FROM categories WHERE name = 'Accessoires'),
  8,
  'ACC-RESERVOIR-5L',
  '{"capacite": "5 litres", "indicateur": "niveau visible", "raccords": "rapides", "autonomie": "prolongée"}'::jsonb
);

-- Machine supplémentaire
INSERT INTO products (
  name, description, long_description, price, original_price, image,
  category_id, stock_quantity, sku, specifications
) VALUES
(
  'MINI HAZER CO²',
  'Version compacte du générateur de brume',
  'Version compacte de notre célèbre PRO HAZER CO². Idéal pour les petites salles et événements intimes. Même qualité de brume, format réduit.',
  1299.90,
  1499.90,
  '/Hazer-co2-generated.png',
  (SELECT id FROM categories WHERE name = 'Machines'),
  3,
  'HAZER-CO2-MINI',
  '{"taille_particules": "0,2 - 0,3 microns", "temps_suspension": "2 - 3 heures", "efficacite_liquide": "1L = 30h de brume", "format": "compact", "garantie": "5 ans"}'::jsonb
);