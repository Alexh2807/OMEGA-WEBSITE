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
  product?: {
    name: string;
    sku?: string;
  };
}

export interface PaymentRecord {
  id: string;
  invoice_id: string | null;
  order_id: string | null;
  amount: number;
  payment_date: string;
  payment_method:
    | 'virement'
    | 'cheque'
    | 'especes'
    | 'carte'
    | 'prelevement'
    | 'refund';
  status: 'succeeded' | 'pending' | 'failed';
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