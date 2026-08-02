import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, Mail, ArrowRight, Home, User } from 'lucide-react';
import { supabase } from '../lib/supabase';

/**
 * Page d'arrivée après le clic sur le lien de confirmation reçu par e-mail.
 *
 * ⚠ Deux pièges corrigés le 2 août :
 *
 * 1. LES JETONS NE SONT PAS DANS LA QUERY STRING. Supabase renvoie ici avec un
 *    FRAGMENT (`#access_token=…&type=signup`) en flux implicite, ou `?code=…` en
 *    PKCE. L'ancienne version lisait `useSearchParams()` : elle ne trouvait donc
 *    jamais rien.
 * 2. ELLE ANNONÇAIT « CONFIRMÉ » DANS TOUS LES CAS. Faute de trouver un jeton,
 *    elle tombait dans un `else` qui affichait le succès après 1,5 s d'attente
 *    simulée — y compris sur un lien expiré. On lit maintenant l'état RÉEL de la
 *    session, et une erreur est affichée comme une erreur.
 *
 * Le client `supabase-js` consomme l'URL tout seul (`detectSessionInUrl`) et
 * établit la session : à l'arrivée ici, l'utilisateur est DÉJÀ connecté. On le
 * lui dit, au lieu de lui proposer de se connecter — ce qui donnait l'impression
 * que la confirmation n'avait servi à rien.
 */

type Etat = 'attente' | 'succes' | 'erreur';

// Les paramètres peuvent arriver dans le fragment OU la query : on regarde les deux.
function lireParams(): Record<string, string> {
  const out: Record<string, string> = {};
  const prendre = (s: string) => {
    new URLSearchParams(s.replace(/^[#?]/, '')).forEach((v, k) => { out[k] = v; });
  };
  if (typeof window !== 'undefined') {
    prendre(window.location.hash || '');
    prendre(window.location.search || '');
  }
  return out;
}

const EmailConfirmationPage: React.FC = () => {
  const navigate = useNavigate();
  const [etat, setEtat] = useState<Etat>('attente');
  const [message, setMessage] = useState('');
  const [prenom, setPrenom] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    let vivant = true;
    let minuteur: ReturnType<typeof setTimeout> | null = null;
    let desabonner: (() => void) | null = null;
    const params = lireParams();

    // Erreur explicite renvoyée par Supabase (lien expiré, déjà utilisé…).
    if (params.error || params.error_code) {
      const d = (params.error_description || '').replace(/\+/g, ' ');
      setEtat('erreur');
      setMessage(
        /expired|invalid/i.test(d + params.error_code)
          ? "Ce lien de confirmation a expiré ou a déjà été utilisé."
          : d || "La confirmation n'a pas pu aboutir."
      );
      return;
    }

    const accueillir = async (user: any) => {
      if (!vivant || !user) return false;
      const meta = user.user_metadata || {};
      let p: string = meta.first_name || '';
      if (!p && meta.full_name) p = String(meta.full_name).trim().split(' ')[0];
      if (!p) {
        // Le prénom peut n'exister que dans `profiles` (compte créé autrement).
        const { data } = await supabase
          .from('profiles')
          .select('first_name, full_name')
          .eq('id', user.id)
          .maybeSingle();
        p = (data?.first_name as string) || String(data?.full_name || '').trim().split(' ')[0] || '';
      }
      if (!vivant) return true;
      setPrenom(p);
      setEmail(user.email || '');
      setEtat('succes');
      return true;
    };

    (async () => {
      // 1) La session est peut-être déjà établie (detectSessionInUrl a fait le travail).
      const { data: s } = await supabase.auth.getSession();
      if (await accueillir(s?.session?.user)) return;

      // 2) Flux PKCE : il reste un code à échanger.
      if (params.code) {
        try {
          const { data } = await supabase.auth.exchangeCodeForSession(params.code);
          if (await accueillir(data?.session?.user)) return;
        } catch { /* on laisse la suite décider */ }
      }

      // 3) Course au démarrage : la session peut arriver juste après le montage.
      const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
        if (session?.user) accueillir(session.user);
      });
      desabonner = () => sub?.subscription?.unsubscribe();

      minuteur = setTimeout(async () => {
        if (!vivant) return;
        const { data: s2 } = await supabase.auth.getSession();
        if (!(await accueillir(s2?.session?.user)) && vivant) {
          // Adresse confirmée mais pas de session : cas du lien ouvert dans un AUTRE
          // navigateur que celui de l'inscription. Ce n'est pas un échec — il reste
          // juste à se connecter, et le dire évite de faire croire à un problème.
          setEtat('succes');
          setMessage('confirme-sans-session');
        }
      }, 2500);
    })();

    return () => {
      vivant = false;
      if (minuteur) clearTimeout(minuteur);
      if (desabonner) desabonner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sansSession = etat === 'succes' && message === 'confirme-sans-session';

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black flex items-center justify-center pt-24 pb-12">
      <div className="container mx-auto px-6">
        <div className="max-w-md mx-auto">
          <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-8 border border-white/10">
            <div className="text-center">

              {etat === 'attente' && (
                <>
                  <div className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-full p-4 w-16 h-16 mx-auto mb-4">
                    <Mail className="text-blue-400 w-8 h-8 animate-pulse" />
                  </div>
                  <h1 className="text-3xl font-bold text-white mb-2">Confirmation en cours…</h1>
                  <p className="text-gray-400">Quelques secondes, nous validons votre adresse.</p>
                </>
              )}

              {etat === 'succes' && !sansSession && (
                <>
                  <div className="bg-gradient-to-r from-green-500/20 to-blue-500/20 rounded-full p-4 w-16 h-16 mx-auto mb-4">
                    <CheckCircle className="text-green-400 w-8 h-8" />
                  </div>
                  <h1 className="text-3xl font-bold text-white mb-3">
                    Bienvenue{prenom ? ` ${prenom}` : ''} !
                  </h1>
                  <p className="text-gray-300 mb-2">
                    Votre compte a été créé et vous êtes <b className="text-green-400">automatiquement connecté</b>.
                  </p>
                  {email && <p className="text-gray-500 text-sm mb-6">{email}</p>}

                  <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 mb-6 text-left">
                    <h4 className="text-green-400 font-semibold mb-2">Ce que vous pouvez faire maintenant</h4>
                    <ul className="text-gray-300 text-sm space-y-1 list-disc list-inside">
                      <li>Suivre vos commandes et vos devis</li>
                      <li>Retrouver vos signalements envoyés depuis OMEGADMX</li>
                      <li>Échanger directement avec l'équipe</li>
                    </ul>
                  </div>

                  <div className="space-y-3">
                    <button
                      onClick={() => navigate('/compte')}
                      className="w-full bg-gradient-to-r from-green-500 to-blue-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-green-500/25 transition-all duration-300 flex items-center justify-center gap-2"
                    >
                      <User size={20} />
                      Aller à mon compte
                      <ArrowRight size={20} />
                    </button>
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

              {sansSession && (
                <>
                  <div className="bg-gradient-to-r from-green-500/20 to-blue-500/20 rounded-full p-4 w-16 h-16 mx-auto mb-4">
                    <CheckCircle className="text-green-400 w-8 h-8" />
                  </div>
                  <h1 className="text-3xl font-bold text-white mb-3">Adresse confirmée !</h1>
                  <p className="text-gray-300 mb-6">
                    Votre compte est activé. Vous avez ouvert le lien depuis un autre
                    navigateur que celui de l'inscription : il reste juste à vous connecter.
                  </p>
                  <Link
                    to="/connexion"
                    className="w-full bg-gradient-to-r from-green-500 to-blue-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-green-500/25 transition-all duration-300 flex items-center justify-center gap-2"
                  >
                    Se connecter
                    <ArrowRight size={20} />
                  </Link>
                </>
              )}

              {etat === 'erreur' && (
                <>
                  <div className="bg-gradient-to-r from-red-500/20 to-purple-600/20 rounded-full p-4 w-16 h-16 mx-auto mb-4">
                    <XCircle className="text-red-400 w-8 h-8" />
                  </div>
                  <h1 className="text-3xl font-bold text-white mb-2">Confirmation impossible</h1>
                  <p className="text-gray-400 mb-6">{message}</p>
                  <div className="flex gap-4">
                    <Link
                      to="/inscription"
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-semibold transition-colors text-center"
                    >
                      Recommencer
                    </Link>
                    <Link
                      to="/contact"
                      className="flex-1 border-2 border-white/30 text-white py-3 rounded-lg font-semibold hover:bg-white/10 transition-colors text-center"
                    >
                      Nous écrire
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
