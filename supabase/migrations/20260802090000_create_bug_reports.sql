/*
  # Signalements de problèmes envoyés depuis l'application OMEGADMX

  1. Tables
    - `bug_reports`          : un signalement = un ticket
    - `bug_report_messages`  : la conversation attachée (client ↔ admin)

  2. Deux façons d'envoyer, comme demandé
    - ANONYME  : personne non connectée. Le ticket reçoit un `track_code` que
                 l'application affiche ; il permet de suivre l'échange sans compte.
    - CONNECTÉ : `user_id` renseigné → le ticket apparaît dans « Mes messages »
                 sur le site, et le client peut répondre.

  3. Sécurité (RLS) — modèle identique à contact_requests
    - insertion ouverte (formulaire intégré à l'app, pas de compte exigé) ;
    - un utilisateur ne voit QUE ses propres tickets (`user_id = auth.uid()`) ;
    - seuls les `profiles.role = 'admin'` voient et modifient tout.
    ⚠ Le suivi par `track_code` n'est VOLONTAIREMENT pas exposé en SELECT public :
      un code devinable donnerait accès au contenu d'autrui. Il passe par une
      fonction dédiée (`bug_report_by_code`) qui exige le code EXACT et ne rend
      que ce ticket-là — jamais une liste.
*/

-- ============================================================
-- 1. Tables
-- ============================================================
CREATE TABLE IF NOT EXISTS bug_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- Auteur : l'un OU l'autre (anonyme = user_id NULL)
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  contact_email text,
  contact_name  text,

  -- Code de suivi pour les envois anonymes (assez long pour ne pas se deviner)
  track_code    text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(12), 'hex'),

  title         text NOT NULL CHECK (char_length(title) BETWEEN 4 AND 140),
  body          text NOT NULL CHECK (char_length(body) BETWEEN 12 AND 20000),

  -- Contexte technique (joint seulement si l'utilisateur a accepté)
  app_version   text,
  platform      text,
  diagnostics   text CHECK (diagnostics IS NULL OR char_length(diagnostics) <= 20000),

  -- Suivi côté admin
  status        text NOT NULL DEFAULT 'nouveau'
                CHECK (status IN ('nouveau','en_cours','resolu','ferme','doublon')),
  severity      text NOT NULL DEFAULT 'normal'
                CHECK (severity IN ('bloquant','normal','mineur')),
  admin_note    text,
  github_issue  text
);

CREATE INDEX IF NOT EXISTS bug_reports_user_idx    ON bug_reports (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bug_reports_status_idx  ON bug_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS bug_reports_email_idx   ON bug_reports (lower(contact_email));

CREATE TABLE IF NOT EXISTS bug_report_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   uuid NOT NULL REFERENCES bug_reports(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  author_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_admin    boolean NOT NULL DEFAULT false,
  body        text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 20000)
);
CREATE INDEX IF NOT EXISTS bug_report_messages_idx ON bug_report_messages (report_id, created_at);

-- ============================================================
-- 2. Rattachement automatique à un compte existant
-- ============================================================
-- Un client qui envoie sans être connecté mais qui donne l'e-mail de son compte
-- doit retrouver son ticket dans « Mes messages ». On fait la liaison ICI, côté
-- serveur : le client ne peut donc pas s'attribuer le ticket de quelqu'un d'autre
-- en envoyant un user_id fabriqué (cf. la policy d'insertion plus bas).
CREATE OR REPLACE FUNCTION bug_reports_link_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NEW.user_id IS NULL AND NEW.contact_email IS NOT NULL THEN
    SELECT id INTO NEW.user_id
    FROM auth.users
    WHERE lower(email) = lower(trim(NEW.contact_email))
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bug_reports_link_account_trg ON bug_reports;
CREATE TRIGGER bug_reports_link_account_trg
  BEFORE INSERT ON bug_reports
  FOR EACH ROW EXECUTE FUNCTION bug_reports_link_account();

-- Horodatage de dernière activité (tri du back-office par « ça bouge »)
CREATE OR REPLACE FUNCTION bug_reports_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE bug_reports SET updated_at = now() WHERE id = NEW.report_id;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS bug_report_messages_touch_trg ON bug_report_messages;
CREATE TRIGGER bug_report_messages_touch_trg
  AFTER INSERT ON bug_report_messages
  FOR EACH ROW EXECUTE FUNCTION bug_reports_touch();

-- ============================================================
-- 3. RLS
-- ============================================================
ALTER TABLE bug_reports         ENABLE ROW LEVEL SECURITY;
ALTER TABLE bug_report_messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin');
$$;

-- --- bug_reports ---
DROP POLICY IF EXISTS "Envoi d un signalement (avec ou sans compte)" ON bug_reports;
CREATE POLICY "Envoi d un signalement (avec ou sans compte)"
  ON bug_reports FOR INSERT TO public
  -- ⚠ Le point critique : on n'accepte un user_id QUE s'il est celui de l'appelant.
  -- Sans cette contrainte, n'importe qui pourrait déposer un ticket au nom d'un autre
  -- compte (et le lui faire lire). L'anonyme, lui, doit laisser le champ NULL —
  -- c'est le trigger ci-dessus, côté serveur, qui fait la liaison par e-mail.
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "Chacun voit ses signalements" ON bug_reports;
CREATE POLICY "Chacun voit ses signalements"
  ON bug_reports FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Les admins voient tout" ON bug_reports;
CREATE POLICY "Les admins voient tout"
  ON bug_reports FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "Les admins modifient tout" ON bug_reports;
CREATE POLICY "Les admins modifient tout"
  ON bug_reports FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Les admins suppriment" ON bug_reports;
CREATE POLICY "Les admins suppriment"
  ON bug_reports FOR DELETE TO authenticated USING (is_admin());

-- --- bug_report_messages ---
DROP POLICY IF EXISTS "Lire la conversation de ses tickets" ON bug_report_messages;
CREATE POLICY "Lire la conversation de ses tickets"
  ON bug_report_messages FOR SELECT TO authenticated
  USING (
    is_admin()
    OR EXISTS (SELECT 1 FROM bug_reports r WHERE r.id = report_id AND r.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Repondre sur ses tickets" ON bug_report_messages;
CREATE POLICY "Repondre sur ses tickets"
  ON bug_report_messages FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND (
      (is_admin() AND is_admin = true)
      OR (is_admin = false
          AND EXISTS (SELECT 1 FROM bug_reports r WHERE r.id = report_id AND r.user_id = auth.uid()))
    )
  );

-- ============================================================
-- 4. Suivi anonyme par code — sans exposer la table
-- ============================================================
-- Rend UN ticket et sa conversation, à condition de présenter le code exact.
-- SECURITY DEFINER + filtre sur l'égalité stricte : impossible d'énumérer,
-- impossible de récupérer autre chose que le ticket dont on a le code.
CREATE OR REPLACE FUNCTION bug_report_by_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r bug_reports%ROWTYPE; msgs jsonb;
BEGIN
  IF p_code IS NULL OR char_length(p_code) < 16 THEN RETURN NULL; END IF;
  SELECT * INTO r FROM bug_reports WHERE track_code = p_code;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'created_at', m.created_at, 'is_admin', m.is_admin, 'body', m.body
         ) ORDER BY m.created_at), '[]'::jsonb)
    INTO msgs FROM bug_report_messages m WHERE m.report_id = r.id;
  RETURN jsonb_build_object(
    'title', r.title, 'body', r.body, 'status', r.status,
    'created_at', r.created_at, 'messages', msgs
  );
END; $$;

REVOKE ALL ON FUNCTION bug_report_by_code(text) FROM public;
GRANT EXECUTE ON FUNCTION bug_report_by_code(text) TO anon, authenticated;
