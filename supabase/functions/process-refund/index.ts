/*
  REMBOURSEMENT — Stripe rend l'argent, la comptabilité suit.

  ## Ce qui a été corrigé le 5 août
  1. **Aucune clé d'idempotence.** Deux onglets ouverts sur la même facture, un double clic
     ou un simple rejeu réseau créaient DEUX remboursements Stripe. L'argent partait deux
     fois et rien ne s'y opposait. La clé est désormais déterministe : même facture, même
     charge, même montant, même rang ⇒ Stripe reconnaît la demande et rend le PREMIER
     remboursement au lieu d'en créer un second.
  2. **TVA à 20 % en dur.** `invoiced_item_vat_rate: 0.2` et `amount / 1.2` étaient écrits
     dans le code. Sur une facture exonérée — livraison intracommunautaire, exportation,
     outre-mer — on déclarait ainsi à la comptabilité une TVA qui n'avait JAMAIS été
     collectée : TVA déduite à tort, redressement assuré. Le taux, le régime et la mention
     sont maintenant relus SUR LA FACTURE D'ORIGINE, où ils ont été figés à la vente.
  3. **Aucun statut mis à jour.** `refunded` est lu partout — `declaration_tva`,
     `declaration_des`, l'écran Facturation — mais n'était écrit nulle part. Une commande
     remboursée restait « payée » et continuait d'alimenter la TVA collectée.
  4. **Pas d'avoir.** Une facture émise est inaltérable (migration 20260805020000) : la
     seule correction régulière est un AVOIR. On appelle donc `creer_avoir_depuis_facture()`
     dès que le remboursement solde la facture, et c'est CET AVOIR qui part en comptabilité,
     par le même constructeur de payload que les factures — pas une seconde version.

  ## Ce qui n'a pas bougé, et pourquoi
  · Le contrôle du rôle administrateur (il n'existait pas : n'importe quel client connecté
    pouvait se faire rembourser après réception de la marchandise).
  · L'ordre de priorité : l'argent d'abord, la trace ensuite. Un échec du webhook comptable
    ne fait JAMAIS échouer le remboursement — il est déjà acquis chez Stripe.
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
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, idempotency-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
});

/** Interface alignée sur ce qu'envoient AdminOrders et AdminBilling (les deux appelants). */
interface RefundRequest {
  invoiceId: string;
  amount: number;
  /* Lignes à créditer, choisies par l'administrateur : [{item_id, quantity}].
     Absentes → avoir global du montant remboursé (compatibilité de l'appel historique). */
  lignes?: Array<{ item_id: string; quantity: number }>;
  /** La marchandise revient-elle en stock ? Décidé au cas par cas, jamais deviné. */
  remettreEnStock?: boolean;
  reason: string;
  adminNotes?: string;
  /** Envoyé par AdminBilling — indice de dernier recours, jamais une autorisation. */
  chargeId?: string;
  orderId?: string;
}

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  // ★ Version d'API UNIFIÉE sur les cinq fonctions Stripe du projet : deux versions
  // différentes, ce sont deux formes de réponse possibles pour un même objet.
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(), // Nécessaire pour Deno
});

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
);

/** Date du jour à Paris, `AAAA-MM-JJ` — jamais `toISOString()` sur un `timestamptz`. */
const jourParis = (d: Date = new Date()) =>
  new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);

const cts = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Code de catégorie de TVA (UNCL 5305, repris par EN 16931 / Factur-X).
 * Déduit du RÉGIME et du TERRITOIRE, jamais du seul taux : quatre régimes différents
 * donnent 0 % et ne se déclarent pas au même endroit.
 */
function codeCategorieTva(regime: string | null, territoire: string | null): string {
  if (regime === 'ue_b2b') return 'K';                        // 262 ter I — intracommunautaire
  if (territoire === 'FR-DOM' || territoire === 'FR-COM') return 'G'; // 294 — outre-mer
  if (regime === 'export') return 'G';                        // 262 I — exportation
  return 'S';
}

Deno.serve(async (req: Request) => {
  const corsHeaders = enTetesCors(req);
  const json = (corps: unknown, statut = 200) =>
    new Response(JSON.stringify(corps), {
      status: statut,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // --- 1. Sécurité et authentification ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Non autorisé' }, 401);

    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return json({ error: 'Token invalide' }, 401);

    /* ★★ CONTRÔLE DU RÔLE — IL N'EXISTAIT PAS.
       Il ne restait qu'un commentaire « Ajoutez ici votre vérification de rôle admin si
       nécessaire ». La fonction se contentait donc de vérifier que l'appelant était
       CONNECTÉ : n'importe quel client pouvait déclencher un remboursement Stripe, sur
       sa propre facture (se faire rembourser après avoir reçu la marchandise) comme sur
       celle d'un autre. De l'argent qui sort, sans aucune décision du vendeur. */
    const { data: profilAppelant } = await supabaseAdmin
      .from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profilAppelant?.role !== 'admin') {
      console.error(`process-refund : tentative par un non-administrateur (${user.id})`);
      return json({ error: 'Le remboursement est réservé aux administrateurs.' }, 403);
    }

    // --- 2. Validation de la requête ---
    const { invoiceId, amount, reason, adminNotes, chargeId, lignes, remettreEnStock }:
      RefundRequest = await req.json();

    if (!invoiceId || !amount || amount <= 0 || !reason) {
      return json({
        error: 'Données manquantes ou invalides : invoiceId, amount, et reason sont requis.',
      }, 400);
    }
    const montant = cts(amount);

    /* --- 3. La facture d'origine : c'est elle qui porte la vérité fiscale ---
       ★ Le régime, le taux, la mention et le territoire ont été FIGÉS à la vente. On les
       recopie tels quels sur l'avoir — on ne les redéduit jamais, et surtout pas d'un
       texte libre. */
    const { data: facture, error: eFacture } = await supabaseAdmin
      .from('invoices')
      .select(
        'id, order_id, invoice_number, customer_name, customer_email, status, document_type, ' +
        'subtotal_ht, tax_amount, total_ttc, vat_rate, vat_regime, vat_mention, vat_territory'
      )
      .eq('id', invoiceId)
      .maybeSingle();

    if (eFacture) console.error('process-refund : facture illisible', eFacture.message);
    if (!facture) return json({ error: 'Facture introuvable.' }, 404);
    if (facture.document_type === 'credit_note') {
      return json({ error: 'On ne rembourse pas un avoir.' }, 400);
    }

    const orderId = facture.order_id ?? null;
    const tauxTva = Number(facture.vat_rate ?? 20);
    const codeTva = codeCategorieTva(facture.vat_regime ?? null, facture.vat_territory ?? null);

    // --- 4. Recherche de la charge Stripe ---
    console.log(`process-refund : recherche de la charge pour la facture ${invoiceId}`);
    let charge: Stripe.Charge | null = null;
    let enregistrementPaiement: { id: string; invoice_id: string | null } | null = null;

    /* ⚠ On ne filtre PLUS sur `status = 'succeeded'`. Depuis que `stripe-webhook` fait
       évoluer ce statut (`refunded`, `partially_refunded`), le filtre historique faisait
       perdre la trace de la transaction d'origine dès le premier remboursement partiel :
       un second remboursement devenait impossible. */
    const { data: paiements } = await supabaseAdmin
      .from('payment_records')
      .select('id, invoice_id, reference, stripe_charge_id')
      .eq('invoice_id', invoiceId)
      .neq('status', 'failed')
      .order('created_at', { ascending: false });

    let record = paiements?.[0] ?? null;

    /* ⚠ Repli par la COMMANDE. Le règlement est écrit par le serveur au moment du
       paiement (`confirmer-commande` / `stripe-webhook`), c'est-à-dire AVANT que la
       facture n'existe : `invoice_id` y est donc nul et seul `order_id` est renseigné. */
    if (!record && orderId) {
      const { data: parCommande } = await supabaseAdmin
        .from('payment_records')
        .select('id, invoice_id, reference, stripe_charge_id')
        .eq('order_id', orderId)
        .neq('status', 'failed')
        .order('created_at', { ascending: false });
      record = parCommande?.[0] ?? null;
    }

    if (record) {
      enregistrementPaiement = { id: record.id, invoice_id: record.invoice_id };
      // On privilégie le charge_id s'il existe (plus direct).
      if (record.stripe_charge_id?.startsWith('ch_')) {
        charge = await stripe.charges.retrieve(record.stripe_charge_id);
      } else if (record.reference?.startsWith('pi_')) {
        const pi = await stripe.paymentIntents.retrieve(record.reference, {
          expand: ['latest_charge'],
        });
        charge = pi.latest_charge as Stripe.Charge;
      }
    }

    /* Repli par la COMMANDE elle-même : les commandes antérieures à l'écriture serveur de
       `payment_records` n'ont qu'un `stripe_payment_intent_id` sur `orders`. */
    if (!charge && orderId) {
      const { data: commande } = await supabaseAdmin
        .from('orders').select('stripe_payment_intent_id').eq('id', orderId).maybeSingle();
      if (commande?.stripe_payment_intent_id?.startsWith('pi_')) {
        const pi = await stripe.paymentIntents.retrieve(commande.stripe_payment_intent_id, {
          expand: ['latest_charge'],
        });
        charge = pi.latest_charge as Stripe.Charge;
      }
    }

    /* Dernier recours : l'identifiant saisi dans l'écran Facturation. Il vient d'un
       administrateur — donc d'une personne déjà autorisée à rembourser — mais on ne s'en
       sert QUE si rien en base n'a permis de retrouver la transaction, et on le trace. */
    if (!charge && chargeId) {
      console.warn(`process-refund : recours à l'identifiant saisi à la main (${chargeId})`);
      if (chargeId.startsWith('ch_')) {
        charge = await stripe.charges.retrieve(chargeId);
      } else if (chargeId.startsWith('pi_')) {
        const pi = await stripe.paymentIntents.retrieve(chargeId, { expand: ['latest_charge'] });
        charge = pi.latest_charge as Stripe.Charge;
      }
    }

    if (!charge?.id) {
      console.error(`process-refund : aucune charge Stripe pour la facture ${invoiceId}`);
      return json({
        error: 'Impossible de trouver la transaction Stripe associée à cette facture.',
      }, 404);
    }

    const paymentIntentId =
      typeof charge.payment_intent === 'string'
        ? charge.payment_intent
        : charge.payment_intent?.id ?? '';
    console.log(`process-refund : charge ${charge.id} trouvée.`);

    /* ★ RÉPARATION AU PASSAGE. Le règlement écrit au moment du paiement n'a pas d'
       `invoice_id` (la facture n'existait pas encore) : l'écran Facturation ne le voyait
       donc pas et proposait « aucun paiement enregistré » sur une facture pourtant réglée.
       On le rattache maintenant qu'on connaît les deux. */
    if (enregistrementPaiement && !enregistrementPaiement.invoice_id) {
      await supabaseAdmin
        .from('payment_records')
        .update({ invoice_id: invoiceId })
        .eq('id', enregistrementPaiement.id);
    }

    // --- 5. Montant remboursable ---
    const disponible = cts((charge.amount - charge.amount_refunded) / 100);
    if (montant > disponible) {
      return json({
        error: `Montant de remboursement trop élevé. Maximum disponible : ${disponible.toFixed(2)} €`,
      }, 400);
    }

    /* --- 6. Le remboursement Stripe, avec CLÉ D'IDEMPOTENCE ---
       La clé est déterministe et tient compte du RANG du remboursement : deux onglets qui
       demandent le même montant au même instant lisent le même rang, produisent la même
       clé, et Stripe ne rembourse qu'une fois. Un second remboursement partiel VOULU, lui,
       intervient après l'enregistrement du premier : le rang a changé, la clé aussi.
       ⚠ Sans ce rang, un remboursement légitime de 50 € suivi d'un autre de 50 € sur la
       même facture serait silencieusement absorbé par le premier (les clés Stripe vivent
       24 h). */
    const { count: dejaFaits } = await supabaseAdmin
      .from('refunds')
      .select('id', { count: 'exact', head: true })
      .eq('invoice_id', invoiceId);
    const cleIdempotence =
      req.headers.get('idempotency-key') ||
      `refund:${invoiceId}:${charge.id}:${Math.round(montant * 100)}:${dejaFaits ?? 0}`;

    const refund = await stripe.refunds.create(
      {
        charge: charge.id,
        amount: Math.round(montant * 100), // Stripe attend des centimes
        reason: 'requested_by_customer',   // valeur normalisée de Stripe
        metadata: {
          invoice_id: invoiceId,
          invoice_number: facture.invoice_number ?? '',
          reason_from_user: String(reason).slice(0, 400),
          processed_by: user.id,
          admin_notes: (adminNotes || 'N/A').slice(0, 400),
        },
      },
      { idempotencyKey: cleIdempotence }
    );

    console.log(`process-refund : remboursement Stripe ${refund.id} créé (clé ${cleIdempotence}).`);

    /* Un remboursement carte est irrévocable dès sa création : `succeeded` immédiatement,
       ou `pending` le temps du réseau bancaire. Seul `failed`/`canceled` interdit d'aller
       plus loin. Le webhook `charge.refunded` réajustera le statut réel de toute façon. */
    const reussi = refund.status === 'succeeded' || refund.status === 'pending';

    // --- 7. Enregistrement en base ---
    const { data: ligneRemb, error: dbError } = await supabaseAdmin.from('refunds').insert({
      invoice_id: invoiceId,
      order_id: orderId,
      stripe_refund_id: refund.id,
      stripe_payment_intent_id: paymentIntentId,
      amount: montant,
      reason: reason,
      // ★ `succeeded` dès que Stripe l'annonce : le statut restait figé sur la valeur du
      // jour de la demande, et l'écran Facturation ne décomptait jamais le remboursement.
      status: refund.status === 'pending' ? 'succeeded' : (refund.status ?? 'succeeded'),
      admin_notes: adminNotes || null,
      processed_by: user.id,
      created_by: user.id,
    }).select('id').single();

    if (dbError) {
      // Désynchronisation : l'argent est parti, la trace manque. On le dit franchement.
      console.error(
        'CRITIQUE : remboursement Stripe créé mais non enregistré en base.', dbError
      );
      return json({
        message:
          `Remboursement Stripe de ${montant.toFixed(2)} € effectué, mais erreur lors de la ` +
          `sauvegarde locale. Contactez le support (référence ${refund.id}).`,
        error: dbError.message,
        stripe_refund_id: refund.id,
      }, 207);
    }

    /* --- 8. Le remboursement est-il TOTAL ? ---
       On raisonne sur la FACTURE (somme des remboursements déjà enregistrés), pas sur la
       charge : une charge peut couvrir une commande dont la facture a été émise à part. */
    const { data: tousRemb } = await supabaseAdmin
      .from('refunds').select('amount, status').eq('invoice_id', invoiceId);
    const cumul = cts(
      (tousRemb ?? [])
        .filter((r) => r.status !== 'failed' && r.status !== 'canceled')
        .reduce((s, r) => s + Number(r.amount || 0), 0)
    );
    const totalFacture = Number(facture.total_ttc || 0);
    const remboursementTotal = totalFacture > 0 && cumul >= totalFacture - 0.01;

    let avoirId: string | null = null;
    let avoirPartiel = false;

    /* ★ REMBOURSEMENT PARTIEL → AVOIR PARTIEL.
       Avant, un remboursement partiel ne produisait AUCUN document : la vente restait
       entière en comptabilité, la TVA rendue restait déclarée, et Tiime ne recevait rien
       (son scénario n'a de route que pour `invoice.issued` et `invoice.credited`).
       Désormais tout remboursement produit un avoir, et emprunte donc le MÊME chemin
       comptable — un seul format à maintenir, une seule route côté Make. */
    const aDesLignes = Array.isArray(lignes) && lignes.length > 0;

    if (reussi && facture.status !== 'draft' && (aDesLignes || !remboursementTotal)) {
      /* ★ L'AVOIR SUIT LE REMBOURSEMENT, JAMAIS L'INVERSE.
         L'argent est déjà parti chez Stripe à ce stade : on documente ce qui a eu lieu.
         Si des LIGNES ont été choisies, l'avoir les reprend telles quelles (quantités,
         prix, taux d'origine) et peut remettre la marchandise en stock. Sinon on retombe
         sur un avoir du montant global — le cas d'un remboursement sans article précis. */
      const { data: idAvoir, error: eAvoir } = aDesLignes
        ? await supabaseAdmin.rpc('creer_avoir_lignes_depuis_facture', {
            p_invoice_id: invoiceId,
            p_lignes: lignes,
            p_motif: reason,
            p_refund_id: ligneRemb?.id ?? null,
            p_remettre_en_stock: remettreEnStock === true,
          })
        : await supabaseAdmin.rpc('creer_avoir_partiel_depuis_facture', {
            p_invoice_id: invoiceId,
            p_montant_ttc: montant,
            p_motif: reason,
            // Clé d'idempotence : un rejeu du webhook ne doit pas créer un second avoir.
            p_refund_id: ligneRemb?.id ?? null,
          });
      if (eAvoir) {
        // L'argent est rendu : on ne fait pas échouer le remboursement pour l'avoir.
        console.error('process-refund : avoir non émis', eAvoir.message);
      } else {
        avoirId = (idAvoir as string) ?? null;
        avoirPartiel = !remboursementTotal;
      }
    }

    if (reussi && remboursementTotal && !avoirId) {
      /* --- 9. ★ UN VRAI AVOIR, pas une facture positive en brouillon ---
         Une facture émise est inaltérable : l'avoir (type 381 de la norme EN 16931) est la
         SEULE correction régulière. `creer_avoir_depuis_facture` reprend les lignes avec
         des quantités négatives, numérote dans la série AV-, référence la facture annulée
         et passe celle-ci en `refunded` — le tout dans une transaction, et de façon
         idempotente (un second appel rend l'avoir existant). */
      if (facture.status === 'draft') {
        // Un brouillon n'a jamais été remis au client : il se corrige, il ne s'annule pas.
        await supabaseAdmin.from('invoices').update({ status: 'refunded' }).eq('id', invoiceId);
      } else {
        const { data: idAvoir, error: eAvoir } = await supabaseAdmin.rpc(
          'creer_avoir_depuis_facture',
          { p_invoice_id: invoiceId, p_motif: `Avoir sur remboursement — ${reason}`.slice(0, 300) }
        );
        if (eAvoir) {
          // On ne fait pas échouer le remboursement pour autant : l'argent est rendu.
          console.error('process-refund : avoir non émis', eAvoir.message);
          await supabaseAdmin.from('invoices').update({ status: 'refunded' }).eq('id', invoiceId);
        } else {
          avoirId = (idAvoir as string) ?? null;
        }
      }

      /* La commande suit. Le statut `refunded` déclenche aussi la restitution du stock
         (trigger `restaurer_stock_commande`) : c'est voulu, la marchandise revient. */
      if (orderId) {
        await supabaseAdmin.from('orders').update({ status: 'refunded' }).eq('id', orderId);
      }
    }

    /* --- 10. Comptabilité (Make → Tiime) — non bloquant ---
       ★ L'avoir part par le MÊME constructeur de payload que les factures (`send-to-make`).
       Écrire ici une seconde version du payload, c'est garantir qu'elles divergeront : la
       précédente codait 20 % en dur et n'a jamais suivi les corrections apportées à
       l'autre. Un seul chemin, un seul format. */
    let comptabilite: unknown = { envoye: false, motif: 'aucun avoir à transmettre' };
    if (avoirId) {
      try {
        const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-to-make`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: authHeader },
          body: JSON.stringify({ invoiceId: avoirId }),
        });
        comptabilite = await r.json().catch(() => ({ envoye: false }));
      } catch (e) {
        console.error('process-refund : avoir non transmis à la comptabilité', e);
        comptabilite = { envoye: false, motif: 'webhook comptable injoignable' };
      }
    } else {
      /* REPLI. Depuis l'avoir partiel, ce chemin ne sert plus qu'en cas d'ÉCHEC de son
         émission (ou sur une facture encore en brouillon) : l'argent est parti, la
         comptabilité doit au moins l'apprendre.
         ⚠ Le scénario Make n'a AUCUNE route pour `invoice.refunded_partially` : ce
         message n'atteint donc pas Tiime aujourd'hui. C'est assumé — le chemin normal
         est désormais l'avoir, qui passe par `invoice.credited`. */
      const webhook = Deno.env.get('MAKE_WEBHOOK_URL');
      if (webhook) {
        try {
          const netHt = cts(montant / (1 + tauxTva / 100));
          await fetch(webhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              schema_version: '2.0',
              source: 'omegasud.fr',
              type: 'refund',
              event_type: 'invoice.refunded_partially',
              invoice_id: invoiceId,
              invoice_number: facture.invoice_number ?? null,
              order_id: orderId,
              customer: {
                name: facture.customer_name ?? null,
                email: facture.customer_email ?? null,
              },
              fiscal: {
                regime: facture.vat_regime ?? null,
                territory: facture.vat_territory ?? null,
                vat_rate: tauxTva,
                vat_category_code: codeTva,
                legal_mention: facture.vat_mention ?? null,
              },
              refund: {
                amount: montant,
                amount_ht: netHt,
                amount_vat: cts(montant - netHt),
                currency: 'EUR',
                reason: reason,
                date: jourParis(),
                stripe_refund_id: refund.id,
                is_partial: true,
              },
              tiime_lines: [
                {
                  invoice_quantity: 1,
                  invoice_quantity_unit_of_measure_code: 'C62',
                  line_vat_information: {
                    // ★ Le taux RÉEL de la facture. `0.2` en dur déclarait une TVA jamais
                    // collectée sur toute vente exonérée.
                    invoiced_item_vat_rate: tauxTva / 100,
                    invoiced_item_vat_category_code: codeTva,
                    ...(codeTva !== 'S' && facture.vat_mention
                      ? { invoiced_item_vat_exemption_reason_text: facture.vat_mention }
                      : {}),
                  },
                  price_details: { item_net_price: netHt },
                  item_information: {
                    item_name: `Remboursement partiel facture ${facture.invoice_number ?? ''} — ${reason}`.slice(0, 200),
                    item_attributes: [
                      { item_attribute_name: 'type', item_attribute_value: 'sale' },
                    ],
                  },
                },
              ],
            }),
          });
          comptabilite = { envoye: true, partiel: true };
        } catch (e) {
          console.error('process-refund : webhook Make (refund partiel) en échec', e);
          comptabilite = { envoye: false, motif: 'webhook Make en échec' };
        }
      }
    }

    // --- 11. Réponse ---
    return json({
      message:
        `Remboursement de ${montant.toFixed(2)} € traité avec succès.` +
        (avoirId ? " Un avoir a été émis et transmis à la comptabilité." : ''),
      stripe_refund_id: refund.id,
      statut: refund.status,
      total: remboursementTotal,
      avoir_id: avoirId,
      comptabilite,
    });
  } catch (error) {
    console.error('process-refund : erreur globale', error);
    return json({
      error: 'Erreur interne du serveur.',
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
