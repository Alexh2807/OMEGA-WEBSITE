import { describe, it, expect, vi } from 'vitest';
import { GenericPaProvider, PaConfig } from '../genericPaProvider';

const cfg: PaConfig = {
  name: 'pa-test',
  tokenUrl: 'https://pa.example/token',
  depositUrl: 'https://pa.example/deposit',
  clientId: 'CID',
  clientSecret: 'CSECRET',
};

describe('GenericPaProvider', () => {
  it('obtient un jeton (client_credentials) puis dépose la facture et renvoie la référence', async () => {
    const calls: Array<{ url: string; init: any }> = [];
    const fetchImpl = vi.fn(async (url: any, init: any) => {
      calls.push({ url: String(url), init });
      if (url === cfg.tokenUrl) {
        return new Response(JSON.stringify({ access_token: 'TOK123' }), { status: 200 });
      }
      if (url === cfg.depositUrl) {
        return new Response(JSON.stringify({ id: 'DEP-999' }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const provider = new GenericPaProvider(cfg, fetchImpl);
    const res = await provider.transmit({
      xml: '<rsm:CrossIndustryInvoice/>',
      pdfBytes: new Uint8Array([1, 2, 3, 4]),
      invoiceNumber: 'FAC-2026-0001',
    });

    expect(res.transmitted).toBe(true);
    expect(res.reference).toBe('DEP-999');

    // 1) jeton demandé en client_credentials
    expect(calls[0].url).toBe(cfg.tokenUrl);
    expect(String(calls[0].init.body)).toContain('grant_type=client_credentials');
    expect(String(calls[0].init.body)).toContain('CID');

    // 2) dépôt authentifié par le Bearer
    expect(calls[1].url).toBe(cfg.depositUrl);
    expect(calls[1].init.headers.Authorization).toBe('Bearer TOK123');
  });

  it('échoue clairement si le jeton est refusé', async () => {
    const fetchImpl = vi.fn(async () => new Response('denied', { status: 401 })) as unknown as typeof fetch;
    const provider = new GenericPaProvider(cfg, fetchImpl);
    await expect(
      provider.transmit({ xml: '', pdfBytes: new Uint8Array(), invoiceNumber: 'F' })
    ).rejects.toThrow(/authentification/);
  });

  it('échoue clairement si le dépôt est rejeté', async () => {
    const fetchImpl = vi.fn(async (url: any) => {
      if (url === cfg.tokenUrl) return new Response(JSON.stringify({ access_token: 'T' }), { status: 200 });
      return new Response('bad request', { status: 400 });
    }) as unknown as typeof fetch;
    const provider = new GenericPaProvider(cfg, fetchImpl);
    await expect(
      provider.transmit({ xml: '', pdfBytes: new Uint8Array([1]), invoiceNumber: 'F' })
    ).rejects.toThrow(/dépôt/);
  });
});
