/**
 * Calcul des frais de livraison OMEGA.
 *
 * Modèle : chaque produit porte un GABARIT d'expédition (`shipping_class`) :
 *  - 'small' : petit colis (transporteur classique) — FORFAIT par commande ;
 *  - 'large' : gros produit (machine, livraison spécialisée) — tarif PAR UNITÉ,
 *    selon la distance : « proche » (départements limitrophes du dépôt de
 *    Montblanc, 34) ou « éloigné » (> ~100 km).
 * Les petits articles voyagent avec les gros sans surcoût quand la commande
 * contient au moins un gros produit.
 *
 * Les tarifs sont configurables dans Admin → Paramètres → Livraison
 * (persistés dans site_settings, clé `shipping_config`).
 */

export interface ShippingConfig {
  /** Forfait petits colis (€ TTC) — défaut 7,99 € */
  small_flat: number;
  /** Gros produit, zone proche (≤ ~100 km) — € TTC par unité — défaut 129 € */
  large_near: number;
  /** Gros produit, zone éloignée (> ~100 km) — € TTC par unité — défaut 259 € */
  large_far: number;
  /** Départements considérés « proches » du dépôt (34290 Montblanc) */
  near_departments: string[];
  /** Délai d'expédition annoncé (jours) */
  delay_days: number;
}

export const DEFAULT_SHIPPING_CONFIG: ShippingConfig = {
  small_flat: 7.99,
  large_near: 129,
  large_far: 259,
  near_departments: ['34', '11', '30', '81', '12', '66'],
  delay_days: 7,
};

/** Fusionne une config partielle (venant de la base) avec les défauts. */
export function normalizeShippingConfig(raw: unknown): ShippingConfig {
  const r = (raw || {}) as Partial<ShippingConfig>;
  return {
    small_flat: typeof r.small_flat === 'number' ? r.small_flat : DEFAULT_SHIPPING_CONFIG.small_flat,
    large_near: typeof r.large_near === 'number' ? r.large_near : DEFAULT_SHIPPING_CONFIG.large_near,
    large_far: typeof r.large_far === 'number' ? r.large_far : DEFAULT_SHIPPING_CONFIG.large_far,
    near_departments: Array.isArray(r.near_departments) && r.near_departments.length
      ? r.near_departments.map(d => String(d).trim()).filter(Boolean)
      : DEFAULT_SHIPPING_CONFIG.near_departments,
    delay_days: typeof r.delay_days === 'number' ? r.delay_days : DEFAULT_SHIPPING_CONFIG.delay_days,
  };
}

export type ShippingClass = 'small' | 'large';

export interface ShippingLine {
  shipping_class?: string | null;
  quantity: number;
}

export interface ShippingQuote {
  /** 'small' | 'large_near' | 'large_far' — null si panier vide */
  method: string | null;
  /** Libellé lisible pour le client */
  label: string;
  /** Montant € TTC — null si l'adresse est requise pour trancher near/far */
  cost: number | null;
  /** true si le calcul attend le code postal de livraison */
  needsAddress: boolean;
  /** Nombre d'unités « gros produit » dans le panier */
  largeUnits: number;
}

/** Département depuis un code postal FR (gère Corse 20xxx et DOM 97x). */
export function departmentFromPostalCode(postalCode: string | null | undefined): string | null {
  const cp = String(postalCode || '').replace(/\s+/g, '');
  if (!/^\d{5}$/.test(cp)) return null;
  if (cp.startsWith('97') || cp.startsWith('98')) return cp.slice(0, 3);
  return cp.slice(0, 2);
}

export function isNearPostalCode(postalCode: string | null | undefined, config: ShippingConfig): boolean {
  const dep = departmentFromPostalCode(postalCode);
  if (!dep) return false;
  return config.near_departments.includes(dep);
}

/**
 * Devis de livraison pour un panier.
 * @param lines   lignes du panier (gabarit + quantité)
 * @param postalCode code postal de LIVRAISON (null si pas encore choisi)
 */
export function computeShipping(
  lines: ShippingLine[],
  postalCode: string | null | undefined,
  config: ShippingConfig
): ShippingQuote {
  const valid = lines.filter(l => l && l.quantity > 0);
  if (!valid.length) {
    return { method: null, label: '', cost: 0, needsAddress: false, largeUnits: 0 };
  }

  const largeUnits = valid
    .filter(l => l.shipping_class === 'large')
    .reduce((sum, l) => sum + l.quantity, 0);

  if (largeUnits === 0) {
    return {
      method: 'small',
      label: 'Colis standard',
      cost: round2(config.small_flat),
      needsAddress: false,
      largeUnits: 0,
    };
  }

  // Au moins un gros produit → le tarif dépend de la distance (code postal).
  if (!postalCode) {
    return {
      method: null,
      label: 'Livraison spécialisée (gros produit)',
      cost: null,
      needsAddress: true,
      largeUnits,
    };
  }

  const near = isNearPostalCode(postalCode, config);
  const unit = near ? config.large_near : config.large_far;
  return {
    method: near ? 'large_near' : 'large_far',
    label: near
      ? `Livraison spécialisée — zone proche (dépt ${departmentFromPostalCode(postalCode)})`
      : 'Livraison spécialisée — longue distance',
    cost: round2(unit * largeUnits),
    needsAddress: false,
    largeUnits,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
