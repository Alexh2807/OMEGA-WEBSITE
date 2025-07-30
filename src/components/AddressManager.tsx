import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  MapPin,
  Plus,
  Edit3,
  Trash2,
  Check,
  X,
  Home,
  Building,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface ShippingAddress {
  id: string;
  name: string;
  first_name: string;
  last_name: string;
  company?: string;
  address_line_1: string;
  address_line_2?: string;
  city: string;
  postal_code: string;
  country: string;
  phone?: string;
  is_default: boolean;
}

interface AddressManagerProps {
  onAddressSelect?: (address: ShippingAddress) => void;
  selectedAddressId?: string;
  showSelection?: boolean;
}

const AddressManager: React.FC<AddressManagerProps> = ({
  onAddressSelect,
  selectedAddressId,
  showSelection = false,
}) => {
  const { user } = useAuth();
  const [addresses, setAddresses] = useState<ShippingAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingAddress, setEditingAddress] = useState<ShippingAddress | null>(
    null
  );
  const [formData, setFormData] = useState({
    name: '',
    first_name: '',
    last_name: '',
    company: '',
    address_line_1: '',
    address_line_2: '',
    city: '',
    postal_code: '',
    country: 'France',
    phone: '',
    is_default: false,
  });

  useEffect(() => {
    if (user) {
      loadAddresses();
    }
  }, [user]);

  const loadAddresses = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('shipping_addresses')
        .select('*')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading addresses:', error);
        toast.error('Erreur lors du chargement des adresses');
      } else {
        setAddresses(data || []);
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      toast.error('Erreur inattendue');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      if (editingAddress) {
        // Mise à jour
        const { error } = await supabase
          .from('shipping_addresses')
          .update(formData)
          .eq('id', editingAddress.id);

        if (error) {
          console.error('Error updating address:', error);
          toast.error('Erreur lors de la mise à jour');
        } else {
          toast.success('Adresse mise à jour avec succès');
          resetForm();
          loadAddresses();
        }
      } else {
        // Création
        const { error } = await supabase.from('shipping_addresses').insert({
          ...formData,
          user_id: user.id,
        });

        if (error) {
          console.error('Error creating address:', error);
          toast.error('Erreur lors de la création');
        } else {
          toast.success('Adresse ajoutée avec succès');
          resetForm();
          loadAddresses();
        }
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      toast.error('Erreur inattendue');
    }
  };

  const handleDelete = async (addressId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette adresse ?')) return;

    try {
      const { error } = await supabase
        .from('shipping_addresses')
        .delete()
        .eq('id', addressId);

      if (error) {
        console.error('Error deleting address:', error);
        toast.error('Erreur lors de la suppression');
      } else {
        toast.success('Adresse supprimée avec succès');
        loadAddresses();
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      toast.error('Erreur inattendue');
    }
  };

  const handleSetDefault = async (addressId: string) => {
    try {
      const { error } = await supabase
        .from('shipping_addresses')
        .update({ is_default: true })
        .eq('id', addressId);

      if (error) {
        console.error('Error setting default:', error);
        toast.error('Erreur lors de la mise à jour');
      } else {
        toast.success('Adresse par défaut mise à jour');
        loadAddresses();
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      toast.error('Erreur inattendue');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      first_name: '',
      last_name: '',
      company: '',
      address_line_1: '',
      address_line_2: '',
      city: '',
      postal_code: '',
      country: 'France',
      phone: '',
      is_default: false,
    });
    setEditingAddress(null);
    setShowForm(false);
  };

  const startEdit = (address: ShippingAddress) => {
    setFormData({
      name: address.name,
      first_name: address.first_name,
      last_name: address.last_name,
      company: address.company || '',
      address_line_1: address.address_line_1,
      address_line_2: address.address_line_2 || '',
      city: address.city,
      postal_code: address.postal_code,
      country: address.country,
      phone: address.phone || '',
      is_default: address.is_default,
    });
    setEditingAddress(address);
    setShowForm(true);
  };

  if (loading) {
    return <div className="text-white">Chargement des adresses...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-white flex items-center gap-2">
          <MapPin className="text-blue-400" size={24} />
          Mes Adresses de Livraison
        </h3>
        <button
          onClick={() => setShowForm(true)}
          className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-4 py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 flex items-center gap-2"
        >
          <Plus size={16} />
          Ajouter
        </button>
      </div>

      {/* Liste des adresses */}
      <div className="grid gap-4">
        {addresses.map(address => (
          <div
            key={address.id}
            className={`bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-lg p-4 border transition-all duration-300 ${
              showSelection && selectedAddressId === address.id
                ? 'border-blue-400 bg-blue-400/10'
                : 'border-white/10 hover:border-white/20'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  {address.company ? (
                    <Building className="text-blue-400" size={16} />
                  ) : (
                    <Home className="text-green-400" size={16} />
                  )}
                  <span className="text-white font-semibold">
                    {address.name}
                  </span>
                  {address.is_default && (
                    <span className="bg-green-500 text-white px-2 py-1 rounded-full text-xs font-medium">
                      Par défaut
                    </span>
                  )}
                </div>

                <div className="text-gray-300 text-sm space-y-1">
                  <div>
                    {address.first_name} {address.last_name}
                  </div>
                  {address.company && <div>{address.company}</div>}
                  <div>{address.address_line_1}</div>
                  {address.address_line_2 && (
                    <div>{address.address_line_2}</div>
                  )}
                  <div>
                    {address.postal_code} {address.city}
                  </div>
                  <div>{address.country}</div>
                  {address.phone && <div>Tél: {address.phone}</div>}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {showSelection && (
                  <button
                    onClick={() => onAddressSelect?.(address)}
                    className={`p-2 rounded-lg transition-colors ${
                      selectedAddressId === address.id
                        ? 'bg-blue-400 text-white'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    <Check size={16} />
                  </button>
                )}

                {!address.is_default && (
                  <button
                    onClick={() => handleSetDefault(address.id)}
                    className="p-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
                    title="Définir par défaut"
                  >
                    <Check size={16} />
                  </button>
                )}

                <button
                  onClick={() => startEdit(address)}
                  className="p-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
                >
                  <Edit3 size={16} />
                </button>

                <button
                  onClick={() => handleDelete(address.id)}
                  className="p-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {addresses.length === 0 && (
        <div className="text-center py-8">
          <MapPin className="text-gray-400 mx-auto mb-4" size={48} />
          <h4 className="text-white font-semibold mb-2">Aucune adresse</h4>
          <p className="text-gray-400 mb-4">
            Ajoutez votre première adresse de livraison
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-full font-semibold"
          >
            Ajouter une adresse
          </button>
        </div>
      )}

      {/* Formulaire d'ajout/modification */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 border border-white/10 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-white">
                {editingAddress ? "Modifier l'adresse" : 'Nouvelle adresse'}
              </h3>
              <button
                onClick={resetForm}
                className="text-gray-400 hover:text-white transition-colors text-2xl"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Nom de l'adresse *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-yellow-400 focus:outline-none"
                  placeholder="Ex: Domicile, Bureau..."
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Prénom *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.first_name}
                    onChange={e =>
                      setFormData({ ...formData, first_name: e.target.value })
                    }
                    className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-yellow-400 focus:outline-none"
                    placeholder="Prénom"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Nom *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.last_name}
                    onChange={e =>
                      setFormData({ ...formData, last_name: e.target.value })
                    }
                    className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-yellow-400 focus:outline-none"
                    placeholder="Nom"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Entreprise (optionnel)
                </label>
                <input
                  type="text"
                  value={formData.company}
                  onChange={e =>
                    setFormData({ ...formData, company: e.target.value })
                  }
                  className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-yellow-400 focus:outline-none"
                  placeholder="Nom de l'entreprise"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Adresse *
                </label>
                <input
                  type="text"
                  required
                  value={formData.address_line_1}
                  onChange={e =>
                    setFormData({ ...formData, address_line_1: e.target.value })
                  }
                  className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-yellow-400 focus:outline-none"
                  placeholder="Numéro et nom de rue"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Complément d'adresse (optionnel)
                </label>
                <input
                  type="text"
                  value={formData.address_line_2}
                  onChange={e =>
                    setFormData({ ...formData, address_line_2: e.target.value })
                  }
                  className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-yellow-400 focus:outline-none"
                  placeholder="Appartement, étage, bâtiment..."
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Code postal *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.postal_code}
                    onChange={e =>
                      setFormData({ ...formData, postal_code: e.target.value })
                    }
                    className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-yellow-400 focus:outline-none"
                    placeholder="Code postal"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Ville *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.city}
                    onChange={e =>
                      setFormData({ ...formData, city: e.target.value })
                    }
                    className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-yellow-400 focus:outline-none"
                    placeholder="Ville"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Pays *
                  </label>
                  <select
                    required
                    value={formData.country}
                    onChange={e =>
                      setFormData({ ...formData, country: e.target.value })
                    }
                    className="w-full dark-select rounded-lg px-4 py-3 focus:border-yellow-400 focus:outline-none"
                  >
                    <option value="France">France</option>
                    <option value="Belgique">Belgique</option>
                    <option value="Suisse">Suisse</option>
                    <option value="Luxembourg">Luxembourg</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Téléphone (optionnel)
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={e =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
                    className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-yellow-400 focus:outline-none"
                    placeholder="Numéro de téléphone"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="is_default"
                  checked={formData.is_default}
                  onChange={e =>
                    setFormData({ ...formData, is_default: e.target.checked })
                  }
                  className="w-4 h-4 text-yellow-400 bg-white/5 border-white/20 rounded focus:ring-yellow-400"
                />
                <label htmlFor="is_default" className="text-gray-300">
                  Définir comme adresse par défaut
                </label>
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300"
                >
                  {editingAddress ? 'Mettre à jour' : "Ajouter l'adresse"}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-6 border-2 border-white/30 text-white rounded-lg font-semibold hover:bg-white/10 hover:border-white/50 transition-all duration-300"
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AddressManager;
