/*
  # Journal des e-mails envoyés

  ## Pourquoi une table, et non le dossier « Envoyés » de la boîte
  Un envoi SMTP ne dépose aucune copie dans « Envoyés » : c'est le logiciel de
  messagerie qui range un exemplaire via IMAP, pas le serveur d'envoi. Les
  notifications parties de `send-notification` sont donc, par construction, invisibles
  depuis le webmail. Les y déposer supposerait une connexion IMAP depuis Deno — le
  terrain même où une bibliothèque immature a mis les notifications à terre le 2 août.

  Ce journal donne mieux : il retient CE QUI A ÉTÉ TENTÉ, pour qui, et ce que le
  serveur a répondu — y compris les échecs, qu'un dossier « Envoyés » ne montrerait
  jamais.

  ⚠ Ce que ce journal ne dit pas, et ne peut pas dire : si le message a été LU, ni même
  s'il a atteint la boîte de réception plutôt que les indésirables. `statut = 'envoye'`
  signifie exactement « le serveur d'envoi a accepté le message ».
*/

CREATE TABLE IF NOT EXISTS public.email_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  evenement    text NOT NULL,               -- 'order_new', 'contact_ack', 'manuel'…
  destinataire text NOT NULL,
  objet        text,
  statut       text NOT NULL DEFAULT 'envoye' CHECK (statut IN ('envoye', 'echec')),
  erreur       text,
  -- 'auto'   : notification déclenchée par la base
  -- 'manuel' : écrit depuis l'onglet Messagerie
  origine      text NOT NULL DEFAULT 'auto' CHECK (origine IN ('auto', 'manuel'))
);

-- Le journal se consulte du plus récent au plus ancien, et souvent filtré sur les
-- échecs : c'est ce que cet index sert.
CREATE INDEX IF NOT EXISTS email_log_date_idx ON public.email_log (created_at DESC);
CREATE INDEX IF NOT EXISTS email_log_statut_idx ON public.email_log (statut, created_at DESC);

ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

-- Il contient les adresses de tous les clients : administrateurs seulement.
-- Aucune policy d'écriture : seul le service_role (fonction Edge) y écrit, et il
-- contourne le RLS.
DROP POLICY IF EXISTS "email_log_admin_read" ON public.email_log;
CREATE POLICY "email_log_admin_read" ON public.email_log
  FOR SELECT TO authenticated
  USING (public.is_admin());
