import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Invoice } from '../../../types/billing';

// Capture la ligne insérée dans Supabase + les appels à l'Edge Function (mock).
const h = vi.hoisted(() => ({
  inserted: null as any,
  invokeCalls: [] as Array<{ name: string; body: any }>,
  invokeResponse: { data: null as any, error: null as any },
}));

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      insert: (row: any) => {
        h.inserted = row;
        return {
          select: () => ({
            single: async () => ({ data: { id: 'einv-fake-id' }, error: null }),
          }),
        };
      },
    }),
    functions: {
      invoke: async (name: string, opts: any) => {
        h.invokeCalls.push({ name, body: opts?.body });
        return h.invokeResponse;
      },
    },
  },
}));

import { emitEInvoice } from '../einvoiceService';

const invoice: Invoice = {
  id: 'inv1',
  invoice_number: 'FAC-2026-0001',
  order_id: 'ord1',
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
  billing_address: { address_line_1: '1 rue X', postal_code: '34000', city: 'Montpellier', country: 'France' },
  invoice_items: [
    { id: 'it1', invoice_id: 'inv1', description: 'Hazer CO2', quantity: 1, unit_price_ht: 100, tax_rate: 20, total_ht: 100, total_ttc: 120, sort_order: 1 },
  ],
};

beforeEach(() => {
  h.inserted = null;
  h.invokeCalls = [];
  h.invokeResponse = { data: null, error: null };
});

describe('emitEInvoice (garde-fou)', () => {
  it('paiement TEST → mode test, statut sandbox, AUCUNE transmission', async () => {
    const res = await emitEInvoice(invoice, { configuredMode: 'live', stripeLivemode: false });
    expect(res.mode).toBe('test');
    expect(res.status).toBe('sandbox');
    expect(res.transmitted).toBe(false);
    expect(res.xml).toContain('FAC-2026-0001');
    expect(res.pdfBytes.byteLength).toBeGreaterThan(1000);
    // La ligne stockée reflète bien le mode test + PDF archivé
    expect(h.inserted.mode).toBe('test');
    expect(h.inserted.status).toBe('sandbox');
    expect(h.inserted.transmitted_at).toBeNull();
    expect(h.inserted.pdf_base64.length).toBeGreaterThan(1000);
    expect(res.einvoiceId).toBe('einv-fake-id');
    // L'Edge Function de transmission n'est JAMAIS appelée en mode test
    expect(h.invokeCalls).toHaveLength(0);
  });

  it('mode non configuré → test par défaut', async () => {
    const res = await emitEInvoice(invoice, { stripeLivemode: true });
    expect(res.mode).toBe('test');
    expect(res.status).toBe('sandbox');
    expect(res.transmitted).toBe(false);
    expect(h.invokeCalls).toHaveLength(0);
  });

  it('live + vrai paiement mais PA non configurée → reste to_transmit', async () => {
    h.invokeResponse = {
      data: { transmitted: false, configured: false, message: 'PA non configurée' },
      error: null,
    };
    const res = await emitEInvoice(invoice, { configuredMode: 'live', stripeLivemode: true });
    expect(res.mode).toBe('live');
    expect(res.transmitted).toBe(false);
    expect(res.status).toBe('to_transmit');
    expect(res.transmitMessage).toContain('PA non configurée');
    expect(h.inserted.mode).toBe('live');
    // L'Edge Function a bien été invoquée avec l'id stocké
    expect(h.invokeCalls).toEqual([
      { name: 'transmit-einvoice', body: { einvoiceId: 'einv-fake-id' } },
    ]);
  });

  it('live + PA configurée → transmis avec référence', async () => {
    h.invokeResponse = {
      data: { transmitted: true, configured: true, reference: 'PA-REF-42' },
      error: null,
    };
    const res = await emitEInvoice(invoice, { configuredMode: 'live', stripeLivemode: true });
    expect(res.mode).toBe('live');
    expect(res.transmitted).toBe(true);
    expect(res.status).toBe('transmitted');
    expect(res.paReference).toBe('PA-REF-42');
  });

  it('live + erreur Edge Function → pas de crash, message conservé', async () => {
    h.invokeResponse = { data: null, error: { message: 'Function not found' } };
    const res = await emitEInvoice(invoice, { configuredMode: 'live', stripeLivemode: true });
    expect(res.transmitted).toBe(false);
    expect(res.status).toBe('to_transmit');
    expect(res.transmitMessage).toContain('Function not found');
  });
});
