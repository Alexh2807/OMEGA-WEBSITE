import React, { useEffect, useState } from 'react';
import { Building2, User, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

/**
 * « J'achète en tant que particulier / entreprise », DANS LE TUNNEL D'ACHAT.
 *
 * Pourquoi ici et pas seulement dans le compte : le formulaire d'adresse comporte un
 * champ « Entreprise (optionnel) » qui n'est qu'une étiquette de livraison. Un client
 * professionnel le remplissait, croyait légitimement acheter au nom de sa société… et
 * rien ne se passait : ni numéro de TVA demandé, ni exonération, ni mention sur la
 * facture. Le seul endroit où la décision existait était Mon Compte → Modifier → case
 * entreprise, que personne ne trouve au moment de payer.
 *
 * Ce bloc met la décision là où elle a des conséquences : juste avant le paiement,
 * avec le montant qui se recalcule aussitôt.
 *
 * ⚠ Il n'accorde AUCUNE exonération par lui-même. Il enregistre une déclaration ; c'est
 * `regime_tva`, côté serveur, qui décide du taux, et `verifier-tva` qui interroge le
 * fichier européen VIES. Le navigateur ne fait qu'afficher le verdict.
 */
interface Props {
  /** Appelé dès que le statut change : le panier doit redemander son devis au serveur. */
  onChangement: () => void;
}

interface Profil {
  is_company: boolean;
  company_name: string | null;
  vat_number: string | null;
  vat_number_valid: boolean | null;
  vat_checked_name: string | null;
}

const AchatEntreprise: React.FC<Props> = ({ onChangement }) => {
  /* L'en-tête affiche « Pro (HT) » ou « Particulier (TTC) » d'après le profil : il doit
     suivre la déclaration faite ici, sinon le panier se contredit à l'écran. */
  const { rafraichirStatut } = useAuth();
  const [profil, setProfil] = useState<Profil | null>(null);
  const [enregistrement, setEnregistrement] = useState(false);
  const [verification, setVerification] = useState(false);
  const [numero, setNumero] = useState('');
  const [societe, setSociete] = useState('');

  useEffect(() => {
    charger();
  }, []);

  const charger = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('is_company, company_name, vat_number, vat_number_valid, vat_checked_name')
      .eq('id', user.id)
      .single();
    if (data) {
      setProfil(data as Profil);
      setSociete(data.company_name || '');
      setNumero(data.vat_number || '');
    }
  };

  /* Le statut est enregistré côté serveur : c'est lui que `devis-commande` relira.
     ⚠ On n'écrit JAMAIS `vat_number_valid` — un déclencheur en base le remettrait à
     zéro de toute façon, seule la vérification VIES peut l'accorder. */
  const definirStatut = async (entreprise: boolean) => {
    setEnregistrement(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase
        .from('profiles')
        .update({
          is_company: entreprise,
          ...(entreprise ? {} : { company_name: null, vat_number: null }),
        })
        .eq('id', user.id);
      await charger();
      await rafraichirStatut();
      onChangement();
    } finally {
      setEnregistrement(false);
    }
  };

  const verifier = async () => {
    if (!numero.trim()) {
      toast.error('Saisissez votre numéro de TVA intracommunautaire.');
      return;
    }
    setVerification(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: { session } } = await supabase.auth.getSession();
      if (!user || !session) return;

      await supabase
        .from('profiles')
        .update({
          is_company: true,
          company_name: societe.trim() || null,
          vat_number: numero.trim().toUpperCase(),
        })
        .eq('id', user.id);

      const r = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verifier-tva`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ vat_number: numero.trim().toUpperCase() }),
        }
      );
      const j = await r.json();
      if (j.valide === true) {
        toast.success(`Numéro vérifié : ${j.nom || 'entreprise reconnue'}`);
      } else if (j.indisponible) {
        // On ne suppose jamais la validité : la TVA sera facturée, et on le dit.
        toast(j.motif, { icon: '⏳', duration: 8000 });
      } else {
        toast.error(j.motif || 'Numéro non reconnu.');
      }
      await charger();
      await rafraichirStatut();
      onChangement();
    } catch {
      toast.error('Vérification impossible pour le moment.');
    } finally {
      setVerification(false);
    }
  };

  if (!profil) return null;
  const entreprise = !!profil.is_company;

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6">
      <h3 className="text-white font-semibold mb-3 text-sm">J'achète en tant que</h3>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <button
          type="button"
          onClick={() => definirStatut(false)}
          disabled={enregistrement}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm transition-colors ${
            !entreprise
              ? 'bg-blue-500/20 border-blue-400 text-white'
              : 'bg-white/5 border-white/15 text-gray-300 hover:border-white/30'
          }`}
        >
          <User size={16} />
          Particulier
        </button>
        <button
          type="button"
          onClick={() => definirStatut(true)}
          disabled={enregistrement}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm transition-colors ${
            entreprise
              ? 'bg-blue-500/20 border-blue-400 text-white'
              : 'bg-white/5 border-white/15 text-gray-300 hover:border-white/30'
          }`}
        >
          <Building2 size={16} />
          Entreprise
        </button>
      </div>

      {entreprise && (
        <div className="space-y-2">
          <input
            type="text"
            value={societe}
            onChange={e => setSociete(e.target.value)}
            placeholder="Raison sociale"
            className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:border-blue-400 focus:outline-none"
          />
          <div className="flex gap-2">
            <input
              type="text"
              value={numero}
              onChange={e => setNumero(e.target.value.toUpperCase())}
              placeholder="N° TVA intracommunautaire (ex. IT00743110157)"
              className="flex-1 bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:border-blue-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={verifier}
              disabled={verification || !numero.trim()}
              className="px-4 rounded-lg bg-blue-500/20 border border-blue-400/50 text-blue-300 text-sm hover:bg-blue-500/30 transition-colors disabled:opacity-40 flex items-center gap-2"
            >
              {verification ? <Loader2 size={14} className="animate-spin" /> : null}
              {verification ? 'Vérification…' : 'Vérifier'}
            </button>
          </div>

          {/* État RÉEL, écrit par le serveur — jamais une supposition du navigateur. */}
          {profil.vat_number_valid === true && (
            <p className="text-emerald-300 text-xs flex items-start gap-1.5">
              <CheckCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>
                Numéro vérifié
                {profil.vat_checked_name ? ` — ${profil.vat_checked_name}` : ''}.
                Si votre société est hors de France mais dans l'Union européenne, votre
                commande est facturée sans TVA (autoliquidation).
              </span>
            </p>
          )}
          {profil.vat_number_valid === false && (
            <p className="text-red-300 text-xs flex items-start gap-1.5">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>
                Numéro non reconnu par le service européen VIES. La TVA sera facturée.
              </span>
            </p>
          )}
          {profil.vat_number && profil.vat_number_valid == null && (
            <p className="text-amber-300 text-xs flex items-start gap-1.5">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>
                Numéro pas encore vérifié — cliquez sur « Vérifier ». Tant qu'il ne
                l'est pas, la TVA est facturée.
              </span>
            </p>
          )}
          {/* Dire la vérité plutôt que de laisser espérer : une société FRANÇAISE paie
              la TVA française. L'exonération ne concerne que l'intracommunautaire. */}
          <p className="text-gray-400 text-xs">
            Une entreprise française reste facturée avec la TVA (20 %) ; elle la récupère
            ensuite. L'exonération ne s'applique qu'aux sociétés de l'Union européenne
            hors de France, numéro de TVA vérifié.
          </p>
        </div>
      )}
    </div>
  );
};

export default AchatEntreprise;
