/**
 * Edge Function : transmission d'une facture Factur-X à la Plateforme Agréée (PA).
 *
 * SÉCURITÉ :
 *  - Les identifiants de la PA (PA_CLIENT_ID / PA_CLIENT_SECRET) sont des secrets
 *    Supabase — ils ne quittent JAMAIS le serveur.
 *  - Seul un admin (profiles.role = 'admin') peut invoquer la fonction.
 *  - GARDE-FOU ABSOLU : une facture en mode 'test' n'est JAMAIS transmise,
 *    quelle que soit la configuration. Défense en profondeur avec le front.
 *
 * CONFIGURATION (supabase secrets set …) :
 *  - PA_NAME         nom de la plateforme (ex. "b2brouter")
 *  - PA_TOKEN_URL    endpoint OAuth2 client_credentials
 *  - PA_DEPOSIT_URL  endpoint de dépôt de facture
 *  - PA_CLIENT_ID    identifiant API
 *  - PA_CLIENT_SECRET secret API
 *  - PA_SCOPE        (optionnel) scope OAuth2
 *
 * Tant que ces secrets ne sont pas configurés, la fonction répond proprement
 * { configured: false } et la facture reste en statut "to_transmit".
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

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

/* ⚠ Fabrique, et non constante : les en-têtes dépendent désormais de l'origine de LA
   requête. Une constante de module partagée entre deux requêtes concurrentes renverrait
   à l'une l'origine autorisée pour l'autre. Les appels à `json(...)` restent inchangés. */
const faireJson = (corsHeaders: Record<string, string>) =>
  (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
);

interface PaConfig {
  name: string;
  tokenUrl: string;
  depositUrl: string;
  clientId: string;
  clientSecret: string;
  scope?: string;
}

/** Lit la config PA depuis les secrets. null si incomplète. */
const readPaConfig = (): PaConfig | null => {
  const name = Deno.env.get('PA_NAME');
  const tokenUrl = Deno.env.get('PA_TOKEN_URL');
  const depositUrl = Deno.env.get('PA_DEPOSIT_URL');
  const clientId = Deno.env.get('PA_CLIENT_ID');
  const clientSecret = Deno.env.get('PA_CLIENT_SECRET');
  if (!name || !tokenUrl || !depositUrl || !clientId || !clientSecret) {
    return null;
  }
  return {
    name,
    tokenUrl,
    depositUrl,
    clientId,
    clientSecret,
    scope: Deno.env.get('PA_SCOPE') || undefined,
  };
};

const getAccessToken = async (cfg: PaConfig): Promise<string> => {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });
  if (cfg.scope) body.set('scope', cfg.scope);

  const res = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`PA: échec de l'authentification (${res.status})`);
  }
  const data = await res.json();
  if (!data?.access_token) {
    throw new Error("PA: jeton d'accès manquant dans la réponse");
  }
  return data.access_token as string;
};

const depositInvoice = async (
  cfg: PaConfig,
  pdfBytes: Uint8Array,
  invoiceNumber: string
): Promise<{ reference?: string }> => {
  const token = await getAccessToken(cfg);

  // --- ADAPTER (selon la PA choisie) ---
  // Les noms de champs du dépôt varient d'une PA à l'autre : c'est le SEUL
  // point à ajuster avec la doc API de la PA retenue.
  const form = new FormData();
  form.append(
    'file',
    new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' }),
    `facturx-${invoiceNumber}.pdf`
  );
  form.append('invoiceNumber', invoiceNumber);
  // --- fin ADAPTER ---

  const res = await fetch(cfg.depositUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`PA: échec du dépôt (${res.status}) ${detail}`.trim());
  }
  const data = await res.json().catch(() => ({}));
  const reference = data?.id ?? data?.reference ?? data?.depositId;
  return { reference };
};

const base64ToBytes = (b64: string): Uint8Array => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

Deno.serve(async req => {
  const corsHeaders = corsPour(req);
  const json = faireJson(corsHeaders);
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

    // --- 2. Chargement de la facture électronique ---
    const { einvoiceId } = await req.json();
    if (!einvoiceId) return json({ error: 'einvoiceId requis' }, 400);

    const { data: einv, error: loadError } = await supabaseAdmin
      .from('einvoices')
      .select('id, invoice_number, mode, status, pdf_base64')
      .eq('id', einvoiceId)
      .single();
    if (loadError || !einv) {
      return json({ error: 'Facture électronique introuvable' }, 404);
    }

    // --- 3. GARDE-FOU : jamais de transmission en mode test ---
    if (einv.mode !== 'live') {
      return json(
        {
          transmitted: false,
          error:
            'Transmission refusée : cette facture est en mode TEST. ' +
            'Seules les factures live peuvent être transmises à la PA.',
        },
        409
      );
    }
    if (einv.status === 'transmitted') {
      return json(
        { transmitted: true, message: 'Facture déjà transmise.' },
        200
      );
    }
    if (!einv.pdf_base64) {
      return json({ error: 'PDF Factur-X manquant sur cette facture' }, 422);
    }

    // --- 4. Config PA : si absente, on répond proprement (pas d'erreur) ---
    const cfg = readPaConfig();
    if (!cfg) {
      return json({
        transmitted: false,
        configured: false,
        message:
          "Aucune Plateforme Agréée n'est configurée. La facture reste " +
          '"à transmettre". Configurez PA_NAME / PA_TOKEN_URL / PA_DEPOSIT_URL / ' +
          'PA_CLIENT_ID / PA_CLIENT_SECRET via `supabase secrets set`.',
      });
    }

    // --- 5. Transmission ---
    try {
      const pdfBytes = base64ToBytes(einv.pdf_base64);
      const { reference } = await depositInvoice(
        cfg,
        pdfBytes,
        einv.invoice_number
      );

      await supabaseAdmin
        .from('einvoices')
        .update({
          status: 'transmitted',
          pa_provider: cfg.name,
          pa_reference: reference ?? null,
          transmitted_at: new Date().toISOString(),
          error_message: null,
        })
        .eq('id', einv.id);

      return json({
        transmitted: true,
        configured: true,
        provider: cfg.name,
        reference: reference ?? null,
      });
    } catch (paError) {
      const message =
        paError instanceof Error ? paError.message : String(paError);
      await supabaseAdmin
        .from('einvoices')
        .update({ status: 'error', error_message: message })
        .eq('id', einv.id);
      return json({ transmitted: false, configured: true, error: message }, 502);
    }
  } catch (error) {
    console.error('❌ Erreur globale dans transmit-einvoice:', error);
    return json(
      {
        error: 'Erreur interne du serveur.',
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});
