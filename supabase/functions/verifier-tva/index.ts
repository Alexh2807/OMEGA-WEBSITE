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

  ## ★ Deux fuites colmatées le 5 août
  1. **Un appelant anonyme obtenait la réponse de VIES.** La fonction n'exigeait aucun
     utilisateur : présenter la clé anon — publique, présente dans le bundle du site —
     suffisait pour interroger le fichier européen à volonté. On exige désormais un compte
     connecté DÈS L'ENTRÉE (401 sinon) : sans cela il n'y a ni profil à mettre à jour, ni
     raison sociale à comparer, donc aucun contrôle possible.
  2. **Le masquage ne s'activait jamais.** L'enregistrement du verdict sortait en
     `undefined` quand l'appelant n'était pas un vrai utilisateur, et le masquage testait
     `concord === false` : `undefined` ne déclenchait rien, et le NOM et l'ADRESSE que VIES
     associe au numéro partaient en clair. Autrement dit, quiconque essayait un numéro
     trouvé sur une facture apprenait à qui il appartenait — et pouvait ensuite recopier
     exactement la raison sociale attendue. On masque désormais dès que la concordance
     n'est pas explicitement `true`.
*/
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/* CORS restreint : cette fonction n'a aucune raison d'être appelable depuis une page
   tierce. `CORS_EXTRA_ORIGINS` permet d'ajouter l'origine de développement sans toucher
   au code. */
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

    /* ★ UTILISATEUR OBLIGATOIRE, ET EN TÊTE DE HANDLER.
       Le verdict de VIES n'a de sens que rapporté à QUELQU'UN : c'est son profil qu'on
       met à jour et sa raison sociale qu'on compare. Sans compte, il ne reste qu'un
       service d'annuaire européen gratuit adossé à notre quota — et une fuite du nom
       associé à n'importe quel numéro présenté. */
    const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || '';
    const { data: u, error: eUser } = await admin.auth.getUser(jwt);
    const utilisateur = u?.user;
    if (eUser || !utilisateur?.id) {
      return reponse(
        { valide: null, motif: 'Connectez-vous pour vérifier un numéro de TVA.' },
        401
      );
    }

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

    let valide: boolean | null = null;
    let nom = '', adresse = '', indisponible = false;

    /* ---- Cache 24 h ----
       VIES limite le débit et renvoie alors une indisponibilité. Un parcours de commande
       peut réinterroger le même numéro plusieurs fois (saisie, retour arrière, paiement) :
       sans cache, on se fait refuser au pire moment. 24 h seulement, pour qu'un numéro
       révoqué ne reste pas « valide » longtemps. */
    /* ★ Le verdict doit être inscrit sur le profil de l'appelant SUR LES DEUX CHEMINS.
       Défaut trouvé le 3 août : la réponse venue du cache retournait avant le bloc
       d'enregistrement. Résultat : le premier client à vérifier un numéro était
       enregistré, tous les suivants voyaient « numéro valide » à l'écran mais restaient
       « non vérifiés » en base — donc facturés 20 % sans comprendre pourquoi.
       Le cache ne doit accélérer que l'interrogation de VIES, jamais sauter l'écriture. */
    const inscrireVerdict = async (
      verdictValide: boolean | null,
      nomSociete: string,
      dateVerif: string
    ): Promise<boolean | null> => {
      /* ★ CONCORDANCE DU NOM. Un numéro intracommunautaire est PUBLIC : n'importe qui
         peut reprendre celui d'une autre société et VIES le confirmera. Le seul
         rattachement possible entre le numéro et l'acheteur, c'est le nom que VIES y
         associe. On le compare à la raison sociale déclarée.
         ⚠ Certains États membres (l'Allemagne au premier chef) ne divulguent aucun nom :
         la comparaison rend NULL, et le contrôle repose alors sur les autres verrous. */
      const { data: profilActuel } = await admin
        .from('profiles').select('company_name').eq('id', utilisateur.id).maybeSingle();
      const { data: concordance } = await admin.rpc('noms_concordent', {
        p_declare: profilActuel?.company_name ?? null,
        p_vies: nomSociete || null,
      });

      /* ★ On n'écrit le nom du titulaire sur le profil QUE s'il concorde formellement.
         `profiles` est lisible par son propriétaire : y déposer le nom d'une société
         tierce, c'est le livrer à celui-là même qui essayait d'usurper le numéro. La
         preuve complète reste dans `vies_checks`, réservée aux administrateurs. */
      const { error } = await admin.from('profiles').update({
        vat_number: brut,
        vat_number_valid: verdictValide,
        vat_checked_at: dateVerif,
        vat_checked_name: concordance === true ? (nomSociete || null) : null,
        vat_name_match: concordance ?? null,
      }).eq('id', utilisateur.id);
      // ⚠ Ne PAS avaler l'erreur en silence : c'est ce qui a caché ce défaut.
      if (error) console.error('verifier-tva : profil non mis à jour', error.message);
      return concordance ?? null;
    };

    /* ★ RÈGLE DE SORTIE UNIQUE, appliquée aux DEUX chemins (cache et VIES direct).
       On ne divulgue le titulaire que si la concordance est explicitement `true`.
       `null` (l'État membre ne publie pas de nom) et `false` (ce n'est pas la société
       déclarée) masquent tous les deux : dans les deux cas, rien ne prouve que l'appelant
       a le droit de savoir à qui appartient ce numéro. */
    const divulgable = (concord: boolean | null) => concord === true;

    const motifSortie = (v: boolean | null, concord: boolean | null) =>
      v
        ? (concord === false
            ? "Ce numéro de TVA n'est pas enregistré au nom que vous avez indiqué. La TVA sera facturée."
            : null)
        : "Ce numéro n'est pas reconnu par le service européen VIES. Vérifiez-le, ou commandez en tant que particulier.";

    try {
      const { data: cache } = await admin
        .from('vies_checks').select('*').eq('vat_number', brut).maybeSingle();
      if (cache && Date.now() - new Date(cache.checked_at).getTime() < 86400000) {
        const concord = await inscrireVerdict(cache.valid, cache.company_name || '', cache.checked_at);
        return reponse({
          valide: cache.valid, numero: brut, pays,
          // ⚠ Nom et adresse du titulaire NE SORTENT PAS sans concordance formelle.
          nom: divulgable(concord) ? (cache.company_name || '') : '',
          adresse: divulgable(concord) ? (cache.company_address || '') : '',
          verifie_le: cache.checked_at, depuis_cache: true,
          nom_concordant: concord,
          motif: motifSortie(cache.valid, concord),
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
    const verifieLe = new Date().toISOString();
    const concord = await inscrireVerdict(valide, nom, verifieLe);

    return reponse({
      valide,
      numero: brut,
      pays,
      // ⚠ Même règle que sur le chemin du cache : rien qui désigne le titulaire.
      nom: divulgable(concord) ? nom : '',
      adresse: divulgable(concord) ? adresse : '',
      verifie_le: verifieLe,
      nom_concordant: concord,
      motif: motifSortie(valide, concord),
    });
  } catch (e) {
    console.error('verifier-tva', e);
    return reponse({ valide: null, indisponible: true, motif: 'Vérification impossible' }, 200);
  }
});
