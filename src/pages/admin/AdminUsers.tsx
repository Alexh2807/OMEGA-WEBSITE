import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Filter,
  Edit3,
  Trash2,
  UserPlus,
  Mail,
  Shield,
  MoreVertical,
  Eye,
  RefreshCw,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

interface User {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
  last_sign_in_at: string;
  role: string;
  profile: any;
}

const AdminUsers = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        toast.error('Session expirée');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users`,
        {
          headers: {
            Authorization: `Bearer ${session.session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Erreur lors du chargement des utilisateurs');
      }

      const data = await response.json();
      setUsers(data.users || []);
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors du chargement des utilisateurs');
    } finally {
      setLoading(false);
    }
  };

  const updateUserRole = async (userId: string, newRole: string) => {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        toast.error('Session expirée');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId, role: newRole }),
        }
      );

      if (!response.ok) {
        throw new Error('Erreur lors de la mise à jour');
      }

      toast.success('Rôle mis à jour avec succès');
      loadUsers();
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors de la mise à jour du rôle');
    }
  };

  const deleteUser = async (userId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet utilisateur ?'))
      return;

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        toast.error('Session expirée');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-delete-user`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId }),
        }
      );

      if (!response.ok) {
        throw new Error('Erreur lors de la suppression');
      }

      toast.success('Utilisateur supprimé avec succès');
      loadUsers();
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        toast.error('Session expirée');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-reset-password`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email }),
        }
      );

      if (!response.ok) {
        throw new Error("Erreur lors de l'envoi");
      }

      toast.success('Email de réinitialisation envoyé');
    } catch (error) {
      console.error('Erreur:', error);
      toast.error("Erreur lors de l'envoi de l'email");
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch =
      user.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return (
          <span className="bg-red-500/20 text-red-400 px-2 py-1 rounded-full text-xs font-medium">
            Admin
          </span>
        );
      case 'customer':
        return (
          <span className="bg-blue-500/20 text-blue-400 px-2 py-1 rounded-full text-xs font-medium">
            Client
          </span>
        );
      default:
        return (
          <span className="bg-gray-500/20 text-gray-400 px-2 py-1 rounded-full text-xs font-medium">
            Inconnu
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-white text-xl">Chargement des utilisateurs...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
            <Users className="text-blue-400" size={32} />
            Gestion des Utilisateurs
          </h1>
          <p className="text-gray-400">
            Gérez les comptes utilisateurs et leurs permissions
          </p>
        </div>
        <button
          onClick={loadUsers}
          className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 flex items-center gap-2"
        >
          <RefreshCw size={16} />
          Actualiser
        </button>
      </div>

      {/* Filtres */}
      <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-6 border border-white/10">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={20}
            />
            <input
              type="text"
              placeholder="Rechercher un utilisateur..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="text-gray-400" size={20} />
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="bg-gray-800 border border-white/20 rounded-lg px-4 py-3 text-white focus:border-blue-400 focus:outline-none [&>option]:bg-gray-800 [&>option]:text-white"
            >
              <option value="all">Tous les rôles</option>
              <option value="admin">Administrateurs</option>
              <option value="customer">Clients</option>
            </select>
          </div>
        </div>
      </div>

      {/* Liste des utilisateurs */}
      <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-white/5">
              <tr>
                <th className="text-left p-4 text-gray-300 font-semibold">
                  Utilisateur
                </th>
                <th className="text-left p-4 text-gray-300 font-semibold">
                  Email
                </th>
                <th className="text-left p-4 text-gray-300 font-semibold">
                  Rôle
                </th>
                <th className="text-left p-4 text-gray-300 font-semibold">
                  Inscription
                </th>
                <th className="text-left p-4 text-gray-300 font-semibold">
                  Dernière connexion
                </th>
                <th className="text-left p-4 text-gray-300 font-semibold">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(user => (
                <tr
                  key={user.id}
                  className="border-t border-white/10 hover:bg-white/5 transition-colors"
                >
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                        <span className="text-white font-semibold text-sm">
                          {user.display_name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <div className="text-white font-semibold">
                          {user.display_name}
                        </div>
                        <div className="text-gray-400 text-sm">
                          ID: {user.id.slice(0, 8)}...
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="text-gray-300">{user.email}</div>
                  </td>
                  <td className="p-4">{getRoleBadge(user.role)}</td>
                  <td className="p-4">
                    <div className="text-gray-300">
                      {new Date(user.created_at).toLocaleDateString('fr-FR')}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="text-gray-300">
                      {user.last_sign_in_at
                        ? new Date(user.last_sign_in_at).toLocaleDateString(
                            'fr-FR'
                          )
                        : 'Jamais'}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setSelectedUser(user);
                          setShowUserModal(true);
                        }}
                        className="p-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors"
                        title="Voir détails"
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        onClick={() => resetPassword(user.email)}
                        className="p-2 bg-yellow-500/20 text-yellow-400 rounded-lg hover:bg-yellow-500/30 transition-colors"
                        title="Réinitialiser mot de passe"
                      >
                        <Mail size={16} />
                      </button>
                      <select
                        value={user.role}
                        onChange={e => updateUserRole(user.id, e.target.value)}
                        className="dark-select rounded px-2 py-1 text-xs"
                      >
                        <option value="customer">Client</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button
                        onClick={() => deleteUser(user.id)}
                        className="p-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {filteredUsers.length === 0 && (
        <div className="text-center py-12">
          <Users className="text-gray-400 mx-auto mb-4" size={48} />
          <h3 className="text-white font-semibold mb-2">
            Aucun utilisateur trouvé
          </h3>
          <p className="text-gray-400">
            Aucun utilisateur ne correspond à vos critères de recherche
          </p>
        </div>
      )}

      {/* Modal détails utilisateur */}
      {showUserModal && selectedUser && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 border border-white/10 max-w-2xl w-full">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-white">
                Détails de l'utilisateur
              </h3>
              <button
                onClick={() => setShowUserModal(false)}
                className="text-gray-400 hover:text-white transition-colors text-2xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-400 text-sm mb-1">
                    Nom d'affichage
                  </label>
                  <div className="text-white font-semibold">
                    {selectedUser.display_name}
                  </div>
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-1">
                    Email
                  </label>
                  <div className="text-white">{selectedUser.email}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-400 text-sm mb-1">
                    Rôle
                  </label>
                  <div>{getRoleBadge(selectedUser.role)}</div>
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-1">ID</label>
                  <div className="text-white font-mono text-sm">
                    {selectedUser.id}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-400 text-sm mb-1">
                    Date d'inscription
                  </label>
                  <div className="text-white">
                    {new Date(selectedUser.created_at).toLocaleString('fr-FR')}
                  </div>
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-1">
                    Dernière connexion
                  </label>
                  <div className="text-white">
                    {selectedUser.last_sign_in_at
                      ? new Date(selectedUser.last_sign_in_at).toLocaleString(
                          'fr-FR'
                        )
                      : 'Jamais connecté'}
                  </div>
                </div>
              </div>

              {selectedUser.profile && (
                <div>
                  <label className="block text-gray-400 text-sm mb-2">
                    Informations du profil
                  </label>
                  <div className="bg-white/5 rounded-lg p-4">
                    <pre className="text-gray-300 text-sm overflow-auto">
                      {JSON.stringify(selectedUser.profile, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-4 mt-6">
              <button
                onClick={() => resetPassword(selectedUser.email)}
                className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2"
              >
                <Mail size={16} />
                Réinitialiser mot de passe
              </button>
              <button
                onClick={() => setShowUserModal(false)}
                className="border-2 border-white/30 text-white px-4 py-2 rounded-lg font-semibold hover:bg-white/10 transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUsers;
