/*
  # Joindre le SHOW du client à un signalement

  ## Pourquoi
  Demande de l'exploitant (3 août 2026) : « pouvoir récupérer le show de la personne,
  ça me permettrait de tester avec son show ». Un problème d'éclairage dépend presque
  toujours de la configuration : nombre de machines, patch, scènes, modes, associations
  MIDI. Sans le show, reproduire un défaut relève de la devinette — c'est exactement ce
  qui s'est passé pour le lag MIDI, résolu seulement une fois le show réel en main.

  ## Format stocké
  `show_data` = le JSON du show, **gzip puis base64** (fait par le client, via
  CompressionStream). Un show réel de ~500 Ko tombe à ~60-90 Ko compressés, ~120 Ko en
  base64 : c'est ce qui rend l'envoi acceptable depuis une salle en 4G, et le stockage
  négligeable. Le client peut ne pas compresser (WebView ancienne) : `show_encoding`
  dit lequel des deux cas on a, on ne devine pas.

  ## Bornes — un dépôt ANONYME peut écrire ici
  Sans plafond, la table devient un espace de stockage gratuit ouvert à tous. 3 Mo de
  base64 (~2,2 Mo compressés, soit un très gros show) est large pour l'usage réel et
  reste une limite dure. La contrainte est posée sur la TABLE, pas seulement dans la
  fonction : elle tient même si un autre chemin d'écriture apparaît un jour.
*/

ALTER TABLE bug_reports
  ADD COLUMN IF NOT EXISTS show_data     text,
  ADD COLUMN IF NOT EXISTS show_name     text,
  ADD COLUMN IF NOT EXISTS show_bytes    integer,
  ADD COLUMN IF NOT EXISTS show_encoding text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bug_reports_show_data_taille') THEN
    ALTER TABLE bug_reports
      ADD CONSTRAINT bug_reports_show_data_taille
      CHECK (show_data IS NULL OR char_length(show_data) <= 3000000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bug_reports_show_encoding_valide') THEN
    ALTER TABLE bug_reports
      ADD CONSTRAINT bug_reports_show_encoding_valide
      CHECK (show_encoding IS NULL OR show_encoding IN ('gzip+base64', 'json'));
  END IF;
END $$;

COMMENT ON COLUMN bug_reports.show_data IS
  'Show du client au moment du signalement. gzip+base64 (cf. show_encoding). Joint uniquement si le client a coché la case.';

/*
  ## Remplacement de submit_bug_report

  ⚠ On DROP avant de recréer, on n'ajoute PAS des paramètres à la suite : en PostgreSQL
  l'identité d'une fonction inclut ses types d'arguments, donc `CREATE OR REPLACE` avec
  des paramètres en plus crée une SURCHARGE au lieu de remplacer. PostgREST appelant les
  RPC par NOM D'ARGUMENT, deux surcharges rendent l'appel ambigu et le dépôt casserait
  pour tout le monde — y compris les versions déjà installées chez les clients.
  Les paramètres du show ont un DEFAULT NULL : les versions ≤ 1.33 de l'application,
  qui n'envoient que les six premiers, continuent de fonctionner à l'identique.
*/
DROP FUNCTION IF EXISTS submit_bug_report(text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION submit_bug_report(
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
SET search_path = public, auth
AS $$
DECLARE v_id uuid; v_code text; v_user uuid; v_show text; v_enc text;
BEGIN
  IF p_title IS NULL OR char_length(btrim(p_title)) < 4 THEN
    RAISE EXCEPTION 'Titre trop court';
  END IF;
  IF p_body IS NULL OR char_length(btrim(p_body)) < 12 THEN
    RAISE EXCEPTION 'Description trop courte';
  END IF;

  -- Un show hors bornes ne fait PAS échouer le signalement : le message du client est
  -- ce qui compte, on le garde et on laisse simplement la pièce jointe de côté. Perdre
  -- le témoignage parce qu'un fichier est trop gros serait le pire des échanges.
  v_show := p_show_data;
  v_enc  := p_show_encoding;
  IF v_show IS NOT NULL AND char_length(v_show) > 3000000 THEN
    v_show := NULL; v_enc := NULL;
  END IF;
  IF v_enc IS NOT NULL AND v_enc NOT IN ('gzip+base64', 'json') THEN
    v_enc := NULL; v_show := NULL;
  END IF;

  v_user := auth.uid();   -- NULL si envoi anonyme : c'est légitime

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

REVOKE ALL ON FUNCTION submit_bug_report(text, text, text, text, text, text, text, text, integer, text) FROM public;
GRANT EXECUTE ON FUNCTION submit_bug_report(text, text, text, text, text, text, text, text, integer, text) TO anon, authenticated;

/*
  ## Lecture du show : ADMIN UNIQUEMENT

  Les policies existantes de `bug_reports` laissent un utilisateur lire SES tickets.
  Le show y est désormais stocké : c'est sa propre donnée, donc pas de fuite entre
  clients. En revanche il n'y a aucune raison de la charger dans l'application du
  client (des centaines de Ko à chaque ouverture de « Mes signalements ») — la
  sélection de colonnes côté client ne demande jamais `show_data`.
*/
