import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Mail, ArrowLeft, KeyRound, CheckCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

/**
 * « Mot de passe oublié » — l'écran qui n'existait pas.
 *
 * Avant aujourd'hui, `resetPasswordForEmail` n'apparaissait NULLE PART dans le site :
 * ni lien sous le formulaire de connexion, ni route, ni bouton dans l'espace client. Un
 * client qui oubliait son mot de passe perdait définitivement l'accès à son compte, à
 * ses commandes et à ses factures — la seule issue était d'écrire au support pour qu'un
 * administrateur intervienne en base.
 *
 * ⚠ ON NE DIT JAMAIS SI L'ADRESSE EXISTE. Répondre « compte inconnu » transformerait ce
 * formulaire en annuaire : n'importe qui pourrait vérifier une à une des adresses pour
 * savoir lesquelles sont clientes d'OMEGA. Le message de confirmation est donc le même
 * dans les deux cas — c'est aussi ce que fait Supabase côté serveur.
 */
const MotDePasseOubliePage: React.FC = () => {
  const { demanderReinitialisation } = useAuth();
  const location = useLocation();
  /* L'adresse déjà saisie sur la page de connexion est reprise : le client vient
     précisément d'échouer à se connecter avec elle, la retaper est une corvée inutile. */
  const [email, setEmail] = useState<string>(
    (location.state as { email?: string } | null)?.email || ''
  );
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState(false);

  const soumettre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (envoi) return; // anti double soumission : deux clics = deux e-mails
    const adresse = email.trim();
    if (!adresse || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adresse)) {
      toast.error('Saisissez une adresse e-mail valide.');
      return;
    }

    setEnvoi(true);
    const { error } = await demanderReinitialisation(adresse);
    setEnvoi(false);

    /* Une erreur de LIMITE D'ENVOI est la seule qu'on remonte : elle ne dit rien sur
       l'existence du compte, et elle explique au client pourquoi rien n'arrive. */
    if (error) {
      toast.error(error);
      return;
    }
    setEnvoye(true);
  };

  if (envoye) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black flex items-center justify-center pt-24 pb-12">
        <div className="container mx-auto px-6">
          <div className="max-w-md mx-auto">
            <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-8 border border-white/10 text-center">
              <div className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <CheckCircle className="text-blue-400" size={32} />
              </div>
              <h1 className="text-3xl font-bold text-white mb-2">Message envoyé</h1>
              <p className="text-gray-400 mb-6 leading-relaxed">
                Si un compte existe pour <span className="text-white">{email.trim()}</span>,
                vous venez de recevoir un lien permettant de choisir un nouveau mot de
                passe.
              </p>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-6 text-left">
                <h2 className="text-blue-400 font-semibold mb-2">Bon à savoir</h2>
                <ul className="text-gray-300 text-sm space-y-1.5">
                  <li>• Le lien n'est valable qu'une heure, et une seule fois.</li>
                  <li>• Pensez à regarder dans vos courriers indésirables.</li>
                  <li>
                    • Tant que vous n'avez pas cliqué sur le lien, votre mot de passe
                    actuel reste valable.
                  </li>
                </ul>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  to="/connexion"
                  className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 text-center"
                >
                  Retour à la connexion
                </Link>
                <button
                  type="button"
                  onClick={() => setEnvoye(false)}
                  className="flex-1 border-2 border-white/30 text-white py-3 rounded-lg font-semibold hover:bg-white/10 transition-colors"
                >
                  Renvoyer le lien
                </button>
              </div>
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
                <KeyRound className="text-blue-400" size={30} />
              </div>
              <h1 className="text-3xl font-bold text-white mb-2">Mot de passe oublié</h1>
              <p className="text-gray-400">
                Indiquez l'adresse e-mail de votre compte : nous vous enverrons un lien
                pour en choisir un nouveau.
              </p>
            </div>

            <form onSubmit={soumettre} className="space-y-6">
              <div>
                <label
                  htmlFor="email-reinitialisation"
                  className="block text-sm font-medium text-gray-300 mb-2"
                >
                  Adresse e-mail *
                </label>
                <div className="relative">
                  <Mail
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                    size={20}
                  />
                  <input
                    id="email-reinitialisation"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full bg-white/5 border border-white/20 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none"
                    placeholder="votre@email.com"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={envoi}
                className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {envoi && <Loader2 size={18} className="animate-spin" />}
                {envoi ? 'Envoi en cours…' : 'Recevoir le lien'}
              </button>
            </form>

            <div className="text-center mt-6">
              <Link
                to="/connexion"
                className="text-gray-400 hover:text-blue-400 transition-colors inline-flex items-center gap-2"
              >
                <ArrowLeft size={16} />
                Revenir à la connexion
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MotDePasseOubliePage;
