/*
  # Notifications e-mail : le socle base de données

  Aucune notification métier n'existait : Brevo n'était branché que sur les e-mails
  d'authentification, envoyés par le service Auth de Supabase pour son usage interne.

  ## Pourquoi déclencher depuis la BASE et non depuis le navigateur
  Un appel posté par le front après l'insertion se perd dès que le visiteur ferme
  l'onglet au mauvais moment, et il faudrait le répéter partout où une commande peut
  naître (site, back-office, webhook Stripe). Un trigger part quoi qu'il arrive et
  quelle que soit l'origine de l'écriture. `pg_net` poste en arrière-plan, sans faire
  attendre la transaction qui l'a déclenché.

  ## ⚠ Une notification ne doit jamais casser ce qu'elle annonce
  `private.notify()` avale ses propres erreurs. Si l'envoi est mal configuré, si le
  réseau tombe ou si la fonction Edge répond une erreur, la commande, le message ou le
  signalement doivent malgré tout être enregistrés. Le silence est ici le comportement
  correct : perdre un e-mail est ennuyeux, perdre une commande est grave.

  ## Où vivent l'URL et le secret
  Dans le schéma `private`, que PostgREST n'expose pas (`config.toml` ne publie que
  `public` et `graphql_public`). Le secret partagé voyage en en-tête `x-notify-secret`
  et la fonction Edge refuse tout appel qui ne le porte pas : elle est déployée sans
  vérification de JWT, puisque appelée par la base et non par un utilisateur connecté.

  ## Les réglages
  Une seule ligne `site_settings.email_notifications`, dans la table clé/valeur déjà
  utilisée par `site_mode` et `shipping_config`. Les réglages valent pour tout le site
  (choix retenu : les deux administrateurs reçoivent la même chose). Un type absent ou
  à `false` coupe l'envoi AVANT même l'appel réseau.
*/

CREATE EXTENSION IF NOT EXISTS pg_net;

-- ---------------------------------------------------------------------------
-- 1. Configuration privée (hors de portée de l'API REST)
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS private.notify_config (
  -- Clé primaire booléenne contrainte à `true` : garantit qu'il n'existe jamais
  -- qu'une seule ligne de configuration.
  id       boolean PRIMARY KEY DEFAULT true CHECK (id),
  endpoint text NOT NULL,
  secret   text NOT NULL
);

REVOKE ALL ON private.notify_config FROM anon, authenticated;

INSERT INTO private.notify_config (id, endpoint, secret)
VALUES (
  true,
  'https://ebkxdndfcwowevvtoxhr.supabase.co/functions/v1/send-notification',
  -- 64 caractères hexadécimaux, sans dépendre de pgcrypto.
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Réglages par type d'événement
-- ---------------------------------------------------------------------------

INSERT INTO site_settings (key, value)
VALUES (
  'email_notifications',
  jsonb_build_object(
    -- vers les administrateurs
    'order_new',        true,   -- une commande vient d'être passée
    'contact_new',      true,   -- message envoyé depuis le formulaire de contact
    'bug_new',          true,   -- nouveau signalement OMEGADMX
    'bug_reply_client', true,   -- le client répond sur un signalement
    'account_new',      true,   -- inscription d'un nouveau client
    -- vers le client
    'order_status',     true,   -- sa commande change d'état
    'contact_answered', true,   -- réponse à son message
    'bug_reply_admin',  true    -- réponse à son signalement
  )
)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Le point de passage unique
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.notify(
  p_event   text,
  p_payload jsonb,
  -- `p_force` sert au bouton « Envoyer un e-mail de test » : il court-circuite la
  -- grille de réglages, pour qu'on puisse vérifier l'installation sans avoir à
  -- activer un type au préalable.
  p_force   boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'net'
AS $$
DECLARE
  v_actif    boolean;
  v_endpoint text;
  v_secret   text;
BEGIN
  IF NOT p_force THEN
    SELECT (value ->> p_event)::boolean INTO v_actif
      FROM site_settings WHERE key = 'email_notifications';

    IF NOT coalesce(v_actif, false) THEN
      RETURN;
    END IF;
  END IF;

  SELECT endpoint, secret INTO v_endpoint, v_secret FROM private.notify_config LIMIT 1;

  IF v_endpoint IS NULL THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_endpoint,
    headers := jsonb_build_object(
                 'Content-Type',    'application/json',
                 'x-notify-secret', v_secret
               ),
    body    := jsonb_build_object('event', p_event, 'data', p_payload)
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Voir l'en-tête : l'événement annoncé prime sur son annonce.
    NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3 bis. Ce dont la fonction Edge a besoin
-- ---------------------------------------------------------------------------

/*
  La fonction Edge est appelée par la base, pas par un utilisateur connecté : elle est
  déployée sans vérification de JWT et se protège par le secret partagé. Plutôt que de
  recopier ce secret dans les secrets Supabase — deux endroits à garder synchronisés —
  elle le fait valider ici. Le secret ne sort donc jamais de la base.
*/
CREATE OR REPLACE FUNCTION public.notify_check_secret(p_secret text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM private.notify_config
    WHERE secret = p_secret AND length(coalesce(p_secret, '')) >= 32
  );
$$;

REVOKE ALL ON FUNCTION public.notify_check_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_check_secret(text) TO service_role;

/*
  Bouton « Envoyer un e-mail de test » de l'écran de réglages. Le navigateur ne peut pas
  appeler la fonction Edge lui-même (il n'a pas le secret, et ne doit pas l'avoir) :
  il demande à la base de le faire.
*/
CREATE OR REPLACE FUNCTION public.notify_send_test()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  PERFORM private.notify('test', jsonb_build_object('demande_par', auth.uid()), true);
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.notify_send_test() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_send_test() TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Les déclencheurs
--    Le corps du message est construit côté fonction Edge, qui rechargera ce dont
--    elle a besoin avec la clé service_role : on ne transporte ici que des
--    identifiants, pas des données personnelles.
-- ---------------------------------------------------------------------------

-- Commandes ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_order() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'private' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM private.notify('order_new', jsonb_build_object('id', NEW.id));
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM private.notify('order_status', jsonb_build_object(
      'id', NEW.id, 'avant', OLD.status, 'apres', NEW.status));
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS notify_order_trg ON public.orders;
CREATE TRIGGER notify_order_trg
  AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_order();

-- Messages du site -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_contact_request() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'private' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM private.notify('contact_new', jsonb_build_object('id', NEW.id));
  ELSIF NEW.admin_response IS NOT NULL
        AND NEW.admin_response IS DISTINCT FROM OLD.admin_response THEN
    PERFORM private.notify('contact_answered', jsonb_build_object('id', NEW.id));
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS notify_contact_request_trg ON public.contact_requests;
CREATE TRIGGER notify_contact_request_trg
  AFTER INSERT OR UPDATE OF admin_response ON public.contact_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_contact_request();

-- Signalements OMEGADMX ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_bug_report() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'private' AS $$
BEGIN
  PERFORM private.notify('bug_new', jsonb_build_object('id', NEW.id));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS notify_bug_report_trg ON public.bug_reports;
CREATE TRIGGER notify_bug_report_trg
  AFTER INSERT ON public.bug_reports
  FOR EACH ROW EXECUTE FUNCTION public.notify_bug_report();

-- `is_admin` porte déjà le sens du message : réponse de l'équipe, ou du client.
CREATE OR REPLACE FUNCTION public.notify_bug_report_message() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'private' AS $$
BEGIN
  PERFORM private.notify(
    CASE WHEN NEW.is_admin THEN 'bug_reply_admin' ELSE 'bug_reply_client' END,
    jsonb_build_object('id', NEW.id, 'report_id', NEW.report_id));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS notify_bug_report_message_trg ON public.bug_report_messages;
CREATE TRIGGER notify_bug_report_message_trg
  AFTER INSERT ON public.bug_report_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_bug_report_message();

-- Inscriptions ---------------------------------------------------------------
-- Posé sur `profiles` et non sur `auth.users` : `handle_new_user` y a déjà déposé
-- le prénom et le nom, que l'e-mail affiche.
CREATE OR REPLACE FUNCTION public.notify_new_account() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'private' AS $$
BEGIN
  PERFORM private.notify('account_new', jsonb_build_object('id', NEW.id));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS notify_new_account_trg ON public.profiles;
CREATE TRIGGER notify_new_account_trg
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_account();
