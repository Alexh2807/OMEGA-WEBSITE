/**
 * Le VRAI composant AdminBugReports monté dans jsdom, derrière un faux client Supabase.
 *
 * Pourquoi ce test existe (4 août 2026) — deux allers-retours ratés avec l'exploitant :
 *   1. « le site n'actualise toujours pas le message envoyé par le client » ;
 *   2. « ni même quand j'appuie sur rafraîchir… ça n'actualise pas le message, mais ça
 *      actualise bien la date ».
 *
 * Les deux causes étaient invisibles à la lecture du code :
 *   · `bug_reports.updated_at` NE BOUGE PAS quand un client répond — le trigger qui le
 *     met à jour n'est pas `SECURITY DEFINER` et la seule policy d'UPDATE est
 *     `is_admin()`, donc chez un client l'UPDATE ne touche aucune ligne, en silence.
 *     Une relève qui surveillait cette date était donc aveugle par construction ;
 *   · le bouton « Rafraîchir » ne relisait que `bug_reports`, jamais la conversation
 *     dépliée — d'où « la date s'actualise, pas le message ».
 *
 * ⚠ Le faux serveur reproduit exactement ces conditions : ajouter un message de CLIENT
 * NE TOUCHE PAS `updated_at`. Un stub complaisant qui bumperait la date ferait passer
 * ce test au vert sans rien prouver.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* ---------- Base de données du banc ---------- */
type Msg = { id: string; report_id: string; created_at: string; is_admin: boolean; body: string };
const TICKET = {
  id: 'r1',
  created_at: '2026-08-04T02:39:03.000Z',
  updated_at: '2026-08-04T03:23:44.000Z',      // heure du DERNIER message ADMIN
  user_id: 'u1',
  contact_email: 'client@exemple.fr',
  track_code: 'aaaabbbbccccddddeeeeffff',
  title: 'La lyre 3 ne repond plus',
  body: 'Depuis la 1.33 la lyre 3 reste noire.',
  app_version: '1.33',
  platform: 'Windows',
  diagnostics: null,
  status: 'en_cours',
  severity: 'normal',
  admin_note: null,
  show_name: null,
  show_bytes: null,
  show_encoding: null,
  fixed_in_version: null,
  is_public: false,
  public_title: null,
};
let db: { reports: typeof TICKET[]; messages: Msg[] };

/** Le client répond : ⚠ `updated_at` du ticket reste INCHANGÉ (cf. en-tête). */
function messageDuClient(body: string, at: string) {
  db.messages.push({ id: 'm' + db.messages.length, report_id: 'r1', created_at: at, is_admin: false, body });
}

/* ---------- Faux client Supabase (chaînable et « thenable ») ---------- */
/* ⚠ Ce faux serveur HONORE `.order()` et `.limit()`. Ce n'est pas du zèle : la page
   déduit « qui a parlé en dernier » en prenant le PREMIER message rencontré par
   `report_id` dans une liste triée du plus récent au plus ancien. Un stub qui rendrait
   les lignes dans l'ordre d'insertion inverserait la conclusion — et validerait un
   composant faux, ou invaliderait un composant juste. */
function requete(table: string) {
  const etat: {
    table: string; colonnes: string; filtres: Record<string, string>; unique: boolean;
    tri: { col: string; asc: boolean } | null; max: number | null;
  } = { table, colonnes: '', filtres: {}, unique: false, tri: null, max: null };
  const trierEtBorner = <T extends Record<string, unknown>>(rows: T[]) => {
    let out = rows.slice();
    if (etat.tri) {
      const { col, asc } = etat.tri;
      out.sort((a, b) => String(a[col]).localeCompare(String(b[col])) * (asc ? 1 : -1));
    }
    if (etat.max != null) out = out.slice(0, etat.max);
    return out;
  };
  const resoudre = () => {
    if (etat.table === 'bug_reports') {
      const rs = trierEtBorner(db.reports.filter((r) => !etat.filtres.id || etat.filtres.id === 'eq.' + r.id));
      return { data: etat.unique ? rs[0] ?? null : rs, error: null };
    }
    let ms = db.messages.slice();
    if (etat.filtres.report_id) ms = ms.filter((m) => 'eq.' + m.report_id === etat.filtres.report_id);
    if (etat.filtres.is_admin) ms = ms.filter((m) => String(m.is_admin) === etat.filtres.is_admin.replace('eq.', ''));
    return { data: trierEtBorner(ms), error: null };
  };
  const chaine: Record<string, unknown> = {
    select: (c: string) => { etat.colonnes = c; return chaine; },
    order: (col: string, opts?: { ascending?: boolean }) => {
      etat.tri = { col, asc: !opts || opts.ascending !== false };
      return chaine;
    },
    limit: (n: number) => { etat.max = n; return chaine; },
    eq: (col: string, val: string) => { etat.filtres[col] = 'eq.' + val; return chaine; },
    single: () => { etat.unique = true; return chaine; },
    insert: (row: Msg) => {
      db.messages.push({ ...row, id: 'm' + db.messages.length, created_at: new Date().toISOString() });
      return Promise.resolve({ data: null, error: null });
    },
    update: () => chaine,
    then: (res: (v: unknown) => void) => Promise.resolve(resoudre()).then(res),
  };
  return chaine;
}
vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: (t: string) => requete(t),
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'admin1' } } }) },
  },
}));
vi.mock('react-hot-toast', () => ({
  default: { success: () => {}, error: () => {} },
  Toaster: () => null,
}));

import AdminBugReports from '../AdminBugReports';

/* ---------- Montage ---------- */
let conteneur: HTMLDivElement;
let racine: Root;
const texte = () => conteneur.textContent || '';
// Laisse passer les promesses en attente (les requêtes du faux serveur).
const respirer = async () => { await React.act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

beforeEach(async () => {
  db = {
    reports: [{ ...TICKET }],
    messages: [
      { id: 'm0', report_id: 'r1', created_at: '2026-08-04T03:20:00.000Z', is_admin: true, body: 'Bonjour, nous regardons.' },
      { id: 'm1', report_id: 'r1', created_at: '2026-08-04T03:23:44.000Z', is_admin: true, body: 'Pouvez-vous preciser ?' },
    ],
  };
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers({ shouldAdvanceTime: true });
  conteneur = document.createElement('div');
  document.body.appendChild(conteneur);
  racine = createRoot(conteneur);
  await React.act(async () => { racine.render(<AdminBugReports />); });
  await respirer();
});

afterEach(async () => {
  await React.act(async () => { racine.unmount(); });
  conteneur.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Déplie le signalement (clic sur son en-tête). */
async function ouvrirLeTicket() {
  const entete = Array.from(conteneur.querySelectorAll('button')).find((b) => b.textContent?.includes('La lyre 3'));
  expect(entete, 'en-tête du signalement introuvable').toBeTruthy();
  await React.act(async () => { entete!.click(); });
  await respirer();
}

describe('AdminBugReports — la conversation se met à jour sans rafraîchir la page', () => {
  it('affiche le signalement et sa conversation à l\'ouverture', async () => {
    expect(texte()).toContain('La lyre 3 ne repond plus');
    await ouvrirLeTicket();
    expect(texte()).toContain('Pouvez-vous preciser ?');
  });

  it('★ fait apparaître le message du client SEUL, sans rouvrir le fil ni recharger la page', async () => {
    await ouvrirLeTicket();
    expect(texte()).not.toContain('J\'ai trouve le soucis');

    // Le client répond pendant que le fil est ouvert. `updated_at` ne bouge PAS.
    messageDuClient('J\'ai trouve le soucis, merci !', '2026-08-04T03:24:01.000Z');
    expect(db.reports[0].updated_at).toBe('2026-08-04T03:23:44.000Z');   // le piège, bien en place

    await React.act(async () => { vi.advanceTimersByTime(15000); });     // une relève
    await respirer();

    expect(texte()).toContain('J\'ai trouve le soucis, merci !');
  });

  it('★ le bouton « Rafraîchir » recharge AUSSI la conversation, pas seulement la date', async () => {
    await ouvrirLeTicket();
    messageDuClient('Deuxieme message du client', '2026-08-04T03:30:00.000Z');

    const rafraichir = conteneur.querySelector('button[title="Rafraîchir maintenant"]') as HTMLButtonElement | null;
    expect(rafraichir, 'bouton Rafraîchir introuvable').toBeTruthy();
    await React.act(async () => { rafraichir!.click(); });
    await respirer();

    expect(texte()).toContain('Deuxieme message du client');
  });

  it('signale « Réponse du client » quand le dernier mot est au client', async () => {
    expect(texte()).not.toContain('Réponse du client');
    messageDuClient('Une question de plus', '2026-08-04T03:31:00.000Z');
    await React.act(async () => { vi.advanceTimersByTime(15000); });
    await respirer();
    expect(texte()).toContain('Réponse du client');
  });

  it('ne recharge pas la conversation quand rien n\'a changé', async () => {
    await ouvrirLeTicket();
    const avant = conteneur.innerHTML;
    await React.act(async () => { vi.advanceTimersByTime(15000); });
    await respirer();
    // Seul l'horodatage « à jour · hh:mm:ss » peut différer : le fil, lui, est identique.
    const sansHeure = (h: string) => h.replace(/\d{2}:\d{2}:\d{2}/g, '--:--:--');
    expect(sansHeure(conteneur.innerHTML)).toBe(sansHeure(avant));
  });
});
