/*
  # Accusés de réception : le client reçoit aussi quelque chose

  Jusqu'ici, un dépôt (commande, message, signalement) ne prévenait QUE les
  administrateurs. Côté client, rien : il n'avait aucune trace écrite de sa démarche.
  Le cas de la commande était le plus gênant — `create-payment-intent` ne renseigne pas
  `receipt_email`, Stripe n'envoyait donc pas de reçu non plus : un client qui payait ne
  recevait STRICTEMENT AUCUN e-mail, alors que la vente à distance impose une
  confirmation sur support durable (article L221-13 du Code de la consommation).

  Chaque déclencheur existant émet donc désormais un second événement, avec son propre
  interrupteur : on peut prévenir l'équipe sans accuser réception, ou l'inverse.

  ## Le moment choisi pour la commande
  `orders` est inséré APRÈS l'encaissement et directement en `status = 'confirmed'`
  (CartPage, étape 3, protégé des doublons par `stripe_payment_intent_id`). Annoncer
  « commande confirmée » dès l'insertion est donc exact.
  ⚠ En revanche `order_items` n'est écrit qu'ensuite : au moment du déclencheur, la
  commande n'a encore aucun article. C'est la fonction Edge qui absorbe cette course,
  en réessayant de lire les articles — plutôt que de toucher au flux de paiement, qui
  est ce qu'on veut le moins fragiliser.
*/

-- Les trois nouveaux types, sans écraser les choix déjà faits : l'objet existant est
-- placé À DROITE de la fusion, donc ses valeurs l'emportent. La migration peut être
-- rejouée sans réactiver un type que l'on aurait volontairement désactivé.
UPDATE site_settings
SET value = jsonb_build_object(
      'order_ack',   true,  -- « votre commande est confirmée » + récapitulatif
      'contact_ack', true,  -- « nous avons bien reçu votre message »
      'bug_ack',     true   -- « votre signalement est enregistré » + code de suivi
    ) || value
WHERE key = 'email_notifications';

-- Commandes -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_order() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'private' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM private.notify('order_new', jsonb_build_object('id', NEW.id));
    PERFORM private.notify('order_ack', jsonb_build_object('id', NEW.id));
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM private.notify('order_status', jsonb_build_object(
      'id', NEW.id, 'avant', OLD.status, 'apres', NEW.status));
  END IF;
  RETURN NULL;
END;
$$;

-- Messages du site ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_contact_request() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'private' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM private.notify('contact_new', jsonb_build_object('id', NEW.id));
    PERFORM private.notify('contact_ack', jsonb_build_object('id', NEW.id));
  ELSIF NEW.admin_response IS NOT NULL
        AND NEW.admin_response IS DISTINCT FROM OLD.admin_response THEN
    PERFORM private.notify('contact_answered', jsonb_build_object('id', NEW.id));
  END IF;
  RETURN NULL;
END;
$$;

-- Signalements ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_bug_report() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'private' AS $$
BEGIN
  PERFORM private.notify('bug_new', jsonb_build_object('id', NEW.id));
  PERFORM private.notify('bug_ack', jsonb_build_object('id', NEW.id));
  RETURN NULL;
END;
$$;
