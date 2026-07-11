import { describe, it, expect } from 'vitest';
import {
  computeShipping,
  departmentFromPostalCode,
  estimateRoadKm,
  palletZoneFor,
  parcelPriceForWeight,
  isFrance,
  isEuropeCountry,
  normalizeShippingConfig,
  DEFAULT_SHIPPING_CONFIG,
} from '../shipping';

const cfg = DEFAULT_SHIPPING_CONFIG;
const FR = (cp: string) => ({ postal_code: cp, country: 'France' });

describe('departmentFromPostalCode', () => {
  it('extrait le département métropolitain', () => {
    expect(departmentFromPostalCode('34290')).toBe('34');
    expect(departmentFromPostalCode('75001')).toBe('75');
  });
  it('gère espaces, invalides, Corse et DOM', () => {
    expect(departmentFromPostalCode(' 34290 ')).toBe('34');
    expect(departmentFromPostalCode('342')).toBeNull();
    expect(departmentFromPostalCode(null)).toBeNull();
    expect(departmentFromPostalCode('20000')).toBe('20');
    expect(departmentFromPostalCode('97400')).toBe('974');
  });
});

describe('pays', () => {
  it('reconnaît la France (défaut, casse, vide)', () => {
    expect(isFrance('France')).toBe(true);
    expect(isFrance('FRANCE')).toBe(true);
    expect(isFrance('')).toBe(true);
    expect(isFrance(null)).toBe(true);
    expect(isFrance('Belgique')).toBe(false);
  });
  it('reconnaît les pays Europe avec accents et variantes', () => {
    expect(isEuropeCountry('Belgique')).toBe(true);
    expect(isEuropeCountry('Suède')).toBe(true);
    expect(isEuropeCountry('ESPAGNE')).toBe(true);
    expect(isEuropeCountry('Deutschland')).toBe(true);
    expect(isEuropeCountry('Suisse')).toBe(true);
    expect(isEuropeCountry('Canada')).toBe(false);
  });
});

describe('estimateRoadKm (haversine × 1,25 depuis Montblanc 34)', () => {
  it('Montpellier (34) tout proche', () => {
    const km = estimateRoadKm('34000', cfg)!;
    expect(km).toBeGreaterThan(20);
    expect(km).toBeLessThan(120);
  });
  it('Toulouse (31) ~200 km', () => {
    const km = estimateRoadKm('31000', cfg)!;
    expect(km).toBeGreaterThan(150);
    expect(km).toBeLessThan(250);
  });
  it('Paris (75) ~750 km', () => {
    const km = estimateRoadKm('75001', cfg)!;
    expect(km).toBeGreaterThan(600);
    expect(km).toBeLessThan(900);
  });
});

describe('palletZoneFor', () => {
  it('zones France par distance', () => {
    expect(palletZoneFor(FR('34500'), cfg, false)).toBe('fr_0_200');
    expect(palletZoneFor(FR('69001'), cfg, false)).toBe('fr_200_500');
    expect(palletZoneFor(FR('75001'), cfg, false)).toBe('fr_far');
    expect(palletZoneFor(FR('59000'), cfg, false)).toBe('fr_far');
  });
  it('Corse = France entière ; DOM = devis', () => {
    expect(palletZoneFor(FR('20000'), cfg, false)).toBe('fr_far');
    expect(palletZoneFor(FR('97400'), cfg, false)).toBe('quote');
  });
  it('Europe standard / express ; hors zone = devis', () => {
    expect(palletZoneFor({ postal_code: '1000', country: 'Belgique' }, cfg, false)).toBe('europe');
    expect(palletZoneFor({ postal_code: '1000', country: 'Belgique' }, cfg, true)).toBe('express_eu');
    expect(palletZoneFor({ postal_code: '10001', country: 'USA' }, cfg, false)).toBe('quote');
  });
});

describe('parcelPriceForWeight (barème par tranches)', () => {
  it('applique la bonne tranche (bornes incluses)', () => {
    expect(parcelPriceForWeight(0.5, cfg)).toBe(7.99);
    expect(parcelPriceForWeight(1, cfg)).toBe(7.99);
    expect(parcelPriceForWeight(1.2, cfg)).toBe(15.9);
    expect(parcelPriceForWeight(4.9, cfg)).toBe(19.9);
    expect(parcelPriceForWeight(10, cfg)).toBe(29.9);
    expect(parcelPriceForWeight(25, cfg)).toBe(49.9);
  });
  it('au-delà de la dernière tranche → prix "au-delà"', () => {
    expect(parcelPriceForWeight(45, cfg)).toBe(79.9);
  });
});

describe('computeShipping — colis', () => {
  it('panier vide → 0', () => {
    const q = computeShipping([], null, cfg);
    expect(q.cost).toBe(0);
    expect(q.method).toBeNull();
  });

  it('poids total = Σ poids × quantité, sans adresse requise', () => {
    const q = computeShipping(
      [
        { shipping_class: 'small', weight_kg: 0.8, quantity: 2 }, // 1,6 kg
        { shipping_class: 'small', weight_kg: 0.2, quantity: 1 }, // 0,2 kg
      ],
      null,
      cfg
    );
    expect(q.method).toBe('parcel');
    expect(q.parcelWeightKg).toBe(1.8);
    expect(q.cost).toBe(15.9); // tranche ≤ 2 kg
    expect(q.needsAddress).toBe(false);
  });

  it('produit sans poids → default_weight_kg', () => {
    const q = computeShipping([{ shipping_class: 'small', quantity: 1 }], null, cfg);
    expect(q.parcelWeightKg).toBe(1);
    expect(q.cost).toBe(7.99);
  });

  it('colis vers l’Europe → surcoût', () => {
    const q = computeShipping(
      [{ shipping_class: 'small', weight_kg: 0.5, quantity: 1 }],
      { postal_code: '1000', country: 'Belgique' },
      cfg
    );
    expect(q.cost).toBe(19.99); // 7,99 + surcoût Europe 12 €, arrondi propre
  });

  it('colis hors Europe → devis', () => {
    const q = computeShipping(
      [{ shipping_class: 'small', weight_kg: 0.5, quantity: 1 }],
      { postal_code: '10001', country: 'USA' },
      cfg
    );
    expect(q.cost).toBeNull();
    expect(q.needsQuote).toBe(true);
  });
});

describe('computeShipping — palette', () => {
  it('palette sans adresse → adresse requise', () => {
    const q = computeShipping([{ shipping_class: 'large', quantity: 1 }], null, cfg);
    expect(q.cost).toBeNull();
    expect(q.needsAddress).toBe(true);
  });

  it('palette zone proche / mid / far', () => {
    expect(computeShipping([{ shipping_class: 'large', quantity: 1 }], FR('34500'), cfg).cost).toBe(90);
    expect(computeShipping([{ shipping_class: 'large', quantity: 1 }], FR('69001'), cfg).cost).toBe(140);
    expect(computeShipping([{ shipping_class: 'large', quantity: 1 }], FR('75001'), cfg).cost).toBe(250);
  });

  it('la quantité multiplie le tarif par unité', () => {
    const q = computeShipping([{ shipping_class: 'large', quantity: 2 }], FR('75001'), cfg);
    expect(q.cost).toBe(500);
    expect(q.palletUnits).toBe(2);
  });

  it('panier mixte : les colis voyagent avec la palette (pas de barème ajouté)', () => {
    const q = computeShipping(
      [
        { shipping_class: 'large', quantity: 1 },
        { shipping_class: 'small', weight_kg: 3, quantity: 4 },
      ],
      FR('34000'),
      cfg
    );
    expect(q.cost).toBe(90);
    expect(q.label).toContain('colis inclus');
  });

  it('palette Europe : standard, express au choix, expressAvailable', () => {
    const dest = { postal_code: '1000', country: 'Belgique' };
    const std = computeShipping([{ shipping_class: 'large', quantity: 1 }], dest, cfg);
    expect(std.cost).toBe(280);
    expect(std.expressAvailable).toBe(true);
    const exp = computeShipping([{ shipping_class: 'large', quantity: 1 }], dest, cfg, { express: true });
    expect(exp.cost).toBe(450);
    expect(exp.method).toBe('pallet_express_eu');
  });

  it('palette DOM / hors Europe → devis', () => {
    expect(computeShipping([{ shipping_class: 'large', quantity: 1 }], FR('97400'), cfg).needsQuote).toBe(true);
    expect(
      computeShipping([{ shipping_class: 'large', quantity: 1 }], { postal_code: '10001', country: 'USA' }, cfg)
        .needsQuote
    ).toBe(true);
  });
});

describe('normalizeShippingConfig', () => {
  it('tolère null → défauts', () => {
    expect(normalizeShippingConfig(null)).toEqual(cfg);
  });

  it('migre une config v1 en préservant les tarifs réglés', () => {
    const c = normalizeShippingConfig({
      small_flat: 9.5,
      large_near: 129,
      large_far: 259,
      delay_days: 5,
    });
    expect(c.parcel_brackets[0].price).toBe(9.5); // small_flat → 1re tranche
    expect(c.pallet_zones.fr_0_200).toBe(129);
    expect(c.pallet_zones.fr_far).toBe(259);
    expect(c.delay_days).toBe(5);
    expect(c.pallet_zones.europe).toBe(cfg.pallet_zones.europe); // défaut
  });

  it('trie et nettoie les tranches', () => {
    const c = normalizeShippingConfig({
      parcel_brackets: [
        { max_kg: 5, price: 20 },
        { max_kg: 1, price: 8 },
        { max_kg: 0, price: 99 }, // invalide → retirée
      ],
    });
    expect(c.parcel_brackets).toEqual([
      { max_kg: 1, price: 8 },
      { max_kg: 5, price: 20 },
    ]);
  });
});
