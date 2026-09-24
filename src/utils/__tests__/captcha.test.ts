import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));
import { __chercherPourTests as chercher } from '../captcha';

function bitsAZero(hex: string): number {
  let n = 0;
  for (const c of hex) {
    const v = parseInt(c, 16);
    if (v === 0) { n += 4; continue; }
    n += Math.clz32(v) - 28;
    break;
  }
  return n;
}

describe('captcha maison (preuve de calcul)', () => {
  it('le nonce trouvé donne bien les bits à zéro, selon le SHA-256 de référence', () => {
    for (let k = 0; k < 20; k++) {
      const sel = randomBytes(16).toString('hex');
      const n = chercher(sel, 12, 0, 1, 10_000_000);
      expect(n).toBeGreaterThanOrEqual(0);
      const h = createHash('sha256').update(`${sel}:${n}`).digest('hex');
      expect(bitsAZero(h)).toBeGreaterThanOrEqual(12);
      // Et c'est bien le PREMIER : aucun nonce plus petit ne convenait.
      for (let m = Math.max(0, n - 50); m < n; m++) {
        expect(bitsAZero(createHash('sha256').update(`${sel}:${m}`).digest('hex'))).toBeLessThan(12);
      }
    }
  });

  it('résout la difficulté réelle (18 bits) en un temps raisonnable', () => {
    const sel = randomBytes(16).toString('hex');
    const t0 = Date.now();
    const n = chercher(sel, 18, 0, 1, 50_000_000);
    const ms = Date.now() - t0;
    const h = createHash('sha256').update(`${sel}:${n}`).digest('hex');
    expect(bitsAZero(h)).toBeGreaterThanOrEqual(18);
    console.log(`18 bits : nonce ${n} trouvé en ${ms} ms`);
  });
});
