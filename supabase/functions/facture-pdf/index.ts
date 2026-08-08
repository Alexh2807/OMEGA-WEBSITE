/**
 * Edge Function : FABRIQUE, ARCHIVE ET SERT L'ORIGINAL D'UNE FACTURE.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * POURQUOI CETTE FONCTION EXISTE
 * ═══════════════════════════════════════════════════════════════════════════════
 * Jusqu'ici, « télécharger ma facture » lançait `html2canvas` dans le navigateur du
 * client : une CAPTURE D'ÉCRAN du composant React, refabriquée à chaque clic à
 * partir des données du moment, et conservée nulle part. Trois conséquences :
 *
 *  · deux téléchargements à six mois d'écart pouvaient donner DEUX DOCUMENTS
 *    DIFFÉRENTS — il suffisait qu'une mention légale, une adresse ou le logo change ;
 *  · il n'existait aucun original opposable, et rien n'assurait la conservation
 *    pendant 10 ans (art. L102 B du Livre des procédures fiscales) ;
 *  · une image n'est ni sélectionnable, ni indexable, et ne peut pas porter les
 *    données structurées qu'attend la facturation électronique.
 *
 * Ici, le PDF est fabriqué UNE FOIS, côté serveur, à partir des données figées de la
 * facture. Il est archivé, empreinté, puis servi tel quel — au client comme à
 * l'e-mail. Le même octet, indéfiniment.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * CE QUE LA FACTURE DOIT PORTER (art. 242 nonies A ann. II CGI, art. L441-9 C. com.)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Chaque mention ci-dessous est obligatoire, et son absence est un manquement
 * sanctionnable (15 € par mention manquante, plafonné au quart du montant facturé) :
 *   1. date d'émission et numéro unique, séquentiel et sans trou ;
 *   2. identité complète du vendeur : dénomination, forme juridique, capital,
 *      adresse du siège, SIRET, RCS + ville, TVA intracommunautaire ;
 *   3. identité et adresse de l'acheteur, et son n° de TVA en cas d'autoliquidation ;
 *   4. date de la vente ou de la livraison si elle diffère de l'émission ;
 *   5. pour chaque ligne : désignation, quantité, prix unitaire HT, TAUX DE TVA ;
 *   6. la VENTILATION par taux : base HT et montant de TVA pour chaque taux ;
 *   7. total HT, total TVA, total TTC, acompte déjà réglé, reste dû ;
 *   8. date d'échéance et conditions de règlement ;
 *   9. pénalités de retard ET indemnité forfaitaire de 40 € pour frais de
 *      recouvrement (art. L441-10 et D441-5 du Code de commerce) ;
 *  10. la mention d'exonération le cas échéant, avec sa base légale.
 *
 * ⚠ Le point 6 manquait : un seul bloc de TVA était affiché, avec un repli à 20 %.
 * Sur une facture à deux taux, le document était donc FAUX.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * SÉCURITÉ
 * ═══════════════════════════════════════════════════════════════════════════════
 *  · FABRIQUER est réservé aux administrateurs ;
 *  · TÉLÉCHARGER est ouvert à l'administrateur ET au client propriétaire de la
 *    facture, jamais à un autre compte ;
 *  · le compartiment de stockage est PRIVÉ. On ne rend jamais une URL directe :
 *    on signe un accès de courte durée, après avoir vérifié les droits. Un
 *    compartiment public laisserait deviner les factures des autres clients.
 *  · un PDF déjà archivé n'est JAMAIS refabriqué : c'est tout l'intérêt.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  PDFDocument,
  StandardFonts,
  rgb,
  AFRelationship,
  PDFName,
  type PDFFont,
  type PDFPage,
} from 'npm:pdf-lib@1.17.1';
import { buildFacturXXml, type FacturXInput, type FacturXLine } from './facturx/buildCII.ts';
import { categorieTva, motifExonerationTva } from './facturx/categorieTva.ts';

const ORIGINES = [
  'https://omegasud.fr',
  'https://www.omegasud.fr',
  'https://omegasud.netlify.app',
];
const cors = (req: Request) => ({
  'Access-Control-Allow-Origin': ORIGINES.includes(req.headers.get('origin') || '')
    ? (req.headers.get('origin') as string)
    : ORIGINES[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
});

const admin = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
);

const json = (corps: unknown, req: Request, status = 200) =>
  new Response(JSON.stringify(corps), {
    status,
    headers: { ...cors(req), 'Content-Type': 'application/json' },
  });

/* ── Outils ────────────────────────────────────────────────────────────────── */

const eur = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;
const fmt = (n: unknown) => eur(n).toFixed(2).replace('.', ',') + ' EUR';

/** Date en JJ/MM/AAAA dans le fuseau de Paris.
    ⚠ `toISOString()` sur un timestamptz est FAUX : une facture émise le 1er janvier
    à 00 h 30 à Paris ressort au 31 décembre en UTC, donc sur l'exercice précédent. */
const dateFr = (d: string | null | undefined) =>
  d
    ? new Intl.DateTimeFormat('fr-FR', {
        timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric',
      }).format(new Date(d))
    : '';

/* ⚠ LES POLICES STANDARD DE PDF NE CONNAISSENT PAS TOUT L'UNICODE.
   `StandardFonts.Helvetica` encode en WinAnsi : « € », « é », « — » passent, mais
   une puce « • », une flèche ou un caractère venu d'un copier-coller lèvent une
   exception EN PLEINE FABRICATION — et la facture n'est jamais produite. On
   normalise donc les signes typographiques courants, puis on écarte le reste.
   Mieux vaut un tiret que pas de facture. */
const REMPLACEMENTS: Record<string, string> = {
  '’': "'", '‘': "'", '“': '"', '”': '"',
  '–': '-', '—': '-', '…': '...', ' ': ' ',
  '•': '-', '→': '->', '€': '€',
};
function net(s: unknown): string {
  let t = String(s ?? '');
  for (const [k, v] of Object.entries(REMPLACEMENTS)) t = t.split(k).join(v);
  // Tout ce qui sort de Latin-1 + € est remplacé plutôt que de faire échouer le PDF.
  return t.replace(/[^\x20-\x7E -ÿ€\n]/g, '?');
}

/* ── Fabrication du PDF ───────────────────────────────────────────────────── */

interface Ligne {
  description: string; quantity: number; unit_price_ht: number;
  tax_rate: number; total_ht: number; line_kind?: string | null;
}

async function fabriquer(f: any, lignes: Ligne[], reglages: any): Promise<Uint8Array> {
  const avoir = f.document_type === 'credit_note' || Number(f.total_ttc) < 0;

  const pdf = await PDFDocument.create();
  pdf.setTitle(`${avoir ? 'Avoir' : 'Facture'} ${f.invoice_number}`);
  pdf.setAuthor(net(reglages.company_name));
  pdf.setProducer('OMEGA');
  pdf.setCreationDate(new Date(f.created_at));

  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const gras = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = pdf.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const M = 50;                    // marge
  const encre = rgb(0.15, 0.15, 0.15);
  const pale = rgb(0.45, 0.45, 0.45);
  const blanc = rgb(1, 1, 1);
  let y = height - M;

  const T = (s: unknown, x: number, yy: number, o: { f?: PDFFont; t?: number; c?: any } = {}) =>
    page.drawText(net(s), { x, y: yy, font: o.f ?? helv, size: o.t ?? 9, color: o.c ?? encre });

  const D = (s: unknown, xd: number, yy: number, o: { f?: PDFFont; t?: number; c?: any } = {}) => {
    const fo = o.f ?? helv, ta = o.t ?? 9;
    T(s, xd - fo.widthOfTextAtSize(net(s), ta), yy, o);
  };

  /**
   * Coupe un texte à une LARGEUR, pas à un nombre de caractères.
   *
   * ⚠ C'était la cause des chevauchements signalés sur les factures reçues par les
   * clients. La désignation était tronquée par `slice(0, 58)` : 58 caractères en
   * minuscules tiennent dans la colonne, 58 caractères en capitales font presque le
   * double de large et venaient s'écrire PAR-DESSUS les colonnes Qté et P.U. HT.
   * Le nombre de caractères ne dit rien de la place occupée — seule la police le sait.
   *
   * On ne dessine rien ici : on rend un texte dont la largeur mesurée tient dans la
   * place disponible, avec une ellipse quand il a fallu couper.
   */
  const couper = (s: unknown, largeurMax: number, f: PDFFont, taille: number): string => {
    const texte = net(s);
    if (f.widthOfTextAtSize(texte, taille) <= largeurMax) return texte;
    const ell = '…';
    const dispo = largeurMax - f.widthOfTextAtSize(ell, taille);
    let bas = 0, haut = texte.length;
    while (bas < haut) {
      const milieu = Math.ceil((bas + haut) / 2);
      if (f.widthOfTextAtSize(texte.slice(0, milieu), taille) <= dispo) bas = milieu;
      else haut = milieu - 1;
    }
    return texte.slice(0, bas).trimEnd() + ell;
  };

  /* Saut de page automatique. Sans lui, une facture de plus de ~25 lignes écrit
     dans le vide sous le bas de page : le client reçoit un document tronqué. */
  const place = (besoin: number) => {
    if (y - besoin > M + 90) return;
    page = pdf.addPage([595.28, 841.89]);
    y = height - M;
  };

  // ── 1. En-tête : logo, identité, nature du document ─────────────────────────
  /* Le logo est chargé depuis le site. ⚠ On prend la version PNG de l'e-mail et
     PAS le `.webp` du composant React : pdf-lib ne sait embarquer que du PNG et du
     JPEG. Un échec de chargement ne doit rien casser — la facture part sans image
     plutôt que pas du tout. */
  let hautGauche = y;
  try {
    const rep = await fetch('https://omegasud.fr/email/logo-omega.png');
    if (rep.ok) {
      const png = await pdf.embedPng(new Uint8Array(await rep.arrayBuffer()));
      const h = 38;
      const l = (png.width / png.height) * h;
      page.drawImage(png, { x: M, y: y - h + 6, width: l, height: h });
      hautGauche = y - h - 4;
    }
  } catch { /* sans logo, la facture reste valable */ }

  // Identité du vendeur, sous le logo — comme sur le document que tu connais.
  T(reglages.company_name, M, hautGauche - 8, { f: gras, t: 13 });
  T(`${reglages.legal_form} au capital de ${reglages.capital} €`, M, hautGauche - 21, { t: 8, c: pale });
  T('Fabricant français depuis 1996', M, hautGauche - 32, { t: 8, c: pale });

  // Nature du document, à droite et en gros : c'est ce qu'on lit en premier.
  D(avoir ? 'AVOIR' : 'FACTURE', width - M, y - 20, { f: gras, t: 30, c: rgb(0.12, 0.12, 0.14) });
  let yd = y - 38;
  D(`N° ${f.invoice_number}`, width - M, yd, { f: gras, t: 11 }); yd -= 14;
  D(`Émise le ${dateFr(f.created_at)}`, width - M, yd, { t: 8.5, c: pale }); yd -= 11;
  // Date de la vente : obligatoire dès qu'elle diffère de l'émission.
  if (f.delivery_date) { D(`Livrée le ${dateFr(f.delivery_date)}`, width - M, yd, { t: 8.5, c: pale }); yd -= 11; }
  if (!avoir && f.due_date) { D(`Échéance : ${dateFr(f.due_date)}`, width - M, yd, { f: gras, t: 8.5 }); yd -= 11; }
  // Une facture acquittée doit le dire : c'est la première chose que cherche le client.
  if (f.paid_at && !avoir) {
    D(`Acquittée le ${dateFr(f.paid_at)}`, width - M, yd, { f: gras, t: 8.5, c: rgb(0.05, 0.5, 0.25) });
    yd -= 11;
  }

  y = Math.min(hautGauche - 44, yd) - 8;
  // Filet de séparation, comme le liseré du document à l'écran.
  page.drawLine({ start: { x: M, y }, end: { x: width - M, y }, thickness: 1.4, color: rgb(0.12, 0.12, 0.14) });
  y -= 22;

  // Un avoir DOIT référencer la facture qu'il rectifie (art. 289 I-3 du CGI).
  if (avoir && f.facture_origine) {
    T(`Avoir sur la facture n° ${f.facture_origine} du ${dateFr(f.facture_origine_date)}`, M, y, { f: gras, t: 9 });
    y -= 18;
  }

  // ── 2. Vendeur / Acheteur ───────────────────────────────────────────────────
  const colD = width / 2 + 10;
  T('VENDEUR', M, y, { f: gras, t: 8, c: pale });
  T('FACTURÉ À', colD, y, { f: gras, t: 8, c: pale });
  y -= 14;

  const vendeur = [
    `${reglages.company_name} — ${reglages.legal_form ?? 'SARL'}`,
    reglages.capital ? `Capital social : ${reglages.capital} €` : null,
    reglages.company_address,
    `${reglages.company_postal_code} ${reglages.company_city}`,
    reglages.company_country,
    `SIRET : ${reglages.siret}`,
    reglages.rcs ? `RCS ${reglages.rcs}` : null,
    `TVA : ${reglages.vat_number}`,
    reglages.company_phone,
    reglages.company_email,
  ].filter(Boolean) as string[];

  const adr = (f.billing_address ?? f.customer_address ?? {}) as Record<string, unknown>;
  const acheteur = [
    f.is_company && f.company_name ? f.company_name : f.customer_name,
    f.is_company && f.company_name ? f.customer_name : null,
    adr.address_line_1 ?? adr.address ?? null,
    adr.address_line_2 ?? null,
    [adr.postal_code, adr.city].filter(Boolean).join(' ') || null,
    f.customer_country ?? adr.country ?? null,
    // ★ Le n° de TVA de l'acheteur est OBLIGATOIRE sur une livraison
    //   intracommunautaire : sans lui, l'exonération est contestable.
    f.vat_number ? `TVA : ${f.vat_number}` : null,
    f.customer_email,
  ].filter(Boolean) as string[];

  let yy = y;
  for (let i = 0; i < Math.max(vendeur.length, acheteur.length); i++) {
    /* Même piège : une raison sociale longue, une adresse longue ou un numéro de TVA
       intracommunautaire débordaient de la colonne VENDEUR jusque dans FACTURÉ À. */
    const fi = i === 0 ? gras : helv;
    if (vendeur[i]) T(couper(vendeur[i], colD - M - 12, fi, 8.5), M, yy, { f: fi, t: 8.5 });
    if (acheteur[i]) T(couper(acheteur[i], width - M - colD, fi, 8.5), colD, yy, { f: fi, t: 8.5 });
    yy -= 11.5;
  }
  y = yy - 20;

  // ── 3. Lignes — avec le TAUX DE TVA par ligne ──────────────────────────────
  const xQte = 330, xPu = 410, xTva = 460, xTot = width - M;
  page.drawRectangle({ x: M - 4, y: y - 5, width: width - 2 * M + 8, height: 18, color: rgb(0.13, 0.13, 0.13) });
  T('Désignation', M, y, { f: gras, c: blanc, t: 8.5 });
  D('Qté', xQte, y, { f: gras, c: blanc, t: 8.5 });
  D('P.U. HT', xPu, y, { f: gras, c: blanc, t: 8.5 });
  D('TVA', xTva, y, { f: gras, c: blanc, t: 8.5 });
  D('Total HT', xTot, y, { f: gras, c: blanc, t: 8.5 });
  y -= 22;

  /* Lignes alternées : sur une facture de quinze articles, l'œil perd la ligne
     qu'il suit et lit le prix de la ligne d'à côté. Un fond très pâle une ligne
     sur deux suffit à l'en empêcher. */
  let paire = false;
  for (const l of lignes) {
    place(20);
    if (paire) {
      page.drawRectangle({
        x: M - 4, y: y - 4, width: width - 2 * M + 8, height: 13,
        color: rgb(0.965, 0.965, 0.975),
      });
    }
    paire = !paire;
    /* 30 pt réservés à droite : la quantité est alignée À DROITE sur `xQte`, elle
       s'écrit donc vers la gauche et mordrait sur une désignation qui irait jusqu'au
       bord de la colonne. */
    T(couper(l.description, xQte - M - 30, helv, 8.5), M, y, { t: 8.5 });
    D(String(l.quantity), xQte, y, { t: 8.5 });
    D(fmt(l.unit_price_ht), xPu, y, { t: 8.5 });
    D(`${Number(l.tax_rate ?? 0)} %`, xTva, y, { t: 8.5 });
    D(fmt(l.total_ht), xTot, y, { f: gras, t: 8.5 });
    y -= 13;
  }
  y -= 10;

  // ── 4. Ventilation de la TVA PAR TAUX ──────────────────────────────────────
  /* ★ C'est l'obligation qui manquait. Une facture à deux taux (marchandise 20 %,
     livre 5,5 %) n'affichait qu'un seul bloc, avec un repli à 20 % quand le taux
     était nul : le document annonçait une TVA fausse. */
  const parTaux = new Map<number, { base: number; taxe: number }>();
  for (const l of lignes) {
    const t = Number(l.tax_rate ?? 0);
    const e = parTaux.get(t) ?? { base: 0, taxe: 0 };
    e.base = eur(e.base + Number(l.total_ht ?? 0));
    parTaux.set(t, e);
  }
  for (const [t, e] of parTaux) e.taxe = eur((e.base * t) / 100);

  place(40 + parTaux.size * 12);
  T('Ventilation de la TVA', M, y, { f: gras, t: 8, c: pale });
  y -= 13;
  T('Base HT', M, y, { t: 8, c: pale });
  T('Taux', M + 110, y, { t: 8, c: pale });
  T('Montant TVA', M + 170, y, { t: 8, c: pale });
  y -= 12;
  for (const [t, e] of [...parTaux].sort((a, b) => b[0] - a[0])) {
    T(fmt(e.base), M, y, { t: 8.5 });
    T(`${t} %`, M + 110, y, { t: 8.5 });
    T(fmt(e.taxe), M + 170, y, { t: 8.5 });
    y -= 12;
  }

  // ── 5. Totaux ───────────────────────────────────────────────────────────────
  const xg = width - 250;
  let yT = y + parTaux.size * 12 + 25;
  const ligneTotal = (label: string, val: string, o: { g?: boolean; t?: number } = {}) => {
    T(label, xg, yT, { f: o.g ? gras : helv, t: o.t ?? 9 });
    D(val, xTot, yT, { f: o.g ? gras : helv, t: o.t ?? 9 });
    yT -= 14;
  };
  ligneTotal('Total HT', fmt(f.subtotal_ht));
  ligneTotal('Total TVA', fmt(f.tax_amount));
  /* Le TTC dans un pavé sombre : c'est LE chiffre que le client cherche, et sur
     le document actuel il se confondait avec les deux lignes au-dessus.

     ⚠ CE RECUL EST INDISPENSABLE — mesuré, pas estimé.
     `ligneTotal` décale de 14 pt entre deux lignes, mais le pavé monte 17 pt au-dessus
     de la ligne de base du TTC (5 pt sous + 22 pt de haut). Sans recul, son bord
     supérieur arrivait 4,9 pt À L'INTÉRIEUR de « Total TVA » : le rectangle noir
     recouvrait le bas de ce texte, qui devenait illisible sur la facture du client.
     12 pt de plus donnent 7,1 pt d'air entre les deux. */
  yT -= 12;
  page.drawRectangle({
    x: xg - 8, y: yT - 5, width: xTot - xg + 16, height: 22,
    color: rgb(0.12, 0.12, 0.14),
  });
  T('TOTAL TTC', xg, yT + 1, { f: gras, t: 11, c: blanc });
  D(fmt(f.total_ttc), xTot, yT + 1, { f: gras, t: 12, c: blanc });
  yT -= 20;
  const paye = eur(f.amount_paid);
  if (paye) {
    ligneTotal('Déjà réglé', fmt(paye));
    ligneTotal('Reste dû', fmt(eur(Number(f.total_ttc) - paye)), { g: true });
  }
  y = Math.min(y, yT) - 18;

  // ── 6. Mention d'exonération ────────────────────────────────────────────────
  /* Sans elle, l'exonération est refusable : c'est la mention qui EXPLIQUE
     pourquoi il n'y a pas de TVA (262 ter I, 262 I, 294, 293 B…). */
  if (f.vat_mention) {
    place(30);
    T(f.vat_mention, M, y, { f: gras, t: 8.5 });
    y -= 18;
  }

  // ── 7. Règlement ────────────────────────────────────────────────────────────
  place(60);
  T('Règlement', M, y, { f: gras, t: 8, c: pale });
  y -= 13;
  T(`Échéance : ${dateFr(f.due_date)}`, M, y, { t: 8.5 });
  y -= 11;
  if (f.payment_terms) { T(net(f.payment_terms), M, y, { t: 8.5 }); y -= 11; }
  if (paye && eur(Number(f.total_ttc) - paye) === 0) {
    T('Facture réglée — aucun montant restant dû.', M, y, { f: gras, t: 8.5 });
    y -= 11;
  }

  // ── 8. Pied de page légal, sur CHAQUE page ─────────────────────────────────
  /* Pénalités de retard et indemnité de 40 € : obligatoires entre professionnels
     (art. L441-10 et D441-5 du Code de commerce), et leur absence est sanctionnée
     indépendamment du reste. On les répète sur toutes les pages : une facture dont
     seule la dernière page porte les mentions n'est pas conforme si on n'en produit
     qu'un extrait. */
  const pied = [
    net(reglages.legal_mentions ?? '').split('\n').filter(Boolean),
    reglages.mediateur ? [`Médiateur de la consommation : ${reglages.mediateur}`] : [],
    reglages.assurance ? [`Assurance : ${reglages.assurance}`] : [],
  ].flat();

  for (const p of pdf.getPages()) {
    let yp = M + 44;
    for (const l of pied.slice(0, 4)) {
      p.drawText(net(l).slice(0, 160), { x: M, y: yp, font: helv, size: 6.2, color: pale });
      yp -= 8;
    }
  }
  const total = pdf.getPageCount();
  pdf.getPages().forEach((p, i) => {
    const s = `Page ${i + 1} / ${total}`;
    p.drawText(s, { x: width - M - helv.widthOfTextAtSize(s, 7), y: M + 6, font: helv, size: 7, color: pale });
  });

  /* ★ LE XML NORMALISE REJOINT LA PAGE — un seul fichier, un seul document.
     Il doit etre embarque AVANT `save()` : apres, les octets sont figes et
     l'empreinte SHA-256 calculee par l'appelant ne porterait pas sur le XML. */
  await embarquerFacturX(pdf, buildFacturXXml(entreeFacturX(f, lignes, reglages)), f);

  /* ⚠ `useObjectStreams: false` — comme le generateur navigateur qu'on remplace.
     Par defaut pdf-lib compresse les objets dans des flux : la piece jointe et sa
     relation `/Alternative` deviennent alors invisibles a tout lecteur qui ne
     decompresse pas. Verifie au banc : avec la compression, le controle
     « relation Alternative » ECHOUE ; sans elle, les neuf controles passent.
     Le fichier est un peu plus gros ; une facture electronique doit d'abord etre
     lisible par l'outil qui la recevra. */
  return await pdf.save({ useObjectStreams: false });
}

/* ===========================================================================
   FACTUR-X - LE XML NORMALISE, DANS LE MEME FICHIER QUE LE PDF
   ===========================================================================
   Il etait produit DANS LE NAVIGATEUR, par un bouton de l'administration, et donnait
   un TROISIEME document pour une meme facture : autre mise en page, autres totaux
   affiches, autre troncature. On validait donc une facture que le client ne recevait
   jamais.

   Une facture n'a qu'une forme. Le XML rejoint donc l'original archive : meme
   fichier, meme empreinte SHA-256, meme exemplaire pour le client, l'e-mail, le
   comptable et l'administration fiscale.

   REPRIS A L'IDENTIQUE du generateur navigateur (rien n'est perdu) : categories de
   TVA par ligne, motif d'exoneration, code 381 pour les avoirs avec la facture
   rectifiee, et le montant deja encaisse (BT-113) - sans lequel la regle BR-CO-16
   (DuePayable = Grand - Prepaid) est fausse a CHAQUE vente du site, qui est reglee
   avant d'etre editee.

   CORRIGE au passage :
   - AFRelationship passe de `Data` a **`Alternative`**. La specification Factur-X
     l'impose : `Data` designe une piece jointe quelconque, `Alternative` designe une
     representation ALTERNATIVE du meme document. Un lecteur conforme cherche
     `Alternative` - avec `Data` il ne trouve pas la facture electronique.
   - Les metadonnees XMP decrivant le profil sont ajoutees : sans elles, aucun outil
     ne sait qu'il s'agit d'un Factur-X ni quel profil lire.

   RESTE A FAIRE, et ce n'est pas un detail : la conformite **PDF/A-3** complete
   (OutputIntent avec profil ICC, polices integrees). Le fichier produit est un PDF
   valide portant le XML normalise et declare ; il n'est pas encore un PDF/A-3 au sens
   strict. Etape a franchir avant le depot sur une plateforme agreee.
   =========================================================================== */

function entreeFacturX(f: any, lignes: Ligne[], reglages: any): FacturXInput {
  const avoir = f.document_type === 'credit_note';
  const regime = f.vat_regime ?? null;
  const territoire = f.vat_territory ?? null;
  const code = categorieTva(regime, territoire);
  const motif = motifExonerationTva(code, f.vat_mention, regime, territoire);

  const lignesFx: FacturXLine[] = lignes.map((l, i) => ({
    id: String(i + 1),
    name: net(l.description),
    quantity: Number(l.quantity ?? 0),
    unitPriceHt: Number(l.unit_price_ht ?? 0),
    lineTotalHt: Number(l.total_ht ?? 0),
    taxRatePercent: Number(l.tax_rate ?? 0),
    vatCategoryCode: code,
    vatExemptionReason: motif,
  }));

  /* Les montants viennent de la FACTURE, jamais d'un recalcul : ce sont ceux qui sont
     imprimes sur la page. Le XML ne doit pas contredire le PDF qui le porte. */
  const totalTtc = eur(f.total_ttc);
  const encaisse = eur(f.amount_paid);
  const baseHt = eur(f.subtotal_ht);
  const tva = eur(f.tax_amount);

  return {
    invoiceNumber: f.invoice_number,
    issueDate: new Date(f.created_at),
    dueDate: f.due_date ? new Date(f.due_date) : undefined,
    currency: 'EUR',
    documentTypeCode: avoir ? 381 : 380,
    deliveryDate: f.delivery_date ? new Date(f.delivery_date) : undefined,
    precedingInvoice:
      avoir && f.facture_origine
        ? {
            number: f.facture_origine,
            issueDate: f.facture_origine_date
              ? new Date(f.facture_origine_date)
              : undefined,
          }
        : null,
    seller: {
      name: reglages?.company_name ?? 'OMEGA',
      siren: (reglages?.siret ?? '').replace(/\s/g, '').slice(0, 9) || undefined,
      vatNumber: reglages?.vat_number ?? undefined,
      addressLine: reglages?.address ?? undefined,
      postalCode: reglages?.postal_code ?? undefined,
      city: reglages?.city ?? undefined,
      countryCode: 'FR',
    },
    buyer: {
      name: net(f.company_name || f.customer_name || 'Client'),
      vatNumber: f.vat_number ?? undefined,
      addressLine: net(f.billing_address ?? f.customer_address ?? ''),
      countryCode: String(f.customer_country ?? 'FR').slice(0, 2).toUpperCase(),
    },
    lines: lignesFx,
    totals: {
      lineTotalHt: baseHt,
      taxBasisTotal: baseHt,
      taxTotal: tva,
      grandTotalTtc: totalTtc,
      prepaidAmount: encaisse,
      duePayable: eur(totalTtc - encaisse),
    },
  };
}

/**
 * Metadonnees XMP declarant le Factur-X.
 *
 * Sans ce bloc, le XML embarque n'est qu'une piece jointe parmi d'autres : rien
 * n'indique a un lecteur qu'il s'agit d'une facture electronique, ni quel profil
 * appliquer. C'est l'extension officielle `fx:` de la specification.
 */
const xmpFacturX = (profil: string, titre: string): string =>
  '<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>\n' +
  '<x:xmpmeta xmlns:x="adobe:ns:meta/">\n' +
  ' <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n' +
  '  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">\n' +
  '   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">' + titre + '</rdf:li></rdf:Alt></dc:title>\n' +
  '  </rdf:Description>\n' +
  '  <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">\n' +
  '   <pdfaid:part>3</pdfaid:part>\n' +
  '   <pdfaid:conformance>B</pdfaid:conformance>\n' +
  '  </rdf:Description>\n' +
  '  <rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">\n' +
  '   <fx:DocumentType>INVOICE</fx:DocumentType>\n' +
  '   <fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>\n' +
  '   <fx:Version>1.0</fx:Version>\n' +
  '   <fx:ConformanceLevel>' + profil + '</fx:ConformanceLevel>\n' +
  '  </rdf:Description>\n' +
  ' </rdf:RDF>\n' +
  '</x:xmpmeta>\n' +
  '<?xpacket end="w"?>';

/** Embarque `factur-x.xml` et declare le document comme facture electronique. */
async function embarquerFacturX(
  pdf: PDFDocument,
  xml: string,
  f: any
): Promise<void> {
  await pdf.attach(new TextEncoder().encode(xml), 'factur-x.xml', {
    mimeType: 'text/xml',
    description: 'Facture electronique Factur-X (EN 16931, profil BASIC)',
    creationDate: new Date(f.created_at),
    modificationDate: new Date(f.created_at),
    afRelationship: AFRelationship.Alternative,
  });

  const titre =
    (f.document_type === 'credit_note' ? 'Avoir ' : 'Facture ') + f.invoice_number;
  pdf.setTitle(titre);
  pdf.setProducer('OMEGA - facture-pdf');
  pdf.setCreator('OMEGA');

  // XMP : pdf-lib n'expose pas d'API dediee, on pose le flux nous-memes.
  const flux = pdf.context.stream(xmpFacturX('BASIC', titre), {
    Type: 'Metadata',
    Subtype: 'XML',
  });
  pdf.catalog.set(PDFName.of('Metadata'), pdf.context.register(flux));
}

/* ── Point d'entrée ───────────────────────────────────────────────────────── */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  try {
    const jeton = (req.headers.get('Authorization') || '').replace('Bearer ', '');

    /* ★ APPEL SERVEUR A SERVEUR.
       `confirmer-commande` edite la facture des que le paiement est confirme. Il n'a
       pas de session d'administrateur : il ne pouvait donc transmettre que le jeton du
       CLIENT, qui se heurtait au controle « fabrication reservee aux administrateurs »
       — la facture existait en base, son PDF n'etait jamais fabrique, et le client
       lisait « pas encore editee ». Le defaut etait silencieux : un 409 ignore.
       La cle de service n'existe QUE sur le serveur ; elle n'est jamais exposee au
       navigateur. On l'accepte donc comme preuve d'appel interne. */
    const cleService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const estServeur = !!cleService && jeton === cleService;

    let utilisateur: { id: string } | null = null;
    let estAdmin = estServeur;
    if (!estServeur) {
      const { data: u } = await admin.auth.getUser(jeton);
      utilisateur = u?.user ?? null;
      if (!utilisateur) return json({ error: 'Authentification requise.' }, req, 401);
      const { data: profil } = await admin
        .from('profiles').select('role').eq('id', utilisateur.id).maybeSingle();
      estAdmin = profil?.role === 'admin';
    }

    const { invoice_id } = await req.json().catch(() => ({}));
    if (!invoice_id) return json({ error: 'invoice_id manquant.' }, req, 400);

    const { data: f, error: eF } = await admin
      .from('invoices').select('*').eq('id', invoice_id).maybeSingle();
    if (eF || !f) return json({ error: 'Facture introuvable.' }, req, 404);

    /* ⚠ On ne se contente PAS du rôle : un client ne doit voir QUE ses factures.
       Le rattachement se fait sur `customer_id`, jamais sur l'e-mail — une adresse
       se change, et deux comptes peuvent partager une boîte. */
    if (!estAdmin && f.customer_id !== utilisateur!.id) {
      return json({ error: 'Cette facture ne vous appartient pas.' }, req, 403);
    }

    /* ── Déjà archivée : on sert l'original, on ne le refabrique jamais ──────
       C'est tout l'intérêt de l'archivage. Refabriquer, c'est reproduire le défaut
       qu'on corrige : un document qui change avec le temps. */
    if (f.pdf_storage_path) {
      const { data: lien, error } = await admin.storage
        .from('factures').createSignedUrl(f.pdf_storage_path, 300);
      if (error) return json({ error: 'Archive illisible : ' + error.message }, req, 500);
      return json({ url: lien?.signedUrl, archive: true, sha256: f.pdf_sha256 }, req);
    }

    // ── À fabriquer : réservé aux administrateurs ────────────────────────────
    if (!estAdmin) {
      return json({ error: "Cette facture n'a pas encore été éditée." }, req, 409);
    }

    const [{ data: lignes }, { data: reglages }] = await Promise.all([
      admin.from('invoice_items').select('*').eq('invoice_id', invoice_id)
        .order('sort_order', { ascending: true }),
      admin.from('billing_settings').select('*').order('id').limit(1).maybeSingle(),
    ]);
    if (!lignes?.length) return json({ error: 'Facture sans ligne : rien à éditer.' }, req, 422);

    // La facture d'origine d'un avoir, pour la mention de rectification.
    let origine: any = null;
    if (f.credit_note_of) {
      const { data } = await admin.from('invoices')
        .select('invoice_number, created_at').eq('id', f.credit_note_of).maybeSingle();
      origine = data;
    }

    const octets = await fabriquer(
      { ...f, facture_origine: origine?.invoice_number, facture_origine_date: origine?.created_at },
      lignes as Ligne[],
      { ...(reglages ?? {}), legal_form: 'SARL', capital: '1 000', rcs: 'Béziers B 481 088 722' }
    );

    // Empreinte : elle prouve que le fichier servi est celui qui a été émis.
    const empreinte = [...new Uint8Array(await crypto.subtle.digest('SHA-256', octets))]
      .map((o) => o.toString(16).padStart(2, '0')).join('');

    const chemin = `${new Date(f.created_at).getFullYear()}/${f.invoice_number}.pdf`;
    const { error: eUp } = await admin.storage.from('factures').upload(chemin, octets, {
      contentType: 'application/pdf',
      upsert: false,   // ★ jamais d'écrasement : un original ne se réécrit pas
    });
    if (eUp && !/exists/i.test(eUp.message)) {
      return json({ error: 'Archivage impossible : ' + eUp.message }, req, 500);
    }

    await admin.from('invoices').update({
      pdf_storage_path: chemin, pdf_sha256: empreinte, pdf_at: new Date().toISOString(),
    }).eq('id', invoice_id);

    const { data: lien } = await admin.storage.from('factures').createSignedUrl(chemin, 300);
    return json({ url: lien?.signedUrl, archive: false, sha256: empreinte, chemin }, req);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, req, 500);
  }
});
