/*
  # Référentiel des pays : un nom écrit par un humain → un code ISO

  ## La faille, trouvée au banc de bout en bout (3 août 2026)
  Le formulaire d'adresse enregistre le pays sous forme de NOM (« France », « Belgique »,
  « Suisse »…), pas de code ISO. Le calcul de TVA, lui, raisonne en codes.
  La conversion approximative « les deux premières lettres » donnait :

      Allemagne  → AL   (au lieu de DE)  → pays inconnu → EXPORT 0 %   ⚠ FAUX
      Suisse     → SU   (au lieu de CH)  → export 0 %                  (juste par hasard)
      Pays-Bas   → PA   (au lieu de NL)  → export 0 %                  ⚠ FAUX
      Belgique   → BE                                                   (juste par hasard)

  Autrement dit : **un client allemand ou néerlandais n'aurait pas payé de TVA**, et le
  vendeur l'aurait due. Le hasard faisait que la moitié des cas tombaient juste, ce qui
  est le pire des cas — un bug qui se voit à moitié ne se voit pas.

  ## La correction, faite pour durer
  Une table d'alias, pas une liste dans le code. Ajouter un pays ou une orthographe se
  fait en base, sans redéployer le site (demande explicite : « ne plus jamais toucher au
  code »). La résolution est insensible à la casse et aux accents.
*/

CREATE TABLE IF NOT EXISTS country_aliases (
  alias text PRIMARY KEY,          -- forme normalisée (minuscules, sans accent)
  code  char(2) NOT NULL
);

/* Normalisation identique à celle du module de livraison du site : minuscules, sans
   accents, sans points, espaces resserrés. Les deux doivent rester d'accord. */
CREATE OR REPLACE FUNCTION normaliser_pays(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT btrim(regexp_replace(lower(translate(coalesce(p,''),
    'àâäáãåçéèêëíìîïñóòôöõúùûüýÿÀÂÄÁÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝ',
    'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY')), '[.\s]+', ' ', 'g'));
$$;

INSERT INTO country_aliases (alias, code) VALUES
  -- France et assimilés
  ('france','FR'),('fr','FR'),('france metropolitaine','FR'),('republique francaise','FR'),
  ('monaco','MC'),('mc','MC'),('principaute de monaco','MC'),
  -- Union européenne : nom français, nom anglais/local, code
  ('allemagne','DE'),('germany','DE'),('deutschland','DE'),('de','DE'),
  ('autriche','AT'),('austria','AT'),('at','AT'),
  ('belgique','BE'),('belgium','BE'),('belgie','BE'),('be','BE'),
  ('bulgarie','BG'),('bulgaria','BG'),('bg','BG'),
  ('chypre','CY'),('cyprus','CY'),('cy','CY'),
  ('croatie','HR'),('croatia','HR'),('hr','HR'),
  ('danemark','DK'),('denmark','DK'),('dk','DK'),
  ('espagne','ES'),('spain','ES'),('espana','ES'),('es','ES'),
  ('estonie','EE'),('estonia','EE'),('ee','EE'),
  ('finlande','FI'),('finland','FI'),('fi','FI'),
  ('grece','GR'),('greece','GR'),('gr','GR'),('el','GR'),
  ('hongrie','HU'),('hungary','HU'),('hu','HU'),
  ('irlande','IE'),('ireland','IE'),('ie','IE'),
  ('italie','IT'),('italy','IT'),('italia','IT'),('it','IT'),
  ('lettonie','LV'),('latvia','LV'),('lv','LV'),
  ('lituanie','LT'),('lithuania','LT'),('lt','LT'),
  ('luxembourg','LU'),('lu','LU'),
  ('malte','MT'),('malta','MT'),('mt','MT'),
  ('pays-bas','NL'),('pays bas','NL'),('netherlands','NL'),('nederland','NL'),('hollande','NL'),('nl','NL'),
  ('pologne','PL'),('poland','PL'),('pl','PL'),
  ('portugal','PT'),('pt','PT'),
  ('republique tcheque','CZ'),('tchequie','CZ'),('czech republic','CZ'),('czechia','CZ'),('cz','CZ'),
  ('roumanie','RO'),('romania','RO'),('ro','RO'),
  ('slovaquie','SK'),('slovakia','SK'),('sk','SK'),
  ('slovenie','SI'),('slovenia','SI'),('si','SI'),
  ('suede','SE'),('sweden','SE'),('sverige','SE'),('se','SE'),
  -- Hors UE, fréquents
  ('suisse','CH'),('switzerland','CH'),('schweiz','CH'),('ch','CH'),
  ('royaume-uni','GB'),('royaume uni','GB'),('united kingdom','GB'),('angleterre','GB'),('gb','GB'),('uk','GB'),
  ('norvege','NO'),('norway','NO'),('no','NO'),
  ('islande','IS'),('iceland','IS'),('is','IS'),
  ('andorre','AD'),('andorra','AD'),('ad','AD'),
  ('etats-unis','US'),('etats unis','US'),('united states','US'),('usa','US'),('us','US'),
  ('canada','CA'),('ca','CA'),
  ('maroc','MA'),('morocco','MA'),('ma','MA'),
  ('tunisie','TN'),('tunisia','TN'),('tn','TN'),
  ('algerie','DZ'),('algeria','DZ'),('dz','DZ')
ON CONFLICT (alias) DO UPDATE SET code = EXCLUDED.code;

ALTER TABLE country_aliases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Pays lisibles par tous" ON country_aliases;
CREATE POLICY "Pays lisibles par tous" ON country_aliases FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Pays modifiables par les admins" ON country_aliases;
CREATE POLICY "Pays modifiables par les admins" ON country_aliases FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

/*
  Résout n'importe quelle écriture en code ISO.
  ⚠ Renvoie NULL si le pays est INCONNU — surtout pas un code inventé. Un pays non
  reconnu doit faire échouer la commande plutôt que produire une TVA au hasard : c'est
  le défaut qu'on vient de corriger.
*/
CREATE OR REPLACE FUNCTION code_pays(p text)
RETURNS char(2)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE n text; c char(2);
BEGIN
  n := normaliser_pays(p);
  IF n = '' THEN RETURN 'FR'; END IF;              -- champ vide = vente locale
  SELECT code INTO c FROM country_aliases WHERE alias = n;
  IF c IS NOT NULL THEN RETURN c; END IF;
  -- Déjà un code ISO connu de la table des taux ? (ex. 'DE' saisi directement)
  IF length(n) = 2 THEN
    SELECT country_code INTO c FROM eu_vat_rates WHERE country_code = upper(n);
    IF c IS NOT NULL THEN RETURN c; END IF;
  END IF;
  RETURN NULL;
END; $$;

REVOKE ALL ON FUNCTION code_pays(text) FROM public;
GRANT EXECUTE ON FUNCTION code_pays(text) TO anon, authenticated;

COMMENT ON TABLE country_aliases IS
  'Noms de pays → code ISO. Ajouter une orthographe ou un pays se fait ICI, sans toucher au code du site.';
