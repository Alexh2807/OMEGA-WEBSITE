/*
  # Fermeture des dernières portes laissées ouvertes par les policies héritées

  Cette migration ne crée aucune fonctionnalité : elle REFERME. Chaque point ci-dessous
  correspond à une écriture que le navigateur pouvait faire et qui n'aurait jamais dû lui
  appartenir. Le principe est toujours le même, et c'est celui du dépôt depuis le 3 août :
  **le navigateur envoie des identifiants, le serveur décide.**

  ## Ce qui est refermé, et pourquoi
  1. `orders` — policy « Users can insert their own orders » : un client pouvait insérer
     lui-même une commande, donc en fixer `sub_total`, `tax` et `total`. C'est exactement
     la faille que `confirmer_commande` (réservée à `service_role` depuis le 4 août) a été
     écrite pour fermer ; la policy la laissait grande ouverte à côté.
  2. `order_items` — même raisonnement pour les LIGNES : pouvoir insérer une ligne à
     0,01 € sur sa propre commande revient à choisir son prix. La table n'ayant jamais été
     créée par une migration, on ne peut pas nommer ses policies : on parcourt donc
     `pg_policies`.
  3. `product_reviews` — un client pouvait se décerner « achat vérifié », se pré-approuver
     (`status = 'approved'`), s'écrire une réponse de la boutique (`admin_response`) et se
     donner autant de « utile » qu'il voulait. Un avis est un contenu public : il fait
     vendre. Ces quatre colonnes appartiennent au serveur.
  4. `planning_providers` — la policy « Authenticated users can view providers » du
     14 octobre exposait la colonne `costs` (coût interne par prestataire) à tout compte
     connecté. La migration du 2 août avait posé la bonne policy mais laissé l'ancienne
     en place : deux policies PERMISSIVES s'additionnent, la plus large gagne.
  5. `email_verifications` — « Allow public email verification » rendait TOUS les jetons de
     vérification lisibles par `anon`. Avec un jeton on valide l'adresse d'autrui.
  6. `profiles` — « Admins can manage everything » portait une adresse e-mail EN DUR et
     interrogeait `auth.users` depuis une policy. Le ménage du 2 août l'avait manquée.
  7. `contact_requests` — l'insertion publique acceptait n'importe quel `user_id` : on
     pouvait déposer un message AU NOM d'un autre client, qui le retrouvait dans « Mes
     messages ». Même correction que sur `bug_reports` le 2 août.
  8. `log_admin_action` — la fonction acceptait l'identifiant de l'administrateur EN
     PARAMÈTRE. Un journal d'audit dont l'auteur est fourni par l'appelant ne prouve rien.
  9. `search_path` sur les fonctions `SECURITY DEFINER` qui n'en portaient pas : sans lui,
     l'appelant choisit dans quel schéma les tables sont résolues et peut faire exécuter
     SON code avec les droits du propriétaire de la fonction.
 10. `submit_bug_report` / `bug_reports_link_account` — le rattachement AUTOMATIQUE par
     e-mail attachait le ticket d'un inconnu au compte de la personne dont il avait tapé
     l'adresse. On ne rattache plus que si l'appelant est authentifié.
 11. Rattrapage RLS sur `vies_checks` et `refunds`, créées hors migration par les fonctions
     Edge : elles contiennent des données de tiers et des identifiants Stripe.

  Idempotente et rejouable : `DROP POLICY IF EXISTS` partout, blocs `DO` gardés par
  `to_regclass`, aucune donnée touchée.
*/

-- ===========================================================================
-- 1. orders — le client ne crée plus sa commande
-- ===========================================================================
/*
  Depuis le 4 août, la commande est écrite par `confirmer_commande`, appelée par la
  fonction Edge `confirmer-commande` avec la clé `service_role` — laquelle contourne la
  RLS. Retirer cette policy ne casse donc AUCUN chemin légitime : elle ne servait plus
  qu'au chemin qu'on veut interdire.
*/
DROP POLICY IF EXISTS "Users can insert their own orders" ON orders;
DROP POLICY IF EXISTS "Users can insert their own orders." ON orders;

-- ===========================================================================
-- 2. order_items — aucune écriture depuis le navigateur
-- ===========================================================================
/*
  `order_items` n'a jamais été créée par une migration (elle vient du socle initial) : on
  ne connaît donc ni le nom ni le nombre de ses policies. On les cherche.

  ⚠ On ne supprime QUE les policies d'INSERT. Une policy `FOR ALL` est presque toujours la
  policy d'administration : la supprimer aveuglément retirerait au back-office le droit de
  lire les lignes de commande. Si on en trouve une, on le SIGNALE au lieu de casser.
*/
DO $mig$
DECLARE
  p record;
  v_rls boolean;
BEGIN
  IF to_regclass('public.order_items') IS NULL THEN
    RAISE NOTICE 'order_items absente : rien à faire.';
    RETURN;
  END IF;

  FOR p IN
    SELECT policyname, cmd
      FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'order_items'
  LOOP
    IF p.cmd = 'INSERT' THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.order_items', p.policyname);
      RAISE NOTICE 'order_items : policy d''INSERT « % » supprimée.', p.policyname;
    ELSIF p.cmd = 'ALL' AND p.policyname <> 'order_items_admin_all' THEN
      -- (« order_items_admin_all » est celle que cette migration pose elle-même, plus bas :
      --  la signaler à chaque rejeu ne ferait que du bruit.)
      RAISE WARNING 'order_items : policy « % » en FOR ALL — elle autorise aussi l''INSERT. À revoir à la main si elle vise autre chose que les administrateurs.', p.policyname;
    END IF;
  END LOOP;

  -- Lecture : chacun les lignes de SES commandes, l'administrateur toutes.
  -- (Le formulaire d'avis interroge déjà `order_items` filtré sur ses propres commandes,
  --  et « Mes commandes » les lit en jointure : ces deux usages restent servis.)
  DROP POLICY IF EXISTS "order_items_select_proprietaire" ON public.order_items;
  CREATE POLICY "order_items_select_proprietaire" ON public.order_items
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.user_id = auth.uid()));

  DROP POLICY IF EXISTS "order_items_admin_all" ON public.order_items;
  CREATE POLICY "order_items_admin_all" ON public.order_items
    FOR ALL TO authenticated
    USING (public.is_admin()) WITH CHECK (public.is_admin());

  -- ⚠ Poser des policies sans activer la RLS ne protège de RIEN : c'est précisément le
  -- défaut constaté sur `profiles` le 2 août. On l'active donc explicitement.
  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE oid = to_regclass('public.order_items');
  IF NOT coalesce(v_rls, false) THEN
    EXECUTE 'ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY';
    RAISE NOTICE 'order_items : RLS activée (elle ne l''était pas).';
  END IF;
END
$mig$;

-- ===========================================================================
-- 3. product_reviews — un avis ne s'auto-décerne pas sa crédibilité
-- ===========================================================================
/*
  Quatre colonnes ne regardent pas le client :
    · `status`            — c'est la modération qui approuve, pas l'auteur ;
    · `verified_purchase` — le badge « Achat vérifié » se MÉRITE ; il était jusqu'ici
                            envoyé par le navigateur (`verified_purchase: hasOrdered`),
                            donc falsifiable en une requête ;
    · `admin_response`    — écrire une réponse « de la boutique » sous son propre avis ;
    · `helpful_count`     — le classement « les plus utiles » se manipulait tout seul.

  Trois pièces, et l'ordre compte :

  1. Un trigger AVANT écriture qui remet ces colonnes à leur valeur serveur. Il évite de
     casser le formulaire d'avis, qui envoie encore `verified_purchase: hasOrdered` — le
     champ est désormais simplement IGNORÉ au lieu de faire échouer l'envoi.
  2. Les policies, avec le `WITH CHECK` strict demandé. Elles décrivent ce que le CLIENT a
     le droit de DEMANDER : un avis en attente, non vérifié, sans réponse, sans vote.
     ⚠ Le `WITH CHECK` est évalué APRÈS les triggers BEFORE : les deux doivent donc
     s'accorder, d'où le `verified_purchase := false` du trigger BEFORE.
  3. Un trigger APRÈS insertion qui PROMEUT l'avis en « achat vérifié » quand la commande
     existe réellement. Il tourne après le contrôle de policy, donc sans le contredire, et
     avec les droits du propriétaire — c'est le SERVEUR qui décerne le badge, à partir des
     commandes en base. Le badge veut enfin dire quelque chose.
*/
CREATE OR REPLACE FUNCTION public.product_reviews_forcer_champs_serveur()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Le serveur (service_role / tâches SQL), les administrateurs (c'est la modération) et
  -- les écritures faites PAR un trigger (la promotion « achat vérifié » ci-dessous)
  -- passent sans retouche. Même découpage que `profiles_protect_privileged_columns`.
  IF auth.uid() IS NULL OR pg_trigger_depth() > 1 OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.user_id           := auth.uid();
    NEW.status            := 'pending';
    NEW.admin_response    := NULL;
    NEW.helpful_count     := 0;
    NEW.verified_purchase := false;   -- décerné juste après, par le serveur
  ELSE
    NEW.status            := OLD.status;
    NEW.admin_response    := OLD.admin_response;
    NEW.helpful_count     := OLD.helpful_count;
    NEW.verified_purchase := OLD.verified_purchase;
    NEW.user_id           := OLD.user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_reviews_forcer_champs_serveur_trg ON product_reviews;
CREATE TRIGGER product_reviews_forcer_champs_serveur_trg
  BEFORE INSERT OR UPDATE ON product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.product_reviews_forcer_champs_serveur();

/*
  ★ Le badge « Achat vérifié », CONSTATÉ et non déclaré. On le pose après coup, quand la
  ligne existe : le contrôle de policy est passé, et cette écriture-ci vient du serveur.
*/
CREATE OR REPLACE FUNCTION public.product_reviews_marquer_achat_verifie()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.verified_purchase IS TRUE THEN
    RETURN NULL;   -- déjà décerné (écriture d'un administrateur ou du serveur)
  END IF;

  IF EXISTS (
       SELECT 1 FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
        WHERE oi.product_id = NEW.product_id
          AND o.user_id = NEW.user_id
          AND o.status IN ('confirmed', 'shipped', 'delivered'))
  THEN
    UPDATE product_reviews SET verified_purchase = true WHERE id = NEW.id;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS product_reviews_marquer_achat_verifie_trg ON product_reviews;
CREATE TRIGGER product_reviews_marquer_achat_verifie_trg
  AFTER INSERT ON product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.product_reviews_marquer_achat_verifie();

DROP POLICY IF EXISTS "Authenticated users can create reviews" ON product_reviews;
CREATE POLICY "Authenticated users can create reviews"
  ON product_reviews FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'pending'
    AND verified_purchase = false
    AND admin_response IS NULL
    AND coalesce(helpful_count, 0) = 0
  );

/*
  ⚠ `helpful_count = 0` sur l'UPDATE aussi : un avis modifiable est un avis « pending »,
  donc invisible du public (la policy de lecture publique ne montre que les « approved »).
  Il ne peut donc pas avoir accumulé de votes. Si un jour ce n'était plus vrai, c'est que
  quelque chose d'autre aurait dérapé — et on préfère que l'écriture soit refusée.
*/
DROP POLICY IF EXISTS "Users can update their own pending reviews" ON product_reviews;
CREATE POLICY "Users can update their own pending reviews"
  ON product_reviews FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'pending'
    AND verified_purchase = false
    AND admin_response IS NULL
    AND coalesce(helpful_count, 0) = 0
  );

-- ===========================================================================
-- 4. planning_providers — le coût des prestataires n'est pas public
-- ===========================================================================
/*
  Deux policies permissives s'ADDITIONNENT en PostgreSQL : tant que celle du 14 octobre
  subsistait, la policy restrictive posée le 2 août ne servait à rien.
*/
DROP POLICY IF EXISTS "Authenticated users can view providers" ON planning_providers;
DROP POLICY IF EXISTS "Admins can manage providers"            ON planning_providers;
-- (« planning_providers_admin_all », posée le 2 août, reste la seule policy de la table.)

-- ===========================================================================
-- 5. email_verifications — les jetons ne sont pas publics
-- ===========================================================================
/*
  Un jeton de vérification vaut preuve d'adresse : le rendre lisible par `anon` permettait
  de confirmer l'adresse de n'importe qui. La suppression de comptes et la validation
  passent par des fonctions Edge en `service_role`, qui contournent la RLS : rien ne casse.
*/
DROP POLICY IF EXISTS "Allow public email verification" ON email_verifications;

-- ===========================================================================
-- 6. profiles — dernière policy à adresse e-mail en dur
-- ===========================================================================
/*
  Elle datait du 25 juillet, interrogeait `auth.users` depuis une policy de `profiles` et
  reposait sur une adresse figée. Le modèle retenu le 2 août est `profiles.role` via
  `is_admin()`, et la policy « profiles_admin_all » le fait déjà.
*/
DROP POLICY IF EXISTS "Admins can manage everything" ON profiles;

-- ===========================================================================
-- 7. contact_requests — on ne dépose pas un message au nom d'autrui
-- ===========================================================================
/*
  Le formulaire de contact reste ouvert aux visiteurs non connectés — c'est son objet.
  Mais `user_id` ne peut plus être n'importe lequel : soit NULL (visiteur), soit le sien.
  Exactement la contrainte posée sur `bug_reports` le 2 août.
*/
DROP POLICY IF EXISTS "Anyone can submit contact requests" ON contact_requests;
CREATE POLICY "Anyone can submit contact requests"
  ON contact_requests FOR INSERT TO public
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- ===========================================================================
-- 8. log_admin_action — un journal d'audit ne se laisse pas dicter son auteur
-- ===========================================================================
/*
  L'ancienne signature prenait `p_admin_id` : l'appelant désignait donc lui-même l'auteur
  de l'action journalisée. Un journal qu'on peut signer du nom d'un autre ne prouve rien
  et, pire, accuse quelqu'un d'autre.

  ⚠ On GARDE la signature à l'identique — un `DROP` suivi d'un `CREATE` avec moins de
  paramètres créerait une surcharge et rendrait les appels ambigus côté PostgREST. Le
  paramètre est simplement IGNORÉ, et un commentaire le dit.
*/
CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_admin_id   uuid,
  p_action     text,
  p_target_type text,
  p_target_id  uuid DEFAULT NULL,
  p_details    jsonb DEFAULT '{}'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- `p_admin_id` est volontairement ignoré : seul `auth.uid()` dit qui agit vraiment.
  INSERT INTO admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), p_action, p_target_type, p_target_id, coalesce(p_details, '{}'::jsonb));
END;
$$;

COMMENT ON FUNCTION public.log_admin_action(uuid, text, text, uuid, jsonb) IS
  'Journalise une action d''administration. ⚠ Le paramètre p_admin_id est conservé pour '
  'compatibilité mais IGNORÉ : l''auteur vient de auth.uid(), jamais de l''appelant.';

REVOKE ALL ON FUNCTION public.log_admin_action(uuid, text, text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_admin_action(uuid, text, text, uuid, jsonb)
  TO service_role;

-- ===========================================================================
-- 9. `search_path` sur les fonctions à droits élevés
-- ===========================================================================
/*
  Une fonction `SECURITY DEFINER` s'exécute avec les droits de son PROPRIÉTAIRE. Si son
  `search_path` n'est pas figé, l'appelant peut créer un schéma temporaire contenant une
  table `profiles` de son cru, le placer en tête du chemin de recherche, et faire écrire
  la fonction chez lui — avec les droits du propriétaire. C'est l'escalade de privilèges
  classique chez PostgreSQL, et l'invariant n° 4 du contrat.

  ⚠ On passe par `ALTER FUNCTION … SET search_path` plutôt que de réécrire les corps :
  réécrire, c'est risquer d'introduire une différence de comportement dans huit fonctions
  qu'on ne teste pas ici. Un `ALTER` ne touche pas une ligne de code.

  Le bloc boucle sur `pg_proc` : une fonction absente de cette base (elles n'ont pas toutes
  la même histoire) ne fait pas échouer la migration, et une fonction qui porte DÉJÀ un
  `search_path` n'est pas retouchée.
*/
DO $mig$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS signature, p.proname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
             'log_admin_action', 'get_user_email', 'get_next_invoice_number',
             'get_next_quote_number', 'get_next_invoice_number_atomic',
             'generate_invoice_number', 'handle_new_user', 'decrement_stock_on_order_item')
       AND NOT EXISTS (
             SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) AS c
              WHERE split_part(c, '=', 1) = 'search_path')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', f.signature);
    RAISE NOTICE 'search_path=public posé sur %', f.signature;
  END LOOP;
END
$mig$;

-- `handle_new_user` vit sur `auth.users` et n'écrit que dans `public.profiles`, qu'elle
-- qualifie déjà explicitement : figer le chemin sur `public` ne change rien à son travail.

-- ===========================================================================
-- 10. Signalements : plus de rattachement automatique par e-mail
-- ===========================================================================
/*
  ## Le défaut
  `bug_reports_link_account()` cherchait, pour un dépôt ANONYME, un compte dont l'adresse
  correspondait à celle saisie, et lui attribuait le ticket. Conséquences :
   · taper l'adresse d'un tiers déposait un ticket DANS SON COMPTE (« Mes messages ») —
     un inconnu écrit en votre nom au support ;
   · à l'inverse, le déposant anonyme perdait la maîtrise de son ticket, désormais
     rattaché à un compte qui n'est pas le sien.

  ## La correction
  On ne rattache QUE si l'appelant est authentifié : `auth.uid()`. Un dépôt anonyme reste
  anonyme et se suit par son `track_code` — ce qui était déjà le mécanisme prévu.
  Le trigger n'est pas supprimé mais REMPLACÉ par une garde : il continue de forcer
  `user_id` à l'identité réelle de l'appelant, ce qui interdit aussi l'usurpation par un
  compte connecté qui fabriquerait un `user_id`.
*/
CREATE OR REPLACE FUNCTION public.bug_reports_link_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
BEGIN
  -- Écriture serveur (service_role, tâches SQL) : on ne touche à rien.
  IF auth.uid() IS NULL THEN
    -- ⚠ Plus AUCUNE recherche par e-mail ici : c'était la porte d'entrée du problème.
    NEW.user_id := NULL;
    RETURN NEW;
  END IF;

  -- Appelant authentifié : le ticket est le sien, quoi qu'il ait envoyé.
  NEW.user_id := auth.uid();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.bug_reports_link_account() IS
  'Rattache un signalement à son auteur RÉEL (auth.uid()). Le rattachement par e-mail a '
  'été retiré : il permettait de déposer un ticket dans le compte d''un tiers.';

/*
  `submit_bug_report` : même règle, dite explicitement dans la fonction plutôt que laissée
  au trigger. On utilise `CREATE OR REPLACE` avec la signature EXACTE des dix paramètres —
  un `DROP` + `CREATE` avec une signature différente créerait une surcharge et casserait
  l'appel PostgREST pour toutes les versions de l'application déjà installées.
*/
CREATE OR REPLACE FUNCTION public.submit_bug_report(
  p_title         text,
  p_body          text,
  p_email         text DEFAULT NULL,
  p_version       text DEFAULT NULL,
  p_platform      text DEFAULT NULL,
  p_diagnostics   text DEFAULT NULL,
  p_show_data     text DEFAULT NULL,
  p_show_name     text DEFAULT NULL,
  p_show_bytes    integer DEFAULT NULL,
  p_show_encoding text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE v_id uuid; v_code text; v_user uuid; v_show text; v_enc text;
BEGIN
  IF p_title IS NULL OR char_length(btrim(p_title)) < 4 THEN
    RAISE EXCEPTION 'Titre trop court';
  END IF;
  IF p_body IS NULL OR char_length(btrim(p_body)) < 12 THEN
    RAISE EXCEPTION 'Description trop courte';
  END IF;

  -- Un show hors bornes ne fait PAS échouer le signalement : le message du client est ce
  -- qui compte, on le garde et on laisse la pièce jointe de côté.
  v_show := p_show_data;
  v_enc  := p_show_encoding;
  IF v_show IS NOT NULL AND char_length(v_show) > 3000000 THEN
    v_show := NULL; v_enc := NULL;
  END IF;
  IF v_enc IS NOT NULL AND v_enc NOT IN ('gzip+base64', 'json') THEN
    v_enc := NULL; v_show := NULL;
  END IF;

  -- ★ SEULE source du rattachement. NULL = dépôt anonyme, suivi par `track_code` :
  -- c'est légitime et c'est le mode prévu. On ne cherche PLUS de compte par e-mail.
  v_user := auth.uid();

  INSERT INTO bug_reports (
    user_id, contact_email, title, body, app_version, platform, diagnostics,
    show_data, show_name, show_bytes, show_encoding
  )
  VALUES (
    v_user,
    nullif(btrim(coalesce(p_email, '')), ''),
    left(btrim(p_title), 140),
    left(btrim(p_body), 20000),
    left(coalesce(p_version, ''), 40),
    left(coalesce(p_platform, ''), 120),
    left(coalesce(p_diagnostics, ''), 20000),
    v_show,
    left(coalesce(p_show_name, ''), 120),
    p_show_bytes,
    v_enc
  )
  RETURNING id, track_code INTO v_id, v_code;

  RETURN jsonb_build_object(
    'id', v_id,
    'track_code', v_code,
    'lie_au_compte', v_user IS NOT NULL,
    'show_joint', v_show IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_bug_report(text, text, text, text, text, text, text, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_bug_report(text, text, text, text, text, text, text, text, integer, text) TO anon, authenticated;

-- ===========================================================================
-- 11. Rattrapage : tables créées hors migration par les fonctions Edge
-- ===========================================================================
/*
  `vies_checks` (cache des réponses du fichier européen VIES) et `refunds` (remboursements
  Stripe) ont été créées à la volée par `verifier-tva` et `process-refund`. Créées ainsi,
  elles n'ont ni RLS ni policy : chez Supabase, `anon` détient par défaut SELECT/INSERT/
  UPDATE/DELETE sur les tables de `public`. Sans RLS, plus rien ne le retient — c'est
  exactement ce qui avait été constaté sur `profiles` le 2 août.

  Contenu exposé : `vies_checks` porte la RAISON SOCIALE et l'ADRESSE que VIES rattache à
  chaque numéro contrôlé — soit précisément ce que le verrou anti-usurpation du 4 août
  refuse de montrer au client. `refunds` porte les identifiants Stripe et les montants.

  Le bloc est gardé par `to_regclass` : si les tables n'existent pas encore (elles
  n'apparaissent qu'au premier appel des fonctions Edge), la migration passe sans bruit.
  `refunds` sera de toute façon créée proprement par 20260805020000.
*/
DO $mig$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['vies_checks', 'refunds'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'Table % absente : rattrapage RLS différé.', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING (public.is_admin()) WITH CHECK (public.is_admin())', t || '_admin_all', t);

    -- Aucune policy pour `anon` ni pour un client : les fonctions Edge écrivent avec
    -- `service_role`, qui contourne la RLS. Rien ne casse côté serveur.
    RAISE NOTICE 'RLS + policy administrateur posées sur %', t;
  END LOOP;
END
$mig$;

NOTIFY pgrst, 'reload schema';
