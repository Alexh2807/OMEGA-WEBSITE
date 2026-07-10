/*
  # Réglages globaux du site (site_settings)

  Table clé/valeur pilotée depuis l'admin. Première clé : `site_mode`
  ({"vitrine": true|false}) — le MODE VITRINE désactive la vente en ligne
  (panier/paiement masqués, remplacés par devis + téléphone).

  Sécurité :
  - lecture PUBLIQUE (le front doit connaître le mode avant connexion) ;
  - écriture réservée aux ADMINS (profiles.role = 'admin').
*/

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

-- Mode par défaut : VITRINE ACTIVE (le site ne vend rien tant que l'admin ne l'ouvre pas)
INSERT INTO site_settings (key, value)
VALUES ('site_mode', '{"vitrine": true}'::jsonb)
ON CONFLICT (key) DO NOTHING;
