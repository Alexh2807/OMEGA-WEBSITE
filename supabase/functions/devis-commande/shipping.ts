/**
 * Moteur de calcul des frais de livraison OMEGA (v3).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE V3 ?
 * L'audit a montré que la v2 vendait à perte toutes les destinations autres que
 * la métropole : la branche « colis » ignorait purement et simplement la zone,
 * si bien qu'un colis de 5 kg vers La Réunion (97400, pays « France ») partait
 * à 7,99 € alors que La Poste facture 38,90 € (et 130,20 € à 15 kg). La Corse
 * partait au tarif métropole nu, un code postal mal saisi affichait « hors
 * zone » (message faux, qui envoyait le client au formulaire de devis), et une
 * destination encore inconnue affichait par défaut le tarif France.
 *
 * La v3 :
 *  1. résout d'abord une ZONE (métropole / Corse-îles / OM1 / OM2 / Europe /
 *     monde / code postal invalide / adresse manquante) ;
 *  2. calcule un POIDS FACTURÉ (max du poids réel et du poids volumétrique) ;
 *  3. bascule automatiquement en PALETTE au-delà de 30 kg, hors gabarit, ou dès
 *     qu'un article est `shipping_class: 'large'` ;
 *  4. produit une LISTE d'offres (`listerOffresLivraison`) — un site marchand
 *     laisse le client arbitrer entre prix et délai, il n'impose pas un prix ;
 *  5. conserve `computeShipping()` à l'identique (signature + forme du retour)
 *     pour `CartPage.tsx` et l'Edge Function `devis-commande` : cette fonction
 *     renvoie simplement l'offre la moins chère du mode par défaut.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SOURCE DES TARIFS
 * TOUS les montants codés en dur proviennent du référentiel
 * `referentiel_transporteurs_omega_2026.json` (compilé le 2026-08-04) et
 * portent en commentaire leur transporteur, leur date d'effet et leur source.
 * Aucune valeur n'est inventée. Les grilles non publiques (messagerie palette,
 * DPD, GLS) sont données en fourchette par le référentiel : conformément au
 * CONTRAT §3, on retient la BORNE MÉDIANE, signalée à chaque fois.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HT / TTC — la règle
 * Certaines grilles sont publiées HT (tarifs entreprise), d'autres TTC (tarifs
 * publics). En interne tout est ramené en HT, parce que la TVA est neutre pour
 * OMEGA (elle la récupère sur la facture du transporteur) : le coût réel à
 * couvrir est le HT. `prix_ttc` est ensuite reconstitué au taux français de
 * 20 % — c'est une valeur d'AFFICHAGE de référence, pas une décision fiscale :
 * le régime de TVA réellement appliqué à la vente est arrêté côté serveur par
 * `regime_tva()` (0 % outre-mer au titre de l'art. 294 du CGI, autoliquidation
 * intracommunautaire, etc.) et figé sur la commande.
 * `ShippingQuote.cost` reste exprimé en TTC : c'est ce que `devis-commande`
 * attend (il fait `cost / 1.2` pour obtenir le HT), on ne change pas ce contrat.
 */

/* ═══════════════════════════════════════════════════════════════════════════
   1. TYPES
   ═══════════════════════════════════════════════════════════════════════════ */

/** Les cinq modes exposés au client (CONTRAT §3). */
export type ModeLivraison = 'domicile' | 'express' | 'relais' | 'palette' | 'retrait';

/** Transporteurs — valeurs autorisées de `orders.shipping_carrier` (CONTRAT §2). */
export type Transporteur =
  | 'colissimo'
  | 'chronopost'
  | 'mondial_relay'
  | 'messagerie'
  | 'retrait';

/** Une offre proposable au client pour un panier + une destination donnés. */
export interface OffreLivraison {
  /** Identifiant stable de l'offre — recopié dans `orders.shipping_service`. */
  service: string;
  /** Recopié dans `orders.shipping_carrier`. */
  carrier: Transporteur;
  mode: ModeLivraison;
  /** Libellé lisible par le client (français). */
  libelle: string;
  prix_ht: number;
  prix_ttc: number;
  delai_min_j: number;
  delai_max_j: number;
  /** true = pas de tarif automatique : il faut passer par un devis. */
  sur_devis: boolean;
  /** Raison lisible d'un `sur_devis`, ou précision commerciale (franco…). */
  motif?: string;
  /** true = le client doit encore choisir un point relais avant de payer. */
  relais_requis: boolean;
}

export type ZoneLivraison =
  | 'FR_METRO'
  | 'FR_CORSE'
  | 'OM1'
  | 'OM2'
  | 'EUROPE'
  | 'MONDE'
  | 'CP_INVALIDE'
  | 'ADRESSE_REQUISE';

export type ShippingClass = 'small' | 'large';

export interface ShippingLine {
  shipping_class?: string | null;
  /** Poids unitaire en kg (null/absent → `default_weight_kg` de la config). */
  weight_kg?: number | null;
  /* ─ Dimensions unitaires en cm, OPTIONNELLES ────────────────────────────
     Les produits n'ont aujourd'hui en base qu'un `weight_kg` ; ces trois
     champs sont prévus pour la migration du catalogue. REPLI DOCUMENTÉ : si
     l'une des trois manque, est nulle ou ≤ 0, le poids volumétrique n'est PAS
     calculé et on facture le poids réel — on ne devine pas un volume, ce
     serait facturer un client sur une donnée inventée. Le contrôle de gabarit
     (hors gabarit / refus colis) est lui aussi neutralisé dans ce cas. */
  length_cm?: number | null;
  width_cm?: number | null;
  height_cm?: number | null;
  /** Prix unitaire HT — sert UNIQUEMENT au calcul du franco de port. */
  unit_price_ht?: number | null;
  quantity: number;
}

export interface ShippingDestination {
  postal_code?: string | null;
  country?: string | null;
}

export interface OptionsLivraison {
  /** Option historique : palette EXPRESS Europe (48 h) au lieu du groupage. */
  express?: boolean;
  /** Nature du destinataire — pilote les suppléments palette (hayon, RDV…). */
  destinataire?: 'particulier' | 'entreprise';
  /** Zone montagne / centre-ville / accès difficile (supplément palette). */
  zone_difficile?: boolean;
  /** Montant marchandises HT du panier, si les lignes ne portent pas de prix. */
  montant_ht?: number;
}

/** Retour historique de `computeShipping` — forme INCHANGÉE (rétrocompat). */
export interface ShippingQuote {
  /** 'parcel' | 'pallet_fr_0_200' | … | null */
  method: string | null;
  /** Libellé lisible pour le client */
  label: string;
  /** Montant € TTC — null si adresse requise ou devis nécessaire */
  cost: number | null;
  /** true si le calcul attend l'adresse de livraison (ou sa correction) */
  needsAddress: boolean;
  /** true si la destination n'a pas de tarif automatique → devis */
  needsQuote: boolean;
  /** true si l'option Express Europe peut être proposée pour cette destination */
  expressAvailable: boolean;
  /** Nombre d'unités « palette » dans le panier */
  palletUnits: number;
  /** Poids total des articles colis (kg) */
  parcelWeightKg: number;
  /* ─ Ajouts v3, purement additifs (aucun appelant existant ne casse) ───── */
  /** Raison précise d'un blocage — À AFFICHER À LA PLACE d'un message figé. */
  motif?: string;
  /** L'offre retenue, si une offre chiffrée a pu être calculée. */
  offre?: OffreLivraison;
  /** Toutes les offres proposables (pour un sélecteur de livraison). */
  offres?: OffreLivraison[];
  /** Zone résolue — utile au diagnostic et aux journaux serveur. */
  zone?: ZoneLivraison;
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. RÉFÉRENTIEL TARIFAIRE 2026
   Chaque grille = liste de paires [poids_max_kg, prix]. Le prix s'applique à
   tout colis dont le poids est ≤ poids_max_kg et > au poids_max_kg précédent.
   ═══════════════════════════════════════════════════════════════════════════ */

type Tranche = readonly [number, number];
type Grille = readonly Tranche[];

/** Taux de TVA française — référentiel `meta.tva_France` (2026-08-04). */
const TVA_FR = 0.2;

/* ── Colissimo Domicile France, tarif ENTREPRISE, base HT, effet 2026-01-01.
      Source : colissimo.entreprise.laposte.fr/en/offer-and-prices/prices/
               general-rates-colissimo-home-delivery-france — relevé 2026-08-04.
      Le référentiel désigne cette grille comme « GRILLE RECOMMANDÉE COMME BASE
      POUR OMEGA ». Variante « avec signature » = +1,05 € HT constant. ────── */
const COLISSIMO_FR_SANS_SIGNATURE: Grille = [
  [0.25, 6.84], [0.5, 7.71], [0.75, 8.6], [1, 9.34], [2, 10.48], [3, 11.49],
  [4, 12.54], [5, 13.54], [6, 14.17], [7, 15.16], [8, 16.15], [9, 17.17],
  [10, 18.17], [11, 18.79], [12, 19.77], [13, 20.74], [14, 21.75], [15, 22.73],
  [16, 23.7], [17, 24.68], [18, 25.66], [19, 26.65], [20, 27.62], [21, 28.33],
  [22, 29.29], [23, 30.28], [24, 31.25], [25, 32.19], [26, 33.19], [27, 34.13],
  [28, 35.11], [29, 36.12], [30, 37.05],
];

/* ── Même page officielle, variante AVEC SIGNATURE (base HT, effet 2026-01-01).
      Retenue PAR DÉFAUT : OMEGA expédie du matériel scénique à valeur unitaire
      élevée (machines à fumée, hazers), le référentiel la recommande
      explicitement pour ce cas. Réglable via `signature_domicile`. ───────── */
const COLISSIMO_FR_AVEC_SIGNATURE: Grille = [
  [0.25, 7.89], [0.5, 8.76], [0.75, 9.65], [1, 10.39], [2, 11.53], [3, 12.54],
  [4, 13.59], [5, 14.59], [6, 15.22], [7, 16.21], [8, 17.2], [9, 18.22],
  [10, 19.22], [11, 19.84], [12, 20.82], [13, 21.79], [14, 22.8], [15, 23.78],
  [16, 24.75], [17, 25.73], [18, 26.71], [19, 27.7], [20, 28.67], [21, 29.38],
  [22, 30.34], [23, 31.33], [24, 32.3], [25, 33.24], [26, 34.24], [27, 35.18],
  [28, 36.16], [29, 37.17], [30, 38.1],
];

/* ── Chronopost, tarifs ENTREPRISE base HT, effet 2025-10-01.
      Source : chronopost.fr/fr/professionnel/offre-digitale/tarifs — 2026-08-04.
      Chrono 18 (J+1 avant 18 h) est retenu par défaut : même J+1 que Chrono 13
      pour 3 à 4 € HT de moins par colis. Chrono 13 reste sélectionnable. ─── */
const CHRONO18_FR: Grille = [[1, 16.0], [3, 18.0], [10, 20.5], [20, 31.0], [30, 42.0]];
const CHRONO13_FR: Grille = [[1, 19.5], [3, 21.0], [10, 24.0], [20, 34.0], [30, 45.0]];

/* ── Mondial Relay Point Relais France, tarif PUBLIC base TTC, effet 2026-06-15.
      Source : mondialrelay.fr/envoi-de-colis/tarifs-expeditions/ — 2026-08-04.
      Limites : 25 kg, L+l+h ≤ 150 cm, plus grand côté ≤ 120 cm. ──────────── */
const MONDIAL_RELAY_FR: Grille = [
  [0.25, 4.15], [0.5, 4.15], [1, 5.99], [2, 7.99], [3, 7.99], [4, 9.99],
  [5, 15.99], [7, 15.99], [10, 15.99], [15, 25.99], [25, 25.99],
];

/* ── Colissimo Point de Retrait, tarif ENTREPRISE base HT, effet 2026-01-01.
      Source : colissimo.entreprise.laposte.fr/en/offer-and-services/prices/
               general-rates-colissimo-pickup-point-france — 2026-08-04.
      Le référentiel signale cette grille comme PARTIELLE (points de contrôle
      relevés) : les tranches intermédiaires manquent, l'application par
      tranche reste juste mais moins fine. ────────────────────────────────── */
const COLISSIMO_RELAIS_FR: Grille = [
  [0.25, 5.2], [1, 7.71], [5, 11.9], [10, 16.52], [20, 25.97], [30, 35.42],
];

/* ── Colissimo Outre-Mer PRIORITAIRE (6 à 18 j), tarif public base TTC,
      effet 2026-01-01. Source : laposte.fr/tarif-colissimo-outre-mer — 2026-08-04.
      ⚠ C'EST LA CORRECTION LA PLUS URGENTE DE L'AUDIT : ces grilles n'étaient
      jamais atteintes, le DOM était facturé au tarif métropole. ──────────── */
const COLISSIMO_OM1_PRIORITAIRE: Grille = [
  [0.5, 12.02], [1, 19.0], [2, 25.89], [5, 38.9], [10, 62.32], [15, 130.2], [30, 143.02],
];
const COLISSIMO_OM2_PRIORITAIRE: Grille = [
  [0.5, 12.21], [1, 18.95], [2, 33.49], [5, 55.96], [10, 109.58], [15, 249.99], [30, 287.23],
];
/* ── Colissimo Outre-Mer ÉCONOMIQUE (voie maritime, 13 à 31 j ouvrés), OM1
      uniquement, base TTC, effet 2026-01-01. Même source. ────────────────── */
const COLISSIMO_OM1_ECONOMIQUE: Grille = [
  [0.5, 8.41], [1, 11.73], [2, 14.77], [5, 24.8], [10, 39.24], [15, 79.42], [30, 91.53],
];

/* ── Colissimo Domicile International AVEC SIGNATURE, tarif ENTREPRISE base HT,
      effet 2026-01-01, délai 3 à 8 j ouvrés.
      Source : colissimo.entreprise.laposte.fr — relevé 2026-08-04.
      Seuls ces six pays figurent en colonne dédiée sur la page officielle : on
      ne complète PAS par inférence (le référentiel signale l'inférence LU/AT
      comme « à valider »), les autres pays passent par la grille publique. ─ */
const COLISSIMO_INTL_ENTREPRISE: Record<string, Grille> = {
  DE: [[0.25, 9.18], [0.5, 9.28], [1, 11.33], [2, 12.13], [5, 14.61], [10, 18.61], [20, 28.1], [30, 37.44]],
  BE: [[0.25, 9.0], [0.5, 9.1], [1, 11.11], [2, 11.89], [5, 14.36], [10, 18.36], [20, 27.54], [30, 36.7]],
  NL: [[0.25, 9.23], [0.5, 9.33], [1, 11.39], [2, 12.19], [5, 14.67], [10, 18.67], [20, 28.24], [30, 37.63]],
  IT: [[0.25, 10.4], [0.5, 10.5], [1, 13.36], [2, 14.94], [5, 17.52], [10, 21.52], [20, 31.55], [30, 40.85]],
  ES: [[0.25, 10.35], [0.5, 10.45], [1, 13.29], [2, 14.87], [5, 17.44], [10, 21.44], [20, 31.39], [30, 40.65]],
  PT: [[0.25, 10.62], [0.5, 10.72], [1, 13.63], [2, 15.24], [5, 17.84], [10, 21.84], [20, 32.18], [30, 41.67]],
};

/* ── Colissimo International, tarif PUBLIC base TTC, effet 2026-01-01.
      Source : laposte.fr/tarif-colissimo — relevé 2026-08-04.
      Sert de repli pour les pays européens sans grille entreprise. ───────── */
const COLISSIMO_INTL_UE_PUBLIC: Grille = [
  [0.5, 14.99], [1, 19.39], [2, 22.19], [5, 28.59], [10, 46.99], [15, 67.99], [20, 87.99], [30, 87.99],
];
const COLISSIMO_INTL_GB_PUBLIC: Grille = [
  [0.5, 18.99], [1, 23.39], [2, 26.19], [5, 32.59], [10, 50.99], [30, 91.99],
];
/** Zone MONDE B du référentiel — « Europe de l'Est hors UE, Norvège, Maghreb ». */
const COLISSIMO_INTL_MONDE_B_PUBLIC: Grille = [
  [0.5, 23.79], [1, 28.39], [2, 31.09], [5, 39.89], [10, 66.09], [15, 89.59], [20, 109.49], [30, 109.49],
];

/** Pays européens couverts par la grille publique « UE + Suisse ». */
const PAYS_COLISSIMO_UE_PUBLIC = new Set([
  'AT', 'IE', 'DK', 'SE', 'FI', 'PL', 'CZ', 'SK', 'SI', 'HU', 'HR', 'RO',
  'BG', 'GR', 'EE', 'LV', 'LT', 'MT', 'CY', 'LU', 'CH',
]);

/* ── Mondial Relay Point Relais Europe, base TTC, effet 2026-06-15.
      Source : mondialrelay.fr + jpi-conseil.fr — relevé 2026-08-04.
      Confiance « secondaire_croise ». Aucun autre pays n'est couvert. ────── */
const MONDIAL_RELAY_EU: Record<string, Grille> = {
  BE: [[0.5, 4.6], [1, 6.6], [10, 17.4], [25, 26.0]],
  LU: [[0.5, 4.6], [1, 6.6], [10, 17.4], [25, 26.0]],
  NL: [[0.5, 4.6], [1, 6.6], [10, 17.4], [25, 26.0]],
  ES: [[0.5, 6.6], [1, 9.5], [10, 19.4], [25, 28.8]],
  PT: [[0.5, 6.6], [1, 9.5], [10, 19.4], [25, 28.8]],
  IT: [[0.5, 6.6], [1, 9.5], [10, 19.4], [25, 28.8]],
  PL: [[0.5, 7.2], [1, 10.4], [10, 19.8], [25, 29.5]],
};

/* ── Messagerie palettisée (Geodis, DB Schenker, Heppner, Dachser…), base HT.
      AUCUN de ces opérateurs ne publie de grille : le référentiel ne donne que
      des FOURCHETTES de marché 2026. Conformément au CONTRAT §3 on retient la
      BORNE MÉDIANE, calculée ici (min+max)/2 :
        régional < 200 km : 100 kg (55-95)→75 · 200 kg (70-120)→95 ·
                            300 kg (85-140)→112,50 · 500 kg (100-165)→132,50
        national 200-900 km : 100 kg (95-175)→135 · 200 kg (115-230)→172,50 ·
                            300 kg (135-275)→205 · 500 kg (165-330)→247,50
      Source : wk-transport-logistique.fr, affretium.com, innovia-transport.com
      — relevé 2026-08-04. Repère réel documenté : Lille→Toulouse, 1 palette de
      400 kg = 208 € HT (hapia.fr), cohérent avec la médiane 500 kg nationale.
      Les « sous_zones » kilométriques du référentiel (200-500 / 500-800 /
      > 800 km) ne sont PAS utilisées : elles ne sont chiffrées que pour 300 kg
      et se croiseraient mal avec les tranches de poids. On garde une seule
      série homogène. ─────────────────────────────────────────────────────── */
const PALETTE_FR_REGIONAL: Grille = [[100, 75], [200, 95], [300, 112.5], [500, 132.5]];
const PALETTE_FR_NATIONAL: Grille = [[100, 135], [200, 172.5], [300, 205], [500, 247.5]];

/* ── Groupage palette Europe de l'Ouest, base HT, fourchettes 2026 → médiane.
      ES (130-260)→195 · IT (160-300)→230 · BE (170-320)→245 · DE (180-340)→260
      NL (190-350)→270 · LU (175-325)→250 · PT (220-400)→310, jusqu'à 300 kg.
      Source : logifie.com, wk-transport-logistique.fr — relevé 2026-08-04.
      Les pays absents de cette liste ne sont PAS extrapolés → devis. ─────── */
const PALETTE_EUROPE: Record<string, { prix_ht: number; poids_max_kg: number; delai: [number, number] }> = {
  ES: { prix_ht: 195, poids_max_kg: 300, delai: [2, 4] },
  IT: { prix_ht: 230, poids_max_kg: 300, delai: [3, 5] },
  BE: { prix_ht: 245, poids_max_kg: 300, delai: [3, 5] },
  DE: { prix_ht: 260, poids_max_kg: 300, delai: [3, 5] },
  NL: { prix_ht: 270, poids_max_kg: 300, delai: [3, 5] },
  LU: { prix_ht: 250, poids_max_kg: 300, delai: [3, 5] },
  PT: { prix_ht: 310, poids_max_kg: 300, delai: [4, 6] },
};

/* ── Palette EXPRESS Europe 24-48 h : fourchette 250-500 € HT → médiane 375.
      Source : logifie.com, affretium.com — relevé 2026-08-04. ────────────── */
const PALETTE_EUROPE_EXPRESS_HT = 375;
const PALETTE_EUROPE_EXPRESS_POIDS_MAX_KG = 300;

/* ── Dégressivité multi-palettes (indice sur le tarif unitaire), paliers du
      référentiel : 1 → 1,00 · 5 → 0,75 · 10 → 0,66 · 15 → 0,60.
      Appliquée PAR PALIER, sans interpolation (interpoler serait inventer). ─ */
const DEGRESSIVITE_PALETTES: readonly Tranche[] = [[1, 1.0], [5, 0.75], [10, 0.66], [15, 0.6]];

/* ── Limites physiques (référentiel `regles_generales.limites_dimensionnelles`)
      Source : aide.laposte.fr + mondialrelay.fr — relevé 2026-08-04. ─────── */
const COLIS_POIDS_MAX_KG = 30;              // Colissimo / Chronopost / DPD
const COLISSIMO_SOMME_MAX_CM = 150;         // L+l+h au-delà duquel il y a supplément
const COLISSIMO_SOMME_REFUS_CM = 200;       // au-delà : refus pur et simple
const COLISSIMO_COTE_MAX_CM = 100;
/** Longueur maximale acceptée par Colissimo et Chronopost (150 cm). Au-delà,
    aucun réseau colis ne prend l'envoi : il part sur palette. */
const COLIS_COTE_REFUS_CM = 150;
const RELAIS_POIDS_MAX_KG = 25;             // Mondial Relay
const RELAIS_SOMME_MAX_CM = 150;
const RELAIS_COTE_MAX_CM = 120;
/** Poids usuel maximal d'une palette 80×120 (référentiel palette_messagerie). */
const PALETTE_POIDS_MAX_KG = 500;

/* ═══════════════════════════════════════════════════════════════════════════
   3. CONFIGURATION
   Les champs historiques sont CONSERVÉS : `AdminSettings.tsx` les lit et les
   réécrit tels quels, et les configurations déjà enregistrées en base restent
   valides. Ils ne pilotent plus le prix par défaut (les grilles réelles ci-
   dessus s'en chargent) SAUF si `utiliser_bareme_personnalise` est activé.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface ParcelBracket {
  /** Poids maximal de la tranche (kg, inclus) */
  max_kg: number;
  /** Prix € TTC de la tranche */
  price: number;
}

export interface PalletZonePrices {
  /** France ≤ ~200 km du dépôt */
  fr_0_200: number;
  /** France ~200–500 km */
  fr_200_500: number;
  /** France entière (> 500 km, Corse) */
  fr_far: number;
  /** Europe (Belgique, Allemagne, Espagne, Italie…) */
  europe: number;
  /** Express Europe (option au choix du client) */
  express_eu: number;
}

/** Suppléments palette — montants HT, réglables (CONTRAT §3, référentiel §supplements). */
export interface SupplementsPalette {
  /** Hayon élévateur — fourchette 15-30 € HT → médiane 22,50. */
  hayon_ht: number;
  /** Prise de rendez-vous — fourchette 10-20 € HT, médiane publiée : 15,00. */
  rdv_ht: number;
  /** Livraison à particulier (B2C palette) — fourchette 10-25 € HT → médiane 17,50. */
  particulier_ht: number;
  /** Zone montagne / centre-ville — fourchette 7,25-25 € HT → médiane 16,13
      (référence DPD montagne publiée : 7,25 € HT). */
  zone_difficile_ht: number;
  /** Corse et îles du littoral — supplément DPD publié : 20,14 € HT par colis. */
  corse_iles_ht: number;
  /** Surcharge carburant — taux général GEODIS d'AOÛT 2026 : 17,11 %.
      Indexé mensuellement (CNR/PEG/Nord Pool) : à réviser chaque mois. */
  surcharge_carburant_pct: number;
  /** Colissimo volumineux (L+l+h entre 150 et 200 cm, ou un côté > 100 cm). */
  hors_gabarit_colissimo_ht: number;
}

/** Seuils de franco de port PAR ZONE, en € HT. `null` = pas de franco. */
export interface SeuilsFranco {
  metropole: number | null;
  corse_iles: number | null;
  ue: number | null;
  outre_mer: number | null;
}

export interface ShippingConfig {
  /* ── Champs historiques (v1/v2) — conservés pour l'admin et la compatibilité ── */
  /** Barème colis personnalisé : tranches de poids croissantes (kg → € TTC) */
  parcel_brackets: ParcelBracket[];
  /** Prix colis au-delà de la dernière tranche (€ TTC) */
  parcel_over_price: number;
  /** Surcoût colis vers l'Europe (€ TTC, ajouté au barème personnalisé) */
  parcel_europe_surcharge: number;
  /** Poids retenu pour un produit sans poids renseigné (kg) */
  default_weight_kg: number;
  /** Prix palette PAR UNITÉ selon la zone (€ TTC, barème personnalisé) */
  pallet_zones: PalletZonePrices;
  /** Seuils des zones France (km routiers estimés) */
  near_km_max: number;
  mid_km_max: number;
  /** Point de départ des expéditions (dépôt) */
  depot: { lat: number; lng: number; label: string };
  /** Délai d'expédition annoncé (jours) — affichage historique du panier */
  delay_days: number;

  /* ── Nouveautés v3 ─────────────────────────────────────────────────────── */
  /** true = on repasse aux barèmes saisis en admin (comportement v2) pour la
      métropole et l'Europe. Les corrections de zone (DOM, Corse, code postal
      invalide, adresse manquante) restent actives dans TOUS les cas. */
  utiliser_bareme_personnalise: boolean;
  /** Colissimo domicile avec signature (recommandé : matériel de valeur). */
  signature_domicile: boolean;
  /** Offre express retenue : Chrono 18 (défaut, moins cher) ou Chrono 13. */
  service_express: 'chrono18' | 'chrono13';
  /** Réseau relais retenu en métropole. */
  service_relais: 'mondial_relay' | 'colissimo_point_retrait';
  /** Offre outre-mer : prioritaire (6-18 j) ou économique maritime (13-31 j). */
  service_outre_mer: 'prioritaire' | 'economique';
  /** Mode présélectionné, et mode utilisé par `computeShipping`. */
  mode_par_defaut: ModeLivraison;
  /** Retrait au dépôt proposé au client. */
  retrait_actif: boolean;
  /** Délai de mise à disposition au dépôt (jours ouvrés). */
  retrait_delai_j: number;
  supplements_palette: SupplementsPalette;
  franco: SeuilsFranco;
  /** Modes éligibles au franco de port (jamais `palette`, jamais `express`). */
  franco_modes: ModeLivraison[];
  /* ── Plancher de prix des colis métropole, en € TTC ────────────────────────
     POURQUOI : l'ancien forfait unique de 7,99 € TTC était SOUS le coût réel
     d'OMEGA — un colis de 1 kg lui est facturé 12,47 € TTC par Colissimo, un
     de 0,5 kg 10,51 €. Chaque petit envoi était donc vendu à perte, exactement
     comme l'outre-mer, en plus discret. Ce plancher corrige la vente à perte
     et couvre en prime la manutention (carton, calage, étiquette, passage au
     bureau de poste) que la grille transporteur ne rembourse pas.
     C'est un PLANCHER, pas un forfait : au-dessus, le prix continue de suivre
     le coût réel du transporteur, tranche par tranche.
     PÉRIMÈTRE : France métropolitaine et Corse uniquement, et seulement les
     modes colis (`domicile`, `express`, `relais`). Pas l'outre-mer ni l'UE —
     un colis outre-mer va de 20 à 190 €, un plancher n'y veut rien dire. Pas
     la palette. Pas le retrait au dépôt, qui reste gratuit.
     `null` ou `0` désactive le plancher. */
  plancher_colis_metropole_ttc: number | null;
  /** Diviseur du poids volumétrique — 5000 chez Colissimo/Chronopost/DPD/GLS. */
  diviseur_volumetrique: number;
}

export const DEFAULT_SHIPPING_CONFIG: ShippingConfig = {
  parcel_brackets: [
    { max_kg: 1, price: 7.99 },
    { max_kg: 2, price: 15.9 },
    { max_kg: 5, price: 19.9 },
    { max_kg: 10, price: 29.9 },
    { max_kg: 30, price: 49.9 },
  ],
  parcel_over_price: 79.9,
  parcel_europe_surcharge: 12,
  default_weight_kg: 1,
  pallet_zones: {
    fr_0_200: 90,
    fr_200_500: 140,
    fr_far: 250,
    europe: 280,
    express_eu: 450,
  },
  near_km_max: 200,
  mid_km_max: 500,
  depot: { lat: 43.43, lng: 3.3, label: 'Montblanc (34290)' },
  delay_days: 7,

  // ⚠ false = grilles transporteurs réelles 2026. C'est ce qui corrige la
  // vente à perte constatée à l'audit ; passer à true rétablit les barèmes
  // saisis en admin (et donc, pour la métropole, les prix d'avant).
  utiliser_bareme_personnalise: false,
  signature_domicile: true,
  service_express: 'chrono18',
  service_relais: 'mondial_relay',
  service_outre_mer: 'prioritaire',
  mode_par_defaut: 'domicile',
  retrait_actif: true,
  retrait_delai_j: 2,
  supplements_palette: {
    hayon_ht: 22.5,
    rdv_ht: 15,
    particulier_ht: 17.5,
    zone_difficile_ht: 16.13,
    corse_iles_ht: 20.14,
    surcharge_carburant_pct: 17.11,
    hors_gabarit_colissimo_ht: 6,
  },
  /* Le franco est une décision COMMERCIALE, pas un tarif transporteur : le
     référentiel ne fournit que des repères sectoriels (e-commerce B2B 65 € ·
     négoce industriel 150 € · distribution technique 200 € · fabricant 800 €).
     On retient le repère « négoce industriel » (150 € HT, marge brute 35 %)
     pour la métropole, le seul qui corresponde à l'activité d'OMEGA. Aucun
     repère n'existe pour la Corse, l'UE ou l'outre-mer où le port coûte 2 à
     10 fois plus cher : le franco y est DÉSACTIVÉ par défaut plutôt qu'estimé
     au doigt mouillé. À arbitrer en admin. */
  franco: { metropole: 150, corse_iles: null, ue: null, outre_mer: null },
  franco_modes: ['domicile', 'relais'],
  // Décision commerciale du gérant (2026-08) : plus aucun colis métropole en
  // dessous de 12,99 € TTC. Voir le POURQUOI sur le champ de l'interface.
  plancher_colis_metropole_ttc: 12.99,
  diviseur_volumetrique: 5000,
};

/**
 * Fusionne la config stockée avec les défauts.
 * Migre automatiquement l'ancienne config v1 (small_flat / large_near /
 * large_far) : les tarifs déjà réglés par l'admin sont préservés.
 */
export function normalizeShippingConfig(raw: unknown): ShippingConfig {
  const r = (raw || {}) as Record<string, unknown> & Partial<ShippingConfig>;
  const d = DEFAULT_SHIPPING_CONFIG;

  const num = (v: unknown, dflt: number): number =>
    typeof v === 'number' && isFinite(v) && v >= 0 ? v : dflt;
  const bool = (v: unknown, dflt: boolean): boolean =>
    typeof v === 'boolean' ? v : dflt;
  const seuil = (v: unknown, dflt: number | null): number | null =>
    v === null ? null : typeof v === 'number' && isFinite(v) && v >= 0 ? v : dflt;
  const choix = <T extends string>(v: unknown, valides: readonly T[], dflt: T): T =>
    typeof v === 'string' && (valides as readonly string[]).includes(v) ? (v as T) : dflt;

  // Héritage v1 → v2 : small_flat devient la 1re tranche, large_near la zone
  // proche, large_far la zone France entière.
  const v1SmallFlat = typeof r.small_flat === 'number' ? (r.small_flat as number) : null;
  const v1LargeNear = typeof r.large_near === 'number' ? (r.large_near as number) : null;
  const v1LargeFar = typeof r.large_far === 'number' ? (r.large_far as number) : null;

  let brackets: ParcelBracket[];
  if (Array.isArray(r.parcel_brackets) && r.parcel_brackets.length) {
    brackets = (r.parcel_brackets as unknown[])
      .map(b => {
        const o = (b || {}) as Partial<ParcelBracket>;
        return { max_kg: num(o.max_kg, 0), price: num(o.price, 0) };
      })
      .filter(b => b.max_kg > 0)
      .sort((a, b) => a.max_kg - b.max_kg);
    if (!brackets.length) brackets = d.parcel_brackets;
  } else {
    brackets = d.parcel_brackets.map((b, i) =>
      i === 0 && v1SmallFlat !== null ? { ...b, price: v1SmallFlat } : { ...b }
    );
  }

  const zonesRaw = (r.pallet_zones || {}) as Partial<PalletZonePrices>;
  const pallet_zones: PalletZonePrices = {
    fr_0_200: num(zonesRaw.fr_0_200, v1LargeNear !== null ? v1LargeNear : d.pallet_zones.fr_0_200),
    fr_200_500: num(zonesRaw.fr_200_500, d.pallet_zones.fr_200_500),
    fr_far: num(zonesRaw.fr_far, v1LargeFar !== null ? v1LargeFar : d.pallet_zones.fr_far),
    europe: num(zonesRaw.europe, d.pallet_zones.europe),
    express_eu: num(zonesRaw.express_eu, d.pallet_zones.express_eu),
  };

  const depotRaw = (r.depot || {}) as Partial<ShippingConfig['depot']>;
  const supRaw = (r.supplements_palette || {}) as Partial<SupplementsPalette>;
  const francoRaw = (r.franco || {}) as Partial<SeuilsFranco>;

  const MODES: readonly ModeLivraison[] = ['domicile', 'express', 'relais', 'palette', 'retrait'];
  const francoModes = Array.isArray(r.franco_modes)
    ? (r.franco_modes as unknown[]).filter((m): m is ModeLivraison =>
        typeof m === 'string' && (MODES as readonly string[]).includes(m)
      )
    : d.franco_modes;

  return {
    parcel_brackets: brackets,
    parcel_over_price: num(r.parcel_over_price, d.parcel_over_price),
    parcel_europe_surcharge: num(r.parcel_europe_surcharge, d.parcel_europe_surcharge),
    default_weight_kg: num(r.default_weight_kg, d.default_weight_kg) || d.default_weight_kg,
    pallet_zones,
    near_km_max: num(r.near_km_max, d.near_km_max) || d.near_km_max,
    mid_km_max: num(r.mid_km_max, d.mid_km_max) || d.mid_km_max,
    depot: {
      lat: typeof depotRaw.lat === 'number' ? depotRaw.lat : d.depot.lat,
      lng: typeof depotRaw.lng === 'number' ? depotRaw.lng : d.depot.lng,
      label: typeof depotRaw.label === 'string' && depotRaw.label ? depotRaw.label : d.depot.label,
    },
    delay_days: num(r.delay_days, d.delay_days) || d.delay_days,

    utiliser_bareme_personnalise: bool(r.utiliser_bareme_personnalise, d.utiliser_bareme_personnalise),
    signature_domicile: bool(r.signature_domicile, d.signature_domicile),
    service_express: choix(r.service_express, ['chrono18', 'chrono13'] as const, d.service_express),
    service_relais: choix(
      r.service_relais,
      ['mondial_relay', 'colissimo_point_retrait'] as const,
      d.service_relais
    ),
    service_outre_mer: choix(
      r.service_outre_mer,
      ['prioritaire', 'economique'] as const,
      d.service_outre_mer
    ),
    mode_par_defaut: choix(r.mode_par_defaut, MODES, d.mode_par_defaut),
    retrait_actif: bool(r.retrait_actif, d.retrait_actif),
    retrait_delai_j: num(r.retrait_delai_j, d.retrait_delai_j),
    supplements_palette: {
      hayon_ht: num(supRaw.hayon_ht, d.supplements_palette.hayon_ht),
      rdv_ht: num(supRaw.rdv_ht, d.supplements_palette.rdv_ht),
      particulier_ht: num(supRaw.particulier_ht, d.supplements_palette.particulier_ht),
      zone_difficile_ht: num(supRaw.zone_difficile_ht, d.supplements_palette.zone_difficile_ht),
      corse_iles_ht: num(supRaw.corse_iles_ht, d.supplements_palette.corse_iles_ht),
      surcharge_carburant_pct: num(
        supRaw.surcharge_carburant_pct,
        d.supplements_palette.surcharge_carburant_pct
      ),
      hors_gabarit_colissimo_ht: num(
        supRaw.hors_gabarit_colissimo_ht,
        d.supplements_palette.hors_gabarit_colissimo_ht
      ),
    },
    franco: {
      metropole: seuil(francoRaw.metropole, d.franco.metropole),
      corse_iles: seuil(francoRaw.corse_iles, d.franco.corse_iles),
      ue: seuil(francoRaw.ue, d.franco.ue),
      outre_mer: seuil(francoRaw.outre_mer, d.franco.outre_mer),
    },
    franco_modes: francoModes.length ? francoModes : d.franco_modes,
    // `null` explicite = plancher désactivé ; `0` aussi (traité comme désactivé
    // à l'application). Une valeur négative retombe sur le défaut.
    plancher_colis_metropole_ttc: seuil(
      r.plancher_colis_metropole_ttc,
      d.plancher_colis_metropole_ttc
    ),
    diviseur_volumetrique:
      num(r.diviseur_volumetrique, d.diviseur_volumetrique) || d.diviseur_volumetrique,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. GÉOGRAPHIE
   ═══════════════════════════════════════════════════════════════════════════ */

/* Centre approximatif (préfecture) par département. Précision ±20 km —
   largement suffisante pour distinguer une zone régionale d'une zone nationale. */
const DEPT_COORDS: Record<string, [number, number]> = {
  '01': [46.21, 5.23], '02': [49.56, 3.62], '03': [46.57, 3.33],
  '04': [44.09, 6.24], '05': [44.56, 6.08], '06': [43.7, 7.27],
  '07': [44.74, 4.6], '08': [49.77, 4.72], '09': [42.97, 1.61],
  '10': [48.3, 4.08], '11': [43.21, 2.35], '12': [44.35, 2.57],
  '13': [43.3, 5.37], '14': [49.18, -0.37], '15': [44.93, 2.44],
  '16': [45.65, 0.16], '17': [46.16, -1.15], '18': [47.08, 2.4],
  '19': [45.27, 1.77], '21': [47.32, 5.04], '22': [48.51, -2.77],
  '23': [46.17, 1.87], '24': [45.18, 0.72], '25': [47.24, 6.02],
  '26': [44.93, 4.89], '27': [49.03, 1.15], '28': [48.45, 1.48],
  '29': [48.0, -4.1], '30': [43.84, 4.36], '31': [43.6, 1.44],
  '32': [43.65, 0.59], '33': [44.84, -0.58], '34': [43.61, 3.88],
  '35': [48.11, -1.68], '36': [46.81, 1.69], '37': [47.39, 0.69],
  '38': [45.19, 5.72], '39': [46.67, 5.55], '40': [43.89, -0.5],
  '41': [47.59, 1.33], '42': [45.44, 4.39], '43': [45.04, 3.88],
  '44': [47.22, -1.55], '45': [47.9, 1.9], '46': [44.45, 1.44],
  '47': [44.2, 0.62], '48': [44.52, 3.5], '49': [47.47, -0.55],
  '50': [49.12, -1.09], '51': [48.96, 4.36], '52': [48.11, 5.14],
  '53': [48.07, -0.77], '54': [48.69, 6.18], '55': [48.77, 5.16],
  '56': [47.66, -2.76], '57': [49.12, 6.18], '58': [46.99, 3.16],
  '59': [50.63, 3.06], '60': [49.43, 2.08], '61': [48.43, 0.09],
  '62': [50.29, 2.78], '63': [45.78, 3.08], '64': [43.3, -0.37],
  '65': [43.23, 0.07], '66': [42.7, 2.9], '67': [48.57, 7.75],
  '68': [48.08, 7.36], '69': [45.76, 4.84], '70': [47.62, 6.16],
  '71': [46.31, 4.83], '72': [48.0, 0.2], '73': [45.56, 5.92],
  '74': [45.9, 6.13], '75': [48.86, 2.35], '76': [49.44, 1.1],
  '77': [48.54, 2.66], '78': [48.8, 2.13], '79': [46.32, -0.46],
  '80': [49.89, 2.3], '81': [43.93, 2.15], '82': [44.02, 1.35],
  '83': [43.12, 5.93], '84': [43.95, 4.81], '85': [46.67, -1.43],
  '86': [46.58, 0.34], '87': [45.83, 1.26], '88': [48.17, 6.45],
  '89': [47.8, 3.57], '90': [47.64, 6.86], '91': [48.63, 2.44],
  '92': [48.89, 2.2], '93': [48.91, 2.44], '94': [48.79, 2.46],
  '95': [49.04, 2.08],
};

/** Facteur distance routière / distance à vol d'oiseau */
const ROAD_FACTOR = 1.25;

/** Pays desservis par la zone « Europe » (comparaison sans accents/casse) */
const EUROPE_COUNTRIES = new Set([
  'belgique', 'belgium', 'allemagne', 'germany', 'deutschland', 'espagne',
  'spain', 'espana', 'italie', 'italy', 'italia', 'portugal', 'pays-bas',
  'paysbas', 'netherlands', 'nederland', 'hollande', 'luxembourg', 'autriche',
  'austria', 'irlande', 'ireland', 'danemark', 'denmark', 'suede', 'sweden',
  'finlande', 'finland', 'pologne', 'poland', 'tchequie', 'republique tcheque',
  'czech republic', 'czechia', 'slovaquie', 'slovakia', 'slovenie', 'slovenia',
  'hongrie', 'hungary', 'croatie', 'croatia', 'roumanie', 'romania', 'bulgarie',
  'bulgaria', 'grece', 'greece', 'estonie', 'estonia', 'lettonie', 'latvia',
  'lituanie', 'lithuania', 'malte', 'malta', 'chypre', 'cyprus', 'suisse',
  'switzerland', 'schweiz', 'royaume-uni', 'royaumeuni', 'united kingdom',
  'uk', 'angleterre', 'england', 'norvege', 'norway', 'monaco', 'andorre',
  'andorra',
]);

const FRANCE_NAMES = new Set(['france', 'fr', 'france metropolitaine', '']);

/* Nom (ou code) de pays → code ISO 3166-1 alpha-2. Le module raisonne
   historiquement en NOMS de pays saisis par le client (« Allemagne ») ; les
   grilles transporteurs, elles, sont indexées par code ISO. Cette table fait
   le pont, dans les deux sens (on accepte aussi le code directement). */
const PAYS_ISO: Record<string, string> = {
  belgique: 'BE', belgium: 'BE', be: 'BE',
  allemagne: 'DE', germany: 'DE', deutschland: 'DE', de: 'DE',
  espagne: 'ES', spain: 'ES', espana: 'ES', es: 'ES',
  italie: 'IT', italy: 'IT', italia: 'IT', it: 'IT',
  portugal: 'PT', pt: 'PT',
  'pays-bas': 'NL', paysbas: 'NL', netherlands: 'NL', nederland: 'NL', hollande: 'NL', nl: 'NL',
  luxembourg: 'LU', lu: 'LU',
  autriche: 'AT', austria: 'AT', at: 'AT',
  irlande: 'IE', ireland: 'IE', ie: 'IE',
  danemark: 'DK', denmark: 'DK', dk: 'DK',
  suede: 'SE', sweden: 'SE', se: 'SE',
  finlande: 'FI', finland: 'FI', fi: 'FI',
  pologne: 'PL', poland: 'PL', pl: 'PL',
  tchequie: 'CZ', 'republique tcheque': 'CZ', 'czech republic': 'CZ', czechia: 'CZ', cz: 'CZ',
  slovaquie: 'SK', slovakia: 'SK', sk: 'SK',
  slovenie: 'SI', slovenia: 'SI', si: 'SI',
  hongrie: 'HU', hungary: 'HU', hu: 'HU',
  croatie: 'HR', croatia: 'HR', hr: 'HR',
  roumanie: 'RO', romania: 'RO', ro: 'RO',
  bulgarie: 'BG', bulgaria: 'BG', bg: 'BG',
  grece: 'GR', greece: 'GR', gr: 'GR',
  estonie: 'EE', estonia: 'EE', ee: 'EE',
  lettonie: 'LV', latvia: 'LV', lv: 'LV',
  lituanie: 'LT', lithuania: 'LT', lt: 'LT',
  malte: 'MT', malta: 'MT', mt: 'MT',
  chypre: 'CY', cyprus: 'CY', cy: 'CY',
  suisse: 'CH', switzerland: 'CH', schweiz: 'CH', ch: 'CH',
  'royaume-uni': 'GB', royaumeuni: 'GB', 'united kingdom': 'GB', uk: 'GB',
  angleterre: 'GB', england: 'GB', gb: 'GB',
  norvege: 'NO', norway: 'NO', no: 'NO',
  monaco: 'MC', mc: 'MC',
  andorre: 'AD', andorra: 'AD', ad: 'AD',
};

function normalizeCountry(country: string | null | undefined): string {
  return String(country || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // retire les accents (diacritiques NFD)
    .toLowerCase()
    .replace(/\./g, '')
    .trim();
}

export function isFrance(country: string | null | undefined): boolean {
  return FRANCE_NAMES.has(normalizeCountry(country));
}

export function isEuropeCountry(country: string | null | undefined): boolean {
  return EUROPE_COUNTRIES.has(normalizeCountry(country));
}

/** Code ISO 3166-1 alpha-2 d'un pays saisi en clair. null si inconnu. */
export function isoPays(country: string | null | undefined): string | null {
  return PAYS_ISO[normalizeCountry(country)] ?? null;
}

/** Département depuis un code postal FR (Corse 20xxx → '20', DOM 97x/98x → 3 chiffres). */
export function departmentFromPostalCode(postalCode: string | null | undefined): string | null {
  const cp = String(postalCode || '').replace(/\s+/g, '');
  if (!/^\d{5}$/.test(cp)) return null;
  if (cp.startsWith('97') || cp.startsWith('98')) return cp.slice(0, 3);
  return cp.slice(0, 2);
}

/** Distance routière estimée (km) entre le dépôt et un département. null si inconnue. */
export function estimateRoadKm(
  postalCode: string | null | undefined,
  config: ShippingConfig
): number | null {
  const dep = departmentFromPostalCode(postalCode);
  if (!dep) return null;
  const coords = DEPT_COORDS[dep];
  if (!coords) return null; // Corse (20), DOM… → pas de route
  return Math.round(haversineKm(config.depot.lat, config.depot.lng, coords[0], coords[1]) * ROAD_FACTOR);
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (x: number) => (x * Math.PI) / 180;
  const R = 6371;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* ── Préfixes de codes postaux outre-mer (référentiel `zones`) ────────────────
   OM1 : Guadeloupe 971, Martinique 972, Guyane 973, La Réunion 974,
         Saint-Pierre-et-Miquelon 975, Mayotte 976. Saint-Barthélemy (97133) et
         Saint-Martin (97150) relèvent du préfixe 971 mais sont bien en OM1.
   OM2 : TAAF 984, Wallis-et-Futuna 986, Polynésie française 987,
         Nouvelle-Calédonie 988.
   980xx = MONACO : fiscalement ET tarifairement la France métropolitaine — à ne
   surtout pas confondre avec les collectivités du Pacifique (98x). */
const OM1_PREFIXES = new Set(['971', '972', '973', '974', '975', '976', '977', '978']);
const OM2_PREFIXES = new Set(['984', '986', '987', '988']);

export interface ResolutionZone {
  zone: ZoneLivraison;
  /** Code ISO du pays de destination (null pour la France). */
  iso: string | null;
  /** Code postal normalisé (sans espaces). */
  cp: string;
  /** true si la destination est Monaco (traitée comme la métropole). */
  monaco: boolean;
}

/**
 * Résout la zone tarifaire d'une destination.
 * Trois cas qui n'étaient PAS distingués en v2 et qui le sont maintenant :
 *  - `ADRESSE_REQUISE` : on ne sait pas encore où l'on livre → on n'affiche
 *    surtout pas le tarif France « par défaut » ;
 *  - `CP_INVALIDE`     : le client s'est trompé de saisie → ce n'est PAS une
 *    destination hors zone, le message doit l'inviter à corriger ;
 *  - `OM1`/`OM2`       : outre-mer, grille Colissimo dédiée.
 */
export function resoudreZone(dest: ShippingDestination | null | undefined): ResolutionZone {
  const cp = String(dest?.postal_code || '').replace(/\s+/g, '');
  const pays = dest?.country ?? null;
  const iso = isoPays(pays);

  if (!dest || (!cp && !normalizeCountry(pays))) {
    return { zone: 'ADRESSE_REQUISE', iso: null, cp: '', monaco: false };
  }

  // Monaco AVANT tout test 98x : 98000 n'est pas une collectivité du Pacifique.
  if (iso === 'MC' || /^980\d{2}$/.test(cp)) {
    return { zone: 'FR_METRO', iso: 'MC', cp, monaco: true };
  }

  if (isFrance(pays)) {
    if (!cp) return { zone: 'ADRESSE_REQUISE', iso: 'FR', cp: '', monaco: false };
    if (!/^\d{5}$/.test(cp)) return { zone: 'CP_INVALIDE', iso: 'FR', cp, monaco: false };

    const dep = cp.slice(0, 2);
    if (dep === '20') return { zone: 'FR_CORSE', iso: 'FR', cp, monaco: false };

    if (dep === '97' || dep === '98') {
      const pre = cp.slice(0, 3);
      if (OM1_PREFIXES.has(pre)) return { zone: 'OM1', iso: 'FR', cp, monaco: false };
      if (OM2_PREFIXES.has(pre)) return { zone: 'OM2', iso: 'FR', cp, monaco: false };
      // 979xx, 981xx… : aucun territoire français ne porte ce préfixe.
      return { zone: 'CP_INVALIDE', iso: 'FR', cp, monaco: false };
    }
    if (!DEPT_COORDS[dep]) return { zone: 'CP_INVALIDE', iso: 'FR', cp, monaco: false };
    return { zone: 'FR_METRO', iso: 'FR', cp, monaco: false };
  }

  if (isEuropeCountry(pays)) return { zone: 'EUROPE', iso, cp, monaco: false };
  return { zone: 'MONDE', iso, cp, monaco: false };
}

/* ── Zonage palette HISTORIQUE (v2) ────────────────────────────────────────
   Conservé tel quel : il continue d'alimenter l'identifiant `method` renvoyé
   par `computeShipping` (que des enregistrements existants référencent) et le
   barème personnalisé de l'admin. */
type PalletZoneId = keyof PalletZonePrices | 'quote';

/** Zone palette d'une destination. 'quote' = pas de tarif automatique (devis). */
export function palletZoneFor(
  dest: ShippingDestination,
  config: ShippingConfig,
  express: boolean
): PalletZoneId {
  if (!isFrance(dest.country)) {
    if (isEuropeCountry(dest.country)) return express ? 'express_eu' : 'europe';
    return 'quote';
  }
  const dep = departmentFromPostalCode(dest.postal_code);
  if (!dep) return 'quote';
  if (dep === '20' || dep.length === 3) {
    // Corse → France entière ; DOM/TOM → devis (palette maritime)
    return dep === '20' ? 'fr_far' : 'quote';
  }
  const km = estimateRoadKm(dest.postal_code, config);
  if (km === null) return 'quote';
  if (km <= config.near_km_max) return 'fr_0_200';
  if (km <= config.mid_km_max) return 'fr_200_500';
  return 'fr_far';
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. POIDS, GABARIT, ANALYSE DU PANIER
   ═══════════════════════════════════════════════════════════════════════════ */

/** Prix d'une grille par tranches. null si le poids dépasse la dernière tranche. */
function tarifTranche(grille: Grille, poidsKg: number): number | null {
  for (const [max, prix] of grille) {
    if (poidsKg <= max) return prix;
  }
  return null;
}

/**
 * Poids FACTURÉ d'une unité : le plus élevé du poids réel et du poids
 * volumétrique `(L × l × h) / 5000`. C'est la règle de tous les transporteurs
 * du référentiel (Colissimo, Chronopost, DPD, GLS) : un carton de polystyrène
 * occupe la place d'un colis lourd, il se paie comme tel.
 * REPLI : sans les trois dimensions, on facture le poids réel (cf. ShippingLine).
 */
export function poidsFactureUnitaire(ligne: ShippingLine, config: ShippingConfig): number {
  const reel =
    typeof ligne.weight_kg === 'number' && ligne.weight_kg > 0
      ? ligne.weight_kg
      : config.default_weight_kg;
  const dims = dimensionsUnitaires(ligne);
  if (!dims) return reel;
  const volumetrique = (dims[0] * dims[1] * dims[2]) / config.diviseur_volumetrique;
  return Math.max(reel, volumetrique);
}

/** [L, l, h] en cm si les trois sont exploitables, sinon null. */
function dimensionsUnitaires(ligne: ShippingLine): [number, number, number] | null {
  const l = ligne.length_cm;
  const w = ligne.width_cm;
  const h = ligne.height_cm;
  const ok = (v: unknown): v is number => typeof v === 'number' && isFinite(v) && v > 0;
  if (!ok(l) || !ok(w) || !ok(h)) return null;
  return [l, w, h];
}

/** Analyse d'un panier + d'une destination : tout ce dont les offres ont besoin. */
export interface AnalyseEnvoi {
  zone: ZoneLivraison;
  iso: string | null;
  cp: string;
  /** Distance routière estimée depuis le dépôt (km), null hors métropole. */
  km: number | null;
  /** Poids facturé total (kg), volumétrique compris. */
  poidsKg: number;
  /** Nombre d'unités déclarées « large » (palette) dans le panier. */
  unitesPalette: number;
  /** Nombre de palettes retenu pour la facturation. */
  palettes: number;
  /** true = les modes colis ne sont plus proposables (bascule automatique). */
  modePalette: boolean;
  /** Raison de la bascule, pour l'affichage. */
  motifPalette: string | null;
  /** Colissimo volumineux : L+l+h entre 150 et 200 cm, ou un côté > 100 cm. */
  horsGabaritColissimo: boolean;
  /** Au moins une unité dépasse les limites du réseau relais. */
  horsGabaritRelais: boolean;
  /** Montant HT des marchandises éligibles au franco (hors articles palettisés). */
  montantFrancoHt: number;
  /** Le panier ne contient rien d'expédiable. */
  vide: boolean;
}

/**
 * Analyse le panier : poids facturé, gabarit, bascule palette, base du franco.
 * Exportée parce que l'admin et les tests ont besoin de vérifier la bascule
 * indépendamment du prix.
 */
export function analyserEnvoi(
  lines: ShippingLine[],
  dest: ShippingDestination | null | undefined,
  config: ShippingConfig,
  opts: OptionsLivraison = {}
): AnalyseEnvoi {
  const valides = (lines || []).filter(l => l && l.quantity > 0);
  const { zone, iso, cp } = resoudreZone(dest);
  const km = zone === 'FR_METRO' && !/^980\d{2}$/.test(cp) ? estimateRoadKm(cp, config) : null;

  if (!valides.length) {
    return {
      zone, iso, cp, km,
      poidsKg: 0, unitesPalette: 0, palettes: 0,
      modePalette: false, motifPalette: null,
      horsGabaritColissimo: false, horsGabaritRelais: false,
      montantFrancoHt: 0, vide: true,
    };
  }

  let poidsKg = 0;
  let unitesPalette = 0;
  let horsGabaritColissimo = false;
  let horsGabaritRelais = false;
  let refusColis = false;
  let montantFrancoHt = 0;

  for (const l of valides) {
    const estPalette = l.shipping_class === 'large';
    if (estPalette) unitesPalette += l.quantity;

    poidsKg += poidsFactureUnitaire(l, config) * l.quantity;

    // Le franco ne porte QUE sur les articles non palettisés : offrir le port
    // d'une machine lourde livrée chez un particulier coûte 120 à 200 € HT.
    if (!estPalette && typeof l.unit_price_ht === 'number' && l.unit_price_ht > 0) {
      montantFrancoHt += l.unit_price_ht * l.quantity;
    }

    const dims = dimensionsUnitaires(l);
    if (dims) {
      const somme = dims[0] + dims[1] + dims[2];
      const cote = Math.max(dims[0], dims[1], dims[2]);
      if (somme > COLISSIMO_SOMME_REFUS_CM || cote > COLIS_COTE_REFUS_CM) refusColis = true;
      else if (somme > COLISSIMO_SOMME_MAX_CM || cote > COLISSIMO_COTE_MAX_CM) horsGabaritColissimo = true;
      if (somme > RELAIS_SOMME_MAX_CM || cote > RELAIS_COTE_MAX_CM) horsGabaritRelais = true;
    }
  }

  poidsKg = round2(poidsKg);
  if (typeof opts.montant_ht === 'number' && opts.montant_ht > 0 && montantFrancoHt === 0) {
    montantFrancoHt = opts.montant_ht;
  }

  /* ── BASCULE AUTOMATIQUE EN PALETTE ────────────────────────────────────
     Trois déclencheurs, dans cet ordre de lisibilité pour le client. */
  let motifPalette: string | null = null;
  if (unitesPalette > 0) {
    motifPalette = 'Article encombrant : expédition sur palette.';
  } else if (poidsKg > COLIS_POIDS_MAX_KG) {
    motifPalette = `Poids total de ${formatKg(poidsKg)} : au-delà de ${COLIS_POIDS_MAX_KG} kg, l'expédition passe sur palette.`;
  } else if (refusColis) {
    motifPalette = 'Colis hors gabarit (dimensions au-delà des limites transporteur) : expédition sur palette.';
  }
  const modePalette = motifPalette !== null;

  // Une palette 80×120 supporte 500 kg en messagerie standard : au-delà on en
  // compte une de plus. Les unités « large » comptent chacune pour une palette.
  const palettes = modePalette
    ? Math.max(unitesPalette, Math.ceil(poidsKg / PALETTE_POIDS_MAX_KG), 1)
    : 0;

  return {
    zone, iso, cp, km,
    poidsKg, unitesPalette, palettes,
    modePalette, motifPalette,
    horsGabaritColissimo, horsGabaritRelais,
    montantFrancoHt, vide: false,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   6. CONSTRUCTION DES OFFRES
   ═══════════════════════════════════════════════════════════════════════════ */

function offreHt(o: {
  service: string;
  carrier: Transporteur;
  mode: ModeLivraison;
  libelle: string;
  ht: number;
  delai: [number, number];
  relais_requis?: boolean;
  motif?: string;
}): OffreLivraison {
  return {
    service: o.service,
    carrier: o.carrier,
    mode: o.mode,
    libelle: o.libelle,
    prix_ht: round2(o.ht),
    prix_ttc: round2(o.ht * (1 + TVA_FR)),
    delai_min_j: o.delai[0],
    delai_max_j: o.delai[1],
    sur_devis: false,
    relais_requis: o.relais_requis === true,
    ...(o.motif ? { motif: o.motif } : {}),
  };
}

function offreDevis(
  service: string,
  carrier: Transporteur,
  mode: ModeLivraison,
  libelle: string,
  motif: string
): OffreLivraison {
  return {
    service,
    carrier,
    mode,
    libelle,
    prix_ht: 0,
    prix_ttc: 0,
    delai_min_j: 0,
    delai_max_j: 0,
    sur_devis: true,
    motif,
    relais_requis: false,
  };
}

/** Une grille publiée TTC ramenée en HT (la TVA est récupérable par OMEGA). */
function htDepuisTtc(ttc: number): number {
  return ttc / (1 + TVA_FR);
}

/* ── DOMICILE ─────────────────────────────────────────────────────────────── */
function offreDomicile(a: AnalyseEnvoi, config: ShippingConfig): OffreLivraison | null {
  const sup = config.supplements_palette;
  const horsGabarit = a.horsGabaritColissimo ? sup.hors_gabarit_colissimo_ht : 0;

  switch (a.zone) {
    case 'FR_METRO':
    case 'FR_CORSE': {
      // Barème personnalisé admin (comportement v2) si explicitement demandé.
      if (config.utiliser_bareme_personnalise) {
        const ttc = parcelPriceForWeight(a.poidsKg, config);
        const ht = htDepuisTtc(ttc) + horsGabarit;
        return offreHt({
          service: 'colissimo_domicile', carrier: 'colissimo', mode: 'domicile',
          libelle: 'Livraison à domicile', ht, delai: [1, 2],
        });
      }
      const grille = config.signature_domicile
        ? COLISSIMO_FR_AVEC_SIGNATURE
        : COLISSIMO_FR_SANS_SIGNATURE;
      const base = tarifTranche(grille, a.poidsKg);
      if (base === null) return null; // > 30 kg : la bascule palette a déjà eu lieu
      /* ⚠ CORSE — pas de supplément sur les offres COLIS.
         Le montant de 20,14 € HT du référentiel est une référence DPD. La Poste, elle,
         n'applique AUCUN supplément Corse sur Colissimo : la Corse est desservie au
         tarif métropole. L'ajouter ici surfacturait de +169 % un colis de 5 kg
         (38,45 € au lieu de 14,28 €) — donc une vente perdue sur un surcoût qui
         n'existe pas. Le supplément reste appliqué à la MESSAGERIE PALETTE, où
         l'affréteur facture réellement la traversée. */
      const corse = 0;
      return offreHt({
        service: 'colissimo_domicile',
        carrier: 'colissimo',
        mode: 'domicile',
        libelle:
          'Colissimo Domicile' +
          (config.signature_domicile ? ' (remise contre signature)' : '') +
          (a.zone === 'FR_CORSE' ? ' — Corse' : ''),
        ht: base + corse + horsGabarit,
        delai: [1, 2],
      });
    }

    case 'OM1':
    case 'OM2': {
      /* ⚠ LE BUG DE L'AUDIT : cette branche n'existait pas. Un 5 kg vers La
         Réunion partait à 7,99 € au lieu de 38,90 €, un 15 kg à 7,99 € au lieu
         de 130,20 €. Le tarif métropole ne doit JAMAIS s'appliquer à un 97xxx. */
      const economique = config.service_outre_mer === 'economique' && a.zone === 'OM1';
      const grille = economique
        ? COLISSIMO_OM1_ECONOMIQUE
        : a.zone === 'OM1'
          ? COLISSIMO_OM1_PRIORITAIRE
          : COLISSIMO_OM2_PRIORITAIRE;
      const base = tarifTranche(grille, a.poidsKg);
      if (base === null) return null;
      return offreHt({
        service: economique ? 'colissimo_om_economique' : 'colissimo_om_prioritaire',
        carrier: 'colissimo',
        mode: 'domicile',
        libelle: economique
          ? 'Colissimo Outre-Mer économique (voie maritime)'
          : `Colissimo Outre-Mer prioritaire (${a.zone})`,
        ht: htDepuisTtc(base) + horsGabarit,
        delai: economique ? [13, 31] : [6, 18],
      });
    }

    case 'EUROPE': {
      if (config.utiliser_bareme_personnalise) {
        const ttc = parcelPriceForWeight(a.poidsKg, config) + config.parcel_europe_surcharge;
        return offreHt({
          service: 'colissimo_international', carrier: 'colissimo', mode: 'domicile',
          libelle: 'Livraison à domicile — Europe', ht: htDepuisTtc(ttc) + horsGabarit,
          delai: [3, 8],
        });
      }
      const iso = a.iso ?? '';
      const entreprise = COLISSIMO_INTL_ENTREPRISE[iso];
      if (entreprise) {
        const base = tarifTranche(entreprise, a.poidsKg);
        if (base === null) return null;
        return offreHt({
          service: 'colissimo_international', carrier: 'colissimo', mode: 'domicile',
          libelle: `Colissimo International — ${iso}`, ht: base + horsGabarit, delai: [3, 8],
        });
      }
      const publique =
        iso === 'GB' ? COLISSIMO_INTL_GB_PUBLIC
        : iso === 'NO' ? COLISSIMO_INTL_MONDE_B_PUBLIC
        : PAYS_COLISSIMO_UE_PUBLIC.has(iso) ? COLISSIMO_INTL_UE_PUBLIC
        : null;
      if (!publique) {
        // Andorre et assimilés : aucune grille publiée → on ne devine pas.
        return offreDevis(
          'devis_transport', 'colissimo', 'domicile', 'Livraison à domicile',
          "Aucune grille tarifaire publiée pour ce pays : demandez-nous un devis de transport."
        );
      }
      const base = tarifTranche(publique, a.poidsKg);
      if (base === null) return null;
      return offreHt({
        service: 'colissimo_international', carrier: 'colissimo', mode: 'domicile',
        libelle: `Colissimo International — ${iso}`,
        ht: htDepuisTtc(base) + horsGabarit,
        delai: [3, 8],
      });
    }

    default:
      return null;
  }
}

/* ── EXPRESS ──────────────────────────────────────────────────────────────── */
function offreExpress(a: AnalyseEnvoi, config: ShippingConfig): OffreLivraison | null {
  // Les grilles Chronopost du référentiel sont métropole uniquement. On ne
  // propose pas d'express ailleurs plutôt que d'extrapoler un tarif.
  if (a.zone !== 'FR_METRO') return null;
  const chrono13 = config.service_express === 'chrono13';
  const base = tarifTranche(chrono13 ? CHRONO13_FR : CHRONO18_FR, a.poidsKg);
  if (base === null) return null;
  return offreHt({
    service: chrono13 ? 'chronopost_chrono13' : 'chronopost_chrono18',
    carrier: 'chronopost',
    mode: 'express',
    libelle: chrono13 ? 'Chronopost Chrono 13 — J+1 avant 13 h' : 'Chronopost Chrono 18 — J+1 avant 18 h',
    ht: base,
    delai: [1, 1],
  });
}

/* ── POINT RELAIS ─────────────────────────────────────────────────────────── */
function offreRelais(a: AnalyseEnvoi, config: ShippingConfig): OffreLivraison | null {
  if (a.horsGabaritRelais) return null; // L+l+h > 150 cm ou côté > 120 cm

  if (a.zone === 'FR_METRO' || a.zone === 'FR_CORSE') {
    // Voir la note du mode domicile : aucun supplément Corse sur les offres colis.
    const corse = 0;
    if (config.service_relais === 'colissimo_point_retrait') {
      const base = tarifTranche(COLISSIMO_RELAIS_FR, a.poidsKg);
      if (base === null) return null;
      return offreHt({
        service: 'colissimo_point_retrait', carrier: 'colissimo', mode: 'relais',
        libelle: 'Colissimo Point de Retrait', ht: base + corse, delai: [1, 2],
        relais_requis: true,
      });
    }
    if (a.poidsKg > RELAIS_POIDS_MAX_KG) return null;
    const base = tarifTranche(MONDIAL_RELAY_FR, a.poidsKg);
    if (base === null) return null;
    return offreHt({
      service: 'mondial_relay_point_relais', carrier: 'mondial_relay', mode: 'relais',
      libelle: 'Mondial Relay — Point Relais', ht: htDepuisTtc(base) + corse, delai: [3, 5],
      relais_requis: true,
    });
  }

  if (a.zone === 'EUROPE') {
    const grille = MONDIAL_RELAY_EU[a.iso ?? ''];
    if (!grille || a.poidsKg > RELAIS_POIDS_MAX_KG) return null;
    const base = tarifTranche(grille, a.poidsKg);
    if (base === null) return null;
    return offreHt({
      service: 'mondial_relay_point_relais_eu', carrier: 'mondial_relay', mode: 'relais',
      libelle: `Mondial Relay — Point Relais ${a.iso}`, ht: htDepuisTtc(base), delai: [3, 5],
      relais_requis: true,
    });
  }

  return null; // Outre-mer : aucun réseau relais dans le référentiel.
}

/* ── PALETTE ──────────────────────────────────────────────────────────────── */
function offrePalette(
  a: AnalyseEnvoi,
  config: ShippingConfig,
  opts: OptionsLivraison
): OffreLivraison | null {
  const palettes = Math.max(a.palettes, 1);
  const sup = config.supplements_palette;

  /* Suppléments HT. Par défaut on retient l'hypothèse la PLUS COÛTEUSE
     (destinataire particulier, sans quai ni chariot : hayon + RDV + B2C),
     parce que la faute constatée à l'audit est toujours la même — sous-tarifer.
     Le back-office bascule en `destinataire: 'entreprise'` quand la livraison
     se fait sur un site équipé. */
  const particulier = opts.destinataire !== 'entreprise';
  let supplements = 0;
  if (particulier) supplements += sup.hayon_ht + sup.rdv_ht + sup.particulier_ht;
  if (opts.zone_difficile) supplements += sup.zone_difficile_ht;

  const finaliser = (
    baseUnitaireHt: number,
    delai: [number, number],
    libelle: string,
    extra = 0
  ): OffreLivraison => {
    const transportHt = baseUnitaireHt * palettes * indiceDegressivite(palettes);
    // La surcharge carburant porte sur le prix de TRANSPORT HT, hors autres
    // suppléments (référentiel `supplements.surcharge_carburant.base`) : le
    // supplément Corse/îles et le hayon n'en font donc pas partie.
    const carburant = transportHt * (sup.surcharge_carburant_pct / 100);
    return offreHt({
      service: 'messagerie_palette',
      carrier: 'messagerie',
      mode: 'palette',
      libelle: libelle + (palettes > 1 ? ` × ${palettes}` : ''),
      ht: transportHt + carburant + supplements + extra,
      delai,
    });
  };

  if (config.utiliser_bareme_personnalise) {
    const legacy = zonePaletteHistorique(a, config, !!opts.express);
    if (!legacy) {
      return offreDevis('devis_transport', 'messagerie', 'palette', 'Livraison sur palette',
        'Destination hors zones automatiques : demandez-nous un devis de transport.');
    }
    const ht = htDepuisTtc(config.pallet_zones[legacy]) * palettes;
    return offreHt({
      service: 'messagerie_palette', carrier: 'messagerie', mode: 'palette',
      libelle: 'Livraison sur palette' + (palettes > 1 ? ` × ${palettes}` : ''),
      ht: ht + supplements, delai: [2, 3],
    });
  }

  const poidsParPalette = a.poidsKg / palettes;

  switch (a.zone) {
    case 'FR_METRO': {
      const regional = a.km !== null && a.km <= config.near_km_max;
      const grille = regional ? PALETTE_FR_REGIONAL : PALETTE_FR_NATIONAL;
      const base = tarifTranche(grille, poidsParPalette);
      if (base === null) {
        return offreDevis('devis_transport', 'messagerie', 'palette', 'Livraison sur palette',
          `Envoi de ${formatKg(a.poidsKg)} : au-delà des grilles de groupage, un devis d'affrètement est nécessaire.`);
      }
      return finaliser(
        base,
        regional ? [1, 2] : [2, 3],
        regional ? 'Messagerie palettisée — régional' : 'Messagerie palettisée — France'
      );
    }

    case 'FR_CORSE': {
      // Corse : grille nationale (le référentiel classe « Corse via ferry » dans
      // la sous-zone > 800 km) + supplément Corse/îles. Jamais le tarif nu.
      const base = tarifTranche(PALETTE_FR_NATIONAL, poidsParPalette);
      if (base === null) {
        return offreDevis('devis_transport', 'messagerie', 'palette', 'Livraison sur palette',
          `Envoi de ${formatKg(a.poidsKg)} vers la Corse : devis d'affrètement nécessaire.`);
      }
      return finaliser(base, [2, 3], 'Messagerie palettisée — Corse', sup.corse_iles_ht * palettes);
    }

    case 'EUROPE': {
      if (opts.express) {
        if (poidsParPalette > PALETTE_EUROPE_EXPRESS_POIDS_MAX_KG) break;
        return finaliser(PALETTE_EUROPE_EXPRESS_HT, [1, 2], 'Palette express Europe (24-48 h)');
      }
      const eu = PALETTE_EUROPE[a.iso ?? ''];
      if (!eu || poidsParPalette > eu.poids_max_kg) break;
      return finaliser(eu.prix_ht, eu.delai, `Groupage palette — ${a.iso}`);
    }

    default:
      break;
  }

  const motif =
    a.zone === 'OM1' || a.zone === 'OM2'
      ? "Palette vers l'outre-mer : transport maritime, devis obligatoire."
      : a.zone === 'EUROPE'
        ? `Palette vers ${a.iso ?? "l'étranger"} : aucune grille de groupage publiée pour cette destination ou ce poids, un devis d'affrètement est nécessaire.`
        : 'Destination hors zones automatiques : demandez-nous un devis de transport.';
  return offreDevis('devis_transport', 'messagerie', 'palette', 'Livraison sur palette', motif);
}

/** Indice de dégressivité multi-palettes, par palier (jamais interpolé). */
function indiceDegressivite(palettes: number): number {
  let indice = 1;
  for (const [seuil, valeur] of DEGRESSIVITE_PALETTES) {
    if (palettes >= seuil) indice = valeur;
  }
  return indice;
}

/* ── RETRAIT AU DÉPÔT ─────────────────────────────────────────────────────── */
function offreRetrait(config: ShippingConfig): OffreLivraison | null {
  if (!config.retrait_actif) return null;
  return offreHt({
    service: 'retrait_depot',
    carrier: 'retrait',
    mode: 'retrait',
    libelle: `Retrait au dépôt — ${config.depot.label}`,
    ht: 0,
    delai: [config.retrait_delai_j, config.retrait_delai_j],
    motif: 'Gratuit. Vous êtes prévenu par e-mail dès que la commande est prête.',
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   7. PLANCHER DE PRIX ET FRANCO DE PORT
   ═══════════════════════════════════════════════════════════════════════════ */

/** Modes concernés par le plancher : les trois modes COLIS, et eux seuls.
    `palette` a ses propres suppléments, `retrait` doit rester à 0 €. */
const MODES_PLANCHER: readonly ModeLivraison[] = ['domicile', 'express', 'relais'];

/** Zones concernées : la métropole et la Corse, où la grille est homogène. */
const ZONES_PLANCHER: readonly ZoneLivraison[] = ['FR_METRO', 'FR_CORSE'];

/**
 * Relève au plancher les offres colis métropole trop bon marché.
 *
 * Le prix est fixé **en TTC** parce que c'est un prix AFFICHÉ : le client doit
 * lire 12,99 €, pas 13,00 €. Le moteur raisonne en HT et dérive le TTC, or
 * 12,99 € TTC n'a pas d'équivalent HT exact à 2 décimales au taux de 20 %
 * (10,82 € → 12,98 € ; 10,83 € → 13,00 €). On écrit donc les DEUX montants
 * explicitement — `prix_ttc` exactement au plancher, `prix_ht` arrondi au
 * centime supérieur (10,83 €) pour que le centime résiduel reste du côté
 * d'OMEGA et non du sien.
 *
 * S'applique AVANT le franco : une commande au-dessus du seuil reste offerte,
 * le plancher ne la ressuscite pas.
 */
function appliquerPlancher(
  offres: OffreLivraison[],
  a: AnalyseEnvoi,
  config: ShippingConfig
): OffreLivraison[] {
  const plancher = config.plancher_colis_metropole_ttc;
  if (plancher === null || plancher <= 0) return offres;
  if (!ZONES_PLANCHER.includes(a.zone)) return offres;

  const prix_ttc = round2(plancher);
  const prix_ht = round2(prix_ttc / (1 + TVA_FR));

  return offres.map(o => {
    if (o.sur_devis || !MODES_PLANCHER.includes(o.mode)) return o;
    if (o.prix_ttc >= prix_ttc) return o;
    return { ...o, prix_ht, prix_ttc };
  });
}

/** Seuil de franco applicable à la zone, ou null si aucun. */
export function seuilFranco(zone: ZoneLivraison, config: ShippingConfig): number | null {
  switch (zone) {
    case 'FR_METRO': return config.franco.metropole;
    case 'FR_CORSE': return config.franco.corse_iles;
    case 'EUROPE': return config.franco.ue;
    case 'OM1':
    case 'OM2': return config.franco.outre_mer;
    default: return null;
  }
}

function appliquerFranco(
  offres: OffreLivraison[],
  a: AnalyseEnvoi,
  config: ShippingConfig
): OffreLivraison[] {
  // Un envoi palettisé n'est JAMAIS franco : le port y coûte 120 à 200 € HT,
  // l'offrir efface la marge de la commande entière.
  if (a.modePalette) return offres;
  const seuil = seuilFranco(a.zone, config);
  if (seuil === null || a.montantFrancoHt < seuil) return offres;

  return offres.map(o => {
    if (o.sur_devis || o.prix_ht === 0) return o;
    if (!config.franco_modes.includes(o.mode)) return o;
    return {
      ...o,
      prix_ht: 0,
      prix_ttc: 0,
      motif: `Livraison offerte à partir de ${formatEuro(seuil)} HT d'achat.`,
    };
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   8. API PUBLIQUE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Liste les offres de livraison proposables pour un panier + une destination.
 *
 * Une offre `sur_devis: true` est une offre BLOQUÉE : elle porte le motif exact
 * (adresse manquante, code postal invalide, destination hors zone) au lieu du
 * message générique « DOM-TOM / hors Europe » que la v2 affichait à tort dès
 * qu'un code postal était mal saisi.
 *
 * @param lines  lignes du panier (gabarit, poids, dimensions, quantité, prix HT)
 * @param dest   destination — null tant que le client n'a pas choisi d'adresse
 * @param config barèmes et réglages (Admin → Paramètres → Livraison)
 * @param opts   express, nature du destinataire, zone difficile, montant HT
 */
export function listerOffresLivraison(
  lines: ShippingLine[],
  dest: ShippingDestination | null | undefined,
  config: ShippingConfig,
  opts: OptionsLivraison = {}
): OffreLivraison[] {
  const a = analyserEnvoi(lines, dest, config, opts);
  if (a.vide) return [];

  const retrait = offreRetrait(config);
  const modeBloque: ModeLivraison = a.modePalette ? 'palette' : 'domicile';
  const carrierBloque: Transporteur = a.modePalette ? 'messagerie' : 'colissimo';

  if (a.zone === 'ADRESSE_REQUISE') {
    return [
      offreDevis('adresse_requise', carrierBloque, modeBloque, 'Livraison',
        'Adresse de livraison requise : indiquez votre code postal et votre pays pour connaître les offres.'),
      ...(retrait ? [retrait] : []),
    ];
  }
  if (a.zone === 'CP_INVALIDE') {
    // ⚠ Distinct de « hors zone » : le client doit CORRIGER, pas demander un devis.
    return [
      offreDevis('cp_invalide', carrierBloque, modeBloque, 'Livraison',
        'Code postal invalide, vérifiez votre saisie.'),
      ...(retrait ? [retrait] : []),
    ];
  }

  const offres: OffreLivraison[] = [];

  if (a.modePalette) {
    const palette = offrePalette(a, config, opts);
    if (palette) offres.push(palette);
  } else {
    const domicile = offreDomicile(a, config);
    if (domicile) offres.push(domicile);
    const express = offreExpress(a, config);
    if (express) offres.push(express);
    const relais = offreRelais(a, config);
    if (relais) offres.push(relais);
    // Aucun mode colis chiffrable (destination monde, pays sans grille…).
    if (!offres.length) {
      offres.push(
        offreDevis('devis_transport', 'colissimo', 'domicile', 'Livraison',
          'Destination hors zones automatiques (outre-mer lointain / hors Europe) : demandez-nous un devis de transport.')
      );
    }
  }

  if (retrait) offres.push(retrait);
  // Ordre imposé : le plancher relève d'abord les petits colis, le franco peut
  // ensuite tout ramener à zéro. L'inverse rendrait payantes des livraisons
  // annoncées offertes.
  return appliquerFranco(appliquerPlancher(offres, a, config), a, config);
}

/* Correspondance entre les zones v3 et le zonage palette HISTORIQUE (v2).
   Sert à deux choses : l'identifiant `method` renvoyé par `computeShipping`
   (que des commandes déjà enregistrées référencent) et le barème personnalisé
   de l'admin, qui reste indexé sur ces cinq zones. */
function zonePaletteHistorique(
  a: AnalyseEnvoi,
  config: ShippingConfig,
  express: boolean
): keyof PalletZonePrices | null {
  switch (a.zone) {
    case 'EUROPE': return express ? 'express_eu' : 'europe';
    case 'FR_CORSE': return 'fr_far';
    case 'FR_METRO': {
      const km = a.km;
      if (km === null) return 'fr_far'; // Monaco et départements sans coordonnées
      if (km <= config.near_km_max) return 'fr_0_200';
      if (km <= config.mid_km_max) return 'fr_200_500';
      return 'fr_far';
    }
    default: return null; // outre-mer, monde : pas de tarif automatique
  }
}

function methodHistorique(a: AnalyseEnvoi, config: ShippingConfig, express: boolean): string {
  if (!a.modePalette) return 'parcel';
  return 'pallet_' + (zonePaletteHistorique(a, config, express) ?? 'fr_far');
}

/**
 * Devis de livraison pour un panier — API HISTORIQUE, inchangée.
 *
 * Renvoie l'offre LA MOINS CHÈRE du mode par défaut (`domicile`, ou `palette`
 * si la bascule automatique s'applique). `cost` reste exprimé en € TTC :
 * `devis-commande` le divise par 1,2 pour obtenir le HT, on ne touche pas à
 * ce contrat.
 *
 * @param lines   lignes du panier (gabarit + poids + quantité)
 * @param dest    destination (code postal + pays) — null si pas encore choisie
 * @param config  barèmes (Admin → Paramètres → Livraison)
 * @param opts.express  le client a choisi l'option Express Europe
 */
export function computeShipping(
  lines: ShippingLine[],
  dest: ShippingDestination | null,
  config: ShippingConfig,
  opts: OptionsLivraison = {}
): ShippingQuote {
  const base: ShippingQuote = {
    method: null,
    label: '',
    cost: 0,
    needsAddress: false,
    needsQuote: false,
    expressAvailable: false,
    palletUnits: 0,
    parcelWeightKg: 0,
  };

  const a = analyserEnvoi(lines, dest, config, opts);
  if (a.vide) return base;

  const offres = listerOffresLivraison(lines, dest, config, opts);
  const commun = {
    palletUnits: a.unitesPalette,
    parcelWeightKg: a.poidsKg,
    zone: a.zone,
    offres,
    // Option Express Europe : proposable pour une palette vers un pays couvert.
    expressAvailable: a.modePalette && a.zone === 'EUROPE' && !!PALETTE_EUROPE[a.iso ?? ''],
  };

  const bloquee = offres.find(o => o.sur_devis && o.mode !== 'retrait');
  if (bloquee) {
    // Adresse manquante ou code postal invalide = saisie à corriger, PAS une
    // destination hors zone : `needsQuote` reste false pour ne pas déclencher
    // le message « destination hors zones automatiques ».
    const aCorriger = bloquee.service === 'adresse_requise' || bloquee.service === 'cp_invalide';
    return {
      ...base,
      ...commun,
      cost: null,
      label: bloquee.motif ?? bloquee.libelle,
      motif: bloquee.motif,
      needsAddress: aCorriger,
      needsQuote: !aCorriger,
    };
  }

  const modeDefaut: ModeLivraison = a.modePalette ? 'palette' : config.mode_par_defaut;
  const candidates = offres.filter(o => o.mode === modeDefaut && !o.sur_devis);
  const retenue =
    candidates.slice().sort((x, y) => x.prix_ttc - y.prix_ttc)[0] ??
    offres.filter(o => !o.sur_devis && o.mode !== 'retrait').sort((x, y) => x.prix_ttc - y.prix_ttc)[0];

  if (!retenue) {
    return {
      ...base,
      ...commun,
      cost: null,
      label: 'Aucune offre de livraison disponible pour cette destination.',
      motif: 'Aucune offre de livraison disponible pour cette destination.',
      needsQuote: true,
    };
  }

  return {
    ...base,
    ...commun,
    method: methodHistorique(a, config, !!opts.express),
    label:
      retenue.libelle +
      (a.modePalette
        ? a.poidsKg > 0 ? ` — ${formatKg(a.poidsKg)}` : ''
        : ` — ${formatKg(a.poidsKg)}`),
    cost: retenue.prix_ttc,
    offre: retenue,
    motif: retenue.motif ?? a.motifPalette ?? undefined,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   9. UTILITAIRES
   ═══════════════════════════════════════════════════════════════════════════ */

/** Prix colis pour un poids donné, d'après le barème PERSONNALISÉ de l'admin. */
export function parcelPriceForWeight(weightKg: number, config: ShippingConfig): number {
  for (const b of config.parcel_brackets) {
    if (weightKg <= b.max_kg) return b.price;
  }
  return config.parcel_over_price;
}

function formatKg(kg: number): string {
  return (kg % 1 === 0 ? kg.toFixed(0) : kg.toFixed(1)) + ' kg';
}

function formatEuro(montant: number): string {
  return montant.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
