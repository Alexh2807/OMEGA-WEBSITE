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
} from '../fromInvoice';
import { Invoice } from '../../../types/billing';

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
