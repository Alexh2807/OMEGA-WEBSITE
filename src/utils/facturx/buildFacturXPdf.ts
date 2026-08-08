/**
 * Génère le PDF Factur-X : un PDF à **vrai texte** (pas une image) avec le
 * fichier `factur-x.xml` (CII / EN 16931) **embarqué** comme pièce jointe.
 *
 * ⚠️ Pour la conformité PDF/A-3 stricte (XMP, OutputIntent…), une passe de
 *    validation supplémentaire sera nécessaire à l'étape PA. Ici on produit un
 *    PDF valide avec la pièce jointe normalisée — testable de bout en bout.
 */
import {
  PDFDocument,
  StandardFonts,
  rgb,
  AFRelationship,
  PDFFont,
  PDFPage,
} from 'pdf-lib';
import { FacturXInput, buildFacturXXml, computeTotals } from './buildCII';

const fmtDate = (d: Date): string => {
  const dd = d.getUTCDate().toString().padStart(2, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
};

const eur = (n: number): string => `${n.toFixed(2)} EUR`;
/**
 * ⚠ Coupe en NOMBRE DE CARACTÈRES — conservée pour les usages hors mise en page.
 * Pour tout texte dessiné dans une colonne, utiliser `couperLargeur` : 62 caractères
 * en capitales occupent presque le double de place et débordent sur la colonne voisine.
 */
const truncate = (s: string, max: number): string =>
  s.length > max ? `${s.slice(0, max - 1)}…` : s;

/** Coupe à une LARGEUR mesurée dans la police, avec ellipse. */
const couperLargeur = (
  s: string,
  largeurMax: number,
  f: PDFFont,
  taille: number
): string => {
  const texte = s ?? '';
  if (f.widthOfTextAtSize(texte, taille) <= largeurMax) return texte;
  const dispo = largeurMax - f.widthOfTextAtSize('…', taille);
  let bas = 0, haut = texte.length;
  while (bas < haut) {
    const milieu = Math.ceil((bas + haut) / 2);
    if (f.widthOfTextAtSize(texte.slice(0, milieu), taille) <= dispo) bas = milieu;
    else haut = milieu - 1;
  }
  return texte.slice(0, bas).trimEnd() + '…';
};

const partyLines = (p: {
  name: string;
  addressLine?: string;
  postalCode?: string;
  city?: string;
  countryCode: string;
  vatNumber?: string;
}): string[] => {
  const lines: string[] = [p.name];
  if (p.addressLine) lines.push(p.addressLine);
  const cityLine = [p.postalCode, p.city].filter(Boolean).join(' ');
  if (cityLine) lines.push(cityLine);
  lines.push(p.countryCode === 'FR' ? 'France' : p.countryCode);
  if (p.vatNumber) lines.push(`TVA : ${p.vatNumber}`);
  return lines;
};

/**
 * Encode une chaîne UTF-8 en base64. pdf-lib `attach()` accepte une string base64
 * et la décode lui-même — cela évite les soucis de realm sur Uint8Array (jsdom).
 * Fonctionne côté Node (Buffer) et côté navigateur (btoa).
 */
const toBase64 = (s: string): string => {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(s, 'utf8').toString('base64');
  }
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach(b => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin);
};

export async function buildFacturXPdf(
  input: FacturXInput,
  xmlOverride?: string
): Promise<Uint8Array> {
  const xml = xmlOverride ?? buildFacturXXml(input);
  const totals = input.totals ?? computeTotals(input.lines);

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Facture ${input.invoiceNumber}`);
  pdf.setAuthor(input.seller.name);
  pdf.setProducer('OMEGA - Facturation electronique (Factur-X)');
  pdf.setCreator('OMEGA');
  pdf.setCreationDate(input.issueDate);

  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page: PDFPage = pdf.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const margin = 50;
  const gray = rgb(0.2, 0.2, 0.2);
  const light = rgb(0.45, 0.45, 0.45);
  const white = rgb(1, 1, 1);
  let y = height - margin;

  const text = (
    s: string,
    x: number,
    yy: number,
    o: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb> } = {}
  ) =>
    page.drawText(s ?? '', {
      x,
      y: yy,
      font: o.font ?? helv,
      size: o.size ?? 9,
      color: o.color ?? gray,
    });

  const right = (
    s: string,
    xRight: number,
    yy: number,
    o: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb> } = {}
  ) => {
    const f = o.font ?? helv;
    const size = o.size ?? 9;
    text(s, xRight - f.widthOfTextAtSize(s ?? '', size), yy, o);
  };

  // En-tête
  text('FACTURE', margin, y - 4, { font: bold, size: 22 });
  right(`N° ${input.invoiceNumber}`, width - margin, y, { font: bold, size: 11 });
  right(`Date : ${fmtDate(input.issueDate)}`, width - margin, y - 14, {
    size: 9,
    color: light,
  });
  y -= 42;

  // Vendeur / Acheteur
  const colR = width / 2 + 10;
  text('VENDEUR', margin, y, { font: bold, size: 8, color: light });
  text('FACTURÉ À', colR, y, { font: bold, size: 8, color: light });
  y -= 14;
  const sLines = partyLines(input.seller);
  const bLines = partyLines(input.buyer);
  let yy = y;
  for (let i = 0; i < Math.max(sLines.length, bLines.length); i++) {
    if (sLines[i]) text(sLines[i], margin, yy, { font: i === 0 ? bold : helv });
    if (bLines[i]) text(bLines[i], colR, yy, { font: i === 0 ? bold : helv });
    yy -= 12;
  }
  y = yy - 18;

  // Tableau des lignes
  const cTot = width - margin;
  page.drawRectangle({
    x: margin - 4,
    y: y - 5,
    width: width - 2 * margin + 8,
    height: 18,
    color: rgb(0.13, 0.13, 0.13),
  });
  text('Description', margin, y, { font: bold, color: white });
  right('Qté', 360, y, { font: bold, color: white });
  right('P.U. HT', 460, y, { font: bold, color: white });
  right('Total HT', cTot, y, { font: bold, color: white });
  y -= 22;

  for (const l of input.lines) {
    /* 30 pt réservés : la quantité est alignée à droite sur 360 et s'écrit vers la
       gauche — une désignation qui irait jusqu'à la colonne passerait dessous. */
    text(couperLargeur(l.name, 360 - margin - 30, helv, 9), margin, y, {});
    right(String(l.quantity), 360, y, {});
    right(l.unitPriceHt.toFixed(2), 460, y, {});
    right(l.lineTotalHt.toFixed(2), cTot, y, { font: bold });
    y -= 14;
  }
  y -= 12;

  // Totaux
  const lx = width - 240;
  const totalRow = (label: string, val: string, o: { bold?: boolean; size?: number } = {}) => {
    text(label, lx, y, { font: o.bold ? bold : helv, size: o.size });
    right(val, cTot, y, { font: o.bold ? bold : helv, size: o.size });
    y -= 15;
  };
  totalRow('Sous-total HT', eur(totals.lineTotalHt));
  totalRow('TVA', eur(totals.taxTotal));
  page.drawLine({
    start: { x: lx, y: y + 5 },
    end: { x: cTot, y: y + 5 },
    thickness: 1,
    color: gray,
  });
  /* ⚠ 12 pt, pas 4. Le filet était tracé 10 pt sous la ligne « TVA », et « TOTAL TTC »
     était écrit 4 pt plus bas : en 11 pt gras, le haut des capitales remontait à
     1,1 pt du trait — elles le touchaient visuellement. On descend le total pour
     laisser respirer le séparateur. */
  y -= 12;
  totalRow('TOTAL TTC', eur(totals.grandTotalTtc), { bold: true, size: 11 });
  if (totals.duePayable !== totals.grandTotalTtc) {
    totalRow('Net à payer', eur(totals.duePayable), { bold: true });
  }

  // Pied de page
  const footY = margin + 28;
  text(
    `${input.seller.name} - SIREN ${input.seller.siren ?? ''} - TVA ${input.seller.vatNumber ?? ''}`,
    margin,
    footY,
    { size: 7, color: light }
  );
  text(
    'Facture electronique au format Factur-X (profil BASIC, EN 16931).',
    margin,
    footY - 10,
    { size: 7, color: light }
  );

  // Embarquement du XML Factur-X (base64 → pdf-lib le décode)
  await pdf.attach(toBase64(xml), 'factur-x.xml', {
    mimeType: 'application/xml',
    description: 'Facture electronique Factur-X',
    afRelationship: AFRelationship.Data,
  });

  return pdf.save({ useObjectStreams: false });
}
