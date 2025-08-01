/*
  # Correction atomique de la numérotation des factures

  1. Nouvelles Fonctions
    - `get_next_invoice_number()` - Génère atomiquement le prochain numéro de facture
    - `get_next_quote_number()` - Génère atomiquement le prochain numéro de devis

  2. Sécurité
    - Fonctions sécurisées avec gestion d'erreurs
    - Transactions atomiques pour éviter les doublons
    - Gestion des cas où billing_settings n'existe pas

  3. Améliorations
    - Numérotation thread-safe
    - Création automatique des paramètres de facturation si nécessaire
    - Format cohérent des numéros (FACT-001, DEV-001)
*/

-- Fonction pour obtenir le prochain numéro de facture de manière atomique
CREATE OR REPLACE FUNCTION get_next_invoice_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    settings_record billing_settings%ROWTYPE;
    new_number INTEGER;
    formatted_number TEXT;
BEGIN
    -- Verrouiller la ligne des paramètres de facturation pour éviter les conditions de course
    SELECT * INTO settings_record
    FROM billing_settings
    FOR UPDATE;
    
    -- Si aucun paramètre n'existe, créer les paramètres par défaut
    IF NOT FOUND THEN
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
            next_quote_number
        ) VALUES (
            'OMEGA',
            'LOT ARTISANAL COMMUNAL',
            '34290',
            'MONTBLANC',
            'France',
            '+33 6 19 91 87 19',
            'contact@captivision.fr',
            'FACT',
            'DEV',
            1,
            1
        )
        RETURNING * INTO settings_record;
    END IF;
    
    -- Obtenir le numéro actuel et l'incrémenter
    new_number := settings_record.next_invoice_number;
    
    -- Mettre à jour le compteur pour le prochain appel
    UPDATE billing_settings 
    SET next_invoice_number = next_invoice_number + 1,
        updated_at = NOW()
    WHERE id = settings_record.id;
    
    -- Formater le numéro avec le préfixe et padding
    formatted_number := settings_record.invoice_prefix || '-' || LPAD(new_number::TEXT, 3, '0');
    
    RETURN formatted_number;
END;
$$;

-- Fonction pour obtenir le prochain numéro de devis de manière atomique
CREATE OR REPLACE FUNCTION get_next_quote_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    settings_record billing_settings%ROWTYPE;
    new_number INTEGER;
    formatted_number TEXT;
BEGIN
    -- Verrouiller la ligne des paramètres de facturation pour éviter les conditions de course
    SELECT * INTO settings_record
    FROM billing_settings
    FOR UPDATE;
    
    -- Si aucun paramètre n'existe, créer les paramètres par défaut
    IF NOT FOUND THEN
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
            next_quote_number
        ) VALUES (
            'OMEGA',
            'LOT ARTISANAL COMMUNAL',
            '34290',
            'MONTBLANC',
            'France',
            '+33 6 19 91 87 19',
            'contact@captivision.fr',
            'FACT',
            'DEV',
            1,
            1
        )
        RETURNING * INTO settings_record;
    END IF;
    
    -- Obtenir le numéro actuel et l'incrémenter
    new_number := settings_record.next_quote_number;
    
    -- Mettre à jour le compteur pour le prochain appel
    UPDATE billing_settings 
    SET next_quote_number = next_quote_number + 1,
        updated_at = NOW()
    WHERE id = settings_record.id;
    
    -- Formater le numéro avec le préfixe et padding
    formatted_number := settings_record.quote_prefix || '-' || LPAD(new_number::TEXT, 3, '0');
    
    RETURN formatted_number;
END;
$$;

-- Supprimer les anciens triggers qui pourraient causer des conflits
DROP TRIGGER IF EXISTS set_invoice_number_trigger ON invoices;
DROP TRIGGER IF EXISTS set_quote_number_trigger ON quotes;

-- Supprimer les anciennes fonctions
DROP FUNCTION IF EXISTS set_invoice_number();
DROP FUNCTION IF EXISTS set_quote_number();