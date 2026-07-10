import { describe, it, expect } from 'vitest';
import { resolveEInvoiceMode, canTransmitToPA } from '../mode';

describe('resolveEInvoiceMode (garde-fou TEST/PROD)', () => {
  it('par défaut = test', () => {
    expect(resolveEInvoiceMode({})).toBe('test');
    expect(resolveEInvoiceMode({ configuredMode: undefined })).toBe('test');
    expect(resolveEInvoiceMode({ configuredMode: '' })).toBe('test');
    expect(resolveEInvoiceMode({ configuredMode: 'sandbox' })).toBe('test');
  });

  it('configuré "test" reste test même avec un vrai paiement', () => {
    expect(resolveEInvoiceMode({ configuredMode: 'test', stripeLivemode: true })).toBe('test');
  });

  it('configuré "live"/"production" + vrai paiement => live', () => {
    expect(resolveEInvoiceMode({ configuredMode: 'live', stripeLivemode: true })).toBe('live');
    expect(resolveEInvoiceMode({ configuredMode: 'production', stripeLivemode: true })).toBe('live');
    expect(resolveEInvoiceMode({ configuredMode: 'prod', stripeLivemode: true })).toBe('live');
    // livemode inconnu (non false) => live
    expect(resolveEInvoiceMode({ configuredMode: 'live' })).toBe('live');
  });

  it('GARDE-FOU: configuré "live" MAIS paiement de test (livemode=false) => test', () => {
    expect(resolveEInvoiceMode({ configuredMode: 'live', stripeLivemode: false })).toBe('test');
  });

  it('canTransmitToPA: vrai uniquement en live', () => {
    expect(canTransmitToPA('live')).toBe(true);
    expect(canTransmitToPA('test')).toBe(false);
  });
});
