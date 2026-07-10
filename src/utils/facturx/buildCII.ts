/**
 * Générateur de XML Factur-X (CII — Cross Industry Invoice, norme EN 16931).
 *
 * Produit le fichier `factur-x.xml` qui sera embarqué dans le PDF/A-3.
 * Profil par défaut : BASIC (suffisant pour la facturation électronique B2B française).
 *
 * ⚠️ Ce XML doit être validé contre le schéma/schematron officiel avant la mise en
 *    production réelle (étape PA). Le format produit ici est conforme à la structure
 *    CII BASIC et sert de base testable.
 */

export interface FacturXParty {
  name: string;
  /** SIREN français (9 chiffres) — identifiant de routage de la réforme */
  siren?: string;
  /** N° TVA intracommunautaire, ex. FR74481088722 */
  vatNumber?: string;
  addressLine?: string;
  postalCode?: string;
  city?: string;
  /** Code pays ISO 3166-1 alpha-2, ex. FR */
  countryCode: string;
}

export interface FacturXLine {
  /** Numéro de ligne, ex. "1" */
  id: string;
  name: string;
  quantity: number;
  unitPriceHt: number;
  lineTotalHt: number;
  /** Taux de TVA en %, ex. 20 */
  taxRatePercent: number;
}

export interface FacturXTotals {
  lineTotalHt: number;
  taxBasisTotal: number;
  taxTotal: number;
  grandTotalTtc: number;
  duePayable: number;
}

export type FacturXProfile = 'basic' | 'en16931';

export interface FacturXInput {
  invoiceNumber: string;
  issueDate: Date;
  /** Devise ISO 4217, défaut EUR */
  currency?: string;
  dueDate?: Date;
  seller: FacturXParty;
  buyer: FacturXParty;
  lines: FacturXLine[];
  /** Calculés à partir des lignes si non fournis */
  totals?: FacturXTotals;
  profile?: FacturXProfile;
}

const PROFILE_URN: Record<FacturXProfile, string> = {
  basic: 'urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic',
  en16931: 'urn:cen.eu:en16931:2017',
};

/** Échappe les caractères spéciaux XML. */
export const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/** Montant CII : 2 décimales, séparateur point. */
const amt = (n: number): string => (Number.isFinite(n) ? n : 0).toFixed(2);

/** Date au format CII 102 = AAAAMMJJ. */
const dt102 = (d: Date): string => {
  const y = d.getUTCFullYear().toString().padStart(4, '0');
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = d.getUTCDate().toString().padStart(2, '0');
  return `${y}${m}${day}`;
};

/** Calcule les totaux à partir des lignes (sans remises/charges d'en-tête). */
export const computeTotals = (lines: FacturXLine[]): FacturXTotals => {
  const lineTotalHt = round2(lines.reduce((s, l) => s + l.lineTotalHt, 0));
  const byRate = aggregateTaxByRate(lines);
  const taxTotal = round2(byRate.reduce((s, r) => s + r.taxAmount, 0));
  const taxBasisTotal = lineTotalHt;
  const grandTotalTtc = round2(taxBasisTotal + taxTotal);
  return {
    lineTotalHt,
    taxBasisTotal,
    taxTotal,
    grandTotalTtc,
    duePayable: grandTotalTtc,
  };
};

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

interface TaxBucket {
  ratePercent: number;
  basisAmount: number;
  taxAmount: number;
}

/** Regroupe la TVA par taux. */
const aggregateTaxByRate = (lines: FacturXLine[]): TaxBucket[] => {
  const map = new Map<number, number>();
  for (const l of lines) {
    map.set(l.taxRatePercent, (map.get(l.taxRatePercent) ?? 0) + l.lineTotalHt);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ratePercent, basis]) => ({
      ratePercent,
      basisAmount: round2(basis),
      taxAmount: round2((basis * ratePercent) / 100),
    }));
};

const partyXml = (tag: string, p: FacturXParty): string => {
  const legalOrg = p.siren
    ? `<ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">${escapeXml(
        p.siren
      )}</ram:ID></ram:SpecifiedLegalOrganization>`
    : '';
  const address = `<ram:PostalTradeAddress>${
    p.postalCode ? `<ram:PostcodeCode>${escapeXml(p.postalCode)}</ram:PostcodeCode>` : ''
  }${p.addressLine ? `<ram:LineOne>${escapeXml(p.addressLine)}</ram:LineOne>` : ''}${
    p.city ? `<ram:CityName>${escapeXml(p.city)}</ram:CityName>` : ''
  }<ram:CountryID>${escapeXml(p.countryCode)}</ram:CountryID></ram:PostalTradeAddress>`;
  const tax = p.vatNumber
    ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${escapeXml(
        p.vatNumber
      )}</ram:ID></ram:SpecifiedTaxRegistration>`
    : '';
  return `<ram:${tag}><ram:Name>${escapeXml(
    p.name
  )}</ram:Name>${legalOrg}${address}${tax}</ram:${tag}>`;
};

const lineXml = (l: FacturXLine): string =>
  `<ram:IncludedSupplyChainTradeLineItem>` +
  `<ram:AssociatedDocumentLineDocument><ram:LineID>${escapeXml(
    l.id
  )}</ram:LineID></ram:AssociatedDocumentLineDocument>` +
  `<ram:SpecifiedTradeProduct><ram:Name>${escapeXml(l.name)}</ram:Name></ram:SpecifiedTradeProduct>` +
  `<ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>${amt(
    l.unitPriceHt
  )}</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>` +
  `<ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="C62">${amt(
    l.quantity
  )}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>` +
  `<ram:SpecifiedLineTradeSettlement>` +
  `<ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>S</ram:CategoryCode><ram:RateApplicablePercent>${amt(
    l.taxRatePercent
  )}</ram:RateApplicablePercent></ram:ApplicableTradeTax>` +
  `<ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${amt(
    l.lineTotalHt
  )}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>` +
  `</ram:SpecifiedLineTradeSettlement>` +
  `</ram:IncludedSupplyChainTradeLineItem>`;

/**
 * Construit le XML Factur-X (CII) complet.
 */
export const buildFacturXXml = (input: FacturXInput): string => {
  const currency = input.currency ?? 'EUR';
  const profile = input.profile ?? 'basic';
  const totals = input.totals ?? computeTotals(input.lines);
  const taxBuckets = aggregateTaxByRate(input.lines);

  const headerTax = taxBuckets
    .map(
      b =>
        `<ram:ApplicableTradeTax>` +
        `<ram:CalculatedAmount>${amt(b.taxAmount)}</ram:CalculatedAmount>` +
        `<ram:TypeCode>VAT</ram:TypeCode>` +
        `<ram:BasisAmount>${amt(b.basisAmount)}</ram:BasisAmount>` +
        `<ram:CategoryCode>S</ram:CategoryCode>` +
        `<ram:RateApplicablePercent>${amt(b.ratePercent)}</ram:RateApplicablePercent>` +
        `</ram:ApplicableTradeTax>`
    )
    .join('');

  const paymentTerms = input.dueDate
    ? `<ram:SpecifiedTradePaymentTerms><ram:DueDateDateTime><udt:DateTimeString format="102">${dt102(
        input.dueDate
      )}</udt:DateTimeString></ram:DueDateDateTime></ram:SpecifiedTradePaymentTerms>`
    : '';

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<rsm:CrossIndustryInvoice` +
    ` xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"` +
    ` xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"` +
    ` xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100"` +
    ` xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100">` +
    `<rsm:ExchangedDocumentContext><ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>${PROFILE_URN[profile]}</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter></rsm:ExchangedDocumentContext>` +
    `<rsm:ExchangedDocument><ram:ID>${escapeXml(
      input.invoiceNumber
    )}</ram:ID><ram:TypeCode>380</ram:TypeCode><ram:IssueDateTime><udt:DateTimeString format="102">${dt102(
      input.issueDate
    )}</udt:DateTimeString></ram:IssueDateTime></rsm:ExchangedDocument>` +
    `<rsm:SupplyChainTradeTransaction>` +
    input.lines.map(lineXml).join('') +
    `<ram:ApplicableHeaderTradeAgreement>` +
    partyXml('SellerTradeParty', input.seller) +
    partyXml('BuyerTradeParty', input.buyer) +
    `</ram:ApplicableHeaderTradeAgreement>` +
    `<ram:ApplicableHeaderTradeDelivery/>` +
    `<ram:ApplicableHeaderTradeSettlement>` +
    `<ram:InvoiceCurrencyCode>${escapeXml(currency)}</ram:InvoiceCurrencyCode>` +
    headerTax +
    paymentTerms +
    `<ram:SpecifiedTradeSettlementHeaderMonetarySummation>` +
    `<ram:LineTotalAmount>${amt(totals.lineTotalHt)}</ram:LineTotalAmount>` +
    `<ram:TaxBasisTotalAmount>${amt(totals.taxBasisTotal)}</ram:TaxBasisTotalAmount>` +
    `<ram:TaxTotalAmount currencyID="${escapeXml(currency)}">${amt(
      totals.taxTotal
    )}</ram:TaxTotalAmount>` +
    `<ram:GrandTotalAmount>${amt(totals.grandTotalTtc)}</ram:GrandTotalAmount>` +
    `<ram:DuePayableAmount>${amt(totals.duePayable)}</ram:DuePayableAmount>` +
    `</ram:SpecifiedTradeSettlementHeaderMonetarySummation>` +
    `</ram:ApplicableHeaderTradeSettlement>` +
    `</rsm:SupplyChainTradeTransaction>` +
    `</rsm:CrossIndustryInvoice>`
  );
};
