// Banc de send-notification : la VRAIE fonction, compilée par esbuild, exécutée sous
// Node derrière une fausse base Supabase et un faux SMTP. Aucun e-mail ne part.
//
//   node scripts/banc-notifications/banc.mjs
//   ENTREE=<autre index.ts> node scripts/banc-notifications/banc.mjs   (comparer une version)
//
// Né le 24/09/2026 : une commande en RETRAIT AU DÉPÔT recevait « Livraison : offerte »
// et « Livraison à : <adresse du client> ». Pas de Deno sur le poste, d'où Node + esbuild.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SITE_REPO = path.resolve(ICI, '..', '..');
const require = createRequire(path.join(SITE_REPO, 'package.json'));
const esbuild = require('esbuild');

const sortie = path.join(os.tmpdir(), `banc-send-notification-${process.pid}.mjs`);
process.on('exit', () => {
  try {
    fs.rmSync(sortie);
  } catch {
    /* déjà supprimé */
  }
});
await esbuild.build({
  entryPoints: [process.env.ENTREE || SITE_REPO + '/supabase/functions/send-notification/index.ts'],
  bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
  plugins: [{
    name: 'stubs',
    setup(b) {
      b.onResolve({ filter: /^npm:@supabase\/supabase-js/ }, () => ({ path: path.join(ICI, 'stub-supabase.mjs') }));
      b.onResolve({ filter: /^https:\/\/deno\.land\/x\/denomailer/ }, () => ({ path: path.join(ICI, 'stub-smtp.mjs') }));
    },
  }],
});

/* ---------- Environnement Deno simulé ---------- */
const ENV = { SUPABASE_URL: 'http://faux', SUPABASE_SERVICE_ROLE_KEY: 'k', SMTP_USER: 'u', SMTP_PASS: 'p' };
globalThis.Deno = { env: { get: (k) => ENV[k] }, serve: (h) => { globalThis.__handler = h; } };
globalThis.fetch = async () => ({ ok: false, status: 404 }); // logo : indisponible, sans réseau
globalThis.__envois = [];

/* ---------- Fausse base ---------- */
let DB;
function requete(table) {
  const f = {};
  let unique = false;
  const lignes = () => {
    let rs = (DB[table] ?? []).filter((r) => Object.entries(f).every(([k, v]) => String(r[k]) === String(v)));
    return rs;
  };
  const chaine = {
    select: () => chaine, order: () => chaine, limit: () => chaine,
    eq: (k, v) => { f[k] = v; return chaine; },
    single: () => { unique = true; return chaine; },
    maybeSingle: () => { unique = true; return chaine; },
    insert: () => Promise.resolve({ data: null, error: null }),
    then: (res, rej) => Promise.resolve({ data: unique ? lignes()[0] ?? null : lignes(), error: null }).then(res, rej),
  };
  return chaine;
}
globalThis.__fakeSupabase = {
  from: (t) => requete(t),
  rpc: async (nom) => ({ data: nom === 'notify_check_secret' ? true : null, error: null }),
  auth: { admin: { getUserById: async () => ({ data: { user: { email: 'client@exemple.fr' } } }) } },
  storage: { from: () => ({ download: async (chemin) => { globalThis.__telecharge = chemin; return { data: new Blob([new Uint8Array([37, 80, 68, 70])]), error: null }; } }) },
};

await import(pathToFileURL(sortie).href);
const handler = globalThis.__handler;
assert.ok(handler, 'Deno.serve non appelé');

async function envoyer(event, id) {
  globalThis.__envois = [];
  const r = await handler(new Request('http://x', {
    method: 'POST', headers: { 'x-notify-secret': 's' }, body: JSON.stringify({ event, data: { id } }),
  }));
  const rep = await r.json();
  assert.equal(r.status, 200, JSON.stringify(rep));
  assert.equal(globalThis.__envois.length, 1, 'un e-mail attendu : ' + JSON.stringify(rep));
  return globalThis.__envois[0];
}

const ADRESSE = { first_name: 'Jean', last_name: 'DUPONT', address_line_1: '12 rue des Lilas', postal_code: '34000', city: 'Montpellier', country: 'France' };
const commande = (x) => ({ id: 'o1aaaaaa-0000', total: 1, sub_total: 0.83, tax: 0.17, vat_rate: 20, vat_mention: null,
  shipping_cost: 0, shipping_cost_ht: 0, user_id: 'u1', shipping_address: ADRESSE, status: 'confirmed',
  shipping_carrier: null, shipping_relay: null, shipping_method: null, tracking_link: null, ...x });
const ARTICLE = { order_id: 'o1aaaaaa-0000', quantity: 1, price: 0.83, products: { name: 'Produit test paiement', product_type: 'product' } };
const LICENCE = { order_id: 'o1aaaaaa-0000', quantity: 1, price: 207.5, products: { name: 'Licence OMEGADMX', product_type: 'licence' } };
const texte = (m) => m.html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
let n = 0;
const ok = (nom) => { n++; console.log('  ok', nom); };

/* 1. Retrait au dépôt */
DB = { orders: [commande({ shipping_carrier: 'retrait', shipping_method: 'Retrait au dépôt — Montblanc (34290)' })], order_items: [ARTICLE], licences: [] };
let m = await envoyer('order_ack', 'o1aaaaaa-0000');
let t = texte(m);
assert.match(t, /À retirer : Retrait au dépôt — Montblanc \(34290\)/);
assert.match(t, /prévenu par e-mail dès que la commande est prête/);
assert.match(t, /Retrait au dépôt gratuit/);
assert.doesNotMatch(t, /Livraison à/); assert.doesNotMatch(t, /offerte/); assert.doesNotMatch(t, /12 rue des Lilas/);
ok('order_ack retrait : lieu de retrait, pas d\'adresse client, pas de « livraison offerte »');

/* 2. Domicile payant */
DB = { orders: [commande({ shipping_carrier: 'colissimo', shipping_method: 'Livraison à domicile', shipping_cost: 9.9, shipping_cost_ht: 8.25, sub_total: 9.08, total: 10.9, tax: 1.82 })], order_items: [ARTICLE], licences: [] };
t = texte(await envoyer('order_ack', 'o1aaaaaa-0000'));
assert.match(t, /Livraison à : Jean DUPONT 12 rue des Lilas 34000 Montpellier France/);
assert.match(t, /Livraison HT \(Livraison à domicile\) 8,25/);
ok('order_ack domicile : inchangé (adresse + port HT)');

/* 3. Domicile gratuit (franco) */
DB = { orders: [commande({ shipping_carrier: 'colissimo', shipping_method: 'Livraison à domicile' })], order_items: [ARTICLE], licences: [] };
t = texte(await envoyer('order_ack', 'o1aaaaaa-0000'));
assert.match(t, /Livraison offerte/); assert.match(t, /Livraison à : Jean DUPONT/);
ok('order_ack domicile franco : « Livraison offerte » conservé');

/* 4. Point relais */
DB = { orders: [commande({ shipping_carrier: 'mondial_relay', shipping_method: 'Point relais', shipping_cost: 4.9, shipping_cost_ht: 4.08,
  shipping_relay: { nom: 'Tabac du Centre', adresse: '2 place de la Comédie', code_postal: '34000', ville: 'Montpellier' } })], order_items: [ARTICLE], licences: [] };
t = texte(await envoyer('order_ack', 'o1aaaaaa-0000'));
assert.match(t, /Livraison en point relais : Tabac du Centre 2 place de la Comédie 34000 Montpellier/);
assert.doesNotMatch(t, /Livraison à/); assert.doesNotMatch(t, /12 rue des Lilas/);
ok('order_ack point relais : le relais, pas le domicile');

/* 5. Licence seule (dématérialisé) */
DB = { orders: [commande({ shipping_method: 'Sans livraison (produit dématérialisé)', total: 249, sub_total: 207.5, tax: 41.5 })], order_items: [LICENCE], licences: [{ order_id: 'o1aaaaaa-0000', reference: 'OMX-TEST', postes_max: 2 }] };
m = await envoyer('order_ack', 'o1aaaaaa-0000'); t = texte(m);
assert.doesNotMatch(t, /Livraison/); assert.doesNotMatch(t, /Retrait/); assert.doesNotMatch(t, /12 rue des Lilas/);
assert.match(t, /Votre licence OMEGADMX est active/);
ok('order_ack licence seule : ni livraison ni adresse');

/* 6. Statut « Expédiée » d'un retrait = commande prête */
DB = { orders: [commande({ status: 'shipped', shipping_carrier: 'retrait', shipping_method: 'Retrait au dépôt — Montblanc (34290)' })] };
m = await envoyer('order_status', 'o1aaaaaa-0000'); t = texte(m);
assert.equal(m.subject, 'Votre commande OMEGA est prête à être retirée — o1aaaaaa');
assert.match(t, /Votre commande est prête/); assert.match(t, /désormais : prête à être retirée/);
assert.match(t, /À retirer Retrait au dépôt — Montblanc \(34290\)/);
assert.doesNotMatch(t, /en route|expédiée/);
ok('order_status retrait « Expédiée » : « prête à être retirée »');

DB.orders[0].status = 'delivered';
m = await envoyer('order_status', 'o1aaaaaa-0000');
assert.equal(m.subject, 'Votre commande OMEGA a été retirée — o1aaaaaa');
ok('order_status retrait « Livrée » : « a été retirée »');

/* 7. Statut « Expédiée » d'un colis : inchangé */
DB = { orders: [commande({ status: 'shipped', shipping_carrier: 'colissimo', shipping_method: 'Livraison à domicile' })] };
m = await envoyer('order_status', 'o1aaaaaa-0000');
assert.equal(m.subject, 'Votre commande OMEGA est expédiée — o1aaaaaa');
assert.match(texte(m), /Livraison Livraison à domicile/);
ok('order_status colis « Expédiée » : inchangé');

/* 8. Facture : nom de la pièce jointe = numéro, quel que soit le chemin de stockage */
for (const chemin of ['2026/4e54a1ce-0108-4dbb-9a20-9e436d1f688b/FACT0002.pdf', '2026/FACT0002_4e54a1ce-0108-4dbb-9a20-9e436d1f688b.pdf']) {
  DB = { invoices: [{ id: 'f1', invoice_number: 'FACT0002', customer_id: 'u1', customer_email: 'client@exemple.fr', subtotal_ht: 0.83, tax_amount: 0.17,
    total_ttc: 1, vat_rate: 20, vat_mention: null, created_at: '2026-09-24T10:00:00Z', status: 'paid', pdf_storage_path: chemin, document_type: 'invoice', credit_note_of: null }] };
  m = await envoyer('invoice_ready', 'f1');
  const pj = (m.attachments || []).filter((a) => a.contentType === 'application/pdf');
  assert.equal(pj.length, 1, 'une facture jointe');
  assert.equal(pj[0].filename, 'FACT0002.pdf');
  assert.equal(globalThis.__telecharge, chemin);
}
ok('invoice_ready : pièce jointe « FACT0002.pdf » (nouveau et ancien chemin)');

console.log(`\n${n} vérifications au vert`);
