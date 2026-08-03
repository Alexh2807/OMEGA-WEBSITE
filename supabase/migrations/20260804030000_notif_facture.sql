-- ============================================================================
--  LE CLIENT EST PRÉVENU QUE SA FACTURE EST DISPONIBLE
--
--  Jusqu'ici, aucune notification ne concernait les factures : le document
--  existait dans le back-office sans que le client puisse le savoir. Il ne
--  pouvait ni le voir ni le demander.
-- ============================================================================

-- Nouveau réglage, ACTIF par défaut : c'est une obligation, pas une option
-- marketing. Il reste débrayable comme les autres depuis l'administration.
UPDATE site_settings
   SET value = value || '{"invoice_ready": true}'::jsonb
 WHERE key = 'email_notifications';

-- ---------------------------------------------------------------------------
-- Déclencheur : à l'établissement de la facture, ou quand un brouillon devient
-- un document réel.
--
-- ⚠ Un brouillon n'est PAS une facture : son numéro peut encore changer et le
-- client ne doit pas en recevoir l'annonce. On n'envoie donc qu'au passage à un
-- statut définitif, et UNE SEULE FOIS — sans quoi chaque modification du
-- document (passage à « payée », encaissement, relance) renverrait un e-mail.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_invoice()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      PERFORM private.notify('invoice_ready', jsonb_build_object('id', NEW.id));
    END IF;
  ELSIF OLD.status = 'draft' AND NEW.status <> 'draft' THEN
    PERFORM private.notify('invoice_ready', jsonb_build_object('id', NEW.id));
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS notify_invoice_trg ON invoices;
CREATE TRIGGER notify_invoice_trg
  AFTER INSERT OR UPDATE OF status ON invoices
  FOR EACH ROW EXECUTE FUNCTION public.notify_invoice();

NOTIFY pgrst, 'reload schema';
