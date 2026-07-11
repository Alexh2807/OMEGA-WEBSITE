/**
 * Moteur de calcul des frais de livraison OMEGA (v2).
 *
 * Chaque produit porte :
 *  - un GABARIT (`shipping_class`) :
 *      'small' = COLIS classique  → tarifé au POIDS TOTAL (barème par tranches) ;
 *      'large' = PALETTE / encombrant (machine, bidon volumineux même léger)
 *                → tarifé PAR UNITÉ selon la ZONE de destination ;
 *  - un POIDS unitaire (`weight_kg`) utilisé pour le barème colis.
 *
 * Zones palette (détectées automatiquement, sans API externe) :
 *  - France 0–200 km / 200–500 km / entière : distance ROUTIÈRE estimée
 *    depuis le dépôt (Montblanc, 34290) = haversine(dépôt → département du
 *    code postal) × facteur routier 1,25. Corse → « France entière ».
 *  - Europe (UE + Royaume-Uni, Suisse, Norvège) : selon le pays de l'adresse ;
 *    l'option EXPRESS Europe est proposée au choix du client.
 *  - DOM-TOM / hors Europe : pas de tarif automatique → DEVIS.
 *
 * Les colis voyagent SANS SURCOÛT avec une palette. Barèmes et tranches
 * entièrement réglables dans Admin → Paramètres → Livraison
 * (persistés dans site_settings, clé `shipping_config`).
 */

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

export interface ShippingConfig {
  /** Barème colis : tranches de poids croissantes (kg → € TTC) */
  parcel_brackets: ParcelBracket[];
  /** Prix colis au-delà de la dernière tranche (€ TTC) */
  parcel_over_price: number;
  /** Surcoût colis vers l'Europe (€ TTC, ajouté au barème) */
  parcel_europe_surcharge: number;
  /** Poids retenu pour un produit sans poids renseigné (kg) */
  default_weight_kg: number;
  /** Prix palette PAR UNITÉ selon la zone (€ TTC) */
  pallet_zones: PalletZonePrices;
  /** Seuils des zones France (km routiers estimés) */
  near_km_max: number;
  mid_km_max: number;
  /** Point de départ des expéditions (dépôt) */
  depot: { lat: number; lng: number; label: string };
  /** Délai d'expédition annoncé (jours) */
  delay_days: number;
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
  };
}

export type ShippingClass = 'small' | 'large';

export interface ShippingLine {
  shipping_class?: string | null;
  /** Poids unitaire en kg (null/absent → default_weight_kg de la config) */
  weight_kg?: number | null;
  quantity: number;
}

export interface ShippingDestination {
  postal_code?: string | null;
  country?: string | null;
}

export interface ShippingQuote {
  /** 'parcel' | 'pallet_fr_0_200' | 'pallet_fr_200_500' | 'pallet_fr_far' | 'pallet_europe' | 'pallet_express_eu' | null */
  method: string | null;
  /** Libellé lisible pour le client */
  label: string;
  /** Montant € TTC — null si adresse requise ou devis nécessaire */
  cost: number | null;
  /** true si le calcul attend l'adresse de livraison */
  needsAddress: boolean;
  /** true si la destination n'a pas de tarif automatique (DOM/hors Europe) → devis */
  needsQuote: boolean;
  /** true si l'option Express Europe peut être proposée pour cette destination */
  expressAvailable: boolean;
  /** Nombre d'unités « palette » dans le panier */
  palletUnits: number;
  /** Poids total des articles colis (kg) */
  parcelWeightKg: number;
}

/* ────────────────────────────────────────────────────────────────────
   Géographie France : centre approximatif (préfecture) par département.
   Précision ±20 km — largement suffisante pour des zones de 200/500 km.
   ──────────────────────────────────────────────────────────────────── */
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

const ZONE_LABELS: Record<keyof PalletZonePrices, string> = {
  fr_0_200: 'Palette — France zone proche',
  fr_200_500: 'Palette — France 200 à 500 km',
  fr_far: 'Palette — France entière',
  europe: 'Palette — Europe',
  express_eu: 'Palette — Express Europe',
};

/** Prix colis pour un poids donné, d'après le barème. */
export function parcelPriceForWeight(weightKg: number, config: ShippingConfig): number {
  for (const b of config.parcel_brackets) {
    if (weightKg <= b.max_kg) return b.price;
  }
  return config.parcel_over_price;
}

/**
 * Devis de livraison pour un panier.
 * @param lines   lignes du panier (gabarit + poids + quantité)
 * @param dest    destination (code postal + pays) — null si pas encore choisie
 * @param config  barèmes (Admin → Paramètres → Livraison)
 * @param opts.express  le client a choisi l'option Express Europe
 */
export function computeShipping(
  lines: ShippingLine[],
  dest: ShippingDestination | null,
  config: ShippingConfig,
  opts: { express?: boolean } = {}
): ShippingQuote {
  const valid = lines.filter(l => l && l.quantity > 0);
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
  if (!valid.length) return base;

  const palletUnits = valid
    .filter(l => l.shipping_class === 'large')
    .reduce((sum, l) => sum + l.quantity, 0);

  const parcelWeightKg = round2(
    valid
      .filter(l => l.shipping_class !== 'large')
      .reduce((sum, l) => {
        const w =
          typeof l.weight_kg === 'number' && l.weight_kg > 0
            ? l.weight_kg
            : config.default_weight_kg;
        return sum + w * l.quantity;
      }, 0)
  );

  const country = dest?.country ?? 'France';
  const inFrance = isFrance(country);
  const inEurope = !inFrance && isEuropeCountry(country);

  /* ── Panier 100 % colis : barème au poids ─────────────────────────── */
  if (palletUnits === 0) {
    if (dest && !inFrance && !inEurope) {
      return {
        ...base,
        parcelWeightKg,
        needsQuote: true,
        label: 'Destination hors zone — devis nécessaire',
        cost: null,
      };
    }
    const surcharge = dest && inEurope ? config.parcel_europe_surcharge : 0;
    const price = round2(parcelPriceForWeight(parcelWeightKg, config) + surcharge);
    return {
      ...base,
      method: 'parcel',
      label:
        `Colis ${formatKg(parcelWeightKg)}` +
        (dest && inEurope ? ' — Europe' : ''),
      cost: price,
      parcelWeightKg,
    };
  }

  /* ── Au moins une palette : zone requise → adresse obligatoire ────── */
  if (!dest || (!dest.postal_code && isFrance(dest.country))) {
    return {
      ...base,
      label: 'Livraison palette (encombrant)',
      cost: null,
      needsAddress: true,
      palletUnits,
      parcelWeightKg,
    };
  }

  const zone = palletZoneFor(dest, config, !!opts.express);
  if (zone === 'quote') {
    return {
      ...base,
      label: 'Destination hors zone — devis nécessaire',
      cost: null,
      needsQuote: true,
      palletUnits,
      parcelWeightKg,
    };
  }

  const unitPrice = config.pallet_zones[zone];
  return {
    ...base,
    method: 'pallet_' + zone,
    label:
      ZONE_LABELS[zone] +
      (palletUnits > 1 ? ` × ${palletUnits}` : '') +
      (parcelWeightKg > 0 ? ' (colis inclus)' : ''),
    cost: round2(unitPrice * palletUnits),
    expressAvailable: inEurope,
    palletUnits,
    parcelWeightKg,
  };
}

function formatKg(kg: number): string {
  return (kg % 1 === 0 ? kg.toFixed(0) : kg.toFixed(1)) + ' kg';
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
