import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { useAuth, traduireErreurAuth } from '../contexts/AuthContext';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  User,
  Phone,
  Shield,
  ChevronDown,
} from 'lucide-react';
import toast from 'react-hot-toast';

const loginSchema = yup.object({
  email: yup.string().email('Email invalide').required('Email requis'),
  password: yup
    .string()
    .min(6, 'Mot de passe trop court')
    .required('Mot de passe requis'),
});

const registerSchema = yup.object({
  firstName: yup.string().required('Prénom requis'),
  lastName: yup.string().required('Nom requis'),
  countryCode: yup.string().required('Code pays requis'),
  phone: yup
    .string()
    .matches(/^[0-9\s]{8,14}$/, 'Numéro de téléphone invalide (8-10 chiffres)')
    .required('Téléphone requis'),
  email: yup.string().email('Email invalide').required('Email requis'),
  password: yup
    .string()
    .min(6, 'Mot de passe trop court')
    .required('Mot de passe requis'),
  confirmPassword: yup
    .string()
    .oneOf([yup.ref('password')], 'Les mots de passe ne correspondent pas')
    .required('Confirmation requise'),
});

/* Le formulaire sert DEUX schémas différents (connexion et inscription) selon la page.
   TypeScript, lui, ne voit qu'un seul `useForm` : il déduisait donc le type du schéma de
   connexion, et considérait `firstName`, `phone` ou `countryCode` comme inexistants —
   une vingtaine d'erreurs de compilation, qui empêchaient d'activer la vérification de
   types dans le build (c'est précisément ce qui a laissé passer en production cinq
   variables non déclarées ailleurs dans le code).
   On déclare donc l'union des deux jeux de champs : les champs propres à l'inscription
   sont optionnels au sens du type, et c'est `yup` qui les rend obligatoires à
   l'exécution, sur la seule page d'inscription. */
type ChampsFormulaireAuth = {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  countryCode?: string;
  phone?: string;
  confirmPassword?: string;
};

interface AuthPageProps {
  mode: 'login' | 'register';
}

const AuthPage: React.FC<AuthPageProps> = ({ mode }) => {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  /* PAGE D'ORIGINE. `navigate('/')` était systématique : un client qui cliquait
     « Passer la commande » depuis son panier, se connectait, puis se retrouvait sur la
     page d'accueil devait refaire tout le chemin — et beaucoup abandonnaient là.
     Les pages qui exigent une connexion transmettent leur adresse dans `location.state`
     (voir CartPage) ; à défaut, l'accueil.
     ⚠ On n'accepte QU'un chemin interne commençant par « / » et pas « // » : une valeur
     venue de l'extérieur pourrait sinon nous faire rebondir vers un autre site. */
  const etat = location.state as { from?: string } | null;
  /* Les pages du parcours d'authentification sont exclues : y revenir après s'être
     connecté renverrait le client sur un formulaire de connexion. */
  const PAGES_AUTH = ['/connexion', '/inscription', '/mot-de-passe-oublie', '/nouveau-mot-de-passe'];
  const retour =
    etat?.from &&
    /^\/(?!\/)/.test(etat.from) &&
    !PAGES_AUTH.some(p => etat.from!.startsWith(p))
      ? etat.from
      : '/';

  const countryCodes = [
    { code: '+33', country: 'France', flag: '🇫🇷' },
    { code: '+32', country: 'Belgique', flag: '🇧🇪' },
    { code: '+41', country: 'Suisse', flag: '🇨🇭' },
    { code: '+352', country: 'Luxembourg', flag: '🇱🇺' },
    { code: '+1', country: 'États-Unis', flag: '🇺🇸' },
    { code: '+44', country: 'Royaume-Uni', flag: '🇬🇧' },
    { code: '+49', country: 'Allemagne', flag: '🇩🇪' },
    { code: '+34', country: 'Espagne', flag: '🇪🇸' },
    { code: '+39', country: 'Italie', flag: '🇮🇹' },
  ];

  const schema = mode === 'login' ? loginSchema : registerSchema;
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
  } = useForm<ChampsFormulaireAuth>({
    // `yup` ne peut pas décrire l'union des deux schémas : on assume la conversion ici,
    // en un seul point, plutôt que de la disséminer sur chaque champ.
    resolver: yupResolver(schema) as never,
    defaultValues: {
      countryCode: '+33',
    },
  });

  const selectedCountryCode = watch('countryCode');
  const phoneValue = watch('phone');

  const formatPhoneNumber = (value: string, countryCode: string) => {
    // Supprimer tous les caractères non numériques
    const numbers = value.replace(/\D/g, '');

    // Formater selon le code pays
    if (countryCode === '+33') {
      // Format français: 06 12 34 56 78
      // Accepter les numéros commençant par 0 ou sans le 0
      let cleanNumbers = numbers;
      if (cleanNumbers.startsWith('0')) {
        cleanNumbers = cleanNumbers.slice(1);
      }

      // Limiter à 9 chiffres pour la France (sans le 0 initial)
      cleanNumbers = cleanNumbers.slice(0, 9);

      if (cleanNumbers.length === 0) return '';
      if (cleanNumbers.length <= 1) return cleanNumbers;
      if (cleanNumbers.length <= 3)
        return `${cleanNumbers.slice(0, 1)} ${cleanNumbers.slice(1)}`;
      if (cleanNumbers.length <= 5)
        return `${cleanNumbers.slice(0, 1)} ${cleanNumbers.slice(1, 3)} ${cleanNumbers.slice(3)}`;
      if (cleanNumbers.length <= 7)
        return `${cleanNumbers.slice(0, 1)} ${cleanNumbers.slice(1, 3)} ${cleanNumbers.slice(3, 5)} ${cleanNumbers.slice(5)}`;
      return `${cleanNumbers.slice(0, 1)} ${cleanNumbers.slice(1, 3)} ${cleanNumbers.slice(3, 5)} ${cleanNumbers.slice(5, 7)} ${cleanNumbers.slice(7)}`;
    }

    // Format par défaut pour les autres pays
    return numbers;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const formatted = formatPhoneNumber(value, selectedCountryCode || '+33');
    setValue('phone', formatted);
  };

  const getFullPhoneNumber = (countryCode: string, phone: string) => {
    const cleanPhone = phone.replace(/\D/g, '');

    if (countryCode === '+33') {
      // Pour la France, s'assurer qu'on a le bon format
      let frenchNumber = cleanPhone;
      if (!frenchNumber.startsWith('0') && frenchNumber.length === 9) {
        frenchNumber = '0' + frenchNumber;
      }
      return `${countryCode}${frenchNumber.startsWith('0') ? frenchNumber.slice(1) : frenchNumber}`;
    }

    return `${countryCode}${cleanPhone}`;
  };

  const onSubmit = async (data: any) => {
    setLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await signIn(data.email, data.password);
        if (error) {
          /* ⚠ Le message de Supabase arrive EN ANGLAIS : « Invalid login credentials »,
             « Email not confirmed »… Affiché tel quel, il ne dit rien au client et ne
             lui indique surtout pas quoi faire. On traduit ET on oriente. */
          toast.error(traduireErreurAuth(error.message), { duration: 7000 });
        } else {
          toast.success('Connexion réussie !');
          navigate(retour, { replace: true });
        }
      } else {
        // Inscription avec Supabase
        const fullName = `${data.firstName} ${data.lastName}`;
        const fullPhoneNumber = getFullPhoneNumber(
          data.countryCode,
          data.phone
        );

        const { data: authData, error } = await signUp(
          data.email,
          data.password,
          fullName,
          fullPhoneNumber
        );

        if (error) {
          toast.error(traduireErreurAuth(error.message), { duration: 7000 });
        } else {
          setEmailSent(true);
          toast.success('Inscription réussie ! Vérifiez votre email.');
        }
      }
    } catch (error) {
      toast.error('Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  // Si l'email a été envoyé, afficher la page de confirmation
  if (emailSent) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black flex items-center justify-center pt-24">
        <div className="container mx-auto px-6">
          <div className="max-w-md mx-auto">
            <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-8 border border-white/10">
              <div className="text-center">
                <div className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-full p-4 w-16 h-16 mx-auto mb-4">
                  <Mail className="text-blue-400 w-8 h-8" />
                </div>
                <h1 className="text-3xl font-bold text-white mb-2">
                  Vérifiez votre email
                </h1>
                <p className="text-gray-400 mb-6">
                  Un email de confirmation a été envoyé à votre adresse. Cliquez
                  sur le lien pour activer votre compte.
                </p>

                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-6">
                  <h4 className="text-blue-400 font-semibold mb-2">
                    📧 Prochaines étapes
                  </h4>
                  <ol className="text-gray-300 text-sm space-y-2 text-left">
                    <li>1. Consultez votre boîte email</li>
                    <li>2. Cliquez sur le lien de confirmation</li>
                    <li>3. Votre compte sera activé automatiquement</li>
                  </ol>
                </div>

                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-6">
                  <h4 className="text-blue-400 font-semibold mb-2">
                    ⚠️ Important
                  </h4>
                  <p className="text-gray-300 text-sm">
                    Vérifiez aussi vos spams. Le lien expire dans 24 heures.
                  </p>
                </div>

                <div className="flex gap-4">
                  <Link
                    to="/connexion"
                    className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 text-center"
                  >
                    Se connecter
                  </Link>
                  <Link
                    to="/contact"
                    className="flex-1 border-2 border-white/30 text-white py-3 rounded-lg font-semibold hover:bg-white/10 transition-colors text-center"
                  >
                    Support
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black flex items-center justify-center pt-24">
      <div className="container mx-auto px-6">
        <div className="max-w-md mx-auto">
          <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-8 border border-white/10">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-white mb-2">
                {mode === 'login' ? 'Connexion' : 'Inscription'}
              </h1>
              <p className="text-gray-400">
                {mode === 'login'
                  ? 'Connectez-vous à votre compte OMEGA'
                  : 'Créez votre compte OMEGA'}
              </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {mode === 'register' && (
                <>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Prénom *
                      </label>
                      <div className="relative">
                        <User
                          className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                          size={20}
                        />
                        <input
                          {...register('firstName')}
                          type="text"
                          className="w-full bg-white/5 border border-white/20 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none"
                          placeholder="Votre prénom"
                        />
                      </div>
                      {errors.firstName && (
                        <p className="text-red-400 text-sm mt-1">
                          {errors.firstName.message}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Nom *
                      </label>
                      <input
                        {...register('lastName')}
                        type="text"
                        className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none"
                        placeholder="Votre nom"
                      />
                      {errors.lastName && (
                        <p className="text-red-400 text-sm mt-1">
                          {errors.lastName.message}
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Téléphone *
                    </label>
                    <div className="flex gap-2">
                      {/* Sélecteur de code pays */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() =>
                            setShowCountryDropdown(!showCountryDropdown)
                          }
                          className="bg-white/5 border border-white/20 rounded-lg px-3 py-3 text-white hover:bg-white/10 transition-colors flex items-center gap-2 min-w-[100px]"
                        >
                          <span>
                            {
                              countryCodes.find(
                                c => c.code === selectedCountryCode
                              )?.flag
                            }
                          </span>
                          <span className="text-sm">{selectedCountryCode}</span>
                          <ChevronDown size={16} className="text-gray-400" />
                        </button>

                        {showCountryDropdown && (
                          <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-white/20 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                            {countryCodes.map(country => (
                              <button
                                key={country.code}
                                type="button"
                                onClick={() => {
                                  setValue('countryCode', country.code);
                                  setShowCountryDropdown(false);
                                }}
                                className="w-full px-4 py-3 text-left hover:bg-white/10 transition-colors flex items-center gap-3 text-white"
                              >
                                <span>{country.flag}</span>
                                <span className="text-sm">{country.code}</span>
                                <span className="text-sm text-gray-400">
                                  {country.country}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Champ numéro de téléphone */}
                      <div className="flex-1 relative">
                        <Phone
                          className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                          size={20}
                        />
                        <input
                          {...register('phone')}
                          type="tel"
                          onChange={handlePhoneChange}
                          className="w-full bg-white/5 border border-white/20 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none"
                          placeholder="6 12 34 56 78"
                        />
                      </div>
                    </div>
                    {errors.phone && (
                      <p className="text-red-400 text-sm mt-1">
                        {errors.phone.message}
                      </p>
                    )}
                    {errors.countryCode && (
                      <p className="text-red-400 text-sm mt-1">
                        {errors.countryCode.message}
                      </p>
                    )}
                    <p className="text-gray-400 text-xs mt-1">
                      Numéro complet:{' '}
                      {getFullPhoneNumber(
                        selectedCountryCode || '+33',
                        phoneValue || ''
                      )}
                    </p>
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Email *
                </label>
                <div className="relative">
                  <Mail
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                    size={20}
                  />
                  <input
                    {...register('email')}
                    type="email"
                    className="w-full bg-white/5 border border-white/20 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none"
                    placeholder="votre@email.com"
                  />
                </div>
                {errors.email && (
                  <p className="text-red-400 text-sm mt-1">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Mot de passe *
                </label>
                <div className="relative">
                  <Lock
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                    size={20}
                  />
                  <input
                    {...register('password')}
                    type={showPassword ? 'text' : 'password'}
                    className="w-full bg-white/5 border border-white/20 rounded-lg pl-10 pr-12 py-3 text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none"
                    placeholder="Votre mot de passe"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-red-400 text-sm mt-1">
                    {errors.password.message}
                  </p>
                )}

                {/* ★ LE LIEN QUI MANQUAIT. Sans lui, un client qui oubliait son mot de
                    passe n'avait AUCUN moyen de revenir dans son compte : ni ici, ni
                    dans l'espace client, ni ailleurs sur le site.
                    L'adresse déjà tapée est transmise à la page suivante — l'oubli du
                    mot de passe n'est pas une raison de retaper son e-mail. */}
                {mode === 'login' && (
                  <div className="text-right mt-2">
                    <Link
                      to="/mot-de-passe-oublie"
                      state={{ email: watch('email') || '' }}
                      className="text-sm text-blue-400 hover:text-blue-300 font-medium"
                    >
                      Mot de passe oublié ?
                    </Link>
                  </div>
                )}
              </div>

              {mode === 'register' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Confirmer le mot de passe *
                  </label>
                  <div className="relative">
                    <Lock
                      className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                      size={20}
                    />
                    <input
                      {...register('confirmPassword')}
                      type={showPassword ? 'text' : 'password'}
                      className="w-full bg-white/5 border border-white/20 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none"
                      placeholder="Confirmez votre mot de passe"
                    />
                  </div>
                  {errors.confirmPassword && (
                    <p className="text-red-400 text-sm mt-1">
                      {errors.confirmPassword.message}
                    </p>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 disabled:opacity-50"
              >
                {loading
                  ? 'Chargement...'
                  : mode === 'login'
                    ? 'Se connecter'
                    : "S'inscrire"}
              </button>
            </form>

            <div className="text-center mt-6">
              <p className="text-gray-400">
                {mode === 'login'
                  ? 'Pas encore de compte ?'
                  : 'Déjà un compte ?'}{' '}
                <Link
                  to={mode === 'login' ? '/inscription' : '/connexion'}
                  className="text-purple-400 hover:text-purple-300 font-medium"
                >
                  {mode === 'login' ? "S'inscrire" : 'Se connecter'}
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
