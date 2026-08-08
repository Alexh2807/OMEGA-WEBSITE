/* ═══════════════════════════════════════════════════════════════════════════════
   COPIE SERVEUR — NE PAS MODIFIER SANS RÉPERCUTER L'AUTRE EXEMPLAIRE.

   Original : `src/utils/facturx/buildCII.ts` (navigateur, couvert par des tests).
   Une fonction Edge ne peut pas importer hors de son dossier : le bundle Supabase
   ne suit que les chemins relatifs internes. La copie est donc IDENTIQUE, au
   caractère près, en dehors de cet en-tête ET de l'extension `.ts` des imports,
   que Deno exige et que le navigateur omet.

   ⚠ Toute correction faite ici doit être reportée dans `src/utils/facturx/`, et
   réciproquement. Le même schéma existe déjà pour `shipping.ts`.
   ═══════════════════════════════════════════════════════════════════════════════ */

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

// ⚠ SEULE différence avec l'original : Deno exige l'extension explicite.
import { CategorieTva } from './categorieTva.ts';

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
  /**
   * Catégorie de TVA (BT-151). ★ Valait « S » EN DUR, ligne et récapitulatif.
   * La catégorie S impose un taux non nul (règle BR-S-05) : toute vente exonérée
   * produisait un XML invalide, rejeté à la réception obligatoire de septembre 2026.
   * Défaut `S` si absente — le cas d'une vente taxée ordinaire.
   */
  vatCategoryCode?: CategorieTva;
  /**
   * Motif d'exonération (BT-127 en ligne, BT-120 au récapitulatif). OBLIGATOIRE dès que
   * la catégorie n'est pas « S » (règles BR-E-10 / BR-G-10 / BR-K-10). Était absent.
   */
  vatExemptionReason?: string | null;
}

export interface FacturXTotals {
  lineTotalHt: number;
  taxBasisTotal: number;
  taxTotal: number;
  grandTotalTtc: number;
  duePayable: number;
  /**
   * BT-113 — montant DÉJÀ ENCAISSÉ. ★ N'était jamais émis.
   * La règle BR-CO-16 impose `DuePayableAmount = GrandTotal − TotalPrepaid`. Sur une
   * vente e-commerce, la facture est réglée avant d'être éditée : le montant dû vaut 0
   * alors que le total vaut 252 €. Sans `TotalPrepaidAmount`, l'égalité est fausse et le
   * dépôt est refusé — c'est-à-dire à CHAQUE vente du site.
   */
  prepaidAmount?: number;
}

export type FacturXProfile = 'basic' | 'en16931';

/** 380 = facture · 381 = AVOIR (UNTDID 1001). */
export type FacturXDocumentTypeCode = 380 | 381;

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
  /**
   * ★ Valait 380 EN DUR : le code 381 (avoir) n'était JAMAIS produit, si bien qu'un avoir
   * archivé se présentait comme une facture — une seconde vente, au lieu de son annulation.
   */
  documentTypeCode?: FacturXDocumentTypeCode;
  /**
   * Facture annulée par cet avoir (bloc BG-3 / BT-25, BT-26). Obligatoire sur un 381 :
   * un avoir qui ne dit pas ce qu'il annule n'annule rien.
   */
  precedingInvoice?: { number: string; issueDate?: Date } | null;
  /** Date de livraison réelle (BT-72) — fait générateur de l'exigibilité de la TVA. */
  deliveryDate?: Date;
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
    prepaidAmount: 0,
  };
};

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

interface TaxBucket {
  ratePercent: number;
  basisAmount: number;
  taxAmount: number;
  categoryCode: CategorieTva;
  exemptionReason: string | null;
}

/**
 * Regroupe la TVA par couple (CATÉGORIE, taux) — et non par taux seul.
 * La norme (bloc BG-23) veut une entrée par couple : deux opérations à 0 % qui
 * relèvent de catégories différentes (K intracommunautaire, G export) ne se
 * confondent pas, et chacune porte son propre motif d'exonération.
 */
const aggregateTaxByRate = (lines: FacturXLine[]): TaxBucket[] => {
  const map = new Map<
    string,
    { ratePercent: number; categoryCode: CategorieTva; exemptionReason: string | null; basis: number }
  >();
  for (const l of lines) {
    const categoryCode: CategorieTva = l.vatCategoryCode ?? 'S';
    const cle = `${categoryCode}|${l.taxRatePercent}`;
    const courant = map.get(cle);
    if (courant) {
      courant.basis += l.lineTotalHt;
    } else {
      map.set(cle, {
        ratePercent: l.taxRatePercent,
        categoryCode,
        exemptionReason: l.vatExemptionReason ?? null,
        basis: l.lineTotalHt,
      });
    }
  }
  return [...map.values()]
    .sort((a, b) => a.ratePercent - b.ratePercent || a.categoryCode.localeCompare(b.categoryCode))
    .map(b => ({
      ratePercent: b.ratePercent,
      categoryCode: b.categoryCode,
      exemptionReason: b.exemptionReason,
      basisAmount: round2(b.basis),
      taxAmount: round2((b.basis * b.ratePercent) / 100),
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

const lineXml = (l: FacturXLine): string => {
  const categorie: CategorieTva = l.vatCategoryCode ?? 'S';
  /* ExemptionReason au niveau LIGNE (BT-127) : n'a de sens — et n'est admis — que
     lorsque la catégorie n'est pas « S ». L'ajouter sur une ligne taxée ferait échouer
     la validation aussi sûrement que de l'omettre sur une ligne exonérée. */
  const motif =
    categorie !== 'S' && l.vatExemptionReason
      ? `<ram:ExemptionReason>${escapeXml(l.vatExemptionReason)}</ram:ExemptionReason>`
      : '';
  return (
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
    `<ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode>${motif}<ram:CategoryCode>${escapeXml(
      categorie
    )}</ram:CategoryCode><ram:RateApplicablePercent>${amt(
      l.taxRatePercent
    )}</ram:RateApplicablePercent></ram:ApplicableTradeTax>` +
    `<ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${amt(
      l.lineTotalHt
    )}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>` +
    `</ram:SpecifiedLineTradeSettlement>` +
    `</ram:IncludedSupplyChainTradeLineItem>`
  );
};

/**
 * Construit le XML Factur-X (CII) complet.
 */
export const buildFacturXXml = (input: FacturXInput): string => {
  const currency = input.currency ?? 'EUR';
  const profile = input.profile ?? 'basic';
  const totals = input.totals ?? computeTotals(input.lines);
  const taxBuckets = aggregateTaxByRate(input.lines);

  /* Récapitulatif de TVA (BG-23). L'ordre des sous-éléments est IMPOSÉ par le schéma
     CII : CalculatedAmount, TypeCode, ExemptionReason, BasisAmount, CategoryCode,
     RateApplicablePercent. Placer le motif ailleurs invalide le document aussi sûrement
     que de l'omettre. */
  const headerTax = taxBuckets
    .map(b => {
      const motif =
        b.categoryCode !== 'S' && b.exemptionReason
          ? `<ram:ExemptionReason>${escapeXml(b.exemptionReason)}</ram:ExemptionReason>`
          : '';
      return (
        `<ram:ApplicableTradeTax>` +
        `<ram:CalculatedAmount>${amt(b.taxAmount)}</ram:CalculatedAmount>` +
        `<ram:TypeCode>VAT</ram:TypeCode>` +
        motif +
        `<ram:BasisAmount>${amt(b.basisAmount)}</ram:BasisAmount>` +
        `<ram:CategoryCode>${escapeXml(b.categoryCode)}</ram:CategoryCode>` +
        `<ram:RateApplicablePercent>${amt(b.ratePercent)}</ram:RateApplicablePercent>` +
        `</ram:ApplicableTradeTax>`
      );
    })
    .join('');

  const paymentTerms = input.dueDate
    ? `<ram:SpecifiedTradePaymentTerms><ram:DueDateDateTime><udt:DateTimeString format="102">${dt102(
        input.dueDate
      )}</udt:DateTimeString></ram:DueDateDateTime></ram:SpecifiedTradePaymentTerms>`
    : '';

  /* 380 facture · 381 avoir. Le code était figé à 380 : un avoir archivé se présentait
     comme une facture, donc comme une vente de plus au lieu de son annulation. */
  const typeCode = input.documentTypeCode ?? 380;

  /* BG-3 / BT-25, BT-26 — la facture que cet avoir annule. */
  const precedingInvoice = input.precedingInvoice
    ? `<ram:InvoiceReferencedDocument><ram:IssuerAssignedID>${escapeXml(
        input.precedingInvoice.number
      )}</ram:IssuerAssignedID>${
        input.precedingInvoice.issueDate
          ? `<ram:FormattedIssueDateTime><qdt:DateTimeString format="102">${dt102(
              input.precedingInvoice.issueDate
            )}</qdt:DateTimeString></ram:FormattedIssueDateTime>`
          : ''
      }</ram:InvoiceReferencedDocument>`
    : '';

  /* BT-72 — date de livraison réelle. C'est elle qui fixe la période d'exigibilité de la
     TVA sur les biens, pas la date d'édition du document. */
  const delivery = input.deliveryDate
    ? `<ram:ApplicableHeaderTradeDelivery><ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime><udt:DateTimeString format="102">${dt102(
        input.deliveryDate
      )}</udt:DateTimeString></ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent></ram:ApplicableHeaderTradeDelivery>`
    : `<ram:ApplicableHeaderTradeDelivery/>`;

  /* BT-113 — déjà encaissé. N'est émis QUE s'il est non nul : la règle BR-CO-16 veut
     `DuePayable = GrandTotal − TotalPrepaid`, et un zéro explicite n'apporte rien. */
  const prepaid =
    totals.prepaidAmount && Math.abs(totals.prepaidAmount) >= 0.005
      ? `<ram:TotalPrepaidAmount>${amt(totals.prepaidAmount)}</ram:TotalPrepaidAmount>`
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
    )}</ram:ID><ram:TypeCode>${typeCode}</ram:TypeCode><ram:IssueDateTime><udt:DateTimeString format="102">${dt102(
      input.issueDate
    )}</udt:DateTimeString></ram:IssueDateTime></rsm:ExchangedDocument>` +
    `<rsm:SupplyChainTradeTransaction>` +
    input.lines.map(lineXml).join('') +
    `<ram:ApplicableHeaderTradeAgreement>` +
    partyXml('SellerTradeParty', input.seller) +
    partyXml('BuyerTradeParty', input.buyer) +
    `</ram:ApplicableHeaderTradeAgreement>` +
    delivery +
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
    prepaid +
    `<ram:DuePayableAmount>${amt(totals.duePayable)}</ram:DuePayableAmount>` +
    `</ram:SpecifiedTradeSettlementHeaderMonetarySummation>` +
    /* ⚠ ORDRE IMPOSÉ par le schéma CII : `InvoiceReferencedDocument` vient APRÈS le
       récapitulatif monétaire, pas avant. Un élément au bon nom mais à la mauvaise
       place fait échouer la validation aussi sûrement qu'un élément absent. */
    precedingInvoice +
    `</ram:ApplicableHeaderTradeSettlement>` +
    `</rsm:SupplyChainTradeTransaction>` +
    `</rsm:CrossIndustryInvoice>`
  );
};
