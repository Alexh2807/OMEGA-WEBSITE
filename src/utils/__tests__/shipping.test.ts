import { describe, it, expect } from 'vitest';
import {
  computeShipping,
  departmentFromPostalCode,
  isNearPostalCode,
  normalizeShippingConfig,
  DEFAULT_SHIPPING_CONFIG,
} from '../shipping';

const cfg = DEFAULT_SHIPPING_CONFIG;

describe('departmentFromPostalCode', () => {
  it('extrait le département métropolitain', () => {
    expect(departmentFromPostalCode('34290')).toBe('34');
    expect(departmentFromPostalCode('75001')).toBe('75');
  });
  it('gère les espaces et les entrées invalides', () => {
    expect(departmentFromPostalCode(' 34290 ')).toBe('34');
    expect(departmentFromPostalCode('342')).toBeNull();
    expect(departmentFromPostalCode('')).toBeNull();
    expect(departmentFromPostalCode(null)).toBeNull();
  });
  it('gère les DOM (3 chiffres)', () => {
    expect(departmentFromPostalCode('97400')).toBe('974');
  });
});

describe('isNearPostalCode', () => {
  it('reconnaît les départements proches par défaut', () => {
    expect(isNearPostalCode('34290', cfg)).toBe(true);
    expect(isNearPostalCode('11000', cfg)).toBe(true);
    expect(isNearPostalCode('75001', cfg)).toBe(false);
  });
});

describe('computeShipping', () => {
  it('panier vide → 0', () => {
    const q = computeShipping([], null, cfg);
    expect(q.cost).toBe(0);
    expect(q.method).toBeNull();
  });

  it('petits articles seulement → forfait 7,99 €, sans adresse requise', () => {
    const q = computeShipping(
      [{ shipping_class: 'small', quantity: 3 }, { shipping_class: null, quantity: 1 }],
      null,
      cfg
    );
    expect(q.method).toBe('small');
    expect(q.cost).toBe(7.99);
    expect(q.needsAddress).toBe(false);
  });

  it('gros produit sans adresse → prix inconnu, adresse requise', () => {
    const q = computeShipping([{ shipping_class: 'large', quantity: 1 }], null, cfg);
    expect(q.cost).toBeNull();
    expect(q.needsAddress).toBe(true);
  });

  it('gros produit zone proche → 129 €', () => {
    const q = computeShipping([{ shipping_class: 'large', quantity: 1 }], '34500', cfg);
    expect(q.method).toBe('large_near');
    expect(q.cost).toBe(129);
  });

  it('gros produit longue distance → 259 €', () => {
    const q = computeShipping([{ shipping_class: 'large', quantity: 1 }], '75001', cfg);
    expect(q.method).toBe('large_far');
    expect(q.cost).toBe(259);
  });

  it('la quantité de gros produits multiplie le tarif', () => {
    const q = computeShipping([{ shipping_class: 'large', quantity: 2 }], '75001', cfg);
    expect(q.cost).toBe(518);
    expect(q.largeUnits).toBe(2);
  });

  it('panier mixte : les petits voyagent avec le gros (pas de forfait ajouté)', () => {
    const q = computeShipping(
      [
        { shipping_class: 'large', quantity: 1 },
        { shipping_class: 'small', quantity: 4 },
      ],
      '34000',
      cfg
    );
    expect(q.cost).toBe(129);
  });
});

describe('normalizeShippingConfig', () => {
  it('complète une config partielle avec les défauts', () => {
    const c = normalizeShippingConfig({ small_flat: 5 });
    expect(c.small_flat).toBe(5);
    expect(c.large_near).toBe(129);
    expect(c.near_departments).toEqual(cfg.near_departments);
  });
  it('tolère null/undefined', () => {
    expect(normalizeShippingConfig(null)).toEqual(cfg);
  });
});
