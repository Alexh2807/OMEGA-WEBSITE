/**
 * ESPACE CLIENT — MES LOGICIELS
 *
 * Le client achetait une licence OMEGADMX et ne la voyait NULLE PART : ni sa référence,
 * ni les ordinateurs sur lesquels elle était activée, ni le fait qu'elle avait été
 * suspendue. Quand le logiciel s'arrêtait, il croyait à une panne.
 *
 * Cet écran répond à trois questions qu'il se pose forcément :
 *   · « Ma licence est-elle active ? »
 *   · « Sur quels ordinateurs ? »
 *   · « Comment en libérer un pour installer ailleurs ? »
 *
 * La libération d'un poste passe par la fonction `liberer_mon_poste` : le client ne peut
 * modifier QUE ce drapeau, et seulement sur SES postes — pas par une policy d'écriture
 * ouverte sur la table.
 */
import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { KeyRound, Monitor, AlertTriangle, Check, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

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
  reference: string | null;
  statut: 'active' | 'suspendue' | 'revoquee' | 'remboursee';
  postes_max: number;
  suspendue_jusqu_au: string | null;
  motif_client: string | null;
  created_at: string;
  licence_activations?: Activation[];
}

const MesLicences: React.FC = () => {
  const [licences, setLicences] = useState<Licence[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  const charger = async () => {
    setChargement(true);
    setErreur(null);
    const { data, error } = await supabase
      .from('licences')
      .select('*, licence_activations(*)')
      .order('created_at', { ascending: false });
    if (error) setErreur(error.message);
    else setLicences((data || []) as Licence[]);
    setChargement(false);
  };

  useEffect(() => {
    charger();
  }, []);

  /** Une suspension échue ne bloque plus : on l'affiche comme telle. */
  const utilisable = (l: Licence) =>
    l.statut === 'active' ||
    (l.statut === 'suspendue' &&
      !!l.suspendue_jusqu_au &&
      new Date(l.suspendue_jusqu_au) <= new Date());

  const liberer = async (a: Activation) => {
    if (
      !window.confirm(
        `Libérer « ${a.machine_label || 'ce poste'} » ?\n\n` +
          `OMEGADMX cessera d'y piloter les interfaces d'autres marques, et vous pourrez ` +
          `activer un autre ordinateur à la place.`
      )
    )
      return;
    setEnCours(a.id);
    const { data, error } = await supabase.rpc('liberer_mon_poste', { p_activation_id: a.id });
    setEnCours(null);
    if (error || data !== true) {
      toast.error("Libération impossible. Réessayez ou contactez-nous.");
      return;
    }
    toast.success('Poste libéré');
    charger();
  };

  const puce = (l: Licence) => {
    if (utilisable(l))
      return (
        <span className="px-2.5 py-1 rounded-full text-xs font-semibold border bg-green-500/15 text-green-400 border-green-500/30">
          Active
        </span>
      );
    if (l.statut === 'suspendue')
      return (
        <span className="px-2.5 py-1 rounded-full text-xs font-semibold border bg-orange-500/15 text-orange-400 border-orange-500/30">
          Suspendue
        </span>
      );
    return (
      <span className="px-2.5 py-1 rounded-full text-xs font-semibold border bg-red-500/15 text-red-400 border-red-500/30">
        Désactivée
      </span>
    );
  };

  if (chargement)
    return (
      <div className="flex items-center gap-2 text-gray-400 py-8">
        <Loader2 className="animate-spin" size={18} /> Chargement de vos licences…
      </div>
    );

  if (erreur)
    return (
      <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg px-4 py-3">
        <AlertTriangle size={18} /> {erreur}
      </div>
    );

  if (licences.length === 0)
    return (
      <div className="text-center py-12">
        <KeyRound className="mx-auto text-gray-600 mb-4" size={44} />
        <h3 className="text-white font-semibold mb-2">Aucune licence logicielle</h3>
        <p className="text-gray-400 text-sm max-w-md mx-auto leading-relaxed">
          OMEGADMX est inclus sans supplément avec les boîtiers OMEGA DMX : si vous en
          possédez un, aucune licence n'est nécessaire — le logiciel reconnaît votre
          matériel tout seul.
          <br />
          <br />
          Une licence n'est requise que pour piloter une interface DMX d'une autre marque.
        </p>
      </div>
    );

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-3">
        <KeyRound className="text-blue-400" size={24} />
        OMEGADMX
      </h2>
      <p className="text-gray-400 text-sm mb-6">
        Vos licences logicielles et les ordinateurs sur lesquels elles sont activées.
      </p>

      <div className="space-y-5">
        {licences.map(l => {
          const postes = (l.licence_activations || []).filter(a => !a.liberee);
          return (
            <div key={l.id} className="bg-white/5 border border-white/10 rounded-xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-blue-300">{l.reference}</span>
                    {puce(l)}
                  </div>
                  <div className="text-gray-500 text-xs mt-1">
                    Depuis le {new Date(l.created_at).toLocaleDateString('fr-FR')}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-white font-semibold">
                    {postes.length} / {l.postes_max}
                  </div>
                  <div className="text-gray-500 text-xs">postes activés</div>
                </div>
              </div>

              {/* Une licence coupée doit s'EXPLIQUER : sans motif, le client ne peut ni
                  comprendre ni contester. */}
              {!utilisable(l) && (
                <div className="bg-orange-500/10 border border-orange-500/30 text-orange-200 rounded-lg px-4 py-3 mb-4 text-sm leading-relaxed">
                  {l.statut === 'suspendue' ? (
                    <>
                      Licence suspendue
                      {l.suspendue_jusqu_au &&
                        ` jusqu'au ${new Date(l.suspendue_jusqu_au).toLocaleDateString('fr-FR')}`}
                      .
                    </>
                  ) : (
                    <>Cette licence a été désactivée.</>
                  )}
                  {l.motif_client && <> {l.motif_client}</>}
                  <br />
                  Le logiciel reste utilisable avec un boîtier OMEGA DMX.
                </div>
              )}

              <h4 className="text-gray-300 text-sm font-semibold mb-2 flex items-center gap-2">
                <Monitor size={16} /> Ordinateurs
              </h4>

              {postes.length === 0 ? (
                <p className="text-gray-500 text-sm">
                  Aucun poste activé. Ouvrez OMEGADMX, connectez votre interface DMX puis
                  identifiez-vous avec ce compte.
                </p>
              ) : (
                <div className="space-y-2">
                  {postes.map(a => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between gap-3 border border-white/10 rounded-lg px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="text-white text-sm truncate">
                          {a.machine_label || 'Poste sans nom'}
                        </div>
                        <div className="text-gray-500 text-xs">
                          Activé le {new Date(a.premiere_le).toLocaleDateString('fr-FR')} · vu
                          le {new Date(a.derniere_le).toLocaleDateString('fr-FR')}
                        </div>
                      </div>
                      <button
                        onClick={() => liberer(a)}
                        disabled={enCours === a.id}
                        className="text-xs bg-white/5 hover:bg-white/10 px-3 py-2 rounded-lg whitespace-nowrap disabled:opacity-40 text-gray-200"
                      >
                        {enCours === a.id ? '…' : 'Libérer'}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {postes.length >= l.postes_max && (
                <p className="text-gray-400 text-xs mt-3 flex items-start gap-1.5">
                  <Check size={14} className="mt-0.5 shrink-0" />
                  Toutes vos places sont occupées. Libérez un poste pour en activer un autre.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MesLicences;
