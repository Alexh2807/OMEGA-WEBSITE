/**
 * Convertit une facture de l'application (type Invoice) en entrée Factur-X,
 * en y injectant les informations légales du vendeur (OMEGA).
 */
import { Invoice } from '../../types/billing';
import { COMPANY_INFO } from '../../config/legalInfo';
import { FacturXInput, FacturXLine, FacturXParty } from './buildCII';

const digits = (s?: string): string => (s ?? '').replace(/\D/g, '');

/** SIREN = 9 premiers chiffres du SIRET. */
export const sirenFromSiret = (siret?: string): string | undefined => {
  const d = digits(siret).slice(0, 9);
  return d.length === 9 ? d : undefined;
};

const FR_NAMES = ['france', 'fr'];
const countryToCode = (c?: string): string => {
  if (!c) return 'FR';
  const t = c.trim();
  if (t.length === 2) return t.toUpperCase();
  if (FR_NAMES.includes(t.toLowerCase())) return 'FR';
  return t.slice(0, 2).toUpperCase();
};

/** Normalise un taux : accepte 20 (%) ou 0.2 (fraction). Défaut 20. */
const normalizeRate = (r?: number): number => {
  if (r == null || !Number.isFinite(r)) return 20;
  return r > 0 && r <= 1 ? r * 100 : r;
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
  return {
    name: invoice.customer_name || a.company || 'Client',
    siren: a.siren ? digits(a.siren).slice(0, 9) || undefined : undefined,
    vatNumber: a.vat_number || undefined,
    addressLine: a.address_line_1 || undefined,
    postalCode: a.postal_code || undefined,
    city: a.city || undefined,
    countryCode: countryToCode(a.country),
  };
};

/**
 * Construit l'entrée Factur-X complète depuis une facture de l'app.
 */
export const facturxInputFromInvoice = (invoice: Invoice): FacturXInput => {
  const lines: FacturXLine[] = (invoice.invoice_items ?? []).map((item, idx) => ({
    id: (item.sort_order ?? idx + 1).toString(),
    name: item.description,
    quantity: item.quantity,
    unitPriceHt: item.unit_price_ht,
    lineTotalHt: item.total_ht,
    taxRatePercent: normalizeRate(item.tax_rate),
  }));

  const duePayable = Math.max(0, invoice.total_ttc - (invoice.amount_paid ?? 0));

  return {
    invoiceNumber: invoice.invoice_number,
    issueDate: new Date(invoice.created_at),
    dueDate: invoice.due_date ? new Date(invoice.due_date) : undefined,
    currency: 'EUR',
    seller: omegaSellerParty(),
    buyer: buyerPartyFromInvoice(invoice),
    lines,
    totals: {
      lineTotalHt: invoice.subtotal_ht,
      taxBasisTotal: invoice.subtotal_ht,
      taxTotal: invoice.tax_amount,
      grandTotalTtc: invoice.total_ttc,
      duePayable,
    },
    profile: 'basic',
  };
};
