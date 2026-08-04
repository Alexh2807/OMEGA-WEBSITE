import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

/**
 * Page d'arrivée du lien « mot de passe oublié » : saisie du nouveau mot de passe.
 *
 * ## Comment le compte est reconnu
 * Le lien reçu par e-mail contient un jeton de récupération. Le client `supabase-js`
 * consomme l'URL tout seul (`detectSessionInUrl`) et ouvre une session de récupération :
 * à l'arrivée ici, la personne est DÉJÀ authentifiée pour ce seul geste.
 * `supabase.auth.updateUser({ password })` s'applique donc au bon compte, et l'ancien
 * mot de passe n'a jamais à être transmis — c'est bien le but, il est oublié.
 *
 * ## Deux pièges, les mêmes que sur la confirmation d'e-mail
 * 1. Les jetons arrivent dans le FRAGMENT (`#access_token=…&type=recovery`) en flux
 *    implicite, ou en `?code=…` en PKCE : on regarde les deux.
 * 2. La session n'est pas là au premier rendu — `supabase-js` la pose de façon
 *    asynchrone. Conclure trop vite afficherait « lien invalide » sur un lien parfait.
 *    On attend donc l'événement d'authentification, avec un délai de garde.
 */

type Etat = 'attente' | 'pret' | 'lien_invalide';

function lireParams(): Record<string, string> {
  const out: Record<string, string> = {};
  const prendre = (s: string) => {
    new URLSearchParams(s.replace(/^[#?]/, '')).forEach((v, k) => {
      out[k] = v;
    });
  };
  if (typeof window !== 'undefined') {
    prendre(window.location.hash || '');
    prendre(window.location.search || '');
  }
  return out;
}

const MIN_CARACTERES = 8;

const NouveauMotDePassePage: React.FC = () => {
  const navigate = useNavigate();
  const { changerMotDePasse } = useAuth();
  const [etat, setEtat] = useState<Etat>('attente');
  const [motif, setMotif] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [afficher, setAfficher] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);

  useEffect(() => {
    let vivant = true;
    let minuteur: ReturnType<typeof setTimeout> | null = null;
    let desabonner: (() => void) | null = null;
    const params = lireParams();

    // Erreur explicite renvoyée par Supabase : lien expiré, déjà utilisé, altéré.
    if (params.error || params.error_code) {
      const d = (params.error_description || '').replace(/\+/g, ' ');
      setEtat('lien_invalide');
      setMotif(
        /expired|invalid/i.test(d + params.error_code)
          ? "Ce lien a expiré ou a déjà été utilisé. Demandez-en un nouveau, il est valable une heure."
          : d || "Ce lien n'a pas pu être validé."
      );
      return;
    }

    const verifier = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!vivant) return;
      if (session) {
        setEtat('pret');
        /* On efface le jeton de la barre d'adresse : il reste sinon dans l'historique
           du navigateur et dans tout partage d'écran ou copie de lien. */
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    };

    verifier();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_evenement, session) => {
      if (!vivant || !session) return;
      setEtat('pret');
      window.history.replaceState({}, document.title, window.location.pathname);
    });
    desabonner = () => subscription.unsubscribe();

    /* Délai de garde : si rien n'est arrivé au bout de 6 secondes, c'est que l'URL ne
       portait aucun jeton exploitable (lien tronqué par la messagerie, copie partielle,
       accès direct à l'adresse). On le dit plutôt que de laisser tourner. */
    minuteur = setTimeout(() => {
      if (!vivant) return;
      setEtat(prec => {
        if (prec !== 'attente') return prec;
        setMotif(
          "Nous n'avons pas reconnu ce lien de réinitialisation. Il a peut-être été tronqué par votre messagerie : demandez-en un nouveau."
        );
        return 'lien_invalide';
      });
    }, 6000);

    return () => {
      vivant = false;
      if (minuteur) clearTimeout(minuteur);
      if (desabonner) desabonner();
    };
  }, []);

  const soumettre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enregistrement) return; // anti double soumission

    if (motDePasse.length < MIN_CARACTERES) {
      toast.error(`Mot de passe trop court : ${MIN_CARACTERES} caractères au minimum.`);
      return;
    }
    if (motDePasse !== confirmation) {
      toast.error('Les deux mots de passe ne correspondent pas.');
      return;
    }

    setEnregistrement(true);
    const { error } = await changerMotDePasse(motDePasse);
    setEnregistrement(false);

    if (error) {
      toast.error(error);
      return;
    }

    /* La session de récupération devient une session normale : le client est connecté,
       on l'emmène dans son compte plutôt que de lui redemander de se connecter — ce qui
       laisserait penser que le changement n'a pas pris. */
    toast.success('Mot de passe modifié. Vous êtes connecté.');
    navigate('/compte', { replace: true });
  };

  if (etat === 'attente') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black flex items-center justify-center pt-24">
        <div className="text-center">
          <Loader2 className="text-blue-400 mx-auto mb-4 animate-spin" size={40} />
          <p className="text-gray-300">Vérification de votre lien…</p>
        </div>
      </div>
    );
  }

  if (etat === 'lien_invalide') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black flex items-center justify-center pt-24 pb-12">
        <div className="container mx-auto px-6">
          <div className="max-w-md mx-auto bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-8 border border-white/10 text-center">
            <div className="bg-red-500/15 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
              <AlertCircle className="text-red-400" size={30} />
            </div>
            <h1 className="text-2xl font-bold text-white mb-3">Lien inutilisable</h1>
            <p className="text-gray-400 mb-6 leading-relaxed">{motif}</p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                to="/mot-de-passe-oublie"
                className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 text-center"
              >
                Demander un nouveau lien
              </Link>
              <Link
                to="/contact"
                className="flex-1 border-2 border-white/30 text-white py-3 rounded-lg font-semibold hover:bg-white/10 transition-colors text-center"
              >
                Nous contacter
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black flex items-center justify-center pt-24 pb-12">
      <div className="container mx-auto px-6">
        <div className="max-w-md mx-auto">
          <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-8 border border-white/10">
            <div className="text-center mb-8">
              <div className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <ShieldCheck className="text-blue-400" size={30} />
              </div>
              <h1 className="text-3xl font-bold text-white mb-2">
                Nouveau mot de passe
              </h1>
              <p className="text-gray-400">
                Choisissez un mot de passe d'au moins {MIN_CARACTERES} caractères.
              </p>
            </div>

            <form onSubmit={soumettre} className="space-y-6">
              <div>
                <label
                  htmlFor="nouveau-mot-de-passe"
                  className="block text-sm font-medium text-gray-300 mb-2"
                >
                  Nouveau mot de passe *
                </label>
                <div className="relative">
                  <Lock
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                    size={20}
                  />
                  <input
                    id="nouveau-mot-de-passe"
                    type={afficher ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={motDePasse}
                    onChange={e => setMotDePasse(e.target.value)}
                    className="w-full bg-white/5 border border-white/20 rounded-lg pl-10 pr-12 py-3 text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none"
                    placeholder="Votre nouveau mot de passe"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setAfficher(!afficher)}
                    aria-label={
                      afficher ? 'Masquer le mot de passe' : 'Afficher le mot de passe'
                    }
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    {afficher ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="confirmation-mot-de-passe"
                  className="block text-sm font-medium text-gray-300 mb-2"
                >
                  Confirmer le mot de passe *
                </label>
                <div className="relative">
                  <Lock
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                    size={20}
                  />
                  <input
                    id="confirmation-mot-de-passe"
                    type={afficher ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmation}
                    onChange={e => setConfirmation(e.target.value)}
                    className="w-full bg-white/5 border border-white/20 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none"
                    placeholder="Retapez le mot de passe"
                    required
                  />
                </div>
                {/* Un écart signalé PENDANT la saisie évite un aller-retour d'erreur. */}
                {confirmation.length > 0 && confirmation !== motDePasse && (
                  <p className="text-amber-300 text-sm mt-2">
                    Les deux mots de passe ne correspondent pas encore.
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={enregistrement}
                className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {enregistrement && <Loader2 size={18} className="animate-spin" />}
                {enregistrement ? 'Enregistrement…' : 'Enregistrer le mot de passe'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NouveauMotDePassePage;
