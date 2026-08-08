/*
  UNE FACTURE REMBOURSÉE DOIT ENTRAÎNER SA COMMANDE.

  Constaté le 8 août 2026 : FACT0001 était en `refunded` avec son avoir AV-0001, mais la
  commande correspondante était restée `confirmed`. Deux écrans donnaient donc deux
  chiffres d'affaires : le Tableau de bord compte les COMMANDES (1 938,89 €), la
  Comptabilité compte les FACTURES et leurs avoirs (338,90 €).

  Pourquoi : `process-refund` mettait bien la commande à jour, mais dans son propre code.
  Un avoir émis depuis le BACK-OFFICE passe par `creer_avoir_depuis_facture`, qui ne
  touche pas `orders` — la commande restait en l'état.

  Correctif au bon niveau : un déclencheur sur `invoices`. Quel que soit le chemin qui
  passe une facture en `refunded`, la commande suit. On ne dépend plus du bon vouloir de
  chaque appelant.

  ⚠ Ce passage en `refunded` déclenche aussi `restaurer_stock_commande` : c'est voulu et
  déjà le comportement de `process-refund` — la marchandise revient en stock.
*/
CREATE OR REPLACE FUNCTION public.propager_remboursement_facture()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'refunded'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'refunded')
     AND NEW.order_id IS NOT NULL
  THEN
    UPDATE orders
       SET status = 'refunded'
     WHERE id = NEW.order_id
       AND status <> 'refunded';   -- évite de rejouer le trigger de stock
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS propager_remboursement_facture_trg ON invoices;
CREATE TRIGGER propager_remboursement_facture_trg
  AFTER INSERT OR UPDATE OF status ON invoices
  FOR EACH ROW EXECUTE FUNCTION public.propager_remboursement_facture();

NOTIFY pgrst, 'reload schema';
