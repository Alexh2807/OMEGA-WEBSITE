/**
 * ACTIVATION / REVALIDATION D'UNE LICENCE OMEGADMX
 *
 * Le logiciel est gratuit avec un boîtier OMEGA DMX (le boîtier s'authentifie tout seul
 * par HMAC). Cette fonction ne sert QUE pour les interfaces d'autres marques.
 *
 * Actions :
 *
 *  • `activer`    — { machine_id, machine_label, email?, mot_de_passe? }
 *                   OU { machine_id, machine_label, access_token }
 *                   Vérifie le compte (mot de passe OU session déjà ouverte dans le
 *                   logiciel), cherche une licence active, enregistre le poste
 *                   (dans la limite de `postes_max`) et renvoie un JETON SIGNÉ.
 *                   ★ `access_token` = jeton Supabase de la session « Mon compte » :
 *                   le client n'a plus à ressaisir son mot de passe pour la licence.
 *
 *  • `revalider`  — { jeton, machine_id }
 *                   Renouvelle un jeton (même expiré) SANS redemander le mot de passe.
 *                   Si la licence a été révoquée entre-temps, le renouvellement est
 *                   refusé : c'est ce qui donne effet aux révocations de l'administration.
 *
 *  • `licences`   — { jeton, machine_id }  (poste déjà activé)
 *                   OU { access_token, machine_id }  (session Mon compte, sans jeton poste)
 *                   Liste TOUTES les licences du compte + postes occupés.
 *
 * ★ Le jeton est signé en **Ed25519**. La clé PUBLIQUE est embarquée dans OMEGADMX, qui
 * le vérifie donc HORS LIGNE : une régie sans internet continue de fonctionner jusqu'à
 * l'échéance. Seule la clé privée (secret de cette fonction) peut en fabriquer un —
 * copier un jeton d'un poste à l'autre échoue, il porte l'empreinte de la machine.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Validité d'un jeton. Le logiciel revalide bien avant, avec une tolérance hors ligne. */
const VALIDITE_JOURS = 30;

const b64url = (u8: Uint8Array) =>
  btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const deB64url = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

/**
 * Importe la clé privée Ed25519. Le secret contient la GRAINE brute (32 octets, base64) ;
 * WebCrypto exige un PKCS#8, dont l'en-tête est fixe pour Ed25519 — on le préfixe.
 */
async function cleSignature(): Promise<CryptoKey> {
  const graineB64 = Deno.env.get('LICENCE_ED25519_SEED');
  if (!graineB64) throw new Error('LICENCE_ED25519_SEED absent');
  const graine = Uint8Array.from(atob(graineB64), (c) => c.charCodeAt(0));
  if (graine.length !== 32) throw new Error('graine Ed25519 invalide (32 octets attendus)');
  const entete = Uint8Array.from([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
  ]);
  const pkcs8 = new Uint8Array(entete.length + 32);
  pkcs8.set(entete, 0);
  pkcs8.set(graine, entete.length);
  return await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, false, ['sign']);
}

/** jeton = base64url(charge_utile_json) + "." + base64url(signature) */
async function signerJeton(charge: Record<string, unknown>): Promise<string> {
  const cle = await cleSignature();
  const corps = b64url(new TextEncoder().encode(JSON.stringify(charge)));
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: 'Ed25519' }, cle, new TextEncoder().encode(corps)),
  );
  return `${corps}.${b64url(sig)}`;
}

/**
 * Relit la charge utile d'un jeton en VÉRIFIANT sa signature.
 * L'expiration n'est PAS contrôlée ici : la revalidation doit justement accepter un jeton
 * périmé (c'est son objet), on ne veut pas obliger le client à ressaisir son mot de passe
 * parce qu'il est resté un mois hors ligne.
 */
async function lireJeton(jeton: string): Promise<Record<string, any> | null> {
  /* ⚠ TOUT est dans le try, y compris le décodage.
     Le `JSON.parse` de la re-signature était DEHORS : un jeton abîmé (fichier tronqué par
     une coupure d'alimentation, disque défaillant, copie manuelle ratée) levait une
     exception qui remontait jusqu'au gestionnaire général, et le client lisait « Le
     service d'activation est momentanément indisponible » — un message d'incident chez
     NOUS, pour un problème chez lui. Il aurait attendu que ça passe ; ça ne serait jamais
     passé. Un jeton illisible doit se dire tel quel : la réponse est « réactivez ce
     poste », pas « revenez plus tard ». */
  try {
    const [corps, sig] = String(jeton || '').split('.');
    if (!corps || !sig) return null;
    const graineB64 = Deno.env.get('LICENCE_ED25519_SEED');
    if (!graineB64) return null;
    // On redérive la clé publique en important la privée puis en signant/comparant : plus
    // simple et sans dépendance, on re-signe la même entrée et on compare les signatures.
    const charge = JSON.parse(new TextDecoder().decode(deB64url(corps)));
    const attendue = (await signerJeton(charge)).split('.')[1];
    if (attendue !== sig) return null;
    return charge;
  } catch {
    return null;
  }
}

const reponse = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reponse({ code: 'methode', message: 'POST attendu' }, 405);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  try {
    const body = await req.json();
    const action = String(body.action || 'activer');
    const machineId = String(body.machine_id || '').trim();
    if (!machineId || machineId.length < 16) {
      return reponse({ code: 'machine', message: 'Identifiant de poste invalide.' }, 400);
    }

    let userId: string | null = null;

    /** Identifie un utilisateur par son jeton de session Supabase (Mon compte dans le logiciel). */
    async function userDepuisSession(): Promise<string | null> {
      const tok = String(body.access_token || '').trim();
      if (!tok) return null;
      const { data, error } = await admin.auth.getUser(tok);
      if (error || !data?.user) return null;
      return data.user.id;
    }

    // ---------- 1) Identifier le titulaire ----------
    if (action === 'activer') {
      // ★ Chemin préféré : session déjà ouverte dans le logiciel (onglet Mon compte).
      // Sans cela, chaque activation de licence redemandait e-mail + mot de passe alors
      // que l'utilisateur venait de se connecter pour les signalements.
      const viaSession = await userDepuisSession();
      if (viaSession) {
        userId = viaSession;
      } else {
        const email = String(body.email || '').trim().toLowerCase();
        const motDePasse = String(body.mot_de_passe || '');
        if (!email || !motDePasse) {
          return reponse({
            code: 'identifiants',
            message: 'Connectez-vous à votre compte OMEGA, ou saisissez e-mail et mot de passe.',
          }, 400);
        }
        // Client ANONYME : on se sert de l'authentification normale, on ne contourne rien.
        const anon = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_ANON_KEY')!,
          { auth: { persistSession: false } },
        );
        const { data, error } = await anon.auth.signInWithPassword({ email, password: motDePasse });
        if (error || !data.user) {
          return reponse(
            { code: 'identifiants', message: 'E-mail ou mot de passe incorrect.' },
            401,
          );
        }
        userId = data.user.id;
      }
    } else if (action === 'verifier') {
      /* ★ VÉRIFICATION LÉGÈRE, appelée souvent (toutes les 30 s côté logiciel, au même
         rythme que le relevé des signalements). Elle répond seulement « ce poste
         a-t-il encore le droit ? » : PAS de signature de jeton, PAS d'écriture
         d'activation. Signer un jeton toutes les 30 secondes serait absurde — c'est une
         opération de renouvellement, pas de contrôle.
         Elle n'exige AUCUNE connexion au compte : le jeton du poste suffit à identifier
         son titulaire. Un client qui a internet sans être connecté est donc couvert. */
      const charge = await lireJeton(body.jeton);
      if (!charge) return reponse({ code: 'jeton', message: 'Jeton illisible ou falsifié.' }, 401);
      if (charge.mid !== machineId) {
        return reponse({ code: 'machine', message: 'Ce jeton appartient à un autre poste.' }, 401);
      }

      const { data: l } = await admin
        .from('licences')
        .select('id, statut, suspendue_jusqu_au, motif_client, reference')
        .eq('id', charge.lid)
        .maybeSingle();

      if (!l) {
        return reponse(
          { code: 'revoquee', actif: false, message: "Cette licence n'existe plus." },
          403,
        );
      }

      const echue =
        l.statut === 'suspendue' && l.suspendue_jusqu_au &&
        new Date(l.suspendue_jusqu_au) <= new Date();

      if (l.statut === 'active' || echue) {
        /* ★ LA LICENCE EST ACTIVE — MAIS CE POSTE L'EST-IL ENCORE ?
           On ne vérifiait que le statut de la LICENCE. Un client qui retirait son
           ordinateur depuis son espace client voyait donc le logiciel continuer comme si
           de rien n'était : la libération n'avait aucun effet. Les deux sens doivent se
           répondre — le site retire, le logiciel s'arrête. */
        const { data: poste } = await admin
          .from('licence_activations')
          .select('id, liberee')
          .eq('licence_id', l.id)
          .eq('machine_id', machineId)
          .maybeSingle();

        if (!poste || poste.liberee) {
          return reponse(
            {
              code: 'poste_libere',
              actif: false,
              message:
                "Cet ordinateur a été retiré de votre licence OMEGADMX. " +
                "Réactivez-le en vous identifiant avec votre compte OMEGA, " +
                "ou libérez une place depuis votre espace client.",
            },
            403,
          );
        }

        await admin
          .from('licence_activations')
          .update({ derniere_le: new Date().toISOString() })
          .eq('id', poste.id);
        return reponse({ ok: true, actif: true, reference: l.reference });
      }

      const suspendue = l.statut === 'suspendue';
      const jusquAu = l.suspendue_jusqu_au
        ? new Date(l.suspendue_jusqu_au).toLocaleDateString('fr-FR', {
            day: '2-digit', month: 'long', year: 'numeric',
          })
        : null;
      return reponse(
        {
          code: suspendue ? 'suspendue' : 'revoquee',
          actif: false,
          suspendue_jusqu_au: l.suspendue_jusqu_au ?? null,
          message: suspendue
            ? `Votre licence OMEGADMX est suspendue${jusquAu ? ` jusqu'au ${jusquAu}` : ''}.` +
              (l.motif_client ? ` Motif : ${l.motif_client}` : '') +
              ' Le logiciel reste utilisable avec un boîtier OMEGA DMX.'
            : 'Votre licence OMEGADMX a été désactivée.' +
              (l.motif_client ? ` Motif : ${l.motif_client}` : ''),
        },
        403,
      );
    } else if (action === 'licences') {
      /* ★ TOUTES LES LICENCES DU COMPTE, pour Mon compte / Paramètres → Licence.
         Deux façons d'identifier le titulaire :
           · jeton de POSTE (déjà activé ici) — pas besoin d'être « connecté » ;
           · access_token de session Mon compte — même sans jeton poste, dès qu'on
             est connecté on voit ses licences (et on peut en activer une place).
         `verifier` reste une lecture légère séparée (toutes les 30 s). */
      let titulaire: string | null = null;
      let licencePoste: string | null = null;

      const viaSession = await userDepuisSession();
      if (viaSession) {
        titulaire = viaSession;
      } else {
        const charge = await lireJeton(body.jeton);
        if (!charge) {
          return reponse({
            code: 'jeton',
            message: 'Connectez-vous à votre compte OMEGA, ou activez d\'abord une licence sur ce poste.',
          }, 401);
        }
        if (charge.mid !== machineId) {
          return reponse({ code: 'machine', message: 'Ce jeton appartient à un autre poste.' }, 401);
        }
        titulaire = String(charge.uid);
        licencePoste = String(charge.lid);
      }

      const { data: toutes, error: eL } = await admin
        .from('licences')
        .select('id, reference, statut, postes_max, suspendue_jusqu_au, motif_client, created_at')
        .eq('user_id', titulaire)
        .order('created_at', { ascending: true });
      if (eL) throw eL;

      /* Les postes OCCUPÉS de chaque licence, en une seule lecture : une requête par
         licence ferait grimper le coût avec le nombre de licences, pour un écran qui
         s'ouvre souvent. */
      const ids = (toutes ?? []).map((l: any) => l.id);
      const { data: postes } = ids.length
        ? await admin
            .from('licence_activations')
            .select('licence_id, machine_id, machine_label, derniere_le, liberee')
            .in('licence_id', ids)
            .eq('liberee', false)
        : { data: [] as any[] };

      const liste = (toutes ?? []).map((l: any) => {
        const siens = (postes ?? []).filter((p: any) => p.licence_id === l.id);
        return {
          reference: l.reference,
          statut: l.statut,
          postes_max: l.postes_max,
          postes_utilises: siens.length,
          suspendue_jusqu_au: l.suspendue_jusqu_au ?? null,
          motif_client: l.motif_client ?? null,
          depuis: l.created_at,
          // Celle que CE poste utilise : l'écran doit la distinguer des autres.
          ce_poste: licencePoste ? (l.id === licencePoste) : siens.some((p: any) => p.machine_id === machineId),
          postes: siens.map((p: any) => ({
            nom: p.machine_label,
            vu_le: p.derniere_le,
            ce_poste: p.machine_id === machineId,
          })),
        };
      });

      return reponse({ ok: true, licences: liste });
    } else if (action === 'liberer') {
      /* ★ LIBÉRATION DU POSTE DEPUIS LE LOGICIEL.
         « Désactiver ce poste » n'effaçait que le jeton local : la place restait
         OCCUPÉE en base, et le client se retrouvait bloqué à 2/2 postes après avoir
         changé deux fois d'ordinateur. Le logiciel doit donc le DIRE au serveur.
         Le jeton suffit à prouver qu'on est bien ce poste-là — aucune connexion au
         compte n'est demandée. */
      const charge = await lireJeton(body.jeton);
      if (!charge) return reponse({ code: 'jeton', message: 'Jeton illisible ou falsifié.' }, 401);
      if (charge.mid !== machineId) {
        return reponse({ code: 'machine', message: 'Ce jeton appartient à un autre poste.' }, 401);
      }

      const { error: eLib } = await admin
        .from('licence_activations')
        .update({ liberee: true })
        .eq('licence_id', charge.lid)
        .eq('machine_id', machineId);
      if (eLib) throw eLib;

      return reponse({ ok: true, libere: true });
    } else if (action === 'revalider') {
      const charge = await lireJeton(body.jeton);
      if (!charge) {
        return reponse({ code: 'jeton', message: 'Jeton illisible ou falsifié.' }, 401);
      }
      // Le jeton doit appartenir à CE poste : sinon un jeton copié se renouvellerait
      // tranquillement sur une autre machine.
      if (charge.mid !== machineId) {
        return reponse({ code: 'machine', message: 'Ce jeton appartient à un autre poste.' }, 401);
      }
      userId = String(charge.uid);
    } else {
      return reponse({ code: 'action', message: 'Action inconnue.' }, 400);
    }

    // ---------- 2) Une licence utilisable ? ----------
    /* On lit TOUTES les licences du compte, pas seulement les actives : quand le
       pilotage est refusé, le client doit savoir POURQUOI. « Aucune licence » et
       « licence suspendue jusqu'au 12 septembre » n'appellent pas la même réaction, et
       la seconde n'est pas une erreur de sa part. */
    const { data: toutes, error: eLic } = await admin
      .from('licences')
      .select('id, reference, postes_max, statut, suspendue_jusqu_au, motif_client')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (eLic) throw eLic;

    // Une suspension échue se lève d'elle-même : personne n'a à repasser derrière.
    const utilisable = (l: any) =>
      l.statut === 'active' ||
      (l.statut === 'suspendue' &&
        l.suspendue_jusqu_au &&
        new Date(l.suspendue_jusqu_au) <= new Date());

    const licences = (toutes ?? []).filter(utilisable);

    if (licences.length === 0) {
      const bloquee = (toutes ?? []).find(
        (l: any) => l.statut === 'suspendue' || l.statut === 'revoquee' || l.statut === 'remboursee',
      );
      if (bloquee) {
        const suspendue = bloquee.statut === 'suspendue';
        const jusquAu = bloquee.suspendue_jusqu_au
          ? new Date(bloquee.suspendue_jusqu_au).toLocaleDateString('fr-FR', {
              day: '2-digit', month: 'long', year: 'numeric',
            })
          : null;
        return reponse(
          {
            code: suspendue ? 'suspendue' : 'revoquee',
            statut: bloquee.statut,
            suspendue_jusqu_au: bloquee.suspendue_jusqu_au ?? null,
            message: suspendue
              ? `Votre licence OMEGADMX est suspendue${jusquAu ? ` jusqu'au ${jusquAu}` : ''}.` +
                (bloquee.motif_client ? ` Motif : ${bloquee.motif_client}` : '') +
                ' Le logiciel reste utilisable avec un boîtier OMEGA DMX.'
              : 'Votre licence OMEGADMX a été désactivée.' +
                (bloquee.motif_client ? ` Motif : ${bloquee.motif_client}` : '') +
                " Contactez OMEGA si vous pensez qu'il s'agit d'une erreur.",
          },
          403,
        );
      }
      return reponse(
        {
          code: 'aucune_licence',
          message:
            "Ce compte OMEGA ne possède pas de licence active. Si vous utilisez un boîtier OMEGA DMX, aucune licence n'est nécessaire.",
        },
        403,
      );
    }

    /* ⚠ UN RENOUVELLEMENT NE REPREND PAS UNE PLACE LIBÉRÉE.
       `revalider` est AUTOMATIQUE : s'il réattribuait un siège au poste que le client
       vient de retirer depuis son espace client, la libération serait annulée toute seule
       dans l'heure qui suit. Seule une activation EXPLICITE (avec mot de passe) peut
       reprendre une place. */
    if (action === 'revalider') {
      const { data: encore } = await admin
        .from('licence_activations')
        .select('id')
        .eq('machine_id', machineId)
        .eq('liberee', false)
        .maybeSingle();
      if (!encore) {
        return reponse(
          {
            code: 'poste_libere',
            message:
              "Cet ordinateur a été retiré de votre licence OMEGADMX. " +
              "Réactivez-le en vous identifiant avec votre compte OMEGA.",
          },
          403,
        );
      }
    }

    // ---------- 3) Le poste a-t-il sa place ? ----------
    // On cherche d'abord une licence où CE poste est déjà connu : réactiver le même PC ne
    // doit jamais consommer une place de plus.
    let licence = null as any;
    for (const l of licences) {
      const { data: dejaLa } = await admin
        .from('licence_activations')
        .select('id')
        .eq('licence_id', l.id)
        .eq('machine_id', machineId)
        .eq('liberee', false)
        .maybeSingle();
      if (dejaLa) { licence = l; break; }
    }

    if (!licence) {
      for (const l of licences) {
        const { count } = await admin
          .from('licence_activations')
          .select('id', { count: 'exact', head: true })
          .eq('licence_id', l.id)
          .eq('liberee', false);
        if ((count ?? 0) < l.postes_max) { licence = l; break; }
      }
    }

    if (!licence) {
      /* ⚠ Le message citait la PREMIÈRE licence — « Cette licence est déjà activée sur 2
         postes » — alors que le compte peut en avoir plusieurs, toutes pleines. Le client
         cherchait une place à libérer sur une licence qui n'était pas forcément la
         bonne. On dit le total réel. */
      const l = licences[0];
      const places = licences.reduce((t: number, x: any) => t + (x.postes_max ?? 0), 0);
      const plusieurs = licences.length > 1;
      return reponse(
        {
          code: 'postes_epuises',
          message: plusieurs
            ? `Vos ${licences.length} licences OMEGADMX occupent déjà leurs ${places} postes. `
              + `Libérez-en un depuis votre compte OMEGA, rubrique Logiciels, ou contactez-nous.`
            : `Cette licence est déjà activée sur ${l.postes_max} postes. `
              + `Libérez-en un depuis votre compte OMEGA, ou contactez-nous.`,
          postes_max: l.postes_max,
          places_totales: places,
          licences: licences.length,
        },
        409,
      );
    }

    // ---------- 4) Enregistrer / rafraîchir le poste ----------
    const maintenant = new Date().toISOString();
    const { error: eAct } = await admin
      .from('licence_activations')
      .upsert(
        {
          licence_id: licence.id,
          machine_id: machineId,
          machine_label: String(body.machine_label || '').slice(0, 80) || null,
          derniere_le: maintenant,
          liberee: false,
        },
        { onConflict: 'licence_id,machine_id' },
      );
    if (eAct) throw eAct;

    // ---------- 5) Le jeton ----------
    const expire = new Date(Date.now() + VALIDITE_JOURS * 86400_000);
    const jeton = await signerJeton({
      v: 1,
      uid: userId,
      lid: licence.id,
      ref: licence.reference,
      mid: machineId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(expire.getTime() / 1000),
    });

    return reponse({
      ok: true,
      jeton,
      reference: licence.reference,
      postes_max: licence.postes_max,
      expire_le: expire.toISOString(),
    });
  } catch (e) {
    console.error('licence-activer', e);
    return reponse(
      { code: 'serveur', message: "Le service d'activation est momentanément indisponible." },
      500,
    );
  }
});
