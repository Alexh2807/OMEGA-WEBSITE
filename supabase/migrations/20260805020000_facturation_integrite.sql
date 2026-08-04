/*
  # Facturation : port facturé, facture inaltérable, avoirs, remboursements possibles

  ## Ce que cette migration corrige, et pourquoi c'est grave

  1. **Le port n'était sur AUCUNE facture.** Le back-office construisait les lignes depuis
     `order_items` uniquement, puis le trigger `update_invoice_totals_trigger` ÉCRASAIT les
     totaux avec la somme de ces lignes. La facture valait donc systématiquement moins que
     ce que le client avait payé, du montant exact des frais de port : chiffre d'affaires
     sous-déclaré, TVA sous-déclarée, et une facture qui ne correspond pas à l'encaissement.
     `creer_facture_depuis_commande()` construit désormais la ligne « Frais de port » depuis
     `orders.shipping_cost_ht`, et REFUSE de rendre une facture dont le total s'écarte de
     plus d'un centime du total de la commande.

  2. **Une facture émise se modifiait librement.** L'article 286 I 3° bis du CGI impose
     l'inaltérabilité, la sécurisation, la conservation et l'archivage des données de
     facturation ; le défaut de conformité est sanctionné par une amende de 7 500 € PAR
     LOGICIEL. Une facture émise ne se corrige pas : elle s'annule par un AVOIR. Deux
     triggers le font respecter par la BASE, et non par la bonne volonté de l'interface.

  3. **Aucun avoir n'était possible.** Ni type de document, ni lien vers la facture annulée,
     ni séquence de numérotation. Corriger une facture revenait donc forcément à la
     modifier — c'est-à-dire à commettre le défaut n° 2.

  4. **Le rapprochement bancaire était borgne.** `payment_records` ne portait ni la
     commission Stripe, ni le net encaissé, ni le virement (`payout`) qui l'a soldé. Le
     compte 512 ne pouvait pas se lettrer : la commission doit partir en 627 et le net au
     512, ce qui suppose de connaître les deux.

  5. **La numérotation était réservée aux ADMINISTRATEURS, pas au serveur.** La correction du
     5 août (migration 20260805010000) a ajouté `IF NOT is_admin() THEN RAISE EXCEPTION` à
     `get_next_invoice_number_atomic()`. Or `is_admin()` s'appuie sur `auth.uid()`, qui est
     NULL quand l'appelant est le `service_role` : une fonction Edge ne pouvait donc PLUS
     numéroter. Le contrat §2 dit « réservée au rôle serveur » — on accepte désormais le
     rôle serveur EN PLUS des administrateurs, sans rien ouvrir au public.

  6. **Un numéro brûlé à chaque échec.** L'enchaînement « je prends un numéro » puis
     « j'insère la facture » depuis le navigateur laissait un numéro consommé dans la nature
     dès que l'insertion échouait. Un trou dans une séquence de facturation se justifie
     devant un contrôleur (art. 289 du CGI). Tout se fait maintenant dans UNE transaction.

  7. **Les totaux étaient arrondis deux fois** (TVA ligne à ligne, puis somme), si bien que
     HT + TVA pouvait différer de TTC d'un centime. Un centime d'écart fait rejeter un dépôt
     Factur-X (règle BR-CO-15 de la norme EN 16931).

  8. **Le stock n'était jamais rendu.** `decrement_stock_on_order_item` le retire à la
     commande ; rien ne le remettait à l'annulation ou au remboursement. Chaque annulation
     faisait disparaître définitivement du stock qui n'avait jamais quitté l'entrepôt.

  9. **Le panier pouvait contenir deux fois le même produit** : aucune contrainte d'unicité
     sur `cart_items (user_id, product_id)`.

  ## Précautions
  Idempotente et rejouable : `ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE`,
  `DROP … IF EXISTS`, blocs `DO` gardés. Toute colonne ajoutée est nullable ou porte un
  défaut. Toute contrainte nouvelle est posée `NOT VALID` puis validée, et un échec de
  validation AVERTIT au lieu de faire échouer le déploiement. Aucune facture, aucune
  commande existante n'est modifiée ni supprimée.
*/

-- ===========================================================================
-- 1. Colonnes (contrat §2)
-- ===========================================================================

/*
  `invoices` — ce qu'il faut pour l'avoir, l'archivage et le suivi comptable.
  · `vat_territory`  : le territoire fiscal FIGÉ, au lieu de le redéduire d'un texte libre.
  · `document_type`  : facture ou avoir. Un avoir est un document à part entière (code 381
                       de la norme EN 16931), pas une facture négative déguisée.
  · `credit_note_of` : la facture annulée. Sans ce lien, un avoir est incontrôlable.
  · `delivery_date`  : date de livraison — c'est elle qui fixe l'exigibilité de la TVA sur
                       les biens, pas la date d'édition du document.
  · `tiime_*`        : idempotence de l'envoi comptable (une facture ne part qu'une fois).
  · `pdf_*`          : archivage du document REMIS au client, et son empreinte SHA-256.
*/
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS vat_territory        text,
  ADD COLUMN IF NOT EXISTS document_type        text NOT NULL DEFAULT 'invoice',
  ADD COLUMN IF NOT EXISTS credit_note_of       uuid REFERENCES invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_date        date,
  ADD COLUMN IF NOT EXISTS tiime_invoice_id     text,
  ADD COLUMN IF NOT EXISTS tiime_invoice_number text,
  ADD COLUMN IF NOT EXISTS tiime_ack_at         timestamptz,
  ADD COLUMN IF NOT EXISTS tiime_event_id       uuid,
  ADD COLUMN IF NOT EXISTS pdf_storage_path     text,
  ADD COLUMN IF NOT EXISTS pdf_sha256           text;

COMMENT ON COLUMN invoices.document_type IS
  'invoice | credit_note. Un avoir porte des montants NÉGATIFS et référence sa facture '
  'd''origine dans credit_note_of (code de type 381 de la norme EN 16931).';
COMMENT ON COLUMN invoices.tiime_event_id IS
  'Identifiant stable de l''envoi comptable. Rejouer l''envoi avec le même event_id ne '
  'crée pas une seconde écriture chez Tiime : c''est la clé d''idempotence.';
COMMENT ON COLUMN invoices.delivery_date IS
  'Date de livraison réelle. C''est elle qui détermine la période d''exigibilité de la TVA '
  'sur les livraisons de biens — pas la date d''édition de la facture.';
COMMENT ON COLUMN invoices.pdf_sha256 IS
  'Empreinte du PDF REMIS au client. Preuve d''archivage : un document réémis dont '
  'l''empreinte diffère n''est pas le document d''origine (art. 286 I 3° bis du CGI).';

CREATE INDEX IF NOT EXISTS invoices_credit_note_of_idx ON invoices (credit_note_of)
  WHERE credit_note_of IS NOT NULL;
CREATE INDEX IF NOT EXISTS invoices_tiime_event_idx ON invoices (tiime_event_id)
  WHERE tiime_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS invoices_document_type_idx ON invoices (document_type, created_at DESC);

/*
  `invoice_items.line_kind` — le payload comptable Tiime distingue la marchandise du
  transport (`line_kind: 'goods' | 'shipping'`), parce que les deux ne vont pas au même
  compte (707x pour les ventes, 708x pour les produits annexes dont le port). Sans cette
  colonne, la fonction Edge devrait deviner à partir du libellé de la ligne — c'est-à-dire
  reconnaître le texte « Frais de port », ce qui casse à la première reformulation.
  ⚠ Colonne ajoutée AU-DELÀ du contrat §2 : signalée dans le rapport, à connaître de E et F2.
*/
ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS line_kind text NOT NULL DEFAULT 'goods';

DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_items_line_kind_check') THEN
    ALTER TABLE invoice_items ADD CONSTRAINT invoice_items_line_kind_check
      CHECK (line_kind IN ('goods', 'shipping', 'discount', 'other'));
  END IF;
END
$mig$;

COMMENT ON COLUMN invoice_items.line_kind IS
  'goods | shipping | discount | other. Pilote le compte comptable (707x / 708x) et le '
  'champ line_kind du payload Tiime. Ne jamais le déduire du libellé de la ligne.';

/*
  `payment_records` — le rapprochement bancaire.
  ⚠ État réel constaté en production : `order_id`, `status` et `stripe_charge_id` EXISTENT
  déjà. Ce qui manque, c'est ce qui permet de solder le compte 512 : la commission Stripe
  (compte 627), le net réellement crédité, et le virement (`payout`) qui l'a apporté. Ces
  trois valeurs s'obtiennent en une seule requête Stripe (`balance_transaction` en expand)
  au moment de l'envoi comptable.
*/
ALTER TABLE payment_records
  ADD COLUMN IF NOT EXISTS order_id                      uuid REFERENCES orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status                        text DEFAULT 'succeeded',
  ADD COLUMN IF NOT EXISTS stripe_charge_id              text,
  ADD COLUMN IF NOT EXISTS stripe_balance_transaction_id text,
  ADD COLUMN IF NOT EXISTS stripe_fee                    numeric(10,2),
  ADD COLUMN IF NOT EXISTS stripe_net                    numeric(10,2),
  ADD COLUMN IF NOT EXISTS stripe_payout_id              text,
  ADD COLUMN IF NOT EXISTS stripe_payout_date            date;

/*
  Le contrat §2 fixe `status DEFAULT 'succeeded'`. La colonne existante porte le défaut
  'pending', hérité d'un ajout à la volée. Une ligne de `payment_records` n'est écrite
  QU'APRÈS confirmation du paiement par Stripe : la laisser naître « en attente » oblige
  chaque lecteur à savoir que le défaut ment. On aligne le défaut sur le contrat.
  ⚠ Les lignes DÉJÀ écrites ne sont pas touchées : un défaut de colonne ne s'applique qu'aux
  insertions futures. (Table vide au 4 août 2026 — vérifié.)
*/
ALTER TABLE payment_records ALTER COLUMN status SET DEFAULT 'succeeded';

COMMENT ON COLUMN payment_records.stripe_fee IS
  'Commission Stripe de la transaction (compte 627). Vient de balance_transaction.fee.';
COMMENT ON COLUMN payment_records.stripe_net IS
  'Montant NET réellement crédité (compte 512) = brut − commission.';
COMMENT ON COLUMN payment_records.stripe_payout_id IS
  'Virement Stripe qui a apporté ce net en banque : c''est la clé de lettrage du 512.';

CREATE INDEX IF NOT EXISTS payment_records_order_idx  ON payment_records (order_id);
CREATE INDEX IF NOT EXISTS payment_records_charge_idx ON payment_records (stripe_charge_id);
CREATE INDEX IF NOT EXISTS payment_records_payout_idx ON payment_records (stripe_payout_id)
  WHERE stripe_payout_id IS NOT NULL;

/*
  `billing_settings` — le compteur d'avoirs. Une numérotation d'avoirs distincte de celle
  des factures est l'usage constant : mélanger les deux séries rend la séquence de
  facturation incompréhensible à un contrôleur, alors que chacune doit être continue.
*/
ALTER TABLE billing_settings
  ADD COLUMN IF NOT EXISTS credit_note_prefix      text    DEFAULT 'AV-',
  ADD COLUMN IF NOT EXISTS next_credit_note_number integer DEFAULT 1;

UPDATE billing_settings
   SET credit_note_prefix      = coalesce(credit_note_prefix, 'AV-'),
       next_credit_note_number = coalesce(next_credit_note_number, 1)
 WHERE credit_note_prefix IS NULL OR next_credit_note_number IS NULL;

/*
  `profiles.siret` — obligatoire sur une facture entre professionnels français, et clé de
  routage de la facturation électronique (le SIREN en est les 9 premiers chiffres).
  ⚠ Contrôle NON bloquant : refuser une commande faute de SIRET ferait perdre la vente.
  On l'enregistre, l'administration le complète, la facture le porte quand il est là.
*/
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS siret text;
COMMENT ON COLUMN profiles.siret IS
  'SIRET de l''acheteur société française. Contrôle non bloquant : on n''empêche pas la '
  'vente, mais la facture entre professionnels doit le porter (art. 242 nonies A ann. II CGI).';

/*
  `orders` — les sept colonnes du contrat §2. Elles sont (re)posées à l'identique par les
  migrations 20260805030000 (fiscal) et 20260805040000 (livraison), qui les documentent
  chacune dans leur domaine ; les `IF NOT EXISTS` rendent la double pose inoffensive et
  garantissent que `creer_facture_depuis_commande()` trouve ses colonnes quel que soit
  l'ordre d'application des trois fichiers.
*/
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS vat_mention      text,
  ADD COLUMN IF NOT EXISTS vat_territory    text,
  ADD COLUMN IF NOT EXISTS shipping_cost_ht numeric(10,2),
  ADD COLUMN IF NOT EXISTS shipping_carrier text,
  ADD COLUMN IF NOT EXISTS shipping_service text,
  ADD COLUMN IF NOT EXISTS shipping_relay   jsonb,
  ADD COLUMN IF NOT EXISTS delivery_date    date;

/*
  Les MÊMES sur le devis serveur. `confirmer_commande()` ne peut recopier vers la commande
  que ce que le devis porte : sans ces colonnes, le transporteur et le point relais choisis
  par le client seraient perdus entre le paiement et la commande — et l'exploitant se
  retrouverait avec une commande à expédier sans savoir ni comment ni où.
  Elles sont posées ici, dans le PREMIER des trois fichiers, pour que la version de
  `confirmer_commande` écrite par 20260805030000 trouve toujours ses colonnes.
*/
ALTER TABLE order_quotes
  ADD COLUMN IF NOT EXISTS vat_mention      text,
  ADD COLUMN IF NOT EXISTS vat_territory    text,
  ADD COLUMN IF NOT EXISTS shipping_cost_ht numeric(10,2),
  ADD COLUMN IF NOT EXISTS shipping_carrier text,
  ADD COLUMN IF NOT EXISTS shipping_service text,
  ADD COLUMN IF NOT EXISTS shipping_relay   jsonb;

-- ===========================================================================
-- 2. `invoices.status` accepte « refunded »
-- ===========================================================================
/*
  Sans cette valeur, une facture remboursée reste « payée » : le rapprochement bancaire ne
  retombe jamais juste, et `declaration_tva` ne peut pas déduire le remboursement.
  On cherche la contrainte par son CONTENU plutôt que par son nom : selon les versions elle
  s'appelle `invoices_status_check` ou porte un nom généré automatiquement.
*/
DO $mig$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.invoices'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.invoices DROP CONSTRAINT %I', c.conname);
    RAISE NOTICE 'Contrainte de statut « % » remplacée.', c.conname;
  END LOOP;

  ALTER TABLE public.invoices ADD CONSTRAINT invoices_status_check
    CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled', 'refunded'));
END
$mig$;

-- ===========================================================================
-- 3. Avoirs : type de document, lien obligatoire, montants négatifs
-- ===========================================================================
/*
  Un avoir n'est PAS une facture avec un signe moins bricolé dans l'interface :
   · `document_type = 'credit_note'` (code 381 de la norme EN 16931, contre 380 pour une
     facture) ;
   · `credit_note_of` OBLIGATOIRE : un avoir qui ne dit pas ce qu'il annule n'annule rien.
     La norme en fait un bloc à part entière (BG-3 / BT-25, BT-26) ;
   · montants NÉGATIFS : c'est ce qui permet à la somme facture + avoir de valoir zéro sans
     retoucher la facture.

  ⚠ Les contraintes sont posées `NOT VALID` puis validées séparément : si une donnée
  historique ne les respectait pas, la validation échouerait SANS empêcher la contrainte de
  s'appliquer aux écritures futures — et sans faire échouer le déploiement.
*/
DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_document_type_check') THEN
    ALTER TABLE invoices ADD CONSTRAINT invoices_document_type_check
      CHECK (document_type IN ('invoice', 'credit_note')) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_avoir_lien_check') THEN
    ALTER TABLE invoices ADD CONSTRAINT invoices_avoir_lien_check
      CHECK (document_type <> 'credit_note' OR credit_note_of IS NOT NULL) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_avoir_negatif_check') THEN
    -- `<= 0` et non `< 0` : un avoir naît en brouillon SANS ligne, donc à zéro.
    ALTER TABLE invoices ADD CONSTRAINT invoices_avoir_negatif_check
      CHECK (document_type <> 'credit_note' OR total_ttc <= 0) NOT VALID;
  END IF;
END
$mig$;

DO $mig$
DECLARE c text;
BEGIN
  FOREACH c IN ARRAY ARRAY['invoices_document_type_check', 'invoices_avoir_lien_check',
                           'invoices_avoir_negatif_check'] LOOP
    BEGIN
      EXECUTE format('ALTER TABLE invoices VALIDATE CONSTRAINT %I', c);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Contrainte % non validée sur l''existant (%). Elle s''applique tout de même aux écritures futures ; nettoyer puis rejouer VALIDATE CONSTRAINT.', c, SQLERRM;
    END;
  END LOOP;
END
$mig$;

-- ===========================================================================
-- 4. `refunds` — les remboursements, complétés sans rien casser
-- ===========================================================================
/*
  ⚠ État réel constaté : la table EXISTE déjà en production (créée à la volée par
  `process-refund`), avec `stripe_refund_id` UNIQUE et NOT NULL, `stripe_payment_intent_id`
  NOT NULL, `reason` NOT NULL et un `status` contraint à
  ('pending','succeeded','failed','cancelled'). On ne redéfinit donc RIEN : on se contente
  d'ajouter ce que le contrat §2 exige et qui manque (`created_by`), et de garantir
  l'unicité anti-double-remboursement si elle venait à manquer.

  Le `CREATE TABLE IF NOT EXISTS` n'est là que pour un environnement neuf (préproduction,
  base de test) : sur la production il ne fait rien.
*/
CREATE TABLE IF NOT EXISTS refunds (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id               uuid REFERENCES invoices(id) ON DELETE SET NULL,
  order_id                 uuid REFERENCES orders(id)   ON DELETE SET NULL,
  stripe_refund_id         text UNIQUE,
  stripe_payment_intent_id text,
  amount                   numeric(10,2) NOT NULL,
  reason                   text,
  status                   text NOT NULL DEFAULT 'pending',
  admin_notes              text,
  processed_by             uuid,
  created_by               uuid,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now()
);

-- Complément non destructif : aucune colonne existante n'est retypée ni supprimée.
ALTER TABLE refunds
  ADD COLUMN IF NOT EXISTS invoice_id  uuid,
  ADD COLUMN IF NOT EXISTS order_id    uuid,
  ADD COLUMN IF NOT EXISTS admin_notes text,
  ADD COLUMN IF NOT EXISTS created_by  uuid,
  ADD COLUMN IF NOT EXISTS updated_at  timestamptz DEFAULT now();

COMMENT ON COLUMN refunds.created_by IS
  'Compte à l''origine du remboursement (contrat §2). NULL quand l''ordre vient du serveur '
  'ou d''un webhook Stripe : dans ce cas, `processed_by` porte l''administrateur.';

/*
  L'unicité de `stripe_refund_id` est le garde-fou anti-double-remboursement : un rejeu de
  webhook ou un double clic ne doit pas enregistrer deux fois le même remboursement.
  Elle EXISTE déjà en production (`refunds_stripe_refund_id_key`). On ne la pose que si elle
  manque, et SANS faire échouer la migration si des doublons traînent.
*/
DO $mig$
DECLARE v_doublons integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_index i
      JOIN pg_class t ON t.oid = i.indrelid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (i.indkey)
     WHERE t.relname = 'refunds' AND i.indisunique AND a.attname = 'stripe_refund_id'
  ) THEN
    RAISE NOTICE 'refunds.stripe_refund_id : unicité déjà en place, rien à faire.';
    RETURN;
  END IF;

  SELECT count(*) INTO v_doublons FROM (
    SELECT stripe_refund_id FROM refunds
     WHERE stripe_refund_id IS NOT NULL
     GROUP BY stripe_refund_id HAVING count(*) > 1) d;

  IF v_doublons > 0 THEN
    RAISE WARNING 'refunds : % identifiant(s) Stripe en double — index unique NON posé. À nettoyer à la main puis rejouer.', v_doublons;
  ELSE
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS refunds_stripe_refund_id_key ON refunds (stripe_refund_id)';
  END IF;
END
$mig$;

CREATE INDEX IF NOT EXISTS refunds_invoice_idx ON refunds (invoice_id);
CREATE INDEX IF NOT EXISTS refunds_order_idx   ON refunds (order_id);
CREATE INDEX IF NOT EXISTS refunds_date_idx    ON refunds (created_at DESC);

ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;

-- Administrateurs seulement : identifiants Stripe et montants. Le `service_role`
-- (fonction Edge `process-refund`) contourne la RLS par construction.
DROP POLICY IF EXISTS "refunds_admin_all" ON refunds;
CREATE POLICY "refunds_admin_all" ON refunds
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ===========================================================================
-- 5. `payment_records` : le serveur écrit, le client lit ce qui le concerne
-- ===========================================================================
/*
  Le `service_role` contourne la RLS : cette politique d'INSERT ne lui est donc pas
  strictement nécessaire. On la pose quand même, explicitement, parce qu'une politique
  absente se lit « personne n'a le droit » et qu'un lecteur pressé en conclurait qu'il faut
  ouvrir l'écriture à `authenticated` — ce qui laisserait un client déclarer ses propres
  paiements. La politique dit noir sur blanc QUI écrit : le serveur, et lui seul.

  Côté lecture, la politique existante ne retrouvait un paiement que par sa FACTURE. Or un
  paiement est encaissé AVANT que la facture existe : le client ne voyait donc rien tant que
  la facture n'était pas émise. On ajoute le chemin par la COMMANDE, sans élargir d'un pouce
  le périmètre — un compte ne voit que ce qui lui appartient.
*/
DROP POLICY IF EXISTS "payment_records_service_insert" ON payment_records;
CREATE POLICY "payment_records_service_insert" ON payment_records
  FOR INSERT TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "Le client lit les paiements de ses factures" ON payment_records;
DROP POLICY IF EXISTS "payment_records_client_select" ON payment_records;
CREATE POLICY "payment_records_client_select" ON payment_records
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM invoices i
             WHERE i.id = payment_records.invoice_id
               AND i.customer_id = auth.uid()
               AND i.status <> 'draft')
    OR
    EXISTS (SELECT 1 FROM orders o
             WHERE o.id = payment_records.order_id
               AND o.user_id = auth.uid())
  );

/*
  ⚠ Aucune politique d'UPDATE ni de DELETE pour `authenticated` en dehors de celle des
  administrateurs, qui préexiste (« Admins can manage payment records ») : un client ne
  peut donc ni modifier ni effacer une trace de paiement. C'est volontaire — une trace de
  règlement effaçable par celui qu'elle concerne ne prouve rien.
*/

-- ===========================================================================
-- 6. Numérotation : réservée au SERVEUR (et aux administrateurs)
-- ===========================================================================
/*
  ## Le défaut corrigé ici

  La migration 20260805010000 a — à juste titre — fermé la numérotation au public. Mais elle
  l'a fermée avec `IF NOT is_admin() THEN RAISE EXCEPTION`, et `is_admin()` répond
  `EXISTS (… WHERE profiles.id = auth.uid() …)`. Quand l'appelant est le `service_role`
  (fonction Edge), `auth.uid()` vaut NULL : `is_admin()` rend FAUX, et **le serveur ne peut
  plus numéroter une facture**. Le contrat §2 dit pourtant « réservée au rôle serveur ».

  On accepte donc DEUX appelants légitimes, et eux seuls :
   · le `service_role`, reconnu de trois façons parce que la manière dont PostgREST expose
     le rôle a changé au fil des versions (`request.jwt.claim.role`, puis
     `request.jwt.claims` en JSON, et enfin le rôle SQL réellement endossé) ;
   · un administrateur connecté, pour le back-office.

  Le FORMAT est repris À L'IDENTIQUE de la version en place (`préfixe` + 4 chiffres) :
  changer le format d'une séquence de facturation en cours de route est exactement ce qu'un
  contrôleur regarde. `billing_settings.invoice_prefix` vaut « FACT » sans séparateur, ce qui
  produit « FACT0001 » ; c'est un réglage, pas du code — voir le rapport.
*/
CREATE OR REPLACE FUNCTION public.get_next_invoice_number_atomic()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id      uuid;
  v_numero  integer;
  v_prefixe text;
  v_serveur boolean;
BEGIN
  v_serveur :=
       coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
    OR current_user IN ('service_role', 'supabase_admin', 'postgres');

  IF NOT v_serveur AND NOT is_admin() THEN
    RAISE EXCEPTION 'Numérotation réservée au serveur et aux administrateurs';
  END IF;

  /* Verrou de ligne : deux facturations simultanées ne peuvent pas obtenir le même numéro.
     `ORDER BY created_at, id` : s'il existe plusieurs lignes de paramètres (cas constaté
     quand d'anciens replis en ont créé), on verrouille TOUJOURS la même. */
  SELECT bs.id, bs.next_invoice_number, bs.invoice_prefix
    INTO v_id, v_numero, v_prefixe
    FROM billing_settings bs
   ORDER BY bs.created_at NULLS FIRST, bs.id
   LIMIT 1
     FOR UPDATE;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Paramètres de facturation absents : impossible de numéroter une facture.';
  END IF;

  UPDATE billing_settings
     SET next_invoice_number = v_numero + 1,
         updated_at = now()
   WHERE id = v_id;

  RETURN coalesce(v_prefixe, 'FACT') || lpad(v_numero::text, 4, '0');
END;
$function$;

COMMENT ON FUNCTION public.get_next_invoice_number_atomic() IS
  'Consomme le prochain numéro de facture. RÉSERVÉE au service_role et aux administrateurs : '
  'un numéro consommé sans facture fait un trou dans la séquence, et une séquence de '
  'facturation doit être continue (art. 289 du CGI). Préférer creer_facture_depuis_commande().';

/*
  ★ LE COMPTEUR D'AVOIRS. Même verrou, même exigence de continuité, même contrôle d'appelant.
  ⚠ `credit_note_prefix` vaut « AV- » : le tiret est DANS le préfixe (contrat §2), on ne le
  rajoute donc pas — sinon on produirait « AV--0001 ».
*/
CREATE OR REPLACE FUNCTION public.get_next_credit_note_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id      uuid;
  v_numero  integer;
  v_prefixe text;
  v_serveur boolean;
BEGIN
  v_serveur :=
       coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
    OR current_user IN ('service_role', 'supabase_admin', 'postgres');

  IF NOT v_serveur AND NOT is_admin() THEN
    RAISE EXCEPTION 'Numérotation réservée au serveur et aux administrateurs';
  END IF;

  SELECT bs.id, coalesce(bs.next_credit_note_number, 1), coalesce(bs.credit_note_prefix, 'AV-')
    INTO v_id, v_numero, v_prefixe
    FROM billing_settings bs
   ORDER BY bs.created_at NULLS FIRST, bs.id
   LIMIT 1
     FOR UPDATE;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Paramètres de facturation absents : impossible de numéroter un avoir.';
  END IF;

  UPDATE billing_settings
     SET next_credit_note_number = v_numero + 1,
         updated_at = now()
   WHERE id = v_id;

  RETURN v_prefixe || lpad(v_numero::text, 4, '0');
END;
$function$;

COMMENT ON FUNCTION public.get_next_credit_note_number() IS
  'Séquence d''avoirs, DISTINCTE de celle des factures. Réservée au serveur et aux admins.';

/*
  Qui a le droit de consommer un numéro : personne, sauf le serveur.
  ⚠ Conséquence à connaître : `supabase.rpc('get_next_invoice_number_atomic')` depuis le
  navigateur ne fonctionnera plus — c'est voulu, et c'est ce qui empêche les numéros brûlés.
  Le back-office passe par `creer_facture_depuis_commande()`.
*/
DO $mig$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS signature
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('get_next_invoice_number_atomic', 'get_next_credit_note_number',
                         'get_next_quote_number')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.signature);
  END LOOP;
END
$mig$;

-- ===========================================================================
-- 7. Totaux de facture : un seul arrondi, et jamais sur un document émis
-- ===========================================================================
/*
  ⚠ Le trigger réellement posé sur `invoice_items` est `update_invoice_totals_trigger`, qui
  appelle `update_invoice_totals_from_items()` — et NON `calculate_invoice_totals()`, qui
  existe mais n'est branchée nulle part. C'est donc bien la première qu'il faut corriger.

  L'ancien calcul prenait `SUM(total_ttc − total_ht)` comme TVA : un arrondi par LIGNE puis
  une somme. Deux chemins d'arrondi pour un même montant, donc HT + TVA qui ne retombe pas
  toujours sur TTC. La norme EN 16931 refuse cet écart (règle BR-CO-15) et Factur-X est
  rejeté pour un centime.

  Nouveau calcul, en une seule passe et dans l'ordre imposé par l'audit Tiime :
      base_taux = round(Σ total_ht des lignes de ce taux, 2)
      tva       = Σ round(base_taux × taux / 100, 2)
      ttc       = HT + TVA                     ← l'égalité est vraie PAR CONSTRUCTION

  ★ Et surtout : on ne recalcule PLUS une facture qui n'est pas un brouillon. Une facture
  émise est figée ; tenter d'en réécrire les totaux ferait lever le trigger d'inaltérabilité
  posé plus bas, donc échouer une opération qui n'a rien à voir.
*/
CREATE OR REPLACE FUNCTION public.update_invoice_totals_from_items()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice uuid;
  v_statut  text;
  v_ht      numeric(12,2);
  v_tva     numeric(12,2);
BEGIN
  IF TG_OP = 'DELETE' THEN v_invoice := OLD.invoice_id; ELSE v_invoice := NEW.invoice_id; END IF;
  IF v_invoice IS NULL THEN RETURN NULL; END IF;

  SELECT status INTO v_statut FROM invoices WHERE id = v_invoice;
  -- Facture émise, ou déjà disparue (suppression en cascade) : on ne réécrit rien.
  IF v_statut IS DISTINCT FROM 'draft' THEN RETURN NULL; END IF;

  SELECT round(coalesce(sum(ii.total_ht), 0), 2) INTO v_ht
    FROM invoice_items ii WHERE ii.invoice_id = v_invoice;

  SELECT coalesce(sum(round(t.base * t.taux / 100.0, 2)), 0) INTO v_tva
    FROM (
      SELECT ii.tax_rate AS taux, round(sum(ii.total_ht), 2) AS base
        FROM invoice_items ii
       WHERE ii.invoice_id = v_invoice
       GROUP BY ii.tax_rate
    ) t;

  UPDATE invoices
     SET subtotal_ht = v_ht,
         tax_amount  = v_tva,
         total_ttc   = v_ht + v_tva,   -- ★ égalité garantie, jamais recalculée à part
         updated_at  = now()
   WHERE id = v_invoice;

  RETURN NULL;
END;
$function$;

/*
  Le total de LIGNE, arrondi une bonne fois pour toutes. L'ancienne version écrivait
  `quantity × unit_price_ht × (1 + taux/100)` sans arrondi dans une colonne `numeric` sans
  échelle : la ligne portait donc des millièmes d'euro, que le total ramassait ensuite.
  Le payload comptable exige deux décimales exactement (audit Tiime, règles transverses).

  Le trigger passe de `BEFORE INSERT` à `BEFORE INSERT OR UPDATE` : sans cela, corriger la
  quantité d'une ligne de brouillon laissait `total_ht` inchangé — donc faux.
*/
CREATE OR REPLACE FUNCTION public.calculate_invoice_item_totals()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE v_ht numeric(12,2);
BEGIN
  v_ht := round(coalesce(NEW.quantity, 0) * coalesce(NEW.unit_price_ht, 0), 2);
  NEW.total_ht  := v_ht;
  NEW.total_ttc := v_ht + round(v_ht * coalesce(NEW.tax_rate, 0) / 100.0, 2);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS calculate_invoice_item_totals_trigger ON invoice_items;
CREATE TRIGGER calculate_invoice_item_totals_trigger
  BEFORE INSERT OR UPDATE ON invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.calculate_invoice_item_totals();

-- ===========================================================================
-- 8. Inaltérabilité (art. 286 I 3° bis du CGI — 7 500 € par logiciel non conforme)
-- ===========================================================================
/*
  ## Ce que dit la loi, en une phrase
  Un assujetti qui enregistre les règlements de ses clients au moyen d'un logiciel doit
  utiliser un logiciel satisfaisant à des conditions d'INALTÉRABILITÉ, de sécurisation, de
  conservation et d'archivage des données. Le défaut est sanctionné par une amende de
  7 500 € par logiciel. Une facture émise ne se rectifie pas : on émet un AVOIR qui
  l'annule, et on refacture.

  ## Ce que le trigger autorise malgré tout
  Une facture VIT après son émission : elle est payée, elle devient en retard, elle est
  remboursée, elle part en comptabilité, son PDF est archivé. Ces mouvements-là ne touchent
  pas au CONTENU du document — ils le SUIVENT. D'où la liste blanche, et elle seule.

  ## Comment la comparaison est faite
  On compare `to_jsonb(OLD)` et `to_jsonb(NEW)` privés des colonnes de suivi. Comparer la
  ligne ENTIÈRE plutôt qu'énumérer les colonnes protégées : le jour où une colonne est
  ajoutée, elle est protégée d'office. Une liste de colonnes à maintenir finit toujours par
  en oublier une.

  ⚠ Le trigger s'applique AUSSI au `service_role` et aux administrateurs. C'est le principe
  même : une trace qui s'efface pour l'exploitant ne prouve rien.
*/
CREATE OR REPLACE FUNCTION public.invoices_inalterabilite()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_suivi  text[] := ARRAY[
    -- Règlement
    'status', 'paid_at', 'amount_paid',
    -- Horodatage technique
    'updated_at',
    -- Suivi comptable (Tiime)
    'tiime_invoice_id', 'tiime_invoice_number', 'tiime_ack_at', 'tiime_event_id',
    'tiime_sent_at',
    -- Archivage du document remis
    'pdf_storage_path', 'pdf_sha256'];
  v_avant  jsonb;
  v_apres  jsonb;
  v_col    text;
  v_fautes text[] := '{}';
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION
        'Suppression refusée : la facture % est émise. Une facture émise ne s''efface pas, elle s''annule par un avoir (art. 286 I 3° bis du CGI).',
        OLD.invoice_number;
    END IF;
    RETURN OLD;
  END IF;

  -- Tant que c'est un brouillon, tout est modifiable : ce n'est pas encore un document.
  IF OLD.status = 'draft' THEN
    RETURN NEW;
  END IF;

  -- Le statut ne peut plus évoluer que vers un état de SUIVI du règlement.
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status NOT IN ('paid', 'overdue', 'refunded', 'cancelled') THEN
    RAISE EXCEPTION
      'Changement de statut refusé sur la facture % (% → %) : une facture émise ne peut plus que devenir payée, en retard, remboursée ou annulée.',
      OLD.invoice_number, OLD.status, NEW.status;
  END IF;

  v_avant := to_jsonb(OLD);
  v_apres := to_jsonb(NEW);
  FOREACH v_col IN ARRAY v_suivi LOOP
    v_avant := v_avant - v_col;
    v_apres := v_apres - v_col;
  END LOOP;

  IF v_avant <> v_apres THEN
    SELECT array_agg(k) INTO v_fautes
      FROM jsonb_object_keys(v_avant) k
     WHERE v_avant -> k IS DISTINCT FROM v_apres -> k;
    RAISE EXCEPTION
      'Modification refusée sur la facture % (colonnes : %). Une facture émise est inaltérable : émettez un avoir (art. 286 I 3° bis du CGI).',
      OLD.invoice_number, array_to_string(coalesce(v_fautes, ARRAY[]::text[]), ', ');
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS invoices_inalterabilite_trg ON invoices;
CREATE TRIGGER invoices_inalterabilite_trg
  BEFORE UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoices_inalterabilite();

/*
  Les LIGNES suivent la même règle : une facture inaltérable dont on peut réécrire les
  lignes n'est pas inaltérable. On refuse aussi l'INSERTION d'une ligne dans un document
  émis — ajouter un article après coup revient à réécrire la facture.
*/
CREATE OR REPLACE FUNCTION public.invoice_items_inalterabilite()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice uuid;
  v_statut  text;
  v_numero  text;
BEGIN
  IF TG_OP = 'DELETE' THEN v_invoice := OLD.invoice_id; ELSE v_invoice := NEW.invoice_id; END IF;

  SELECT status, invoice_number INTO v_statut, v_numero FROM invoices WHERE id = v_invoice;

  /* Facture introuvable : c'est la suppression en cascade de la facture elle-même, que le
     trigger sur `invoices` a déjà autorisée (donc un brouillon). On laisse passer. */
  IF v_statut IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF v_statut <> 'draft' THEN
    RAISE EXCEPTION
      'Lignes verrouillées : la facture % est émise. Une facture émise est inaltérable — passez par un avoir (art. 286 I 3° bis du CGI).',
      v_numero;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;

DROP TRIGGER IF EXISTS invoice_items_inalterabilite_trg ON invoice_items;
CREATE TRIGGER invoice_items_inalterabilite_trg
  BEFORE INSERT OR UPDATE OR DELETE ON invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.invoice_items_inalterabilite();

-- ===========================================================================
-- 9. Unicité : un paiement = une commande, un remboursement = une ligne,
--    un produit = une ligne de panier
-- ===========================================================================
/*
  `orders.stripe_payment_intent_id` porte DÉJÀ une contrainte `UNIQUE` en production
  (`orders_stripe_payment_intent_id_key`). PostgreSQL considérant les NULL comme distincts,
  elle a exactement l'effet de l'index partiel demandé par le contrat : les commandes
  manuelles du back-office, sans paiement Stripe, ne se gênent pas entre elles.
  On ne pose donc l'index partiel QUE s'il n'existe aucune unicité sur cette colonne —
  poser les deux ne servirait qu'à ralentir chaque écriture.
*/
DO $mig$
DECLARE v_doublons integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_index i
      JOIN pg_class t ON t.oid = i.indrelid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (i.indkey)
     WHERE t.relname = 'orders' AND i.indisunique AND a.attname = 'stripe_payment_intent_id'
  ) THEN
    RAISE NOTICE 'orders.stripe_payment_intent_id : unicité déjà en place, index partiel superflu.';
    RETURN;
  END IF;

  SELECT count(*) INTO v_doublons FROM (
    SELECT stripe_payment_intent_id FROM orders
     WHERE stripe_payment_intent_id IS NOT NULL
     GROUP BY stripe_payment_intent_id HAVING count(*) > 1) d;

  IF v_doublons > 0 THEN
    RAISE WARNING 'orders : % paiement(s) Stripe rattaché(s) à plusieurs commandes — index orders_pi_uniq NON posé. Fusionner ces commandes puis rejouer cette migration.', v_doublons;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS orders_pi_uniq
      ON orders (stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
  END IF;
END
$mig$;

/*
  ## Le panier : une ligne par produit et par client

  ⚠ ORDRE IMPOSÉ : on FUSIONNE d'abord, on contraint ensuite. Poser l'index avant le
  nettoyage le ferait échouer sur la première paire de doublons — et une migration qui
  échoue à mi-parcours en production, c'est le scénario qu'on refuse. (Au 4 août 2026 : 2
  lignes de panier dont 1 paire en double — le nettoyage n'est donc pas théorique.)

  La ligne conservée est la PLUS RÉCENTE (celle que le client vient de manipuler) et reçoit
  la SOMME des quantités : personne ne perd d'article. Les lignes orphelines (`user_id` ou
  `product_id` nul) sont exclues du regroupement — `GROUP BY` traite les NULL comme égaux,
  ce qui les fusionnerait à tort entre elles.
*/
UPDATE cart_items c
   SET quantity = t.total
  FROM (
    SELECT user_id, product_id,
           sum(quantity) AS total,
           (array_agg(id ORDER BY created_at DESC NULLS LAST, id DESC))[1] AS id_garde
      FROM cart_items
     WHERE user_id IS NOT NULL AND product_id IS NOT NULL
     GROUP BY user_id, product_id
    HAVING count(*) > 1
  ) t
 WHERE c.id = t.id_garde;

DELETE FROM cart_items c
 USING (
   SELECT id,
          row_number() OVER (PARTITION BY user_id, product_id
                             ORDER BY created_at DESC NULLS LAST, id DESC) AS rang
     FROM cart_items
    WHERE user_id IS NOT NULL AND product_id IS NOT NULL
 ) x
 WHERE c.id = x.id AND x.rang > 1;

CREATE UNIQUE INDEX IF NOT EXISTS cart_items_user_product_uniq
  ON cart_items (user_id, product_id);

COMMENT ON INDEX cart_items_user_product_uniq IS
  'Une seule ligne par produit et par client. Permet aussi au front d''utiliser un upsert '
  '(ON CONFLICT) au lieu d''un « je lis, puis je décide » qui ne tient pas la concurrence.';

-- ===========================================================================
-- 10. Facturer une commande : numéro + facture + lignes + PORT, en une transaction
-- ===========================================================================
/*
  ## Le défaut remplacé
  Le back-office demandait un numéro, puis insérait la facture, puis les lignes, puis
  mettait à jour le statut — quatre allers-retours depuis le NAVIGATEUR. Un onglet fermé
  entre le premier et le deuxième laissait un NUMÉRO BRÛLÉ. Et surtout, les lignes ne
  reprenaient QUE `order_items` : le port disparaissait de la facture.

  ## Ce que fait cette fonction
  Tout, ou rien. Elle numérote, insère la facture, ses lignes de produits ET sa ligne de
  port, calcule les totaux, VÉRIFIE qu'ils valent le montant encaissé, puis émet le
  document. Une erreur en cours de route annule l'ensemble, numéro compris.

  ## Idempotence
  Une facture existe déjà pour cette commande ? On la RENVOIE, sans consommer de numéro.
  Un double clic ne produit donc pas deux factures pour une commande.

  ## La ligne de port
  `orders.shipping_cost_ht` est la source unique. Pour les commandes antérieures à cette
  colonne, on retombe sur `shipping_cost / 1,2` — c'est la conversion exacte, puisque le
  barème est saisi TTC et que `devis-commande` faisait déjà ce calcul pour composer
  `sub_total`. Le taux de la ligne de port est celui du RÉGIME de la commande : le port
  suit le sort fiscal du bien transporté, il n'a pas de régime propre (une livraison
  intracommunautaire exonérée l'est port compris).

  ## Le contrôle final
  `abs(total_ttc − orders.total) < 0,01`, sinon EXCEPTION. C'est volontairement BLOQUANT :
  une facture qui ne vaut pas ce que le client a payé est irrégulière, et la laisser sortir
  reviendrait à recréer, sous une autre forme, le défaut qu'on est en train de corriger.
  L'écart le plus probable est justement le port oublié.
*/
CREATE OR REPLACE FUNCTION public.creer_facture_depuis_commande(p_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  o            orders%ROWTYPE;
  v_serveur    boolean;
  v_existante  uuid;
  v_invoice_id uuid;
  v_numero     text;
  v_taux       numeric(5,2);
  v_port_ht    numeric(10,2);
  v_nom        text;
  v_email      text;
  v_mentions   text;
  v_delai      integer;
  v_rang       integer := 0;
  it           record;
  v_ht         numeric(12,2);
  v_tva        numeric(12,2);
BEGIN
  /* ★ Réservée aux administrateurs et au serveur. SECURITY DEFINER court-circuite la RLS :
     le contrôle DOIT se faire ici, sinon n'importe quel compte facturerait n'importe quelle
     commande — et lirait au passage le nom et l'adresse de son titulaire. */
  v_serveur :=
       coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
    OR current_user IN ('service_role', 'supabase_admin', 'postgres');

  IF NOT v_serveur AND NOT is_admin() THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  SELECT * INTO o FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Commande introuvable'; END IF;

  -- Idempotence : on ne brûle pas un numéro pour rien.
  SELECT id INTO v_existante
    FROM invoices
   WHERE order_id = p_order_id AND coalesce(document_type, 'invoice') = 'invoice'
   ORDER BY created_at
   LIMIT 1;
  IF v_existante IS NOT NULL THEN
    RETURN v_existante;
  END IF;

  v_taux := coalesce(o.vat_rate, 20);

  -- Port HT : colonne dédiée, à défaut conversion du barème TTC (÷ 1,2) — le même calcul
  -- que celui qui a servi à composer `sub_total` au moment du devis.
  v_port_ht := coalesce(o.shipping_cost_ht, round(coalesce(o.shipping_cost, 0) / 1.2, 2));

  SELECT btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
    INTO v_nom
    FROM profiles p WHERE p.id = o.user_id;
  IF coalesce(btrim(coalesce(v_nom, '')), '') = '' THEN
    v_nom := coalesce(o.company_name, 'Client');
  END IF;

  SELECT au.email INTO v_email FROM auth.users au WHERE au.id = o.user_id;

  SELECT bs.legal_mentions, bs.default_payment_terms
    INTO v_mentions, v_delai
    FROM billing_settings bs
   ORDER BY bs.created_at NULLS FIRST, bs.id
   LIMIT 1;

  v_numero := public.get_next_invoice_number_atomic();

  /* La facture naît en BROUILLON : les lignes n'existent pas encore, et le trigger
     d'inaltérabilité interdirait d'en ajouter à un document déjà émis. Elle est émise à la
     toute fin, une fois complète et vérifiée. */
  INSERT INTO invoices (
    invoice_number, order_id, customer_id, customer_name, customer_email,
    customer_address, billing_address, status, document_type,
    due_date, payment_terms, notes, legal_mentions,
    customer_country, is_company, company_name, vat_number,
    vat_regime, vat_rate, vat_mention, vat_territory, delivery_date,
    amount_paid
  ) VALUES (
    v_numero, o.id, o.user_id, v_nom, coalesce(v_email, ''),
    o.shipping_address, o.shipping_address, 'draft', 'invoice',
    (current_date + coalesce(v_delai, 30)), coalesce(v_delai, 30),
    NULL,   -- ⚠ `notes` est destiné au CLIENT : on n'y écrit pas de commentaire interne.
    v_mentions,
    o.customer_country, coalesce(o.is_company, false), o.company_name, o.vat_number,
    o.vat_regime, v_taux, o.vat_mention, o.vat_territory, o.delivery_date,
    0
  ) RETURNING id INTO v_invoice_id;

  -- Lignes de produits. `order_items.price` est le prix unitaire HT figé par le devis.
  FOR it IN
    SELECT oi.product_id, oi.quantity, oi.price, pr.name
      FROM order_items oi
      LEFT JOIN products pr ON pr.id = oi.product_id
     WHERE oi.order_id = o.id
     ORDER BY oi.created_at, oi.id
  LOOP
    v_rang := v_rang + 1;
    INSERT INTO invoice_items (
      invoice_id, product_id, description, quantity, unit_price_ht, tax_rate,
      sort_order, line_kind)
    VALUES (
      v_invoice_id, it.product_id, coalesce(it.name, 'Produit'),
      it.quantity, it.price, v_taux, v_rang, 'goods');
  END LOOP;

  /* ★ LA LIGNE QUI MANQUAIT. Sans elle, la facture est inférieure au montant encaissé du
     montant exact du port : chiffre d'affaires ET TVA sous-déclarés. */
  IF coalesce(v_port_ht, 0) <> 0 THEN
    v_rang := v_rang + 1;
    INSERT INTO invoice_items (
      invoice_id, product_id, description, quantity, unit_price_ht, tax_rate,
      sort_order, line_kind)
    VALUES (
      v_invoice_id, NULL,
      'Frais de port' || coalesce(' — ' || nullif(btrim(coalesce(o.shipping_method, '')), ''), ''),
      1, v_port_ht, v_taux, v_rang, 'shipping');
  END IF;

  /* Totaux recalculés ICI plutôt que lus depuis le trigger : la fonction ne doit pas
     dépendre de l'existence d'un trigger pour être juste. Même ordre de calcul que
     `update_invoice_totals_from_items` — un seul arrondi, TTC = HT + TVA. */
  SELECT round(coalesce(sum(ii.total_ht), 0), 2) INTO v_ht
    FROM invoice_items ii WHERE ii.invoice_id = v_invoice_id;

  SELECT coalesce(sum(round(t.base * t.taux / 100.0, 2)), 0) INTO v_tva
    FROM (
      SELECT ii.tax_rate AS taux, round(sum(ii.total_ht), 2) AS base
        FROM invoice_items ii WHERE ii.invoice_id = v_invoice_id
       GROUP BY ii.tax_rate
    ) t;

  UPDATE invoices
     SET subtotal_ht = v_ht, tax_amount = v_tva, total_ttc = v_ht + v_tva, updated_at = now()
   WHERE id = v_invoice_id;

  /* ★ CONTRÔLE BLOQUANT. Tout est annulé, numéro compris : mieux vaut pas de facture
     qu'une facture fausse, qui serait ensuite inaltérable. */
  IF o.total IS NOT NULL AND abs((v_ht + v_tva) - o.total) >= 0.01 THEN
    RAISE EXCEPTION
      'Facture non émise : total calculé % € ≠ total de la commande % € (écart % €). Vérifier shipping_cost_ht, les prix des lignes et le taux de TVA de la commande %.',
      (v_ht + v_tva), o.total, round(abs((v_ht + v_tva) - o.total), 2), o.id;
  END IF;

  /* Émission. Une commande réglée par carte donne une facture ACQUITTÉE : c'est ce que le
     client attend, et cela évite une relance automatique sur une facture déjà payée. */
  IF o.stripe_payment_intent_id IS NOT NULL THEN
    UPDATE invoices
       SET status = 'paid', paid_at = now(), amount_paid = v_ht + v_tva, sent_at = now()
     WHERE id = v_invoice_id;
  ELSE
    UPDATE invoices SET status = 'sent', sent_at = now() WHERE id = v_invoice_id;
  END IF;

  RETURN v_invoice_id;
END;
$function$;

COMMENT ON FUNCTION public.creer_facture_depuis_commande(uuid) IS
  'Numérote, insère la facture ET ses lignes (port compris) dans UNE transaction, puis '
  'refuse d''émettre si le total s''écarte de celui de la commande. Idempotente : rend la '
  'facture existante sans consommer de numéro. Administrateurs + service_role.';

REVOKE ALL ON FUNCTION public.creer_facture_depuis_commande(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.creer_facture_depuis_commande(uuid) TO authenticated, service_role;

-- ===========================================================================
-- 11. Émettre un AVOIR : la seule façon de corriger une facture
-- ===========================================================================
/*
  Puisqu'une facture émise est désormais verrouillée par la base, il FAUT fournir le geste
  de remplacement — sans quoi on aurait rendu la correction impossible au lieu de la rendre
  régulière.

  L'avoir reprend les lignes de la facture d'origine avec des quantités NÉGATIVES (et non
  des prix négatifs : le prix unitaire reste celui de la vente, ce qui se relit sans
  ambiguïté), porte son propre numéro issu de la séquence d'avoirs, et référence la facture
  annulée. La facture d'origine, elle, n'est pas retouchée : seul son STATUT bouge, ce que
  la liste blanche du trigger autorise.

  ⚠ Avoir TOTAL uniquement. Un avoir partiel suppose de choisir les lignes et les quantités,
  c'est-à-dire une interface : c'est le travail de F2, et cette fonction lui servira de
  modèle. Mieux vaut ne pas offrir un avoir partiel que d'en offrir un qui devine.
*/
CREATE OR REPLACE FUNCTION public.creer_avoir_depuis_facture(
  p_invoice_id uuid,
  p_motif      text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  f          invoices%ROWTYPE;
  v_serveur  boolean;
  v_existant uuid;
  v_avoir_id uuid;
  v_numero   text;
  it         record;
  v_rang     integer := 0;
BEGIN
  v_serveur :=
       coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
    OR current_user IN ('service_role', 'supabase_admin', 'postgres');

  IF NOT v_serveur AND NOT is_admin() THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  SELECT * INTO f FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Facture introuvable'; END IF;
  IF coalesce(f.document_type, 'invoice') <> 'invoice' THEN
    RAISE EXCEPTION 'On n''émet pas un avoir sur un avoir (% est de type %).',
      f.invoice_number, f.document_type;
  END IF;
  IF f.status = 'draft' THEN
    RAISE EXCEPTION 'La facture % est encore un brouillon : corrigez-la, un avoir n''a pas lieu d''être.',
      f.invoice_number;
  END IF;

  -- Idempotence : un avoir existe déjà pour cette facture ? On le rend.
  SELECT id INTO v_existant FROM invoices
   WHERE credit_note_of = p_invoice_id AND document_type = 'credit_note'
   ORDER BY created_at LIMIT 1;
  IF v_existant IS NOT NULL THEN RETURN v_existant; END IF;

  v_numero := public.get_next_credit_note_number();

  INSERT INTO invoices (
    invoice_number, order_id, customer_id, customer_name, customer_email,
    customer_address, billing_address, status, document_type, credit_note_of,
    due_date, payment_terms, notes, legal_mentions,
    customer_country, is_company, company_name, vat_number,
    vat_regime, vat_rate, vat_mention, vat_territory, delivery_date, amount_paid
  ) VALUES (
    v_numero, f.order_id, f.customer_id, f.customer_name, f.customer_email,
    f.customer_address, f.billing_address, 'draft', 'credit_note', f.id,
    current_date, f.payment_terms,
    coalesce(nullif(btrim(coalesce(p_motif, '')), ''),
             'Avoir sur la facture ' || f.invoice_number),
    f.legal_mentions,
    f.customer_country, f.is_company, f.company_name, f.vat_number,
    f.vat_regime, f.vat_rate, f.vat_mention, f.vat_territory, f.delivery_date, 0
  ) RETURNING id INTO v_avoir_id;

  FOR it IN
    SELECT ii.product_id, ii.description, ii.quantity, ii.unit_price_ht, ii.tax_rate,
           coalesce(ii.line_kind, 'goods') AS line_kind
      FROM invoice_items ii
     WHERE ii.invoice_id = f.id
     ORDER BY ii.sort_order, ii.id
  LOOP
    v_rang := v_rang + 1;
    INSERT INTO invoice_items (
      invoice_id, product_id, description, quantity, unit_price_ht, tax_rate,
      sort_order, line_kind)
    VALUES (
      v_avoir_id, it.product_id, it.description,
      -it.quantity,            -- ★ quantité négative : l'avoir défait exactement la vente
      it.unit_price_ht, it.tax_rate, v_rang, it.line_kind);
  END LOOP;

  -- Émission de l'avoir, puis marquage de la facture d'origine (colonne de suivi : la
  -- liste blanche du trigger d'inaltérabilité l'autorise, et elle seule).
  UPDATE invoices SET status = 'sent', sent_at = now() WHERE id = v_avoir_id;
  UPDATE invoices SET status = 'refunded' WHERE id = f.id;

  RETURN v_avoir_id;
END;
$function$;

COMMENT ON FUNCTION public.creer_avoir_depuis_facture(uuid, text) IS
  'Émet un avoir TOTAL (type 381) annulant une facture émise : quantités négatives, '
  'numérotation dans la séquence AV-, lien credit_note_of. Idempotente. Admins + service_role.';

REVOKE ALL ON FUNCTION public.creer_avoir_depuis_facture(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.creer_avoir_depuis_facture(uuid, text) TO authenticated, service_role;

-- ===========================================================================
-- 12. Le stock rendu à l'annulation et au remboursement
-- ===========================================================================
/*
  `decrement_stock_on_order_item` retire le stock à la création de la commande. RIEN ne le
  remettait quand la commande était annulée ou remboursée : chaque annulation faisait donc
  disparaître définitivement du stock qui n'avait jamais quitté l'entrepôt. Au bout de
  quelques annulations, le site affiche « épuisé » sur un produit dont il reste des dizaines
  d'exemplaires — et refuse des ventes.

  Le drapeau `stock_restored` rend l'opération non rejouable. Sans lui, une commande annulée
  puis rouverte puis réannulée rendrait le stock deux fois, c'est-à-dire inventerait de la
  marchandise : le symétrique exact du défaut qu'on corrige.

  ⚠ Choix assumé : une commande annulée qui repasserait en « confirmée » ne re-décrémente
  PAS le stock, et son drapeau reste levé. Ce cas n'existe pas dans le parcours (une
  annulation est définitive côté Stripe) ; le traiter automatiquement demanderait de
  distinguer une réouverture d'une correction de saisie, ce qu'aucune donnée ne permet.
  L'écart, s'il survenait, serait visible en stock — pas silencieux.
*/
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_restored boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN orders.stock_restored IS
  'Le stock des articles a-t-il déjà été remis en rayon ? Empêche une double restitution.';

CREATE OR REPLACE FUNCTION public.restaurer_stock_commande()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE it record;
BEGIN
  -- On ne réagit qu'à l'ENTRÉE dans un état d'annulation.
  IF NEW.status NOT IN ('cancelled', 'refunded') THEN RETURN NEW; END IF;
  IF OLD.status IN ('cancelled', 'refunded')     THEN RETURN NEW; END IF;
  IF coalesce(OLD.stock_restored, false)         THEN RETURN NEW; END IF;

  FOR it IN
    SELECT oi.product_id, oi.quantity
      FROM order_items oi
     WHERE oi.order_id = NEW.id AND oi.product_id IS NOT NULL
  LOOP
    -- Exactement l'inverse de `decrement_stock_on_order_item` : même colonne, même recalcul
    -- de `in_stock`. Si un jour l'une change, l'autre doit changer avec elle.
    UPDATE products
       SET stock_quantity = coalesce(stock_quantity, 0) + it.quantity,
           in_stock       = (coalesce(stock_quantity, 0) + it.quantity) > 0
     WHERE id = it.product_id;
  END LOOP;

  -- Trigger BEFORE : on pose le drapeau sur la ligne en cours d'écriture, sans second
  -- UPDATE — donc sans risque de récursion.
  NEW.stock_restored := true;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS restaurer_stock_commande_trg ON orders;
CREATE TRIGGER restaurer_stock_commande_trg
  BEFORE UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION public.restaurer_stock_commande();

NOTIFY pgrst, 'reload schema';

-- ===========================================================================
-- VÉRIFICATIONS — à exécuter APRÈS application (aucune n'écrit)
-- ===========================================================================
/*
-- 1. Les colonnes du contrat §2 sont bien là (attendu : 10 + 8 + 2 + 1 + 7).
SELECT table_name, count(*) AS colonnes_ajoutees
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND (
     (table_name = 'invoices'        AND column_name IN ('vat_territory','document_type','credit_note_of','delivery_date','tiime_invoice_id','tiime_invoice_number','tiime_ack_at','tiime_event_id','pdf_storage_path','pdf_sha256'))
  OR (table_name = 'payment_records' AND column_name IN ('order_id','status','stripe_charge_id','stripe_balance_transaction_id','stripe_fee','stripe_net','stripe_payout_id','stripe_payout_date'))
  OR (table_name = 'billing_settings'AND column_name IN ('credit_note_prefix','next_credit_note_number'))
  OR (table_name = 'profiles'        AND column_name = 'siret')
  OR (table_name = 'orders'          AND column_name IN ('vat_mention','vat_territory','shipping_cost_ht','shipping_carrier','shipping_service','shipping_relay','delivery_date'))
   )
 GROUP BY table_name ORDER BY 1;

-- 2. `refunded` est accepté par la contrainte de statut.
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'invoices_status_check';

-- 3. Les contraintes d'avoir sont posées ET validées (convalidated = true attendu).
SELECT conname, convalidated, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conname IN ('invoices_document_type_check','invoices_avoir_lien_check','invoices_avoir_negatif_check');

-- 4. Les triggers d'inaltérabilité et de stock sont en place (4 lignes attendues).
SELECT c.relname, t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
 WHERE NOT t.tgisinternal
   AND t.tgname IN ('invoices_inalterabilite_trg','invoice_items_inalterabilite_trg',
                    'restaurer_stock_commande_trg','calculate_invoice_item_totals_trigger');

-- 5. Les fonctions sensibles sont SECURITY DEFINER avec search_path figé.
SELECT proname, prosecdef, proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND proname IN ('get_next_invoice_number_atomic','get_next_credit_note_number',
                   'creer_facture_depuis_commande','creer_avoir_depuis_facture');

-- 6. Personne d'autre que le serveur et les comptes connectés n'exécute la numérotation.
SELECT p.proname, r.rolname, has_function_privilege(r.rolname, p.oid, 'EXECUTE') AS peut_executer
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN (VALUES ('anon'),('authenticated'),('service_role')) AS r(rolname)
 WHERE n.nspname = 'public'
   AND p.proname IN ('get_next_invoice_number_atomic','get_next_credit_note_number')
 ORDER BY 1, 2;   -- attendu : anon = false, authenticated = true, service_role = true

-- 7. Unicité effective (3 lignes attendues, dont l'unicité préexistante des commandes).
SELECT tablename, indexname, indexdef FROM pg_indexes
 WHERE schemaname = 'public'
   AND indexname IN ('cart_items_user_product_uniq','orders_pi_uniq',
                     'orders_stripe_payment_intent_id_key','refunds_stripe_refund_id_key');

-- 8. Plus aucun doublon de panier (0 attendu).
SELECT count(*) FROM (SELECT 1 FROM cart_items
  WHERE user_id IS NOT NULL AND product_id IS NOT NULL
  GROUP BY user_id, product_id HAVING count(*) > 1) d;

-- 9. ESSAI À BLANC de la facturation, SANS rien laisser derrière (à lancer en session psql) :
--    BEGIN;
--      SELECT public.creer_facture_depuis_commande((SELECT id FROM orders ORDER BY created_at DESC LIMIT 1));
--      SELECT invoice_number, subtotal_ht, tax_amount, total_ttc, status FROM invoices ORDER BY created_at DESC LIMIT 1;
--      SELECT description, quantity, unit_price_ht, tax_rate, total_ht, line_kind
--        FROM invoice_items ORDER BY sort_order;   -- une ligne « Frais de port » attendue
--    ROLLBACK;

-- 10. Contrôle d'inaltérabilité (doit lever une EXCEPTION) :
--     BEGIN;
--       UPDATE invoices SET customer_name = 'ESSAI' WHERE status <> 'draft';
--     ROLLBACK;
*/
