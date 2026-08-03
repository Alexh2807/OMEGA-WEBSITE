/**
 * Edge Function : envoi d'une facture vers Make.com (webhook), qui la crée
 * automatiquement dans Tiime (scénario Make : Webhook → Tiime).
 *
 * SÉCURITÉ :
 *  - L'URL du webhook Make est un secret Supabase (MAKE_WEBHOOK_URL) — jamais
 *    exposée dans le navigateur (sinon n'importe qui pourrait créer des
 *    factures dans Tiime).
 *  - Seul un admin (profiles.role = 'admin') peut invoquer la fonction.
 *
 * CONFIGURATION :
 *   npx supabase secrets set MAKE_WEBHOOK_URL=https://hook.eu2.make.com/...
 *
 * Tant que le secret n'est pas configuré, la fonction répond proprement
 * { configured: false } sans erreur.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
    // --- 1. Authentification + rôle admin ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Non autorisé' }, 401);

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return json({ error: 'Token invalide' }, 401);

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (profile?.role !== 'admin') {
      return json({ error: 'Accès réservé aux administrateurs' }, 403);
    }

    // --- 2. Chargement de la facture + lignes ---
    const { invoiceId, force, apercu } = await req.json();
    if (!invoiceId) return json({ error: 'invoiceId requis' }, 400);

    const { data: invoice, error: loadError } = await supabaseAdmin
      .from('invoices')
      .select('*, invoice_items(*)')
      .eq('id', invoiceId)
      .single();
    if (loadError || !invoice) {
      return json({ error: 'Facture introuvable' }, 404);
    }

    /* ⚠ UNE FACTURE NE PART QU'UNE FOIS.
       Sans ce garde-fou, un second clic — ou un envoi automatique doublé d'un envoi
       manuel — crée une DEUXIÈME facture dans Tiime : chiffre d'affaires compté deux
       fois, TVA déclarée deux fois. Un renvoi reste possible, mais il doit être voulu. */
    if (invoice.tiime_sent_at && !force && !apercu) {
      return json({
        sent: false,
        deja_envoye: true,
        envoye_le: invoice.tiime_sent_at,
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

    // --- 4. Payload lisible côté Make (mapping facile vers le module Tiime) ---
    // Dates au format AAAA-MM-JJ attendu par Tiime (pas d'heure).
    const toYmd = (d: string | null | undefined): string =>
      (d ? new Date(d) : new Date()).toISOString().slice(0, 10);

    /* ---- Code de catégorie de TVA (norme UNTDID 5305, reprise par Factur-X / EN 16931).
       Avant, TOUTE ligne à 0 % partait en « E » (exonéré). C'est faux : le comptable et
       la plateforme de facturation électronique distinguent
         S  taux normal
         K  livraison intracommunautaire exonérée (autoliquidation par le preneur)
         G  exportation hors Union européenne, TVA non applicable
         E  exonéré (autres cas, dont l'outre-mer hors champ territorial)
       Le code se déduit du RÉGIME, jamais du seul taux : deux régimes différents
       peuvent donner 0 %, et ils ne se déclarent pas au même endroit. */
    const outreMer = /294/.test(invoice.vat_mention || '');
    const codeTva =
      invoice.vat_regime === 'ue_b2b' ? 'K'
      : invoice.vat_regime === 'export' ? (outreMer ? 'E' : 'G')
      : 'S';

    const payload = {
      source: 'omegasud.fr',
      type: 'invoice',
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      order_id: invoice.order_id ?? null,
      status: invoice.status,
      date: toYmd(invoice.created_at),
      due_date: toYmd(invoice.due_date ?? invoice.created_at),
      customer: {
        name: invoice.customer_name,
        email: invoice.customer_email,
        phone: invoice.customer_phone ?? null,
        billing_address: invoice.billing_address ?? null,
        /* ★ Sans ces trois champs, la facture intracommunautaire est INCOMPLÈTE : le
           numéro de TVA du preneur est obligatoire sur la facture ET dans l'état
           récapitulatif (DES). Ils étaient purement et simplement absents. */
        country: invoice.customer_country ?? null,
        is_company: invoice.is_company ?? false,
        company_name: invoice.company_name ?? null,
        vat_number: invoice.vat_number ?? null,
      },
      /* ★ L'identité fiscale de la vente. Elle ne partait pas du tout : le comptable
         recevait des montants et un taux, sans savoir s'il avait sous les yeux une vente
         française, une autoliquidation intracommunautaire, une exportation ou une
         livraison outre-mer — quatre lignes différentes de la déclaration de TVA. */
      fiscal: {
        regime: invoice.vat_regime ?? null,
        regime_libelle:
          invoice.vat_regime === 'fr' ? 'Vente en France (TVA collectée)'
          : invoice.vat_regime === 'ue_b2b' ? 'Livraison intracommunautaire — autoliquidation'
          : invoice.vat_regime === 'ue_b2c' ? 'Vente à un particulier de l’Union européenne'
          : invoice.vat_regime === 'export'
            ? (outreMer ? 'Livraison vers un département/collectivité d’outre-mer'
                        : 'Exportation hors Union européenne')
          : 'Régime non déterminé',
        taux_tva: invoice.vat_rate ?? null,
        code_categorie_tva: codeTva,
        mention_legale: invoice.vat_mention ?? null,
        outre_mer: invoice.vat_regime === 'export' ? outreMer : false,
      },
      mentions_societe: invoice.legal_mentions ?? null,
      totals: {
        currency: 'EUR',
        total_ht: invoice.subtotal_ht,
        total_tva: invoice.tax_amount,
        total_ttc: invoice.total_ttc,
      },
      items: (invoice.invoice_items ?? []).map((it: any) => ({
        description: it.description,
        quantity: it.quantity,
        unit_price_ht: it.unit_price_ht,
        tax_rate: it.tax_rate,
        total_ht: it.total_ht,
        total_ttc: it.total_ttc,
      })),
      notes: invoice.notes ?? null,
      // Lignes déjà au format attendu par le module Make "Tiime — Créer une
      // facture" (invoice_line[]) : mappées telles quelles dans le scénario.
      tiime_lines: (invoice.invoice_items ?? []).map((it: any) => ({
        invoice_quantity: it.quantity,
        invoice_quantity_unit_of_measure_code: 'unit',
        line_vat_information: {
          invoiced_item_vat_rate: (it.tax_rate ?? invoice.vat_rate ?? 20) / 100,
          // Déduit du régime (voir plus haut), et non du seul taux.
          invoiced_item_vat_category_code: codeTva,
          ...(codeTva !== 'S' && invoice.vat_mention
            ? { invoiced_item_vat_exemption_reason_text: invoice.vat_mention }
            : {}),
        },
        price_details: { item_net_price: it.unit_price_ht },
        item_information: {
          item_name: it.description,
          item_attributes: [
            { item_attribute_name: 'type', item_attribute_value: 'sale' },
          ],
        },
      })),
    };

    /* --- 5. APERÇU : on montre ce qui partirait, sans rien envoyer.
       Sert au back-office (« voir ce qui part en comptabilité ») et aux bancs de test :
       vérifier le contenu ne doit jamais créer d'écriture dans Tiime. */
    if (apercu) {
      return json({ sent: false, apercu: true, payload });
    }

    // --- 6. Envoi au webhook Make ---
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return json(
        {
          sent: false,
          configured: true,
          error: `Webhook Make : échec (${res.status}) ${detail}`.trim(),
        },
        502
      );
      // (En cas d'échec la facture reste « non transmise » : elle réapparaîtra dans le
      //  filtre « Reste à envoyer » du back-office, jamais perdue en silence.)
    }

    // Trace de l'envoi : c'est elle qui interdit le doublon au prochain clic.
    const envoyeLe = new Date().toISOString();
    await supabaseAdmin
      .from('invoices')
      .update({ tiime_sent_at: envoyeLe })
      .eq('id', invoice.id);

    return json({ sent: true, configured: true, envoye_le: envoyeLe, renvoi: !!force });
  } catch (error) {
    console.error('❌ Erreur globale dans send-to-make:', error);
    return json(
      {
        error: 'Erreur interne du serveur.',
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});
