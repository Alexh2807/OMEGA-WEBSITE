/*
  # Fonction atomique pour la génération de numéros de facture

  1. Fonction PostgreSQL
    - `get_next_invoice_number_atomic()` : Génère un numéro de facture unique de manière atomique
    - Utilise FOR UPDATE pour éviter les conditions de course
    - Crée automatiquement les paramètres de facturation si nécessaire
    - Retourne le numéro complet (ex: "FACT-001")

  2. Sécurité
    - Transaction atomique garantie
    - Pas de risque de doublons
    - Thread-safe pour les accès concurrents
*/

-- Fonction pour générer le prochain numéro de facture de manière atomique
CREATE OR REPLACE FUNCTION get_next_invoice_number_atomic()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_number INTEGER;
    invoice_prefix TEXT;
    formatted_number TEXT;
BEGIN
    -- Verrouiller la ligne pour éviter les conditions de course
    SELECT next_invoice_number, invoice_prefix
    INTO current_number, invoice_prefix
    FROM billing_settings
    FOR UPDATE;
    
    -- Si aucun paramètre n'existe, créer les paramètres par défaut
    IF current_number IS NULL THEN
        INSERT INTO billing_settings (
            company_name,
            company_address,
            company_postal_code,
            company_city,
            company_country,
            company_phone,
            company_email,
            invoice_prefix,
            next_invoice_number
        ) VALUES (
            'OMEGA',
            'France',
            '00000',
            'Ville',
            'France',
            '+33 6 19 91 87 19',
            'contact@captivision.fr',
            'FACT',
            2
        );
        
        current_number := 1;
        invoice_prefix := 'FACT';
    ELSE
        -- Incrémenter le compteur
        UPDATE billing_settings 
        SET next_invoice_number = next_invoice_number + 1
        WHERE id = (SELECT id FROM billing_settings LIMIT 1);
    END IF;
    
    -- Formater le numéro de facture
    formatted_number := invoice_prefix || '-' || LPAD(current_number::TEXT, 3, '0');
    
    RETURN formatted_number;
END;
$$;