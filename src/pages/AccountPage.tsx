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

  const saveProfile = async () => {
    if (!profile || !user) return;

    setSaving(true);
    try {
      const { error } = await supabase.from('profiles').upsert({
        id: user.id,
        ...profile,
        updated_at: new Date().toISOString(),
      });

      if (error) {
        console.error('Error saving profile:', error);
        toast.error('Erreur lors de la sauvegarde');
      } else {
        toast.success('Profil mis à jour avec succès');
        setIsEditing(false);
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
                    ? 'text-yellow-400 border-b-2 border-yellow-400'
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
