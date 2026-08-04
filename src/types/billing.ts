export interface BillingSettings {
  id: string;
  company_name: string;
  company_address: string;
  company_postal_code: string;
  company_city: string;
  company_country: string;
  company_phone: string;
  company_email: string;
  siret: string;
  vat_number: string;
  invoice_prefix: string;
  quote_prefix: string;
  next_invoice_number: number;
  next_quote_number: number;
  default_payment_terms: number;
  bank_details: {
    iban: string;
    bic: string;
    bank_name: string;
  };
  legal_mentions: string;
  /* Séquence d'AVOIRS, distincte de celle des factures : mélanger les deux rend la
     séquence de facturation incompréhensible à un contrôleur, alors que chacune doit
     être continue (art. 289 du CGI). Le tiret est DANS le préfixe (« AV- »). */
  credit_note_prefix?: string;
  next_credit_note_number?: number;
  created_at: string;
  updated_at: string;
}

export interface Quote {
  id: string;
  quote_number: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  customer_address?: any;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
  subtotal_ht: number;
  tax_amount: number;
  total_ttc: number;
  valid_until?: string;
  notes?: string;
  terms_conditions?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  sent_at?: string;
  accepted_at?: string;
  quote_items?: QuoteItem[];
  customer?: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

export interface QuoteItem {
  id: string;
  quote_id: string;
  product_id?: string;
  description: string;
  quantity: number;
  unit_price_ht: number;
  tax_rate: number;
  total_ht: number;
  total_ttc: number;
  sort_order: number;
  product?: {
    name: string;
    sku?: string;
  };
}

export interface Invoice {
  id: string;
  invoice_number: string;
  quote_id?: string;
  order_id?: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  customer_address?: any;
  billing_address?: any;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled' | 'refunded';
  subtotal_ht: number;
  tax_amount: number;
  total_ttc: number;
  amount_paid: number;
  due_date?: string;
  payment_terms: number;
  notes?: string;
  legal_mentions?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  sent_at?: string;
  paid_at?: string;
  /* Transmission vers la comptabilité (Make → Tiime). Non nul = déjà partie :
     la renvoyer créerait un doublon, donc un second envoi doit être forcé.
     ⚠ `tiime_sent_at` ne vaut QUE « posté » : un webhook Make répond 200 dès la mise en
     file. Seul `tiime_ack_at` prouve que Tiime a reçu le document. */
  tiime_sent_at?: string | null;
  tiime_invoice_id?: string | null;
  tiime_invoice_number?: string | null;
  tiime_ack_at?: string | null;
  /* ── Avoir (migration 20260805020000) ─────────────────────────────────────
     Un avoir est un document à part entière (code 381 de la norme EN 16931), pas une
     facture négative déguisée : il porte son propre numéro, des montants négatifs, et
     référence obligatoirement la facture qu'il annule. */
  document_type?: 'invoice' | 'credit_note';
  credit_note_of?: string | null;
  /* Date de LIVRAISON. C'est elle qui fixe l'exigibilité de la TVA sur les biens, pas
     la date d'édition — et elle est une mention obligatoire (art. 242 nonies A ann. II
     du CGI) dès qu'elle diffère de la date de facture. */
  delivery_date?: string | null;
  /* Territoire fiscal FIGÉ ('FR' | 'FR-DOM' | 'FR-COM' | 'MC' | 'UE' | 'HORS-UE' |
     'UE-EXCLU'). Jamais re-déduit d'une expression régulière sur la mention légale :
     c'est ce qui distinguait une livraison en Guadeloupe d'une exportation en Suisse. */
  vat_territory?: string | null;
  /* Archivage du document REMIS au client, et son empreinte (art. 286 I 3° bis). */
  pdf_storage_path?: string | null;
  pdf_sha256?: string | null;
  /* Identité fiscale de la vente, recopiée depuis la commande : c'est elle qui
     décide de la ligne de déclaration et de la mention portée sur la facture. */
  customer_country?: string | null;
  is_company?: boolean | null;
  company_name?: string | null;
  vat_number?: string | null;
  vat_regime?: 'fr' | 'ue_b2b' | 'ue_b2c' | 'export' | null;
  vat_rate?: number | null;
  vat_mention?: string | null;
  invoice_items?: InvoiceItem[];
  payment_records?: PaymentRecord[];
  refunds?: Refund[];
  customer?: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  product_id?: string;
  description: string;
  quantity: number;
  unit_price_ht: number;
  tax_rate: number;
  total_ht: number;
  total_ttc: number;
  sort_order: number;
  /* goods | shipping | discount | other. Pilote le compte comptable (707x pour les
     ventes, 708x pour le port) et le champ `line_kind` du payload Tiime.
     ⚠ Ne JAMAIS le déduire du libellé de la ligne : reconnaître le texte « Frais de
     port » casse à la première reformulation. */
  line_kind?: 'goods' | 'shipping' | 'discount' | 'other';
  product?: {
    name: string;
    sku?: string;
  };
}

export interface PaymentRecord {
  id: string;
  invoice_id: string;
  amount: number;
  payment_date: string;
  payment_method:
    | 'virement'
    | 'cheque'
    | 'especes'
    | 'carte'
    | 'prelevement'
    | 'refund';
  reference?: string;
  notes?: string;
  stripe_charge_id?: string;
  created_by: string;
  created_at: string;
}

export interface Refund {
  id: string;
  order_id?: string;
  invoice_id?: string;
  stripe_refund_id: string;
  stripe_payment_intent_id: string;
  amount: number;
  reason: string;
  status: 'pending' | 'succeeded' | 'failed' | 'cancelled';
  admin_notes?: string;
  processed_by: string;
  created_at: string;
  updated_at: string;
}
