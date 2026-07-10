import { describe, it, expect } from 'vitest';
import {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFArray,
  PDFString,
  PDFHexString,
} from 'pdf-lib';
import { buildFacturXPdf } from '../buildFacturXPdf';
import { FacturXInput } from '../buildCII';

/** Lit les noms des fichiers embarqués (pièces jointes) d'un PDF. */
function attachmentNames(doc: PDFDocument): string[] {
  const out: string[] = [];
  const names = doc.catalog.lookupMaybe(PDFName.of('Names'), PDFDict);
  const ef = names?.lookupMaybe(PDFName.of('EmbeddedFiles'), PDFDict);
  const arr = ef?.lookupMaybe(PDFName.of('Names'), PDFArray);
  if (!arr) return out;
  for (let i = 0; i < arr.size(); i += 2) {
    const n = arr.lookup(i);
    if (n instanceof PDFString || n instanceof PDFHexString) out.push(n.decodeText());
  }
  return out;
}

const input: FacturXInput = {
  invoiceNumber: 'FAC-2026-0001',
  issueDate: new Date(Date.UTC(2026, 5, 20)),
  seller: {
    name: 'OMEGA',
    siren: '481088722',
    vatNumber: 'FR74481088722',
    addressLine: 'LOT ARTISANAL COMMUNAL',
    postalCode: '34290',
    city: 'MONTBLANC',
    countryCode: 'FR',
  },
  buyer: {
    name: 'Jean Dupont',
    addressLine: '1 rue X',
    postalCode: '34000',
    city: 'Montpellier',
    countryCode: 'FR',
  },
  lines: [
    { id: '1', name: 'OMEGA Hazer CO2', quantity: 1, unitPriceHt: 100, lineTotalHt: 100, taxRatePercent: 20 },
    { id: '2', name: 'Liquide Pro Hazer 5L', quantity: 2, unitPriceHt: 25, lineTotalHt: 50, taxRatePercent: 20 },
  ],
};

describe('buildFacturXPdf', () => {
  it('produit un PDF valide avec factur-x.xml embarqué', async () => {
    const bytes = await buildFacturXPdf(input);
    expect(bytes.byteLength).toBeGreaterThan(1500);

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toContain('FAC-2026-0001');
    expect(attachmentNames(doc)).toContain('factur-x.xml');
  });

  it('utilise le XML fourni en override et reste un PDF valide', async () => {
    const bytes = await buildFacturXPdf(
      input,
      '<rsm:CrossIndustryInvoice>OVERRIDE</rsm:CrossIndustryInvoice>'
    );
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(attachmentNames(doc)).toContain('factur-x.xml');
  });
});
