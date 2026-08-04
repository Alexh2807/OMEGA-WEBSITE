/*
  CONFIRMATION DE COMMANDE — le paiement est vérifié AUPRÈS DE STRIPE.

  ## La faille que ceci ferme
  La commande était créée par une fonction SQL appelable directement par le navigateur.
  Elle vérifiait que le devis appartenait bien à l'appelant… et rien d'autre. Elle ne
  demandait JAMAIS à Stripe si le paiement avait eu lieu, et ne vérifiait même pas que
  l'identifiant de paiement correspondait au devis.

  Concrètement : mettre un article au panier, obtenir un devis, ne PAS payer, puis
  appeler la fonction à la main donnait une commande « confirmée » à 1 907,99 €, stock
  décrémenté, facture à suivre — pour zéro euro. Un identifiant de paiement inventé
  fonctionnait tout aussi bien.

  ## Le principe
  La confirmation passe désormais par ici, et la commande n'est créée que si TOUT
  concorde :
    · le devis appartient à l'appelant ;
    · l'identifiant de paiement est bien CELUI DU DEVIS (pas un autre) ;
    · Stripe déclare ce paiement `succeeded` ;
    · le montant encaissé est EXACTEMENT celui du devis ;
    · le paiement porte bien la référence du devis dans ses métadonnées.
  La clé secrète Stripe ne quitte jamais le serveur, et la fonction SQL n'est plus
  appelable que par le service — le navigateur ne peut plus créer de commande.

  ## ★ Cette fonction n'est plus le SEUL chemin (5 août)
  `stripe-webhook` appelle la MÊME RPC `confirmer_commande`, à partir de l'événement
  `payment_intent.succeeded` envoyé par Stripe. Le webhook est le chemin de VÉRITÉ : il
  arrive même si le client ferme son onglet. Cet appel-ci n'est plus qu'un raccourci de
  latence, pour que le client voie sa commande immédiatement. Les deux convergent parce
  que la RPC est idempotente : le second passage rend `deja_creee: true`.

  ## ★ La trace du paiement est écrite ICI, côté serveur (5 août)
  Elle l'était par le navigateur, qui n'en a pas le droit : depuis la migration
  20260805020000, `payment_records` n'accepte d'insertion que du rôle serveur. L'insertion
  du navigateur échouait donc en silence, `stripe_charge_id` restait vide — et sans lui,
  `process-refund` ne retrouve pas la transaction : AUCUN remboursement n'était possible.
*/
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
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

/** Date du jour à Paris, au format `AAAA-MM-JJ`. Jamais `toISOString()` : à 1 h du matin
    en été, l'UTC est encore la veille — et la date d'encaissement changerait de mois. */
const jourParis = (d: Date = new Date()) =>
  new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);

Deno.serve(async (req: Request) => {
  const cors = enTetesCors(req);
  const reponse = (corps: unknown, statut = 200) =>
    new Response(JSON.stringify(corps), {
      status: statut,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || '';
    const { data: u } = await admin.auth.getUser(jwt);
    const user = u?.user;
    if (!user) return reponse({ error: 'Connectez-vous pour finaliser la commande.' }, 401);

    const { quote_id, payment_intent } = await req.json();
    if (!quote_id || !payment_intent) {
      return reponse({ error: 'Requête incomplète.' }, 400);
    }

    const { data: devis } = await admin
      .from('order_quotes').select('*').eq('id', quote_id).maybeSingle();
    if (!devis) return reponse({ error: 'Devis introuvable.' }, 404);
    if (devis.user_id !== user.id) {
      return reponse({ error: 'Ce devis ne vous appartient pas.' }, 403);
    }

    /* ★ L'identifiant de paiement doit être CELUI QUE NOUS AVONS CRÉÉ pour ce devis.
       Sans ce contrôle, on pourrait présenter le paiement d'une autre commande — ou un
       identifiant inventé. */
    if (devis.stripe_payment_intent_id !== payment_intent) {
      return reponse({ error: 'Ce paiement ne correspond pas à ce devis.' }, 400);
    }

    // ★ LE POINT CENTRAL : Stripe fait foi, pas le navigateur.
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2024-06-20',
      httpClient: Stripe.createFetchHttpClient(),
    });
    let pi: Stripe.PaymentIntent;
    try {
      /* `expand` dès la première requête : le remboursement futur a besoin du
         `charge_id`, et la comptabilité de la commission et du net (une seule requête
         Stripe au lieu de trois). */
      pi = await stripe.paymentIntents.retrieve(String(payment_intent), {
        expand: ['latest_charge.balance_transaction'],
      });
    } catch (_e) {
      return reponse({ error: 'Paiement introuvable.' }, 400);
    }

    /* ★ LES STATUTS INTERMÉDIAIRES SONT DITS, PLUS AVALÉS.
       `processing` (prélèvement SEPA, virement, certains portefeuilles) et
       `requires_action` (3-D Secure repris dans l'application bancaire) ne sont NI un
       succès NI un échec. La version précédente répondait « le paiement n'a pas abouti »
       — message faux, qui poussait le client à repayer alors que l'argent était en route.
       Le webhook enregistrera la commande dès que Stripe confirmera : on le dit. */
    if (pi.status !== 'succeeded') {
      const enAttente = pi.status === 'processing' || pi.status === 'requires_action';
      const message = enAttente
        ? pi.status === 'processing'
          ? "Votre paiement est en cours de validation par votre banque. Votre commande sera enregistrée automatiquement dès sa confirmation — vous recevrez un e-mail. N'effectuez pas de second paiement."
          : "Votre banque demande une confirmation supplémentaire (3-D Secure). Terminez la validation ; votre commande sera enregistrée automatiquement ensuite."
        : "Le paiement n'a pas abouti. Votre commande n'a pas été enregistrée.";
      return reponse({ error: message, en_attente: enAttente, statut_paiement: pi.status }, 402);
    }

    // Montant encaissé ≠ montant du devis : on n'enregistre rien et on alerte les journaux.
    const attendu = Math.round(Number(devis.total_ttc) * 100);
    if (pi.amount_received !== attendu && pi.amount !== attendu) {
      console.error(
        `confirmer-commande : montant incohérent — devis ${attendu}, Stripe ${pi.amount_received}`
      );
      return reponse({ error: 'Montant du paiement incohérent avec la commande.' }, 409);
    }

    // Le paiement doit porter la référence de CE devis (posée à sa création).
    if (pi.metadata?.quote_id && pi.metadata.quote_id !== String(devis.id)) {
      return reponse({ error: 'Ce paiement se rapporte à une autre commande.' }, 409);
    }

    /* Création effective. La fonction SQL n'est plus appelable que par le service :
       le navigateur ne peut plus court-circuiter les contrôles ci-dessus. */
    const { data: resultat, error } = await admin.rpc('confirmer_commande', {
      p_quote_id: quote_id,
      p_payment_intent: payment_intent,
      p_user_id: user.id,
    });
    if (error) {
      console.error('confirmer-commande : création impossible', error.message);
      return reponse({ error: 'Enregistrement de la commande impossible.' }, 500);
    }

    const orderId = (resultat as { order_id?: string } | null)?.order_id ?? null;

    /* ---------------------------------------------------------------------------
       TRACE DU PAIEMENT — écrite par le SERVEUR, avec les références Stripe complètes.
       · `stripe_charge_id`               : la clé de tout remboursement ;
       · `stripe_balance_transaction_id`  : la clé du rapprochement bancaire ;
       · `stripe_fee` / `stripe_net`      : la commission (compte 627) et le net (512).
       Le `payout` n'existe pas encore à cet instant (les fonds ne sont pas versés le jour
       même) : il est complété par l'événement `payout.paid` du webhook.
       ⚠ Rien de tout ceci ne doit faire échouer la commande : le client a payé, sa
       commande existe, une trace manquante se rattrape. --------------------------- */
    if (orderId) {
      try {
        await enregistrerPaiement(admin, stripe, pi, orderId, user.id);
      } catch (e) {
        console.error('confirmer-commande : trace de paiement non enregistrée', e);
      }
    }

    return reponse(resultat);
  } catch (e) {
    console.error('confirmer-commande : erreur', e);
    return reponse({ error: 'Erreur interne du serveur.' }, 500);
  }
});

/**
 * Écrit (une seule fois) la ligne `payment_records` du paiement.
 *
 * Idempotence par lecture préalable sur la référence du PaymentIntent : le webhook et
 * cet appel du navigateur arrivent tous les deux, souvent à la même seconde. `reference`
 * ne porte pas de contrainte d'unicité en base (elle servait aussi à des paiements
 * manuels), on ne peut donc pas s'appuyer sur un `upsert`.
 */
async function enregistrerPaiement(
  admin: ReturnType<typeof createClient>,
  stripe: Stripe,
  pi: Stripe.PaymentIntent,
  orderId: string,
  userId: string | null
): Promise<void> {
  const { data: existant } = await admin
    .from('payment_records')
    .select('id')
    .eq('reference', pi.id)
    .maybeSingle();
  if (existant) return;

  const charge = (pi.latest_charge ?? null) as Stripe.Charge | string | null;
  const chargeObj = charge && typeof charge === 'object' ? charge : null;
  const bt = chargeObj?.balance_transaction as Stripe.BalanceTransaction | string | null | undefined;
  const btObj = bt && typeof bt === 'object' ? bt : null;

  const brut = Math.round((pi.amount_received || pi.amount || 0)) / 100;
  // `fee` et `net` sont en centimes chez Stripe ; la base attend des euros à 2 décimales.
  const commission = btObj ? Math.round(btObj.fee) / 100 : null;
  const net = btObj ? Math.round(btObj.net) / 100 : null;

  const { error } = await admin.from('payment_records').insert({
    invoice_id: null,           // la facture n'existe pas encore : elle sera rattachée après
    order_id: orderId,
    amount: brut,
    payment_date: jourParis(new Date((pi.created || Math.floor(Date.now() / 1000)) * 1000)),
    payment_method: 'carte',
    status: 'succeeded',
    reference: pi.id,
    stripe_charge_id: chargeObj?.id ?? (typeof charge === 'string' ? charge : null),
    stripe_balance_transaction_id: btObj?.id ?? (typeof bt === 'string' ? bt : null),
    stripe_fee: commission,
    stripe_net: net,
    created_by: userId,
    notes: `Paiement Stripe de la commande ${orderId}`,
  });
  if (error) console.error('confirmer-commande : payment_records refusé', error.message);
}
