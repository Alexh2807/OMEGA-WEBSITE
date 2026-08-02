/**
 * Edge Function : notifications e-mail du site.
 *
 * Appelée par la base (trigger -> pg_net -> ici), jamais par le navigateur. Elle est
 * donc déployée SANS vérification de JWT et se protège autrement : la base envoie un
 * secret partagé en en-tête `x-notify-secret`, que `notify_check_secret()` valide côté
 * SQL. Sans en-tête valable, on répond 401 sans rien faire.
 *
 * ENVOI — le SMTP de la messagerie OMEGA chez LWS.
 * Le SPF du domaine autorise déjà ce serveur (`mx:omegasud.fr a:mail.omegasud.fr`),
 * les messages partent donc authentifiés, sans aucune modification DNS.
 *
 *   npx supabase secrets set SMTP_USER=... SMTP_PASS=...
 *
 * Réglages facultatifs, avec des valeurs par défaut déduites du DNS du domaine :
 *   SMTP_HOST (mail.omegasud.fr) · SMTP_PORT (465, TLS direct ; 587 = STARTTLS)
 *   SMTP_FROM (par défaut SMTP_USER) · SMTP_FROM_NAME (OMEGA)
 *
 * ⚠ `SMTP_FROM` vaut par défaut `SMTP_USER` volontairement : un serveur mutualisé
 * refuse en général d'expédier au nom d'une adresse autre que celle authentifiée.
 * Ne le forcer que si la boîte est explicitement autorisée à le faire.
 *
 * Tant que SMTP_USER/SMTP_PASS ne sont pas posés, la fonction répond
 * { configured: false } sans erreur : les déclencheurs peuvent exister avant eux.
 *
 * Le gabarit reprend `supabase/templates/confirmation.html` : mêmes teintes, et surtout
 * les mêmes précautions — `bgcolor` posé EN ATTRIBUT (Outlook n'hérite pas du CSS de
 * structure et laisserait du blanc) et `color-scheme: dark` (sans quoi Gmail « corrige »
 * un fond déjà sombre et le logo blanc devient invisible).
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const SITE = 'https://omegasud.fr';

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/** Échappement HTML : les contenus viennent de clients, jamais de nous. */
const e = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Texte libre d'un client : échappé, puis ses retours à la ligne préservés. */
const bloc = (v: unknown) => e(v).replace(/\n/g, '<br>');

const euros = (n: unknown) =>
  `${Number(n ?? 0).toFixed(2).replace('.', ',')}&nbsp;&euro;`;

// ---------------------------------------------------------------------------
// Gabarit
// ---------------------------------------------------------------------------

function gabarit(opts: {
  titre: string;
  sousTitre: string;
  corps: string;
  bouton?: { libelle: string; url: string };
  pied: string;
}) {
  const bouton = opts.bouton
    ? `<tr><td class="carte" bgcolor="#101018" align="center" style="background-color:#101018;padding:0 44px 30px 44px;">
         <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
           <td align="center" bgcolor="#00c2ff" style="background-color:#00c2ff;border-radius:10px;">
             <a href="${e(opts.bouton.url)}" style="display:inline-block;padding:15px 42px;color:#06060c;font-size:15px;font-weight:700;text-decoration:none;">${e(opts.bouton.libelle)}</a>
           </td>
         </tr></table>
       </td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="fr" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${e(opts.titre)} — OMEGA</title>
<!--[if mso]><style>body,table,td,a{font-family:Arial,Helvetica,sans-serif !important}</style><![endif]-->
<style>
  :root { color-scheme: dark; supported-color-schemes: dark; }
  body { margin:0; padding:0; background-color:#07070d; }
  a { text-decoration:none; }
  @media (max-width:600px) { .carte { padding-left:24px !important; padding-right:24px !important; } }
</style>
</head>
<body bgcolor="#07070d" style="margin:0;padding:0;background-color:#07070d;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${e(opts.sousTitre)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#07070d" style="background-color:#07070d;margin:0;padding:0;">
    <tr><td bgcolor="#07070d" align="center" style="background-color:#07070d;padding:48px 16px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#07070d" style="max-width:560px;background-color:#07070d;">

        <tr><td bgcolor="#07070d" align="center" style="background-color:#07070d;padding:0 0 32px 0;">
          <a href="${SITE}" style="text-decoration:none;">
            <img src="${SITE}/email/logo-omega.png" alt="OMEGA" width="240"
                 style="display:block;width:240px;max-width:240px;height:auto;border:0;outline:none;text-decoration:none;">
          </a>
        </td></tr>

        <tr><td bgcolor="#101018" style="background-color:#101018;border:1px solid #23233a;border-radius:14px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#101018" style="background-color:#101018;">
            <tr><td height="3" bgcolor="#2563eb" style="background-color:#2563eb;background:linear-gradient(90deg,#00c2ff,#2563eb,#a21caf);border-radius:14px 14px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
            <tr><td class="carte" bgcolor="#101018" style="background-color:#101018;padding:40px 44px 12px 44px;">
              <h1 style="margin:0 0 6px 0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.3px;">${e(opts.titre)}</h1>
              <p style="margin:0 0 22px 0;color:#8b8ba3;font-size:13px;">${e(opts.sousTitre)}</p>
              ${opts.corps}
            </td></tr>
            ${bouton}
          </table>
        </td></tr>

        <tr><td bgcolor="#07070d" align="center" style="background-color:#07070d;padding:28px 20px 0 20px;">
          <p style="margin:0 0 6px 0;color:#5c5c74;font-size:12px;line-height:1.7;">
            <strong style="color:#8b8ba3;">OMEGA</strong> &mdash; Spectacles &amp; machines &agrave; effets sp&eacute;ciaux<br>
            <a href="${SITE}" style="color:#00c2ff;text-decoration:none;">omegasud.fr</a>
          </p>
          <p style="margin:14px 0 0 0;color:#42425a;font-size:11px;line-height:1.7;">${e(opts.pied)}</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Paragraphe courant. */
const p = (html: string) =>
  `<p style="margin:0 0 16px 0;color:#c9c9de;font-size:15px;line-height:1.7;">${html}</p>`;

/** Encadré qui reprend les mots du client, pour qu'on les lise sans ouvrir le site. */
const citation = (html: string) =>
  `<div style="margin:0 0 22px 0;padding:16px 18px;background-color:#161622;border-left:3px solid #00c2ff;border-radius:0 8px 8px 0;color:#c9c9de;font-size:14px;line-height:1.7;">${html}</div>`;

/** Liste « intitulé : valeur ». */
const details = (lignes: [string, string][]) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px 0;">` +
  lignes
    .map(
      ([k, v]) =>
        `<tr><td style="padding:3px 14px 3px 0;color:#8b8ba3;font-size:13px;white-space:nowrap;">${e(k)}</td>
             <td style="padding:3px 0;color:#ffffff;font-size:13px;font-weight:600;">${v}</td></tr>`
    )
    .join('') +
  `</table>`;

// ---------------------------------------------------------------------------
// Destinataires
// ---------------------------------------------------------------------------

async function adresseDe(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}

/** Tous les comptes `profiles.role = 'admin'`. */
async function adressesAdmin(): Promise<string[]> {
  const { data } = await supabaseAdmin.from('profiles').select('id').eq('role', 'admin');
  const adresses = await Promise.all((data ?? []).map((r) => adresseDe(r.id)));
  return adresses.filter((a): a is string => !!a);
}

// ---------------------------------------------------------------------------
// Envoi
// ---------------------------------------------------------------------------

async function envoyer(destinataires: string[], sujet: string, html: string) {
  if (destinataires.length === 0) return { envoyes: 0, motif: 'aucun destinataire' };

  const utilisateur = Deno.env.get('SMTP_USER');
  const motDePasse = Deno.env.get('SMTP_PASS');
  if (!utilisateur || !motDePasse) return { envoyes: 0, configured: false };

  const port = Number(Deno.env.get('SMTP_PORT') || 465);
  const { SMTPClient } = await import('https://deno.land/x/denomailer@1.6.0/mod.ts');
  const client = new SMTPClient({
    connection: {
      hostname: Deno.env.get('SMTP_HOST') || 'mail.omegasud.fr',
      port,
      // 465 ouvre directement en TLS ; 587 démarre en clair puis passe en STARTTLS.
      tls: port === 465,
      auth: { username: utilisateur, password: motDePasse },
    },
  });

  const expediteur = `${Deno.env.get('SMTP_FROM_NAME') || 'OMEGA'} <${
    Deno.env.get('SMTP_FROM') || utilisateur
  }>`;

  // Un message par destinataire : personne ne découvre l'adresse des autres, et le
  // refus du serveur pour l'un n'emporte pas les autres.
  let envoyes = 0;
  const echecs: string[] = [];
  try {
    for (const destinataire of destinataires) {
      try {
        await client.send({ from: expediteur, to: destinataire, subject: sujet, html });
        envoyes++;
      } catch (err) {
        echecs.push(`${destinataire} : ${err}`);
      }
    }
  } finally {
    await client.close();
  }

  if (envoyes === 0 && echecs.length > 0) throw new Error(echecs.join(' | '));
  return { envoyes, voie: 'smtp', ...(echecs.length ? { echecs } : {}) };
}

// ---------------------------------------------------------------------------
// Un message par événement
// ---------------------------------------------------------------------------

type Message = { destinataires: string[]; sujet: string; html: string } | null;

const PIED_ADMIN =
  "Vous recevez ce message parce que votre compte est administrateur du site. Les types d'e-mails envoyés se règlent dans Administration puis Paramètres.";

async function composer(event: string, data: Record<string, any>): Promise<Message> {
  switch (event) {
    // ---- vers les administrateurs -----------------------------------------
    case 'order_new': {
      const { data: c } = await supabaseAdmin
        .from('orders')
        .select('id, total, status, user_id, profiles(first_name, last_name)')
        .eq('id', data.id)
        .single();
      if (!c) return null;
      const nom = `${c.profiles?.first_name ?? ''} ${c.profiles?.last_name ?? ''}`.trim() || 'Client';
      return {
        destinataires: await adressesAdmin(),
        sujet: `Nouvelle commande — ${Number(c.total ?? 0).toFixed(2)} € — ${nom}`,
        html: gabarit({
          titre: 'Nouvelle commande',
          sousTitre: `${nom} vient de commander sur omegasud.fr`,
          corps:
            details([
              ['Client', e(nom)],
              ['Montant', euros(c.total)],
              ['État', e(c.status ?? 'en attente')],
              ['Référence', e(String(c.id).slice(0, 8))],
            ]) + p('Le détail complet est dans le back-office.'),
          bouton: { libelle: 'Ouvrir le back-office', url: `${SITE}/admin` },
          pied: PIED_ADMIN,
        }),
      };
    }

    case 'contact_new': {
      const { data: m } = await supabaseAdmin
        .from('contact_requests')
        .select('id, name, email, phone, subject, message')
        .eq('id', data.id)
        .single();
      if (!m) return null;
      return {
        destinataires: await adressesAdmin(),
        sujet: `Message du site — ${m.subject || 'sans objet'}`,
        html: gabarit({
          titre: 'Nouveau message',
          sousTitre: `${m.name || 'Un visiteur'} vous a écrit depuis le site`,
          corps:
            details([
              ['De', e(m.name)],
              ['Adresse', `<a href="mailto:${e(m.email)}" style="color:#00c2ff;">${e(m.email)}</a>`],
              ...((m.phone ? [['Téléphone', e(m.phone)]] : []) as [string, string][]),
              ['Objet', e(m.subject)],
            ]) + citation(bloc(m.message)),
          bouton: { libelle: 'Répondre depuis le back-office', url: `${SITE}/admin` },
          pied: PIED_ADMIN,
        }),
      };
    }

    case 'bug_new': {
      const { data: s } = await supabaseAdmin
        .from('bug_reports')
        .select('id, title, body, track_code, app_version, platform, contact_name, contact_email')
        .eq('id', data.id)
        .single();
      if (!s) return null;
      return {
        destinataires: await adressesAdmin(),
        sujet: `Signalement OMEGADMX — ${s.title}`,
        html: gabarit({
          titre: 'Nouveau signalement',
          sousTitre: `Suivi ${s.track_code ?? '—'}`,
          corps:
            details([
              ['Titre', e(s.title)],
              ['De', e(s.contact_name || s.contact_email || 'anonyme')],
              ['Version', e(s.app_version || '—')],
              ['Plateforme', e(s.platform || '—')],
            ]) + citation(bloc(s.body)),
          bouton: { libelle: 'Ouvrir le signalement', url: `${SITE}/admin` },
          pied: PIED_ADMIN,
        }),
      };
    }

    case 'bug_reply_client': {
      const { data: msg } = await supabaseAdmin
        .from('bug_report_messages')
        .select('body, report_id, bug_reports(title, track_code)')
        .eq('id', data.id)
        .single();
      if (!msg) return null;
      return {
        destinataires: await adressesAdmin(),
        sujet: `Réponse du client — ${msg.bug_reports?.title ?? 'signalement'}`,
        html: gabarit({
          titre: 'Le client a répondu',
          sousTitre: `Suivi ${msg.bug_reports?.track_code ?? '—'}`,
          corps: citation(bloc(msg.body)),
          bouton: { libelle: 'Ouvrir le signalement', url: `${SITE}/admin` },
          pied: PIED_ADMIN,
        }),
      };
    }

    case 'account_new': {
      const { data: pr } = await supabaseAdmin
        .from('profiles')
        .select('id, first_name, last_name, phone')
        .eq('id', data.id)
        .single();
      if (!pr) return null;
      const nom = `${pr.first_name ?? ''} ${pr.last_name ?? ''}`.trim() || 'Sans nom';
      return {
        destinataires: await adressesAdmin(),
        sujet: `Nouveau compte client — ${nom}`,
        html: gabarit({
          titre: 'Nouveau compte',
          sousTitre: 'Une inscription vient d’être enregistrée',
          corps: details([
            ['Nom', e(nom)],
            ['Adresse', e((await adresseDe(pr.id)) ?? '—')],
            ...((pr.phone ? [['Téléphone', e(pr.phone)]] : []) as [string, string][]),
          ]),
          bouton: { libelle: 'Voir les clients', url: `${SITE}/admin` },
          pied: PIED_ADMIN,
        }),
      };
    }

    // ---- vers le client ----------------------------------------------------
    case 'order_status': {
      const { data: c } = await supabaseAdmin
        .from('orders')
        .select('id, total, status, user_id, tracking_link')
        .eq('id', data.id)
        .single();
      if (!c) return null;
      const adresse = await adresseDe(c.user_id);
      if (!adresse) return null;
      return {
        destinataires: [adresse],
        sujet: `Votre commande OMEGA — ${c.status}`,
        html: gabarit({
          titre: 'Votre commande avance',
          sousTitre: `Référence ${String(c.id).slice(0, 8)}`,
          corps:
            p(`Votre commande est désormais&nbsp;: <strong style="color:#ffffff;">${e(c.status)}</strong>.`) +
            details([
              ['Montant', euros(c.total)],
              ...((c.tracking_link
                ? [['Suivi', `<a href="${e(c.tracking_link)}" style="color:#00c2ff;">colis</a>`]]
                : []) as [string, string][]),
            ]),
          bouton: { libelle: 'Voir mes commandes', url: `${SITE}/commandes` },
          pied: 'Vous recevez ce message car une commande est enregistrée à votre nom sur omegasud.fr.',
        }),
      };
    }

    case 'contact_answered': {
      const { data: m } = await supabaseAdmin
        .from('contact_requests')
        .select('id, name, email, subject, message, admin_response')
        .eq('id', data.id)
        .single();
      if (!m?.email) return null;
      return {
        destinataires: [m.email],
        sujet: `Réponse à votre message — ${m.subject || 'OMEGA'}`,
        html: gabarit({
          titre: 'Nous vous avons répondu',
          sousTitre: m.subject || 'Votre message à OMEGA',
          corps:
            p(`Bonjour ${e(m.name || '')},`) +
            p('Voici notre réponse&nbsp;:') +
            citation(bloc(m.admin_response)) +
            p('<span style="color:#8b8ba3;font-size:13px;">Votre message initial&nbsp;:</span>') +
            citation(`<span style="color:#8b8ba3;">${bloc(m.message)}</span>`),
          bouton: { libelle: 'Voir mes messages', url: `${SITE}/mes-messages` },
          pied: 'Vous recevez ce message en réponse à une demande envoyée depuis omegasud.fr.',
        }),
      };
    }

    case 'bug_reply_admin': {
      const { data: msg } = await supabaseAdmin
        .from('bug_report_messages')
        .select('body, report_id, bug_reports(title, track_code, contact_email, user_id)')
        .eq('id', data.id)
        .single();
      const r = msg?.bug_reports;
      if (!r) return null;
      const adresse = r.contact_email || (await adresseDe(r.user_id));
      if (!adresse) return null;
      return {
        destinataires: [adresse],
        sujet: `Réponse à votre signalement — ${r.title}`,
        html: gabarit({
          titre: 'Réponse à votre signalement',
          sousTitre: `Suivi ${r.track_code ?? '—'} — ${r.title}`,
          corps: p('Bonjour,') + p('L’équipe OMEGA vous répond&nbsp;:') + citation(bloc(msg!.body)),
          pied:
            'Vous recevez ce message car un signalement a été déposé avec cette adresse depuis OMEGADMX. ' +
            'Répondez directement à cet e-mail pour poursuivre l’échange.',
        }),
      };
    }

    // ---- accusés de réception, vers le client ------------------------------
    case 'order_ack': {
      const { data: c } = await supabaseAdmin
        .from('orders')
        .select('id, total, sub_total, shipping_cost, user_id, shipping_address')
        .eq('id', data.id)
        .single();
      if (!c) return null;
      const adresse = await adresseDe(c.user_id);
      if (!adresse) return null;

      // `order_items` est inséré APRÈS `orders` (CartPage, étapes 3 puis 5) : au premier
      // passage la commande peut n'avoir encore aucun article. On laisse le temps à
      // l'écriture d'arriver plutôt que d'envoyer un récapitulatif vide.
      let articles: any[] = [];
      for (let essai = 0; essai < 4 && articles.length === 0; essai++) {
        if (essai > 0) await new Promise((r) => setTimeout(r, 1000));
        const { data: lignes } = await supabaseAdmin
          .from('order_items')
          .select('quantity, price, products(name)')
          .eq('order_id', c.id);
        articles = lignes ?? [];
      }

      const lignesHtml = articles
        .map(
          (a) =>
            `<tr>
               <td style="padding:6px 12px 6px 0;color:#c9c9de;font-size:14px;">${e(a.products?.name ?? 'Article')}</td>
               <td style="padding:6px 12px 6px 0;color:#8b8ba3;font-size:14px;white-space:nowrap;">&times;&nbsp;${e(a.quantity)}</td>
               <td style="padding:6px 0;color:#ffffff;font-size:14px;font-weight:600;white-space:nowrap;" align="right">${euros(
                 Number(a.price) * Number(a.quantity)
               )}</td>
             </tr>`
        )
        .join('');

      const ad = c.shipping_address as Record<string, string> | null;
      const livraison = ad
        ? [
            [ad.first_name, ad.last_name].filter(Boolean).join(' ') || ad.name,
            ad.company,
            ad.address_line_1,
            ad.address_line_2,
            [ad.postal_code, ad.city].filter(Boolean).join(' '),
            ad.country,
          ]
            .filter(Boolean)
            .map((l) => e(l))
            .join('<br>')
        : null;

      return {
        destinataires: [adresse],
        sujet: `Votre commande OMEGA est confirmée — ${Number(c.total ?? 0).toFixed(2)} €`,
        html: gabarit({
          titre: 'Merci pour votre commande',
          sousTitre: `Référence ${String(c.id).slice(0, 8)}`,
          corps:
            p('Votre paiement a bien été reçu et votre commande est confirmée.') +
            (lignesHtml
              ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px 0;">${lignesHtml}</table>
                 <div style="border-top:1px solid #23233a;margin:8px 0 16px 0;"></div>`
              : '') +
            details([
              ['Sous-total', euros(c.sub_total)],
              ['Livraison', euros(c.shipping_cost)],
              ['Total payé', euros(c.total)],
            ]) +
            (livraison
              ? p(`<span style="color:#8b8ba3;font-size:13px;">Livraison à&nbsp;:</span><br>${livraison}`)
              : ''),
          bouton: { libelle: 'Suivre ma commande', url: `${SITE}/commandes` },
          pied: 'Ce message confirme votre commande sur omegasud.fr. Conservez-le.',
        }),
      };
    }

    case 'contact_ack': {
      const { data: m } = await supabaseAdmin
        .from('contact_requests')
        .select('id, name, email, subject, message')
        .eq('id', data.id)
        .single();
      if (!m?.email) return null;
      return {
        destinataires: [m.email],
        sujet: `Nous avons bien reçu votre message — ${m.subject || 'OMEGA'}`,
        html: gabarit({
          titre: 'Message bien reçu',
          sousTitre: m.subject || 'Votre demande à OMEGA',
          corps:
            p(`Bonjour ${e(m.name || '')},`) +
            p(
              'Nous avons bien reçu votre message et nous vous répondrons dans les plus ' +
                'brefs délais. Voici ce que vous nous avez écrit&nbsp;:'
            ) +
            citation(bloc(m.message)),
          pied: 'Ce message accuse réception de votre demande envoyée depuis omegasud.fr. Inutile d’y répondre.',
        }),
      };
    }

    case 'bug_ack': {
      const { data: s } = await supabaseAdmin
        .from('bug_reports')
        .select('id, title, body, track_code, contact_email, contact_name, user_id')
        .eq('id', data.id)
        .single();
      if (!s) return null;
      const adresse = s.contact_email || (await adresseDe(s.user_id));
      if (!adresse) return null;
      return {
        destinataires: [adresse],
        sujet: `Signalement enregistré — ${s.track_code ?? s.title}`,
        html: gabarit({
          titre: 'Votre signalement est enregistré',
          sousTitre: s.title,
          corps:
            p(`Bonjour ${e(s.contact_name || '')},`) +
            p('Merci de nous avoir signalé ce problème. Votre code de suivi&nbsp;:') +
            `<div style="margin:0 0 22px 0;padding:14px 18px;background-color:#161622;border:1px solid #23233a;border-radius:10px;text-align:center;color:#00c2ff;font-size:20px;font-weight:700;letter-spacing:2px;">${e(
              s.track_code ?? '—'
            )}</div>` +
            p('<span style="color:#8b8ba3;font-size:13px;">Ce que vous nous avez décrit&nbsp;:</span>') +
            citation(bloc(s.body)),
          pied:
            'Conservez ce code : il identifie votre signalement. Vous serez prévenu par e-mail ' +
            'dès que nous y répondrons.',
        }),
      };
    }

    // ---- vérification de l'installation ------------------------------------
    case 'test':
      return {
        destinataires: await adressesAdmin(),
        sujet: 'Test des notifications OMEGA',
        html: gabarit({
          titre: 'Les notifications fonctionnent',
          sousTitre: 'Message de test demandé depuis les Paramètres du site',
          corps:
            p(
              'Si vous lisez ceci, la chaîne complète est en place&nbsp;: la base déclenche, ' +
                'la fonction Edge compose, et votre messagerie omegasud.fr distribue.'
            ) +
            p(
              '<span style="color:#8b8ba3;font-size:13px;">Ce message part vers tous les comptes ' +
                'administrateurs, quels que soient les types cochés.</span>'
            ),
          bouton: { libelle: 'Retour aux réglages', url: `${SITE}/admin` },
          pied: PIED_ADMIN,
        }),
      };

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  try {
    // La base est le seul appelant légitime : elle porte le secret partagé.
    const secret = req.headers.get('x-notify-secret') || '';
    const { data: valide } = await supabaseAdmin.rpc('notify_check_secret', { p_secret: secret });
    if (valide !== true) return json({ error: 'Non autorisé' }, 401);

    const { event, data } = await req.json();
    if (!event) return json({ error: 'event requis' }, 400);

    const message = await composer(event, data ?? {});
    // Rien à envoyer n'est pas une erreur : ligne supprimée entre-temps, client sans
    // adresse connue, événement sans destinataire.
    if (!message) return json({ event, envoyes: 0, motif: 'rien à envoyer' });

    const bilan = await envoyer(message.destinataires, message.sujet, message.html);
    return json({ event, ...bilan });
  } catch (err) {
    console.error('send-notification', err);
    return json({ error: String(err) }, 500);
  }
});
