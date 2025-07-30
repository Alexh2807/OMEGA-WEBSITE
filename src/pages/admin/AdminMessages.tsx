import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Search,
  Filter,
  Eye,
  Reply,
  CheckCircle,
  Clock,
  AlertCircle,
  User,
  Mail,
  Phone,
  Building,
  Calendar,
  Tag,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

interface ContactRequest {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  subject: string;
  message: string;
  type: string;
  status: string;
  priority: string;
  source: string;
  tags: string[];
  admin_response: string;
  created_at: string;
  updated_at: string;
  assigned_to: string;
  user_id: string;
}

const AdminMessages = () => {
  const [messages, setMessages] = useState<ContactRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [selectedMessage, setSelectedMessage] = useState<ContactRequest | null>(
    null
  );
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [showReplyModal, setShowReplyModal] = useState(false);
  const [replyText, setReplyText] = useState('');

  useEffect(() => {
    loadMessages();
  }, []);

  const loadMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('contact_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading messages:', error);
        toast.error('Erreur lors du chargement des messages');
      } else {
        setMessages(data || []);
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      toast.error('Erreur inattendue');
    } finally {
      setLoading(false);
    }
  };

  const updateMessageStatus = async (
    messageId: string,
    status: string,
    priority?: string,
    adminResponse?: string
  ) => {
    try {
      const updateData: any = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (priority) updateData.priority = priority;
      if (adminResponse) updateData.admin_response = adminResponse;

      const { error } = await supabase
        .from('contact_requests')
        .update(updateData)
        .eq('id', messageId);

      if (error) {
        console.error('Error updating message:', error);
        toast.error('Erreur lors de la mise à jour');
      } else {
        toast.success('Message mis à jour avec succès');
        loadMessages();
        setShowReplyModal(false);
        setReplyText('');
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      toast.error('Erreur inattendue');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'resolved':
        return <CheckCircle className="text-green-400" size={16} />;
      case 'in_progress':
        return <Clock className="text-blue-400" size={16} />;
      default:
        return <AlertCircle className="text-yellow-400" size={16} />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'resolved':
        return 'Résolu';
      case 'in_progress':
        return 'En cours';
      default:
        return 'En attente';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'resolved':
        return 'text-green-400 bg-green-500/20';
      case 'in_progress':
        return 'text-blue-400 bg-blue-500/20';
      default:
        return 'text-yellow-400 bg-yellow-500/20';
    }
  };

  const getTypeText = (type: string) => {
    switch (type) {
      case 'demo':
        return 'Démonstration';
      case 'quote':
        return 'Devis';
      default:
        return 'Général';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'text-red-400 bg-red-500/20';
      case 'high':
        return 'text-orange-400 bg-orange-500/20';
      case 'normal':
        return 'text-blue-400 bg-blue-500/20';
      case 'low':
        return 'text-gray-400 bg-gray-500/20';
      default:
        return 'text-blue-400 bg-blue-500/20';
    }
  };

  const filteredMessages = messages.filter(message => {
    const matchesSearch =
      message.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      message.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      message.subject.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' || message.status === statusFilter;
    const matchesType = typeFilter === 'all' || message.type === typeFilter;
    const matchesPriority =
      priorityFilter === 'all' || message.priority === priorityFilter;
    return matchesSearch && matchesStatus && matchesType && matchesPriority;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-white text-xl">Chargement des messages...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
            <MessageSquare className="text-purple-400" size={32} />
            Gestion des Messages
          </h1>
          <p className="text-gray-400">
            Gérez les demandes de contact et les messages clients
          </p>
        </div>
      </div>

      {/* Statistiques rapides */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-white/10">
          <div className="text-2xl font-bold text-white">{messages.length}</div>
          <div className="text-gray-400 text-sm">Total messages</div>
        </div>
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-white/10">
          <div className="text-2xl font-bold text-yellow-400">
            {messages.filter(m => m.status === 'pending').length}
          </div>
          <div className="text-gray-400 text-sm">En attente</div>
        </div>
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-white/10">
          <div className="text-2xl font-bold text-blue-400">
            {messages.filter(m => m.status === 'in_progress').length}
          </div>
          <div className="text-gray-400 text-sm">En cours</div>
        </div>
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-white/10">
          <div className="text-2xl font-bold text-green-400">
            {messages.filter(m => m.status === 'resolved').length}
          </div>
          <div className="text-gray-400 text-sm">Résolus</div>
        </div>
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
              placeholder="Rechercher par nom, email ou sujet..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-400 focus:border-purple-400 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="text-gray-400" size={20} />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white focus:border-purple-400 focus:outline-none"
            >
              <option value="all">Tous les statuts</option>
              <option value="pending">En attente</option>
              <option value="in_progress">En cours</option>
              <option value="resolved">Résolus</option>
            </select>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white focus:border-purple-400 focus:outline-none"
            >
              <option value="all">Tous les types</option>
              <option value="general">Général</option>
              <option value="demo">Démonstration</option>
              <option value="quote">Devis</option>
            </select>
            <select
              value={priorityFilter}
              onChange={e => setPriorityFilter(e.target.value)}
              className="bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white focus:border-purple-400 focus:outline-none"
            >
              <option value="all">Toutes priorités</option>
              <option value="urgent">Urgent</option>
              <option value="high">Haute</option>
              <option value="normal">Normale</option>
              <option value="low">Basse</option>
            </select>
          </div>
        </div>
      </div>

      {/* Liste des messages */}
      <div className="space-y-4">
        {filteredMessages.map(message => (
          <div
            key={message.id}
            className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-6 border border-white/10 hover:border-purple-400/30 transition-all duration-300"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(message.status)}
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(message.status)}`}
                    >
                      {getStatusText(message.status)}
                    </span>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${getPriorityColor(message.priority)}`}
                  >
                    {message.priority?.charAt(0).toUpperCase() +
                      message.priority?.slice(1) || 'Normal'}
                  </span>
                  <span className="bg-blue-500/20 text-blue-400 px-3 py-1 rounded-full text-xs font-medium">
                    {getTypeText(message.type)}
                  </span>
                </div>

                <h3 className="text-xl font-bold text-white mb-2">
                  {message.subject}
                </h3>

                <div className="flex items-center gap-6 mb-3 text-sm text-gray-400">
                  <div className="flex items-center gap-2">
                    <User size={16} />
                    <span>{message.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail size={16} />
                    <span>{message.email}</span>
                  </div>
                  {message.phone && (
                    <div className="flex items-center gap-2">
                      <Phone size={16} />
                      <span>{message.phone}</span>
                    </div>
                  )}
                  {message.company && (
                    <div className="flex items-center gap-2">
                      <Building size={16} />
                      <span>{message.company}</span>
                    </div>
                  )}
                </div>

                <p className="text-gray-300 mb-4 line-clamp-2">
                  {message.message}
                </p>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-sm text-gray-400">
                    <div className="flex items-center gap-1">
                      <Calendar size={14} />
                      <span>
                        {new Date(message.created_at).toLocaleDateString(
                          'fr-FR'
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Tag size={14} />
                      <span>{message.source || 'Website'}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setSelectedMessage(message);
                        setShowMessageModal(true);
                      }}
                      className="p-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors"
                      title="Voir détails"
                    >
                      <Eye size={16} />
                    </button>
                    <button
                      onClick={() => {
                        setSelectedMessage(message);
                        setShowReplyModal(true);
                      }}
                      className="p-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors"
                      title="Répondre"
                    >
                      <Reply size={16} />
                    </button>
                    <select
                      value={message.status}
                      onChange={e =>
                        updateMessageStatus(message.id, e.target.value)
                      }
                      className="dark-select rounded px-2 py-1 text-xs"
                    >
                      <option value="pending">En attente</option>
                      <option value="in_progress">En cours</option>
                      <option value="resolved">Résolu</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredMessages.length === 0 && (
        <div className="text-center py-12">
          <MessageSquare className="text-gray-400 mx-auto mb-4" size={48} />
          <h3 className="text-white font-semibold mb-2">
            Aucun message trouvé
          </h3>
          <p className="text-gray-400">
            Aucun message ne correspond à vos critères de recherche
          </p>
        </div>
      )}

      {/* Modal détails message */}
      {showMessageModal && selectedMessage && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 border border-white/10 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-white">
                Détails du message
              </h3>
              <button
                onClick={() => setShowMessageModal(false)}
                className="text-gray-400 hover:text-white transition-colors text-2xl"
              >
                ×
              </button>
            </div>

            <div className="grid lg:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div>
                  <h4 className="text-white font-semibold mb-3">
                    Informations du contact
                  </h4>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <User className="text-gray-400" size={16} />
                      <span className="text-white">{selectedMessage.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Mail className="text-gray-400" size={16} />
                      <a
                        href={`mailto:${selectedMessage.email}`}
                        className="text-blue-400 hover:text-blue-300"
                      >
                        {selectedMessage.email}
                      </a>
                    </div>
                    {selectedMessage.phone && (
                      <div className="flex items-center gap-3">
                        <Phone className="text-gray-400" size={16} />
                        <a
                          href={`tel:${selectedMessage.phone}`}
                          className="text-blue-400 hover:text-blue-300"
                        >
                          {selectedMessage.phone}
                        </a>
                      </div>
                    )}
                    {selectedMessage.company && (
                      <div className="flex items-center gap-3">
                        <Building className="text-gray-400" size={16} />
                        <span className="text-white">
                          {selectedMessage.company}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="text-white font-semibold mb-3">
                    Informations de la demande
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Type:</span>
                      <span className="text-white">
                        {getTypeText(selectedMessage.type)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Statut:</span>
                      <span
                        className={`px-2 py-1 rounded text-xs ${getStatusColor(selectedMessage.status)}`}
                      >
                        {getStatusText(selectedMessage.status)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Priorité:</span>
                      <span
                        className={`px-2 py-1 rounded text-xs ${getPriorityColor(selectedMessage.priority)}`}
                      >
                        {selectedMessage.priority?.charAt(0).toUpperCase() +
                          selectedMessage.priority?.slice(1)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Date:</span>
                      <span className="text-white">
                        {new Date(selectedMessage.created_at).toLocaleString(
                          'fr-FR'
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Source:</span>
                      <span className="text-white">
                        {selectedMessage.source || 'Website'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <h4 className="text-white font-semibold mb-3">Sujet</h4>
                  <div className="bg-white/5 rounded-lg p-4">
                    <p className="text-white">{selectedMessage.subject}</p>
                  </div>
                </div>

                <div>
                  <h4 className="text-white font-semibold mb-3">Message</h4>
                  <div className="bg-white/5 rounded-lg p-4">
                    <p className="text-gray-300 leading-relaxed whitespace-pre-line">
                      {selectedMessage.message}
                    </p>
                  </div>
                </div>

                {selectedMessage.admin_response && (
                  <div>
                    <h4 className="text-white font-semibold mb-3">
                      Réponse administrateur
                    </h4>
                    <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                      <p className="text-green-300 leading-relaxed whitespace-pre-line">
                        {selectedMessage.admin_response}
                      </p>
                      <div className="text-green-400 text-xs mt-3">
                        Répondu le{' '}
                        {new Date(selectedMessage.updated_at).toLocaleString(
                          'fr-FR'
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-4 mt-8">
              <button
                onClick={() => {
                  setShowMessageModal(false);
                  setShowReplyModal(true);
                }}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors flex items-center gap-2"
              >
                <Reply size={16} />
                Répondre
              </button>
              <a
                href={`mailto:${selectedMessage.email}?subject=Re: ${selectedMessage.subject}`}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors flex items-center gap-2"
              >
                <Mail size={16} />
                Email direct
              </a>
              <button
                onClick={() => setShowMessageModal(false)}
                className="border-2 border-white/30 text-white px-6 py-3 rounded-lg font-semibold hover:bg-white/10 transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal réponse */}
      {showReplyModal && selectedMessage && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 border border-white/10 max-w-2xl w-full">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-white">
                Répondre au message
              </h3>
              <button
                onClick={() => setShowReplyModal(false)}
                className="text-gray-400 hover:text-white transition-colors text-2xl"
              >
                ×
              </button>
            </div>

            <div className="mb-6 p-4 bg-white/5 rounded-lg">
              <div className="text-white font-semibold mb-2">
                De: {selectedMessage.name}
              </div>
              <div className="text-gray-400 text-sm mb-2">
                Sujet: {selectedMessage.subject}
              </div>
              <div className="text-gray-300 text-sm line-clamp-3">
                {selectedMessage.message}
              </div>
            </div>

            <form
              onSubmit={e => {
                e.preventDefault();
                updateMessageStatus(
                  selectedMessage.id,
                  'resolved',
                  undefined,
                  replyText
                );
              }}
              className="space-y-6"
            >
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Votre réponse
                </label>
                <textarea
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  rows={8}
                  required
                  className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-green-400 focus:outline-none resize-none"
                  placeholder="Tapez votre réponse ici..."
                />
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  className="flex-1 bg-gradient-to-r from-green-500 to-green-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-green-500/25 transition-all duration-300"
                >
                  Envoyer la réponse
                </button>
                <button
                  type="button"
                  onClick={() => setShowReplyModal(false)}
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

export default AdminMessages;
