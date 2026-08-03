-- ============================================================================
--  LE CLIENT PEUT ENFIN RÉCUPÉRER SA FACTURE
--
--  Constat : `invoices` et `invoice_items` n'avaient qu'UNE policy, réservée aux
--  administrateurs. Un client qui demandait sa propre facture recevait une liste
--  vide — et la page « Mes commandes » ne proposait rien. Autrement dit, il
--  n'existait AUCUN moyen pour un client d'obtenir sa facture, alors que la
--  remise d'une facture est une obligation du vendeur (art. L441-9 du code de
--  commerce ; art. 289 du CGI).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Lecture de SA facture, et seulement la sienne.
--
-- ⚠ Les brouillons restent invisibles : une facture en cours de préparation
-- n'est pas un document remis au client, et son numéro peut encore changer.
-- ⚠ Lecture SEULEMENT. Aucun INSERT/UPDATE/DELETE : une facture est un document
-- comptable, le client ne doit pouvoir ni la créer, ni la modifier, ni l'effacer.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Le client lit ses propres factures" ON invoices;
CREATE POLICY "Le client lit ses propres factures"
  ON invoices FOR SELECT
  TO authenticated
  USING (customer_id = auth.uid() AND status <> 'draft');

DROP POLICY IF EXISTS "Le client lit les lignes de ses factures" ON invoice_items;
CREATE POLICY "Le client lit les lignes de ses factures"
  ON invoice_items FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.id = invoice_items.invoice_id
      AND i.customer_id = auth.uid()
      AND i.status <> 'draft'
  ));

-- Le détail des règlements et des remboursements figure sur la facture remise :
-- sans lui, le client ne voit ni « acquittée » ni le montant remboursé.
DROP POLICY IF EXISTS "Le client lit les paiements de ses factures" ON payment_records;
CREATE POLICY "Le client lit les paiements de ses factures"
  ON payment_records FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.id = payment_records.invoice_id
      AND i.customer_id = auth.uid()
      AND i.status <> 'draft'
  ));

-- ---------------------------------------------------------------------------
-- Ménage : la policy d'administration portait encore une adresse e-mail EN DUR
-- (« … OR auth.jwt()->>'email' = 'alexishidalgo34000@gmail.com' »). L'audit avait
-- déjà retiré ce genre de raccourci du code : le rôle vient de profiles.role,
-- point. Une adresse figée dans une policy survit au changement de propriétaire,
-- de compte ou d'associé — et personne ne pense à la retirer.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage invoices" ON invoices;
CREATE POLICY "Admins can manage invoices"
  ON invoices FOR ALL
  TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can manage invoice items" ON invoice_items;
CREATE POLICY "Admins can manage invoice items"
  ON invoice_items FOR ALL
  TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

NOTIFY pgrst, 'reload schema';
