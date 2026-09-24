import { supabase } from '../lib/supabase';

/**
 * CAPTCHA MAISON — preuve de calcul, vérifiée par la base dans le hook d'inscription
 * (cf. supabase/migrations/20260924150000_captcha_maison.sql).
 *
 * Le défi `{ sel, expire, difficulte, signature }` vient de `captcha_defi()` (signé par la
 * base). On cherche un `nonce` tel que SHA-256(`${sel}:${nonce}`) commence par
 * `difficulte` bits à zéro. Avec 20 bits : ≈ 1 million d'essais en moyenne, soit ≈ 0,3 s
 * sur PC et 1-3 s sur téléphone, dans un fil séparé (Web Worker), pendant la saisie.
 */
export interface DefiCaptcha {
  sel: string;
  expire: number;
  difficulte: number;
  signature: string;
}
export interface PreuveCaptcha extends DefiCaptcha {
  nonce: string;
}

/* SHA-256 d'UN SEUL bloc (message ASCII < 56 octets : ici 32 + 1 + ≤ 15 = ≤ 48),
   écrit pour la vitesse : aucune allocation par essai. Le même code sert au Worker
   (sérialisé en texte) et au repli sans Worker — il ne doit donc dépendre de RIEN. */
function chercher(sel: string, difficulte: number, depart: number, pas: number, fin: number): number {
  // Table officielle SHA-256 (FIPS 180-4) ; Int32Array replie les valeurs > 2^31.
  const K = new Int32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const W = new Int32Array(64);
  const octets = new Uint8Array(64);
  const prefixe = sel + ':';
  for (let i = 0; i < prefixe.length; i++) octets[i] = prefixe.charCodeAt(i);
  const masque = difficulte >= 32 ? 0 : (0xffffffff << (32 - difficulte)) >>> 0;
  for (let nonce = depart; nonce < fin; nonce += pas) {
    const s = String(nonce);
    const len = prefixe.length + s.length;
    for (let i = 0; i < s.length; i++) octets[prefixe.length + i] = s.charCodeAt(i);
    octets[len] = 0x80;
    for (let i = len + 1; i < 56; i++) octets[i] = 0;
    const bits = len * 8;
    octets[56] = 0; octets[57] = 0; octets[58] = 0; octets[59] = 0;
    octets[60] = (bits >>> 24) & 255; octets[61] = (bits >>> 16) & 255;
    octets[62] = (bits >>> 8) & 255; octets[63] = bits & 255;
    for (let i = 0; i < 16; i++) {
      W[i] = (octets[i * 4] << 24) | (octets[i * 4 + 1] << 16) | (octets[i * 4 + 2] << 8) | octets[i * 4 + 3];
    }
    for (let i = 16; i < 64; i++) {
      const a = W[i - 15], b = W[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
    }
    let h0 = 0x6a09e667 | 0, h1 = 0xbb67ae85 | 0, h2 = 0x3c6ef372 | 0, h3 = 0xa54ff53a | 0;
    let h4 = 0x510e527f | 0, h5 = 0x9b05688c | 0, h6 = 0x1f83d9ab | 0, h7 = 0x5be0cd19 | 0;
    for (let i = 0; i < 64; i++) {
      const S1 = ((h4 >>> 6) | (h4 << 26)) ^ ((h4 >>> 11) | (h4 << 21)) ^ ((h4 >>> 25) | (h4 << 7));
      const ch = (h4 & h5) ^ (~h4 & h6);
      const t1 = (h7 + S1 + ch + K[i] + W[i]) | 0;
      const S0 = ((h0 >>> 2) | (h0 << 30)) ^ ((h0 >>> 13) | (h0 << 19)) ^ ((h0 >>> 22) | (h0 << 10));
      const maj = (h0 & h1) ^ (h0 & h2) ^ (h1 & h2);
      const t2 = (S0 + maj) | 0;
      h7 = h6; h6 = h5; h5 = h4; h4 = (h3 + t1) | 0;
      h3 = h2; h2 = h1; h1 = h0; h0 = (t1 + t2) | 0;
    }
    const premier = (h0 + 0x6a09e667) >>> 0; // 32 premiers bits du condensat
    if (difficulte <= 32 && (premier & masque) === 0) return nonce;
  }
  return -1;
}

/** Pour les tests : premiers 32 bits de SHA-256(chaine) calculés par le même code. */
export const __chercherPourTests = chercher;

const TRANCHE = 50_000;

function resoudreDansWorker(defi: DefiCaptcha): Promise<string> {
  const code =
    `const chercher = ${chercher.toString()};\n` +
    `onmessage = (e) => { const { sel, difficulte } = e.data; let depart = 0;\n` +
    `  for (;;) { const n = chercher(sel, difficulte, depart, 1, depart + ${TRANCHE});\n` +
    `    if (n >= 0) { postMessage(String(n)); return; } depart += ${TRANCHE}; } };`;
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  return new Promise((ok, ko) => {
    let w: Worker;
    try {
      w = new Worker(url);
    } catch (e) {
      URL.revokeObjectURL(url);
      ko(e);
      return;
    }
    w.onmessage = e => {
      w.terminate();
      URL.revokeObjectURL(url);
      ok(String(e.data));
    };
    w.onerror = e => {
      w.terminate();
      URL.revokeObjectURL(url);
      ko(e);
    };
    w.postMessage({ sel: defi.sel, difficulte: defi.difficulte });
  });
}

/** Repli sans Worker : par tranches, en rendant la main au navigateur entre deux. */
async function resoudreParTranches(defi: DefiCaptcha): Promise<string> {
  for (let depart = 0; ; depart += TRANCHE) {
    const n = chercher(defi.sel, defi.difficulte, depart, 1, depart + TRANCHE);
    if (n >= 0) return String(n);
    await new Promise(r => setTimeout(r, 0));
  }
}

/** Demande un défi à la base puis le résout. */
export async function obtenirPreuveCaptcha(): Promise<PreuveCaptcha> {
  const { data, error } = await supabase.rpc('captcha_defi');
  if (error || !data) throw new Error(error?.message || 'captcha_defi');
  const defi = data as DefiCaptcha;
  let nonce: string;
  try {
    nonce = await resoudreDansWorker(defi);
  } catch {
    nonce = await resoudreParTranches(defi);
  }
  return { ...defi, nonce };
}
