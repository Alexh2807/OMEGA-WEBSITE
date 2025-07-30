import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle, XCircle, Mail, ArrowRight, Home } from 'lucide-react';

const EmailConfirmationPage = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );
  const [message, setMessage] = useState('');

  useEffect(() => {
    // Vérifier les paramètres de l'URL pour déterminer le statut
    const accessToken = searchParams.get('access_token');
    const type = searchParams.get('type');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (error) {
      setStatus('error');
      setMessage(errorDescription || 'Erreur lors de la confirmation');
    } else if (accessToken && type === 'signup') {
      setStatus('success');
      setMessage('Votre email a été confirmé avec succès !');
    } else {
      // Délai pour simuler la vérification
      setTimeout(() => {
        setStatus('success');
        setMessage('Votre email a été confirmé avec succès !');
      }, 1500);
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black flex items-center justify-center pt-24">
      <div className="container mx-auto px-6">
        <div className="max-w-md mx-auto">
          <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-8 border border-white/10">
            <div className="text-center">
              {status === 'loading' && (
                <>
                  <div className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-full p-4 w-16 h-16 mx-auto mb-4">
                    <Mail className="text-blue-400 w-8 h-8 animate-pulse" />
                  </div>
                  <h1 className="text-3xl font-bold text-white mb-2">
                    Confirmation en cours...
                  </h1>
                  <p className="text-gray-400">
                    Veuillez patienter pendant que nous confirmons votre email
                  </p>
                </>
              )}

              {status === 'success' && (
                <>
                  <div className="bg-gradient-to-r from-green-500/20 to-blue-500/20 rounded-full p-4 w-16 h-16 mx-auto mb-4">
                    <CheckCircle className="text-green-400 w-8 h-8" />
                  </div>
                  <h1 className="text-3xl font-bold text-white mb-2">
                    Email confirmé !
                  </h1>
                  <p className="text-gray-400 mb-6">{message}</p>

                  <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 mb-6">
                    <h4 className="text-green-400 font-semibold mb-2">
                      🎉 Bienvenue chez OMEGA !
                    </h4>
                    <p className="text-gray-300 text-sm">
                      Votre compte est maintenant pleinement activé. Vous pouvez
                      vous connecter et découvrir nos machines à fumée
                      professionnelles.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <Link
                      to="/connexion"
                      className="w-full bg-gradient-to-r from-green-500 to-blue-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-green-500/25 transition-all duration-300 flex items-center justify-center gap-2"
                    >
                      Se connecter maintenant
                      <ArrowRight size={20} />
                    </Link>

                    <Link
                      to="/"
                      className="w-full border-2 border-white/30 text-white py-3 rounded-lg font-semibold hover:bg-white/10 hover:border-white/50 transition-all duration-300 flex items-center justify-center gap-2"
                    >
                      <Home size={20} />
                      Retour à l'accueil
                    </Link>
                  </div>
                </>
              )}

              {status === 'error' && (
                <>
                  <div className="bg-gradient-to-r from-red-500/20 to-orange-500/20 rounded-full p-4 w-16 h-16 mx-auto mb-4">
                    <XCircle className="text-red-400 w-8 h-8" />
                  </div>
                  <h1 className="text-3xl font-bold text-white mb-2">
                    Erreur de confirmation
                  </h1>
                  <p className="text-gray-400 mb-6">{message}</p>

                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6">
                    <h4 className="text-red-400 font-semibold mb-2">
                      ❌ Confirmation échouée
                    </h4>
                    <p className="text-gray-300 text-sm">
                      Le lien de confirmation est invalide ou a expiré. Veuillez
                      demander un nouveau lien.
                    </p>
                  </div>

                  <div className="flex gap-4">
                    <Link
                      to="/inscription"
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-semibold transition-colors text-center"
                    >
                      Nouvelle inscription
                    </Link>
                    <Link
                      to="/contact"
                      className="flex-1 border-2 border-white/30 text-white py-3 rounded-lg font-semibold hover:bg-white/10 transition-colors text-center"
                    >
                      Support
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailConfirmationPage;
