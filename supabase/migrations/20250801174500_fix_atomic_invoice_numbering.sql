/*
  # Correction Atomique de la Génération de Numéros de Facture/Devis

  Ce script corrige une "race condition" qui pouvait causer des erreurs de
  numéros de documents en double lors de créations simultanées.

  1. Modifications:
     - Les fonctions `generate_invoice_number` et `generate_quote_number`
       utilisent maintenant `SELECT ... FOR UPDATE` pour verrouiller la ligne
       des paramètres (`billing_settings`) pendant la transaction.
     - Ce verrouillage garantit que chaque numéro est généré et incrémenté
       de manière atomique, empêchant ainsi toute duplication.

  2. Sécurité:
     - Les permissions et politiques RLS existantes ne sont pas modifiées.
     - La correction est purement technique et interne à la base de données.
*/

-- =================================================================
-- FONCTION CORRIGÉE POUR LES NUMÉROS DE DEVIS
-- =================================================================
CREATE OR REPLACE FUNCTION generate_quote_number()
RETURNS TEXT AS $$
DECLARE
  settings_record RECORD;
  new_number INTEGER;
  quote_number TEXT;
BEGIN
  -- Verrouiller la ligne des paramètres pour la durée de la transaction
  -- afin de garantir une opération atomique et éviter les doublons.
  SELECT * INTO settings_record FROM billing_settings LIMIT 1 FOR UPDATE;

  IF settings_record IS NULL THEN
    -- Fallback : si aucun paramètre n'existe, en créer un par défaut.
    INSERT INTO billing_settings (id) VALUES (gen_random_uuid())
    RETURNING * INTO settings_record;
    new_number := 1;
  ELSE
    new_number := settings_record.next_quote_number;
  END IF;

  -- Générer le numéro de devis formaté
  quote_number := settings_record.quote_prefix || '-' || LPAD(new_number::TEXT, 4, '0');

  -- Incrémenter le compteur pour le prochain devis
  UPDATE billing_settings
  SET next_quote_number = new_number + 1,
      updated_at = NOW()
  WHERE id = settings_record.id;

  RETURN quote_number;
END;
$$ LANGUAGE plpgsql;

-- =================================================================
-- FONCTION CORRIGÉE POUR LES NUMÉROS DE FACTURE
-- =================================================================
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TEXT AS $$
DECLARE
  settings_record RECORD;
  new_number INTEGER;
  invoice_number TEXT;
BEGIN
  -- Verrouiller la ligne des paramètres pour la durée de la transaction
  -- afin de garantir une opération atomique et éviter les doublons.
  SELECT * INTO settings_record FROM billing_settings LIMIT 1 FOR UPDATE;

  IF settings_record IS NULL THEN
    -- Fallback : si aucun paramètre n'existe, en créer un par défaut.
    INSERT INTO billing_settings (id) VALUES (gen_random_uuid())
    RETURNING * INTO settings_record;
    new_number := 1;
  ELSE
    new_number := settings_record.next_invoice_number;
  END IF;

  -- Générer le numéro de facture formaté
  invoice_number := settings_record.invoice_prefix || '-' || LPAD(new_number::TEXT, 4, '0');

  -- Incrémenter le compteur pour la prochaine facture
  UPDATE billing_settings
  SET next_invoice_number = new_number + 1,
      updated_at = NOW()
  WHERE id = settings_record.id;

  RETURN invoice_number;
END;
$$ LANGUAGE plpgsql;

-- Notification de succès dans les logs de la base de données
DO $$
BEGIN
  RAISE NOTICE '✅ Les fonctions de génération de numéros ont été corrigées avec succès pour être atomiques.';
END
$$;