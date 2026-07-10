export type EInvoiceStatus =
  | 'generated'
  | 'sandbox'
  | 'to_transmit'
  | 'transmitted'
  | 'rejected'
  | 'error';

export interface EInvoiceRecord {
  id: string;
  invoice_id?: string | null;
  order_id?: string | null;
  invoice_number: string;
  mode: 'test' | 'live';
  format: string;
  status: EInvoiceStatus;
  currency: string;
  total_ht?: number | null;
  total_tva?: number | null;
  total_ttc?: number | null;
  xml?: string | null;
  pdf_base64?: string | null;
  pa_provider?: string | null;
  pa_reference?: string | null;
  transmitted_at?: string | null;
  error_message?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}
