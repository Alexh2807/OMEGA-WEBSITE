/**
 * Edge Function : envoi d'une facture (ou d'un AVOIR) vers Make.com, qui la crée dans
 * Tiime (scénario Make : Webhook → Tiime).
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⚠ LE FORMAT DU PAYLOAD A CHANGÉ LE 5 AOÛT — schema_version « 2.0 ».
 * Le scénario Make doit être remappé AVANT le déploiement de cette version : les clés
 * `totals.total_ht`, `items[]`, `tiime_lines[]` et `fiscal.outre_mer` n'existent plus.
 * Le mode `apercu: true` sert précisément à cela : il rend le payload exact sans rien
 * émettre, de quoi construire le nouveau mapping sur un cas réel.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * POURQUOI CETTE RÉÉCRITURE (audit Tiime, section b « PAYLOAD CIBLE ») :
 *
 *  · **Le port disparaissait de la facture.** Les lignes envoyées ne contenaient que la
 *    marchandise. La facture transmise valait donc systématiquement moins que
 *    l'encaissement, du montant exact des frais de port : chiffre d'affaires et TVA
 *    sous-déclarés à chaque commande. Le port est désormais une LIGNE
 *    (`line_kind: 'shipping'`), et le contrôle n° 3 refuse tout envoi dont le total
 *    s'écarte de la commande.
 *
 *  · **Les DOM partaient en « exportation hors UE ».** Le drapeau valait
 *    `/294/.test(invoice.vat_mention)` — or la mention affichée est re-déduite côté React
 *    et ne contient JAMAIS la chaîne « 294 ». Le test était donc TOUJOURS faux, et la
 *    branche outre-mer inatteignable. On lit maintenant `invoices.vat_territory`, persisté
 *    par `regime_tva()` : plus aucune déduction par expression régulière sur un texte libre.
 *
 *  · **Aucune ventilation de TVA.** Trois totaux indépendants, sans garantie que
 *    HT + TVA = TTC (écart d'un centime démontrable). L'ordre de calcul est désormais
 *    imposé : ligne → base par catégorie → taxe par catégorie → total.
 *
 *  · **`tiime_sent_at` ne prouvait rien.** Il était posé APRÈS l'envoi, sans verrou : deux
 *    clics simultanés créaient deux factures dans Tiime. Il est maintenant posé AVANT, par
 *    un UPDATE conditionnel atomique, et remis à NULL si l'envoi échoue. La réponse de Make
 *    est lue : `tiime_invoice_id`, `tiime_invoice_number` et `tiime_ack_at` sont conservés.
 *
 * SÉCURITÉ :
 *  - L'URL du webhook Make est un secret Supabase (MAKE_WEBHOOK_URL) — jamais exposée dans
 *    le navigateur (sinon n'importe qui pourrait créer des factures dans Tiime).
 *  - Seul un admin (`profiles.role = 'admin'`) peut invoquer la fonction, ou le serveur
 *    lui-même (`process-refund` transmet le jeton de l'administrateur qui a remboursé).
 *
 * CONFIGURATION :
 *   npx supabase secrets set MAKE_WEBHOOK_URL=https://hook.eu2.make.com/...
 * Tant que le secret n'est pas configuré, la fonction répond proprement
 * { configured: false } sans erreur.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@14.24.0';

const ORIGINES = [
  'https://omegasud.fr',
  'https://www.omegasud.fr',
  'https://omegasud.netlify.app', // préproduction Netlify
  ...(Deno.env.get('CORS_EXTRA_ORIGINS') || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
];

const enTetesCors = (req: Request) => ({
  'Access-Control-Allow-Origin': ORIGINES.includes(req.headers.get('origin') || '')
    ? (req.headers.get('origin') as string)
    : ORIGINES[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
});

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
);

/* ═══════════════════════════════════════════════════════════════════════════════
   OUTILS — montants, dates, identifiants
   ═══════════════════════════════════════════════════════════════════════════════ */

/** Euros à 2 décimales. Le payload ne transporte JAMAIS de centimes : les centimes
    n'existent que dans l'API Stripe, et les confondre a déjà coûté des factures ×100. */
const eur = (n: unknown): number => Math.round((Number(n) || 0) * 100) / 100;

/**
 * `AAAA-MM-JJ` dans le fuseau de Paris.
 * ⚠ `toISOString().slice(0,10)` sur un `timestamptz` est FAUX : une facture émise le
 * 1ᵉʳ janvier à 00 h 30 à Paris ressort au 31 décembre en UTC — donc sur l'exercice
 * précédent. C'est une erreur de période, pas une coquetterie de fuseau.
 */
const ymdParis = (d: string | Date | null | undefined): string =>
  new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d ? new Date(d) : new Date());

/** ISO 8601 complet avec décalage explicite : `2026-08-04T14:23:11+02:00`. */
function isoParis(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const v = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  const zone = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris', timeZoneName: 'longOffset',
  }).formatToParts(d).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+00:00';
  const decalage = zone.replace('GMT', '') || '+00:00';
  return `${v('year')}-${v('month')}-${v('day')}T${v('hour')}:${v('minute')}:${v('second')}${decalage}`;
}

/**
 * UUID v5 — déterministe. C'est ce qui rend `event_id` STABLE : un renvoi après échec
 * réutilise le MÊME identifiant, et Make/Tiime peut rejeter un événement déjà traité.
 * Un UUID aléatoire aurait exactement l'effet inverse : chaque reprise créerait une
 * écriture de plus.
 */
const NAMESPACE_OMEGA = '1b671a64-40d5-491e-99b0-da01ff1f3341';
async function uuidV5(nom: string): Promise<string> {
  const ns = (NAMESPACE_OMEGA.replace(/-/g, '').match(/.{2}/g) ?? []).map((h) => parseInt(h, 16));
  const nomOctets = new TextEncoder().encode(nom);
  const entree = new Uint8Array(16 + nomOctets.length);
  entree.set(ns, 0);
  entree.set(nomOctets, 16);
  const empreinte = new Uint8Array(await crypto.subtle.digest('SHA-1', entree));
  const o = empreinte.slice(0, 16);
  o[6] = (o[6] & 0x0f) | 0x50; // version 5
  o[8] = (o[8] & 0x3f) | 0x80; // variante RFC 4122
  const hex = Array.from(o).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Code de catégorie de TVA (UNCL 5305, repris par EN 16931 / Factur-X).
 *   S  taux normal ou réduit · K  livraison intracommunautaire (262 ter I)
 *   G  exportation / hors champ territorial (262 I, et 294 pour l'outre-mer)
 *   AE autoliquidation de services · Z jamais émis (ce n'est PAS une exonération)
 * ★ Déduit du RÉGIME et du TERRITOIRE, jamais du taux : quatre régimes donnent 0 % et ne
 * se déclarent pas au même endroit.
 */
function codeCategorieTva(regime: string | null, territoire: string | null): string {
  if (regime === 'ue_b2b') return 'K';
  if (territoire === 'FR-DOM' || territoire === 'FR-COM') return 'G';
  if (regime === 'export') return 'G';
  return 'S';
}

/** Base légale de l'exonération — ce que le comptable doit lire noir sur blanc. */
function baseLegale(regime: string | null, territoire: string | null): string | null {
  if (territoire === 'FR-DOM' || territoire === 'FR-COM') return 'CGI art. 294';
  if (regime === 'ue_b2b') return 'CGI art. 262 ter I';
  if (regime === 'export') return 'CGI art. 262 I';
  return null;
}

/** Ligne de la déclaration de TVA. C'est elle qui évite au comptable de deviner. */
function ligneDeclaration(regime: string | null, territoire: string | null): string {
  if (territoire === 'FR-DOM' || territoire === 'FR-COM') return 'livraisons_outre_mer';
  if (regime === 'ue_b2b') return 'livraisons_intracommunautaires';
  if (regime === 'export') return 'exportations';
  if (regime === 'ue_b2c') return 'ventes_ue_b2c';
  return 'ventes_france';
}

/** Compte de produits : 707100 France · 707200 intracom · 707300 export · 707400 outre-mer. */
function compteProduits(regime: string | null, territoire: string | null): string {
  if (territoire === 'FR-DOM' || territoire === 'FR-COM') return '707400';
  if (regime === 'ue_b2b') return '707200';
  if (regime === 'export') return '707300';
  return '707100';
}

/** Motif d'exonération à imprimer — la mention figée à la vente, sinon un texte de repli. */
function motifExoneration(
  code: string, mention: string | null, regime: string | null, territoire: string | null
): string | null {
  if (code === 'S') return null;
  if (mention && mention.trim()) return mention.trim();
  // Repli : une catégorie ≠ S SANS motif est refusée par EN 16931 (règles BR-E/G/K-10).
  if (territoire === 'FR-DOM' || territoire === 'FR-COM') {
    return "Exonération de TVA — livraison vers un département ou une collectivité d'outre-mer (art. 294 du CGI).";
  }
  if (regime === 'ue_b2b') {
    return 'Exonération de TVA — livraison intracommunautaire, autoliquidation par le preneur (art. 262 ter I du CGI).';
  }
  if (regime === 'export') {
    return "Exonération de TVA — exportation hors de l'Union européenne (art. 262 I du CGI).";
  }
  return 'Opération exonérée de TVA.';
}

/** Adresse jsonb (formes multiples selon l'ancienneté) → adresse aplatie EN 16931. */
function aplatirAdresse(brut: unknown, codePaysDefaut: string | null) {
  const a = (brut && typeof brut === 'object' ? brut : {}) as Record<string, unknown>;
  const t = (v: unknown) => {
    const s = String(v ?? '').trim();
    return s === '' ? null : s;
  };
  return {
    line1: t(a.address_line_1 ?? a.address ?? a.line1 ?? a.street),
    line2: t(a.address_line_2 ?? a.line2 ?? a.complement),
    postal_code: t(a.postal_code ?? a.zip ?? a.cp),
    city: t(a.city ?? a.ville),
    // ★ ISO 3166-1 alpha-2 UNIQUEMENT. Deux valeurs contradictoires coexistaient
    // (« France » ici, « FR » là) : Tiime créait alors deux fois le même tiers.
    country_code: codePaysDefaut,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════ */

Deno.serve(async (req: Request) => {
  const corsHeaders = enTetesCors(req);
  const json = (corps: unknown, statut = 200) =>
    new Response(JSON.stringify(corps), {
      status: statut,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // --- 1. Authentification + rôle admin ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Non autorisé' }, 401);

    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return json({ error: 'Token invalide' }, 401);

    const { data: profile } = await supabaseAdmin
      .from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profile?.role !== 'admin') {
      return json({ error: 'Accès réservé aux administrateurs' }, 403);
    }

    // --- 2. Chargement du document + ses lignes ---
    const { invoiceId, force, apercu } = await req.json();
    if (!invoiceId) return json({ error: 'invoiceId requis' }, 400);

    const { data: invoice, error: loadError } = await supabaseAdmin
      .from('invoices')
      .select('*, invoice_items(*)')
      .eq('id', invoiceId)
      .maybeSingle();
    if (loadError || !invoice) return json({ error: 'Facture introuvable' }, 404);

    /* ⚠ UN DOCUMENT NE PART QU'UNE FOIS.
       Sans ce garde-fou, un second clic — ou un envoi automatique doublé d'un envoi
       manuel — crée une DEUXIÈME facture dans Tiime : chiffre d'affaires compté deux
       fois, TVA déclarée deux fois. Un renvoi reste possible, mais il doit être voulu. */
    if (invoice.tiime_sent_at && !force && !apercu) {
      return json({
        sent: false,
        deja_envoye: true,
        envoye_le: invoice.tiime_sent_at,
        tiime_invoice_number: invoice.tiime_invoice_number ?? null,
        message:
          `La facture ${invoice.invoice_number} a déjà été transmise à la comptabilité ` +
          `le ${new Date(invoice.tiime_sent_at).toLocaleString('fr-FR')}. ` +
          'La renvoyer créerait un doublon dans Tiime.',
      });
    }

    // --- 3. Config webhook : si absente, on répond proprement ---
    const webhookUrl = Deno.env.get('MAKE_WEBHOOK_URL');
    if (!webhookUrl && !apercu) {
      return json({
        sent: false,
        configured: false,
        message:
          "Le webhook Make n'est pas configuré. Créez le scénario Make " +
          '(Webhook → Tiime) puis : npx supabase secrets set MAKE_WEBHOOK_URL=…',
      });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 4. Collecte : commande, vendeur, acheteur, règlement, avoir
    // ═════════════════════════════════════════════════════════════════════════
    const estAvoir = invoice.document_type === 'credit_note';

    const { data: commande } = invoice.order_id
      ? await supabaseAdmin
          .from('orders')
          .select(
            'id, total, sub_total, shipping_cost, shipping_cost_ht, shipping_method, ' +
            'shipping_carrier, shipping_service, shipping_address, delivery_date, ' +
            'customer_country, vies_checked_at, vies_name, vies_address'
          )
          .eq('id', invoice.order_id).maybeSingle()
      : { data: null };

    const { data: vendeur } = await supabaseAdmin
      .from('billing_settings').select('*')
      .order('created_at', { ascending: true, nullsFirst: true }).limit(1).maybeSingle();

    const { data: acheteur } = invoice.customer_id
      ? await supabaseAdmin
          .from('profiles')
          .select('id, first_name, last_name, phone, siret, company_name, vat_number, is_company')
          .eq('id', invoice.customer_id).maybeSingle()
      : { data: null };

    // La facture d'origine, si c'est un avoir (BG-3 / BT-25, BT-26).
    const { data: factureOrigine } = estAvoir && invoice.credit_note_of
      ? await supabaseAdmin
          .from('invoices').select('invoice_number, created_at, total_ttc')
          .eq('id', invoice.credit_note_of).maybeSingle()
      : { data: null };

    // ═════════════════════════════════════════════════════════════════════════
    // 5. LIGNES — le port en est une (BG-25)
    // ═════════════════════════════════════════════════════════════════════════
    const regime: string | null = invoice.vat_regime ?? null;
    // ★ LE CORRECTIF CENTRAL : le territoire est LU, plus jamais deviné.
    const territoire: string | null = invoice.vat_territory ?? null;
    const codeTva = codeCategorieTva(regime, territoire);
    const mentionLegale: string | null = invoice.vat_mention ?? null;
    const motifExo = motifExoneration(codeTva, mentionLegale, regime, territoire);

    const brutes = [...(invoice.invoice_items ?? [])].sort(
      (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
    );

    // Références produit (sku) — une seule requête pour toutes les lignes.
    const idsProduits = [...new Set(brutes.map((l: any) => l.product_id).filter(Boolean))];
    const { data: produits } = idsProduits.length
      ? await supabaseAdmin.from('products').select('id, sku').in('id', idsProduits)
      : { data: [] as Array<{ id: string; sku: string | null }> };
    const skuParId = new Map((produits ?? []).map((p) => [p.id, p.sku]));

    const lines = brutes.map((it: any, i: number) => {
      const quantite = Number(it.quantity ?? 0);
      const puHt = eur(it.unit_price_ht);
      const taux = Number(it.tax_rate ?? invoice.vat_rate ?? 0);
      return {
        line_id: String(i + 1),                     // BT-126
        product_id: it.product_id ?? null,
        sku: it.product_id ? (skuParId.get(it.product_id) ?? null) : null,
        name: it.description,                       // BT-153
        quantity: quantite,                         // BT-129 — négatif sur un avoir
        unit_code: 'C62',                           // BT-130 · UN/ECE Rec 20 (« unité »)
        unit_price_ht: puHt,                        // BT-146 — TOUJOURS HT
        vat_rate: taux,                             // BT-152 — en POURCENTAGE (20, 5.5, 0)
        vat_category_code: codeTva,                 // BT-151
        vat_exemption_reason: motifExo,             // BT-127
        line_total_ht: eur(quantite * puHt),        // BT-131 = round(qté × pu, 2)
        /* ★ `goods` ou `shipping` : les deux ne vont pas au même compte (707x / 708x).
           La colonne `invoice_items.line_kind` existe précisément pour ne PAS avoir à
           reconnaître le texte « Frais de port », qui casse à la première reformulation. */
        line_kind: it.line_kind ?? 'goods',
      };
    });

    // ═════════════════════════════════════════════════════════════════════════
    // 6. VENTILATION DE TVA (BG-23) — le bloc qui produit les écritures 44571
    // ═════════════════════════════════════════════════════════════════════════
    /* ORDRE DE CALCUL IMPOSÉ : ligne → base par (catégorie, taux) → taxe par catégorie →
       total. Trois sommes indépendantes produisaient un écart d'un centime démontrable, et
       une facture dont HT + TVA ≠ TTC est refusée par toute plateforme e-invoicing. */
    const groupes = new Map<string, { code: string; taux: number; base: number }>();
    for (const l of lines) {
      const cle = `${l.vat_category_code}|${l.vat_rate}`;
      const g = groupes.get(cle) ?? { code: l.vat_category_code, taux: l.vat_rate, base: 0 };
      g.base = eur(g.base + l.line_total_ht);
      groupes.set(cle, g);
    }
    const vat_breakdown = [...groupes.values()].map((g) => ({
      category_code: g.code,                                  // BT-118
      rate: g.taux,                                           // BT-119
      taxable_amount: eur(g.base),                            // BT-116
      tax_amount: eur(g.base * (g.taux / 100)),               // BT-117
      exemption_reason: g.code === 'S' ? null : motifExo,     // BT-120 — obligatoire si ≠ S
      exemption_reason_code: null,                            // BT-121 — code VATEX si un jour
    }));

    const sumLineNet = eur(lines.reduce((s, l) => s + l.line_total_ht, 0));
    const totalVat = eur(vat_breakdown.reduce((s, v) => s + v.tax_amount, 0));
    const totalWithVat = eur(sumLineNet + totalVat);

    // ═════════════════════════════════════════════════════════════════════════
    // 7. RÈGLEMENT (bloc absent jusqu'ici — rapprochement bancaire impossible)
    // ═════════════════════════════════════════════════════════════════════════
    let paiement: Record<string, any> | null = null;
    {
      const { data: parFacture } = await supabaseAdmin
        .from('payment_records').select('*').eq('invoice_id', invoice.id)
        .neq('status', 'failed').order('created_at', { ascending: false }).limit(1);
      let rec = parFacture?.[0] ?? null;
      /* Repli par la commande : le règlement est écrit AU MOMENT DU PAIEMENT, donc avant
         que la facture n'existe — `invoice_id` y est nul et seul `order_id` est renseigné. */
      if (!rec && invoice.order_id) {
        const { data: parCommande } = await supabaseAdmin
          .from('payment_records').select('*').eq('order_id', invoice.order_id)
          .neq('status', 'failed').order('created_at', { ascending: false }).limit(1);
        rec = parCommande?.[0] ?? null;
        /* On rattache au passage : l'écran Facturation lit `invoice.payment_records`, et
           un règlement écrit avant la facture n'y apparaissait jamais.
           ⚠ JAMAIS sur un AVOIR : le règlement appartient à la facture d'ORIGINE. Le
           rattacher à l'avoir le lui volerait, et la facture d'origine passerait pour
           impayée. */
        if (rec && !rec.invoice_id && !estAvoir) {
          await supabaseAdmin.from('payment_records')
            .update({ invoice_id: invoice.id }).eq('id', rec.id);
        }
      }

      if (rec) {
        /* Commission et net manquants (règlement antérieur à leur enregistrement) : une
           seule requête Stripe suffit à les obtenir, et on les conserve pour la suite. */
        if ((rec.stripe_fee === null || rec.stripe_fee === undefined) &&
            Deno.env.get('STRIPE_SECRET_KEY') && String(rec.reference || '').startsWith('pi_')) {
          try {
            const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
              apiVersion: '2024-06-20',
              httpClient: Stripe.createFetchHttpClient(),
            });
            const pi = await stripe.paymentIntents.retrieve(rec.reference, {
              expand: ['latest_charge.balance_transaction'],
            });
            const ch = pi.latest_charge as Stripe.Charge | null;
            const bt = (ch && typeof ch === 'object' ? ch.balance_transaction : null) as
              Stripe.BalanceTransaction | null;
            if (bt && typeof bt === 'object') {
              rec = {
                ...rec,
                stripe_charge_id: rec.stripe_charge_id ?? (ch?.id ?? null),
                stripe_balance_transaction_id: bt.id,
                stripe_fee: eur(bt.fee / 100),
                stripe_net: eur(bt.net / 100),
              };
              await supabaseAdmin.from('payment_records').update({
                stripe_charge_id: rec.stripe_charge_id,
                stripe_balance_transaction_id: rec.stripe_balance_transaction_id,
                stripe_fee: rec.stripe_fee,
                stripe_net: rec.stripe_net,
              }).eq('id', rec.id);
            }
          } catch (e) {
            console.error('send-to-make : commission Stripe indisponible', e);
          }
        }

        paiement = {
          provider: 'stripe',
          method: 'card',                                     // → journal BQ / compte 512
          payment_intent_id: rec.reference ?? null,
          charge_id: rec.stripe_charge_id ?? null,
          balance_transaction_id: rec.stripe_balance_transaction_id ?? null,
          paid_at: rec.payment_date ? ymdParis(rec.payment_date) : null,
          amount_gross: eur(rec.amount),
          fee: rec.stripe_fee === null || rec.stripe_fee === undefined ? null : eur(rec.stripe_fee),
          amount_net: rec.stripe_net === null || rec.stripe_net === undefined ? null : eur(rec.stripe_net),
          /* Le virement groupé qui contient ce paiement : rempli par l'événement
             `payout.paid` du webhook Stripe. C'est LA clé qui permet de solder le 512 en
             un seul lettrage — sans elle, le rapprochement se fait ligne à ligne. */
          payout_id: rec.stripe_payout_id ?? null,
          payout_date: rec.stripe_payout_date ? ymdParis(rec.stripe_payout_date) : null,
        };
      }
    }

    // Remboursements (bloc `refund`, uniquement sur un avoir).
    const { data: remboursements } = await supabaseAdmin
      .from('refunds')
      .select('stripe_refund_id, amount, reason, created_at, status')
      .eq('invoice_id', estAvoir ? (invoice.credit_note_of ?? invoice.id) : invoice.id)
      .order('created_at', { ascending: false });
    const remboursesOk = (remboursements ?? []).filter(
      (r) => r.status !== 'failed' && r.status !== 'canceled'
    );
    const cumulRembourse = eur(remboursesOk.reduce((s, r) => s + Number(r.amount || 0), 0));

    /* Déjà encaissé (BT-113) et reste dû (BT-115). C'est `amount_due` qui doit rester au
       compte 411 : sans lui, une facture réglée par carte y demeure indéfiniment et le
       lettrage client ne tombe jamais juste.
       Repli sur le règlement Stripe quand `amount_paid` n'a pas été renseigné (factures
       antérieures à `creer_facture_depuis_commande`). */
    const encaisse =
      Number(invoice.amount_paid ?? 0) > 0
        ? Number(invoice.amount_paid)
        : invoice.status === 'paid'
          ? Number(paiement?.amount_gross ?? 0)
          : 0;
    const prepaid = estAvoir
      ? eur(-Math.min(cumulRembourse, Math.abs(totalWithVat)))
      : eur(Math.min(encaisse, totalWithVat));

    // ═════════════════════════════════════════════════════════════════════════
    // 8. ACHETEUR — c'est ce bloc qui crée ou retrouve le tiers dans Tiime
    // ═════════════════════════════════════════════════════════════════════════
    /* Le pays passe par le référentiel : les adresses portent un NOM de pays saisi au
       clavier (« France », « Allemagne »), Tiime attend un code ISO. Deux valeurs
       contradictoires circulaient, si bien que le même client pouvait être créé deux fois. */
    const paysFacturation =
      (invoice.billing_address as any)?.country ?? invoice.customer_country ?? null;
    const { data: isoFacturation } = paysFacturation
      ? await supabaseAdmin.rpc('code_pays', { p: String(paysFacturation) })
      : { data: null };
    const codePaysAcheteur =
      (isoFacturation as string | null) ??
      (invoice.customer_country && String(invoice.customer_country).length === 2
        ? String(invoice.customer_country).toUpperCase()
        : null);

    const adresseFacturation = aplatirAdresse(
      invoice.billing_address ?? invoice.customer_address, codePaysAcheteur
    );
    const adresseLivraison = commande?.shipping_address
      ? aplatirAdresse(commande.shipping_address, codePaysAcheteur)
      : null;
    const memeAdresse =
      adresseLivraison &&
      adresseLivraison.line1 === adresseFacturation.line1 &&
      adresseLivraison.postal_code === adresseFacturation.postal_code;

    const contactNom =
      [acheteur?.first_name, acheteur?.last_name].filter(Boolean).join(' ').trim() ||
      invoice.customer_name || null;

    const buyer = {
      /* ★ CLÉ DE DÉDUPLICATION. Le scénario Make doit chercher le tiers PAR CET ID, jamais
         par le nom : deux « SARL Dupont » existent, et un client qui corrige sa raison
         sociale ne doit pas devenir un second tiers. */
      external_id: invoice.customer_id ?? null,
      is_company: invoice.is_company === true,
      name: invoice.is_company
        ? (invoice.company_name || acheteur?.company_name || invoice.customer_name)
        : invoice.customer_name,
      contact_name: contactNom,
      // Obligatoire pour un acheteur société française (facturation électronique 2026).
      siret: (acheteur?.siret ?? null) || null,
      vat_number: invoice.vat_number ?? acheteur?.vat_number ?? null,   // BT-48
      email: invoice.customer_email ?? null,
      phone: invoice.customer_phone ?? acheteur?.phone ?? null,
      address: adresseFacturation,
      // BG-15 : l'adresse de livraison est la PREUVE de l'exonération (export, intracom).
      delivery_address: memeAdresse ? null : adresseLivraison,
    };

    // ═════════════════════════════════════════════════════════════════════════
    // 9. VENDEUR — depuis `billing_settings`, plus aucun texte libre
    // ═════════════════════════════════════════════════════════════════════════
    const siretVendeur = String(vendeur?.siret ?? '').replace(/\D/g, '');
    const banque = (vendeur?.bank_details ?? {}) as Record<string, string>;
    const seller = {
      name: vendeur?.company_name ?? 'OMEGA',
      // `billing_settings` ne porte pas la forme juridique : à ajouter le jour où elle
      // sera saisie plutôt qu'à deviner à partir de la raison sociale.
      legal_form: null,
      siret: siretVendeur || null,                                   // BT-30
      // SIREN = les 9 premiers chiffres du SIRET. Clé de routage e-invoicing 2026.
      siren: siretVendeur.length >= 9 ? siretVendeur.slice(0, 9) : null,
      vat_number: vendeur?.vat_number || null,                       // BT-31
      address: {
        line1: vendeur?.company_address ?? null,
        line2: null,
        postal_code: vendeur?.company_postal_code ?? null,
        city: vendeur?.company_city ?? null,
        country_code: 'FR',
      },
      email: vendeur?.company_email ?? null,
      phone: vendeur?.company_phone ?? null,
      iban: banque?.iban || null,
      bic: banque?.bic || null,
      legal_mentions: invoice.legal_mentions ?? vendeur?.legal_mentions ?? null,
    };

    // ═════════════════════════════════════════════════════════════════════════
    // 10. OSS et preuve VIES
    // ═════════════════════════════════════════════════════════════════════════
    const { data: reglageOss } = await supabaseAdmin
      .from('site_settings').select('value').eq('key', 'oss_actif').maybeSingle();
    const ossActif = ((reglageOss as any)?.value?.actif ?? false) === true;
    const oss = regime === 'ue_b2c' && ossActif && Number(invoice.vat_rate ?? 20) !== 20;

    const preuveVies = regime === 'ue_b2b' && commande?.vies_checked_at
      ? {
          checked_at: commande.vies_checked_at,
          vies_name: commande.vies_name ?? null,
          vies_address: commande.vies_address ?? null,
        }
      : null;

    // ═════════════════════════════════════════════════════════════════════════
    // 11. REPÈRES COMPTABLES — l'invariant explicité, pas laissé au mapping
    // ═════════════════════════════════════════════════════════════════════════
    const compteVente = compteProduits(regime, territoire);
    const compteClient =
      '411' +
      (invoice.customer_id
        ? String(invoice.customer_id).replace(/-/g, '').slice(0, 8).toUpperCase()
        : 'DIVERS');
    const htMarchandise = eur(
      lines.filter((l) => l.line_kind !== 'shipping').reduce((s, l) => s + l.line_total_ht, 0)
    );
    const htPort = eur(
      lines.filter((l) => l.line_kind === 'shipping').reduce((s, l) => s + l.line_total_ht, 0)
    );
    const compteTva = totalVat !== 0 ? '445710' : null;
    /* Sur un AVOIR (381), le sens s'inverse : 707 et 44571 au DÉBIT, 411 au CRÉDIT. Comme
       les montants des lignes sont déjà négatifs, la même construction produit exactement
       cet effet — et le contrôle d'équilibre reste vérifiable côté récepteur. */
    const expected_entry = [
      { account: compteClient, debit: eur(totalWithVat), credit: 0 },
      ...(htMarchandise !== 0
        ? [{ account: compteVente, debit: 0, credit: eur(htMarchandise) }] : []),
      // 708500 : produits des activités annexes — c'est là que va le port, jamais en 707.
      ...(htPort !== 0 ? [{ account: '708500', debit: 0, credit: eur(htPort) }] : []),
      ...(compteTva ? [{ account: compteTva, debit: 0, credit: eur(totalVat) }] : []),
    ];

    // ═════════════════════════════════════════════════════════════════════════
    // 12. LE PAYLOAD (schema_version 2.0)
    // ═════════════════════════════════════════════════════════════════════════
    /* `event_id` STABLE : réutilisé s'il a déjà été calculé pour ce document. Un renvoi
       après échec porte donc le MÊME identifiant, et Make/Tiime peut refuser un événement
       déjà traité au lieu de créer une seconde écriture. */
    const eventId =
      invoice.tiime_event_id ??
      (await uuidV5(`${invoice.id}|${estAvoir ? 'credit_note' : 'invoice'}|0`));

    /* ⚠ Un paiement Stripe de TEST ne doit JAMAIS produire une écriture comptable. La
       garde existait pour Factur-X, elle est ici généralisée : c'est la clé secrète qui
       décide, pas une variable qu'on oublierait de changer. */
    const environnement =
      Deno.env.get('APP_ENVIRONMENT') ||
      ((Deno.env.get('STRIPE_SECRET_KEY') || '').startsWith('sk_live_') ? 'production' : 'sandbox');

    const payload = {
      schema_version: '2.0',
      event_id: eventId,
      event_type: estAvoir ? 'invoice.credited' : 'invoice.issued',
      emitted_at: isoParis(),
      source: 'omegasud.fr',
      environment: environnement,

      document: {
        type_code: estAvoir ? 381 : 380,
        number: invoice.invoice_number,
        issue_date: ymdParis(invoice.created_at),
        due_date: ymdParis(invoice.due_date ?? invoice.created_at),
        currency: 'EUR',
        buyer_reference: invoice.order_id ? `CMD-${String(invoice.order_id).slice(0, 8)}` : null,
        order_reference: invoice.order_id ?? null,
        // ⚠ `note` est destiné au CLIENT : on n'y met JAMAIS de commentaire interne.
        note: invoice.notes ?? null,
        status: invoice.status,
        delivery_date: invoice.delivery_date
          ? ymdParis(invoice.delivery_date)
          : commande?.delivery_date ? ymdParis(commande.delivery_date) : null,
        preceding_invoice: estAvoir && factureOrigine
          ? {
              number: factureOrigine.invoice_number,
              issue_date: ymdParis(factureOrigine.created_at),
            }
          : null,
      },

      seller,
      buyer,
      lines,
      vat_breakdown,

      totals: {
        sum_line_net: sumLineNet,                       // BT-106
        allowances: 0,                                  // BT-107
        charges: 0,                                     // BT-108 — le port est une LIGNE
        total_without_vat: sumLineNet,                  // BT-109
        total_vat: totalVat,                            // BT-110
        total_with_vat: totalWithVat,                   // BT-112 = 109 + 110, garanti
        prepaid_amount: prepaid,                        // BT-113
        amount_due: eur(totalWithVat - prepaid),        // BT-115 — ce qui reste au 411
      },

      fiscal: {
        regime,
        // ★ Persisté par `regime_tva()`. Plus AUCUNE déduction par expression régulière.
        territory: territoire,
        is_overseas: territoire === 'FR-DOM' || territoire === 'FR-COM',
        legal_mention: mentionLegale,
        legal_basis: baseLegale(regime, territoire),
        declaration_line: ligneDeclaration(regime, territoire),
        oss,
        oss_country: oss ? codePaysAcheteur : null,
        vies_proof: preuveVies,
      },

      payment: paiement,

      refund: estAvoir && remboursesOk.length
        ? {
            stripe_refund_id: remboursesOk[0].stripe_refund_id ?? null,
            reason: remboursesOk[0].reason ?? null,
            refunded_at: ymdParis(remboursesOk[0].created_at),
            amount_gross: cumulRembourse,
            is_partial: !!factureOrigine &&
              cumulRembourse < Number(factureOrigine.total_ttc ?? 0) - 0.01,
            // Stripe ne restitue pas sa commission sur un remboursement.
            fee_refunded: 0,
          }
        : null,

      accounting_hints: {
        journal: 'VE',
        customer_account: compteClient,
        revenue_account: compteVente,
        shipping_revenue_account: htPort !== 0 ? '708500' : null,
        vat_account: compteTva,
        expected_entry,
      },
    };

    // ═════════════════════════════════════════════════════════════════════════
    // 13. LES HUIT CONTRÔLES BLOQUANTS — refus si l'un échoue
    // ═════════════════════════════════════════════════════════════════════════
    /* Ils ne sont pas décoratifs : chacun correspond à un défaut CONSTATÉ. Le n° 3 est
       celui qui attrape la disparition du port, c'est-à-dire l'écart entre la facture
       transmise et l'argent réellement encaissé. */
    const refus: string[] = [];
    const alertes: string[] = [];

    // 1. Les lignes et le sous-total du document disent la même chose.
    const sommeLignes = eur(lines.reduce((s, l) => s + l.line_total_ht, 0));
    if (Math.abs(sommeLignes - payload.totals.sum_line_net) >= 0.005) {
      refus.push(`Σ lignes (${sommeLignes}) ≠ totals.sum_line_net (${payload.totals.sum_line_net}).`);
    }
    if (invoice.subtotal_ht !== null && Math.abs(sommeLignes - Number(invoice.subtotal_ht)) >= 0.01) {
      refus.push(
        `Σ lignes (${sommeLignes} €) ≠ subtotal_ht enregistré (${invoice.subtotal_ht} €) : ` +
        `les lignes et les totaux de la facture divergent.`
      );
    }

    // 2. HT + TVA = TTC, sans écart d'arrondi.
    if (Math.abs(payload.totals.total_without_vat + payload.totals.total_vat - payload.totals.total_with_vat) >= 0.005) {
      refus.push('total_without_vat + total_vat ≠ total_with_vat.');
    }

    // 3. ★ Le total transmis vaut l'encaissement. C'est ce contrôle qui rend impossible
    //    la disparition du port constatée sur toutes les factures antérieures.
    const attendu = estAvoir
      ? -Number(factureOrigine?.total_ttc ?? Math.abs(totalWithVat))
      : Number(commande?.total ?? invoice.total_ttc ?? 0);
    if (Math.abs(payload.totals.total_with_vat - attendu) >= 0.01) {
      refus.push(
        `total_with_vat (${payload.totals.total_with_vat} €) ≠ ` +
        `${estAvoir ? 'total de la facture annulée' : 'total de la commande'} (${eur(attendu)} €). ` +
        `Écart de ${eur(Math.abs(payload.totals.total_with_vat - attendu))} € — vérifier la ligne de port.`
      );
    }

    // 4. Le régime est dit, et un régime exonéré ne produit pas de TVA.
    if (!regime) {
      refus.push('fiscal.regime absent : le comptable ne saurait pas sur quelle ligne déclarer.');
    }
    if (codeTva !== 'S' && payload.totals.total_vat !== 0) {
      refus.push(
        `Régime exonéré (${codeTva}) mais TVA non nulle (${payload.totals.total_vat} €).`
      );
    }

    // 5. Une catégorie ≠ S sans motif est refusée par EN 16931 (BR-E/G/K-10).
    for (const v of vat_breakdown) {
      if (v.category_code !== 'S' && !v.exemption_reason) {
        refus.push(`Catégorie ${v.category_code} sans motif d'exonération.`);
      }
    }

    /* 6. SIRET de l'acheteur société française.
       ⚠ ÉCART ASSUMÉ AVEC L'AUDIT, conforme au CONTRAT §2 qui qualifie ce contrôle de
       « non bloquant » : la colonne `profiles.siret` vient d'être créée et elle est vide
       pour tous les clients existants. Bloquer ici arrêterait AUJOURD'HUI toute la
       comptabilité B2B française. On alerte donc, on ne refuse pas — à rendre bloquant
       une fois les SIRET collectés (échéance réglementaire : 1ᵉʳ septembre 2026). */
    if (buyer.is_company && buyer.address.country_code === 'FR' && !buyer.siret) {
      alertes.push(
        `SIRET manquant pour « ${buyer.name} » : obligatoire sur une facture entre ` +
        `professionnels français à compter du 1ᵉʳ septembre 2026.`
      );
    }

    // 7. Un brouillon ou un document annulé n'a rien à faire en comptabilité.
    if (invoice.status === 'draft' || invoice.status === 'cancelled') {
      refus.push(
        `Le document est « ${invoice.status} » : un brouillon n'est pas une facture, ` +
        `et une facture annulée se corrige par un avoir.`
      );
    }

    if (refus.length) {
      return json({
        sent: false,
        refuse: true,
        controles: refus,
        alertes,
        message:
          'Envoi refusé : la facture ne peut pas partir en comptabilité en l\'état.\n· ' +
          refus.join('\n· '),
        ...(apercu ? { payload } : {}),
      }, apercu ? 200 : 422);
    }

    /* --- 14. APERÇU : on montre ce qui partirait, sans rien envoyer.
       Sert au back-office (« voir ce qui part en comptabilité ») et surtout à reconstruire
       le mapping Make : vérifier le contenu ne doit jamais créer d'écriture dans Tiime. */
    if (apercu) {
      return json({ sent: false, apercu: true, alertes, payload });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 15. VERROU ATOMIQUE, puis envoi (contrôle n° 8)
    // ═════════════════════════════════════════════════════════════════════════
    /* ★ Le drapeau est posé AVANT l'envoi, par un UPDATE conditionnel : c'est la seule
       façon d'empêcher deux appels concurrents de partir tous les deux. La version
       précédente le posait APRÈS — deux clics simultanés créaient donc deux factures dans
       Tiime, avec deux fois le chiffre d'affaires et deux fois la TVA.
       En cas d'échec de l'envoi, le drapeau est REMIS À NULL : la facture réapparaît dans
       « Reste à envoyer », jamais perdue en silence. */
    const envoyeLe = new Date().toISOString();
    let verrouPris = true;
    if (!force) {
      const { data: verrou } = await supabaseAdmin
        .from('invoices')
        .update({ tiime_sent_at: envoyeLe, tiime_event_id: eventId })
        .eq('id', invoice.id)
        .is('tiime_sent_at', null)
        .select('id');
      verrouPris = (verrou?.length ?? 0) > 0;
      if (!verrouPris) {
        return json({
          sent: false,
          deja_envoye: true,
          message:
            `La facture ${invoice.invoice_number} vient d'être transmise par un autre appel. ` +
            `Aucun doublon n'a été créé.`,
        });
      }
    } else {
      await supabaseAdmin.from('invoices')
        .update({ tiime_sent_at: envoyeLe, tiime_event_id: eventId }).eq('id', invoice.id);
    }

    let reponseMake: Record<string, any> | null = null;
    try {
      const res = await fetch(webhookUrl as string, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`Webhook Make : échec (${res.status}) ${detail}`.trim());
      }
      const brut = await res.text().catch(() => '');
      try { reponseMake = brut ? JSON.parse(brut) : null; } catch { reponseMake = null; }
    } catch (e) {
      // Libération du verrou : sans cela, une facture jamais reçue passerait pour envoyée.
      await supabaseAdmin.from('invoices')
        .update({ tiime_sent_at: null }).eq('id', invoice.id);
      console.error('send-to-make : envoi en échec, verrou libéré', e);
      return json({
        sent: false,
        configured: true,
        error: e instanceof Error ? e.message : String(e),
      }, 502);
    }

    /* ★ ACCUSÉ DE RÉCEPTION. Un 200 de Make signifie « mis en file », pas « comptabilisé » :
       `tiime_sent_at` ne prouvait donc rien. Si le scénario Make se termine par un module
       « Webhook response » renvoyant l'identifiant Tiime, on le conserve — c'est LUI la
       preuve, et c'est lui qui permet de retrouver la facture dans Tiime depuis le
       back-office. ⚠ Tiime RENUMÉROTE : son numéro n'est pas le nôtre, les deux doivent
       cohabiter. */
    const ack: Record<string, unknown> = {};
    if (reponseMake?.tiime_invoice_id) ack.tiime_invoice_id = String(reponseMake.tiime_invoice_id);
    if (reponseMake?.tiime_invoice_number) ack.tiime_invoice_number = String(reponseMake.tiime_invoice_number);
    if (Object.keys(ack).length) {
      ack.tiime_ack_at = new Date().toISOString();
      await supabaseAdmin.from('invoices').update(ack).eq('id', invoice.id);
    }

    return json({
      sent: true,
      configured: true,
      envoye_le: envoyeLe,
      renvoi: !!force,
      event_id: eventId,
      alertes,
      accuse_reception: Object.keys(ack).length ? ack : null,
      message: Object.keys(ack).length
        ? `Transmise et accusée par Tiime (${ack.tiime_invoice_number ?? ack.tiime_invoice_id}).`
        : 'Transmise à Make. ⚠ Aucun accusé de réception Tiime : le scénario Make ne renvoie ' +
          'pas encore de réponse, la comptabilisation n\'est donc pas confirmée.',
    });
  } catch (error) {
    console.error('send-to-make : erreur globale', error);
    return json({
      error: 'Erreur interne du serveur.',
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
