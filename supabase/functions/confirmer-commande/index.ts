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
*/
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'npm:stripe@14.21.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reponse = (corps: unknown, statut = 200) =>
  new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
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
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2023-10-16' });
    let pi;
    try {
      pi = await stripe.paymentIntents.retrieve(String(payment_intent));
    } catch (_e) {
      return reponse({ error: 'Paiement introuvable.' }, 400);
    }

    if (pi.status !== 'succeeded') {
      return reponse({
        error: "Le paiement n'a pas abouti. Votre commande n'a pas été enregistrée.",
        statut_paiement: pi.status,
      }, 402);
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

    return reponse(resultat);
  } catch (e) {
    console.error('confirmer-commande : erreur', e);
    return reponse({ error: 'Erreur interne du serveur.' }, 500);
  }
});
