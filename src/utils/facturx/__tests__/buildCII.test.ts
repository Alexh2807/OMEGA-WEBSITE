import { describe, it, expect } from 'vitest';
import {
  buildFacturXXml,
  computeTotals,
  escapeXml,
  FacturXInput,
} from '../buildCII';
import {
  facturxInputFromInvoice,
  sirenFromSiret,
  omegaSellerParty,
  codePaysIso,
} from '../fromInvoice';
import {
  categorieTva,
  motifExonerationTva,
  baseLegaleTva,
} from '../categorieTva';
import { Invoice } from '../../../types/billing';

/** Facture minimale : chaque cas n'écrase que ce qu'il veut éprouver. */
const factureType = (surcharge: Partial<Invoice> = {}): Invoice => ({
  id: 'inv',
  invoice_number: 'FAC-0001',
  customer_id: 'c',
  customer_name: 'Client',
  customer_email: 'c@ex.com',
  status: 'paid',
  subtotal_ht: 100,
  tax_amount: 0,
  total_ttc: 100,
  amount_paid: 0,
  payment_terms: 30,
  created_by: 'admin',
  created_at: '2026-06-20T10:00:00Z',
  updated_at: '2026-06-20T10:00:00Z',
  invoice_items: [
    {
      id: 'i1',
      invoice_id: 'inv',
      description: 'Machine à fumée',
      quantity: 1,
      unit_price_ht: 100,
      tax_rate: 0,
      total_ht: 100,
      total_ttc: 100,
      sort_order: 1,
    },
  ],
  ...surcharge,
});

describe('computeTotals', () => {
  it('agrège HT, TVA et TTC sur un seul taux', () => {
    const t = computeTotals([
      { id: '1', name: 'A', quantity: 1, unitPriceHt: 100, lineTotalHt: 100, taxRatePercent: 20 },
      { id: '2', name: 'B', quantity: 2, unitPriceHt: 50, lineTotalHt: 100, taxRatePercent: 20 },
    ]);
    expect(t.lineTotalHt).toBe(200);
    expect(t.taxTotal).toBe(40);
    expect(t.grandTotalTtc).toBe(240);
    expect(t.duePayable).toBe(240);
  });

  it('gère plusieurs taux de TVA', () => {
    const t = computeTotals([
      { id: '1', name: 'A', quantity: 1, unitPriceHt: 100, lineTotalHt: 100, taxRatePercent: 20 },
      { id: '2', name: 'B', quantity: 1, unitPriceHt: 100, lineTotalHt: 100, taxRatePercent: 5.5 },
    ]);
    expect(t.lineTotalHt).toBe(200);
    expect(t.taxTotal).toBe(25.5);
    expect(t.grandTotalTtc).toBe(225.5);
  });
});

describe('escapeXml', () => {
  it('échappe les caractères spéciaux', () => {
    expect(escapeXml('A & B <c> "d"')).toBe('A &amp; B &lt;c&gt; &quot;d&quot;');
  });
});

describe('buildFacturXXml', () => {
  const input: FacturXInput = {
    invoiceNumber: 'FAC-2026-0001',
    issueDate: new Date(Date.UTC(2026, 5, 20)),
    seller: {
      name: 'OMEGA',
      siren: '481088722',
      vatNumber: 'FR74481088722',
      postalCode: '34290',
      city: 'MONTBLANC',
      countryCode: 'FR',
    },
    buyer: { name: 'Client SARL', vatNumber: 'FR00123456789', countryCode: 'FR' },
    lines: [
      { id: '1', name: 'Hazer', quantity: 1, unitPriceHt: 100, lineTotalHt: 100, taxRatePercent: 20 },
    ],
  };
  const xml = buildFacturXXml(input);

  it('contient les éléments racine CII et le profil BASIC', () => {
    expect(xml).toContain('<rsm:CrossIndustryInvoice');
    expect(xml).toContain('urn:factur-x.eu:1p0:basic');
  });
  it('contient le numéro, le type 380 et la date au format 102', () => {
    expect(xml).toContain('<ram:ID>FAC-2026-0001</ram:ID>');
    expect(xml).toContain('<ram:TypeCode>380</ram:TypeCode>');
    expect(xml).toContain('20260620');
  });
  it('contient le SIREN et la TVA du vendeur', () => {
    expect(xml).toContain('schemeID="0002">481088722');
    expect(xml).toContain('schemeID="VA">FR74481088722');
  });
  it('contient les totaux corrects', () => {
    expect(xml).toContain('<ram:GrandTotalAmount>120.00</ram:GrandTotalAmount>');
    expect(xml).toContain('<ram:TaxTotalAmount currencyID="EUR">20.00</ram:TaxTotalAmount>');
    expect(xml).toContain('<ram:DuePayableAmount>120.00</ram:DuePayableAmount>');
  });
});

describe('facturxInputFromInvoice', () => {
  it('dérive le SIREN OMEGA du SIRET', () => {
    expect(sirenFromSiret('481 088 722 00014')).toBe('481088722');
    expect(omegaSellerParty().siren).toBe('481088722');
  });

  it('mappe une facture de l’app vers une entrée Factur-X', () => {
    const invoice: Invoice = {
      id: 'inv1',
      invoice_number: 'FAC-2026-0002',
      customer_id: 'c1',
      customer_name: 'Jean Dupont',
      customer_email: 'jean@ex.com',
      status: 'paid',
      subtotal_ht: 100,
      tax_amount: 20,
      total_ttc: 120,
      amount_paid: 0,
      payment_terms: 30,
      created_by: 'admin',
      created_at: '2026-06-20T10:00:00Z',
      updated_at: '2026-06-20T10:00:00Z',
      billing_address: {
        address_line_1: '1 rue X',
        postal_code: '34000',
        city: 'Montpellier',
        country: 'France',
      },
      invoice_items: [
        {
          id: 'it1',
          invoice_id: 'inv1',
          description: 'Hazer CO2',
          quantity: 1,
          unit_price_ht: 100,
          tax_rate: 20,
          total_ht: 100,
          total_ttc: 120,
          sort_order: 1,
        },
      ],
    };
    const fx = facturxInputFromInvoice(invoice);
    expect(fx.invoiceNumber).toBe('FAC-2026-0002');
    expect(fx.seller.siren).toBe('481088722');
    expect(fx.buyer.name).toBe('Jean Dupont');
    expect(fx.buyer.countryCode).toBe('FR');
    expect(fx.lines).toHaveLength(1);
    expect(fx.lines[0].taxRatePercent).toBe(20);
    expect(buildFacturXXml(fx)).toContain('FAC-2026-0002');
  });

  it('normalise un taux fourni en fraction (0.2 -> 20)', () => {
    const invoice: Invoice = {
      id: 'inv2',
      invoice_number: 'F2',
      customer_id: 'c',
      customer_name: 'X',
      customer_email: 'x@x.com',
      status: 'draft',
      subtotal_ht: 100,
      tax_amount: 20,
      total_ttc: 120,
      amount_paid: 0,
      payment_terms: 30,
      created_by: 'a',
      created_at: '2026-06-20T10:00:00Z',
      updated_at: '2026-06-20T10:00:00Z',
      invoice_items: [
        {
          id: 'i',
          invoice_id: 'inv2',
          description: 'X',
          quantity: 1,
          unit_price_ht: 100,
          tax_rate: 0.2,
          total_ht: 100,
          total_ttc: 120,
          sort_order: 1,
        },
      ],
    };
    const fx = facturxInputFromInvoice(invoice);
    expect(fx.lines[0].taxRatePercent).toBe(20);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════
   CATÉGORIES DE TVA — la correction la plus lourde de conséquences.
   `CategoryCode` valait « S » EN DUR : la catégorie S impose un taux non nul
   (règle BR-S-05 de la norme EN 16931), donc TOUTE vente exonérée produisait un
   XML invalide, rejeté à la réception obligatoire du 1er septembre 2026.
   ═══════════════════════════════════════════════════════════════════════════════ */

describe('categorieTva — table de décision', () => {
  it('vente France : S, sans motif', () => {
    expect(categorieTva('fr', 'FR')).toBe('S');
    expect(motifExonerationTva('S', null, 'fr', 'FR')).toBeNull();
    expect(baseLegaleTva('fr', 'FR')).toBeNull();
  });

  it('Monaco est une vente France (territoire fiscal français)', () => {
    expect(categorieTva('fr', 'MC')).toBe('S');
  });

  it('vente à distance UE (B2C) : S — c’est une vente taxée', () => {
    expect(categorieTva('ue_b2c', 'UE')).toBe('S');
  });

  it('livraison intracommunautaire B2B : K, art. 262 ter I', () => {
    expect(categorieTva('ue_b2b', 'UE')).toBe('K');
    expect(baseLegaleTva('ue_b2b', 'UE')).toBe('CGI art. 262 ter I');
  });

  it('exportation hors UE : G, art. 262 I', () => {
    expect(categorieTva('export', 'HORS-UE')).toBe('G');
    expect(baseLegaleTva('export', 'HORS-UE')).toBe('CGI art. 262 I');
  });

  it('outre-mer : G, mais art. 294 — PAS l’art. 262 I de l’export', () => {
    // C'était le défaut central : le régime vaut « export » pour la Guadeloupe comme
    // pour la Suisse, et seul le TERRITOIRE les distingue.
    expect(categorieTva('export', 'FR-DOM')).toBe('G');
    expect(categorieTva('export', 'FR-COM')).toBe('G');
    expect(baseLegaleTva('export', 'FR-DOM')).toBe('CGI art. 294');
    expect(motifExonerationTva('G', null, 'export', 'FR-DOM')).toContain('294');
    expect(motifExonerationTva('G', null, 'export', 'HORS-UE')).toContain('262 I');
  });

  it('la mention FIGÉE à la vente prime sur le texte de repli', () => {
    const figee = 'Exonération de TVA — texte arrêté le jour de la vente.';
    expect(motifExonerationTva('G', figee, 'export', 'FR-DOM')).toBe(figee);
  });

  it('une catégorie ≠ S a TOUJOURS un motif (règles BR-E/G/K-10)', () => {
    for (const [regime, territoire] of [
      ['ue_b2b', 'UE'],
      ['export', 'HORS-UE'],
      ['export', 'FR-DOM'],
    ] as const) {
      const code = categorieTva(regime, territoire);
      expect(code).not.toBe('S');
      expect(motifExonerationTva(code, null, regime, territoire)).toBeTruthy();
    }
  });
});

describe('buildFacturXXml — catégories et motifs dans le XML', () => {
  it('une livraison intracommunautaire sort en K avec son motif', () => {
    const fx = facturxInputFromInvoice(
      factureType({
        vat_regime: 'ue_b2b',
        vat_territory: 'UE',
        vat_mention:
          'Autoliquidation — livraison intracommunautaire exonérée (art. 262 ter I du CGI).',
      })
    );
    expect(fx.lines[0].vatCategoryCode).toBe('K');
    const xml = buildFacturXXml(fx);
    expect(xml).toContain('<ram:CategoryCode>K</ram:CategoryCode>');
    expect(xml).not.toContain('<ram:CategoryCode>S</ram:CategoryCode>');
    expect(xml).toContain('<ram:ExemptionReason>');
    expect(xml).toContain('262 ter I');
  });

  it('une livraison outre-mer sort en G avec l’art. 294, pas l’art. 262 I', () => {
    const fx = facturxInputFromInvoice(
      factureType({ vat_regime: 'export', vat_territory: 'FR-DOM' })
    );
    const xml = buildFacturXXml(fx);
    expect(xml).toContain('<ram:CategoryCode>G</ram:CategoryCode>');
    expect(xml).toContain('294');
    expect(xml).not.toContain('262 I du CGI');
  });

  it('une vente France taxée reste en S, SANS motif d’exonération', () => {
    const fx = facturxInputFromInvoice(
      factureType({
        vat_regime: 'fr',
        vat_territory: 'FR',
        tax_amount: 20,
        total_ttc: 120,
        invoice_items: [
          {
            id: 'i1',
            invoice_id: 'inv',
            description: 'Machine à fumée',
            quantity: 1,
            unit_price_ht: 100,
            tax_rate: 20,
            total_ht: 100,
            total_ttc: 120,
            sort_order: 1,
          },
        ],
      })
    );
    const xml = buildFacturXXml(fx);
    expect(xml).toContain('<ram:CategoryCode>S</ram:CategoryCode>');
    expect(xml).not.toContain('<ram:ExemptionReason>');
  });

  it('un taux NUL reste nul : plus de repli à 20 % sur une ligne exonérée', () => {
    const fx = facturxInputFromInvoice(
      factureType({ vat_regime: 'export', vat_territory: 'HORS-UE' })
    );
    expect(fx.lines[0].taxRatePercent).toBe(0);
    expect(buildFacturXXml(fx)).toContain(
      '<ram:RateApplicablePercent>0.00</ram:RateApplicablePercent>'
    );
  });
});

describe('buildFacturXXml — avoir (code 381)', () => {
  it('un avoir sort en 381 et référence la facture d’origine', () => {
    const fx = facturxInputFromInvoice(
      factureType({
        invoice_number: 'AV-0001',
        document_type: 'credit_note',
        credit_note_of: 'f0000000-0000-4000-8000-000000000001',
        subtotal_ht: -100,
        tax_amount: -20,
        total_ttc: -120,
        vat_regime: 'fr',
        vat_territory: 'FR',
      })
    );
    expect(fx.documentTypeCode).toBe(381);
    const xml = buildFacturXXml(fx);
    expect(xml).toContain('<ram:TypeCode>381</ram:TypeCode>');
    expect(xml).toContain('<ram:InvoiceReferencedDocument>');
    expect(xml).toContain('<ram:GrandTotalAmount>-120.00</ram:GrandTotalAmount>');
  });

  it('une facture ordinaire reste en 380', () => {
    const fx = facturxInputFromInvoice(factureType());
    expect(fx.documentTypeCode).toBe(380);
    expect(buildFacturXXml(fx)).toContain('<ram:TypeCode>380</ram:TypeCode>');
  });
});

describe('BR-CO-16 — le montant déjà encaissé', () => {
  it('une facture réglée émet TotalPrepaidAmount et un dû à zéro', () => {
    const fx = facturxInputFromInvoice(
      factureType({
        subtotal_ht: 210,
        tax_amount: 42,
        total_ttc: 252,
        amount_paid: 252,
        vat_regime: 'fr',
        vat_territory: 'FR',
      })
    );
    expect(fx.totals?.prepaidAmount).toBe(252);
    expect(fx.totals?.duePayable).toBe(0);
    const xml = buildFacturXXml(fx);
    // 252 (total) − 252 (prépayé) = 0 (dû) : l'égalité de la règle BR-CO-16 est vraie.
    expect(xml).toContain('<ram:GrandTotalAmount>252.00</ram:GrandTotalAmount>');
    expect(xml).toContain('<ram:TotalPrepaidAmount>252.00</ram:TotalPrepaidAmount>');
    expect(xml).toContain('<ram:DuePayableAmount>0.00</ram:DuePayableAmount>');
  });

  it('une facture non réglée n’émet PAS de prépayé (un zéro n’apporte rien)', () => {
    const fx = facturxInputFromInvoice(
      factureType({ total_ttc: 120, amount_paid: 0, tax_amount: 20 })
    );
    expect(buildFacturXXml(fx)).not.toContain('TotalPrepaidAmount');
  });
});

describe('codePaysIso — la conversion qui inventait des pays', () => {
  it('résout les noms qui tombaient FAUX avec slice(0, 2)', () => {
    // Allemagne → AL (Albanie), Royaume-Uni → RO (Roumanie), Pays-Bas → PA (Panama).
    expect(codePaysIso('Allemagne')).toBe('DE');
    expect(codePaysIso('Royaume-Uni')).toBe('GB');
    expect(codePaysIso('Pays-Bas')).toBe('NL');
    expect(codePaysIso('Suisse')).toBe('CH');
    expect(codePaysIso('Espagne')).toBe('ES');
  });

  it('accepte les accents, la casse et un code ISO déjà correct', () => {
    expect(codePaysIso('SUÈDE')).toBe('SE');
    expect(codePaysIso('  belgique ')).toBe('BE');
    expect(codePaysIso('DE')).toBe('DE');
  });

  it('champ vide = vente locale ; libellé inconnu = rien d’inventé', () => {
    expect(codePaysIso('')).toBe('FR');
    expect(codePaysIso('Pays imaginaire')).toBeUndefined();
  });

  it('le code pays FIGÉ sur la facture prime sur le libellé de l’adresse', () => {
    const fx = facturxInputFromInvoice(
      factureType({
        customer_country: 'DE',
        billing_address: { country: 'Allemagne', city: 'Berlin' },
      })
    );
    expect(fx.buyer.countryCode).toBe('DE');
  });
});
