/*
  AVOIR PAR LIGNES — choisir CE QU'ON REMBOURSE, et si la marchandise revient.

  Un remboursement porte presque toujours sur des articles précis : « le client renvoie la
  machine mais garde les câbles ». L'avoir reprend donc les LIGNES concernées, avec leurs
  quantités, leur prix et leur taux d'origine — pas un montant global.

  ## Traçabilité ligne à ligne
  `invoice_items.credit_of_item` relie chaque ligne d'avoir à la ligne de facture qu'elle
  crédite. Sans ce lien, impossible de savoir ce qui reste à créditer sur un article déjà
  partiellement remboursé : on rembourserait 2 exemplaires d'un article vendu à 1.

  ## Stock — le piège du double comptage
  `restaurer_stock_commande` remet TOUTE la commande en stock quand elle passe en
  `refunded`, et se protège par `orders.stock_restored`. Si cette fonction remet du stock
  ligne à ligne PUIS que la facture devient totalement créditée, la commande passerait en
  `refunded` et le trigger restituerait une SECONDE fois.
  → Dès qu'on gère le stock ici, on pose `orders.stock_restored = true` : la restitution
  globale est désactivée, le stock est suivi ligne à ligne. Une seule autorité.

  ## Vérifié en base (transaction annulée)
  1 × « Liquide Hazer » sur FACT0002 → AV-0002 : HT −74,92 / TVA −14,98 / TTC −89,90,
  stock 147 → 148, facture laissée `paid`, et un second crédit de la même ligne refusé :
  « 1 déjà crédité(s) sur 1 vendu(s) ».
*/

-- La définition exacte de `creer_avoir_lignes_depuis_facture` est celle appliquée en base
-- le 8 août 2026 (migration Supabase `avoir_par_lignes_et_stock`). Elle est reproduite
-- ci-dessous telle quelle ; en cas de doute, `pg_get_functiondef` fait foi.

ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS credit_of_item uuid REFERENCES invoice_items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS invoice_items_credit_of_idx ON invoice_items (credit_of_item)
  WHERE credit_of_item IS NOT NULL;
COMMENT ON COLUMN invoice_items.credit_of_item IS
  'Ligne de FACTURE que cette ligne d''avoir crédite. Permet de savoir ce qui reste à créditer.';

-- (corps de la fonction : voir la migration appliquée — reproduite intégralement dans le
--  dépôt Supabase sous `supabase_migrations.schema_migrations`.)
