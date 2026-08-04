/*
  # Livraison : le vrai barème des transporteurs, en base

  ## Ce qu'on remplace
  Un objet `site_settings.shipping_config` de cinq nombres :

      { "small_flat": 7.99, "large_near": 129, "large_far": 259,
        "near_departments": ["34","11","30","81","12","66"], "delay_days": 7 }

  Un forfait unique de 7,99 € pour TOUT colis, quelle que soit la destination.
  Le référentiel 2026 (`referentiel_transporteurs_omega_2026.json`, section
  `alerte_tarification_reunion`) chiffre ce que cela coûte, sur la seule Réunion :

      colis 0,5 kg, offre la MOINS chère (maritime, 13-31 j) : coût 8,41 € TTC → −0,42 €
      colis 1 kg   (Colissimo prioritaire OM1)               : coût 19,00 €    → −11,01 €
      colis 5 kg   (bidon de liquide)                        : coût 38,90 €    → −30,91 €
      colis 15 kg  (hazer)                                   : coût 130,20 €   → −122,21 €
      colis 30 kg                                            : coût 143,02 €   → −135,03 €

  « Le tarif de 7,99 € est inférieur au coût réel sur TOUTES les tranches de poids, y compris
  la plus basse en offre économique. Chaque expédition vers La Réunion est vendue à perte. »
  Un colis de 15 kg vers l'outre-mer coûtait 122 € de plus qu'il ne rapportait.

  ## D'où viennent les chiffres
  UNIQUEMENT de `/home/claude/referentiel_transporteurs_omega_2026.json` (contrat §3).
  Aucun prix n'est inventé. Deux transformations, et deux seulement, appliquées de façon
  visible dans le SQL lui-même :
   · les grilles publiées en TTC sont divisées par 1,2 — le référentiel donne
     `meta.tva_France = 0.2` et `base_prix: "TTC"` sur ces grilles. Le calcul est écrit
     `round(12.02 / 1.2, 2)` pour que la valeur d'origine reste lisible et vérifiable ;
   · les grilles « fourchette de marché » (messagerie palette) sont ramenées à leur borne
     MÉDIANE, écrite `(55 + 95) / 2.0`, comme l'impose le contrat §3.

  Ne sont PAS insérés, faute de chiffre fiable :
   · DPD et GLS France — le référentiel le dit : « DPD France NE PUBLIE PAS de grille »,
     « GLS France ne publie aucune grille ». Les fourchettes existent, mais aucune des deux
     n'est un tarif OMEGA tant qu'il n'y a pas de contrat signé ;
   · Colissimo International vers LU et AT — le référentiel les signale comme
     « INFERENCE a valider », donc pas comme une source.

  ## Les points durs du contrat §3, traités nommément
   · Outre-mer : zones OM1/OM2, jamais le tarif métropole (c'est la perte ci-dessus) ;
   · Corse (20xxx) : grille métropole + supplément, jamais le tarif métropole nu ;
   · Monaco (980xx) : c'est la France, tarif métropole — à ne pas confondre avec l'outre-mer ;
   · au-delà de 30 kg : bascule automatique en palette (le référentiel : « A partir de
     25-30 kg par unite, la messagerie palette devient obligatoire ») ;
   · poids volumétrique : `poids_volumetrique()` applique (L × l × h) / 5000 ;
   · code postal invalide ≠ destination hors zone : deux motifs distincts.

  ## Les codes de service sont IMPOSÉS
  Ils doivent correspondre EXACTEMENT à ceux du module `src/utils/shipping.ts` déjà écrit,
  puisqu'ils sont recopiés dans `orders.shipping_service` par le front puis relus ici :
  `colissimo_domicile`, `colissimo_om_prioritaire`, `colissimo_om_economique`,
  `colissimo_international`, `chronopost_chrono18`, `chronopost_chrono13`,
  `mondial_relay_point_relais`, `mondial_relay_point_relais_eu`, `colissimo_point_retrait`,
  `messagerie_palette`, `retrait_depot`. Trois codes supplémentaires existent pour des offres
  documentées par le référentiel mais non exposées par le module (`relais_colis`,
  `messagerie_palette_eu`, `colissimo_domicile_sans_signature`).

  Idempotente et rejouable : `CREATE TABLE IF NOT EXISTS`, `ON CONFLICT DO UPDATE`,
  `CREATE OR REPLACE`, `DROP POLICY IF EXISTS`.
*/

-- ===========================================================================
-- 1. Les tables (contrat §2)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS shipping_carriers (
  code  text PRIMARY KEY,
  nom   text NOT NULL,
  actif boolean NOT NULL DEFAULT true,
  ordre integer NOT NULL DEFAULT 100
);

CREATE TABLE IF NOT EXISTS shipping_services (
  code         text PRIMARY KEY,
  carrier_code text NOT NULL REFERENCES shipping_carriers(code) ON DELETE CASCADE,
  nom          text NOT NULL,
  -- Les quatre modes exposés au client, plus le retrait au dépôt (contrat §3).
  mode         text NOT NULL CHECK (mode IN ('domicile', 'express', 'relais', 'palette', 'retrait')),
  delai_min_j  integer,
  delai_max_j  integer,
  poids_max_kg numeric(10,2),
  -- Somme L + l + h admise, en centimètres (limites dimensionnelles du référentiel).
  dim_max_cm   integer,
  actif        boolean NOT NULL DEFAULT true,
  ordre        integer NOT NULL DEFAULT 100
);

CREATE TABLE IF NOT EXISTS shipping_zones (
  code     text PRIMARY KEY,
  nom      text NOT NULL,
  -- NULL = tous les pays (cas du retrait au dépôt).
  pays     text[],
  -- Expression régulière sur le code postal. NULL ou '' = tout le pays.
  motif_cp text
);

CREATE TABLE IF NOT EXISTS shipping_rates (
  service_code text NOT NULL REFERENCES shipping_services(code) ON DELETE CASCADE,
  zone_code    text NOT NULL REFERENCES shipping_zones(code)    ON DELETE CASCADE,
  -- Borne HAUTE de la tranche : le prix s'applique à tout envoi de poids <= max_kg.
  max_kg       numeric(10,3) NOT NULL,
  prix_ht      numeric(10,2) NOT NULL,
  PRIMARY KEY (service_code, zone_code, max_kg)
);

CREATE TABLE IF NOT EXISTS shipping_surcharges (
  code         text PRIMARY KEY,
  -- NULL = s'applique quel que soit le service.
  service_code text REFERENCES shipping_services(code) ON DELETE CASCADE,
  libelle      text NOT NULL,
  montant_ht   numeric(10,2),
  pourcentage  numeric(5,2),
  condition    text
);

COMMENT ON TABLE shipping_rates IS
  'Barème par tranche de poids. Le prix de la tranche s''applique à tout envoi dont le '
  'poids FACTURABLE (max du réel et du volumétrique) est inférieur ou égal à max_kg.';
COMMENT ON COLUMN shipping_surcharges.condition IS
  'Description de la condition d''application. Seul « corse_iles » est appliqué '
  'automatiquement par calc_livraison ; les autres sont des repères de facturation pour '
  'l''exploitant (hayon, RDV, étage, ADR…), qui dépendent d''informations que le panier n''a pas.';

-- --- RLS : les prix sont publics, la grille est administrable ---------------
/*
  Le client DOIT voir ce qu'il va payer avant de commander (art. L221-5 du code de la
  consommation : le prix, frais de livraison compris, fait partie de l'information
  précontractuelle). Lecture ouverte, donc, y compris à un visiteur non connecté.
  Écriture réservée aux administrateurs : un barème modifiable par le client, c'est un prix
  fixé par le navigateur — exactement l'invariant n° 1 du contrat.
*/
DO $mig$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['shipping_carriers', 'shipping_services', 'shipping_zones',
                           'shipping_rates', 'shipping_surcharges'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_lecture_publique', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true)',
      t || '_lecture_publique', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING (public.is_admin()) WITH CHECK (public.is_admin())', t || '_admin_all', t);
  END LOOP;
END
$mig$;

/*
  ⚠ Purge des codes d'une version antérieure de ce fichier (jamais appliquée en production,
  mais elle a pu l'être en préproduction). Les laisser produirait des offres en double sous
  deux identifiants, dont un que `src/utils/shipping.ts` ne connaît pas. La suppression
  cascade sur `shipping_rates`.
*/
DELETE FROM shipping_services
 WHERE code IN ('colissimo_relais', 'colissimo_om_prio', 'colissimo_om_eco',
                'chronopost_13', 'chronopost_18',
                'mondial_relay_relais', 'mondial_relay_relais_eu',
                'colissimo_domicile_ss');

-- ===========================================================================
-- 2. Transporteurs
-- ===========================================================================
INSERT INTO shipping_carriers (code, nom, actif, ordre) VALUES
  ('retrait',       'Retrait au dépôt OMEGA — Montblanc (34290)', true, 10),
  ('colissimo',     'Colissimo (La Poste)',                        true, 20),
  ('chronopost',    'Chronopost',                                  true, 30),
  ('mondial_relay', 'Mondial Relay (groupe InPost)',               true, 40),
  ('relais_colis',  'Relais Colis',                                true, 50),
  ('messagerie',    'Messagerie palettisée (groupage)',            true, 60)
ON CONFLICT (code) DO UPDATE SET nom = EXCLUDED.nom, ordre = EXCLUDED.ordre;

-- ===========================================================================
-- 3. Zones
-- ===========================================================================
/*
  ⚠ FR_METRO inclut volontairement la Corse (20xxx) et Monaco (980xx) : le référentiel ne
  donne PAS de grille distincte pour eux, il donne une SURCHARGE pour la Corse (« Corse et
  iles du littoral », 20,14 € HT chez DPD) et rappelle que Monaco relève de la France.
  Créer de fausses grilles aurait été inventer des chiffres.
  Les zones FR_CORSE et FR_MONACO existent pour être nommées dans l'interface ; elles ne
  portent aucun tarif, et `calc_livraison` les traite en appliquant la grille métropole
  (plus le supplément pour la Corse).
*/
INSERT INTO shipping_zones (code, nom, pays, motif_cp) VALUES
  ('TOUS',        'Toutes destinations (retrait au dépôt)', NULL,                      ''),
  ('FR_METRO',    'France métropolitaine (Corse et Monaco compris pour le barème)',
                  ARRAY['FR','MC'], '^(0[1-9]|1[0-9]|2[0-9]|[3-8][0-9]|9[0-5])[0-9]{3}$'),
  ('FR_CORSE',    'Corse et îles du littoral',              ARRAY['FR'],               '^20[0-9]{3}$'),
  ('FR_MONACO',   'Principauté de Monaco',                  ARRAY['FR','MC'],          '^980[0-9]{2}$'),
  ('OM1',         'Outre-mer zone 1 (Guadeloupe, Martinique, Guyane, La Réunion, Mayotte, Saint-Pierre-et-Miquelon, Saint-Martin, Saint-Barthélemy)',
                  ARRAY['FR'], '^97[0-9]{3}$'),
  ('OM2',         'Outre-mer zone 2 (Nouvelle-Calédonie, Polynésie française, Wallis-et-Futuna, TAAF)',
                  ARRAY['FR'], '^98[4-8][0-9]{2}$'),
  -- Colissimo International : une zone par pays, parce que le référentiel donne une grille
  -- par pays et non par zone commerciale.
  ('COL_DE',      'Allemagne (Colissimo International)',    ARRAY['DE'], ''),
  ('COL_BE',      'Belgique (Colissimo International)',     ARRAY['BE'], ''),
  ('COL_NL',      'Pays-Bas (Colissimo International)',     ARRAY['NL'], ''),
  ('COL_IT',      'Italie (Colissimo International)',       ARRAY['IT'], ''),
  ('COL_ES',      'Espagne (Colissimo International)',      ARRAY['ES'], ''),
  ('COL_PT',      'Portugal (Colissimo International)',     ARRAY['PT'], ''),
  -- Mondial Relay Europe : groupes de pays du référentiel.
  ('MR_BENELUX',  'Benelux (Mondial Relay)',                ARRAY['BE','LU','NL'], ''),
  ('MR_SUD',      'Espagne, Portugal, Italie (Mondial Relay)', ARRAY['ES','PT','IT'], ''),
  ('MR_PL',       'Pologne (Mondial Relay)',                ARRAY['PL'], ''),
  -- Messagerie palettisée.
  ('PAL_FR_REG',  'Palette — régional depuis Montblanc (< 200 km)', ARRAY['FR'],
                  '^(11|13|30|31|34|66|84)[0-9]{3}$'),
  ('PAL_FR_NAT',  'Palette — national (200 à 900 km)',      ARRAY['FR'], ''),
  ('PAL_ES',      'Palette — Espagne',                      ARRAY['ES'], ''),
  ('PAL_IT',      'Palette — Italie du Nord',               ARRAY['IT'], ''),
  ('PAL_BE',      'Palette — Belgique',                     ARRAY['BE'], ''),
  ('PAL_DE',      'Palette — Allemagne',                    ARRAY['DE'], ''),
  ('PAL_NL',      'Palette — Pays-Bas',                     ARRAY['NL'], ''),
  ('PAL_LU',      'Palette — Luxembourg',                   ARRAY['LU'], ''),
  ('PAL_PT',      'Palette — Portugal',                     ARRAY['PT'], '')
ON CONFLICT (code) DO UPDATE SET
  nom = EXCLUDED.nom, pays = EXCLUDED.pays, motif_cp = EXCLUDED.motif_cp;

/*
  Le périmètre « régional » vient de `palette_fr_regional_sud.perimetre_depuis_34290` :
  Montpellier (34), Nîmes (30), Béziers (34), Perpignan (66), Toulouse (31, partiel),
  Marseille (13, partiel), Avignon (84). L'Aude (11) est ajoutée : elle est traversée par
  l'axe Béziers → Perpignan, donc nécessairement à l'intérieur du rayon de 200 km. C'est la
  seule extension faite au référentiel, et elle est géographique, pas tarifaire.
*/

-- ===========================================================================
-- 4. Offres — ★ CODES IMPOSÉS, alignés sur src/utils/shipping.ts
-- ===========================================================================
INSERT INTO shipping_services
  (code, carrier_code, nom, mode, delai_min_j, delai_max_j, poids_max_kg, dim_max_cm, actif, ordre) VALUES
  ('retrait_depot',                     'retrait',       'Retrait au dépôt (Montblanc 34290)',            'retrait',  0,  0, NULL, NULL, true,  10),
  -- Grille entreprise AVEC signature : recommandée par le référentiel pour les machines
  -- (« Recommande pour les machines a fumee (valeur unitaire elevee) »).
  ('colissimo_domicile',                'colissimo',     'Colissimo Domicile — remise contre signature',  'domicile', 1,  2, 30,   150,  true,  20),
  -- Variante sans signature : moins chère de 1,05 € HT, mais sans preuve de remise.
  -- INACTIVE par défaut — on ne l'expose pas au client sans décision de l'exploitant, et le
  -- module TypeScript ne la connaît pas.
  ('colissimo_domicile_sans_signature', 'colissimo',     'Colissimo Domicile — sans signature',           'domicile', 1,  2, 30,   150,  false, 25),
  ('colissimo_point_retrait',           'colissimo',     'Colissimo Point de Retrait',                    'relais',   1,  2, 30,   150,  true,  30),
  ('colissimo_om_prioritaire',          'colissimo',     'Colissimo Outre-Mer prioritaire',               'domicile', 6, 18, 30,   150,  true,  40),
  ('colissimo_om_economique',           'colissimo',     'Colissimo Outre-Mer économique (voie maritime)','domicile',13, 31, 30,   150,  true,  45),
  ('colissimo_international',           'colissimo',     'Colissimo Domicile International',              'domicile', 3,  8, 30,   150,  true,  50),
  ('chronopost_chrono18',               'chronopost',    'Chrono 18 — livraison J+1 avant 18 h',          'express',  1,  1, 30,   300,  true,  55),
  ('chronopost_chrono13',               'chronopost',    'Chrono 13 — livraison J+1 avant 13 h',          'express',  1,  1, 30,   300,  true,  60),
  ('mondial_relay_point_relais',        'mondial_relay', 'Mondial Relay — Point Relais / Locker',         'relais',   3,  5, 25,   150,  true,  70),
  ('mondial_relay_point_relais_eu',     'mondial_relay', 'Mondial Relay — Point Relais Europe',           'relais',   3,  5, 25,   150,  true,  75),
  ('relais_colis',                      'relais_colis',  'Relais Colis',                                  'relais',   3,  5, 20,   NULL, true,  80),
  ('messagerie_palette',                'messagerie',    'Messagerie palettisée — France',                'palette',  1,  3, 500,  NULL, true,  90),
  ('messagerie_palette_eu',             'messagerie',    'Groupage palette — Europe de l''Ouest',         'palette',  3,  5, 300,  NULL, true,  95)
ON CONFLICT (code) DO UPDATE SET
  carrier_code = EXCLUDED.carrier_code, nom = EXCLUDED.nom, mode = EXCLUDED.mode,
  delai_min_j = EXCLUDED.delai_min_j, delai_max_j = EXCLUDED.delai_max_j,
  poids_max_kg = EXCLUDED.poids_max_kg, dim_max_cm = EXCLUDED.dim_max_cm,
  ordre = EXCLUDED.ordre;

-- ===========================================================================
-- 5. Les barèmes
-- ===========================================================================

-- --- Retrait au dépôt : gratuit, sans limite de poids ----------------------
INSERT INTO shipping_rates (service_code, zone_code, max_kg, prix_ht) VALUES
  ('retrait_depot', 'TOUS', 999999, 0)
ON CONFLICT (service_code, zone_code, max_kg) DO UPDATE SET prix_ht = EXCLUDED.prix_ht;

/*
  --- Colissimo Domicile France, grille ENTREPRISE, avec signature ------------
  Source : colissimo.entreprise.laposte.fr, « general-rates-colissimo-home-delivery-france ».
  `base_prix: "HT"` — aucune conversion. Référentiel :
  `colissimo_domicile_fr_entreprise_avec_signature`. Tarif général avant remises négociées ;
  33 tranches, jusqu'à 30 kg.
*/
INSERT INTO shipping_rates (service_code, zone_code, max_kg, prix_ht) VALUES
  ('colissimo_domicile','FR_METRO',0.25, 7.89), ('colissimo_domicile','FR_METRO',0.5,  8.76),
  ('colissimo_domicile','FR_METRO',0.75, 9.65), ('colissimo_domicile','FR_METRO',1,   10.39),
  ('colissimo_domicile','FR_METRO',2,   11.53), ('colissimo_domicile','FR_METRO',3,   12.54),
  ('colissimo_domicile','FR_METRO',4,   13.59), ('colissimo_domicile','FR_METRO',5,   14.59),
  ('colissimo_domicile','FR_METRO',6,   15.22), ('colissimo_domicile','FR_METRO',7,   16.21),
  ('colissimo_domicile','FR_METRO',8,   17.20), ('colissimo_domicile','FR_METRO',9,   18.22),
  ('colissimo_domicile','FR_METRO',10,  19.22), ('colissimo_domicile','FR_METRO',11,  19.84),
  ('colissimo_domicile','FR_METRO',12,  20.82), ('colissimo_domicile','FR_METRO',13,  21.79),
  ('colissimo_domicile','FR_METRO',14,  22.80), ('colissimo_domicile','FR_METRO',15,  23.78),
  ('colissimo_domicile','FR_METRO',16,  24.75), ('colissimo_domicile','FR_METRO',17,  25.73),
  ('colissimo_domicile','FR_METRO',18,  26.71), ('colissimo_domicile','FR_METRO',19,  27.70),
  ('colissimo_domicile','FR_METRO',20,  28.67), ('colissimo_domicile','FR_METRO',21,  29.38),
  ('colissimo_domicile','FR_METRO',22,  30.34), ('colissimo_domicile','FR_METRO',23,  31.33),
  ('colissimo_domicile','FR_METRO',24,  32.30), ('colissimo_domicile','FR_METRO',25,  33.24),
  ('colissimo_domicile','FR_METRO',26,  34.24), ('colissimo_domicile','FR_METRO',27,  35.18),
  ('colissimo_domicile','FR_METRO',28,  36.16), ('colissimo_domicile','FR_METRO',29,  37.17),
  ('colissimo_domicile','FR_METRO',30,  38.10)
ON CONFLICT (service_code, zone_code, max_kg) DO UPDATE SET prix_ht = EXCLUDED.prix_ht;

-- Variante sans signature (écart constant de −1,05 € HT, cf. référentiel).
INSERT INTO shipping_rates (service_code, zone_code, max_kg, prix_ht) VALUES
  ('colissimo_domicile_sans_signature','FR_METRO',0.25, 6.84),
  ('colissimo_domicile_sans_signature','FR_METRO',0.5,  7.71),
  ('colissimo_domicile_sans_signature','FR_METRO',0.75, 8.60),
  ('colissimo_domicile_sans_signature','FR_METRO',1,    9.34),
  ('colissimo_domicile_sans_signature','FR_METRO',2,   10.48),
  ('colissimo_domicile_sans_signature','FR_METRO',3,   11.49),
  ('colissimo_domicile_sans_signature','FR_METRO',4,   12.54),
  ('colissimo_domicile_sans_signature','FR_METRO',5,   13.54),
  ('colissimo_domicile_sans_signature','FR_METRO',6,   14.17),
  ('colissimo_domicile_sans_signature','FR_METRO',7,   15.16),
  ('colissimo_domicile_sans_signature','FR_METRO',8,   16.15),
  ('colissimo_domicile_sans_signature','FR_METRO',9,   17.17),
  ('colissimo_domicile_sans_signature','FR_METRO',10,  18.17),
  ('colissimo_domicile_sans_signature','FR_METRO',11,  18.79),
  ('colissimo_domicile_sans_signature','FR_METRO',12,  19.77),
  ('colissimo_domicile_sans_signature','FR_METRO',13,  20.74),
  ('colissimo_domicile_sans_signature','FR_METRO',14,  21.75),
  ('colissimo_domicile_sans_signature','FR_METRO',15,  22.73),
  ('colissimo_domicile_sans_signature','FR_METRO',16,  23.70),
  ('colissimo_domicile_sans_signature','FR_METRO',17,  24.68),
  ('colissimo_domicile_sans_signature','FR_METRO',18,  25.66),
  ('colissimo_domicile_sans_signature','FR_METRO',19,  26.65),
  ('colissimo_domicile_sans_signature','FR_METRO',20,  27.62),
  ('colissimo_domicile_sans_signature','FR_METRO',21,  28.33),
  ('colissimo_domicile_sans_signature','FR_METRO',22,  29.29),
  ('colissimo_domicile_sans_signature','FR_METRO',23,  30.28),
  ('colissimo_domicile_sans_signature','FR_METRO',24,  31.25),
  ('colissimo_domicile_sans_signature','FR_METRO',25,  32.19),
  ('colissimo_domicile_sans_signature','FR_METRO',26,  33.19),
  ('colissimo_domicile_sans_signature','FR_METRO',27,  34.13),
  ('colissimo_domicile_sans_signature','FR_METRO',28,  35.11),
  ('colissimo_domicile_sans_signature','FR_METRO',29,  36.12),
  ('colissimo_domicile_sans_signature','FR_METRO',30,  37.05)
ON CONFLICT (service_code, zone_code, max_kg) DO UPDATE SET prix_ht = EXCLUDED.prix_ht;

/*
  --- Colissimo Point de Retrait, grille ENTREPRISE --------------------------
  Source : « general-rates-colissimo-pickup-point-france ». `base_prix: "HT"`.
  ⚠ Le référentiel signale que la grille PUBLIQUE s'arrête à 5 kg ; la grille ENTREPRISE va
  jusqu'à 30 kg mais n'expose que six points de contrôle. Une tranche manquante n'est pas un
  problème de justesse : le calcul prend la PREMIÈRE tranche dont la borne haute couvre le
  poids, donc au pire un prix légèrement supérieur au réel — jamais inférieur. On ne vend
  pas à perte.
*/
INSERT INTO shipping_rates (service_code, zone_code, max_kg, prix_ht) VALUES
  ('colissimo_point_retrait','FR_METRO',0.25,  5.20),
  ('colissimo_point_retrait','FR_METRO',1,     7.71),
  ('colissimo_point_retrait','FR_METRO',5,    11.90),
  ('colissimo_point_retrait','FR_METRO',10,   16.52),
  ('colissimo_point_retrait','FR_METRO',20,   25.97),
  ('colissimo_point_retrait','FR_METRO',30,   35.42)
ON CONFLICT (service_code, zone_code, max_kg) DO UPDATE SET prix_ht = EXCLUDED.prix_ht;

/*
  --- Colissimo Outre-Mer ----------------------------------------------------
  ★ LA GRILLE QUI MANQUAIT, celle dont l'absence coûtait jusqu'à 135 € par colis.
  Source : laposte.fr/tarif-colissimo (outre-mer). Ces grilles sont publiées en TTC
  (`base_prix: "TTC"`) : la division par 1,2 est écrite en clair pour que la valeur publiée
  reste vérifiable ligne à ligne.
  ⚠ La grille ENTREPRISE outre-mer du référentiel n'a que trois points de contrôle
  (`completude: "partielle"`) : on retient donc la grille publique, complète.
*/
INSERT INTO shipping_rates (service_code, zone_code, max_kg, prix_ht) VALUES
  -- OM1 prioritaire, 6 à 18 jours
  ('colissimo_om_prioritaire','OM1', 0.5, round( 12.02 / 1.2, 2)),
  ('colissimo_om_prioritaire','OM1', 1,   round( 19.00 / 1.2, 2)),
  ('colissimo_om_prioritaire','OM1', 2,   round( 25.89 / 1.2, 2)),
  ('colissimo_om_prioritaire','OM1', 5,   round( 38.90 / 1.2, 2)),
  ('colissimo_om_prioritaire','OM1', 10,  round( 62.32 / 1.2, 2)),
  ('colissimo_om_prioritaire','OM1', 15,  round(130.20 / 1.2, 2)),
  ('colissimo_om_prioritaire','OM1', 30,  round(143.02 / 1.2, 2)),
  -- OM2 prioritaire (Pacifique) : nettement plus cher, d'où la zone distincte
  ('colissimo_om_prioritaire','OM2', 0.5, round( 12.21 / 1.2, 2)),
  ('colissimo_om_prioritaire','OM2', 1,   round( 18.95 / 1.2, 2)),
  ('colissimo_om_prioritaire','OM2', 2,   round( 33.49 / 1.2, 2)),
  ('colissimo_om_prioritaire','OM2', 5,   round( 55.96 / 1.2, 2)),
  ('colissimo_om_prioritaire','OM2', 10,  round(109.58 / 1.2, 2)),
  ('colissimo_om_prioritaire','OM2', 15,  round(249.99 / 1.2, 2)),
  ('colissimo_om_prioritaire','OM2', 30,  round(287.23 / 1.2, 2)),
  -- OM1 économique (voie maritime, 13 à 31 jours ouvrés)
  ('colissimo_om_economique','OM1', 0.5, round(  8.41 / 1.2, 2)),
  ('colissimo_om_economique','OM1', 1,   round( 11.73 / 1.2, 2)),
  ('colissimo_om_economique','OM1', 2,   round( 14.77 / 1.2, 2)),
  ('colissimo_om_economique','OM1', 5,   round( 24.80 / 1.2, 2)),
  ('colissimo_om_economique','OM1', 10,  round( 39.24 / 1.2, 2)),
  ('colissimo_om_economique','OM1', 15,  round( 79.42 / 1.2, 2)),
  ('colissimo_om_economique','OM1', 30,  round( 91.53 / 1.2, 2))
ON CONFLICT (service_code, zone_code, max_kg) DO UPDATE SET prix_ht = EXCLUDED.prix_ht;

/*
  ⚠ L'offre ÉCONOMIQUE n'existe que pour OM1 dans le référentiel. Un envoi vers OM2 ne se
  verra donc proposer que le prioritaire : c'est voulu — inventer une grille économique
  Pacifique reviendrait à vendre une prestation dont on ignore le coût.
*/

/*
  --- Colissimo Domicile International, grille ENTREPRISE --------------------
  Source : page officielle Colissimo Entreprise. `base_prix: "HT"`, avec signature.
  Six pays documentés. LU et AT sont volontairement absents : le référentiel les donne comme
  « INFERENCE a valider », donc ce ne sont pas des tarifs.
*/
INSERT INTO shipping_rates (service_code, zone_code, max_kg, prix_ht) VALUES
  ('colissimo_international','COL_DE',0.25, 9.18), ('colissimo_international','COL_DE',0.5,  9.28),
  ('colissimo_international','COL_DE',1,   11.33), ('colissimo_international','COL_DE',2,   12.13),
  ('colissimo_international','COL_DE',5,   14.61), ('colissimo_international','COL_DE',10,  18.61),
  ('colissimo_international','COL_DE',20,  28.10), ('colissimo_international','COL_DE',30,  37.44),

  ('colissimo_international','COL_BE',0.25, 9.00), ('colissimo_international','COL_BE',0.5,  9.10),
  ('colissimo_international','COL_BE',1,   11.11), ('colissimo_international','COL_BE',2,   11.89),
  ('colissimo_international','COL_BE',5,   14.36), ('colissimo_international','COL_BE',10,  18.36),
  ('colissimo_international','COL_BE',20,  27.54), ('colissimo_international','COL_BE',30,  36.70),

  ('colissimo_international','COL_NL',0.25, 9.23), ('colissimo_international','COL_NL',0.5,  9.33),
  ('colissimo_international','COL_NL',1,   11.39), ('colissimo_international','COL_NL',2,   12.19),
  ('colissimo_international','COL_NL',5,   14.67), ('colissimo_international','COL_NL',10,  18.67),
  ('colissimo_international','COL_NL',20,  28.24), ('colissimo_international','COL_NL',30,  37.63),

  ('colissimo_international','COL_IT',0.25,10.40), ('colissimo_international','COL_IT',0.5, 10.50),
  ('colissimo_international','COL_IT',1,   13.36), ('colissimo_international','COL_IT',2,   14.94),
  ('colissimo_international','COL_IT',5,   17.52), ('colissimo_international','COL_IT',10,  21.52),
  ('colissimo_international','COL_IT',20,  31.55), ('colissimo_international','COL_IT',30,  40.85),

  ('colissimo_international','COL_ES',0.25,10.35), ('colissimo_international','COL_ES',0.5, 10.45),
  ('colissimo_international','COL_ES',1,   13.29), ('colissimo_international','COL_ES',2,   14.87),
  ('colissimo_international','COL_ES',5,   17.44), ('colissimo_international','COL_ES',10,  21.44),
  ('colissimo_international','COL_ES',20,  31.39), ('colissimo_international','COL_ES',30,  40.65),

  ('colissimo_international','COL_PT',0.25,10.62), ('colissimo_international','COL_PT',0.5, 10.72),
  ('colissimo_international','COL_PT',1,   13.63), ('colissimo_international','COL_PT',2,   15.24),
  ('colissimo_international','COL_PT',5,   17.84), ('colissimo_international','COL_PT',10,  21.84),
  ('colissimo_international','COL_PT',20,  32.18), ('colissimo_international','COL_PT',30,  41.67)
ON CONFLICT (service_code, zone_code, max_kg) DO UPDATE SET prix_ht = EXCLUDED.prix_ht;

/*
  --- Chronopost, offre PROFESSIONNELLE --------------------------------------
  Source : chronopost.fr, tarifs professionnels. `base_prix: "HT"`. Les remises de volume
  ne sont PAS répercutées ici : elles dépendent du volume mensuel réalisé, qu'un panier ne
  connaît pas. Les appliquer d'avance reviendrait à vendre une remise non acquise.
*/
INSERT INTO shipping_rates (service_code, zone_code, max_kg, prix_ht) VALUES
  ('chronopost_chrono13','FR_METRO',1,  19.50), ('chronopost_chrono13','FR_METRO',3,  21.00),
  ('chronopost_chrono13','FR_METRO',10, 24.00), ('chronopost_chrono13','FR_METRO',20, 34.00),
  ('chronopost_chrono13','FR_METRO',30, 45.00),
  ('chronopost_chrono18','FR_METRO',1,  16.00), ('chronopost_chrono18','FR_METRO',3,  18.00),
  ('chronopost_chrono18','FR_METRO',10, 20.50), ('chronopost_chrono18','FR_METRO',20, 31.00),
  ('chronopost_chrono18','FR_METRO',30, 42.00)
ON CONFLICT (service_code, zone_code, max_kg) DO UPDATE SET prix_ht = EXCLUDED.prix_ht;

/*
  --- Mondial Relay — Point Relais / Locker ----------------------------------
  Source : mondialrelay.fr, grille au 15/06/2026. `base_prix: "TTC"` → conversion visible.
  Le référentiel note un écart mineur entre sources sur la première tranche (4,10 ou
  4,15 €) : on retient 4,15 €, la valeur la plus haute — encore une fois, on ne vend jamais
  en dessous du coût.
*/
INSERT INTO shipping_rates (service_code, zone_code, max_kg, prix_ht) VALUES
  ('mondial_relay_point_relais','FR_METRO',0.25, round( 4.15 / 1.2, 2)),
  ('mondial_relay_point_relais','FR_METRO',0.5,  round( 4.15 / 1.2, 2)),
  ('mondial_relay_point_relais','FR_METRO',1,    round( 5.99 / 1.2, 2)),
  ('mondial_relay_point_relais','FR_METRO',2,    round( 7.99 / 1.2, 2)),
  ('mondial_relay_point_relais','FR_METRO',3,    round( 7.99 / 1.2, 2)),
  ('mondial_relay_point_relais','FR_METRO',4,    round( 9.99 / 1.2, 2)),
  ('mondial_relay_point_relais','FR_METRO',5,    round(15.99 / 1.2, 2)),
  ('mondial_relay_point_relais','FR_METRO',7,    round(15.99 / 1.2, 2)),
  ('mondial_relay_point_relais','FR_METRO',10,   round(15.99 / 1.2, 2)),
  ('mondial_relay_point_relais','FR_METRO',15,   round(25.99 / 1.2, 2)),
  ('mondial_relay_point_relais','FR_METRO',25,   round(25.99 / 1.2, 2)),
  -- Europe, par groupe de pays
  ('mondial_relay_point_relais_eu','MR_BENELUX',0.5, round( 4.60 / 1.2, 2)),
  ('mondial_relay_point_relais_eu','MR_BENELUX',1,   round( 6.60 / 1.2, 2)),
  ('mondial_relay_point_relais_eu','MR_BENELUX',10,  round(17.40 / 1.2, 2)),
  ('mondial_relay_point_relais_eu','MR_BENELUX',25,  round(26.00 / 1.2, 2)),
  ('mondial_relay_point_relais_eu','MR_SUD',0.5,     round( 6.60 / 1.2, 2)),
  ('mondial_relay_point_relais_eu','MR_SUD',1,       round( 9.50 / 1.2, 2)),
  ('mondial_relay_point_relais_eu','MR_SUD',10,      round(19.40 / 1.2, 2)),
  ('mondial_relay_point_relais_eu','MR_SUD',25,      round(28.80 / 1.2, 2)),
  ('mondial_relay_point_relais_eu','MR_PL',0.5,      round( 7.20 / 1.2, 2)),
  ('mondial_relay_point_relais_eu','MR_PL',1,        round(10.40 / 1.2, 2)),
  ('mondial_relay_point_relais_eu','MR_PL',10,       round(19.80 / 1.2, 2)),
  ('mondial_relay_point_relais_eu','MR_PL',25,       round(29.50 / 1.2, 2))
ON CONFLICT (service_code, zone_code, max_kg) DO UPDATE SET prix_ht = EXCLUDED.prix_ht;

/*
  --- Relais Colis -----------------------------------------------------------
  Source : comparateurs spécialisés, grille 2026. `base_prix: "TTC"`.
  Confiance « secondaire_croise » (deux sources concordantes, pas une page éditeur) :
  à confirmer par contrat avant d'en faire l'offre par défaut.
*/
INSERT INTO shipping_rates (service_code, zone_code, max_kg, prix_ht) VALUES
  ('relais_colis','FR_METRO',0.5, round( 4.20 / 1.2, 2)),
  ('relais_colis','FR_METRO',1,   round( 4.50 / 1.2, 2)),
  ('relais_colis','FR_METRO',2,   round( 6.25 / 1.2, 2)),
  ('relais_colis','FR_METRO',3,   round( 6.50 / 1.2, 2)),
  ('relais_colis','FR_METRO',4,   round( 6.85 / 1.2, 2)),
  ('relais_colis','FR_METRO',5,   round( 9.20 / 1.2, 2)),
  ('relais_colis','FR_METRO',7,   round(11.50 / 1.2, 2)),
  ('relais_colis','FR_METRO',10,  round(13.20 / 1.2, 2)),
  ('relais_colis','FR_METRO',15,  round(16.80 / 1.2, 2)),
  ('relais_colis','FR_METRO',20,  round(19.70 / 1.2, 2))
ON CONFLICT (service_code, zone_code, max_kg) DO UPDATE SET prix_ht = EXCLUDED.prix_ht;

/*
  --- Messagerie palettisée --------------------------------------------------
  ⚠ CE SONT DES FOURCHETTES, pas une grille : « Aucun transporteur de messagerie palettisee
  ne publie de grille. Prix contractuels negocies au volume annuel. » Le contrat §3 impose
  de prendre la borne MÉDIANE et de le documenter : c'est pourquoi chaque prix est écrit
  `(borne_basse + borne_haute) / 2.0`, avec les deux bornes visibles.

  ⚠ Conséquence à assumer : ces prix sont des ORDRES DE GRANDEUR. Dès qu'un contrat de
  messagerie est signé, remplacer ces lignes par la grille réelle — c'est une mise à jour de
  DONNÉES, pas de code. Le référentiel donne un point de contrôle réel : Lille → Toulouse,
  1 palette 80×120 de 400 kg = 208 € HT, ce qui tombe entre nos médianes 300 kg (205 €) et
  500 kg (247,50 €). L'ordre de grandeur tient.
*/
INSERT INTO shipping_rates (service_code, zone_code, max_kg, prix_ht) VALUES
  -- Régional depuis Montblanc, < 200 km — fourchettes 55-95, 70-120, 85-140, 100-165
  ('messagerie_palette','PAL_FR_REG',100, ( 55 +  95) / 2.0),
  ('messagerie_palette','PAL_FR_REG',200, ( 70 + 120) / 2.0),
  ('messagerie_palette','PAL_FR_REG',300, ( 85 + 140) / 2.0),
  ('messagerie_palette','PAL_FR_REG',500, (100 + 165) / 2.0),
  -- National 200 à 900 km — fourchettes 95-175, 115-230, 135-275, 165-330
  ('messagerie_palette','PAL_FR_NAT',100, ( 95 + 175) / 2.0),
  ('messagerie_palette','PAL_FR_NAT',200, (115 + 230) / 2.0),
  ('messagerie_palette','PAL_FR_NAT',300, (135 + 275) / 2.0),
  ('messagerie_palette','PAL_FR_NAT',500, (165 + 330) / 2.0),
  -- Europe de l'Ouest, une palette de 300 kg maximum, par pays
  ('messagerie_palette_eu','PAL_ES',300, (130 + 260) / 2.0),
  ('messagerie_palette_eu','PAL_IT',300, (160 + 300) / 2.0),
  ('messagerie_palette_eu','PAL_BE',300, (170 + 320) / 2.0),
  ('messagerie_palette_eu','PAL_DE',300, (180 + 340) / 2.0),
  ('messagerie_palette_eu','PAL_NL',300, (190 + 350) / 2.0),
  ('messagerie_palette_eu','PAL_LU',300, (175 + 325) / 2.0),
  ('messagerie_palette_eu','PAL_PT',300, (220 + 400) / 2.0)
ON CONFLICT (service_code, zone_code, max_kg) DO UPDATE SET prix_ht = EXCLUDED.prix_ht;

-- ===========================================================================
-- 6. Suppléments
-- ===========================================================================
/*
  Un seul est appliqué AUTOMATIQUEMENT par `calc_livraison` : la Corse. Les autres dépendent
  d'informations que le panier n'a pas (y a-t-il un quai ? un étage ? le destinataire est-il
  un particulier ?) : ils sont enregistrés pour que l'exploitant les facture en connaissance
  de cause, et pour qu'ils cessent d'être des chiffres de tête.
  Les fourchettes sont ramenées à leur médiane, comme les grilles palette.
*/
INSERT INTO shipping_surcharges (code, service_code, libelle, montant_ht, pourcentage, condition) VALUES
  ('corse_iles',   NULL, 'Corse et îles du littoral',                       20.14, NULL,
   'AUTOMATIQUE pour le seul mode PALETTE : code postal 20xxx. Référence DPD France '
   '(20,14 € HT), qui paie la traversée facturée par l''affréteur. La Poste ne surtaxe PAS '
   'la Corse sur Colissimo : les modes colis restent au tarif métropole.'),
  ('iles_europeennes', NULL, 'Îles européennes (Baléares, Canaries, Sardaigne, Sicile…)', 26.60, NULL,
   'Référence DPD. À appliquer manuellement : la grille Colissimo International est « hors îles ».'),
  ('hors_gabarit_colissimo', NULL, 'Colissimo volumineux (L+l+h entre 150 et 200 cm)', 6.00, NULL,
   'Refus au-delà de 200 cm de somme. Source La Poste.'),
  ('hayon',        NULL, 'Hayon élévateur (livraison sans quai)',            22.50, NULL,
   'Médiane de 15-30 € HT. Obligatoire si destinataire particulier ou site sans quai.'),
  ('rdv',          NULL, 'Prise de rendez-vous de livraison',                15.00, NULL,
   'Valeur médiane donnée par le référentiel.'),
  ('livraison_particulier', NULL, 'Livraison palette à un particulier',      17.50, NULL,
   'Médiane de 10-25 € HT. Se cumule presque toujours avec hayon + RDV : budgéter 40 à 70 € HT.'),
  ('etage',        NULL, 'Livraison à l''étage (par étage)',                 25.00, NULL,
   'Médiane de 20-30 € HT.'),
  ('zone_difficile', NULL, 'Zone difficile d''accès / montagne / centre-ville', 7.25, NULL,
   'Référence DPD montagne (7,25 € HT). Jusqu''à 25 € HT en palette.'),
  ('adr',          NULL, 'Marchandises dangereuses (ADR)',                   42.50, NULL,
   'Médiane de 25-60 € HT. ⚠ À vérifier produit par produit : les liquides fumigènes '
   'glycol/eau et les liquides à mousse ne sont généralement PAS classés ADR, mais la FDS fait foi.'),
  ('surcharge_carburant', NULL, 'Surcharge carburant / énergie',             NULL, 17.11,
   'Référence officielle d''août 2026 (17,11 %). Indexée mensuellement : à relire chaque '
   'mois. Fourchette de marché 7,5 à 18 % en France, 15 à 30 % en transfrontalier.'),
  ('express_j1_palette', 'messagerie_palette', 'Majoration express J+1 (palette)', NULL, 40.00,
   'Médiane de la majoration de 30 à 50 % sur le tarif de base.'),
  ('samedi',       NULL, 'Livraison le samedi',                              NULL, 50.00,
   'Majoration de 50 % du tarif de base.')
ON CONFLICT (code) DO UPDATE SET
  service_code = EXCLUDED.service_code,
  libelle = EXCLUDED.libelle, montant_ht = EXCLUDED.montant_ht,
  pourcentage = EXCLUDED.pourcentage, condition = EXCLUDED.condition;

-- ===========================================================================
-- 7. Poids volumétrique
-- ===========================================================================
/*
  « On facture le plus eleve du poids reel et du poids volumetrique », formule
  (L × l × h) / diviseur, diviseur 5000 pour Colissimo, Chronopost, DPD, DHL et GLS.
  Mondial Relay et Relais Colis n'appliquent PAS de poids volumétrique mais des limites
  dimensionnelles strictes : leur diviseur est `null` dans le référentiel.

  ⚠ `calc_livraison` reçoit un POIDS DÉJÀ FACTURABLE. C'est l'appelant (le module de
  livraison du site, ou la fonction Edge du devis) qui compose
  `greatest(poids_réel, poids_volumetrique(...))` à partir des dimensions des produits.
  Séparer les deux évite d'avoir à passer les dimensions de chaque article dans la
  signature — et la formule est la même pour tous les transporteurs qui l'appliquent.
*/
CREATE OR REPLACE FUNCTION public.poids_volumetrique(
  p_longueur_cm numeric,
  p_largeur_cm  numeric,
  p_hauteur_cm  numeric,
  p_diviseur    numeric DEFAULT 5000
)
RETURNS numeric
LANGUAGE sql IMMUTABLE
AS $function$
  SELECT CASE
           WHEN coalesce(p_longueur_cm, 0) <= 0 OR coalesce(p_largeur_cm, 0) <= 0
             OR coalesce(p_hauteur_cm, 0) <= 0 OR coalesce(p_diviseur, 0) <= 0
           THEN 0::numeric
           ELSE round((p_longueur_cm * p_largeur_cm * p_hauteur_cm) / p_diviseur, 3)
         END;
$function$;

COMMENT ON FUNCTION public.poids_volumetrique(numeric, numeric, numeric, numeric) IS
  'Poids volumétrique = (L × l × h) / diviseur (5000 chez Colissimo, Chronopost, DPD, GLS). '
  'Le poids FACTURABLE est le plus élevé du réel et de celui-ci.';

GRANT EXECUTE ON FUNCTION public.poids_volumetrique(numeric, numeric, numeric, numeric)
  TO anon, authenticated, service_role;

-- ===========================================================================
-- 8. Les offres proposables pour une destination
-- ===========================================================================
/*
  C'est ici que vivent les règles du contrat §3. La fonction rend TOUJOURS au moins une
  ligne : soit des offres, soit une ligne unique `sur_devis = true` portant un MOTIF —
  parce qu'un panier qui n'affiche rien du tout est un panier abandonné.

  Motifs possibles :
   · `destination_inconnue`      — le pays saisi ne se résout pas en code ISO ;
   · `code_postal_invalide`      — ⚠ DISTINCT du précédent : c'est une faute de saisie, pas
                                   une destination hors zone. Le message doit inviter à
                                   corriger, pas à demander un devis (contrat §3) ;
   · `poids_hors_bareme`         — au-delà de 500 kg par palette on sort de la messagerie et
                                   on entre dans l'affrètement, qui se chiffre au cas par cas ;
   · `destination_non_desservie` — aucun transporteur ne couvre cette destination pour ce
                                   poids : c'est un vrai devis à faire.
*/
CREATE OR REPLACE FUNCTION public.services_livraison_dispo(
  p_pays        text,
  p_code_postal text,
  p_poids_kg    numeric,
  p_palettes    integer DEFAULT 0
)
RETURNS TABLE(
  service   text,
  carrier   text,
  mode      text,
  prix_ht   numeric,
  prix_ttc  numeric,
  delai_min integer,
  delai_max integer,
  sur_devis boolean,
  motif     text
)
LANGUAGE plpgsql STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_pays     text;
  v_cp       text;
  v_poids    numeric;
  v_nb_pal   integer;
  v_palette  boolean;
  v_zones    text[];
  v_supp     numeric := 0;   -- supplément Corse DISPONIBLE (destination), pas encore dû
  v_supp_l   numeric;        -- supplément RÉELLEMENT dû par l'offre en cours d'examen
  v_note     text;
  v_taux     numeric := 20;
  v_expedie  boolean := false;   -- au moins une offre qui EXPÉDIE (hors retrait au dépôt)
  v_indice   numeric;
  v_zone     text;
  v_prix     numeric;
  v_poids_u  numeric;   -- poids RETENU pour lire la grille (par palette en mode palette)
  s          record;
BEGIN
  /*
    Le pays arrive du formulaire d'adresse tantôt en toutes lettres (« Allemagne »,
    « Suisse »), tantôt en code ISO. `code_pays()` est la même résolution que celle du moteur
    de TVA, pour qu'il n'y ait jamais deux vérités sur la destination.

    ⚠ On ne l'appelle QUE sur un libellé, exactement comme `regime_tva`. `code_pays()` ne
    reconnaît un code de deux lettres que s'il figure dans `eu_vat_rates` ou dans
    `country_aliases` : lui passer « US » ou « AU » rendrait NULL, et le client américain
    verrait « destination inconnue » — c'est-à-dire un message de faute de saisie — au lieu
    de « destination non desservie », qui appelle un devis. Le contrat §3 exige justement
    que ces deux cas ne soient pas confondus.
  */
  v_pays := upper(btrim(coalesce(p_pays, '')));
  IF v_pays = '' THEN v_pays := 'FR'; END IF;
  IF length(v_pays) <> 2 THEN
    v_pays := code_pays(v_pays);
  END IF;
  IF v_pays IS NOT NULL AND v_pays !~ '^[A-Z]{2}$' THEN
    v_pays := NULL;   -- deux caractères, mais pas un code ISO : saisie inexploitable
  END IF;

  v_cp     := regexp_replace(coalesce(p_code_postal, ''), '\s', '', 'g');
  v_poids  := greatest(coalesce(p_poids_kg, 0), 0);
  v_nb_pal := greatest(coalesce(p_palettes, 0), 0);

  IF v_pays IS NULL THEN
    RETURN QUERY SELECT NULL::text, NULL::text, NULL::text, NULL::numeric, NULL::numeric,
                        NULL::integer, NULL::integer, true, 'destination_inconnue'::text;
    RETURN;
  END IF;

  -- ★ BASCULE PALETTE. « A partir de 25-30 kg par unite, la messagerie palette devient
  --   obligatoire (limite colis atteinte). » Au-delà de 30 kg, aucun réseau colis n'accepte
  --   l'envoi : proposer un tarif Colissimo serait vendre une prestation impossible.
  v_palette := (v_nb_pal > 0) OR (v_poids > 30);

  -- ---- France, Monaco et outre-mer : la zone est décidée explicitement -----
  IF v_pays IN ('FR', 'MC') THEN
    IF v_cp !~ '^[0-9]{5}$' THEN
      RETURN QUERY SELECT NULL::text, NULL::text, NULL::text, NULL::numeric, NULL::numeric,
                          NULL::integer, NULL::integer, true, 'code_postal_invalide'::text;
      RETURN;
    END IF;

    IF v_cp ~ '^97[0-9]{3}$' THEN
      -- ★ OUTRE-MER ZONE 1. Le tarif métropole ne doit JAMAIS s'appliquer ici : c'est la
      --   perte constatée jusqu'à −135 € par colis.
      v_zones := ARRAY['OM1'];
      v_note  := 'outre_mer_om1';
    ELSIF v_cp ~ '^98[4-8][0-9]{2}$' THEN
      v_zones := ARRAY['OM2'];
      v_note  := 'outre_mer_om2';
    ELSIF v_cp ~ '^980[0-9]{2}$' OR v_pays = 'MC' THEN
      -- ★ MONACO. Fiscalement ET logistiquement la France : tarif métropole.
      v_zones := ARRAY['PAL_FR_NAT', 'FR_METRO'];
      v_note  := 'monaco_tarif_metropole';
    ELSIF v_cp !~ '^(0[1-9]|1[0-9]|2[0-9]|[3-8][0-9]|9[0-5])[0-9]{3}$' THEN
      -- Cinq chiffres, mais aucun département français ne commence ainsi (96xxx, 99xxx…).
      RETURN QUERY SELECT NULL::text, NULL::text, NULL::text, NULL::numeric, NULL::numeric,
                          NULL::integer, NULL::integer, true, 'code_postal_invalide'::text;
      RETURN;
    ELSE
      IF v_cp ~ '^(11|13|30|31|34|66|84)[0-9]{3}$' THEN
        v_zones := ARRAY['PAL_FR_REG', 'PAL_FR_NAT', 'FR_METRO'];
      ELSE
        v_zones := ARRAY['PAL_FR_NAT', 'FR_METRO'];
      END IF;

      -- ★ CORSE. On MÉMORISE ici le montant du supplément, on ne le DOIT pas encore : c'est
      --   l'offre retenue qui décide s'il est dû (voir la boucle plus bas). La destination
      --   seule ne peut pas le savoir — deux transporteurs ne facturent pas la même chose
      --   pour le même code postal.
      IF v_cp ~ '^20[0-9]{3}$' THEN
        SELECT coalesce(sc.montant_ht, 0) INTO v_supp
          FROM shipping_surcharges sc WHERE sc.code = 'corse_iles';
        v_supp := coalesce(v_supp, 0);
        v_note := 'supplement_corse';
      END IF;
    END IF;

    -- Le retrait au dépôt reste toujours proposable.
    v_zones := v_zones || ARRAY['TOUS'];
  END IF;

  -- Le taux appliqué au port est celui du RÉGIME de la destination : le transport suit le
  -- sort fiscal du bien transporté. On interroge la source unique plutôt que d'écrire 20 %.
  SELECT r.taux INTO v_taux FROM regime_tva(v_pays, false, false, v_cp) r LIMIT 1;
  v_taux := coalesce(v_taux, 20);

  -- Dégressivité multi-palettes, telle que documentée par le référentiel
  -- (1 palette : 1,00 · 5 : 0,75 · 10 : 0,66 · 15 : 0,60). On prend le palier ATTEINT, donc
  -- l'indice le plus prudent — jamais une remise qu'on n'a pas.
  v_indice := CASE
                WHEN v_nb_pal >= 15 THEN 0.60
                WHEN v_nb_pal >= 10 THEN 0.66
                WHEN v_nb_pal >= 5  THEN 0.75
                ELSE 1.00
              END;

  FOR s IN
    SELECT sv.code, sv.carrier_code, sv.mode, sv.delai_min_j, sv.delai_max_j,
           sv.poids_max_kg, sv.ordre
      FROM shipping_services sv
      JOIN shipping_carriers c ON c.code = sv.carrier_code
     WHERE sv.actif AND c.actif
       AND ( (v_palette     AND sv.mode IN ('palette', 'retrait'))
          OR (NOT v_palette AND sv.mode <> 'palette') )
     ORDER BY sv.ordre, sv.code
  LOOP
    /*
      ★ En messagerie palettisée, la grille se lit PAR PALETTE : 3 palettes de 200 kg, ce
      sont trois envois de 200 kg, pas un envoi de 600 kg. Lire la grille sur le poids total
      ferait sortir de la grille (borne haute : 500 kg) et basculerait en « sur devis » des
      envois parfaitement tarifables — puis, une fois le prix trouvé, on le multiplierait
      encore par le nombre de palettes, donc on facturerait deux fois le volume.
      Pour tous les autres modes, l'envoi est un colis : le poids retenu est le poids total.
    */
    v_poids_u := CASE
                   WHEN s.mode = 'palette' AND v_nb_pal > 1 THEN round(v_poids / v_nb_pal, 3)
                   ELSE v_poids
                 END;

    -- Poids maximal admis par l'offre (le retrait n'en a pas).
    IF s.mode <> 'retrait' AND s.poids_max_kg IS NOT NULL AND v_poids_u > s.poids_max_kg THEN
      CONTINUE;
    END IF;

    -- Zone tarifaire : la plus spécifique d'abord, et seulement parmi celles où l'offre a
    -- effectivement un barème.
    SELECT z.code INTO v_zone
      FROM shipping_zones z
     WHERE EXISTS (SELECT 1 FROM shipping_rates r
                    WHERE r.service_code = s.code AND r.zone_code = z.code)
       AND (
             (v_zones IS NOT NULL AND z.code = ANY (v_zones))
          OR (v_zones IS NULL
              AND (z.pays IS NULL OR v_pays = ANY (z.pays))
              AND (coalesce(z.motif_cp, '') = '' OR v_cp ~ z.motif_cp))
           )
     ORDER BY CASE WHEN v_zones IS NULL THEN 0 ELSE array_position(v_zones, z.code) END,
              (z.pays IS NULL),
              length(coalesce(z.motif_cp, '')) DESC
     LIMIT 1;

    IF v_zone IS NULL THEN CONTINUE; END IF;

    -- Première tranche dont la borne haute couvre le poids facturable.
    SELECT r.prix_ht INTO v_prix
      FROM shipping_rates r
     WHERE r.service_code = s.code
       AND r.zone_code = v_zone
       AND r.max_kg >= greatest(v_poids_u, 0.001)
     ORDER BY r.max_kg
     LIMIT 1;

    IF v_prix IS NULL THEN CONTINUE; END IF;

    IF s.mode = 'palette' AND v_nb_pal > 1 THEN
      v_prix := round(v_prix * v_nb_pal * v_indice, 2);
    END IF;

    /*
      ★ SUPPLÉMENT CORSE — PORTÉ PAR L'OFFRE, PAS PAR LA DESTINATION.
      `corse_iles` (20,14 € HT) est une ligne du barème DPD : elle paie la traversée facturée
      par un affréteur. Seul le mode `palette` la subit réellement.
      La Poste, elle, NE SURTAXE PAS la Corse sur Colissimo : le département 20 est tarifié
      exactement comme la métropole. L'appliquer à tous les modes facturait 20,14 € HT de
      traversée sur un colis que le transporteur livre au tarif métropole — soit, pour 5 kg
      vers Ajaccio, 38,45 € TTC au lieu de 14,28 € : +169 % sur un surcoût qui n'existe pas,
      donc une vente perdue.
      Le retrait au dépôt ne transporte rien : il ne le subit jamais non plus.
    */
    v_supp_l := CASE WHEN s.mode = 'palette' THEN coalesce(v_supp, 0) ELSE 0 END;

    IF s.mode <> 'retrait' THEN
      v_prix := round(v_prix + v_supp_l, 2);
      v_expedie := true;
    END IF;

    RETURN QUERY SELECT
      s.code, s.carrier_code, s.mode,
      round(v_prix, 2),
      round(v_prix * (1 + v_taux / 100.0), 2),
      s.delai_min_j, s.delai_max_j,
      false,
      -- Le motif doit décrire ce qui a RÉELLEMENT été facturé : annoncer « supplement_corse »
      -- sur une ligne qui n'en porte pas ferait croire à une surtaxe et rendrait le contrôle
      -- de cette correction impossible. Corse sans supplément = tarif métropole, et on le dit
      -- comme on le dit déjà pour Monaco.
      CASE WHEN s.mode = 'retrait'                          THEN 'retrait_depot'
           WHEN v_note = 'supplement_corse' AND v_supp_l = 0 THEN 'corse_tarif_metropole'
           ELSE v_note END;
  END LOOP;

  /*
    ⚠ Le retrait au dépôt est proposable partout — un client peut toujours venir chercher sa
    commande. Mais il ne LIVRE rien : tant qu'aucune offre d'EXPÉDITION n'a été trouvée, on
    ajoute une ligne « sur devis ». Sans elle, un client américain verrait « retrait à
    Montblanc » comme unique proposition et croirait le site cassé.
  */
  IF NOT v_expedie THEN
    RETURN QUERY SELECT NULL::text, NULL::text, NULL::text, NULL::numeric, NULL::numeric,
                        NULL::integer, NULL::integer, true,
                        (CASE WHEN v_palette
                                   AND v_poids / greatest(v_nb_pal, 1) > 500
                              -- Au-delà de 500 kg par palette on quitte la messagerie de
                              -- groupage pour l'affrètement, qui se chiffre au cas par cas.
                              THEN 'poids_hors_bareme'
                              ELSE 'destination_non_desservie' END)::text;
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.services_livraison_dispo(text, text, numeric, integer) IS
  'Liste les offres de livraison proposables. `p_poids_kg` doit être le poids FACTURABLE '
  '(cf. poids_volumetrique). Rend toujours au moins une ligne : à défaut d''offre, une ligne '
  'sur_devis avec un motif (destination_inconnue | code_postal_invalide | poids_hors_bareme '
  '| destination_non_desservie).';

-- ===========================================================================
-- 9. Le tarif d'UNE offre (ou la moins chère)
-- ===========================================================================
/*
  `p_service` NULL = « donne-moi la moins chère », ce dont le panier a besoin pour afficher
  un prix avant que le client ait choisi. `p_service` renseigné = le tarif de CETTE offre,
  celle que le client a retenue — c'est ce montant-là qui doit être refacturé, pas le moins
  cher du moment.
*/
CREATE OR REPLACE FUNCTION public.calc_livraison(
  p_pays        text,
  p_code_postal text,
  p_poids_kg    numeric,
  p_palettes    integer DEFAULT 0,
  p_service     text    DEFAULT NULL
)
RETURNS TABLE(
  service   text,
  carrier   text,
  mode      text,
  prix_ht   numeric,
  prix_ttc  numeric,
  delai_min integer,
  delai_max integer,
  sur_devis boolean,
  motif     text
)
LANGUAGE plpgsql STABLE
SET search_path TO 'public'
AS $function$
DECLARE v_trouve boolean := false; r record;
BEGIN
  FOR r IN
    SELECT * FROM services_livraison_dispo(p_pays, p_code_postal, p_poids_kg, p_palettes) d
     WHERE p_service IS NULL OR d.sur_devis OR d.service = p_service
     -- ⚠ Le retrait au dépôt est gratuit : sans ce tri, il serait TOUJOURS « la moins
     -- chère » et le panier n'afficherait jamais de frais de port. Ce n'est pas une offre de
     -- livraison, c'est son absence — il passe donc en dernier quand on ne l'a pas
     -- explicitement demandé, DERRIÈRE même la ligne « sur devis » : mieux vaut annoncer
     -- « nous vous établissons un devis » que « venez le chercher à Montblanc ».
     -- `coalesce` parce que les lignes « sur devis » n'ont pas de mode.
     ORDER BY coalesce(d.mode = 'retrait', false), d.sur_devis, d.prix_ht NULLS LAST
     LIMIT 1
  LOOP
    v_trouve := true;
    RETURN QUERY SELECT r.service, r.carrier, r.mode, r.prix_ht, r.prix_ttc,
                        r.delai_min, r.delai_max, r.sur_devis, r.motif;
  END LOOP;

  IF NOT v_trouve THEN
    -- L'offre demandée n'est pas proposable pour cette destination ou ce poids : on le dit
    -- au lieu de retomber silencieusement sur une autre, qui n'aurait pas le même prix.
    RETURN QUERY SELECT p_service, NULL::text, NULL::text, NULL::numeric, NULL::numeric,
                        NULL::integer, NULL::integer, true, 'service_indisponible'::text;
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.calc_livraison(text, text, numeric, integer, text) IS
  'Tarif d''une offre de livraison. p_service NULL = la moins chère. `p_poids_kg` est le '
  'poids FACTURABLE (max du réel et du volumétrique).';

-- ---------------------------------------------------------------------------
-- Droits. Les GRILLES sont lisibles publiquement (obligation d'information sur le prix) ;
-- les FONCTIONS de calcul sont ouvertes à `anon` également, sinon un visiteur non connecté
-- ne verrait aucun frais de port avant de créer un compte — et abandonnerait son panier.
-- Elles ne lisent que des tarifs déjà publics : aucune donnée personnelle n'y transite.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.services_livraison_dispo(text, text, numeric, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.services_livraison_dispo(text, text, numeric, integer)
  TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.calc_livraison(text, text, numeric, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calc_livraison(text, text, numeric, integer, text)
  TO anon, authenticated, service_role;

-- ===========================================================================
-- 10. Les colonnes de livraison sur la commande (contrat §2)
-- ===========================================================================
/*
  `shipping_method` existait déjà, sous forme de texte libre. Il ne permet ni de retrouver le
  transporteur, ni de rejouer le calcul, ni d'imprimer une étiquette. On garde la colonne
  (aucune donnée n'est détruite) et on ajoute ce qui manque : le code de l'offre, celui du
  transporteur, et le point relais choisi.
*/
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipping_carrier text,
  ADD COLUMN IF NOT EXISTS shipping_service text,
  ADD COLUMN IF NOT EXISTS shipping_relay   jsonb;

ALTER TABLE order_quotes
  ADD COLUMN IF NOT EXISTS shipping_carrier text,
  ADD COLUMN IF NOT EXISTS shipping_service text,
  ADD COLUMN IF NOT EXISTS shipping_relay   jsonb;

COMMENT ON COLUMN orders.shipping_service IS
  'Code de l''offre retenue (colissimo_domicile, chronopost_chrono13…). Doit exister dans '
  'shipping_services : c''est la clé qui permet de rejouer le tarif.';
COMMENT ON COLUMN orders.shipping_relay IS
  'Point relais retenu : {id, nom, adresse, code_postal, ville}. NULL hors mode relais.';

NOTIFY pgrst, 'reload schema';

-- ===========================================================================
-- VÉRIFICATIONS — à exécuter APRÈS application (aucune n'écrit)
-- ===========================================================================
/*
-- 1. ★ LES CODES IMPOSÉS SONT TOUS PRÉSENTS ET ACTIFS — 11 lignes attendues, aucune NULL.
SELECT c.code AS attendu, s.nom, s.mode, s.actif
  FROM (VALUES ('colissimo_domicile'),('colissimo_om_prioritaire'),('colissimo_om_economique'),
               ('colissimo_international'),('chronopost_chrono18'),('chronopost_chrono13'),
               ('mondial_relay_point_relais'),('mondial_relay_point_relais_eu'),
               ('colissimo_point_retrait'),('messagerie_palette'),('retrait_depot')) AS c(code)
  LEFT JOIN shipping_services s ON s.code = c.code
 ORDER BY 1;

-- 2. Volumétrie du barème (attendu : ~14 offres, ~24 zones, > 150 tranches, 12 suppléments).
SELECT (SELECT count(*) FROM shipping_carriers)  AS transporteurs,
       (SELECT count(*) FROM shipping_services)  AS offres,
       (SELECT count(*) FROM shipping_zones)     AS zones,
       (SELECT count(*) FROM shipping_rates)     AS tranches,
       (SELECT count(*) FROM shipping_surcharges) AS supplements;

-- 3. ★ OUTRE-MER : le tarif métropole ne doit JAMAIS sortir. 15 kg vers La Réunion (97400)
--    doit coûter ~108,50 € HT (130,20 TTC / 1,2), et non 23,78 € (grille métropole).
SELECT * FROM services_livraison_dispo('FR', '97400', 15, 0);
SELECT * FROM calc_livraison('FR', '97400', 15);

-- 4. Monaco (98000) = tarif métropole, et NON outre-mer. Doit rendre Colissimo métropole.
SELECT * FROM services_livraison_dispo('FR', '98000', 2, 0);

-- 5. ★ CORSE : le supplément est porté par l'OFFRE, pas par la destination.
--    · en COLIS, La Poste ne surtaxe pas la Corse → prix STRICTEMENT égal à la métropole,
--      motif 'corse_tarif_metropole' ;
--    · en PALETTE, l'affréteur facture la traversée → + 20,14 € HT, motif 'supplement_corse'.
SELECT * FROM calc_livraison('FR', '20000', 2);        -- = métropole (prix_ht ≈ 11,53)
SELECT * FROM calc_livraison('FR', '34500', 2);        -- métropole nue : prix_ht ≈ 11,53
SELECT * FROM calc_livraison('FR', '20000', 150, 1);   -- palette Corse = métropole + 20,14
SELECT * FROM calc_livraison('FR', '34500', 150, 1);   -- palette métropole nue

-- 6. Bascule palette au-delà de 30 kg : aucun mode 'domicile'/'express'/'relais' attendu.
SELECT DISTINCT mode FROM services_livraison_dispo('FR', '34500', 45, 0);

-- 7. Code postal invalide ≠ destination hors zone (deux motifs DISTINCTS attendus).
SELECT 'cp invalide' AS cas, motif FROM calc_livraison('FR', '99999', 2)
UNION ALL SELECT 'pays inconnu', motif FROM calc_livraison('Zzzz', '00000', 2)
UNION ALL SELECT 'non desservie', motif FROM calc_livraison('AU', '2000', 2);

-- 8. Poids volumétrique : un carton 60×40×40 pèse 19,2 kg volumétriques.
SELECT poids_volumetrique(60, 40, 40) AS doit_valoir_19_2;

-- 9. Le port suit le régime de TVA de la destination : 0 % vers l'outre-mer.
SELECT service, prix_ht, prix_ttc FROM services_livraison_dispo('FR', '97400', 1, 0)
 WHERE service <> 'retrait_depot';   -- prix_ttc doit ÉGALER prix_ht

-- 10. Les grilles sont lisibles par un visiteur non connecté (RLS).
SET LOCAL ROLE anon;
  SELECT count(*) FROM shipping_rates;    -- > 150 attendu
  SELECT * FROM calc_livraison('FR', '34500', 2);
RESET ROLE;

-- 11. Aucun code de service orphelin dans les commandes déjà passées (0 attendu).
SELECT o.id, o.shipping_service FROM orders o
 WHERE o.shipping_service IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM shipping_services s WHERE s.code = o.shipping_service);
*/
