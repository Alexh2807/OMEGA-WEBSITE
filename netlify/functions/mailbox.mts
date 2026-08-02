/**
 * Messagerie OMEGA — accès à la boîte contact@omegasud.fr depuis le back-office.
 *
 * ## Pourquoi une fonction Netlify et non une fonction Edge Supabase
 * Lire une boîte mail, c'est décoder du MIME : jeux de caractères hérités, en-têtes
 * encodés, corps multipart, pièces jointes. Une bibliothèque éprouvée fait toute la
 * différence, et `imapflow` (Node) l'est ; les clients IMAP pour Deno ne le sont pas.
 * Le site est déjà hébergé ici, l'exécution côté Node ne coûte donc aucune brique
 * supplémentaire.
 * (Le 2 août, une bibliothèque SMTP immature tournant sous Deno a mis les
 * notifications à terre : voir le commentaire d'en-tête de send-notification.)
 *
 * ## Sécurité
 * La boîte contient toute la correspondance de l'entreprise. Chaque appel doit donc
 * porter le jeton Supabase de l'appelant, et ce jeton doit correspondre à un compte
 * dont `profiles.role = 'admin'`. Aucune information de connexion à la messagerie ne
 * transite vers le navigateur.
 *
 * ## Variables d'environnement à déclarer côté Netlify
 *   MAIL_USER, MAIL_PASS      identifiants de la boîte (les mêmes que SMTP_USER/SMTP_PASS)
 *   MAIL_IMAP_HOST            défaut mail.omegasud.fr
 *   MAIL_IMAP_PORT            défaut 993
 *   MAIL_SMTP_HOST            défaut mail.omegasud.fr
 *   MAIL_SMTP_PORT            défaut 465
 *   SUPABASE_URL              pour valider le jeton
 *   SUPABASE_SERVICE_ROLE_KEY pour lire profiles.role sans dépendre du RLS
 */
import type { Context } from '@netlify/functions';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';

const conf = {
  utilisateur: process.env.MAIL_USER ?? '',
  motDePasse: process.env.MAIL_PASS ?? '',
  imapHote: process.env.MAIL_IMAP_HOST ?? 'mail.omegasud.fr',
  imapPort: Number(process.env.MAIL_IMAP_PORT ?? 993),
  smtpHote: process.env.MAIL_SMTP_HOST ?? 'mail.omegasud.fr',
  smtpPort: Number(process.env.MAIL_SMTP_PORT ?? 465),
  supabaseUrl: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '',
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
};

const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/** Le jeton doit désigner un compte administrateur. Sans quoi : 403. */
async function estAdmin(autorisation: string | null): Promise<boolean> {
  if (!autorisation?.startsWith('Bearer ') || !conf.supabaseUrl) return false;
  const jeton = autorisation.slice(7);

  const u = await fetch(`${conf.supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${jeton}`, apikey: conf.serviceKey },
  });
  if (!u.ok) return false;
  const { id } = await u.json();
  if (!id) return false;

  // Lu avec la clé de service : le rôle ne doit pas dépendre de ce que le client
  // a le droit de voir.
  const p = await fetch(
    `${conf.supabaseUrl}/rest/v1/profiles?id=eq.${id}&select=role`,
    { headers: { apikey: conf.serviceKey, Authorization: `Bearer ${conf.serviceKey}` } }
  );
  if (!p.ok) return false;
  const lignes = await p.json();
  return lignes?.[0]?.role === 'admin';
}

async function connexionImap() {
  const client = new ImapFlow({
    host: conf.imapHote,
    port: conf.imapPort,
    secure: conf.imapPort === 993,
    auth: { user: conf.utilisateur, pass: conf.motDePasse },
    logger: false,
  });
  await client.connect();
  return client;
}

/**
 * Les dossiers de la boîte, avec leur rôle quand le serveur le déclare.
 *
 * Les noms varient d'un hébergeur à l'autre — « Sent », « INBOX.Sent », « Envoyés »… —
 * d'où la lecture des attributs spéciaux (`\Sent`, `\Trash`…) plutôt qu'une liste
 * devinée à l'avance.
 */
async function dossiers() {
  const client = await connexionImap();
  try {
    const liste = await client.list();
    return {
      dossiers: liste
        .filter((d) => !d.flags?.has('\\Noselect'))
        .map((d) => ({
          chemin: d.path,
          nom: d.name,
          role: d.specialUse ?? null, // '\\Sent', '\\Trash', '\\Drafts', '\\Junk'…
        })),
    };
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * Les N derniers messages d'un dossier, du plus récent au plus ancien.
 * Avec `recherche`, le tri est fait PAR LE SERVEUR de messagerie (commande IMAP
 * SEARCH) : on ne rapatrie jamais la boîte pour la filtrer ici. C'est ce qui permet
 * de rester rapide quel que soit le nombre de messages.
 */
async function lister(limite: number, dossier = 'INBOX', recherche = '') {
  const client = await connexionImap();
  try {
    const boite = await client.mailboxOpen(dossier, { readOnly: true });
    const total = boite.exists;
    if (!total) return { messages: [], total: 0 };

    let plage: string;
    let trouves = total;

    const q = recherche.trim();
    if (q) {
      // Un seul mot cherché à la fois dans l'expéditeur, le destinataire et l'objet.
      // Volontairement PAS dans le corps : `BODY` oblige beaucoup de serveurs à
      // ouvrir chaque message, ce qui s'effondre sur une grosse boîte.
      const uids = await client.search(
        { or: [{ from: q }, { to: q }, { subject: q }] },
        { uid: true }
      );
      if (!uids || uids.length === 0) return { messages: [], total: 0, recherche: q };
      trouves = uids.length;
      // Les plus récents d'abord, et on n'en rapatrie que `limite`.
      plage = uids.slice(-limite).join(',');
    } else {
      plage = `${Math.max(1, total - limite + 1)}:${total}`;
    }

    const messages: unknown[] = [];
    for await (const m of client.fetch(
      plage,
      { envelope: true, flags: true, size: true },
      q ? { uid: true } : undefined
    )) {
      messages.push({
        uid: m.uid,
        objet: m.envelope?.subject ?? '(sans objet)',
        de: m.envelope?.from?.[0]
          ? { nom: m.envelope.from[0].name, adresse: m.envelope.from[0].address }
          : null,
        // Dans « Envoyés », l'expéditeur c'est nous : c'est le destinataire qui
        // identifie le message.
        a: m.envelope?.to?.[0]
          ? { nom: m.envelope.to[0].name, adresse: m.envelope.to[0].address }
          : null,
        date: m.envelope?.date ?? null,
        lu: m.flags?.has('\\Seen') ?? false,
        taille: m.size ?? 0,
      });
    }
    // `fetch` rend les messages dans l'ordre de la boîte : on inverse pour présenter
    // les plus récents en premier. `total` = nombre de résultats, pas taille du
    // dossier, pour que l'écran puisse annoncer « 12 trouvés ».
    return { messages: messages.reverse(), total: trouves, ...(q ? { recherche: q } : {}) };
  } finally {
    await client.logout().catch(() => {});
  }
}

/** Le contenu d'un message, et son passage en « lu ». */
async function ouvrir(uid: number, dossier = 'INBOX') {
  const client = await connexionImap();
  try {
    await client.mailboxOpen(dossier);
    const m = await client.fetchOne(String(uid), { source: true, envelope: true }, { uid: true });
    if (!m) return null;

    // Le décodage complet (multipart, encodages, pièces jointes) est délégué à
    // mailparser, qui accompagne imapflow.
    const { simpleParser } = await import('mailparser');
    const analyse = await simpleParser(m.source as Buffer);

    await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true }).catch(() => {});

    return {
      uid,
      objet: analyse.subject ?? '(sans objet)',
      de: analyse.from?.value?.[0]
        ? { nom: analyse.from.value[0].name, adresse: analyse.from.value[0].address }
        : null,
      date: analyse.date ?? null,
      texte: analyse.text ?? '',
      html: typeof analyse.html === 'string' ? analyse.html : null,
      messageId: analyse.messageId ?? null,
      piecesJointes: (analyse.attachments ?? []).map((p) => ({
        nom: p.filename,
        type: p.contentType,
        taille: p.size,
      })),
    };
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * Envoie un message. Avec `messageId`, c'est une réponse : elle est préfixée « Re: »
 * et rattachée au fil d'origine. Sans lui, c'est un message neuf, dont l'objet est
 * laissé exactement tel que l'expéditeur l'a écrit.
 */
async function envoyerMail(a: string, objet: string, corps: string, messageId?: string) {
  const transport = nodemailer.createTransport({
    host: conf.smtpHote,
    port: conf.smtpPort,
    secure: conf.smtpPort === 465,
    auth: { user: conf.utilisateur, pass: conf.motDePasse },
  });

  const envoi = await transport.sendMail({
    from: `OMEGA <${conf.utilisateur}>`,
    to: a,
    subject:
      messageId && !objet.toLowerCase().startsWith('re')
        ? `Re: ${objet}`
        : objet || '(sans objet)',
    text: corps,
    // Sans ces deux en-têtes, la réponse ouvre une conversation distincte au lieu de
    // se ranger sous la demande d'origine chez le destinataire.
    ...(messageId ? { inReplyTo: messageId, references: [messageId] } : {}),
  });

  // La réponse est déposée dans les éléments envoyés : sans cela, elle n'existerait
  // que chez le destinataire et serait invisible depuis le webmail.
  try {
    const client = await connexionImap();
    try {
      for (const dossier of ['INBOX.Sent', 'Sent', 'INBOX.Envoyés']) {
        try {
          await client.append(dossier, envoi.message as unknown as Buffer, ['\\Seen']);
          break;
        } catch {
          /* dossier absent chez cet hébergeur : on tente le suivant */
        }
      }
    } finally {
      await client.logout().catch(() => {});
    }
  } catch {
    /* l'archivage est un confort : son échec ne doit pas faire échouer l'envoi */
  }

  // Même journal que les notifications automatiques : la traçabilité n'aurait aucune
  // valeur si elle ne couvrait que la moitié des envois.
  // ⚠ Silencieux en cas d'échec : ne pas réussir à tracer un envoi ne doit pas faire
  // croire que l'envoi a échoué.
  try {
    await fetch(`${conf.supabaseUrl}/rest/v1/email_log`, {
      method: 'POST',
      headers: {
        apikey: conf.serviceKey,
        Authorization: `Bearer ${conf.serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        evenement: messageId ? 'reponse' : 'manuel',
        destinataire: a,
        objet,
        statut: 'envoye',
        origine: 'manuel',
        // Écrit en texte : ces messages sont saisis au clavier, ils n'ont pas de
        // version HTML propre. Le journal doit malgré tout pouvoir les relire.
        corps_texte: corps,
      }),
    });
  } catch (err) {
    console.error('Journalisation impossible :', err);
  }

  return { envoye: true };
}

export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);

  if (!conf.utilisateur || !conf.motDePasse) {
    return json({ configured: false, error: 'Messagerie non configurée' }, 200);
  }

  if (!(await estAdmin(req.headers.get('Authorization')))) {
    return json({ error: 'Accès réservé aux administrateurs' }, 403);
  }

  try {
    const { action, uid, limite, a, objet, corps, messageId, dossier, recherche } =
      await req.json();

    switch (action) {
      case 'dossiers':
        return json(await dossiers());
      case 'lister':
        return json(
          await lister(
            Math.min(Number(limite) || 25, 100),
            dossier || 'INBOX',
            typeof recherche === 'string' ? recherche : ''
          )
        );
      case 'ouvrir': {
        const message = await ouvrir(Number(uid), dossier || 'INBOX');
        return message ? json(message) : json({ error: 'Message introuvable' }, 404);
      }
      case 'repondre':
        if (!a || !corps) return json({ error: 'Destinataire et texte requis' }, 400);
        return json(await envoyerMail(a, objet ?? '', corps, messageId));

      case 'envoyer': {
        if (!a || !corps) return json({ error: 'Destinataire et texte requis' }, 400);
        // Garde-fou : une adresse manifestement invalide serait refusée par le serveur
        // après coup, avec un message bien moins clair pour l'expéditeur.
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(a).trim())) {
          return json({ error: 'Adresse du destinataire invalide' }, 400);
        }
        return json(await envoyerMail(String(a).trim(), objet ?? '', corps));
      }
      default:
        return json({ error: 'Action inconnue' }, 400);
    }
  } catch (err) {
    console.error('mailbox', err);
    return json({ error: String(err) }, 500);
  }
};
