import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  User,
  Mail,
  Phone,
  MapPin,
  Edit3,
  Save,
  X,
  Package,
  MessageSquare,
} from 'lucide-react';
import AddressManager from '../components/AddressManager';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';

interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  address: string;
  city: string;
  postal_code: string;
  country: string;
  /* Identité fiscale. ⚠ `vat_number_valid` n'est PAS modifiable par le client : un
     trigger en base le protège (sinon il suffirait de le passer à `true` pour obtenir
     0 % de TVA). Seule la fonction serveur `verifier-tva` l'écrit, après avoir
     interrogé le fichier européen VIES. */
  is_company: boolean;
  company_name: string | null;
  vat_number: string | null;
  vat_number_valid: boolean | null;
  vat_checked_at: string | null;
  vat_checked_name: string | null;
}

const AccountPage = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeTab, setActiveTab] = useState('profile');
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      loadProfile();
    }
  }, [user]);

  const loadProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user?.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading profile:', error);
        toast.error('Erreur lors du chargement du profil');
      } else {
        setProfile(
          data || {
            id: user?.id || '',
            first_name: '',
            last_name: '',
            phone: '',
            address: '',
            city: '',
            postal_code: '',
            country: 'France',
            is_company: false,
            company_name: null,
            vat_number: null,
            vat_number_valid: null,
            vat_checked_at: null,
            vat_checked_name: null,
          }
        );
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      toast.error('Erreur inattendue');
    } finally {
      setLoading(false);
    }
  };

  /* Vérification du numéro de TVA auprès du fichier européen VIES.
     ⚠ Tout se passe côté serveur : c'est le résultat de CETTE vérification qui décide
     de l'autoliquidation. S'il venait du navigateur, il suffirait de répondre « valide »
     pour ne plus payer de TVA. */
  const [verifTva, setVerifTva] = useState(false);
  const verifierTva = async () => {
    if (!profile?.vat_number) {
      toast.error('Saisissez votre numéro de TVA intracommunautaire.');
      return;
    }
    setVerifTva(true);
    try {
      /* On enregistre d'abord le statut entreprise et la raison sociale. Sans cela, un
         client pouvait vérifier son numéro puis quitter la page sans cliquer
         « Enregistrer » : le numéro était vérifié en base mais le compte restait
         « particulier », donc facturé avec TVA sans qu'on lui explique pourquoi. */
      await supabase
        .from('profiles')
        .update({
          is_company: !!profile.is_company,
          company_name: profile.company_name || null,
          vat_number: profile.vat_number,
        })
        .eq('id', user?.id);

      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verifier-tva`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ vat_number: profile.vat_number }),
        }
      );
      const j = await r.json();
      if (j.valide === true) {
        toast.success(`Numéro vérifié : ${j.nom || 'entreprise reconnue'}`);
      } else if (j.indisponible) {
        // On ne prétend pas que c'est valide : la TVA sera facturée, et on le dit.
        toast(j.motif, { icon: '⏳', duration: 8000 });
      } else {
        toast.error(j.motif || 'Numéro non reconnu.');
      }
      /* ⚠ On relit le VERDICT en base — jamais la réponse du navigateur — mais on ne
         recharge SURTOUT PAS tout le profil : « Je commande pour une entreprise » et la
         raison sociale ne sont pas encore enregistrés à cet instant. Un rechargement
         complet les écrasait par les valeurs d'avant, la case se décochait, le bloc
         entreprise disparaissait et le client perdait sa saisie sans voir aucun
         résultat. On ne rapatrie donc que les trois champs écrits par le serveur. */
      const { data: verdict } = await supabase
        .from('profiles')
        .select('vat_number_valid, vat_checked_at, vat_checked_name')
        .eq('id', user?.id)
        .single();
      if (verdict) {
        setProfile(p => (p ? { ...p, ...verdict } : p));
      }
    } catch (e) {
      toast.error('Vérification impossible pour le moment.');
    } finally {
      setVerifTva(false);
    }
  };

  const saveProfile = async () => {
    if (!profile || !user) return;

    setSaving(true);
    try {
      /* ⚠ On n'envoie PAS `vat_number_valid` / `vat_checked_*` : ces champs
         appartiennent au serveur. Le trigger les ignorerait de toute façon, mais les
         omettre ici évite de laisser croire qu'ils sont modifiables. */
      const { vat_number_valid, vat_checked_at, vat_checked_name, ...modifiable } = profile;
      const { error } = await supabase.from('profiles').upsert({
        ...modifiable,
        id: user.id,          // ⚠ APRÈS l'étalement : c'est l'identité de session qui fait foi
        updated_at: new Date().toISOString(),
      });

      if (error) {
        console.error('Error saving profile:', error);
        toast.error('Erreur lors de la sauvegarde');
      } else {
        toast.success('Profil mis à jour avec succès');
        setIsEditing(false);
        await loadProfile();
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      toast.error('Erreur inattendue');
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (field: keyof Profile, value: string) => {
    if (profile) {
      setProfile({ ...profile, [field]: value });
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24 flex items-center justify-center">
        <div className="text-center">
          <User className="text-gray-400 mx-auto mb-4" size={64} />
          <h2 className="text-2xl font-bold text-white mb-4">
            Accès non autorisé
          </h2>
          <p className="text-gray-400">
            Veuillez vous connecter pour accéder à votre compte
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24 flex items-center justify-center">
        <div className="text-white text-xl">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24">
      <div className="container mx-auto px-6 py-12">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold text-white mb-8">Mon Compte</h1>

          {/* Navigation Tabs */}
          <div className="flex flex-wrap gap-4 mb-8 border-b border-white/20">
            {[
              { id: 'profile', label: 'Profil', icon: User },
              { id: 'addresses', label: 'Adresses', icon: MapPin },
              { id: 'orders', label: 'Commandes', icon: Package },
              { id: 'messages', label: 'Messages', icon: MessageSquare },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-3 font-semibold transition-colors ${
                  activeTab === tab.id
                    ? 'text-blue-400 border-b-2 border-blue-400'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <tab.icon size={20} />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-8 border border-white/10">
            {activeTab === 'profile' && (
              <div>
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-bold text-white">
                    Informations Personnelles
                  </h2>
                  {!isEditing ? (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white px-4 py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300"
                    >
                      <Edit3 size={16} />
                      Modifier
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={saveProfile}
                        disabled={saving}
                        className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-700 transition-colors disabled:opacity-50"
                      >
                        <Save size={16} />
                        {saving ? 'Sauvegarde...' : 'Sauvegarder'}
                      </button>
                      <button
                        onClick={() => {
                          setIsEditing(false);
                          loadProfile();
                        }}
                        className="flex items-center gap-2 bg-gray-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-gray-700 transition-colors"
                      >
                        <X size={16} />
                        Annuler
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-6">
                  {/* Email (non modifiable) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      <Mail className="inline mr-2" size={16} />
                      Email
                    </label>
                    <input
                      type="email"
                      value={user.email || ''}
                      disabled
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-gray-400 cursor-not-allowed"
                    />
                  </div>

                  {/* Prénom */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Prénom
                    </label>
                    <input
                      type="text"
                      value={profile?.first_name || ''}
                      onChange={e =>
                        handleInputChange('first_name', e.target.value)
                      }
                      disabled={!isEditing}
                      className={`w-full border rounded-lg px-4 py-3 transition-colors ${
                        isEditing
                          ? 'bg-white/5 border-white/20 text-white focus:border-blue-400 focus:outline-none'
                          : 'bg-gray-700 border-gray-600 text-gray-300 cursor-not-allowed'
                      }`}
                      placeholder="Votre prénom"
                    />
                  </div>

                  {/* Nom */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Nom
                    </label>
                    <input
                      type="text"
                      value={profile?.last_name || ''}
                      onChange={e =>
                        handleInputChange('last_name', e.target.value)
                      }
                      disabled={!isEditing}
                      className={`w-full border rounded-lg px-4 py-3 transition-colors ${
                        isEditing
                          ? 'bg-white/5 border-white/20 text-white focus:border-blue-400 focus:outline-none'
                          : 'bg-gray-700 border-gray-600 text-gray-300 cursor-not-allowed'
                      }`}
                      placeholder="Votre nom"
                    />
                  </div>

                  {/* Téléphone */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      <Phone className="inline mr-2" size={16} />
                      Téléphone
                    </label>
                    <input
                      type="tel"
                      value={profile?.phone || ''}
                      onChange={e => handleInputChange('phone', e.target.value)}
                      disabled={!isEditing}
                      className={`w-full border rounded-lg px-4 py-3 transition-colors ${
                        isEditing
                          ? 'bg-white/5 border-white/20 text-white focus:border-blue-400 focus:outline-none'
                          : 'bg-gray-700 border-gray-600 text-gray-300 cursor-not-allowed'
                      }`}
                      placeholder="Votre numéro de téléphone"
                    />
                  </div>

                  {/* ── ENTREPRISE ET TVA ─────────────────────────────────────
                      Se déclarer entreprise ne donne AUCUN avantage fiscal en soi :
                      seule la vérification du numéro auprès de VIES ouvre droit à
                      l'autoliquidation. On l'écrit noir sur blanc pour éviter la
                      question « pourquoi on me facture encore la TVA ? ». */}
                  <div className="border border-white/10 rounded-lg p-4 bg-white/5">
                    <label className="flex items-center gap-3 cursor-pointer mb-1">
                      <input
                        type="checkbox"
                        checked={!!profile?.is_company}
                        onChange={e => handleInputChange('is_company', e.target.checked as never)}
                        disabled={!isEditing}
                        className="w-5 h-5 accent-blue-500"
                      />
                      <span className="text-white font-medium">
                        Je commande pour une entreprise
                      </span>
                    </label>
                    <p className="text-gray-400 text-sm ml-8">
                      Une entreprise de l'Union européenne (hors France) dont le numéro de
                      TVA est vérifié est facturée <b>sans TVA</b> (autoliquidation).
                    </p>

                    {profile?.is_company && (
                      <div className="mt-4 space-y-4 ml-8">
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">
                            Raison sociale
                          </label>
                          <input
                            type="text"
                            value={profile?.company_name || ''}
                            onChange={e => handleInputChange('company_name', e.target.value)}
                            disabled={!isEditing}
                            className={`w-full border rounded-lg px-4 py-3 transition-colors ${
                              isEditing
                                ? 'bg-white/5 border-white/20 text-white focus:border-blue-400 focus:outline-none'
                                : 'bg-gray-700 border-gray-600 text-gray-300 cursor-not-allowed'
                            }`}
                            placeholder="Nom de votre société"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">
                            N° de TVA intracommunautaire
                          </label>
                          <div className="flex flex-wrap gap-2">
                            <input
                              type="text"
                              value={profile?.vat_number || ''}
                              onChange={e =>
                                handleInputChange('vat_number', e.target.value.toUpperCase())
                              }
                              disabled={!isEditing}
                              className={`flex-1 min-w-[220px] border rounded-lg px-4 py-3 font-mono transition-colors ${
                                isEditing
                                  ? 'bg-white/5 border-white/20 text-white focus:border-blue-400 focus:outline-none'
                                  : 'bg-gray-700 border-gray-600 text-gray-300 cursor-not-allowed'
                              }`}
                              placeholder="DE123456789"
                            />
                            <button
                              type="button"
                              onClick={verifierTva}
                              disabled={verifTva || !profile?.vat_number}
                              className="px-4 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold transition"
                            >
                              {verifTva ? 'Vérification…' : 'Vérifier'}
                            </button>
                          </div>

                          {/* État RÉEL, écrit par le serveur — jamais une supposition. */}
                          {profile?.vat_number_valid === true && (
                            <p className="mt-2 text-emerald-300 text-sm">
                              ✓ Numéro vérifié
                              {profile.vat_checked_name ? ` — ${profile.vat_checked_name}` : ''}
                              {profile.vat_checked_at
                                ? ` (le ${new Date(profile.vat_checked_at).toLocaleDateString('fr-FR')})`
                                : ''}
                            </p>
                          )}
                          {profile?.vat_number_valid === false && (
                            <p className="mt-2 text-red-300 text-sm">
                              ✗ Numéro non reconnu par le service européen VIES. La TVA sera facturée.
                            </p>
                          )}
                          {profile?.vat_number && profile?.vat_number_valid == null && (
                            <p className="mt-2 text-amber-300 text-sm">
                              Numéro pas encore vérifié — cliquez sur « Vérifier ». Tant qu'il ne
                              l'est pas, la TVA est facturée.
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Ville et Code postal */}
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Ville
                      </label>
                      <input
                        type="text"
                        value={profile?.city || ''}
                        onChange={e =>
                          handleInputChange('city', e.target.value)
                        }
                        disabled={!isEditing}
                        className={`w-full border rounded-lg px-4 py-3 transition-colors ${
                          isEditing
                            ? 'bg-white/5 border-white/20 text-white focus:border-blue-400 focus:outline-none'
                            : 'bg-gray-700 border-gray-600 text-gray-300 cursor-not-allowed'
                        }`}
                        placeholder="Votre ville"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Code postal
                      </label>
                      <input
                        type="text"
                        value={profile?.postal_code || ''}
                        onChange={e =>
                          handleInputChange('postal_code', e.target.value)
                        }
                        disabled={!isEditing}
                        className={`w-full border rounded-lg px-4 py-3 transition-colors ${
                          isEditing
                            ? 'bg-white/5 border-white/20 text-white focus:border-blue-400 focus:outline-none'
                            : 'bg-gray-700 border-gray-600 text-gray-300 cursor-not-allowed'
                        }`}
                        placeholder="Code postal"
                      />
                    </div>
                  </div>

                  {/* Pays */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Pays
                    </label>
                    <input
                      type="text"
                      value={profile?.country || ''}
                      onChange={e =>
                        handleInputChange('country', e.target.value)
                      }
                      disabled={!isEditing}
                      className={`w-full border rounded-lg px-4 py-3 transition-colors ${
                        isEditing
                          ? 'bg-white/5 border-white/20 text-white focus:border-blue-400 focus:outline-none'
                          : 'bg-gray-700 border-gray-600 text-gray-300 cursor-not-allowed'
                      }`}
                      placeholder="Votre pays"
                    />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'addresses' && <AddressManager />}

            {activeTab === 'orders' && (
              <div className="text-center py-12">
                <Package className="text-gray-400 mx-auto mb-4" size={48} />
                <h3 className="text-xl font-bold text-white mb-2">
                  Mes Commandes
                </h3>
                <p className="text-gray-400 mb-6">
                  Consultez l'historique de vos commandes
                </p>
                <Link
                  to="/commandes"
                  className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-full font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300"
                >
                  Voir mes commandes
                </Link>
              </div>
            )}

            {activeTab === 'messages' && (
              <div className="text-center py-12">
                <MessageSquare
                  className="text-gray-400 mx-auto mb-4"
                  size={48}
                />
                <h3 className="text-xl font-bold text-white mb-2">
                  Mes Messages
                </h3>
                <p className="text-gray-400 mb-6">
                  Consultez vos échanges avec notre équipe
                </p>
                <Link
                  to="/mes-messages"
                  className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-full font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300"
                >
                  Voir mes messages
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountPage;
