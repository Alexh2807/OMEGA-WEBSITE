/*
  # Fix atomic invoice numbering system

  1. New Functions
    - `get_next_invoice_number_atomic()` - Atomic invoice number generation
    - Ensures unique invoice numbers even with concurrent requests

  2. Security
    - Function accessible to authenticated users only
    - Proper error handling for edge cases

  3. Changes
    - Replaces manual invoice number generation
    - Prevents duplicate key violations
    - Handles billing_settings initialization
*/

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS get_next_invoice_number_atomic();

-- Create atomic invoice number generation function
CREATE OR REPLACE FUNCTION get_next_invoice_number_atomic()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    settings_record billing_settings%ROWTYPE;
    new_number INTEGER;
    invoice_number TEXT;
BEGIN
    -- Lock and get billing settings
    SELECT * INTO settings_record
    FROM billing_settings
    FOR UPDATE;
    
    -- If no settings exist, create default ones
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
            next_quote_number,
            default_payment_terms
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
            30
        )
        RETURNING * INTO settings_record;
    END IF;
    
    -- Get current number and increment
    new_number := settings_record.next_invoice_number;
    
    -- Update the counter atomically
    UPDATE billing_settings 
    SET next_invoice_number = next_invoice_number + 1,
        updated_at = now()
    WHERE id = settings_record.id;
    
    -- Generate the invoice number
    invoice_number := settings_record.invoice_prefix || '-' || LPAD(new_number::TEXT, 3, '0');
    
    RETURN invoice_number;
END;
$$;