/*
  Vérification d'un numéro de TVA intracommunautaire auprès de VIES.

  ## Pourquoi côté serveur
  · VIES n'autorise pas les appels depuis un navigateur (pas d'en-têtes CORS) ;
  · surtout, le résultat DÉCIDE DU TAUX FACTURÉ. S'il venait du navigateur, il suffirait
    de répondre « valide » pour obtenir 0 % de TVA. La vérification et son enregistrement
    doivent donc être hors de portée du client.

  ## La règle qui protège le vendeur
  ⚠ Si VIES ne répond pas (le service est régulièrement indisponible), on ne déclare
  SURTOUT PAS le numéro valide : on renvoie « indisponible » et la vente reste taxée à
  20 %. Facturer 0 % sur une simple présomption expose le vendeur à devoir la TVA de sa
  poche en cas de contrôle. Mieux vaut facturer la TVA et régulariser ensuite.

  On conserve la date et le nom retourné par VIES : c'est la preuve à produire.
*/
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/* Formats nationaux, pour écarter une saisie manifestement fausse sans déranger VIES.
   Volontairement permissifs : en cas de doute on laisse VIES trancher, lui seul fait foi. */
const FORMATS: Record<string, RegExp> = {
  AT: /^U\d{8}$/, BE: /^0\d{9}$/, BG: /^\d{9,10}$/, CY: /^\d{8}[A-Z]$/,
  CZ: /^\d{8,10}$/, DE: /^\d{9}$/, DK: /^\d{8}$/, EE: /^\d{9}$/,
  ES: /^[A-Z0-9]\d{7}[A-Z0-9]$/, FI: /^\d{8}$/, FR: /^[A-Z0-9]{2}\d{9}$/,
  GR: /^\d{9}$/, HR: /^\d{11}$/, HU: /^\d{8}$/, IE: /^[A-Z0-9]{8,9}$/,
  IT: /^\d{11}$/, LT: /^(\d{9}|\d{12})$/, LU: /^\d{8}$/, LV: /^\d{11}$/,
  MT: /^\d{8}$/, NL: /^\d{9}B\d{2}$/, PL: /^\d{10}$/, PT: /^\d{9}$/,
  RO: /^\d{2,10}$/, SE: /^\d{12}$/, SI: /^\d{8}$/, SK: /^\d{10}$/,
};

const reponse = (corps: unknown, statut = 200) =>
  new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { vat_number } = await req.json();

    // Normalisation : on accepte « FR 74 481 088 722 », « fr74481088722 »…
    const brut = String(vat_number || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (brut.length < 4) {
      return reponse({ valide: false, motif: 'Numéro trop court' });
    }
    const pays = brut.slice(0, 2);
    const numero = brut.slice(2);

    if (!FORMATS[pays]) {
      return reponse({
        valide: false,
        motif: `« ${pays} » n'est pas un pays de l'Union européenne. Un numéro de TVA intracommunautaire commence par le code du pays (ex. DE, BE, IT).`,
      });
    }
    if (!FORMATS[pays].test(numero)) {
      return reponse({
        valide: false,
        motif: `Ce numéro ne correspond pas au format attendu pour ${pays}.`,
      });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let valide: boolean | null = null;
    let nom = '', adresse = '', indisponible = false;

    /* ---- Cache 24 h ----
       VIES limite le débit et renvoie alors une indisponibilité. Un parcours de commande
       peut réinterroger le même numéro plusieurs fois (saisie, retour arrière, paiement) :
       sans cache, on se fait refuser au pire moment. 24 h seulement, pour qu'un numéro
       révoqué ne reste pas « valide » longtemps. */
    try {
      const { data: cache } = await admin
        .from('vies_checks').select('*').eq('vat_number', brut).maybeSingle();
      if (cache && Date.now() - new Date(cache.checked_at).getTime() < 86400000) {
        return reponse({
          valide: cache.valid, numero: brut, pays,
          nom: cache.company_name || '', adresse: cache.company_address || '',
          verifie_le: cache.checked_at, depuis_cache: true,
          motif: cache.valid ? null : "Ce numéro n'est pas reconnu par le service européen VIES.",
        });
      }
    } catch (_e) { /* pas de cache : on interroge VIES */ }

    // ---- Interrogation de VIES ----
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 8000);   // VIES est lent : on borne l'attente
      const r = await fetch(
        `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${pays}/vat/${numero}`,
        { signal: ctl.signal, headers: { Accept: 'application/json' } }
      );
      clearTimeout(t);
      if (r.ok) {
        const j = await r.json();
        /* ⚠ NE PAS SE FIER AU SEUL `isValid` — défaut constaté le 3 août : lors d'une
           indisponibilité de l'État membre, VIES renvoie `isValid:false`, ce qui faisait
           passer un numéro parfaitement valide pour invalide (vérifié : le même numéro a
           répondu false puis true à 3 s d'intervalle).
           Seuls VALID et INVALID sont des réponses DÉFINITIVES ; tout le reste
           (MS_UNAVAILABLE, TIMEOUT, SERVICE_UNAVAILABLE, MS_MAX_CONCURRENT_REQ…) est une
           panne, pas un verdict. */
        const verdict = String(j?.userError || '').toUpperCase();
        if (verdict === 'VALID' || verdict === 'INVALID') {
          valide = verdict === 'VALID';
          nom = (j?.name || '').replace(/^-+$/, '').trim();
          adresse = (j?.address || '').replace(/^-+$/, '').trim();
        } else if (!verdict && typeof j?.isValid === 'boolean') {
          valide = j.isValid;                       // ancienne forme de réponse
          nom = (j?.name || '').replace(/^-+$/, '').trim();
          adresse = (j?.address || '').replace(/^-+$/, '').trim();
        } else {
          indisponible = true;
        }
      } else {
        indisponible = true;
      }
    } catch (_e) {
      indisponible = true;
    }

    // Seules les réponses définitives sont mises en cache — jamais une panne.
    if (!indisponible && valide !== null) {
      try {
        await admin.from('vies_checks').upsert({
          vat_number: brut, valid: valide,
          company_name: nom || null, company_address: adresse || null,
          checked_at: new Date().toISOString(),
        });
      } catch (_e) { /* le cache n'est qu'un confort */ }
    }

    if (indisponible) {
      // ⚠ On ne suppose RIEN. La vente restera taxée : c'est la position prudente.
      return reponse({
        valide: null,
        indisponible: true,
        motif:
          "Le service européen de vérification (VIES) est momentanément indisponible. " +
          "Votre commande sera facturée avec la TVA ; contactez-nous pour la régulariser.",
      });
    }

    // ---- Conservation de la preuve sur le profil de l'appelant ----
    const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || '';
    if (jwt) {
      try {
        const { data: u } = await admin.auth.getUser(jwt);
        if (u?.user?.id) {
          await admin.from('profiles').update({
            vat_number: brut,
            vat_number_valid: valide,
            vat_checked_at: new Date().toISOString(),
            vat_checked_name: nom || null,
          }).eq('id', u.user.id);
        }
      } catch (_e) { /* l'enregistrement échoue : la réponse reste valable */ }
    }

    return reponse({
      valide,
      numero: brut,
      pays,
      nom,
      adresse,
      verifie_le: new Date().toISOString(),
      motif: valide
        ? null
        : "Ce numéro n'est pas reconnu par le service européen VIES. Vérifiez-le, ou commandez en tant que particulier.",
    });
  } catch (e) {
    return reponse({ valide: null, indisponible: true, motif: 'Vérification impossible' }, 200);
  }
});
