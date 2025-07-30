/*
  # Système de Facturation OMEGA - Version Corrigée
  
  Ce script crée le système complet de facturation pour OMEGA en tenant compte
  de la structure existante de la base de données Supabase.
  
  1. Tables créées:
     - billing_settings: Paramètres de l'entreprise
     - quotes: Devis clients  
     - quote_items: Lignes de devis
     - invoices: Factures
     - invoice_items: Lignes de factures
     - payment_records: Enregistrements de paiements
     
  2. Fonctionnalités:
     - Numérotation automatique (DEV-0001, FACT-0001)
     - Calculs automatiques des totaux HT/TTC
     - Politiques de sécurité (admin uniquement)
     - Triggers pour mise à jour automatique
*/

-- ====================================
-- 1. FONCTIONS UTILITAIRES
-- ====================================

-- Fonction pour générer les numéros de devis
CREATE OR REPLACE FUNCTION generate_quote_number()
RETURNS TEXT AS $$
DECLARE
  settings_record RECORD;
  new_number INTEGER;
  quote_number TEXT;
BEGIN
  -- Récupérer les paramètres de facturation
  SELECT * INTO settings_record FROM billing_settings LIMIT 1;
  
  IF settings_record IS NULL THEN
    -- Paramètres par défaut si pas encore configurés
    new_number := 1;
    quote_number := 'DEV-0001';
  ELSE
    new_number := settings_record.next_quote_number;
    quote_number := settings_record.quote_prefix || '-' || LPAD(new_number::TEXT, 4, '0');
    
    -- Incrémenter pour la prochaine fois
    UPDATE billing_settings 
    SET next_quote_number = next_quote_number + 1,
        updated_at = NOW()
    WHERE id = settings_record.id;
  END IF;
  
  RETURN quote_number;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour générer les numéros de facture
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TEXT AS $$
DECLARE
  settings_record RECORD;
  new_number INTEGER;
  invoice_number TEXT;
BEGIN
  -- Récupérer les paramètres de facturation
  SELECT * INTO settings_record FROM billing_settings LIMIT 1;
  
  IF settings_record IS NULL THEN
    -- Paramètres par défaut si pas encore configurés
    new_number := 1;
    invoice_number := 'FACT-0001';
  ELSE
    new_number := settings_record.next_invoice_number;
    invoice_number := settings_record.invoice_prefix || '-' || LPAD(new_number::TEXT, 4, '0');
    
    -- Incrémenter pour la prochaine fois
    UPDATE billing_settings 
    SET next_invoice_number = next_invoice_number + 1,
        updated_at = NOW()
    WHERE id = settings_record.id;
  END IF;
  
  RETURN invoice_number;
END;
$$ LANGUAGE plpgsql;

-- ====================================
-- 2. TABLES PRINCIPALES
-- ====================================

-- Table des paramètres de facturation
CREATE TABLE IF NOT EXISTS billing_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL DEFAULT 'OMEGA',
  company_address text NOT NULL DEFAULT 'France',
  company_postal_code text NOT NULL DEFAULT '00000',
  company_city text NOT NULL DEFAULT 'Ville',
  company_country text NOT NULL DEFAULT 'France',
  company_phone text NOT NULL DEFAULT '+33 6 19 91 87 19',
  company_email text NOT NULL DEFAULT 'contact@captivision.fr',
  siret text DEFAULT '',
  vat_number text DEFAULT '',
  invoice_prefix text NOT NULL DEFAULT 'FACT',
  quote_prefix text NOT NULL DEFAULT 'DEV',
  next_invoice_number integer NOT NULL DEFAULT 1,
  next_quote_number integer NOT NULL DEFAULT 1,
  default_payment_terms integer NOT NULL DEFAULT 30,
  bank_details jsonb DEFAULT '{"iban": "", "bic": "", "bank_name": ""}',
  legal_mentions text DEFAULT 'Mentions légales OMEGA',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Table des devis
CREATE TABLE IF NOT EXISTS quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number text UNIQUE NOT NULL DEFAULT '',
  customer_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_phone text,
  customer_address jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired')),
  subtotal_ht numeric(10,2) NOT NULL DEFAULT 0,
  tax_amount numeric(10,2) NOT NULL DEFAULT 0,
  total_ttc numeric(10,2) NOT NULL DEFAULT 0,
  valid_until date,
  notes text,
  terms_conditions text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  sent_at timestamptz,
  accepted_at timestamptz
);

-- Table des lignes de devis
CREATE TABLE IF NOT EXISTS quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid REFERENCES quotes(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  description text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price_ht numeric(10,2) NOT NULL DEFAULT 0,
  tax_rate numeric(5,2) NOT NULL DEFAULT 20.00,
  total_ht numeric(10,2) NOT NULL DEFAULT 0,
  total_ttc numeric(10,2) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Table des factures
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text UNIQUE NOT NULL DEFAULT '',
  quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_phone text,
  customer_address jsonb,
  billing_address jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  subtotal_ht numeric(10,2) NOT NULL DEFAULT 0,
  tax_amount numeric(10,2) NOT NULL DEFAULT 0,
  total_ttc numeric(10,2) NOT NULL DEFAULT 0,
  amount_paid numeric(10,2) NOT NULL DEFAULT 0,
  due_date date,
  payment_terms integer NOT NULL DEFAULT 30,
  notes text,
  legal_mentions text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  sent_at timestamptz,
  paid_at timestamptz
);

-- Table des lignes de facture
CREATE TABLE IF NOT EXISTS invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES invoices(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  description text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price_ht numeric(10,2) NOT NULL DEFAULT 0,
  tax_rate numeric(5,2) NOT NULL DEFAULT 20.00,
  total_ht numeric(10,2) NOT NULL DEFAULT 0,
  total_ttc numeric(10,2) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Table des enregistrements de paiement
CREATE TABLE IF NOT EXISTS payment_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES invoices(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_method text NOT NULL DEFAULT 'virement' CHECK (payment_method IN ('virement', 'cheque', 'especes', 'carte', 'prelevement')),
  reference text,
  notes text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- ====================================
-- 3. TRIGGERS POUR NUMÉROTATION AUTO
-- ====================================

-- Fonction trigger pour les devis
CREATE OR REPLACE FUNCTION set_quote_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.quote_number IS NULL OR NEW.quote_number = '' THEN
    NEW.quote_number := generate_quote_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fonction trigger pour les factures  
CREATE OR REPLACE FUNCTION set_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    NEW.invoice_number := generate_invoice_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
DROP TRIGGER IF EXISTS set_quote_number_trigger ON quotes;
CREATE TRIGGER set_quote_number_trigger
  BEFORE INSERT ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION set_quote_number();

DROP TRIGGER IF EXISTS set_invoice_number_trigger ON invoices;
CREATE TRIGGER set_invoice_number_trigger
  BEFORE INSERT ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION set_invoice_number();

-- ====================================
-- 4. TRIGGERS POUR CALCULS AUTO
-- ====================================

-- Fonction pour recalculer les totaux de devis
CREATE OR REPLACE FUNCTION calculate_quote_totals()
RETURNS TRIGGER AS $$
DECLARE
  quote_record RECORD;
  total_ht numeric(10,2) := 0;
  total_tax numeric(10,2) := 0;
  total_ttc numeric(10,2) := 0;
BEGIN
  -- Calculer les nouveaux totaux
  SELECT 
    COALESCE(SUM(total_ht), 0) as sum_ht,
    COALESCE(SUM(total_ht * (tax_rate / 100)), 0) as sum_tax,
    COALESCE(SUM(total_ttc), 0) as sum_ttc
  INTO quote_record
  FROM quote_items 
  WHERE quote_id = COALESCE(NEW.quote_id, OLD.quote_id);
  
  -- Mettre à jour le devis
  UPDATE quotes 
  SET 
    subtotal_ht = quote_record.sum_ht,
    tax_amount = quote_record.sum_tax,
    total_ttc = quote_record.sum_ttc,
    updated_at = now()
  WHERE id = COALESCE(NEW.quote_id, OLD.quote_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Fonction pour recalculer les totaux de facture
CREATE OR REPLACE FUNCTION calculate_invoice_totals()
RETURNS TRIGGER AS $$
DECLARE
  invoice_record RECORD;
  total_ht numeric(10,2) := 0;
  total_tax numeric(10,2) := 0;
  total_ttc numeric(10,2) := 0;
BEGIN
  -- Calculer les nouveaux totaux
  SELECT 
    COALESCE(SUM(total_ht), 0) as sum_ht,
    COALESCE(SUM(total_ht * (tax_rate / 100)), 0) as sum_tax,
    COALESCE(SUM(total_ttc), 0) as sum_ttc
  INTO invoice_record
  FROM invoice_items 
  WHERE invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  
  -- Mettre à jour la facture
  UPDATE invoices 
  SET 
    subtotal_ht = invoice_record.sum_ht,
    tax_amount = invoice_record.sum_tax,
    total_ttc = invoice_record.sum_ttc,
    updated_at = now()
  WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Fonction pour calculer les totaux des lignes
CREATE OR REPLACE FUNCTION calculate_line_totals()
RETURNS TRIGGER AS $$
BEGIN
  NEW.total_ht := NEW.quantity * NEW.unit_price_ht;
  NEW.total_ttc := NEW.total_ht * (1 + NEW.tax_rate / 100);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers pour les calculs automatiques
DROP TRIGGER IF EXISTS calculate_quote_item_totals_trigger ON quote_items;
CREATE TRIGGER calculate_quote_item_totals_trigger
  BEFORE INSERT OR UPDATE ON quote_items
  FOR EACH ROW
  EXECUTE FUNCTION calculate_line_totals();

DROP TRIGGER IF EXISTS calculate_invoice_item_totals_trigger ON invoice_items;
CREATE TRIGGER calculate_invoice_item_totals_trigger
  BEFORE INSERT OR UPDATE ON invoice_items
  FOR EACH ROW
  EXECUTE FUNCTION calculate_line_totals();

DROP TRIGGER IF EXISTS update_quote_totals_trigger ON quote_items;
CREATE TRIGGER update_quote_totals_trigger
  AFTER INSERT OR UPDATE OR DELETE ON quote_items
  FOR EACH ROW
  EXECUTE FUNCTION calculate_quote_totals();

DROP TRIGGER IF EXISTS update_invoice_totals_trigger ON invoice_items;
CREATE TRIGGER update_invoice_totals_trigger
  AFTER INSERT OR UPDATE OR DELETE ON invoice_items
  FOR EACH ROW
  EXECUTE FUNCTION calculate_invoice_totals();

-- ====================================
-- 5. POLITIQUES DE SÉCURITÉ (RLS)
-- ====================================

-- Activer RLS sur toutes les tables
ALTER TABLE billing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_records ENABLE ROW LEVEL SECURITY;

-- Politique admin pour billing_settings
DROP POLICY IF EXISTS "Admins can manage billing settings" ON billing_settings;
CREATE POLICY "Admins can manage billing settings" ON billing_settings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
    OR
    (SELECT auth.jwt() ->> 'email') = 'alexishidalgo34000@gmail.com'
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
    OR
    (SELECT auth.jwt() ->> 'email') = 'alexishidalgo34000@gmail.com'
  );

-- Politique admin pour quotes
DROP POLICY IF EXISTS "Admins can manage quotes" ON quotes;
CREATE POLICY "Admins can manage quotes" ON quotes
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
    OR
    (SELECT auth.jwt() ->> 'email') = 'alexishidalgo34000@gmail.com'
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
    OR
    (SELECT auth.jwt() ->> 'email') = 'alexishidalgo34000@gmail.com'
  );

-- Politique admin pour quote_items
DROP POLICY IF EXISTS "Admins can manage quote items" ON quote_items;
CREATE POLICY "Admins can manage quote items" ON quote_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
    OR
    (SELECT auth.jwt() ->> 'email') = 'alexishidalgo34000@gmail.com'
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
    OR
    (SELECT auth.jwt() ->> 'email') = 'alexishidalgo34000@gmail.com'
  );

-- Politique admin pour invoices
DROP POLICY IF EXISTS "Admins can manage invoices" ON invoices;
CREATE POLICY "Admins can manage invoices" ON invoices
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
    OR
    (SELECT auth.jwt() ->> 'email') = 'alexishidalgo34000@gmail.com'
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
    OR
    (SELECT auth.jwt() ->> 'email') = 'alexishidalgo34000@gmail.com'
  );

-- Politique admin pour invoice_items
DROP POLICY IF EXISTS "Admins can manage invoice items" ON invoice_items;
CREATE POLICY "Admins can manage invoice items" ON invoice_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
    OR
    (SELECT auth.jwt() ->> 'email') = 'alexishidalgo34000@gmail.com'
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
    OR
    (SELECT auth.jwt() ->> 'email') = 'alexishidalgo34000@gmail.com'
  );

-- Politique admin pour payment_records
DROP POLICY IF EXISTS "Admins can manage payment records" ON payment_records;
CREATE POLICY "Admins can manage payment records" ON payment_records
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
    OR
    (SELECT auth.jwt() ->> 'email') = 'alexishidalgo34000@gmail.com'
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
    OR
    (SELECT auth.jwt() ->> 'email') = 'alexishidalgo34000@gmail.com'
  );

-- ====================================
-- 6. DONNÉES INITIALES
-- ====================================

-- Insérer les paramètres par défaut OMEGA (si pas déjà présents)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM billing_settings) THEN
    INSERT INTO billing_settings (
      company_name,
      company_address,
      company_postal_code,
      company_city,
      company_country,
      company_phone,
      company_email,
      invoice_prefix,
      quote_prefix,
      next_invoice_number,
      next_quote_number,
      default_payment_terms,
      legal_mentions
    ) VALUES (
      'OMEGA',
      'France',
      '00000',
      'Ville',
      'France',
      '+33 6 19 91 87 19',
      'contact@captivision.fr',
      'FACT',
      'DEV',
      1,
      1,
      30,
      'OMEGA - Fabricant français de machines à fumée professionnelles depuis 1996'
    );
    
    RAISE NOTICE '✅ Paramètres de facturation OMEGA créés';
  ELSE
    RAISE NOTICE '⚠️  Paramètres de facturation déjà existants';
  END IF;
END
$$;

-- ====================================
-- 7. INDEXES POUR PERFORMANCE
-- ====================================

CREATE INDEX IF NOT EXISTS idx_quotes_customer_id ON quotes(customer_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON quotes(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_quote_items_quote_id ON quote_items(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_product_id ON quote_items(product_id);

CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON invoices(order_id);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_product_id ON invoice_items(product_id);

CREATE INDEX IF NOT EXISTS idx_payment_records_invoice_id ON payment_records(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_records_payment_date ON payment_records(payment_date DESC);

-- ====================================
-- 8. VÉRIFICATION FINALE
-- ====================================

DO $$
DECLARE
  table_count INTEGER;
  function_count INTEGER;
  trigger_count INTEGER;
  policy_count INTEGER;
BEGIN
  -- Compter les tables créées
  SELECT COUNT(*) INTO table_count
  FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name IN ('billing_settings', 'quotes', 'quote_items', 'invoices', 'invoice_items', 'payment_records');
  
  -- Compter les fonctions créées
  SELECT COUNT(*) INTO function_count
  FROM information_schema.routines 
  WHERE routine_schema = 'public' 
  AND routine_name IN ('generate_quote_number', 'generate_invoice_number', 'set_quote_number', 'set_invoice_number', 'calculate_quote_totals', 'calculate_invoice_totals', 'calculate_line_totals');
  
  RAISE NOTICE '';
  RAISE NOTICE '🎉 CRÉATION TERMINÉE !';
  RAISE NOTICE '========================';
  RAISE NOTICE 'Tables créées: %', table_count;
  RAISE NOTICE 'Fonctions créées: %', function_count;
  RAISE NOTICE '';
  
  IF table_count = 6 THEN
    RAISE NOTICE '✅ Système de facturation OMEGA opérationnel !';
    RAISE NOTICE 'Vous pouvez maintenant utiliser Admin → Facturation';
  ELSE
    RAISE NOTICE '⚠️  Création partielle - Vérifiez les erreurs ci-dessus';
  END IF;
  
  RAISE NOTICE '========================';
END
$$;