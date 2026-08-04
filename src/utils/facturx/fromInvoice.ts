/**
 * Convertit une facture de l'application (type Invoice) en entrée Factur-X,
 * en y injectant les informations légales du vendeur (OMEGA).
 */
import { Invoice } from '../../types/billing';
import { COMPANY_INFO } from '../../config/legalInfo';
import { FacturXInput, FacturXLine, FacturXParty } from './buildCII';
import {
  categorieTva,
  motifExonerationTva,
  CategorieTva,
  RegimeTva,
} from './categorieTva';

const digits = (s?: string): string => (s ?? '').replace(/\D/g, '');

/** SIREN = 9 premiers chiffres du SIRET. */
export const sirenFromSiret = (siret?: string): string | undefined => {
  const d = digits(siret).slice(0, 9);
  return d.length === 9 ? d : undefined;
};

/**
 * Noms de pays → code ISO 3166-1 alpha-2.
 *
 * ## Le défaut corrigé
 * `countryToCode` faisait `t.slice(0, 2).toUpperCase()` sur un nom de pays. Résultat :
 *   « Allemagne »   → **AL** (Albanie)
 *   « Royaume-Uni » → **RO** (Roumanie)
 *   « Pays-Bas »    → **PA** (Panama)
 *   « Belgique »    → BE  ← juste PAR HASARD, ce qui est le pire des cas : un défaut qui
 *                          tombe juste une fois sur deux ne se voit pas.
 * Le code pays de l'acheteur (BT-55) est ce qui détermine, chez le récepteur, si
 * l'opération est nationale, intracommunautaire ou une exportation. Un code faux fait
 * rejeter le document — ou, pire, l'accepte sous un régime qui n'est pas le sien.
 *
 * ## La correspondance
 * La table de référence vit en base (`country_aliases`, résolue par `code_pays()`), et
 * c'est elle qui fait foi — on ajoute un pays LÀ, sans redéployer le site. Mais
 * `facturxInputFromInvoice` est SYNCHRONE et appelée depuis le navigateur au moment de
 * générer le PDF : y glisser un aller-retour réseau la rendrait asynchrone et
 * faillible au pire moment. On embarque donc la même table, tenue à l'identique, avec la
 * même normalisation (minuscules, sans accents ni ponctuation).
 *
 * ⚠ Un pays INCONNU ne retombe plus sur deux lettres inventées : on renvoie `FR` par
 * défaut uniquement quand le champ est vide (vente locale). Un libellé non reconnu rend
 * `undefined`, ce que l'appelant traite explicitement — mieux vaut un champ absent, qui
 * se voit à la validation, qu'un code faux qui passe.
 */
const ALIAS_PAYS: Record<string, string> = {
  // France et assimilés
  france: 'FR',
  fr: 'FR',
  'france metropolitaine': 'FR',
  'republique francaise': 'FR',
  monaco: 'MC',
  mc: 'MC',
  'principaute de monaco': 'MC',
  // Union européenne
  allemagne: 'DE', germany: 'DE', deutschland: 'DE', de: 'DE',
  autriche: 'AT', austria: 'AT', at: 'AT',
  belgique: 'BE', belgium: 'BE', belgie: 'BE', be: 'BE',
  bulgarie: 'BG', bulgaria: 'BG', bg: 'BG',
  chypre: 'CY', cyprus: 'CY', cy: 'CY',
  croatie: 'HR', croatia: 'HR', hr: 'HR',
  danemark: 'DK', denmark: 'DK', dk: 'DK',
  espagne: 'ES', spain: 'ES', espana: 'ES', es: 'ES',
  estonie: 'EE', estonia: 'EE', ee: 'EE',
  finlande: 'FI', finland: 'FI', fi: 'FI',
  grece: 'GR', greece: 'GR', gr: 'GR', el: 'GR',
  hongrie: 'HU', hungary: 'HU', hu: 'HU',
  irlande: 'IE', ireland: 'IE', ie: 'IE',
  italie: 'IT', italy: 'IT', italia: 'IT', it: 'IT',
  lettonie: 'LV', latvia: 'LV', lv: 'LV',
  lituanie: 'LT', lithuania: 'LT', lt: 'LT',
  luxembourg: 'LU', lu: 'LU',
  malte: 'MT', malta: 'MT', mt: 'MT',
  'pays-bas': 'NL', 'pays bas': 'NL', netherlands: 'NL', nederland: 'NL',
  hollande: 'NL', nl: 'NL',
  pologne: 'PL', poland: 'PL', pl: 'PL',
  portugal: 'PT', pt: 'PT',
  'republique tcheque': 'CZ', tchequie: 'CZ', 'czech republic': 'CZ',
  czechia: 'CZ', cz: 'CZ',
  roumanie: 'RO', romania: 'RO', ro: 'RO',
  slovaquie: 'SK', slovakia: 'SK', sk: 'SK',
  slovenie: 'SI', slovenia: 'SI', si: 'SI',
  suede: 'SE', sweden: 'SE', sverige: 'SE', se: 'SE',
  // Irlande du Nord : reste dans le régime intracommunautaire pour les BIENS.
  'irlande du nord': 'XI', 'northern ireland': 'XI', xi: 'XI',
  // Hors UE, fréquents
  suisse: 'CH', switzerland: 'CH', schweiz: 'CH', ch: 'CH',
  'royaume-uni': 'GB', 'royaume uni': 'GB', 'united kingdom': 'GB',
  angleterre: 'GB', gb: 'GB', uk: 'GB',
  norvege: 'NO', norway: 'NO', no: 'NO',
  islande: 'IS', iceland: 'IS', is: 'IS',
  andorre: 'AD', andorra: 'AD', ad: 'AD',
  'etats-unis': 'US', 'etats unis': 'US', 'united states': 'US', usa: 'US', us: 'US',
  canada: 'CA', ca: 'CA',
  maroc: 'MA', morocco: 'MA', ma: 'MA',
  tunisie: 'TN', tunisia: 'TN', tn: 'TN',
  algerie: 'DZ', algeria: 'DZ', dz: 'DZ',
};

/** Même normalisation que `normaliser_pays()` en base : minuscules, sans accents. */
const normaliserPays = (p: string): string =>
  p
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.\s]+/g, ' ')
    .trim();

/** Résout un libellé de pays en code ISO. `undefined` si inconnu — jamais inventé. */
export const codePaysIso = (c?: string | null): string | undefined => {
  const brut = (c ?? '').trim();
  if (brut === '') return 'FR'; // champ vide = vente locale, comme `code_pays()` en base
  const n = normaliserPays(brut);
  const trouve = ALIAS_PAYS[n];
  if (trouve) return trouve;
  // Code ISO déjà correct et non listé (ex. « JP ») : on l'accepte tel quel.
  if (/^[a-z]{2}$/.test(n)) return n.toUpperCase();
  return undefined;
};

/**
 * Normalise un taux : accepte 20 (%) ou 0.2 (fraction).
 *
 * ⚠ Le défaut à 20 a été SUPPRIMÉ. `normalizeRate(0)` renvoyait 20 : une ligne exonérée
 * — export, autoliquidation, outre-mer — devenait taxable dans le XML archivé, avec une
 * TVA que personne n'avait collectée. Un taux nul est une information, pas une absence :
 * seule une valeur réellement manquante (`null`, `NaN`) retombe désormais sur 20, et
 * seulement parce qu'une facture française ordinaire est à 20 %.
 */
const normalizeRate = (r?: number | null): number => {
  if (r == null || !Number.isFinite(r)) return 20;
  const n = Number(r);
  if (n === 0) return 0; // ★ zéro est un taux, pas un « non renseigné »
  return n > 0 && n <= 1 ? n * 100 : n;
};

/** Partie "vendeur" construite à partir des informations légales OMEGA. */
export const omegaSellerParty = (): FacturXParty => ({
  name: COMPANY_INFO.name,
  siren: sirenFromSiret(COMPANY_INFO.siret),
  vatNumber: COMPANY_INFO.vat,
  addressLine: COMPANY_INFO.address.street,
  postalCode: COMPANY_INFO.address.postalCode,
  city: COMPANY_INFO.address.city,
  countryCode: 'FR',
});

/** Partie "acheteur" à partir de l'adresse de facturation de la facture. */
export const buyerPartyFromInvoice = (invoice: Invoice): FacturXParty => {
  const a = (invoice.billing_address ?? invoice.customer_address ?? {}) as any;
  /* Le code pays FIGÉ sur la facture (`customer_country`, issu de `code_pays()` côté
     serveur) prime sur le libellé libre de l'adresse : c'est celui qui a servi à décider
     du régime de TVA, et les deux ne doivent jamais raconter deux histoires. */
  const code = codePaysIso(invoice.customer_country) ?? codePaysIso(a.country);
  return {
    /* Une facture entre professionnels doit porter la RAISON SOCIALE, pas le nom du
       contact : c'est la société qui est le tiers, pas la personne. */
    name: invoice.company_name || a.company || invoice.customer_name || 'Client',
    siren: a.siren ? digits(a.siren).slice(0, 9) || undefined : undefined,
    vatNumber: invoice.vat_number || a.vat_number || undefined,
    addressLine: a.address_line_1 || undefined,
    postalCode: a.postal_code || undefined,
    city: a.city || undefined,
    countryCode: code ?? 'FR',
  };
};

/**
 * Construit l'entrée Factur-X complète depuis une facture de l'app.
 *
 * ★ La catégorie de TVA et le motif d'exonération sont dérivés du RÉGIME et du TERRITOIRE
 * figés sur la facture (module `categorieTva`), et non plus écrits « S » en dur.
 * ★ `prepaidAmount` est émis : sans lui, `DuePayable = 0` sur une facture déjà réglée
 * viole la règle BR-CO-16 — c'est-à-dire à chaque vente e-commerce.
 * ★ Un avoir sort en type 381, avec le renvoi à la facture d'origine.
 */
export const facturxInputFromInvoice = (invoice: Invoice): FacturXInput => {
  const regime = (invoice.vat_regime ?? null) as RegimeTva;
  const territoire = invoice.vat_territory ?? null;
  const categorie: CategorieTva = categorieTva(regime, territoire);
  const motif = motifExonerationTva(
    categorie,
    invoice.vat_mention,
    regime,
    territoire
  );

  const lines: FacturXLine[] = (invoice.invoice_items ?? []).map((item, idx) => ({
    id: (item.sort_order ?? idx + 1).toString(),
    name: item.description,
    quantity: item.quantity,
    unitPriceHt: item.unit_price_ht,
    lineTotalHt: item.total_ht,
    taxRatePercent: normalizeRate(item.tax_rate),
    /* La catégorie est celle de l'OPÉRATION : le port suit le sort fiscal du bien
       transporté, il n'a pas de régime propre. Une ligne à taux nul dans une facture
       taxée resterait néanmoins « S » — ce serait un cas de taux réduit à 0, qui
       n'existe pas dans le barème français, donc il ne se produit pas ici. */
    vatCategoryCode: categorie,
    vatExemptionReason: motif,
  }));

  const estAvoir = invoice.document_type === 'credit_note';

  /* BT-113 — ce qui a DÉJÀ été encaissé. Sur une vente par carte, la facture est éditée
     après le paiement : le total vaut 252 € et le montant dû 0 €. L'égalité
     `DuePayable = GrandTotal − TotalPrepaid` ne tient qu'à condition d'émettre le
     prépayé, ce qui n'était jamais fait. */
  const prepaidAmount = Math.min(
    Math.max(0, invoice.amount_paid ?? 0),
    Math.max(0, invoice.total_ttc)
  );
  const duePayable = Math.max(0, invoice.total_ttc - prepaidAmount);

  return {
    invoiceNumber: invoice.invoice_number,
    issueDate: new Date(invoice.created_at),
    dueDate: invoice.due_date ? new Date(invoice.due_date) : undefined,
    deliveryDate: invoice.delivery_date ? new Date(invoice.delivery_date) : undefined,
    currency: 'EUR',
    seller: omegaSellerParty(),
    buyer: buyerPartyFromInvoice(invoice),
    lines,
    documentTypeCode: estAvoir ? 381 : 380,
    /* ⚠ On ne dispose ici que de l'IDENTIFIANT de la facture annulée. Le NUMÉRO
       (BT-25) suppose une relecture en base : l'appelant le fournit quand il l'a, sinon
       on porte l'identifiant, qui reste un rattachement structuré — infiniment mieux
       que le texte libre d'aujourd'hui. */
    precedingInvoice: estAvoir && invoice.credit_note_of
      ? { number: invoice.credit_note_of }
      : null,
    totals: {
      lineTotalHt: invoice.subtotal_ht,
      taxBasisTotal: invoice.subtotal_ht,
      taxTotal: invoice.tax_amount,
      grandTotalTtc: invoice.total_ttc,
      duePayable: estAvoir ? invoice.total_ttc : duePayable,
      prepaidAmount: estAvoir ? 0 : prepaidAmount,
    },
    profile: 'basic',
  };
};
