/**
 * ADMINISTRATION — LICENCES OMEGADMX
 *
 * Une licence autorise OMEGADMX à piloter une interface DMX d'une AUTRE marque
 * (Sunlite/Nicolaudie…). Elle n'est PAS nécessaire avec un boîtier OMEGA DMX : celui-ci
 * s'authentifie auprès du logiciel par défi-réponse HMAC, le déblocage est automatique et
 * le client n'a rien à saisir.
 *
 * Cet écran sert à : voir qui possède quoi, révoquer un droit (litige, remboursement,
 * partage abusif), libérer un poste quand un client change de machine, et délivrer une
 * licence à la main (geste commercial, revendeur, remplacement).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  KeyRound, Search, Ban, RotateCcw, Monitor, Plus, X, AlertTriangle, Check,
} from 'lucide-react';

interface Activation {
  id: string;
  machine_id: string;
  machine_label: string | null;
  premiere_le: string;
  derniere_le: string;
  liberee: boolean;
}

interface Licence {
  id: string;
  user_id: string;
  product_id: string | null;
  order_id: string | null;
  statut: 'active' | 'revoquee' | 'remboursee';
  postes_max: number;
  reference: string | null;
  notes: string | null;
  revoquee_le: string | null;
  revoquee_motif: string | null;
  created_at: string;
  licence_activations?: Activation[];
}

/**
 * Fiche client, chargée à part : `licences` n'a pas de clé étrangère vers `profiles`.
 *
 * ⚠ L'e-mail N'EST PAS dans `profiles` — il vit dans `auth.users`, inaccessible depuis le
 * navigateur. On passe donc par la fonction `admin-users`, qui est déjà le chemin utilisé
 * par l'écran Utilisateurs. (Interroger `profiles.email` échouait en silence et toutes les
 * lignes retombaient sur l'identifiant technique.)
 */
interface Client {
  id: string;
  email?: string | null;
  nom?: string | null;
  societe?: string | null;
  telephone?: string | null;
}

const AdminLicences: React.FC = () => {
  const [licences, setLicences] = useState<Licence[]>([]);
  const [clients, setClients] = useState<Record<string, Client>>({});
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [recherche, setRecherche] = useState('');
  const [filtreStatut, setFiltreStatut] = useState<'tous' | 'active' | 'revoquee' | 'remboursee'>('tous');
  const [detail, setDetail] = useState<Licence | null>(null);
  const [creation, setCreation] = useState(false);
  const [emailNouveau, setEmailNouveau] = useState('');
  const [enCours, setEnCours] = useState(false);

  const charger = async () => {
    setChargement(true);
    setErreur(null);
    try {
      const { data, error } = await supabase
        .from('licences')
        .select('*, licence_activations(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const lst = (data || []) as Licence[];
      setLicences(lst);

      // Identités clients : UNE seule requête pour tout le monde (une par ligne ferait
      // s'effondrer l'affichage dès quelques dizaines de licences).
      if (lst.length) {
        const { data: session } = await supabase.auth.getSession();
        if (session.session) {
          const r = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users`,
            { headers: { Authorization: `Bearer ${session.session.access_token}` } },
          );
          if (!r.ok) throw new Error("Impossible de charger l'identité des clients.");
          const j = await r.json();
          const map: Record<string, Client> = {};
          (j.users || []).forEach((u: any) => {
            const p = u.profile || {};
            const nom = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
            map[u.id] = {
              id: u.id,
              email: u.email ?? null,
              nom: nom || u.display_name || null,
              societe: p.company_name ?? null,
              telephone: p.phone ?? null,
            };
          });
          setClients(map);
        }
      }
    } catch (e: any) {
      setErreur(e?.message || 'Chargement impossible');
    } finally {
      setChargement(false);
    }
  };

  useEffect(() => { charger(); }, []);

  const nomClient = (id: string) => {
    const c = clients[id];
    if (!c) return id.slice(0, 8) + '…';
    return c.nom || c.email || id.slice(0, 8) + '…';
  };

  const listeFiltree = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return licences.filter((l) => {
      if (filtreStatut !== 'tous' && l.statut !== filtreStatut) return false;
      if (!q) return true;
      const c = clients[l.user_id];
      // On cherche sur TOUT ce que l'admin peut avoir sous la main quand un client
      // appelle : son nom, son e-mail, sa société, son téléphone, la référence.
      return [l.reference, c?.email, c?.nom, c?.societe, c?.telephone, l.notes, l.user_id]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [licences, clients, recherche, filtreStatut]);

  const postesActifs = (l: Licence) =>
    (l.licence_activations || []).filter((a) => !a.liberee).length;

  const revoquer = async (l: Licence) => {
    const motif = window.prompt(
      `Révoquer la licence ${l.reference} de ${nomClient(l.user_id)} ?\n\n` +
      `Le logiciel cessera d'émettre du DMX sur les interfaces tierces à la prochaine ` +
      `revalidation (30 jours au plus).\n\nMotif :`
    );
    if (motif === null) return;
    setEnCours(true);
    const { error } = await supabase
      .from('licences')
      .update({ statut: 'revoquee', revoquee_le: new Date().toISOString(), revoquee_motif: motif || null })
      .eq('id', l.id);
    setEnCours(false);
    if (error) { alert('Révocation impossible : ' + error.message); return; }
    charger();
  };

  const reactiver = async (l: Licence) => {
    if (!window.confirm(`Réactiver la licence ${l.reference} ?`)) return;
    setEnCours(true);
    const { error } = await supabase
      .from('licences')
      .update({ statut: 'active', revoquee_le: null, revoquee_motif: null })
      .eq('id', l.id);
    setEnCours(false);
    if (error) { alert('Réactivation impossible : ' + error.message); return; }
    charger();
  };

  /** Libère un poste : le client peut alors activer une autre machine. */
  const libererPoste = async (a: Activation) => {
    if (!window.confirm(`Libérer le poste « ${a.machine_label || a.machine_id.slice(0, 12)} » ?`)) return;
    const { error } = await supabase.from('licence_activations').update({ liberee: true }).eq('id', a.id);
    if (error) { alert('Impossible : ' + error.message); return; }
    // Recharge la licence ouverte pour que le compteur de postes se mette à jour tout de
    // suite dans la fenêtre, sans attendre le rechargement de la liste.
    if (detail) {
      const rafraichi = await supabase
        .from('licences').select('*, licence_activations(*)').eq('id', detail.id).single();
      if (rafraichi.data) setDetail(rafraichi.data as Licence);
    }
    charger();
  };

  /** Délivrance manuelle : geste commercial, revendeur, remplacement de matériel. */
  const creerLicence = async () => {
    const email = emailNouveau.trim().toLowerCase();
    if (!email) return;
    setEnCours(true);
    try {
      /* ⚠ L'e-mail n'est PAS dans `profiles` (il vit dans `auth.users`) : on interroge
         `admin-users`, seul chemin autorisé depuis le navigateur pour un administrateur.
         Chercher `profiles.email` échouait en silence et rendait la délivrance manuelle
         impossible. */
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error('Session expirée — reconnectez-vous.');
      const rep = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users`,
        { headers: { Authorization: `Bearer ${session.session.access_token}` } },
      );
      if (!rep.ok) throw new Error("Impossible de vérifier les comptes clients.");
      const js = await rep.json();
      const compte = (js.users || []).find(
        (u: any) => String(u.email || '').toLowerCase() === email,
      );
      if (!compte) throw new Error("Aucun compte OMEGA avec cet e-mail. Le client doit d'abord créer son compte.");

      const { data: produit } = await supabase
        .from('products').select('id').eq('sku', 'OMGA-LIC-DMX').maybeSingle();

      const { error: e2 } = await supabase.from('licences').insert({
        user_id: compte.id,
        product_id: produit?.id ?? null,
        notes: 'Délivrée manuellement depuis l’administration',
      });
      if (e2) throw e2;
      setCreation(false);
      setEmailNouveau('');
      charger();
    } catch (e: any) {
      alert(e?.message || 'Création impossible');
    } finally {
      setEnCours(false);
    }
  };

  const puceStatut = (s: Licence['statut']) => {
    const styles: Record<string, string> = {
      active: 'bg-green-500/15 text-green-400 border-green-500/30',
      revoquee: 'bg-red-500/15 text-red-400 border-red-500/30',
      remboursee: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    };
    const libelle: Record<string, string> = {
      active: 'Active', revoquee: 'Révoquée', remboursee: 'Remboursée',
    };
    return (
      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${styles[s]}`}>
        {libelle[s]}
      </span>
    );
  };

  const actives = licences.filter((l) => l.statut === 'active').length;

  return (
    <div className="text-white">
      {/* En-tête + rappel du modèle commercial, pour qu'un futur admin ne s'interroge pas */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-3">
            <KeyRound className="text-blue-400" size={26} />
            Licences OMEGADMX
          </h2>
          <p className="text-gray-400 text-sm mt-1">
            Nécessaires uniquement pour piloter une interface DMX d’une autre marque.
            Avec un boîtier OMEGA DMX, le logiciel se débloque tout seul.
          </p>
        </div>
        <button
          onClick={() => setCreation(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-4 py-2.5 rounded-lg font-semibold transition"
        >
          <Plus size={18} /> Délivrer une licence
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="text-3xl font-bold">{licences.length}</div>
          <div className="text-gray-400 text-sm">Licences émises</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="text-3xl font-bold text-green-400">{actives}</div>
          <div className="text-gray-400 text-sm">Actives</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="text-3xl font-bold text-red-400">
            {licences.filter((l) => l.statut !== 'active').length}
          </div>
          <div className="text-gray-400 text-sm">Révoquées / remboursées</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="text-3xl font-bold">
            {licences.reduce((n, l) => n + postesActifs(l), 0)}
          </div>
          <div className="text-gray-400 text-sm">Postes activés</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Nom, prénom, e-mail, société, téléphone, référence…"
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <select
          value={filtreStatut}
          onChange={(e) => setFiltreStatut(e.target.value as any)}
          className="bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500"
        >
          <option value="tous">Tous les statuts</option>
          <option value="active">Actives</option>
          <option value="revoquee">Révoquées</option>
          <option value="remboursee">Remboursées</option>
        </select>
      </div>

      {erreur && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg px-4 py-3 mb-4">
          <AlertTriangle size={18} /> {erreur}
        </div>
      )}

      {chargement ? (
        <div className="text-gray-400 py-12 text-center">Chargement des licences…</div>
      ) : listeFiltree.length === 0 ? (
        <div className="text-gray-400 py-12 text-center border border-white/10 rounded-xl">
          {licences.length === 0
            ? 'Aucune licence émise pour le moment.'
            : 'Aucune licence ne correspond à cette recherche.'}
        </div>
      ) : (
        <div className="overflow-x-auto border border-white/10 rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-gray-400">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Référence</th>
                <th className="text-left px-4 py-3 font-semibold">Client</th>
                <th className="text-left px-4 py-3 font-semibold">Statut</th>
                <th className="text-left px-4 py-3 font-semibold">Postes</th>
                <th className="text-left px-4 py-3 font-semibold">Émise le</th>
                <th className="text-right px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {listeFiltree.map((l) => (
                <tr key={l.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                  <td className="px-4 py-3 font-mono text-blue-300">{l.reference || '—'}</td>
                  <td className="px-4 py-3">
                    <div>{nomClient(l.user_id)}</div>
                    {clients[l.user_id]?.email && (
                      <div className="text-gray-500 text-xs">{clients[l.user_id].email}</div>
                    )}
                    {clients[l.user_id]?.societe && (
                      <div className="text-gray-500 text-xs">{clients[l.user_id].societe}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">{puceStatut(l.statut)}</td>
                  <td className="px-4 py-3">
                    <span className={postesActifs(l) >= l.postes_max ? 'text-orange-400' : ''}>
                      {postesActifs(l)} / {l.postes_max}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {new Date(l.created_at).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setDetail(l)}
                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition"
                        title="Voir les postes activés"
                      >
                        <Monitor size={16} />
                      </button>
                      {l.statut === 'active' ? (
                        <button
                          onClick={() => revoquer(l)}
                          disabled={enCours}
                          className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition disabled:opacity-40"
                          title="Révoquer"
                        >
                          <Ban size={16} />
                        </button>
                      ) : (
                        <button
                          onClick={() => reactiver(l)}
                          disabled={enCours}
                          className="p-2 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition disabled:opacity-40"
                          title="Réactiver"
                        >
                          <RotateCcw size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ---- Détail : les postes activés ---- */}
      {detail && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setDetail(null)}>
          <div className="bg-gray-900 border border-white/10 rounded-2xl max-w-2xl w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-5">
              <div>
                <h3 className="text-xl font-bold">Licence {detail.reference}</h3>
                <p className="text-gray-400 text-sm">{nomClient(detail.user_id)}</p>
                {clients[detail.user_id]?.email && (
                  <p className="text-gray-500 text-xs">{clients[detail.user_id].email}</p>
                )}
                {clients[detail.user_id]?.telephone && (
                  <p className="text-gray-500 text-xs">{clients[detail.user_id].telephone}</p>
                )}
              </div>
              <button onClick={() => setDetail(null)} className="p-2 rounded-lg hover:bg-white/10"><X size={20} /></button>
            </div>

            {detail.revoquee_motif && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg px-4 py-3 mb-4 text-sm">
                Révoquée le {new Date(detail.revoquee_le!).toLocaleDateString('fr-FR')} — {detail.revoquee_motif}
              </div>
            )}

            <h4 className="font-semibold mb-3 text-gray-300">
              Postes activés ({postesActifs(detail)} / {detail.postes_max})
            </h4>
            {(detail.licence_activations || []).length === 0 ? (
              <p className="text-gray-500 text-sm">
                Aucun poste activé. Le client n’a pas encore ouvert le logiciel avec une interface tierce.
              </p>
            ) : (
              <div className="space-y-2">
                {(detail.licence_activations || []).map((a) => (
                  <div key={a.id} className={`flex items-center justify-between gap-3 border rounded-lg px-4 py-3 ${a.liberee ? 'border-white/5 opacity-50' : 'border-white/10'}`}>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{a.machine_label || 'Poste sans nom'}</div>
                      <div className="text-gray-500 text-xs font-mono truncate">{a.machine_id.slice(0, 24)}…</div>
                      <div className="text-gray-500 text-xs">
                        Vu le {new Date(a.derniere_le).toLocaleDateString('fr-FR')}
                      </div>
                    </div>
                    {a.liberee ? (
                      <span className="text-xs text-gray-500 whitespace-nowrap">Libéré</span>
                    ) : (
                      <button
                        onClick={() => libererPoste(a)}
                        className="text-xs bg-white/5 hover:bg-white/10 px-3 py-2 rounded-lg whitespace-nowrap"
                      >
                        Libérer
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---- Délivrance manuelle ---- */}
      {creation && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setCreation(false)}>
          <div className="bg-gray-900 border border-white/10 rounded-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-xl font-bold">Délivrer une licence</h3>
              <button onClick={() => setCreation(false)} className="p-2 rounded-lg hover:bg-white/10"><X size={20} /></button>
            </div>
            <p className="text-gray-400 text-sm mb-4">
              Sans passer par une commande : geste commercial, revendeur, remplacement.
              Le client doit déjà posséder un compte OMEGA.
            </p>
            <label className="block text-sm text-gray-300 mb-2">E-mail du compte OMEGA</label>
            <input
              value={emailNouveau}
              onChange={(e) => setEmailNouveau(e.target.value)}
              type="email"
              placeholder="client@exemple.fr"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 mb-5"
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setCreation(false)} className="px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10">
                Annuler
              </button>
              <button
                onClick={creerLicence}
                disabled={enCours || !emailNouveau.trim()}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 font-semibold disabled:opacity-40"
              >
                <Check size={18} /> Délivrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminLicences;
