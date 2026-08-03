import React, { useState, useEffect, useCallback } from 'react';
import {
  Bug,
  Search,
  RefreshCw,
  Send,
  ChevronDown,
  ChevronRight,
  Monitor,
  User,
  Clock,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

/**
 * Signalements remontés depuis le logiciel OMEGADMX (menu Aide → Signaler un problème).
 *
 * L'utilisateur peut envoyer AVEC ou SANS compte :
 *  - sans compte  → `user_id` est nul ; un déclencheur SQL le rattache quand même si
 *                   l'e-mail donné correspond à un compte existant ;
 *  - avec compte  → le client suit l'échange depuis le logiciel et depuis le site.
 * La lecture ici n'est possible que pour `profiles.role = 'admin'` (RLS).
 */

interface BugReport {
  id: string;
  created_at: string;
  updated_at: string;
  user_id: string | null;
  contact_email: string | null;
  track_code: string;
  title: string;
  body: string;
  app_version: string | null;
  platform: string | null;
  diagnostics: string | null;
  status: string;
  severity: string;
  admin_note: string | null;
  /* Show joint par le client (facultatif). `show_data` = JSON gzip+base64 — voir la
     migration 20260803090000. Sert à REJOUER le problème avec sa configuration réelle
     plutôt qu'à le deviner. */
  show_data: string | null;
  show_name: string | null;
  show_bytes: number | null;
  show_encoding: string | null;
  /* Traitement et publication (migration 20260803140000). `fixed_in_version` est ce que
     le client voit dans son logiciel : « corrigé en 1.34 ». `is_public` fait apparaître
     le problème dans la liste publique — jamais par défaut, le texte vient d'un client. */
  fixed_in_version: string | null;
  is_public: boolean;
  public_title: string | null;
}

interface ReportMessage {
  id: string;
  created_at: string;
  is_admin: boolean;
  body: string;
}

const STATUTS: Record<string, string> = {
  nouveau: 'Nouveau',
  en_cours: 'En cours',
  resolu: 'Résolu',
  ferme: 'Fermé',
  doublon: 'Doublon',
};
const SEVERITES: Record<string, string> = {
  bloquant: 'Bloquant',
  normal: 'Normal',
  mineur: 'Mineur',
};

const poids = (o: number | null) => {
  if (!o) return '';
  return o < 1024 ? o + ' o' : o < 1024 * 1024 ? (o / 1024).toFixed(0) + ' Ko' : (o / 1048576).toFixed(1) + ' Mo';
};

/* Rend le .omshow tel que l'application le lit : on décompresse le gzip du client.
   ⚠ Ne PAS se contenter d'un atob() : le contenu est compressé (un show de 500 Ko tient
   en ~80 Ko), le fichier serait illisible. `show_encoding` dit quel cas on a — on ne
   devine pas, un client sur une WebView sans CompressionStream envoie du JSON brut. */
async function telechargerShow(r: BugReport) {
  if (!r.show_data) return;
  const bin = Uint8Array.from(atob(r.show_data), (c) => c.charCodeAt(0));
  let texte: string;
  if (r.show_encoding === 'gzip+base64') {
    const flux = new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'));
    texte = await new Response(flux).text();
  } else {
    texte = new TextDecoder().decode(bin);
  }
  const nom = (r.show_name || 'show').replace(/[\\/:*?"<>|]/g, '_');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([texte], { type: 'application/json' }));
  a.download = `${nom}.omshow`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

const couleurStatut = (s: string) =>
  s === 'nouveau' ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
  : s === 'en_cours' ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
  : s === 'resolu' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
  : 'bg-gray-500/15 text-gray-400 border-gray-500/30';

const AdminBugReports: React.FC = () => {
  const [reports, setReports] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState<string>('actifs');
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, ReportMessage[]>>({});
  const [reponse, setReponse] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [voirDiag, setVoirDiag] = useState<string | null>(null);
  const [versionFiltre, setVersionFiltre] = useState<string>('toutes');
  const [severiteFiltre, setSeveriteFiltre] = useState<string>('toutes');
  const [tri, setTri] = useState<string>('priorite');

  const charger = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('bug_reports')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(300);
    if (error) toast.error('Lecture impossible : ' + error.message);
    else setReports((data as BugReport[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { charger(); }, [charger]);

  const chargerMessages = async (id: string) => {
    const { data, error } = await supabase
      .from('bug_report_messages')
      .select('id, created_at, is_admin, body')
      .eq('report_id', id)
      .order('created_at', { ascending: true });
    if (error) { toast.error(error.message); return; }
    setMessages((m) => ({ ...m, [id]: (data as ReportMessage[]) || [] }));
  };

  const basculer = (id: string) => {
    if (ouvert === id) { setOuvert(null); return; }
    setOuvert(id);
    setReponse('');
    if (!messages[id]) chargerMessages(id);
  };

  const majChamp = async (
    id: string,
    champ: 'status' | 'severity' | 'admin_note' | 'fixed_in_version' | 'is_public' | 'public_title',
    valeur: string | boolean | null
  ) => {
    // Mise à jour optimiste : le back-office reste fluide même sur une connexion lente.
    setReports((rs) => rs.map((r) => (r.id === id ? { ...r, [champ]: valeur } : r)));
    const { error } = await supabase.from('bug_reports').update({ [champ]: valeur }).eq('id', id);
    if (error) { toast.error('Enregistrement refusé : ' + error.message); charger(); }
  };

  /* Marquer corrigé = un seul geste. Renseigner la version fait passer le ticket en
     « résolu » : sans ça, il resterait dans « reste à traiter » alors qu'il est fait,
     et il faudrait penser à changer DEUX champs pour une seule décision. */
  const marquerCorrige = async (id: string, version: string) => {
    const v = version.trim();
    setReports((rs) => rs.map((r) => (r.id === id ? { ...r, fixed_in_version: v || null, status: v ? 'resolu' : r.status } : r)));
    const patch: Record<string, unknown> = { fixed_in_version: v || null };
    if (v) patch.status = 'resolu';
    const { error } = await supabase.from('bug_reports').update(patch).eq('id', id);
    if (error) { toast.error('Enregistrement refusé : ' + error.message); charger(); return; }
    toast.success(v ? `Marqué corrigé en ${v}` : 'Version de correction retirée');
  };

  const repondre = async (id: string) => {
    const txt = reponse.trim();
    if (!txt) return;
    setEnvoi(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from('bug_report_messages').insert({
      report_id: id,
      author_id: u?.user?.id,
      is_admin: true,
      body: txt,
    });
    setEnvoi(false);
    if (error) { toast.error('Envoi impossible : ' + error.message); return; }
    setReponse('');
    chargerMessages(id);
    // Une réponse sous-entend qu'on a pris le ticket en main.
    const r = reports.find((x) => x.id === id);
    if (r && r.status === 'nouveau') majChamp(id, 'status', 'en_cours');
    toast.success('Réponse envoyée');
  };

  /* Tri et filtres — la file de traitement.
     « Reste à traiter » n'est pas un filtre parmi d'autres : c'est la vue par défaut,
     celle qui répond à « qu'est-ce qu'il me reste à faire ». Un ticket marqué résolu en
     sort automatiquement, ce qui est exactement l'effet demandé : renseigner la version
     de correction vide la liste. */
  const visibles = reports
    .filter((r) => {
      if (filtre === 'actifs' && (r.status === 'ferme' || r.status === 'doublon' || r.status === 'resolu')) return false;
      if (filtre !== 'actifs' && filtre !== 'tous' && r.status !== filtre) return false;
      if (versionFiltre !== 'toutes' && (r.app_version || '?') !== versionFiltre) return false;
      if (severiteFiltre !== 'toutes' && r.severity !== severiteFiltre) return false;
      const q = recherche.trim().toLowerCase();
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        r.body.toLowerCase().includes(q) ||
        (r.contact_email || '').toLowerCase().includes(q) ||
        (r.app_version || '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (tri === 'anciennete') return +new Date(a.created_at) - +new Date(b.created_at);
      if (tri === 'arrivee') return +new Date(b.created_at) - +new Date(a.created_at);
      if (tri === 'priorite') {
        // Priorité = gravité d'abord, puis le plus ancien : ce qui bloque quelqu'un
        // depuis longtemps passe avant ce qui gêne à peine depuis ce matin.
        const p = (r: BugReport) => (r.severity === 'bloquant' ? 0 : r.severity === 'normal' ? 1 : 2);
        return p(a) - p(b) || +new Date(a.created_at) - +new Date(b.created_at);
      }
      return +new Date(b.updated_at) - +new Date(a.updated_at);   // activité
    });

  const nouveaux = reports.filter((r) => r.status === 'nouveau').length;
  const aTraiter = reports.filter((r) => r.status === 'nouveau' || r.status === 'en_cours').length;
  const bloquants = reports.filter(
    (r) => (r.status === 'nouveau' || r.status === 'en_cours') && r.severity === 'bloquant'
  ).length;
  const versions = Array.from(new Set(reports.map((r) => r.app_version || '?'))).sort().reverse();

  /* Versions proposées pour « corrigé dans la version ».
     On ne se contente pas des versions DÉJÀ vues : une correction se planifie pour une
     version À VENIR, qui par définition n'existe encore nulle part. On propose donc les
     versions connues ET les trois suivantes, calculées depuis la plus haute rencontrée.
     La saisie libre reste possible (c'est une liste de suggestions, pas une contrainte). */
  const versionsCorrection = (() => {
    const vues = new Set<string>();
    reports.forEach((r) => {
      if (r.app_version) vues.add(r.app_version.trim());
      if (r.fixed_in_version) vues.add(r.fixed_in_version.trim());
    });
    const num = (v: string) => v.split('.').map((n) => parseInt(n, 10) || 0);
    const triees = Array.from(vues).filter(Boolean).sort((a, b) => {
      const [am, an] = num(a), [bm, bn] = num(b);
      return am - bm || an - bn;
    });
    const suite: string[] = [];
    const haute = triees[triees.length - 1];
    if (haute) {
      const [maj, min] = num(haute);
      for (let i = 1; i <= 3; i++) suite.push(`${maj}.${min + i}`);
    }
    return Array.from(new Set([...suite.reverse(), ...triees.reverse()]));
  })();

  return (
    <div className="text-gray-200">
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex items-center gap-2 mr-auto">
          <Bug className="w-5 h-5 text-cyan-400" />
          <h2 className="text-xl font-bold text-white">Signalements OMEGADMX</h2>
          {/* Ce qui reste à faire, lisible sans compter : c'est la question qu'on se pose
              en ouvrant cette page. */}
          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
            {aTraiter} à traiter
          </span>
          {nouveaux > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-sky-500/15 text-sky-300 border border-sky-500/30">
              {nouveaux} nouveau{nouveaux > 1 ? 'x' : ''}
            </span>
          )}
          {bloquants > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/15 text-red-300 border border-red-500/40">
              {bloquants} bloquant{bloquants > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher…"
            className="pl-9 pr-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm w-56 outline-none focus:border-cyan-500"
          />
        </div>
        <select
          value={filtre}
          onChange={(e) => setFiltre(e.target.value)}
          className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm outline-none"
        >
          <option value="actifs">Reste à traiter</option>
          <option value="tous">Tous</option>
          {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select
          value={versionFiltre}
          onChange={(e) => setVersionFiltre(e.target.value)}
          className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm outline-none"
          title="Version d'où vient le signalement"
        >
          <option value="toutes">Toutes versions</option>
          {versions.map((v) => <option key={v} value={v}>{v === '?' ? 'version inconnue' : 'V' + v}</option>)}
        </select>
        <select
          value={severiteFiltre}
          onChange={(e) => setSeveriteFiltre(e.target.value)}
          className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm outline-none"
        >
          <option value="toutes">Toutes gravités</option>
          {Object.entries(SEVERITES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select
          value={tri}
          onChange={(e) => setTri(e.target.value)}
          className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm outline-none"
          title="Ordre d'affichage"
        >
          <option value="priorite">Tri : priorité</option>
          <option value="arrivee">Tri : plus récents</option>
          <option value="anciennete">Tri : plus anciens</option>
          <option value="activite">Tri : dernière activité</option>
        </select>
        <button
          onClick={charger}
          className="p-2 rounded-lg bg-gray-800 border border-gray-700 hover:border-cyan-500 transition"
          title="Rafraîchir"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && <div className="text-gray-400 text-sm">Chargement…</div>}
      {!loading && visibles.length === 0 && (
        <div className="text-gray-400 text-sm">Aucun signalement à afficher.</div>
      )}

      <div className="space-y-2">
        {visibles.map((r) => {
          const estOuvert = ouvert === r.id;
          return (
            <div key={r.id} className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
              <button
                onClick={() => basculer(r.id)}
                className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-800/40 transition"
              >
                {estOuvert ? <ChevronDown className="w-4 h-4 mt-1 text-gray-500" /> : <ChevronRight className="w-4 h-4 mt-1 text-gray-500" />}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white truncate">{r.title}</div>
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(r.created_at).toLocaleString('fr-FR')}
                    </span>
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {r.contact_email || 'anonyme'}
                      {r.user_id && <span className="text-cyan-400" title="Rattaché à un compte : le client suit l'échange">· compte</span>}
                    </span>
                    {r.app_version && (
                      <span className="flex items-center gap-1">
                        <Monitor className="w-3 h-3" />
                        v{r.app_version}
                      </span>
                    )}
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${couleurStatut(r.status)}`}>
                  {STATUTS[r.status] || r.status}
                </span>
              </button>

              {estOuvert && (
                <div className="px-4 pb-4 pt-1 border-t border-gray-800">
                  <div className="whitespace-pre-wrap text-sm text-gray-200 leading-relaxed my-3">{r.body}</div>

                  <div className="flex flex-wrap gap-2 mb-3">
                    <select
                      value={r.status}
                      onChange={(e) => majChamp(r.id, 'status', e.target.value)}
                      className="px-2 py-1 rounded-lg bg-gray-800 border border-gray-700 text-xs outline-none"
                    >
                      {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <select
                      value={r.severity}
                      onChange={(e) => majChamp(r.id, 'severity', e.target.value)}
                      className="px-2 py-1 rounded-lg bg-gray-800 border border-gray-700 text-xs outline-none"
                    >
                      {Object.entries(SEVERITES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    {r.diagnostics && (
                      <button
                        onClick={() => setVoirDiag(voirDiag === r.id ? null : r.id)}
                        className="px-2 py-1 rounded-lg bg-gray-800 border border-gray-700 text-xs hover:border-cyan-500 transition"
                      >
                        {voirDiag === r.id ? 'Masquer' : 'Infos techniques'}
                      </button>
                    )}
                    {r.show_data && (
                      <button
                        onClick={() => telechargerShow(r)}
                        className="px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/40 text-xs text-cyan-300 hover:border-cyan-400 transition font-semibold"
                        title="Télécharge le show du client au format .omshow, prêt à ouvrir dans OmegaDMX"
                      >
                        Show du client{r.show_bytes ? ` · ${poids(r.show_bytes)}` : ''}
                      </button>
                    )}
                    {!r.user_id && (
                      <span className="px-2 py-1 rounded-lg bg-gray-800/60 border border-gray-700 text-xs text-gray-400"
                            title="Envoi anonyme : le client suit l'échange avec ce code, sans compte">
                        Code de suivi : {r.track_code.slice(0, 8)}…
                      </span>
                    )}
                  </div>

                  {/* ---- Traitement : version de correction + publication ----
                      Renseigner la version fait DEUX choses d'un coup : le ticket passe
                      en résolu (il sort de « reste à traiter ») et le client voit
                      « corrigé en 1.34 » dans son logiciel, sans qu'on lui écrive. */}
                  <div className="flex flex-wrap items-center gap-2 mb-3 p-3 rounded-lg bg-gray-900/70 border border-gray-800">
                    <span className="text-xs font-bold uppercase tracking-wide text-gray-500 mr-1">
                      Sera corrigé dans la version
                    </span>
                    {/* Liste de suggestions plutôt qu'un menu fermé : une correction se
                        planifie souvent pour une version qui n'existe pas encore. */}
                    <input
                      list={`versions-${r.id}`}
                      defaultValue={r.fixed_in_version || ''}
                      onBlur={(e) => { if ((e.target.value || '') !== (r.fixed_in_version || '')) marquerCorrige(r.id, e.target.value); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      placeholder="ex. 1.34"
                      className="px-2 py-1 rounded-lg bg-gray-800 border border-gray-700 text-xs outline-none focus:border-emerald-500 w-32"
                      title="Renseigner la version passe le signalement en « résolu » et l'annonce au client dans son logiciel"
                    />
                    <datalist id={`versions-${r.id}`}>
                      {versionsCorrection.map((v) => <option key={v} value={v} />)}
                    </datalist>
                    {r.fixed_in_version && (
                      <span className="px-2 py-1 rounded-lg text-xs bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        {/* Ce que le CLIENT verra, selon SA version : signalé en {app_version},
                            corrigé en {fixed_in_version}. */}
                        signalé en {r.app_version || '?'} → corrigé en {r.fixed_in_version}
                      </span>
                    )}
                    <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer ml-2"
                           title="Fait apparaître ce problème dans la liste publique consultable depuis le logiciel">
                      <input
                        type="checkbox"
                        checked={!!r.is_public}
                        onChange={(e) => majChamp(r.id, 'is_public', e.target.checked)}
                        className="accent-cyan-500 w-4 h-4"
                      />
                      Publier dans « problèmes connus »
                    </label>
                    {r.is_public && (
                      <input
                        defaultValue={r.public_title || ''}
                        onBlur={(e) => { if ((e.target.value || '') !== (r.public_title || '')) majChamp(r.id, 'public_title', e.target.value.trim() || null); }}
                        placeholder="Titre public (vide = titre d'origine)"
                        className="flex-1 min-w-[220px] px-2 py-1 rounded-lg bg-gray-800 border border-gray-700 text-xs outline-none focus:border-cyan-500"
                        title="⚠ Le titre d'origine est écrit par le client : reformulez-le s'il contient un lieu, un nom ou une information privée"
                      />
                    )}
                  </div>

                  {voirDiag === r.id && r.diagnostics && (
                    <pre className="text-[11px] leading-relaxed bg-black/50 border border-gray-800 rounded-lg p-3 overflow-auto max-h-64 whitespace-pre-wrap mb-3">
                      {r.diagnostics}
                    </pre>
                  )}

                  <div className="border-t border-gray-800 pt-3">
                    <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Conversation</div>
                    {(messages[r.id] || []).length === 0 && (
                      <div className="text-xs text-gray-500 mb-2">Aucun échange pour l'instant.</div>
                    )}
                    {(messages[r.id] || []).map((m) => (
                      <div key={m.id} className="mb-3">
                        <div className={`text-[11px] font-bold ${m.is_admin ? 'text-cyan-400' : 'text-gray-400'}`}>
                          {m.is_admin ? 'Vous' : 'Client'} · {new Date(m.created_at).toLocaleString('fr-FR')}
                        </div>
                        <div className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">{m.body}</div>
                      </div>
                    ))}

                    {r.user_id ? (
                      <div className="flex gap-2 mt-3">
                        <input
                          value={reponse}
                          onChange={(e) => setReponse(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') repondre(r.id); }}
                          placeholder="Répondre au client…"
                          className="flex-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm outline-none focus:border-cyan-500"
                        />
                        <button
                          onClick={() => repondre(r.id)}
                          disabled={envoi || !reponse.trim()}
                          className="px-4 py-2 rounded-lg bg-cyan-500 text-black font-bold text-sm disabled:opacity-40 flex items-center gap-2"
                        >
                          <Send className="w-4 h-4" /> Envoyer
                        </button>
                      </div>
                    ) : (
                      // Sans compte rattaché, le client ne verra la réponse que via son code
                      // de suivi : on le dit, plutôt que de laisser croire à une discussion.
                      <div className="mt-3 text-xs text-gray-400 bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2">
                        Envoi anonyme : ce client n'a pas de compte rattaché. Vos réponses ne lui
                        seront visibles que s'il consulte son code de suivi
                        {r.contact_email && <> — ou écrivez-lui à <span className="text-gray-200">{r.contact_email}</span></>}.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AdminBugReports;
