import { describe, it, expect } from 'vitest';
import {
  computeShipping,
  listerOffresLivraison,
  analyserEnvoi,
  resoudreZone,
  poidsFactureUnitaire,
  seuilFranco,
  departmentFromPostalCode,
  estimateRoadKm,
  palletZoneFor,
  parcelPriceForWeight,
  isFrance,
  isEuropeCountry,
  isoPays,
  normalizeShippingConfig,
  DEFAULT_SHIPPING_CONFIG,
  type ShippingConfig,
  type ShippingLine,
  type OffreLivraison,
} from '../shipping';

const cfg = DEFAULT_SHIPPING_CONFIG;
const FR = (cp: string) => ({ postal_code: cp, country: 'France' });

/** Panier d'un seul article de `kg` kilos, gabarit colis. */
const colis = (kg: number, quantity = 1): ShippingLine[] => [
  { shipping_class: 'small', weight_kg: kg, quantity },
];

/** Offre d'un mode donné dans une liste d'offres. */
const parMode = (offres: OffreLivraison[], mode: string): OffreLivraison | undefined =>
  offres.find(o => o.mode === mode);

/** Config dérivée — évite de muter la config par défaut partagée. */
const avec = (patch: Partial<ShippingConfig>): ShippingConfig =>
  normalizeShippingConfig({ ...cfg, ...patch });

/* ═════════════════════════════════════════════════════════════════════════
   Géographie et zones
   ═════════════════════════════════════════════════════════════════════════ */

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
  it('traduit les noms de pays en codes ISO (grilles transporteurs)', () => {
    expect(isoPays('Belgique')).toBe('BE');
    expect(isoPays('Allemagne')).toBe('DE');
    expect(isoPays('be')).toBe('BE');
    expect(isoPays('Canada')).toBeNull();
  });
});

describe('resoudreZone', () => {
  it('métropole', () => {
    expect(resoudreZone(FR('34290')).zone).toBe('FR_METRO');
    expect(resoudreZone(FR('75001')).zone).toBe('FR_METRO');
  });

  it('Corse 20xxx → zone dédiée, jamais la métropole', () => {
    expect(resoudreZone(FR('20000')).zone).toBe('FR_CORSE');
    expect(resoudreZone(FR('20620')).zone).toBe('FR_CORSE');
  });

  it('outre-mer OM1 / OM2 (le bug de l’audit)', () => {
    expect(resoudreZone(FR('97400')).zone).toBe('OM1'); // La Réunion
    expect(resoudreZone(FR('97200')).zone).toBe('OM1'); // Martinique
    expect(resoudreZone(FR('98800')).zone).toBe('OM2'); // Nouvelle-Calédonie
    expect(resoudreZone(FR('98700')).zone).toBe('OM2'); // Polynésie française
  });

  it('Monaco 980xx = France métropolitaine, pas le Pacifique', () => {
    const parCp = resoudreZone(FR('98000'));
    expect(parCp.zone).toBe('FR_METRO');
    expect(parCp.monaco).toBe(true);
    expect(resoudreZone({ postal_code: '98000', country: 'Monaco' }).zone).toBe('FR_METRO');
  });

  it('code postal invalide ≠ hors zone', () => {
    expect(resoudreZone(FR('342')).zone).toBe('CP_INVALIDE');
    expect(resoudreZone(FR('ABCDE')).zone).toBe('CP_INVALIDE');
    expect(resoudreZone(FR('99999')).zone).toBe('CP_INVALIDE');
    expect(resoudreZone(FR('97900')).zone).toBe('CP_INVALIDE'); // préfixe OM inexistant
  });

  it('destination inconnue', () => {
    expect(resoudreZone(null).zone).toBe('ADRESSE_REQUISE');
    expect(resoudreZone({}).zone).toBe('ADRESSE_REQUISE');
    expect(resoudreZone({ postal_code: '', country: 'France' }).zone).toBe('ADRESSE_REQUISE');
  });

  it('Europe et reste du monde', () => {
    expect(resoudreZone({ postal_code: '1000', country: 'Belgique' }).zone).toBe('EUROPE');
    expect(resoudreZone({ postal_code: '1000', country: 'Belgique' }).iso).toBe('BE');
    expect(resoudreZone({ postal_code: '10001', country: 'USA' }).zone).toBe('MONDE');
  });

  it('un code postal non français n’est pas validé au format français', () => {
    // 4 chiffres en Belgique : ce n'est PAS un code postal invalide.
    expect(resoudreZone({ postal_code: '1000', country: 'Belgique' }).zone).toBe('EUROPE');
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

describe('palletZoneFor (zonage historique, conservé)', () => {
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

/* ═════════════════════════════════════════════════════════════════════════
   Poids facturé et poids volumétrique
   ═════════════════════════════════════════════════════════════════════════ */

describe('poids volumétrique — (L × l × h) / 5000', () => {
  it('retient le poids volumétrique quand il dépasse le réel', () => {
    // 60 × 40 × 40 = 96 000 cm³ / 5000 = 19,2 kg contre 2 kg réels.
    const p = poidsFactureUnitaire(
      { weight_kg: 2, length_cm: 60, width_cm: 40, height_cm: 40, quantity: 1 },
      cfg
    );
    expect(p).toBeCloseTo(19.2, 5);
  });

  it('retient le poids réel quand il dépasse le volumétrique', () => {
    // 20 × 20 × 20 = 8000 / 5000 = 1,6 kg contre 12 kg réels.
    const p = poidsFactureUnitaire(
      { weight_kg: 12, length_cm: 20, width_cm: 20, height_cm: 20, quantity: 1 },
      cfg
    );
    expect(p).toBe(12);
  });

  it('repli propre : dimensions absentes ou partielles → poids réel', () => {
    expect(poidsFactureUnitaire({ weight_kg: 3, quantity: 1 }, cfg)).toBe(3);
    expect(
      poidsFactureUnitaire({ weight_kg: 3, length_cm: 60, width_cm: 40, quantity: 1 }, cfg)
    ).toBe(3);
    expect(
      poidsFactureUnitaire(
        { weight_kg: 3, length_cm: 60, width_cm: 40, height_cm: 0, quantity: 1 },
        cfg
      )
    ).toBe(3);
  });

  it('produit sans poids ni dimensions → default_weight_kg', () => {
    expect(poidsFactureUnitaire({ quantity: 1 }, cfg)).toBe(cfg.default_weight_kg);
    expect(poidsFactureUnitaire({ weight_kg: 0, quantity: 1 }, cfg)).toBe(cfg.default_weight_kg);
    expect(poidsFactureUnitaire({ weight_kg: null, quantity: 1 }, cfg)).toBe(cfg.default_weight_kg);
  });

  it('le volumétrique fait basculer un colis léger en palette', () => {
    // 100 × 80 × 60 = 480 000 / 5000 = 96 kg volumétriques pour 4 kg réels.
    const a = analyserEnvoi(
      [{ shipping_class: 'small', weight_kg: 4, length_cm: 100, width_cm: 80, height_cm: 60, quantity: 1 }],
      FR('34000'),
      cfg
    );
    expect(a.poidsKg).toBe(96);
    expect(a.modePalette).toBe(true);
  });
});

/* ═════════════════════════════════════════════════════════════════════════
   Bascule automatique en palette
   ═════════════════════════════════════════════════════════════════════════ */

describe('bascule automatique en palette', () => {
  it('30 kg pile reste en colis, 30,1 kg bascule', () => {
    expect(analyserEnvoi(colis(30), FR('34000'), cfg).modePalette).toBe(false);
    expect(analyserEnvoi(colis(30.1), FR('34000'), cfg).modePalette).toBe(true);
  });

  it('le cumul des lignes déclenche la bascule', () => {
    const a = analyserEnvoi(colis(8, 4), FR('34000'), cfg); // 32 kg
    expect(a.poidsKg).toBe(32);
    expect(a.modePalette).toBe(true);
    expect(a.motifPalette).toContain('palette');
  });

  it('un article shipping_class large bascule quel que soit son poids', () => {
    const a = analyserEnvoi([{ shipping_class: 'large', weight_kg: 2, quantity: 1 }], FR('34000'), cfg);
    expect(a.modePalette).toBe(true);
    expect(a.unitesPalette).toBe(1);
  });

  it('hors gabarit (L+l+h > 200 cm) bascule même à poids faible', () => {
    const a = analyserEnvoi(
      [{ shipping_class: 'small', weight_kg: 1, length_cm: 150, width_cm: 40, height_cm: 30, quantity: 1 }],
      FR('34000'),
      cfg
    );
    expect(a.modePalette).toBe(true);
  });

  it('en mode palette, les modes colis ne sont plus proposés', () => {
    const offres = listerOffresLivraison(colis(45), FR('34000'), cfg);
    expect(parMode(offres, 'domicile')).toBeUndefined();
    expect(parMode(offres, 'express')).toBeUndefined();
    expect(parMode(offres, 'relais')).toBeUndefined();
    expect(parMode(offres, 'palette')).toBeDefined();
  });

  it('au-delà de 500 kg par palette, on compte une palette de plus', () => {
    const a = analyserEnvoi(colis(600), FR('34000'), cfg);
    expect(a.palettes).toBe(2);
  });
});

/* ═════════════════════════════════════════════════════════════════════════
   Colis métropole — grille Colissimo entreprise 2026
   ═════════════════════════════════════════════════════════════════════════ */

describe('colis métropole (Colissimo Domicile entreprise, avec signature)', () => {
  /* Plancher désactivé : on teste ici la GRILLE transporteur seule. Le plancher
     commercial de 12,99 € TTC a son propre bloc de tests plus bas. */
  const sansPlancher = avec({ plancher_colis_metropole_ttc: null });
  const offre = (kg: number) =>
    parMode(listerOffresLivraison(colis(kg), FR('75001'), sansPlancher), 'domicile')!;

  it('applique la bonne tranche', () => {
    expect(offre(0.5).prix_ht).toBe(8.76); // tranche ≤ 0,5 kg
    expect(offre(1).prix_ht).toBe(10.39); // tranche ≤ 1 kg
    expect(offre(1.8).prix_ht).toBe(11.53); // tranche ≤ 2 kg
    expect(offre(5).prix_ht).toBe(14.59); // tranche ≤ 5 kg
    expect(offre(15).prix_ht).toBe(23.78); // tranche ≤ 15 kg
    expect(offre(30).prix_ht).toBe(38.1); // dernière tranche
  });

  it('le TTC est reconstitué à 20 %', () => {
    const o = offre(5);
    expect(o.prix_ttc).toBe(17.51);
    expect(o.carrier).toBe('colissimo');
    expect(o.service).toBe('colissimo_domicile');
    expect(o.delai_min_j).toBe(1);
    expect(o.delai_max_j).toBe(2);
  });

  it('la variante sans signature vaut 1,05 € HT de moins', () => {
    const sans = parMode(
      listerOffresLivraison(colis(5), FR('75001'), avec({ signature_domicile: false })),
      'domicile'
    )!;
    expect(sans.prix_ht).toBe(13.54);
    expect(round2(offre(5).prix_ht - sans.prix_ht)).toBe(1.05);
  });

  it('supplément Colissimo volumineux (+6 € HT) entre 150 et 200 cm cumulés', () => {
    // 140 + 10 + 10 = 160 cm cumulés (> 150) mais seulement 2,8 kg volumétriques :
    // c'est bien le poids réel de 5 kg qui est facturé, plus le supplément.
    const o = parMode(
      listerOffresLivraison(
        [{ shipping_class: 'small', weight_kg: 5, length_cm: 140, width_cm: 10, height_cm: 10, quantity: 1 }],
        FR('75001'),
        cfg
      ),
      'domicile'
    )!;
    expect(o.prix_ht).toBe(20.59); // 14,59 + 6,00
  });
});

describe('colis métropole — express et point relais', () => {
  it('Chronopost Chrono 18 par défaut, J+1', () => {
    const o = parMode(listerOffresLivraison(colis(5), FR('75001'), cfg), 'express')!;
    expect(o.carrier).toBe('chronopost');
    expect(o.prix_ht).toBe(20.5); // tranche ≤ 10 kg
    expect(o.delai_min_j).toBe(1);
    expect(o.delai_max_j).toBe(1);
  });

  it('Chrono 13 sur option', () => {
    const o = parMode(
      listerOffresLivraison(colis(5), FR('75001'), avec({ service_express: 'chrono13' })),
      'express'
    )!;
    expect(o.prix_ht).toBe(24);
  });

  it('Mondial Relay par défaut, avec choix de relais requis', () => {
    const o = parMode(listerOffresLivraison(colis(5), FR('75001'), cfg), 'relais')!;
    expect(o.carrier).toBe('mondial_relay');
    expect(o.prix_ttc).toBe(15.99); // grille publique TTC
    expect(o.relais_requis).toBe(true);
  });

  it('pas de relais au-delà de 25 kg (limite Mondial Relay)', () => {
    expect(parMode(listerOffresLivraison(colis(26), FR('75001'), cfg), 'relais')).toBeUndefined();
    // …mais Colissimo Point de Retrait monte à 30 kg
    const o = parMode(
      listerOffresLivraison(colis(26), FR('75001'), avec({ service_relais: 'colissimo_point_retrait' })),
      'relais'
    )!;
    expect(o.prix_ht).toBe(35.42);
  });

  it('pas de relais si le colis dépasse le gabarit du réseau', () => {
    // 130 cm de long : au-delà du côté maximal Mondial Relay (120 cm), mais
    // encore dans les 150 cm acceptés par Colissimo.
    const offres = listerOffresLivraison(
      [{ shipping_class: 'small', weight_kg: 3, length_cm: 130, width_cm: 15, height_cm: 10, quantity: 1 }],
      FR('75001'),
      cfg
    );
    expect(parMode(offres, 'relais')).toBeUndefined();
    expect(parMode(offres, 'domicile')).toBeDefined();
  });
});

/* ═════════════════════════════════════════════════════════════════════════
   ★ Outre-mer — la correction la plus urgente de l'audit
   ═════════════════════════════════════════════════════════════════════════ */

describe('colis outre-mer (grille Colissimo OM1/OM2)', () => {
  it('5 kg vers La Réunion (97400) ne coûte PLUS 7,99 € mais 38,90 € TTC', () => {
    const q = computeShipping(colis(5), FR('97400'), cfg);
    expect(q.cost).not.toBe(7.99);
    expect(q.cost).toBe(38.9);
    expect(q.needsQuote).toBe(false);
    expect(q.zone).toBe('OM1');
  });

  it('15 kg vers La Réunion → 130,20 € TTC (et non 7,99 €)', () => {
    expect(computeShipping(colis(15), FR('97400'), cfg).cost).toBe(130.2);
  });

  it('toutes les tranches OM1 sont au-dessus de la grille métropole', () => {
    // Comparaison faite sur la GRILLE seule (plancher commercial désactivé) :
    // sous 1 kg le plancher métropole de 12,99 € dépasse le tarif OM1 réel de
    // 12,02 €, ce qui est un choix commercial et non un tarif transporteur.
    const c = avec({ plancher_colis_metropole_ttc: null });
    for (const kg of [0.5, 1, 2, 5, 10, 15, 30]) {
      const om = computeShipping(colis(kg), FR('97400'), c).cost!;
      const metro = computeShipping(colis(kg), FR('75001'), c).cost!;
      expect(om).toBeGreaterThan(metro);
    }
  });

  it('OM2 (Nouvelle-Calédonie) est plus cher qu’OM1', () => {
    expect(computeShipping(colis(5), FR('98800'), cfg).cost).toBe(55.96);
    expect(computeShipping(colis(15), FR('98800'), cfg).cost).toBe(249.99);
  });

  it('l’offre économique maritime est disponible sur option (OM1)', () => {
    const q = computeShipping(colis(5), FR('97400'), avec({ service_outre_mer: 'economique' }));
    expect(q.cost).toBe(24.8);
    expect(q.offre?.delai_min_j).toBe(13);
    expect(q.offre?.delai_max_j).toBe(31);
  });

  it('ni express ni relais vers l’outre-mer (aucune grille au référentiel)', () => {
    const offres = listerOffresLivraison(colis(5), FR('97400'), cfg);
    expect(parMode(offres, 'express')).toBeUndefined();
    expect(parMode(offres, 'relais')).toBeUndefined();
    expect(parMode(offres, 'domicile')).toBeDefined();
  });

  it('palette vers l’outre-mer → devis (transport maritime)', () => {
    const q = computeShipping([{ shipping_class: 'large', quantity: 1 }], FR('97400'), cfg);
    expect(q.needsQuote).toBe(true);
    expect(q.cost).toBeNull();
  });
});

/* ═════════════════════════════════════════════════════════════════════════
   Corse et Monaco
   ═════════════════════════════════════════════════════════════════════════ */

describe('Corse (20xxx)', () => {
  /* Le supplément Corse de 20,14 € HT du référentiel est une référence DPD.
     La Poste, elle, n'applique AUCUN supplément Corse sur Colissimo : la Corse est
     desservie au tarif métropole. L'appliquer aux offres colis surfacturait un envoi
     de 5 kg de +169 % (38,45 € au lieu de 14,28 € TTC) — un surcoût qui n'existe pas,
     et une vente perdue. Il ne reste donc que sur la messagerie palette, où
     l'affréteur facture réellement la traversée (voir le test palette plus bas). */
  it('tarif métropole sur les offres colis : La Poste ne surtaxe pas la Corse', () => {
    const corse = computeShipping(colis(5), FR('20000'), cfg).cost!;
    const metro = computeShipping(colis(5), FR('75001'), cfg).cost!;
    expect(corse).toBe(metro);
    // 14,59 € HT = grille Colissimo entreprise 5 kg, sans supplément
    const o = parMode(listerOffresLivraison(colis(5), FR('20000'), cfg), 'domicile')!;
    expect(o.prix_ht).toBe(14.59);
  });

  it('le point relais non plus n’est pas surtaxé', () => {
    const corse = parMode(listerOffresLivraison(colis(5), FR('20000'), cfg), 'relais')!;
    const metro = parMode(listerOffresLivraison(colis(5), FR('75001'), cfg), 'relais')!;
    expect(round2(corse.prix_ht - metro.prix_ht)).toBe(0);
  });

  it('pas d’express Chronopost annoncé vers la Corse (aucun tarif source)', () => {
    expect(parMode(listerOffresLivraison(colis(5), FR('20000'), cfg), 'express')).toBeUndefined();
  });
});

describe('Monaco (980xx)', () => {
  it('tarif métropole, pas un tarif Pacifique', () => {
    expect(computeShipping(colis(5), FR('98000'), cfg).cost).toBe(
      computeShipping(colis(5), FR('75001'), cfg).cost
    );
  });
  it('avec le pays « Monaco » saisi explicitement', () => {
    const q = computeShipping(colis(5), { postal_code: '98000', country: 'Monaco' }, cfg);
    expect(q.zone).toBe('FR_METRO');
    expect(q.cost).toBe(17.51);
  });
});

/* ═════════════════════════════════════════════════════════════════════════
   Europe
   ═════════════════════════════════════════════════════════════════════════ */

describe('colis Europe', () => {
  const BE = { postal_code: '1000', country: 'Belgique' };

  it('grille Colissimo entreprise pour les pays couverts', () => {
    const o = parMode(listerOffresLivraison(colis(5), BE, cfg), 'domicile')!;
    expect(o.prix_ht).toBe(14.36); // Belgique, tranche ≤ 5 kg
    expect(o.delai_min_j).toBe(3);
    expect(o.delai_max_j).toBe(8);
  });

  it('grille publique pour les pays sans colonne dédiée (Autriche)', () => {
    const o = parMode(
      listerOffresLivraison(colis(5), { postal_code: '1010', country: 'Autriche' }, cfg),
      'domicile'
    )!;
    expect(o.prix_ttc).toBe(28.59); // grille publique UE, tranche ≤ 5 kg
  });

  it('point relais Mondial Relay Europe là où il existe', () => {
    expect(parMode(listerOffresLivraison(colis(5), BE, cfg), 'relais')?.prix_ttc).toBe(17.4);
    expect(
      parMode(listerOffresLivraison(colis(5), { postal_code: '1010', country: 'Autriche' }, cfg), 'relais')
    ).toBeUndefined();
  });

  it('pas d’express Chronopost hors métropole', () => {
    expect(parMode(listerOffresLivraison(colis(5), BE, cfg), 'express')).toBeUndefined();
  });

  it('pays européen sans grille (Andorre) → devis explicite, pas un prix inventé', () => {
    const q = computeShipping(colis(5), { postal_code: 'AD500', country: 'Andorre' }, cfg);
    expect(q.cost).toBeNull();
    expect(q.needsQuote).toBe(true);
  });

  it('hors Europe → devis', () => {
    const q = computeShipping(colis(5), { postal_code: '10001', country: 'USA' }, cfg);
    expect(q.cost).toBeNull();
    expect(q.needsQuote).toBe(true);
    expect(q.motif).toContain('devis');
  });
});

/* ═════════════════════════════════════════════════════════════════════════
   Palette
   ═════════════════════════════════════════════════════════════════════════ */

describe('palette — tarif par zone', () => {
  const machine: ShippingLine[] = [{ shipping_class: 'large', weight_kg: 60, quantity: 1 }];
  const pro = { destinataire: 'entreprise' as const };

  it('régional (< 200 km du dépôt) moins cher que national', () => {
    const local = computeShipping(machine, FR('34000'), cfg, pro).cost!;
    const paris = computeShipping(machine, FR('75001'), cfg, pro).cost!;
    expect(local).toBeLessThan(paris);
  });

  it('médiane régionale + surcharge carburant GEODIS 17,11 %', () => {
    const o = parMode(listerOffresLivraison(machine, FR('34000'), cfg, pro), 'palette')!;
    // 75 € HT (médiane 55-95 pour ≤ 100 kg) + 17,11 % de carburant
    expect(o.prix_ht).toBe(87.83);
    expect(o.carrier).toBe('messagerie');
    expect(o.delai_min_j).toBe(1);
  });

  it('médiane nationale pour Paris', () => {
    const o = parMode(listerOffresLivraison(machine, FR('75001'), cfg, pro), 'palette')!;
    expect(o.prix_ht).toBe(158.1); // 135 + 17,11 %
    expect(o.delai_max_j).toBe(3);
  });

  it('suppléments particulier (hayon + RDV + B2C) par défaut', () => {
    const part = parMode(listerOffresLivraison(machine, FR('75001'), cfg), 'palette')!;
    const entreprise = parMode(listerOffresLivraison(machine, FR('75001'), cfg, pro), 'palette')!;
    expect(round2(part.prix_ht - entreprise.prix_ht)).toBe(55); // 22,50 + 15 + 17,50
  });

  it('supplément zone difficile sur option', () => {
    const normal = parMode(listerOffresLivraison(machine, FR('75001'), cfg, pro), 'palette')!;
    const montagne = parMode(
      listerOffresLivraison(machine, FR('75001'), cfg, { ...pro, zone_difficile: true }),
      'palette'
    )!;
    expect(round2(montagne.prix_ht - normal.prix_ht)).toBe(16.13);
  });

  it('Corse : grille nationale + supplément Corse/îles', () => {
    const corse = parMode(listerOffresLivraison(machine, FR('20000'), cfg, pro), 'palette')!;
    const paris = parMode(listerOffresLivraison(machine, FR('75001'), cfg, pro), 'palette')!;
    expect(round2(corse.prix_ht - paris.prix_ht)).toBe(20.14);
  });

  it('Europe : médiane par pays, express Europe sur option', () => {
    const BE = { postal_code: '1000', country: 'Belgique' };
    const std = parMode(listerOffresLivraison(machine, BE, cfg, pro), 'palette')!;
    expect(std.prix_ht).toBe(286.92); // 245 + 17,11 %
    const exp = parMode(
      listerOffresLivraison(machine, BE, cfg, { ...pro, express: true }),
      'palette'
    )!;
    expect(exp.prix_ht).toBe(439.16); // 375 + 17,11 %
    expect(exp.delai_max_j).toBe(2);
  });

  it('l’option Express Europe est signalée disponible', () => {
    const q = computeShipping(machine, { postal_code: '1000', country: 'Belgique' }, cfg, pro);
    expect(q.expressAvailable).toBe(true);
    expect(computeShipping(machine, FR('75001'), cfg, pro).expressAvailable).toBe(false);
  });

  it('pays européen sans grille palette → devis', () => {
    const q = computeShipping(machine, { postal_code: '1010', country: 'Autriche' }, cfg, pro);
    expect(q.needsQuote).toBe(true);
  });

  it('dégressivité multi-palettes par palier', () => {
    const cinq: ShippingLine[] = [{ shipping_class: 'large', weight_kg: 60, quantity: 5 }];
    const une = parMode(listerOffresLivraison(machine, FR('75001'), cfg, pro), 'palette')!;
    const q = parMode(listerOffresLivraison(cinq, FR('75001'), cfg, pro), 'palette')!;
    // 5 palettes à l'indice 0,75 : moins cher que 5 × le tarif unitaire.
    // 135 × 5 × 0,75 = 506,25 € HT de transport + 17,11 % de carburant.
    expect(q.prix_ht).toBeLessThan(une.prix_ht * 5);
    expect(q.prix_ht).toBe(592.87);
  });

  it('les colis voyagent avec la palette sans surcoût de barème colis', () => {
    const mixte = computeShipping(
      [
        { shipping_class: 'large', weight_kg: 60, quantity: 1 },
        { shipping_class: 'small', weight_kg: 3, quantity: 4 },
      ],
      FR('75001'),
      cfg,
      pro
    );
    expect(mixte.method).toBe('pallet_fr_far');
    expect(mixte.palletUnits).toBe(1);
    // 72 kg au total : toujours la tranche ≤ 100 kg, même prix que la machine seule.
    expect(mixte.cost).toBe(computeShipping(machine, FR('75001'), cfg, pro).cost);
  });
});

/* ═════════════════════════════════════════════════════════════════════════
   Cas dégradés : adresse manquante, code postal invalide, panier vide
   ═════════════════════════════════════════════════════════════════════════ */

describe('cas dégradés', () => {
  it('panier vide → aucune offre, coût 0, aucun blocage', () => {
    expect(listerOffresLivraison([], FR('34000'), cfg)).toEqual([]);
    const q = computeShipping([], null, cfg);
    expect(q.cost).toBe(0);
    expect(q.method).toBeNull();
    expect(q.needsAddress).toBe(false);
    expect(q.needsQuote).toBe(false);
  });

  it('lignes de quantité nulle → panier considéré vide', () => {
    expect(computeShipping([{ shipping_class: 'small', weight_kg: 2, quantity: 0 }], FR('34000'), cfg).cost)
      .toBe(0);
  });

  it('destination inconnue → « adresse requise », PAS le tarif France par défaut', () => {
    const q = computeShipping(colis(0.5), null, cfg);
    expect(q.cost).toBeNull();
    expect(q.needsAddress).toBe(true);
    expect(q.needsQuote).toBe(false);
    expect(q.motif).toMatch(/[Aa]dresse/);
  });

  it('code postal invalide → motif distinct, jamais « hors zone »', () => {
    const q = computeShipping(colis(2), FR('342'), cfg);
    expect(q.cost).toBeNull();
    expect(q.needsAddress).toBe(true);
    expect(q.needsQuote).toBe(false); // ⚠ sinon le panier affiche « DOM-TOM / hors Europe »
    expect(q.motif).toBe('Code postal invalide, vérifiez votre saisie.');
    expect(q.motif).not.toMatch(/hors zone/i);
  });

  it('le retrait au dépôt reste proposable même sans adresse valable', () => {
    for (const dest of [null, FR('342')]) {
      const offres = listerOffresLivraison(colis(2), dest, cfg);
      const retrait = parMode(offres, 'retrait')!;
      expect(retrait.prix_ttc).toBe(0);
      expect(retrait.sur_devis).toBe(false);
      expect(retrait.carrier).toBe('retrait');
    }
  });

  it('le retrait peut être désactivé', () => {
    expect(parMode(listerOffresLivraison(colis(2), FR('34000'), avec({ retrait_actif: false })), 'retrait'))
      .toBeUndefined();
  });
});

/* ═════════════════════════════════════════════════════════════════════════
   Plancher de prix des colis métropole (12,99 € TTC)
   ═════════════════════════════════════════════════════════════════════════ */

describe('plancher colis métropole', () => {
  const dom = (kg: number, dest: { postal_code: string; country: string }, c = cfg) =>
    parMode(listerOffresLivraison(colis(kg), dest, c), 'domicile')!;

  it('relève les petits colis à 12,99 € TTC pile', () => {
    expect(dom(0.25, FR('75001')).prix_ttc).toBe(12.99);
    expect(dom(0.5, FR('75001')).prix_ttc).toBe(12.99);
    expect(dom(1, FR('75001')).prix_ttc).toBe(12.99);
  });

  it('c’est un plancher, pas un forfait : au-delà, le coût réel reprend la main', () => {
    expect(dom(2, FR('75001')).prix_ttc).toBe(13.84);
    expect(dom(5, FR('75001')).prix_ttc).toBe(17.51);
    expect(dom(15, FR('75001')).prix_ttc).toBe(28.54);
    expect(dom(30, FR('75001')).prix_ttc).toBe(45.72);
  });

  it('le prix affiché tombe juste : 12,99 €, jamais 13,00 € par arrondi', () => {
    const o = dom(1, FR('75001'));
    expect(o.prix_ttc).toBe(12.99);
    expect(o.prix_ttc.toFixed(2)).toBe('12.99');
    // Le HT est arrondi au centime supérieur : le résidu reste chez OMEGA.
    expect(o.prix_ht).toBe(10.83);
    expect(computeShipping(colis(1), FR('75001'), cfg).cost).toBe(12.99);
  });

  it('s’applique aux trois modes colis, et à eux seuls', () => {
    const offres = listerOffresLivraison(colis(0.5), FR('75001'), cfg);
    expect(parMode(offres, 'domicile')!.prix_ttc).toBe(12.99);
    expect(parMode(offres, 'relais')!.prix_ttc).toBe(12.99); // 4,15 € → 12,99 €
    // L'express est déjà largement au-dessus : il n'est pas touché.
    expect(parMode(offres, 'express')!.prix_ttc).toBe(19.2);
    // Le retrait au dépôt reste GRATUIT.
    expect(parMode(offres, 'retrait')!.prix_ttc).toBe(0);
  });

  it('s’applique à la Corse', () => {
    // La Corse est desservie au tarif métropole sur les offres colis : le
    // plancher s'y applique donc exactement de la même façon.
    expect(dom(0.5, FR('20000')).prix_ttc).toBe(12.99);
    expect(dom(5, FR('20000')).prix_ttc).toBe(17.51); // au-dessus : intact
    for (const o of listerOffresLivraison(colis(0.25), FR('20000'), cfg)) {
      if (!o.sur_devis && o.mode !== 'retrait') expect(o.prix_ttc).toBeGreaterThanOrEqual(12.99);
    }
  });

  it('ne s’applique JAMAIS à l’outre-mer', () => {
    // 12,02 € TTC : le tarif OM1 réel de la tranche 0,5 kg, non relevé.
    expect(dom(0.5, FR('97400')).prix_ttc).toBe(12.02);
    expect(dom(0.5, FR('98800')).prix_ttc).toBe(12.21);
  });

  it('ne s’applique JAMAIS à l’Union européenne', () => {
    const BE = { postal_code: '1000', country: 'Belgique' };
    expect(dom(0.25, BE).prix_ttc).toBe(10.8); // 9,00 € HT, grille entreprise BE
    expect(parMode(listerOffresLivraison(colis(0.5), BE, cfg), 'relais')!.prix_ttc).toBe(4.6);
  });

  it('ne s’applique JAMAIS à la palette', () => {
    const q = computeShipping(
      [{ shipping_class: 'large', weight_kg: 60, quantity: 1 }],
      FR('34000'),
      cfg,
      { destinataire: 'entreprise' }
    );
    expect(q.cost).toBe(105.4); // aucun relèvement, aucune interférence
  });

  it('s’applique aussi au barème personnalisé de l’admin (le 7,99 € historique)', () => {
    const legacy = avec({ utiliser_bareme_personnalise: true });
    expect(computeShipping(colis(1), FR('75001'), legacy).cost).toBe(12.99);
    expect(computeShipping(colis(1.5), FR('75001'), legacy).cost).toBe(15.9); // au-dessus : intact
  });

  it('se désactive proprement avec null ou 0', () => {
    expect(dom(0.5, FR('75001'), avec({ plancher_colis_metropole_ttc: null })).prix_ttc).toBe(10.51);
    expect(dom(0.5, FR('75001'), avec({ plancher_colis_metropole_ttc: 0 })).prix_ttc).toBe(10.51);
  });

  it('est réglable à une autre valeur', () => {
    expect(dom(0.5, FR('75001'), avec({ plancher_colis_metropole_ttc: 19.9 })).prix_ttc).toBe(19.9);
    expect(dom(30, FR('75001'), avec({ plancher_colis_metropole_ttc: 19.9 })).prix_ttc).toBe(45.72);
  });

  it('normalizeShippingConfig : défaut, null explicite et valeur invalide', () => {
    expect(normalizeShippingConfig(null).plancher_colis_metropole_ttc).toBe(12.99);
    expect(normalizeShippingConfig({}).plancher_colis_metropole_ttc).toBe(12.99);
    expect(
      normalizeShippingConfig({ plancher_colis_metropole_ttc: null }).plancher_colis_metropole_ttc
    ).toBeNull();
    expect(
      normalizeShippingConfig({ plancher_colis_metropole_ttc: 0 }).plancher_colis_metropole_ttc
    ).toBe(0);
    expect(
      normalizeShippingConfig({ plancher_colis_metropole_ttc: -5 }).plancher_colis_metropole_ttc
    ).toBe(12.99);
    expect(
      normalizeShippingConfig({ plancher_colis_metropole_ttc: 'gratuit' }).plancher_colis_metropole_ttc
    ).toBe(12.99);
  });

  it('le franco reste prioritaire : le plancher ne ressuscite pas une livraison offerte', () => {
    const petitEtCher: ShippingLine[] = [
      { shipping_class: 'small', weight_kg: 0.4, unit_price_ht: 600, quantity: 1 },
    ];
    const offres = listerOffresLivraison(petitEtCher, FR('75001'), cfg);
    expect(parMode(offres, 'domicile')!.prix_ttc).toBe(0);
    expect(parMode(offres, 'domicile')!.prix_ht).toBe(0);
    expect(parMode(offres, 'relais')!.prix_ttc).toBe(0);
    expect(parMode(offres, 'domicile')!.motif).toContain('offerte');
    expect(computeShipping(petitEtCher, FR('75001'), cfg).cost).toBe(0);
  });

  it('sous le seuil de franco, le plancher s’applique bien', () => {
    const petitEtModeste: ShippingLine[] = [
      { shipping_class: 'small', weight_kg: 0.4, unit_price_ht: 40, quantity: 1 },
    ];
    expect(parMode(listerOffresLivraison(petitEtModeste, FR('75001'), cfg), 'domicile')!.prix_ttc)
      .toBe(12.99);
  });

  it('aucune offre colis métropole ne passe sous le plancher, tous poids confondus', () => {
    for (const kg of [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 5, 10, 20, 30]) {
      for (const o of listerOffresLivraison(colis(kg), FR('75001'), cfg)) {
        if (o.sur_devis || o.mode === 'retrait') continue;
        expect(o.prix_ttc).toBeGreaterThanOrEqual(12.99);
      }
    }
  });
});

/* ═════════════════════════════════════════════════════════════════════════
   Franco de port
   ═════════════════════════════════════════════════════════════════════════ */

describe('franco de port', () => {
  const cher: ShippingLine[] = [
    { shipping_class: 'small', weight_kg: 5, unit_price_ht: 400, quantity: 1 },
  ];
  const modeste: ShippingLine[] = [
    { shipping_class: 'small', weight_kg: 5, unit_price_ht: 40, quantity: 1 },
  ];

  it('seuil par zone', () => {
    expect(seuilFranco('FR_METRO', cfg)).toBe(150);
    expect(seuilFranco('FR_CORSE', cfg)).toBeNull();
    expect(seuilFranco('EUROPE', cfg)).toBeNull();
    expect(seuilFranco('OM1', cfg)).toBeNull();
  });

  it('au-delà du seuil métropole, domicile et relais sont offerts', () => {
    const offres = listerOffresLivraison(cher, FR('75001'), cfg);
    expect(parMode(offres, 'domicile')!.prix_ttc).toBe(0);
    expect(parMode(offres, 'relais')!.prix_ttc).toBe(0);
    // …mais pas l'express, exclu du franco par défaut.
    expect(parMode(offres, 'express')!.prix_ttc).toBeGreaterThan(0);
  });

  it('en dessous du seuil, rien n’est offert', () => {
    expect(parMode(listerOffresLivraison(modeste, FR('75001'), cfg), 'domicile')!.prix_ttc)
      .toBeGreaterThan(0);
  });

  it('les articles palettisés sont exclus du franco', () => {
    const machineChere: ShippingLine[] = [
      { shipping_class: 'large', weight_kg: 60, unit_price_ht: 2500, quantity: 1 },
    ];
    const q = computeShipping(machineChere, FR('75001'), cfg, { destinataire: 'entreprise' });
    expect(q.cost).toBeGreaterThan(0);
  });

  it('un panier mixte ne compte pas la valeur palettisée dans le seuil', () => {
    const a = analyserEnvoi(
      [
        { shipping_class: 'large', weight_kg: 60, unit_price_ht: 2500, quantity: 1 },
        { shipping_class: 'small', weight_kg: 1, unit_price_ht: 30, quantity: 1 },
      ],
      FR('75001'),
      cfg
    );
    expect(a.montantFrancoHt).toBe(30);
  });

  it('aucun franco hors métropole tant qu’il n’est pas paramétré', () => {
    // 400 € HT de marchandise : au-dessus du seuil métropole, mais le franco
    // outre-mer et Corse est désactivé par défaut (le port y coûte 3 à 10 fois
    // plus cher, l'offrir effacerait la marge).
    expect(parMode(listerOffresLivraison(cher, FR('97400'), cfg), 'domicile')!.prix_ttc).toBe(38.9);
    expect(parMode(listerOffresLivraison(cher, FR('20000'), cfg), 'domicile')!.prix_ttc)
      .toBeGreaterThan(0);
    expect(parMode(listerOffresLivraison(cher, { postal_code: '1000', country: 'Belgique' }, cfg), 'domicile')!
      .prix_ttc).toBeGreaterThan(0);
  });

  it('le seuil UE paramétré s’applique bien', () => {
    const configUe = avec({ franco: { metropole: 150, corse_iles: null, ue: 300, outre_mer: null } });
    const offres = listerOffresLivraison(cher, { postal_code: '1000', country: 'Belgique' }, configUe);
    expect(parMode(offres, 'domicile')!.prix_ttc).toBe(0);
  });

  it('le montant peut aussi être fourni par les options', () => {
    const offres = listerOffresLivraison(colis(5), FR('75001'), cfg, { montant_ht: 500 });
    expect(parMode(offres, 'domicile')!.prix_ttc).toBe(0);
  });
});

/* ═════════════════════════════════════════════════════════════════════════
   Rétrocompatibilité de computeShipping
   ═════════════════════════════════════════════════════════════════════════ */

describe('computeShipping — rétrocompatibilité', () => {
  it('renvoie toujours la forme historique', () => {
    const q = computeShipping(colis(2), FR('75001'), cfg);
    expect(q).toHaveProperty('method');
    expect(q).toHaveProperty('label');
    expect(q).toHaveProperty('cost');
    expect(q).toHaveProperty('needsAddress');
    expect(q).toHaveProperty('needsQuote');
    expect(q).toHaveProperty('expressAvailable');
    expect(q).toHaveProperty('palletUnits');
    expect(q).toHaveProperty('parcelWeightKg');
    expect(q.method).toBe('parcel');
    expect(typeof q.cost).toBe('number');
  });

  it('cost est un TTC : devis-commande le divise par 1,2 pour obtenir le HT', () => {
    const q = computeShipping(colis(5), FR('75001'), cfg);
    expect(round2(q.cost! / 1.2)).toBe(q.offre!.prix_ht);
  });

  it('renvoie l’offre la moins chère du mode par défaut (domicile)', () => {
    const q = computeShipping(colis(5), FR('75001'), cfg);
    expect(q.offre!.mode).toBe('domicile');
    // Le point relais est moins cher, mais ce n'est pas le mode par défaut.
    const relais = parMode(q.offres!, 'relais')!;
    expect(relais.prix_ttc).toBeLessThan(q.cost!);
  });

  it('le mode par défaut est configurable', () => {
    const q = computeShipping(colis(5), FR('75001'), avec({ mode_par_defaut: 'relais' }));
    expect(q.offre!.mode).toBe('relais');
  });

  it('poids total = Σ poids facturé × quantité', () => {
    const q = computeShipping(
      [
        { shipping_class: 'small', weight_kg: 0.8, quantity: 2 },
        { shipping_class: 'small', weight_kg: 0.2, quantity: 1 },
      ],
      FR('75001'),
      cfg
    );
    expect(q.parcelWeightKg).toBe(1.8);
  });

  it('identifiants `method` historiques conservés pour la palette', () => {
    const machine: ShippingLine[] = [{ shipping_class: 'large', weight_kg: 60, quantity: 1 }];
    const pro = { destinataire: 'entreprise' as const };
    expect(computeShipping(machine, FR('34500'), cfg, pro).method).toBe('pallet_fr_0_200');
    expect(computeShipping(machine, FR('69001'), cfg, pro).method).toBe('pallet_fr_200_500');
    expect(computeShipping(machine, FR('75001'), cfg, pro).method).toBe('pallet_fr_far');
    expect(computeShipping(machine, FR('20000'), cfg, pro).method).toBe('pallet_fr_far');
    const BE = { postal_code: '1000', country: 'Belgique' };
    expect(computeShipping(machine, BE, cfg, pro).method).toBe('pallet_europe');
    expect(computeShipping(machine, BE, cfg, { ...pro, express: true }).method).toBe('pallet_express_eu');
  });

  it('barème personnalisé : on retrouve les prix v2 en métropole et en Europe', () => {
    // Plancher désactivé pour retrouver le barème v2 à l'identique — c'est
    // justement ce 7,99 € que le plancher commercial vient corriger.
    const legacy = avec({ utiliser_bareme_personnalise: true, plancher_colis_metropole_ttc: null });
    expect(computeShipping(colis(1), FR('75001'), legacy).cost).toBe(7.99);
    expect(computeShipping(colis(1.5), FR('75001'), legacy).cost).toBe(15.9);
    expect(computeShipping(colis(0.5), { postal_code: '1000', country: 'Belgique' }, legacy).cost)
      .toBe(19.99); // 7,99 + surcoût Europe 12 €
    const machine: ShippingLine[] = [{ shipping_class: 'large', weight_kg: 60, quantity: 1 }];
    expect(computeShipping(machine, FR('34500'), legacy, { destinataire: 'entreprise' }).cost).toBe(90);
    expect(computeShipping(machine, FR('75001'), legacy, { destinataire: 'entreprise' }).cost).toBe(250);
  });

  it('…mais le barème personnalisé NE réintroduit PAS le bug outre-mer', () => {
    const legacy = avec({ utiliser_bareme_personnalise: true });
    const q = computeShipping(colis(5), FR('97400'), legacy);
    expect(q.cost).not.toBe(7.99);
    expect(q.cost).toBe(38.9);
  });
});

/* ═════════════════════════════════════════════════════════════════════════
   Configuration
   ═════════════════════════════════════════════════════════════════════════ */

describe('parcelPriceForWeight (barème personnalisé par tranches)', () => {
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
    expect(c.parcel_brackets[0].price).toBe(9.5);
    expect(c.pallet_zones.fr_0_200).toBe(129);
    expect(c.pallet_zones.fr_far).toBe(259);
    expect(c.delay_days).toBe(5);
    expect(c.pallet_zones.europe).toBe(cfg.pallet_zones.europe);
  });

  it('trie et nettoie les tranches', () => {
    const c = normalizeShippingConfig({
      parcel_brackets: [
        { max_kg: 5, price: 20 },
        { max_kg: 1, price: 8 },
        { max_kg: 0, price: 99 },
      ],
    });
    expect(c.parcel_brackets).toEqual([
      { max_kg: 1, price: 8 },
      { max_kg: 5, price: 20 },
    ]);
  });

  it('une config v2 enregistrée en base reçoit les défauts v3', () => {
    const c = normalizeShippingConfig({ parcel_over_price: 99, delay_days: 4 });
    expect(c.parcel_over_price).toBe(99);
    expect(c.utiliser_bareme_personnalise).toBe(false);
    expect(c.supplements_palette.surcharge_carburant_pct).toBe(17.11);
    expect(c.franco.metropole).toBe(150);
    expect(c.mode_par_defaut).toBe('domicile');
  });

  it('rejette les valeurs hors domaine et les seuils négatifs', () => {
    const c = normalizeShippingConfig({
      service_express: 'chrono42',
      mode_par_defaut: 'teleportation',
      franco: { metropole: -5, ue: 200 },
      franco_modes: ['domicile', 'inexistant'],
    });
    expect(c.service_express).toBe('chrono18');
    expect(c.mode_par_defaut).toBe('domicile');
    expect(c.franco.metropole).toBe(150);
    expect(c.franco.ue).toBe(200);
    expect(c.franco_modes).toEqual(['domicile']);
  });

  it('un franco explicitement null est respecté', () => {
    expect(normalizeShippingConfig({ franco: { metropole: null } }).franco.metropole).toBeNull();
  });

  it('les suppléments sont paramétrables', () => {
    const c = normalizeShippingConfig({
      supplements_palette: { hayon_ht: 30, surcharge_carburant_pct: 16.39 },
    });
    expect(c.supplements_palette.hayon_ht).toBe(30);
    expect(c.supplements_palette.surcharge_carburant_pct).toBe(16.39);
    expect(c.supplements_palette.rdv_ht).toBe(15); // défaut conservé
  });
});

/* ═════════════════════════════════════════════════════════════════════════
   Cohérence globale : aucune offre ne doit être vendue à perte
   ═════════════════════════════════════════════════════════════════════════ */

describe('cohérence des offres', () => {
  it('toute offre chiffrée porte un service, un transporteur et un délai', () => {
    const destinations = [FR('34000'), FR('75001'), FR('20000'), FR('97400'), FR('98800'),
      { postal_code: '1000', country: 'Belgique' }];
    for (const dest of destinations) {
      for (const poids of [0.5, 5, 20, 45]) {
        for (const o of listerOffresLivraison(colis(poids), dest, cfg)) {
          expect(o.service).toBeTruthy();
          expect(o.carrier).toBeTruthy();
          expect(o.prix_ht).toBeGreaterThanOrEqual(0);
          expect(o.prix_ttc).toBeGreaterThanOrEqual(o.prix_ht);
          if (!o.sur_devis) expect(o.delai_max_j).toBeGreaterThanOrEqual(o.delai_min_j);
        }
      }
    }
  });

  it('aucun colis outre-mer n’est facturé au tarif métropole', () => {
    const c = avec({ plancher_colis_metropole_ttc: null }); // grilles nues
    for (const cp of ['97100', '97200', '97300', '97400', '97600', '98800', '98700']) {
      for (const poids of [0.5, 1, 2, 5, 10, 15, 30]) {
        const om = computeShipping(colis(poids), FR(cp), c).cost!;
        expect(om).toBeGreaterThan(computeShipping(colis(poids), FR('75001'), c).cost!);
      }
    }
  });
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
