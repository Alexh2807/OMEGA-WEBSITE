/*
  # Panier, stock, suivi d'expédition et reprise des e-mails en échec

  Cinq défauts, tous constatés en lisant le schéma et le code existants.

  1. **Le panier peut contenir deux fois le même produit.** `cart_items` n'a aucune
     contrainte d'unicité sur (user_id, product_id). Un double clic, un rechargement au
     mauvais moment, deux onglets ouverts : deux lignes pour le même article. Le client
     voit son produit en double, et le total est faux. On dédoublonne l'existant en
     SOMMANT les quantités — on ne jette pas ce que le client avait mis dans son panier —
     puis on pose l'index unique qui empêche que cela recommence.

  2. **Le stock n'est jamais rendu.** `decrement_stock_on_order_item` retire le stock à la
     création de la commande. Rien ne le remet quand la commande est annulée ou
     remboursée : chaque annulation faisait donc disparaître définitivement du stock qui,
     lui, n'avait jamais quitté l'entrepôt. Au bout de quelques annulations, le site
     affiche « épuisé » sur un produit dont il reste des dizaines d'exemplaires.

  3. **La survente était masquée.** `GREATEST(0, stock_quantity - quantity)` empêchait le
     stock d'aller sous zéro : la base racontait donc « il en reste 0 » alors qu'il en
     manquait 3. Un écart caché ne se corrige pas — il se découvre à la préparation de
     commande, quand il est trop tard. Le stock passe désormais en NÉGATIF, et une alerte
     est journalisée dans `admin_logs`.

  4. **L'e-mail de suivi ne partait jamais.** Le trigger `notify_order_trg` était posé
     `AFTER INSERT OR UPDATE OF status` : ajouter le lien de suivi APRÈS avoir passé la
     commande en « expédiée » — c'est-à-dire ce que fait l'exploitant, puisqu'il obtient le
     numéro de suivi au dépôt du colis — ne déclenchait rien. Le client apprenait
     l'expédition sans lien, et ne recevait jamais le lien.

  5. **Un e-mail en échec restait en échec.** Le journal montrait l'échec, et c'est tout :
     aucun moyen de relancer l'envoi sans rejouer à la main l'événement métier.

  Idempotente et rejouable ; aucune donnée n'est détruite (le dédoublonnage du panier
  conserve la somme des quantités).
*/

-- ===========================================================================
-- 1. Panier : une ligne par produit et par client
-- ===========================================================================
/*
  ⚠ Ordre imposé : on FUSIONNE d'abord, on contraint ensuite. Poser l'index avant le
  nettoyage le ferait échouer sur la première paire de doublons — et une migration qui
  échoue à mi-parcours en production, c'est le scénario qu'on refuse.

  La ligne conservée est la PLUS RÉCENTE (celle que le client vient de manipuler), et elle
  reçoit la SOMME des quantités : personne ne perd d'article.
  Les lignes orphelines (`user_id` ou `product_id` nul) sont exclues du regroupement —
  `GROUP BY` traite les NULL comme égaux, ce qui les fusionnerait à tort entre elles.
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
-- 2. Le stock rendu à l'annulation et au remboursement
-- ===========================================================================
/*
  Le drapeau `stock_restored` est ce qui rend l'opération non rejouable. Sans lui, une
  commande annulée puis rouverte puis réannulée rendrait le stock deux fois — et on
  inventerait de la marchandise, ce qui est le symétrique exact du défaut qu'on corrige.

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
AS $$
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
    -- Exactement l'inverse de `decrement_stock_on_order_item` : même colonne, même
    -- recalcul de `in_stock`. Si un jour l'une change, l'autre doit changer avec elle.
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
$$;

DROP TRIGGER IF EXISTS restaurer_stock_commande_trg ON orders;
CREATE TRIGGER restaurer_stock_commande_trg
  BEFORE UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION public.restaurer_stock_commande();

-- ===========================================================================
-- 3. La survente cesse d'être invisible
-- ===========================================================================
/*
  ## Pourquoi laisser le stock devenir négatif
  `GREATEST(0, …)` semblait prudent : le stock ne descendait jamais sous zéro. En réalité
  il MENTAIT. Deux commandes simultanées sur le dernier exemplaire donnaient « stock 0 »
  dans les deux cas, et personne ne savait qu'un client attendait un produit qui n'existait
  pas. La vérité — « il en manque 2 » — est ce qui permet de réagir : commander, prévenir,
  rembourser.

  ⚠ On ne REFUSE pas la commande pour autant. Le client a déjà payé quand ces lignes sont
  écrites (`confirmer_commande` n'est appelée qu'après vérification du paiement auprès de
  Stripe) : faire échouer l'insertion créerait un encaissement sans commande, c'est-à-dire
  le pire des cas. On enregistre, et on alerte.
*/
CREATE OR REPLACE FUNCTION public.decrement_stock_on_order_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_restant integer;
  v_nom     text;
BEGIN
  UPDATE products
     SET stock_quantity = coalesce(stock_quantity, 0) - NEW.quantity,
         in_stock       = (coalesce(stock_quantity, 0) - NEW.quantity) > 0
   WHERE id = NEW.product_id
   RETURNING stock_quantity, name INTO v_restant, v_nom;

  IF v_restant IS NOT NULL AND v_restant < 0 THEN
    RAISE WARNING 'SURVENTE : « % » (%) passe à % en stock (commande %, % pièce(s)).',
      coalesce(v_nom, '?'), NEW.product_id, v_restant, NEW.order_id, NEW.quantity;

    /* Le journal d'administration est le bon endroit : il est déjà lu par le back-office,
       il est horodaté et il survit au redémarrage — contrairement à un message de log. */
    BEGIN
      INSERT INTO admin_logs (admin_id, action, target_type, target_id, details)
      VALUES (NULL, 'stock_negatif', 'product', NEW.product_id,
              jsonb_build_object(
                'produit',            coalesce(v_nom, '?'),
                'stock_restant',      v_restant,
                'quantite_commandee', NEW.quantity,
                'order_id',           NEW.order_id));
    EXCEPTION WHEN OTHERS THEN
      -- Une alerte qui échoue ne doit jamais faire échouer la commande qu'elle signale.
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$;

-- ===========================================================================
-- 4. Le lien de suivi déclenche l'e-mail
-- ===========================================================================
/*
  Le geste réel de l'exploitant : il passe la commande en « expédiée » le matin, puis colle
  le lien de suivi quand le transporteur le lui donne, parfois des heures plus tard. Le
  trigger ne regardant que `status`, ce second geste ne prévenait personne.
  On élargit la condition ET la clause `UPDATE OF` du trigger — l'une sans l'autre ne sert
  à rien : `UPDATE OF status` ne déclenche même pas la fonction quand seul le lien change.
*/
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_link text;

CREATE OR REPLACE FUNCTION public.notify_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM private.notify('order_new', jsonb_build_object('id', NEW.id));
    PERFORM private.notify('order_ack', jsonb_build_object('id', NEW.id));
  ELSIF NEW.status IS DISTINCT FROM OLD.status
     OR (NEW.tracking_link IS DISTINCT FROM OLD.tracking_link AND NEW.tracking_link IS NOT NULL)
  THEN
    PERFORM private.notify('order_status', jsonb_build_object(
      'id',           NEW.id,
      'avant',        OLD.status,
      'apres',        NEW.status,
      -- Permet à la fonction Edge d'écrire « votre colis est en route » plutôt que de
      -- répéter un changement de statut qui n'a pas eu lieu.
      'suivi_ajoute', (NEW.tracking_link IS DISTINCT FROM OLD.tracking_link
                       AND NEW.tracking_link IS NOT NULL)));
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS notify_order_trg ON public.orders;
CREATE TRIGGER notify_order_trg
  AFTER INSERT OR UPDATE OF status, tracking_link ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_order();

-- ===========================================================================
-- 5. Reprendre un e-mail en échec
-- ===========================================================================
/*
  Le journal retenait l'échec sans permettre d'y répondre. Or un échec d'envoi est presque
  toujours passager (serveur SMTP indisponible, quota momentané) : ce qu'il faut, c'est
  pouvoir réessayer, pas reconstituer l'événement métier à la main.

  Trois colonnes de traçabilité — un renvoi doit rester distinguable de l'envoi d'origine,
  sinon on ne sait plus combien de messages le client a réellement reçus.
*/
ALTER TABLE public.email_log
  ADD COLUMN IF NOT EXISTS renvoi_de         uuid REFERENCES public.email_log(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS renvois           integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dernier_renvoi_at timestamptz;

COMMENT ON COLUMN public.email_log.renvoi_de IS
  'Ligne d''origine quand cet envoi est un renvoi. NULL pour un envoi initial.';

/*
  Index partiel : la file de reprise, c'est « les échecs, du plus récent au plus ancien ».
  Partiel parce qu'un échec est rare — indexer la table entière pour retrouver 0,5 % des
  lignes coûterait plus qu'il ne rapporte, alors qu'un index partiel tient en mémoire.
*/
CREATE INDEX IF NOT EXISTS email_log_echecs_idx
  ON public.email_log (created_at DESC)
  WHERE statut = 'echec';

CREATE INDEX IF NOT EXISTS email_log_renvoi_de_idx
  ON public.email_log (renvoi_de)
  WHERE renvoi_de IS NOT NULL;

/*
  ## `renvoyer_email` — remettre une ligne en échec dans la file

  La base ne sait pas envoyer un e-mail : elle demande à la fonction Edge de le faire, par
  le même point de passage unique que toutes les notifications (`private.notify`). On
  n'invente donc pas un second chemin d'envoi — il n'y en a qu'un, et c'est celui-là.

  `p_force := true` : le renvoi court-circuite la grille de réglages. Un administrateur qui
  clique « renvoyer » a déjà décidé ; lui opposer un interrupteur global serait absurde.

  ⚠ La ligne d'origine n'est PAS modifiée en « envoyé » : elle a échoué, c'est un fait, et
  un journal qui réécrit son passé ne vaut rien. On compte les tentatives, et la fonction
  Edge journalisera une NOUVELLE ligne pour le renvoi.

  ⚠ DÉPENDANCE À DÉCLARER : la fonction Edge `send-notification` doit reconnaître
  l'événement `email_renvoi` et réexpédier le corps fourni tel quel. Sans ce cas, l'appel
  part et ne produit rien (`composer()` rend `null`, ce qui est traité comme « rien à
  envoyer » — donc sans erreur, mais sans effet non plus).
*/
CREATE OR REPLACE FUNCTION public.renvoyer_email(p_log_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE l public.email_log%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  SELECT * INTO l FROM public.email_log WHERE id = p_log_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Envoi introuvable';
  END IF;

  IF l.statut <> 'echec' THEN
    RAISE EXCEPTION 'Cet envoi a été accepté par le serveur : il n''y a rien à renvoyer.';
  END IF;

  IF coalesce(btrim(coalesce(l.destinataire, '')), '') = '' THEN
    RAISE EXCEPTION 'Aucun destinataire sur cette ligne du journal.';
  END IF;

  -- Le corps est repris TEL QUEL : réexécuter le gabarit d'origine rejouerait des données
  -- qui ont pu changer depuis (statut de commande, réponse d'un message). On renvoie le
  -- message qui n'est pas parti, pas un message nouveau qui lui ressemblerait.
  PERFORM private.notify(
    'email_renvoi',
    jsonb_build_object(
      'log_id',       l.id,
      'evenement',    l.evenement,
      'destinataire', l.destinataire,
      'objet',        l.objet,
      'corps_html',   l.corps_html,
      'corps_texte',  l.corps_texte),
    true);

  UPDATE public.email_log
     SET renvois = coalesce(renvois, 0) + 1,
         dernier_renvoi_at = now()
   WHERE id = l.id;

  RETURN jsonb_build_object(
    'ok', true,
    'destinataire', l.destinataire,
    'corps_disponible', l.corps_html IS NOT NULL OR l.corps_texte IS NOT NULL,
    'renvois', coalesce(l.renvois, 0) + 1);
END;
$$;

COMMENT ON FUNCTION public.renvoyer_email(uuid) IS
  'Remet un envoi en échec dans la file (événement « email_renvoi »). Administrateurs '
  'seulement. Ne réécrit jamais le verdict de la ligne d''origine.';

REVOKE ALL ON FUNCTION public.renvoyer_email(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.renvoyer_email(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
