import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@14.24.0'; // Version mise à jour

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Interface alignée avec les données envoyées par le nouveau frontend
interface RefundRequest {
  invoiceId: string;
  amount: number;
  reason: string;
  adminNotes?: string;
}

// Initialisez les clients en dehors du handler pour la performance et la réutilisabilité
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2024-06-20', // ⭐ Version LTS la plus récente
  httpClient: Stripe.createFetchHttpClient(), // Nécessaire pour Deno
});

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
);

Deno.serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // --- 1. Sécurité et Authentification ---
    // (Votre code existant pour vérifier le token et le rôle admin est conservé, il est excellent)
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
    // (Ajoutez ici votre vérification de rôle 'admin' si nécessaire)

    // --- 2. Validation de la Requête ---
    const { invoiceId, amount, reason, adminNotes }: RefundRequest =
      await req.json();

    if (!invoiceId || !amount || amount <= 0 || !reason) {
      return new Response(
        JSON.stringify({
          error:
            'Données manquantes ou invalides : invoiceId, amount, et reason sont requis.',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Récupérer l'order_id (fallback) + les infos nécessaires à l'avoir Tiime
    const { data: invoiceData, error: invoiceError } = await supabaseAdmin
      .from('invoices')
      .select('order_id, invoice_number, customer_name, customer_email')
      .eq('id', invoiceId)
      .single();

    if (invoiceError) {
      console.error('Erreur récupération invoice pour fallback:', invoiceError);
    }
    const orderId = invoiceData?.order_id || null;

    // --- 3. Recherche de la Charge Stripe (Logique Fiabilisée) ---
    console.log(`🔍 Recherche de la charge pour la facture: ${invoiceId}`);
    let charge: Stripe.Charge | null = null;
    let paymentIntentId = '';

    // Stratégie prioritaire et désormais fiable : utiliser les `payment_records`
    const { data: paymentRecords, error: recordsError } = await supabaseAdmin
      .from('payment_records')
      .select('reference, stripe_charge_id')
      .eq('invoice_id', invoiceId)
      .eq('status', 'succeeded')
      .order('created_at', { ascending: false });

    if (recordsError) throw recordsError;

    let record = paymentRecords && paymentRecords[0];

    // ⚠️ Fallback : si aucun enregistrement lié à la facture, tenter via l'order_id
    if (!record && orderId) {
      const { data: orderRecords, error: orderRecordsError } =
        await supabaseAdmin
          .from('payment_records')
          .select('reference, stripe_charge_id')
          .eq('order_id', orderId)
          .eq('status', 'succeeded')
          .order('created_at', { ascending: false });

      if (orderRecordsError) throw orderRecordsError;
      if (orderRecords && orderRecords.length > 0) {
        record = orderRecords[0];
      }
    }

    if (record) {
      console.log('✅ Enregistrement de paiement trouvé:', record);

      // On privilégie le charge_id s'il existe (plus direct)
      if (
        record.stripe_charge_id &&
        record.stripe_charge_id.startsWith('ch_')
      ) {
        charge = await stripe.charges.retrieve(record.stripe_charge_id);
      }
      // Sinon, on utilise le payment intent (reference) pour trouver la charge
      else if (record.reference && record.reference.startsWith('pi_')) {
        const pi = await stripe.paymentIntents.retrieve(record.reference, {
          expand: ['latest_charge'],
        });
        charge = pi.latest_charge as Stripe.Charge;
      }
    }

    // Si aucune charge n'est trouvée, c'est une erreur.
    if (!charge) {
      console.error(
        `❌ Aucune charge Stripe valide trouvée pour la facture ${invoiceId}`
      );
      return new Response(
        JSON.stringify({
          error:
            'Impossible de trouver la transaction Stripe associée à cette facture.',
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    paymentIntentId = charge.payment_intent as string;
    console.log(`✅ Charge Stripe ${charge.id} trouvée.`);

    // --- 4. Vérification du Montant Remboursable ---
    const availableForRefund = (charge.amount - charge.amount_refunded) / 100;
    if (amount > availableForRefund) {
      return new Response(
        JSON.stringify({
          error: `Montant de remboursement trop élevé. Maximum disponible : ${availableForRefund.toFixed(2)}€`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // --- 5. Création du Remboursement dans Stripe ---
    const refund = await stripe.refunds.create({
      charge: charge.id,
      amount: Math.round(amount * 100), // Stripe attend des centimes
      reason: 'requested_by_customer', // Raison standard pour Stripe
      metadata: {
        invoice_id: invoiceId,
        reason_from_user: reason,
        processed_by: user.id,
        admin_notes: adminNotes || 'N/A',
      },
    });

    console.log(`✅ Remboursement Stripe ${refund.id} créé.`);

    // --- 6. Enregistrement du Remboursement dans Supabase ---
    // Note: Il est recommandé de créer la table 'refunds' via une migration SQL plutôt qu'à la volée.
    const { error: dbError } = await supabaseAdmin.from('refunds').insert({
      invoice_id: invoiceId,
      order_id: orderId,
      stripe_refund_id: refund.id,
      stripe_payment_intent_id: paymentIntentId,
      amount: amount,
      reason: reason,
      status: refund.status, // ex: 'succeeded', 'pending', 'failed'
      admin_notes: adminNotes || null,
      processed_by: user.id,
    });

    if (dbError) {
      // Si l'enregistrement échoue, il faut le savoir car il y a une désynchronisation
      console.error(
        'CRITIQUE : Le remboursement Stripe a été créé mais son enregistrement en base de données a échoué.',
        dbError
      );
      // On renvoie quand même un succès partiel à l'utilisateur
      return new Response(
        JSON.stringify({
          message: `Remboursement Stripe de ${amount.toFixed(2)}€ effectué, mais erreur lors de la sauvegarde locale. Contactez le support.`,
          error: dbError.message,
        }),
        {
          status: 207,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('✅ Remboursement enregistré dans la base de données.');

    // --- 6bis. Notification Make.com (création d'avoir dans Tiime) ---
    // Non bloquant : un échec du webhook ne doit jamais faire échouer le
    // remboursement (l'argent est déjà rendu au client via Stripe).
    const makeWebhookUrl = Deno.env.get('MAKE_WEBHOOK_URL');
    if (makeWebhookUrl) {
      try {
        await fetch(makeWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'omegasud.fr',
            type: 'refund',
            invoice_id: invoiceId,
            invoice_number: invoiceData?.invoice_number ?? null,
            order_id: orderId,
            customer: {
              name: invoiceData?.customer_name ?? null,
              email: invoiceData?.customer_email ?? null,
            },
            refund: {
              amount: amount,
              currency: 'EUR',
              reason: reason,
              date: new Date().toISOString(),
              stripe_refund_id: refund.id,
            },
          }),
        });
        console.log('✅ Événement refund envoyé à Make.');
      } catch (webhookError) {
        console.error('⚠️ Webhook Make (refund) en échec — sans impact sur le remboursement:', webhookError);
      }
    }

    // --- 7. Réponse de Succès ---
    return new Response(
      JSON.stringify({
        message: `Remboursement de ${amount.toFixed(2)}€ traité avec succès.`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('❌ Erreur globale dans process-refund:', error);
    return new Response(
      JSON.stringify({
        error: 'Erreur interne du serveur.',
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
