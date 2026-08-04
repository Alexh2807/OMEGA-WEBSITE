/*
  # TVA : Monaco sauvé de l'exonération, territoires exclus, guichet unique (OSS)

  ## Le défaut le plus coûteux, corrigé ici : Monaco
  `regime_tva` exonérait tout code postal français commençant par 97 OU 98 :

      IF v_pays = 'FR' AND v_cp ~ '^(97|98)' THEN … 0 % …

  Or **Monaco est en 980xx** et fait partie du territoire fiscal français pour la TVA.
  Une vente à Monaco saisie avec « France » en pays sortait donc à 0 %, alors qu'elle est
  taxable à 20 %. La TVA non collectée reste due par le vendeur : c'est lui qui la paie, sur
  une somme qu'il n'a jamais encaissée.
  Le motif devient `'^97[1-6]|^98[4-8]'` — les DOM (971 à 974 et 976), Saint-Pierre-et-
  Miquelon (975) et les collectivités du Pacifique (984 à 988), et RIEN d'autre.
  ⚠ La même erreur vivait dans `est_outre_mer()`, qui alimente la déclaration de TVA : une
  vente monégasque y était comptée en « livraisons outre-mer » (art. 294 du CGI) au lieu de
  la ligne France. Elle est corrigée du même geste, avec le MÊME motif — deux définitions de
  l'outre-mer qui divergent, c'est la garantie qu'une des deux sera fausse.

  ## Les territoires européens hors champ de la TVA
  La migration du 3 août signalait la limite noir sur blanc : « d'autres territoires
  européens sont hors du champ de la TVA de l'UE (Canaries, Ceuta et Melilla, Åland,
  Livigno, Helgoland, Büsingen…) ». Ils étaient traités comme l'Espagne, l'Italie, la
  Finlande ou l'Allemagne — donc taxés à 20 % alors qu'ils relèvent de l'exportation.
  Le client payait une taxe qui n'était pas due. Une TABLE les recense désormais, pour
  qu'ajouter un territoire ne demande plus de toucher au code.

  ## L'Irlande du Nord, cas inverse
  Depuis le Brexit, l'Irlande du Nord reste DANS le régime intracommunautaire **pour les
  biens** (protocole irlandais) alors que le reste du Royaume-Uni est à l'export. Elle a son
  propre code pays, `XI`, et des numéros de TVA en `XI…`. C'est le seul territoire de la
  table qui ne soit pas en régime `export`.

  ## Le guichet unique (OSS)
  Au-delà de 10 000 € de ventes à des particuliers d'autres États membres, la TVA due est
  celle du PAYS DE DESTINATION, pas la française. `regime_tva` renvoyait **20 en dur** et ne
  lisait jamais `eu_vat_rates`. Elle lit maintenant un drapeau `oss_actif` (défaut FAUX :
  rien ne change tant que l'exploitant n'a pas franchi le seuil et fait son inscription) et,
  quand il est levé, le taux du pays de destination.

  ## Deux erreurs de période, silencieuses et systématiques
  · `declaration_tva` et `declaration_des` filtraient sur `created_at`, un `timestamptz`
    comparé à une date SANS fuseau : une commande passée le 1ᵉʳ du mois à 00 h 30 heure de
    Paris est enregistrée le dernier jour du mois précédent en UTC. Chaque déclaration
    mensuelle attrapait donc les mauvaises commandes en bordure de période — dans les deux
    sens. On compare désormais en `Europe/Paris`, et sur la DATE DE LIVRAISON quand elle est
    connue, puisque c'est elle qui fixe l'exigibilité sur les biens.
  · Les remboursements n'étaient déduits nulle part : on déclarait — et on payait — la TVA
    sur des sommes rendues au client.

  ## Le seuil OSS se mesure HORS TAXE
  L'ancien calcul sommait `sub_total + tax` : il annonçait le dépassement environ 17 % trop
  tôt, ce qui pousse à s'inscrire au guichet unique sans y être tenu — avec les obligations
  déclaratives qui vont avec. Et il ignorait l'année N−1, alors que dépasser une année
  entraîne l'application du régime dès l'année suivante.

  ## `territoire` est désormais TOUJOURS renseigné
  Et sous forme de CODE (`FR`, `FR-DOM`, `FR-COM`, `MC`, `UE`, `HORS-UE`, `UE-EXCLU`), non
  plus de phrase française. Le payload comptable a besoin d'une valeur testable, pas d'un
  libellé : déduire l'outre-mer par une expression régulière sur la mention légale est
  exactement le genre de raccourci qui casse au premier changement de formulation.

  Idempotente et rejouable : `ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE`, `ON CONFLICT`,
  `DROP POLICY IF EXISTS`. Aucune commande existante n'est modifiée : le taux appliqué est
  recopié sur chaque commande, précisément pour que l'historique ne se réécrive pas.
*/

-- ===========================================================================
-- 1. Colonnes fiscales et logistiques figées à la vente
-- ===========================================================================
/*
  Le contrat (§5, invariant 2) : le régime est FIGÉ à la vente et recopié tel quel sur la
  facture. Il faut donc pouvoir le figer — d'où `vat_mention` et `vat_territory` sur la
  commande, à côté de `vat_regime` et `vat_rate` qui y étaient déjà.

  `shipping_cost_ht` : `orders.shipping_cost` porte le montant TTC du barème, et le HT était
  recalculé à trois endroits différents. Une seule source, en base.
  `delivery_date` : l'exigibilité de la TVA sur les biens court à la LIVRAISON.
*/
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS vat_mention      text,
  ADD COLUMN IF NOT EXISTS vat_territory    text,
  ADD COLUMN IF NOT EXISTS shipping_cost_ht numeric(10,2),
  ADD COLUMN IF NOT EXISTS delivery_date    date;

COMMENT ON COLUMN orders.vat_mention IS
  'Mention légale d''exonération FIGÉE à la vente et recopiée telle quelle sur la facture. '
  'Sans elle, une facture exonérée est irrégulière et l''exonération contestable.';
COMMENT ON COLUMN orders.vat_territory IS
  'Territoire fiscal FIGÉ : FR | FR-DOM | FR-COM | MC | UE | HORS-UE | UE-EXCLU. '
  'Sert de clé de déclaration — ne jamais le redéduire d''un texte libre.';
COMMENT ON COLUMN orders.shipping_cost_ht IS
  'Port HT, source unique. `shipping_cost` reste le montant TTC du barème affiché.';
COMMENT ON COLUMN orders.delivery_date IS
  'Date de livraison réelle : c''est elle qui rattache la vente à une période de TVA.';

/*
  Les mêmes sur le DEVIS serveur : `confirmer_commande` ne peut recopier que ce que le devis
  porte. Sans ces trois colonnes, la recopie demandée plus bas n'aurait rien à lire.
*/
ALTER TABLE order_quotes
  ADD COLUMN IF NOT EXISTS vat_mention      text,
  ADD COLUMN IF NOT EXISTS vat_territory    text,
  ADD COLUMN IF NOT EXISTS shipping_cost_ht numeric(10,2),
  -- Le transporteur, l'offre et le point relais retenus par le client (contrat §2). Ils
  -- sont posés ici ET par 20260805020000/040000 : la triple pose est inoffensive, et elle
  -- garantit que la recopie ci-dessous trouve ses colonnes quel que soit l'ordre.
  ADD COLUMN IF NOT EXISTS shipping_carrier text,
  ADD COLUMN IF NOT EXISTS shipping_service text,
  ADD COLUMN IF NOT EXISTS shipping_relay   jsonb;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipping_carrier text,
  ADD COLUMN IF NOT EXISTS shipping_service text,
  ADD COLUMN IF NOT EXISTS shipping_relay   jsonb;

CREATE INDEX IF NOT EXISTS orders_territoire_idx ON orders (vat_territory, delivery_date);

/*
  `profiles.siret` (contrat §2) — obligatoire sur une facture entre professionnels français
  et clé de routage de la facturation électronique (le SIREN en est les 9 premiers
  chiffres). Contrôle NON bloquant : refuser une commande faute de SIRET ferait perdre la
  vente. Également posée par la migration 20260805020000 ; l'`IF NOT EXISTS` rend la double
  pose inoffensive quel que soit l'ordre d'application.
*/
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS siret text;
COMMENT ON COLUMN profiles.siret IS
  'SIRET de l''acheteur société française. Contrôle non bloquant : on n''empêche pas la '
  'vente, mais la facture entre professionnels doit le porter (art. 242 nonies A ann. II CGI).';

-- ===========================================================================
-- 2. Le référentiel des territoires particuliers
-- ===========================================================================
/*
  En table, pour la même raison que `country_aliases` et `eu_vat_rates` : ajouter un
  territoire ou corriger une plage de codes postaux doit se faire en base, sans
  redéploiement (« ne plus jamais toucher au code »).

  `motif_cp` vide = tout le pays (cas de l'Irlande du Nord, qui a son propre code pays).
  `regime`   = 'export' pour les territoires HORS du champ de la TVA de l'Union,
               'ue'     pour ceux qui y restent (Irlande du Nord, biens).
*/
CREATE TABLE IF NOT EXISTS territoires_speciaux (
  code_pays  char(2) NOT NULL,
  -- Expression régulière appliquée au code postal. '' = tout le pays.
  motif_cp   text    NOT NULL DEFAULT '',
  regime     text    NOT NULL CHECK (regime IN ('export', 'ue')),
  territoire text    NOT NULL,
  taux       numeric(5,2) NOT NULL DEFAULT 0,
  mention    text,
  actif      boolean NOT NULL DEFAULT true,
  PRIMARY KEY (code_pays, motif_cp)
);

COMMENT ON TABLE territoires_speciaux IS
  'Territoires européens hors champ de la TVA de l''Union (Canaries, Ceuta, Melilla, '
  'Åland, Livigno, Campione, Helgoland, Büsingen) et cas inverse de l''Irlande du Nord. '
  'Consulté par regime_tva : ajouter un territoire ici, jamais dans le code.';

INSERT INTO territoires_speciaux (code_pays, motif_cp, regime, territoire, taux, mention) VALUES
  -- Îles Canaries : Las Palmas 35xxx, Santa Cruz de Tenerife 38xxx.
  ('ES', '^35|^38', 'export', 'UE-EXCLU', 0,
   'Exonération de TVA — livraison vers les îles Canaries, territoire exclu du champ d''application de la TVA de l''Union européenne (art. 262 I du CGI).'),
  -- Ceuta (51xxx) et Melilla (52xxx).
  ('ES', '^51|^52', 'export', 'UE-EXCLU', 0,
   'Exonération de TVA — livraison vers Ceuta ou Melilla, territoires exclus du champ d''application de la TVA de l''Union européenne (art. 262 I du CGI).'),
  -- Livigno (23030) et Campione d'Italia (22061).
  ('IT', '^23030|^22061', 'export', 'UE-EXCLU', 0,
   'Exonération de TVA — livraison vers Livigno ou Campione d''Italia, territoires exclus du champ d''application de la TVA de l''Union européenne (art. 262 I du CGI).'),
  -- Îles Åland : 22xxx en Finlande.
  ('FI', '^22', 'export', 'UE-EXCLU', 0,
   'Exonération de TVA — livraison vers les îles Åland, territoire exclu du champ d''application de la TVA de l''Union européenne (art. 262 I du CGI).'),
  -- Helgoland (27498) et Büsingen am Hochrhein (78266).
  ('DE', '^27498|^78266', 'export', 'UE-EXCLU', 0,
   'Exonération de TVA — livraison vers Helgoland ou Büsingen, territoires exclus du champ d''application de la TVA de l''Union européenne (art. 262 I du CGI).'),
  -- ★ Le cas INVERSE : l'Irlande du Nord reste dans le régime intracommunautaire pour les
  --   BIENS (protocole irlandais). Numéros de TVA en « XI… ».
  ('XI', '', 'ue', 'UE', 20, NULL)
ON CONFLICT (code_pays, motif_cp) DO UPDATE SET
  regime     = EXCLUDED.regime,
  territoire = EXCLUDED.territoire,
  taux       = EXCLUDED.taux,
  mention    = EXCLUDED.mention;

ALTER TABLE territoires_speciaux ENABLE ROW LEVEL SECURITY;

-- Lecture ouverte : c'est un référentiel public, et le panier doit pouvoir afficher le
-- régime avant validation. Écriture réservée aux administrateurs.
DROP POLICY IF EXISTS "Territoires lisibles par tous" ON territoires_speciaux;
CREATE POLICY "Territoires lisibles par tous" ON territoires_speciaux
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Territoires modifiables par les admins" ON territoires_speciaux;
CREATE POLICY "Territoires modifiables par les admins" ON territoires_speciaux
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- ===========================================================================
-- 3. Taux : Estonie à jour, Irlande du Nord ajoutée
-- ===========================================================================
/*
  L'Estonie est passée de 22 % à 24 % au 1ᵉʳ juillet 2025. Le taux sert de repère pour l'OSS :
  le laisser à 22 aurait sous-facturé chaque vente estonienne dès l'activation du guichet
  unique — et la différence resterait due par le vendeur.
  ⚠ Les commandes DÉJÀ passées ne bougent pas : le taux appliqué est recopié sur chaque
  commande, précisément pour que l'historique ne se réécrive pas.
*/
UPDATE eu_vat_rates SET standard_rate = 24, updated_at = now()
 WHERE country_code = 'EE' AND standard_rate <> 24;

INSERT INTO eu_vat_rates (country_code, country_name, standard_rate) VALUES
  ('XI', 'Irlande du Nord (biens)', 20)
ON CONFLICT (country_code) DO NOTHING;

-- Pour que le pays saisi en toutes lettres se résolve, comme les autres.
INSERT INTO country_aliases (alias, code) VALUES
  ('irlande du nord', 'XI'), ('northern ireland', 'XI'), ('xi', 'XI')
ON CONFLICT (alias) DO UPDATE SET code = EXCLUDED.code;

-- ===========================================================================
-- 4. Le drapeau du guichet unique
-- ===========================================================================
/*
  FAUX par défaut, et c'est délibéré : tant que l'exploitant n'a pas dépassé le seuil et ne
  s'est pas inscrit au guichet unique, appliquer le taux de destination serait une erreur —
  il n'aurait aucun moyen de reverser cette TVA au bon État. `seuil_oss()` dit QUAND lever le
  drapeau ; le lever reste une décision, pas un automatisme.
  Conséquence directe : appliquer cette migration ne change AUCUN prix affiché aujourd'hui.
*/
INSERT INTO site_settings (key, value)
VALUES ('oss_actif', '{"actif": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ===========================================================================
-- 5. L'outre-mer, défini une fois pour toutes
-- ===========================================================================
/*
  ★ MÊME MOTIF que `regime_tva` ci-dessous — c'est tout l'intérêt de le corriger ici aussi.
  `est_outre_mer()` alimente `declaration_tva` (ligne « livraisons outre-mer », art. 294 du
  CGI) : avec l'ancien `^(97|98)`, une vente MONÉGASQUE atterrissait dans cette ligne, donc
  hors de la TVA collectée France. La déclaration était fausse des deux côtés à la fois.

  ⚠ Fonction IMMUTABLE remplacée en place : aucun index ni aucune vue matérialisée ne s'y
  appuie (vérifié), la substitution est donc sans effet de bord.
*/
CREATE OR REPLACE FUNCTION public.est_outre_mer(p_adresse jsonb, p_pays text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT coalesce(
    upper(coalesce(p_pays, '')) IN ('FR', 'FRANCE')
    -- 971 Guadeloupe · 972 Martinique · 973 Guyane · 974 La Réunion · 975 Saint-Pierre-et-
    -- Miquelon · 976 Mayotte · 984 TAAF · 986 Wallis-et-Futuna · 987 Polynésie française ·
    -- 988 Nouvelle-Calédonie. ⚠ 980xx = MONACO : territoire fiscal FRANÇAIS, donc exclu.
    AND coalesce(p_adresse ->> 'postal_code', '') ~ '^97[1-6]|^98[4-8]',
    false);
$function$;

COMMENT ON FUNCTION public.est_outre_mer(jsonb, text) IS
  'Vrai pour un DOM ou une COM (971-976, 984-988). ⚠ FAUX pour Monaco (980xx), qui est '
  'territoire fiscal français. Même motif que regime_tva : les deux ne doivent jamais diverger.';

-- ===========================================================================
-- 6. Le moteur de TVA
-- ===========================================================================
/*
  ⚠ `CREATE OR REPLACE` et non `DROP` + `CREATE` : la signature et le type de retour ne
  changent pas, donc on remplace le corps sans casser les droits ni créer de surcharge
  (PostgREST résout les fonctions par nom d'argument — deux variantes rendraient l'appel
  ambigu, comme l'expliquait déjà la migration du 3 août).

  Les TROIS verrous de l'exonération B2B (numéro délivré par l'État de livraison, identité du
  titulaire, adresse de livraison + dérogation) sont repris À L'IDENTIQUE, dans le même ordre
  et avec les mêmes messages de refus. Aucun n'est assoupli.
*/
CREATE OR REPLACE FUNCTION public.regime_tva(
  p_pays        text,
  p_entreprise  boolean,
  p_vat_valide  boolean,
  p_code_postal text    DEFAULT NULL,
  p_vat_number  text    DEFAULT NULL,
  p_identite_ok boolean DEFAULT NULL,
  p_adresse_ok  boolean DEFAULT NULL,
  p_derogation  boolean DEFAULT false
)
RETURNS TABLE(regime text, taux numeric, mention text, territoire text, refus text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pays       text;
  v_cp         text;
  v_prefixe    text;
  v_ue         boolean;
  v_ts         territoires_speciaux%ROWTYPE;
  v_trouve_ts  boolean := false;
  v_territoire text;
  v_oss        boolean;
  v_taux_b2c   numeric := 20;
  v_taux_dest  numeric;
BEGIN
  v_pays := upper(btrim(coalesce(p_pays, 'FR')));
  IF v_pays = '' THEN v_pays := 'FR'; END IF;

  /*
    ⚠ Garde-fou : la fonction attend un CODE ISO, et ses appelants lui en donnent un
    (`devis-commande` passe le résultat de `code_pays()`). Mais si un NOM de pays arrivait
    ici — « France », « Allemagne » —, l'ancienne version le majusculait (« FRANCE »), ne le
    trouvait dans aucune table, et concluait « exportation, 0 % ». Autrement dit : un seul
    appelant distrait, et toutes les ventes passaient hors taxe. On tente donc la résolution
    par le référentiel de pays, exactement comme le reste du site. Un code ISO valide n'est
    pas touché ; un libellé inconnu retombe sur l'ancien comportement.
  */
  IF length(v_pays) <> 2 THEN
    v_pays := coalesce(code_pays(v_pays), v_pays);
  END IF;

  v_cp      := regexp_replace(coalesce(p_code_postal, ''), '\s', '', 'g');
  v_prefixe := upper(substring(regexp_replace(coalesce(p_vat_number, ''), '[^A-Za-z0-9]', '', 'g') from 1 for 2));

  -- ---------------------------------------------------------------------
  -- MONACO : territoire fiscal français pour la TVA. Une vente y est une vente France.
  -- ---------------------------------------------------------------------
  IF v_pays = 'MC' THEN
    RETURN QUERY SELECT 'fr'::text, 20::numeric, NULL::text, 'MC'::text, NULL::text;
    RETURN;
  END IF;

  -- ---------------------------------------------------------------------
  -- ★ OUTRE-MER — le motif corrigé.
  --   DOM : 971 Guadeloupe · 972 Martinique · 973 Guyane · 974 La Réunion · 976 Mayotte
  --   COM : 975 Saint-Pierre-et-Miquelon · 984 TAAF · 986 Wallis-et-Futuna ·
  --         987 Polynésie française · 988 Nouvelle-Calédonie
  --   ⚠ 980xx = MONACO, en TVA française à 20 %. L'ancien motif '^(97|98)' l'exonérait :
  --   c'est la correction centrale de cette migration.
  -- ---------------------------------------------------------------------
  IF v_pays = 'FR' AND v_cp ~ '^97[1-6]|^98[4-8]' THEN
    RETURN QUERY SELECT 'export'::text, 0::numeric,
      'Exonération de TVA — livraison vers un département ou une collectivité d''outre-mer (art. 294 du CGI).'::text,
      (CASE WHEN v_cp ~ '^97[1-4]|^976' THEN 'FR-DOM' ELSE 'FR-COM' END)::text,
      NULL::text;
    RETURN;
  END IF;

  -- Adresse « France » avec un code postal monégasque : c'est Monaco, donc 20 %.
  IF v_pays = 'FR' AND v_cp ~ '^980' THEN
    RETURN QUERY SELECT 'fr'::text, 20::numeric, NULL::text, 'MC'::text, NULL::text;
    RETURN;
  END IF;

  -- ---------------------------------------------------------------------
  -- Territoires particuliers : le motif le plus précis l'emporte sur le catch-all.
  -- ---------------------------------------------------------------------
  SELECT * INTO v_ts
    FROM territoires_speciaux ts
   WHERE ts.actif
     AND ts.code_pays = v_pays
     AND (ts.motif_cp = '' OR v_cp ~ ts.motif_cp)
   ORDER BY length(ts.motif_cp) DESC
   LIMIT 1;
  v_trouve_ts := FOUND;   -- mémorisé : tout SELECT ultérieur réécrirait FOUND.

  IF v_trouve_ts AND v_ts.regime = 'export' THEN
    RETURN QUERY SELECT 'export'::text, coalesce(v_ts.taux, 0)::numeric,
      coalesce(v_ts.mention,
        'Exonération de TVA — territoire exclu du champ d''application de la TVA de l''Union européenne (art. 262 I du CGI).')::text,
      v_ts.territoire::text, NULL::text;
    RETURN;
  END IF;

  -- Territoire qui RESTE dans l'Union (Irlande du Nord) : on continue le parcours normal en
  -- mémorisant simplement son libellé de territoire.
  v_territoire := CASE WHEN v_trouve_ts THEN v_ts.territoire ELSE NULL END;

  SELECT true INTO v_ue FROM eu_vat_rates WHERE country_code = v_pays;
  v_ue := coalesce(v_ue, false);

  IF v_pays = 'FR' THEN
    RETURN QUERY SELECT 'fr'::text, 20::numeric, NULL::text, 'FR'::text, NULL::text;
    RETURN;
  END IF;

  IF NOT v_ue THEN
    RETURN QUERY SELECT 'export'::text, 0::numeric,
      'Exonération de TVA — exportation hors Union européenne (art. 262 I du CGI).'::text,
      'HORS-UE'::text, NULL::text;
    RETURN;
  END IF;

  v_territoire := coalesce(v_territoire, 'UE');

  -- ---------------------------------------------------------------------
  -- ★ GUICHET UNIQUE (OSS). Tant que le drapeau est baissé, on facture 20 % — le
  --   comportement d'avant, à l'identique, donc AUCUNE régression le jour de la mise en
  --   production. Une fois levé, c'est le taux du pays de DESTINATION qui s'applique aux
  --   particuliers, et il se déclare pays par pays.
  --   ⚠ On lit `eu_vat_rates`, ce que l'ancienne version ne faisait JAMAIS : elle renvoyait
  --   20 en dur pour ue_b2c, quel que soit le pays.
  -- ---------------------------------------------------------------------
  SELECT CASE
           WHEN jsonb_typeof(s.value) = 'boolean' THEN (s.value #>> '{}')::boolean
           ELSE coalesce((s.value ->> 'actif')::boolean, false)
         END
    INTO v_oss
    FROM site_settings s WHERE s.key = 'oss_actif';

  IF coalesce(v_oss, false) THEN
    SELECT standard_rate INTO v_taux_dest FROM eu_vat_rates WHERE country_code = v_pays;
    IF v_taux_dest IS NOT NULL THEN
      v_taux_b2c := v_taux_dest;
    END IF;
  END IF;

  -- ---- Union européenne : l'exonération B2B se mérite, verrou par verrou ----
  IF NOT coalesce(p_entreprise, false) THEN
    RETURN QUERY SELECT 'ue_b2c'::text, v_taux_b2c, NULL::text, v_territoire, NULL::text;
    RETURN;
  END IF;

  IF NOT coalesce(p_vat_valide, false) THEN
    RETURN QUERY SELECT 'ue_b2c'::text, v_taux_b2c, NULL::text, v_territoire,
      'Numéro de TVA non vérifié auprès du fichier européen VIES.'::text;
    RETURN;
  END IF;

  -- ★ VERROU 1 : numéro délivré par l'État de livraison.
  IF v_prefixe <> v_pays THEN
    RETURN QUERY SELECT 'ue_b2c'::text, v_taux_b2c, NULL::text, v_territoire,
      format('Le numéro de TVA (%s) n''est pas délivré par le pays de livraison (%s).',
             coalesce(nullif(v_prefixe, ''), '—'), v_pays)::text;
    RETURN;
  END IF;

  -- ★ VERROU 2 : la raison sociale déclarée est celle du titulaire.
  IF p_identite_ok IS FALSE THEN
    RETURN QUERY SELECT 'ue_b2c'::text, v_taux_b2c, NULL::text, v_territoire,
      'Le numéro de TVA n''est pas enregistré au nom de la société indiquée.'::text;
    RETURN;
  END IF;

  -- ★ VERROU 3 : la livraison part vers l'établissement du titulaire. C'est ce verrou qui
  -- ôte tout intérêt à l'usurpation : même en devinant la raison sociale, il faut se faire
  -- livrer là où la société est établie. La dérogation d'un administrateur le lève, après
  -- contrôle humain.
  IF p_adresse_ok IS FALSE AND NOT coalesce(p_derogation, false) THEN
    RETURN QUERY SELECT 'ue_b2c'::text, v_taux_b2c, NULL::text, v_territoire,
      'L''adresse de livraison ne correspond pas à l''établissement enregistré pour ce numéro de TVA. Contactez-nous pour une livraison sur un autre site.'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'ue_b2b'::text, 0::numeric,
    'Autoliquidation — livraison intracommunautaire exonérée (art. 262 ter I du CGI). TVA due par le preneur.'::text,
    v_territoire, NULL::text;
END;
$function$;

COMMENT ON FUNCTION public.regime_tva(text, boolean, boolean, text, text, boolean, boolean, boolean) IS
  'Décide le régime de TVA d''une vente. SOURCE UNIQUE : ne jamais redécider ailleurs. '
  'Renvoie TOUJOURS un `territoire` sous forme de code (FR | FR-DOM | FR-COM | MC | UE | '
  'HORS-UE | UE-EXCLU) et un `taux` conforme au guichet unique quand oss_actif est levé.';

REVOKE ALL ON FUNCTION public.regime_tva(text, boolean, boolean, text, text, boolean, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.regime_tva(text, boolean, boolean, text, text, boolean, boolean, boolean) TO anon, authenticated, service_role;

-- ===========================================================================
-- 7. Le seuil OSS, mesuré sur la bonne assiette
-- ===========================================================================
/*
  Le seuil de 10 000 € s'apprécie **hors taxe**, et sur l'année N ET l'année N−1 : le
  dépasser une année entraîne l'application du régime dès l'année suivante. L'ancien calcul
  sommait `sub_total + tax` sur la seule année en cours.
*/
CREATE OR REPLACE FUNCTION public.seuil_oss(p_annee integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_annee integer;
  v_total numeric;
  v_n1    numeric;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Réservé aux administrateurs'; END IF;
  v_annee := coalesce(p_annee, extract(year FROM (now() AT TIME ZONE 'Europe/Paris'))::integer);

  SELECT coalesce(sum(o.sub_total), 0) INTO v_total
    FROM orders o
   WHERE o.vat_regime = 'ue_b2c'
     AND o.status NOT IN ('cancelled', 'refunded')
     AND extract(year FROM coalesce(o.delivery_date, (o.created_at AT TIME ZONE 'Europe/Paris')::date)) = v_annee;

  SELECT coalesce(sum(o.sub_total), 0) INTO v_n1
    FROM orders o
   WHERE o.vat_regime = 'ue_b2c'
     AND o.status NOT IN ('cancelled', 'refunded')
     AND extract(year FROM coalesce(o.delivery_date, (o.created_at AT TIME ZONE 'Europe/Paris')::date)) = v_annee - 1;

  RETURN jsonb_build_object(
    'annee', v_annee,
    'total_ht', v_total,
    -- ⚠ Clé conservée pour l'écran Admin → TVA, qui la lit encore. Elle porte désormais le
    -- montant HORS TAXE : c'est l'assiette correcte du seuil. À renommer côté interface.
    'total_ttc', v_total,
    'total_ht_annee_precedente', v_n1,
    'depasse_annee_precedente', v_n1 > 10000,
    'seuil', 10000,
    'restant', greatest(0, 10000 - v_total),
    -- Le régime s'applique dès qu'une des deux années dépasse.
    'depasse', (v_total > 10000) OR (v_n1 > 10000),
    'pourcentage', round((v_total / 10000 * 100)::numeric, 1)
  );
END;
$function$;

COMMENT ON FUNCTION public.seuil_oss(integer) IS
  'Suivi du seuil de 10 000 € du guichet unique, mesuré HORS TAXE sur l''année N et N−1. '
  'Dit quand lever site_settings.oss_actif — ne le lève jamais tout seul.';

REVOKE ALL ON FUNCTION public.seuil_oss(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seuil_oss(integer) TO authenticated, service_role;

-- ===========================================================================
-- 8. Déclaration de TVA : bonne période, bon fuseau, remboursements déduits
-- ===========================================================================
/*
  Trois corrections, invisibles à l'œil mais systématiques :

  1. **Fuseau.** `created_at >= p_du` comparait un `timestamptz` à une date, donc à minuit
     UTC. Une commande passée le 1ᵉʳ août à 00 h 30 à Paris est un 31 juillet en UTC : elle
     tombait dans la déclaration du mois précédent. En bordure de période, chaque mois se
     volait des commandes au suivant — dans les deux sens, donc sans jamais se compenser.
  2. **Fait générateur.** Sur des biens, la TVA est exigible à la LIVRAISON. On retient donc
     `delivery_date` dès qu'elle est connue, et la date de commande à défaut.
  3. **Remboursements.** Ils n'étaient déduits nulle part : on déclarait — et on payait — la
     TVA sur des sommes rendues au client. Chaque remboursement est ventilé au taux de sa
     commande d'origine et retranché de la période où il a été émis.

  Le découpage outre-mer / export est conservé (deux lignes différentes de la CA3) et
  s'appuie d'abord sur `vat_territory`, désormais figé, avec repli sur `est_outre_mer()`
  pour les commandes antérieures.
*/
CREATE OR REPLACE FUNCTION public.declaration_tva(p_du date, p_au date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE j jsonb;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Réservé aux administrateurs'; END IF;

  WITH ventes AS (
    SELECT o.vat_regime,
           coalesce(o.customer_country, '?') AS pays,
           coalesce(o.vat_territory IN ('FR-DOM', 'FR-COM'),
                    est_outre_mer(o.shipping_address, o.customer_country)) AS outre_mer,
           o.sub_total::numeric AS base_ht,
           o.tax::numeric       AS tva,
           1::bigint            AS nb
      FROM orders o
     WHERE o.status NOT IN ('cancelled', 'refunded')
       AND coalesce(o.delivery_date, (o.created_at AT TIME ZONE 'Europe/Paris')::date)
           BETWEEN p_du AND p_au
  ),
  remboursements AS (
    /* Un remboursement est un montant TTC. On le ventile au taux DE SA COMMANDE — jamais au
       taux du jour : la régularisation doit annuler exactement ce qui a été collecté.
       Les remboursements échoués ou annulés n'ont rien rendu au client : ils sont exclus. */
    SELECT o.vat_regime,
           coalesce(o.customer_country, '?') AS pays,
           coalesce(o.vat_territory IN ('FR-DOM', 'FR-COM'),
                    est_outre_mer(o.shipping_address, o.customer_country)) AS outre_mer,
           (-round(r.amount / (1 + coalesce(o.vat_rate, 0) / 100.0), 2))::numeric AS base_ht,
           (-(r.amount - round(r.amount / (1 + coalesce(o.vat_rate, 0) / 100.0), 2)))::numeric AS tva,
           0::bigint AS nb
      FROM refunds r
      LEFT JOIN invoices i ON i.id = r.invoice_id
      LEFT JOIN orders   o ON o.id = coalesce(r.order_id, i.order_id)
     WHERE coalesce(r.status, 'succeeded') NOT IN ('failed', 'cancelled')
       AND o.id IS NOT NULL
       AND (r.created_at AT TIME ZONE 'Europe/Paris')::date BETWEEN p_du AND p_au
  ),
  m AS (
    SELECT * FROM ventes
    UNION ALL
    SELECT * FROM remboursements
  )
  SELECT jsonb_build_object(
    'periode', jsonb_build_object('du', p_du, 'au', p_au, 'fuseau', 'Europe/Paris'),
    'ventes_france', jsonb_build_object(
      'base_ht',       coalesce(sum(m.base_ht) FILTER (WHERE m.vat_regime = 'fr'), 0),
      'tva_collectee', coalesce(sum(m.tva)     FILTER (WHERE m.vat_regime = 'fr'), 0),
      'nb',            coalesce(sum(m.nb)      FILTER (WHERE m.vat_regime = 'fr'), 0)),
    'ventes_ue_b2c', jsonb_build_object(
      'base_ht',       coalesce(sum(m.base_ht) FILTER (WHERE m.vat_regime = 'ue_b2c'), 0),
      'tva_collectee', coalesce(sum(m.tva)     FILTER (WHERE m.vat_regime = 'ue_b2c'), 0),
      'nb',            coalesce(sum(m.nb)      FILTER (WHERE m.vat_regime = 'ue_b2c'), 0)),
    'livraisons_intracommunautaires', jsonb_build_object(
      'base_ht',       coalesce(sum(m.base_ht) FILTER (WHERE m.vat_regime = 'ue_b2b'), 0),
      'nb',            coalesce(sum(m.nb)      FILTER (WHERE m.vat_regime = 'ue_b2b'), 0)),
    -- Exportations HORS Union européenne, au sens de l'art. 262 I du CGI.
    'exportations', jsonb_build_object(
      'base_ht',       coalesce(sum(m.base_ht) FILTER (WHERE m.vat_regime = 'export' AND NOT m.outre_mer), 0),
      'nb',            coalesce(sum(m.nb)      FILTER (WHERE m.vat_regime = 'export' AND NOT m.outre_mer), 0)),
    -- Livraisons vers les DOM/COM, art. 294 du CGI : une AUTRE ligne de CA3.
    'livraisons_outre_mer', jsonb_build_object(
      'base_ht',       coalesce(sum(m.base_ht) FILTER (WHERE m.vat_regime = 'export' AND m.outre_mer), 0),
      'nb',            coalesce(sum(m.nb)      FILTER (WHERE m.vat_regime = 'export' AND m.outre_mer), 0)),
    'remboursements', jsonb_build_object(
      'base_ht',       coalesce(sum(m.base_ht) FILTER (WHERE m.nb = 0), 0),
      'tva',           coalesce(sum(m.tva)     FILTER (WHERE m.nb = 0), 0)),
    'total_tva_collectee', coalesce(sum(m.tva), 0),
    'total_ht',            coalesce(sum(m.base_ht), 0),
    'sans_regime',         coalesce(sum(m.nb) FILTER (WHERE m.vat_regime IS NULL), 0),
    -- Détail par pays : nécessaire au guichet unique (OSS), qui se déclare pays par pays.
    -- L'outre-mer y apparaît sous son propre libellé, sinon il se cacherait dans « FR ».
    'par_pays', coalesce((
      SELECT jsonb_agg(x ORDER BY x ->> 'pays')
        FROM (
          SELECT jsonb_build_object(
                   'pays',    CASE WHEN m2.outre_mer THEN 'FR-DOM' ELSE m2.pays END,
                   'regime',  CASE WHEN m2.outre_mer THEN 'outre_mer' ELSE m2.vat_regime END,
                   'base_ht', sum(m2.base_ht),
                   'tva',     sum(m2.tva),
                   'nb',      sum(m2.nb)) AS x
            FROM m m2
           GROUP BY CASE WHEN m2.outre_mer THEN 'FR-DOM' ELSE m2.pays END,
                    CASE WHEN m2.outre_mer THEN 'outre_mer' ELSE m2.vat_regime END
        ) t), '[]'::jsonb)
  ) INTO j
  FROM m;

  RETURN j;
END;
$function$;

REVOKE ALL ON FUNCTION public.declaration_tva(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.declaration_tva(date, date) TO authenticated, service_role;

/*
  L'état récapitulatif (DES) suit exactement les mêmes règles de période, et déduit lui aussi
  les remboursements : une ligne DES qui ne correspond pas à la déclaration de l'acheteur est
  le point de départ d'un contrôle.
*/
CREATE OR REPLACE FUNCTION public.declaration_des(p_du date, p_au date)
RETURNS TABLE(
  numero_tva text, client text, pays text,
  montant_ht numeric, nb_lignes bigint,
  verifie_le timestamptz, nom_vies text, adresse_vies text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Réservé aux administrateurs'; END IF;

  RETURN QUERY
  WITH ventes AS (
    SELECT o.vat_number,
           coalesce(o.customer_country, '?') AS pays_code,
           o.company_name, o.vies_name, o.vies_address, o.vies_checked_at,
           o.sub_total::numeric AS montant, 1::bigint AS nb
      FROM orders o
     WHERE o.vat_regime = 'ue_b2b'
       AND o.status NOT IN ('cancelled', 'refunded')
       AND o.vat_number IS NOT NULL
       AND coalesce(o.delivery_date, (o.created_at AT TIME ZONE 'Europe/Paris')::date)
           BETWEEN p_du AND p_au
  ),
  remb AS (
    SELECT o.vat_number,
           coalesce(o.customer_country, '?') AS pays_code,
           o.company_name, o.vies_name, o.vies_address, o.vies_checked_at,
           -- Régime b2b : le montant remboursé est déjà HT (0 % de TVA).
           (-r.amount)::numeric AS montant, 0::bigint AS nb
      FROM refunds r
      LEFT JOIN invoices i ON i.id = r.invoice_id
      LEFT JOIN orders   o ON o.id = coalesce(r.order_id, i.order_id)
     WHERE o.vat_regime = 'ue_b2b'
       AND o.vat_number IS NOT NULL
       AND coalesce(r.status, 'succeeded') NOT IN ('failed', 'cancelled')
       AND (r.created_at AT TIME ZONE 'Europe/Paris')::date BETWEEN p_du AND p_au
  ),
  m AS (SELECT * FROM ventes UNION ALL SELECT * FROM remb)
  SELECT m.vat_number::text,
         coalesce(max(m.company_name), max(m.vies_name), '—')::text,
         m.pays_code::text,
         sum(m.montant)::numeric,
         sum(m.nb)::bigint,
         max(m.vies_checked_at),
         max(m.vies_name)::text,
         max(m.vies_address)::text
    FROM m
   GROUP BY m.vat_number, m.pays_code
   ORDER BY 3, 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.declaration_des(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.declaration_des(date, date) TO authenticated, service_role;

-- ===========================================================================
-- 9. La confirmation de commande recopie aussi le territoire, la mention et le port HT
-- ===========================================================================
/*
  La version du 4 août recopiait déjà le régime, le taux et la preuve VIES du devis vers la
  commande. Il manquait six champs, tous nécessaires en aval :
   · `vat_mention`      — la mention légale d'exonération. Sans elle sur la facture, la
                          facture est irrégulière et l'exonération contestable.
   · `vat_territory`    — la clé de déclaration (DOM ≠ export), désormais figée.
   · `shipping_cost_ht` — le port HT, pour que `creer_facture_depuis_commande()` porte SA
                          ligne de port sans rediviser un TTC au hasard.
   · `shipping_carrier`, `shipping_service`, `shipping_relay` — le transporteur, l'offre et
                          le point relais que le client a CHOISIS. Sans eux, l'information
                          meurt avec le devis : l'exploitant reçoit une commande à expédier
                          sans savoir par qui ni vers quel relais, et le tarif appliqué
                          devient impossible à rejouer.

  ⚠ Rien n'est retiré : contrôle du rôle serveur, contrôle d'appartenance du devis, contrôle
  du paiement, idempotence et recopie VIES sont repris À L'IDENTIQUE de la version en place.
*/
CREATE OR REPLACE FUNCTION public.confirmer_commande(
  p_quote_id uuid, p_payment_intent text, p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE q order_quotes%ROWTYPE; v_order_id uuid; v_existing uuid; it jsonb; v_role text;
BEGIN
  v_role := coalesce(current_setting('request.jwt.claim.role', true), '');
  IF v_role <> 'service_role' AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'La commande est enregistrée par le serveur de paiement.';
  END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'Client non identifié'; END IF;

  SELECT * INTO q FROM order_quotes WHERE id = p_quote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Devis introuvable'; END IF;
  IF q.user_id <> p_user_id THEN RAISE EXCEPTION 'Ce devis ne vous appartient pas'; END IF;
  IF coalesce(q.stripe_payment_intent_id, '') <> p_payment_intent THEN
    RAISE EXCEPTION 'Paiement étranger à ce devis';
  END IF;

  SELECT id INTO v_existing FROM orders
   WHERE stripe_payment_intent_id = p_payment_intent
      OR (quote_id IS NOT NULL AND quote_id = p_quote_id) LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('order_id', v_existing, 'deja_creee', true);
  END IF;

  INSERT INTO orders (
    user_id, stripe_payment_intent_id, quote_id,
    sub_total, tax, total, shipping_cost, shipping_method, status,
    user_type, shipping_address,
    customer_country, is_company, company_name, vat_number, vat_validated,
    vat_regime, vat_rate, vies_checked_at, vies_name, vies_address,
    -- ★ Les six champs ajoutés.
    vat_mention, vat_territory, shipping_cost_ht,
    shipping_carrier, shipping_service, shipping_relay
  ) VALUES (
    q.user_id, p_payment_intent, q.id,
    q.subtotal_ht, q.tax_amount, q.total_ttc, q.shipping_cost, q.shipping_method, 'confirmed',
    CASE WHEN q.is_company THEN 'pro' ELSE 'particulier' END, q.shipping_address,
    q.customer_country, q.is_company, q.company_name, q.vat_number, q.vat_validated,
    q.vat_regime, q.vat_rate, q.vies_checked_at, q.vies_name, q.vies_address,
    q.vat_mention, q.vat_territory,
    -- Repli sur la conversion du barème TTC tant que `devis-commande` n'écrit pas encore
    -- `shipping_cost_ht` : mieux vaut une valeur juste calculée ici qu'une colonne vide.
    coalesce(q.shipping_cost_ht, round(coalesce(q.shipping_cost, 0) / 1.2, 2)),
    q.shipping_carrier, q.shipping_service, q.shipping_relay
  ) RETURNING id INTO v_order_id;

  FOR it IN SELECT * FROM jsonb_array_elements(q.items) LOOP
    INSERT INTO order_items (order_id, product_id, quantity, price)
    VALUES (v_order_id, (it->>'product_id')::uuid, (it->>'quantity')::int, (it->>'unit_ht')::numeric);
  END LOOP;

  UPDATE order_quotes SET consumed_at = now() WHERE id = q.id;
  RETURN jsonb_build_object('order_id', v_order_id, 'deja_creee', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.confirmer_commande(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirmer_commande(uuid, text, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ===========================================================================
-- VÉRIFICATIONS — à exécuter APRÈS application (aucune n'écrit)
-- ===========================================================================
/*
-- 1. ★ MONACO N'EST PLUS EXONÉRÉ (attendu : regime = 'fr', taux = 20, territoire = 'MC').
SELECT * FROM regime_tva('FR', false, false, '98000');
SELECT * FROM regime_tva('MC', false, false, '98000');

-- 2. L'outre-mer l'est toujours (attendu : export, 0, FR-DOM puis FR-COM).
SELECT '974' AS cp, * FROM regime_tva('FR', false, false, '97400')
UNION ALL SELECT '987', * FROM regime_tva('FR', false, false, '98700');

-- 3. `territoire` est TOUJOURS renseigné — 0 ligne attendue.
SELECT t.cp, t.pays, r.*
  FROM (VALUES ('FR','75001'),('FR','97400'),('FR','98000'),('MC','98000'),('DE','10115'),
               ('ES','35001'),('ES','28001'),('US','10001'),('XI','BT11AA')) AS t(pays, cp)
  CROSS JOIN LATERAL regime_tva(t.pays, false, false, t.cp) r
 WHERE r.territoire IS NULL;

-- 4. Territoires exclus : Canaries (35001) et Ceuta (51001) en export 0 %, Madrid à 20 %.
SELECT 'canaries' AS cas, * FROM regime_tva('ES', false, false, '35001')
UNION ALL SELECT 'ceuta',  * FROM regime_tva('ES', false, false, '51001')
UNION ALL SELECT 'madrid', * FROM regime_tva('ES', false, false, '28001');

-- 5. OSS : le drapeau baissé ne change RIEN (20 %). Le lever donne le taux de destination.
SELECT value FROM site_settings WHERE key = 'oss_actif';       -- {"actif": false}
SELECT * FROM regime_tva('DE', false, false, '10115');          -- ue_b2c, 20
--   Essai réversible :
--   BEGIN;
--     UPDATE site_settings SET value = '{"actif": true}' WHERE key = 'oss_actif';
--     SELECT * FROM regime_tva('DE', false, false, '10115');    -- ue_b2c, 19
--     SELECT * FROM regime_tva('HU', false, false, '1011');     -- ue_b2c, 27
--   ROLLBACK;

-- 6. `est_outre_mer` : Monaco doit être FAUX, La Réunion VRAI.
SELECT est_outre_mer('{"postal_code":"98000"}'::jsonb, 'FR') AS monaco_doit_etre_faux,
       est_outre_mer('{"postal_code":"97400"}'::jsonb, 'FR') AS reunion_doit_etre_vrai,
       est_outre_mer('{"postal_code":"98800"}'::jsonb, 'FR') AS noumea_doit_etre_vrai;

-- 7. Fuseau des déclarations : la période doit être annoncée en Europe/Paris.
SELECT declaration_tva(date_trunc('month', current_date)::date, current_date) -> 'periode';

-- 8. Seuil OSS : assiette HORS TAXE et année N−1 présentes.
SELECT seuil_oss();   -- clés attendues : total_ht, total_ht_annee_precedente, depasse_annee_precedente

-- 9. Le référentiel des territoires est chargé (6 lignes attendues).
SELECT code_pays, motif_cp, regime, territoire FROM territoires_speciaux ORDER BY 1, 2;

-- 10. Estonie à 24 % et Irlande du Nord présente.
SELECT country_code, country_name, standard_rate FROM eu_vat_rates WHERE country_code IN ('EE','XI');
*/
