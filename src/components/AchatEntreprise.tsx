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
  /** La raison sociale déclarée correspond-elle au titulaire du numéro ?
      NULL = l'État membre ne divulgue pas de nom (Allemagne…). */
  vat_name_match: boolean | null;
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
  /* ★ SIRET — c'est LUI qui identifie l'entreprise dans la facturation electronique.
     Il n'etait demande NULLE PART : la colonne `profiles.siret` existait, aucun ecran ne
     la remplissait. Le numero de TVA ne suffit pas — l'annuaire de la reforme route les
     factures sur le SIREN/SIRET. Sans lui, la facture d'un client professionnel ne peut
     pas lui etre acheminee, et Tiime cree le tiers comme un PARTICULIER (son
     `clientType` exige SIRET **et** TVA). */
  const [siret, setSiret] = useState('');

  useEffect(() => {
    charger();
  }, []);

  const charger = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('is_company, company_name, siret, vat_number, vat_number_valid, vat_checked_name, vat_name_match')
      .eq('id', user.id)
      .single();
    if (data) {
      setProfil(data as Profil);
      setSociete(data.company_name || '');
      setSiret(data.siret || '');
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

  /**
   * Un SIRET valide : 14 chiffres dont le dernier est une cle de controle (Luhn).
   *
   * On le verifie ICI plutot que de laisser passer une coquille : un SIRET faux ne
   * produit aucune erreur visible — il part dans Tiime, la facture est emise, et
   * l'anomalie n'apparait qu'au moment ou personne ne parvient a acheminer le document.
   * Une saisie a 14 chiffres se controle en trois lignes ; autant le faire.
   */
  const siretValide = (valeur: string): boolean => {
    const chiffres = valeur.replace(/\D/g, '');
    if (chiffres.length !== 14) return false;
    let somme = 0;
    for (let i = 0; i < 14; i++) {
      let n = Number(chiffres[13 - i]);
      if (i % 2 === 1) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      somme += n;
    }
    return somme % 10 === 0;
  };

  const verifier = async () => {
    if (!numero.trim()) {
      toast.error('Saisissez votre numéro de TVA intracommunautaire.');
      return;
    }
    /* Le SIRET n'est exige que des entreprises FRANCAISES : une societe etrangere n'en a
       pas, et le lui reclamer l'empecherait simplement de commander. */
    const francaise = numero.trim().toUpperCase().startsWith('FR');
    if (francaise && !siretValide(siret)) {
      toast.error(
        siret.trim()
          ? "Ce SIRET est invalide : vérifiez les 14 chiffres (la clé de contrôle ne tombe pas juste)."
          : 'Saisissez votre SIRET (14 chiffres) : il identifie votre entreprise pour la facturation électronique.',
        { duration: 8000 }
      );
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
          siret: siret.replace(/\D/g, '') || null,
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
      if (j.valide === true && j.nom_concordant === false) {
        /* ★ ON NE DIT PAS À QUI APPARTIENT LE NUMÉRO.
           Une première version affichait le nom officiel « pour aider à corriger » : elle
           donnait la réponse à quiconque essayait un numéro trouvé en ligne, et annulait
           donc le contrôle qu'elle était censée appliquer. Le titulaire légitime, lui,
           connaît sa propre raison sociale — et la comparaison tolère déjà la casse, les
           accents et la forme juridique. */
        toast.error(
          "Ce numéro de TVA n'est pas enregistré au nom que vous avez indiqué. " +
            'Saisissez la raison sociale exacte du titulaire, ou commandez en tant que ' +
            'particulier.',
          { duration: 10000 }
        );
      } else if (j.valide === true) {
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
          {/* Placé AVANT le numéro de TVA : c'est l'identifiant principal de
              l'entreprise, et le bouton « Vérifier » le contrôle en même temps. */}
          <input
            type="text"
            inputMode="numeric"
            value={siret}
            onChange={e => setSiret(e.target.value)}
            placeholder="SIRET (14 chiffres) — requis pour la facturation électronique"
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
          {/* Numéro valide MAIS enregistré à une autre société : l'exonération est
              refusée, et on dit pourquoi plutôt que d'afficher un vert trompeur. */}
          {profil.vat_number_valid === true && profil.vat_name_match === false && (
            <p className="text-amber-300 text-xs flex items-start gap-1.5">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>
                Ce numéro existe, mais il n'est pas enregistré au nom que vous avez
                indiqué. Saisissez la raison sociale exacte du titulaire pour bénéficier
                de l'exonération — sinon la TVA sera facturée.
              </span>
            </p>
          )}
          {profil.vat_number_valid === true && profil.vat_name_match !== false && (
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
