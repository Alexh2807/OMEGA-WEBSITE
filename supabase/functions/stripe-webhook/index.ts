/*
  WEBHOOK STRIPE — le chemin de vérité de l'encaissement.

  ## Le trou que ceci ferme
  Jusqu'ici, le passage d'une commande en « payée » reposait ENTIÈREMENT sur un appel du
  navigateur (`confirmer-commande`) émis après la confirmation de la carte. Si le client
  fermait son onglet, perdait le réseau ou voyait sa batterie lâcher dans la seconde qui
  suivait, Stripe avait débité et il ne se passait plus rien : aucune commande, aucun
  article, aucun stock décrémenté, aucun e-mail, aucune facture. Le devis payé restait
  dans `order_quotes`, table que rien dans l'interface ne lit. Le client avait payé, et
  côté OMEGA il n'existait aucune trace exploitable — le défaut le plus coûteux du
  parcours, parce qu'il ne se voit pas : personne ne signale une commande qui n'existe pas.

  Vérifié le 5 août sur le compte `acct_1U0QAQBKwJrKGKfJ` (mode test) : `/v1/webhook_endpoints`
  renvoyait une liste VIDE. Aucun webhook n'était configuré, en test comme en production.

  ## Le principe
  Stripe appelle cette fonction à chaque événement. `payment_intent.succeeded` déclenche
  exactement la MÊME RPC `confirmer_commande` que le navigateur — elle est idempotente,
  les deux chemins convergent donc sans jamais créer deux commandes. Le webhook devient le
  chemin de vérité ; l'appel du navigateur n'est plus qu'un raccourci de latence, pour que
  le client voie sa commande sans attendre.

  ## Sécurité
  · `verify_jwt = false` : c'est Stripe qui appelle, il n'a pas de JWT Supabase. La
    déclaration est dans `supabase/config.toml`, sans quoi un `functions deploy` sans
    `--no-verify-jwt` refermerait la porte au nez de Stripe (401 sur chaque événement).
  · L'authentification est la SIGNATURE : `stripe.webhooks.constructEventAsync()` avec le
    secret d'endpoint. Sans elle, l'URL seule vaudrait mot de passe et n'importe qui
    pourrait faire passer des commandes pour payées.
  · ⚠ `constructEvent` (synchrone) n'existe PAS sous Deno : il s'appuie sur le module
    `crypto` de Node. Il faut la variante `…Async` avec le fournisseur SubtleCrypto.
  · Le corps doit être lu EN TEXTE BRUT (`req.text()`) : la signature porte sur les octets
    exacts, un aller-retour par `JSON.parse`/`stringify` la casse.

  ## Réponses
  · 400 sur signature invalide — Stripe ne rejoue pas, et c'est ce qu'on veut.
  · 200 sur tout événement inconnu ou non pertinent : un 500 ferait rejouer Stripe pendant
    trois jours pour un événement qu'on ne traitera jamais.
  · 500 UNIQUEMENT sur l'échec d'un traitement que l'on veut voir rejoué.

  ## Variables d'environnement
  ·  STRIPE_SECRET_KEY        (déjà en place)
  ·  STRIPE_WEBHOOK_SECRET    ★ À CRÉER — le `whsec_…` de l'endpoint, un par environnement
  ·  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (fournies par la plateforme)
*/
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'npm:stripe@14.24.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});

/* Fournisseur cryptographique WebCrypto : la vérification de signature sous Deno passe
   par `SubtleCrypto`, pas par le module `crypto` de Node. Le repli `undefined` laisse
   Stripe choisir son fournisseur par défaut si la bibliothèque ne l'expose pas. */
const fournisseurCrypto =
  typeof (Stripe as unknown as { createSubtleCryptoProvider?: () => unknown })
    .createSubtleCryptoProvider === 'function'
    ? (Stripe as unknown as { createSubtleCryptoProvider: () => Stripe.CryptoProvider })
        .createSubtleCryptoProvider()
    : undefined;

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

/** Date du jour à Paris, `AAAA-MM-JJ`. Jamais `toISOString()` : à 1 h du matin en été,
    l'UTC est encore la veille, et l'encaissement changerait de mois — donc d'exercice. */
const jourParis = (d: Date = new Date()) =>
  new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);

/** Centimes Stripe → euros à 2 décimales. */
const euros = (centimes: number | null | undefined) =>
  centimes === null || centimes === undefined ? null : Math.round(centimes) / 100;

/**
 * Journal des événements traités, dans `admin_logs`.
 *
 * POURQUOI CETTE TABLE plutôt qu'une table dédiée : le contrat §1 réserve les migrations à
 * l'intervenant M ; créer `stripe_events` déborderait de mon périmètre. `admin_logs` porte
 * déjà `action`, `target_type`, `target_id` et un `details jsonb` libre, elle est lisible
 * par les administrateurs et le service la remplit sans contrainte de RLS.
 * ⚠ RECOMMANDATION portée au rapport : une table `stripe_events (event_id PRIMARY KEY)`
 * donnerait une idempotence GARANTIE par contrainte d'unicité, là où la lecture préalable
 * ci-dessous laisse subsister une fenêtre de course de quelques millisecondes. Cette
 * fenêtre est sans conséquence aujourd'hui parce que chaque traitement est lui-même
 * idempotent (`confirmer_commande`, lecture avant écriture de `payment_records`).
 */
async function journaliser(
  evenement: Stripe.Event,
  cible: { type: string; id?: string | null },
  details: Record<string, unknown>
): Promise<void> {
  try {
    await admin.from('admin_logs').insert({
      admin_id: null,                       // ce n'est pas un humain qui agit, c'est Stripe
      action: `stripe:${evenement.type}`,
      target_type: cible.type,
      target_id: cible.id ?? null,
      details: { ...details, stripe_event_id: evenement.id, livemode: evenement.livemode },
    });
  } catch (e) {
    // Ne JAMAIS faire échouer le traitement pour un journal : l'argent prime la trace.
    console.error('stripe-webhook : journalisation impossible', e);
  }
}

/** Cet événement a-t-il déjà été traité ? (rejeu Stripe, double livraison) */
async function dejaTraite(evenement: Stripe.Event): Promise<boolean> {
  try {
    const { data } = await admin
      .from('admin_logs')
      .select('id')
      .eq('details->>stripe_event_id', evenement.id)
      .limit(1)
      .maybeSingle();
    return !!data;
  } catch {
    // En cas de doute, on TRAITE : tous les traitements sont idempotents, alors qu'un
    // événement sauté ne revient jamais.
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. PAIEMENT RÉUSSI — la commande naît ici, que le navigateur soit là ou non
// ═══════════════════════════════════════════════════════════════════════════════
async function paiementReussi(evenement: Stripe.Event): Promise<void> {
  const pi = evenement.data.object as Stripe.PaymentIntent;

  const { data: devis } = await admin
    .from('order_quotes')
    .select('id, user_id, total_ttc, consumed_at')
    .eq('stripe_payment_intent_id', pi.id)
    .maybeSingle();

  if (!devis) {
    /* Paiement sans devis : lien de paiement créé à la main dans le tableau de bord
       Stripe, essai technique, ou reste d'un ancien parcours. On ne fabrique surtout pas
       une commande à partir de rien — on le consigne pour que quelqu'un regarde. */
    console.error(`stripe-webhook : paiement ${pi.id} sans devis correspondant`);
    await journaliser(evenement, { type: 'payment' }, {
      motif: 'aucun order_quotes ne porte ce payment_intent',
      payment_intent: pi.id,
      montant_eur: euros(pi.amount_received || pi.amount),
    });
    return;
  }

  /* Le montant encaissé doit être EXACTEMENT celui du devis. Un écart signifie qu'on
     regarde deux choses différentes : on n'enregistre rien et on alerte. */
  const attendu = Math.round(Number(devis.total_ttc) * 100);
  if (pi.amount_received !== attendu && pi.amount !== attendu) {
    console.error(
      `stripe-webhook : montant incohérent pour ${pi.id} — devis ${attendu}, Stripe ${pi.amount_received}`
    );
    await journaliser(evenement, { type: 'order' }, {
      motif: 'montant encaissé différent du devis — commande NON créée',
      quote_id: devis.id, attendu_centimes: attendu, recu_centimes: pi.amount_received,
    });
    return;
  }

  /* ★ LA MÊME RPC QUE LE NAVIGATEUR. Elle est idempotente : si `confirmer-commande` est
     déjà passée, elle rend `deja_creee: true` sans rien recréer. C'est ce qui autorise
     les deux chemins à coexister sans se marcher dessus. */
  const { data: resultat, error } = await admin.rpc('confirmer_commande', {
    p_quote_id: devis.id,
    p_payment_intent: pi.id,
    p_user_id: devis.user_id,
  });
  if (error) {
    // Erreur RÉCUPÉRABLE (base indisponible, verrou) : on la propage pour que Stripe
    // rejoue. C'est exactement le cas où un rejeu sert à quelque chose.
    throw new Error(`confirmer_commande a échoué pour ${pi.id} : ${error.message}`);
  }

  const orderId = (resultat as { order_id?: string } | null)?.order_id ?? null;
  const dejaCreee = (resultat as { deja_creee?: boolean } | null)?.deja_creee === true;

  if (orderId) await enregistrerPaiement(pi, orderId, devis.user_id);

  await journaliser(evenement, { type: 'order', id: orderId }, {
    quote_id: devis.id,
    payment_intent: pi.id,
    deja_creee: dejaCreee,
    montant_eur: euros(pi.amount_received || pi.amount),
    // On dit d'où vient la commande : c'est ce qui permettra de mesurer combien de
    // commandes n'auraient PAS existé sans ce webhook.
    origine: dejaCreee ? 'navigateur (webhook en second)' : 'webhook Stripe',
  });
}

/**
 * Trace du paiement dans `payment_records`, avec toutes les références Stripe.
 * Idempotente par lecture préalable : le navigateur et le webhook arrivent souvent à la
 * même seconde, et `reference` ne porte pas de contrainte d'unicité en base (la colonne
 * sert aussi aux règlements saisis à la main).
 */
async function enregistrerPaiement(
  pi: Stripe.PaymentIntent,
  orderId: string,
  userId: string | null
): Promise<void> {
  try {
    const { data: existant } = await admin
      .from('payment_records').select('id').eq('reference', pi.id).maybeSingle();
    if (existant) return;

    /* Une seule requête Stripe pour la charge ET sa transaction de solde : c'est de là
       que viennent la commission (compte 627) et le net réellement crédité (512). */
    const complet = await stripe.paymentIntents.retrieve(pi.id, {
      expand: ['latest_charge.balance_transaction'],
    });
    const charge = complet.latest_charge as Stripe.Charge | string | null;
    const chargeObj = charge && typeof charge === 'object' ? charge : null;
    const bt = chargeObj?.balance_transaction as Stripe.BalanceTransaction | string | null | undefined;
    const btObj = bt && typeof bt === 'object' ? bt : null;

    const { error } = await admin.from('payment_records').insert({
      invoice_id: null,
      order_id: orderId,
      amount: euros(complet.amount_received || complet.amount),
      payment_date: jourParis(new Date((complet.created || Math.floor(Date.now() / 1000)) * 1000)),
      payment_method: 'carte',
      status: 'succeeded',
      reference: complet.id,
      stripe_charge_id: chargeObj?.id ?? (typeof charge === 'string' ? charge : null),
      stripe_balance_transaction_id: btObj?.id ?? (typeof bt === 'string' ? bt : null),
      stripe_fee: btObj ? euros(btObj.fee) : null,
      stripe_net: btObj ? euros(btObj.net) : null,
      created_by: userId,
      notes: `Paiement Stripe de la commande ${orderId} (webhook)`,
    });
    if (error) console.error('stripe-webhook : payment_records refusé', error.message);
  } catch (e) {
    // Une trace manquante se rattrape ; refuser la commande ne se rattrape pas.
    console.error('stripe-webhook : trace de paiement impossible', e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. PAIEMENT ÉCHOUÉ — on le consigne, on ne crée rien
// ═══════════════════════════════════════════════════════════════════════════════
async function paiementEchoue(evenement: Stripe.Event): Promise<void> {
  const pi = evenement.data.object as Stripe.PaymentIntent;
  const erreur = pi.last_payment_error;

  const { data: devis } = await admin
    .from('order_quotes').select('id, user_id')
    .eq('stripe_payment_intent_id', pi.id).maybeSingle();

  /* Aucune commande n'est créée, aucun stock n'est touché : un échec de paiement est un
     non-événement commercial. Mais il doit être VISIBLE — une série d'échecs sur la même
     carte, ou un motif `card_velocity_exceeded` répété, c'est le signe d'un essai de
     fraude ou d'un formulaire cassé. C'est invisible aujourd'hui, faute de journal. */
  console.error(
    `stripe-webhook : paiement ${pi.id} refusé — ${erreur?.code ?? 'sans code'} / ${erreur?.decline_code ?? '—'}`
  );
  await journaliser(evenement, { type: 'payment', id: devis?.id ?? null }, {
    payment_intent: pi.id,
    quote_id: devis?.id ?? null,
    user_id: devis?.user_id ?? null,
    montant_eur: euros(pi.amount),
    code: erreur?.code ?? null,
    code_refus: erreur?.decline_code ?? null,
    // Le message de Stripe est rédigé pour l'acheteur : il est utile au support tel quel.
    message: erreur?.message ?? null,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. REMBOURSEMENT — y compris ceux décidés depuis le tableau de bord Stripe
// ═══════════════════════════════════════════════════════════════════════════════
async function chargeRemboursee(evenement: Stripe.Event): Promise<void> {
  const charge = evenement.data.object as Stripe.Charge;
  const total = charge.amount_refunded >= charge.amount;

  /* On retrouve la commande par la charge, puis par le PaymentIntent : les
     remboursements déclenchés à la main dans Stripe n'ont, eux, aucune trace chez nous. */
  const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
  const filtre = pi
    ? `stripe_charge_id.eq.${charge.id},reference.eq.${pi}`
    : `stripe_charge_id.eq.${charge.id}`;
  const { data: paiements } = await admin
    .from('payment_records')
    .select('id, order_id, invoice_id')
    .or(filtre)
    .order('created_at', { ascending: false })
    .limit(1);
  const paiement = paiements?.[0] ?? null;

  const orderId = paiement?.order_id ?? null;

  /* Les remboursements déjà connus (`process-refund`) prennent le statut RÉEL de Stripe :
     il restait figé sur la valeur du jour de la demande, si bien qu'un remboursement
     refusé par la banque continuait d'apparaître comme acquis.
     ⚠ On liste les remboursements par l'API plutôt que de lire `charge.refunds` : selon la
     version d'API de l'endpoint, cette sous-liste n'est pas développée dans l'événement et
     serait vide — le statut ne serait jamais mis à jour, sans la moindre erreur visible. */
  const remboursements = await stripe.refunds.list({ charge: charge.id, limit: 100 });
  for (const r of remboursements.data) {
    const { error } = await admin
      .from('refunds')
      .update({ status: r.status ?? 'succeeded', updated_at: new Date().toISOString() })
      .eq('stripe_refund_id', r.id);
    if (error) console.error('stripe-webhook : refunds non mis à jour', error.message);
  }

  if (total) {
    /* Remboursement TOTAL : la commande et sa facture changent d'état. Le statut
       `refunded` est lu partout dans les déclarations de TVA (`declaration_tva`) mais
       n'était écrit nulle part — d'où des déclarations qui ignoraient les remboursements. */
    if (orderId) {
      await admin.from('orders').update({ status: 'refunded' }).eq('id', orderId);
    }
    if (paiement?.invoice_id) {
      await admin.from('invoices').update({ status: 'refunded' }).eq('id', paiement.invoice_id);
    } else if (orderId) {
      await admin.from('invoices').update({ status: 'refunded' })
        .eq('order_id', orderId).eq('document_type', 'invoice');
    }
  }

  /* Le statut du RÈGLEMENT lui-même. `process-refund` ne filtre plus sur
     `status = 'succeeded'` justement pour que cette valeur puisse évoluer sans lui faire
     perdre la trace de la transaction d'origine (un remboursement partiel peut être suivi
     d'un second). */
  if (paiement?.id) {
    await admin.from('payment_records')
      .update({ status: total ? 'refunded' : 'partially_refunded' })
      .eq('id', paiement.id);
  }

  await journaliser(evenement, { type: 'order', id: orderId }, {
    charge_id: charge.id,
    rembourse_eur: euros(charge.amount_refunded),
    montant_eur: euros(charge.amount),
    total,
    // Un remboursement fait DEPUIS STRIPE n'a pas d'avoir : il faudra l'émettre à la main.
    avoir_a_emettre: total && !paiement,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. LITIGE (« chargeback ») — de l'argent qui repart, avec 15 € de frais
// ═══════════════════════════════════════════════════════════════════════════════
async function litigeOuvert(evenement: Stripe.Event): Promise<void> {
  const litige = evenement.data.object as Stripe.Dispute;
  const chargeId = typeof litige.charge === 'string' ? litige.charge : litige.charge?.id;

  const { data: paiement } = await admin
    .from('payment_records').select('id, order_id, invoice_id')
    .eq('stripe_charge_id', chargeId ?? '').maybeSingle();

  /* On ne touche NI au statut de la commande NI à celui de la facture : un litige n'est
     pas un remboursement, il se conteste, et la marchandise a peut-être été livrée.
     Ce qu'il faut, c'est que quelqu'un le sache AVANT la date limite de réponse — passée
     celle-ci, le litige est perdu d'office. */
  console.error(
    `stripe-webhook : LITIGE ${litige.id} ouvert sur ${chargeId} — ${euros(litige.amount)} € — ` +
    `réponse avant le ${litige.evidence_details?.due_by
      ? jourParis(new Date(litige.evidence_details.due_by * 1000))
      : 'date inconnue'}`
  );
  await journaliser(evenement, { type: 'order', id: paiement?.order_id ?? null }, {
    dispute_id: litige.id,
    charge_id: chargeId ?? null,
    montant_eur: euros(litige.amount),
    motif: litige.reason,
    statut: litige.status,
    repondre_avant: litige.evidence_details?.due_by
      ? jourParis(new Date(litige.evidence_details.due_by * 1000))
      : null,
    invoice_id: paiement?.invoice_id ?? null,
    action_attendue:
      'Répondre dans Stripe avec la preuve de livraison avant la date limite, sinon le ' +
      'litige est perdu et 15 € de frais restent dus.',
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. VIREMENT STRIPE VERSÉ — la clé de lettrage du compte 512
// ═══════════════════════════════════════════════════════════════════════════════
/*
  POURQUOI CET ÉVÉNEMENT EN PLUS DES QUATRE DEMANDÉS : `payment_records.stripe_payout_id`
  et `stripe_payout_date` (contrat §2) resteraient sinon DÉFINITIVEMENT vides. Le virement
  n'existe pas au moment du paiement — Stripe regroupe les encaissements et vire quelques
  jours plus tard. Le seul moment où l'on peut rattacher un paiement à son virement, c'est
  quand Stripe annonce ce virement. Sans ce bloc, le comptable ne peut pas solder le 512
  en un lettrage, ce qui était précisément le grief « rapprochement Stripe impossible ».
*/
async function virementVerse(evenement: Stripe.Event): Promise<void> {
  const payout = evenement.data.object as Stripe.Payout;
  const dateVirement = jourParis(new Date(payout.arrival_date * 1000));
  let rattaches = 0;

  // Les transactions d'un virement se listent par page de 100 : on parcourt tout.
  let curseur: string | undefined;
  for (let page = 0; page < 20; page++) {
    const lot: Stripe.ApiList<Stripe.BalanceTransaction> = await stripe.balanceTransactions.list({
      payout: payout.id,
      limit: 100,
      ...(curseur ? { starting_after: curseur } : {}),
    });
    const ids = lot.data.map((t) => t.id);
    if (ids.length) {
      const { data, error } = await admin
        .from('payment_records')
        .update({ stripe_payout_id: payout.id, stripe_payout_date: dateVirement })
        .in('stripe_balance_transaction_id', ids)
        .select('id');
      if (error) console.error('stripe-webhook : payout non rattaché', error.message);
      rattaches += data?.length ?? 0;
    }
    if (!lot.has_more || !lot.data.length) break;
    curseur = lot.data[lot.data.length - 1].id;
  }

  await journaliser(evenement, { type: 'payment' }, {
    payout_id: payout.id,
    date_virement: dateVirement,
    montant_eur: euros(payout.amount),
    paiements_rattaches: rattaches,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════

Deno.serve(async (req: Request) => {
  // Stripe n'émet que des POST. Un GET est le plus souvent un contrôle de disponibilité.
  if (req.method !== 'POST') {
    return new Response('stripe-webhook', { status: 405, headers: { Allow: 'POST' } });
  }

  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';
  if (!secret) {
    /* Sans secret, on ne peut RIEN authentifier. Répondre 200 ferait croire à Stripe que
       tout va bien alors que rien n'est traité : on répond 500 pour que l'endpoint
       apparaisse en échec dans le tableau de bord — c'est là qu'on le verra. */
    console.error('stripe-webhook : STRIPE_WEBHOOK_SECRET absent — événement ignoré');
    return new Response('Webhook non configuré', { status: 500 });
  }

  const signature = req.headers.get('stripe-signature');
  // ⚠ Le corps BRUT : la signature porte sur ces octets exacts.
  const corps = await req.text();

  let evenement: Stripe.Event;
  try {
    /* ⚠ `constructEventAsync`, jamais `constructEvent` : la version synchrone s'appuie sur
       le module `crypto` de Node, absent du runtime Deno — elle lève une exception à la
       première requête et TOUS les événements partiraient en erreur. */
    evenement = await stripe.webhooks.constructEventAsync(
      corps,
      signature ?? '',
      secret,
      undefined,
      fournisseurCrypto
    );
  } catch (e) {
    // 400 : Stripe ne rejoue pas une signature invalide, et c'est bien ce qu'on veut.
    console.error('stripe-webhook : signature invalide', e instanceof Error ? e.message : e);
    return new Response('Signature invalide', { status: 400 });
  }

  try {
    if (await dejaTraite(evenement)) {
      // Rejeu Stripe (notre première réponse s'est perdue) : rien à refaire.
      return new Response(JSON.stringify({ recu: true, deja_traite: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    switch (evenement.type) {
      case 'payment_intent.succeeded':
        await paiementReussi(evenement);
        break;
      case 'payment_intent.payment_failed':
        await paiementEchoue(evenement);
        break;
      case 'charge.refunded':
        await chargeRemboursee(evenement);
        break;
      case 'charge.dispute.created':
        await litigeOuvert(evenement);
        break;
      case 'payout.paid':
        await virementVerse(evenement);
        break;
      default:
        /* ★ JAMAIS DE 500 SUR UN ÉVÉNEMENT INCONNU. Stripe rejouerait pendant trois jours
           un événement qu'on ne traitera de toute façon jamais, et finirait par désactiver
           l'endpoint — emportant avec lui les événements qui, eux, comptent. */
        return new Response(JSON.stringify({ recu: true, ignore: evenement.type }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
    }

    return new Response(JSON.stringify({ recu: true, type: evenement.type }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    /* Échec d'un traitement que l'on VEUT voir rejoué (base injoignable, verrou…).
       Le 500 est ici volontaire : c'est le mécanisme de reprise de Stripe, et le seul
       filet pour une commande payée qui n'a pas pu être enregistrée. */
    console.error(`stripe-webhook : échec du traitement de ${evenement.type}`, e);
    return new Response(
      JSON.stringify({ recu: false, type: evenement.type, erreur: 'traitement en échec' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
