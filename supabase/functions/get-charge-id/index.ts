// Fichier : supabase/functions/get-charge-id/index.ts

import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@14.24.0';

/* CORS restreint à nos propres origines — voir le commentaire détaillé dans
   `admin-delete-user`. `CORS_EXTRA_ORIGINS` ajoute l'origine de développement. */
const ORIGINES = [
  'https://omegasud.fr',
  'https://www.omegasud.fr',
  'https://omegasud.netlify.app', // préproduction Netlify
  ...(Deno.env.get('CORS_EXTRA_ORIGINS') || '').split(',').map(o => o.trim()).filter(Boolean),
];
const corsPour = (req: Request) => ({
  'Access-Control-Allow-Origin': ORIGINES.includes(req.headers.get('origin') || '')
    ? (req.headers.get('origin') as string)
    : ORIGINES[0],
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
});

/* ⚠ Version d'API UNIFIÉE sur les cinq fonctions Stripe du projet (`devis-commande`,
   `confirmer-commande`, `get-charge-id`, `process-refund`, `stripe-webhook`). Deux
   versions différentes, ce sont deux formes de réponse possibles pour un même objet —
   et un champ absent d'un côté qu'on croit présent de l'autre.

   ⓘ Cette fonction est devenue un FILET, pas le chemin principal : depuis le 5 août,
   `confirmer-commande` et `stripe-webhook` écrivent eux-mêmes `stripe_charge_id` dans
   `payment_records`. Elle reste appelée par le panier et ne coûte rien à conserver. */
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') as string, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
);

Deno.serve(async req => {
  const corsHeaders = corsPour(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ⭐ AJOUT : Vérification de l'authentification de l'utilisateur
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Non autorisé' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Token invalide' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { paymentIntentId } = await req.json();
    if (!paymentIntentId || !paymentIntentId.startsWith('pi_')) {
      return new Response(
        JSON.stringify({ error: 'Un Payment Intent ID valide est requis.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    /* ★ LE PAIEMENT DOIT ÊTRE CELUI DE L'APPELANT.
       La fonction acceptait n'importe quel identifiant « pi_… » d'un client connecté et
       renvoyait la référence d'encaissement correspondante — donc celle des paiements
       des AUTRES clients. C'est cette référence qui sert de clé aux remboursements ;
       elle n'a rien à faire entre les mains d'un tiers. */
    const { data: aLui } = await supabaseAdmin
      .from('order_quotes')
      .select('id')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!aLui) {
      const { data: cmd } = await supabaseAdmin
        .from('orders')
        .select('id')
        .eq('stripe_payment_intent_id', paymentIntentId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!cmd) {
        console.error(`get-charge-id : paiement étranger demandé par ${user.id}`);
        return new Response(
          JSON.stringify({ error: 'Ce paiement ne vous concerne pas.' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(
      paymentIntentId,
      {
        expand: ['latest_charge'],
      }
    );

    const charge = paymentIntent.latest_charge as Stripe.Charge;

    if (!charge?.id) {
      return new Response(
        JSON.stringify({
          error: 'Aucun ID de charge trouvé pour ce paiement.',
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(JSON.stringify({ chargeId: charge.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Erreur dans la fonction get-charge-id:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
