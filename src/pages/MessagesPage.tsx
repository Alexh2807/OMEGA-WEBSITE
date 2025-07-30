import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  MessageSquare,
  Calendar,
  Clock,
  CheckCircle,
  AlertCircle,
  Eye,
  Plus,
  Send,
  Phone,
  Mail,
} from 'lucide-react';
import { Link } from 'react-router-dom';
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
  created_at: string;
  updated_at: string;
  read_by_user: boolean;
  admin_response?: string;
}

const MessagesPage = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ContactRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState<ContactRequest | null>(
    null
  );
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [newMessage, setNewMessage] = useState({
    subject: '',
    message: '',
    type: 'general',
  });

  useEffect(() => {
    if (user) {
      loadMessages();
    }
  }, [user]);

  const loadMessages = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('contact_requests')
        .select('*')
        .eq('user_id', user.id)
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

  const markAsRead = async (messageId: string) => {
    try {
      const { error } = await supabase
        .from('contact_requests')
        .update({ read_by_user: true })
        .eq('id', messageId);

      if (!error) {
        setMessages(prev =>
          prev.map(msg =>
            msg.id === messageId ? { ...msg, read_by_user: true } : msg
          )
        );
      }
    } catch (err) {
      console.error('Error marking as read:', err);
    }
  };

  const sendNewMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const { error } = await supabase.from('contact_requests').insert({
        name:
          user.user_metadata?.full_name ||
          user.email?.split('@')[0] ||
          'Client',
        email: user.email,
        subject: newMessage.subject,
        message: newMessage.message,
        type: newMessage.type,
        user_id: user.id,
        status: 'pending',
      });

      if (error) {
        console.error('Error sending message:', error);
        toast.error("Erreur lors de l'envoi du message");
      } else {
        toast.success('Message envoyé avec succès !');
        setNewMessage({ subject: '', message: '', type: 'general' });
        setShowNewMessage(false);
        loadMessages();
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      toast.error('Erreur inattendue');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'resolved':
        return <CheckCircle className="text-green-400" size={20} />;
      case 'in_progress':
        return <Clock className="text-blue-400" size={20} />;
      default:
        return <AlertCircle className="text-yellow-400" size={20} />;
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

  const getTypeText = (type: string) => {
    switch (type) {
      case 'demo':
        return 'Demande de démonstration';
      case 'quote':
        return 'Demande de devis';
      default:
        return 'Demande générale';
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24 flex items-center justify-center">
        <div className="text-center">
          <MessageSquare className="text-gray-400 mx-auto mb-4" size={64} />
          <h2 className="text-2xl font-bold text-white mb-4">
            Accès non autorisé
          </h2>
          <p className="text-gray-400">
            Veuillez vous connecter pour voir vos messages
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24 flex items-center justify-center">
        <div className="text-white text-xl">Chargement des messages...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24">
      <div className="container mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-4xl font-bold text-white">Mes Messages</h1>
          <button
            onClick={() => setShowNewMessage(true)}
            className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-full font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 flex items-center gap-2"
          >
            <Plus size={20} />
            Nouveau Message
          </button>
        </div>

        {messages.length === 0 ? (
          <div className="text-center py-12">
            <MessageSquare className="text-gray-400 mx-auto mb-4" size={64} />
            <h2 className="text-2xl font-bold text-white mb-4">
              Aucun message
            </h2>
            <p className="text-gray-400 mb-6">
              Vous n'avez pas encore envoyé de message
            </p>
            <button
              onClick={() => setShowNewMessage(true)}
              className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-full font-semibold"
            >
              Envoyer votre premier message
            </button>
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Liste des messages */}
            <div className="lg:col-span-1 space-y-4">
              {messages.map(message => (
                <div
                  key={message.id}
                  onClick={() => {
                    setSelectedMessage(message);
                    if (!message.read_by_user) {
                      markAsRead(message.id);
                    }
                  }}
                  className={`bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-6 border cursor-pointer transition-all duration-300 hover:border-yellow-400/30 ${
                    selectedMessage?.id === message.id
                      ? 'border-yellow-400/50'
                      : 'border-white/10'
                  } ${!message.read_by_user ? 'bg-blue-500/5 border-blue-500/20' : ''}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(message.status)}
                      <span className="text-sm font-medium text-gray-300">
                        {getStatusText(message.status)}
                      </span>
                    </div>
                    {!message.read_by_user && (
                      <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                    )}
                  </div>

                  <h3 className="text-white font-semibold mb-2 line-clamp-1">
                    {message.subject}
                  </h3>

                  <p className="text-gray-400 text-sm mb-3 line-clamp-2">
                    {message.message}
                  </p>

                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{getTypeText(message.type)}</span>
                    <span>
                      {new Date(message.created_at).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Détail du message */}
            <div className="lg:col-span-2">
              {selectedMessage ? (
                <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-8 border border-white/10">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(selectedMessage.status)}
                      <span
                        className={`font-semibold ${
                          selectedMessage.status === 'resolved'
                            ? 'text-green-400'
                            : selectedMessage.status === 'in_progress'
                              ? 'text-blue-400'
                              : 'text-yellow-400'
                        }`}
                      >
                        {getStatusText(selectedMessage.status)}
                      </span>
                    </div>
                    <span className="text-gray-400 text-sm">
                      {new Date(selectedMessage.created_at).toLocaleString(
                        'fr-FR'
                      )}
                    </span>
                  </div>

                  <h2 className="text-2xl font-bold text-white mb-4">
                    {selectedMessage.subject}
                  </h2>

                  <div className="mb-6 p-4 bg-white/5 rounded-lg">
                    <div className="text-gray-400 text-sm mb-2">
                      Type de demande:
                    </div>
                    <div className="text-white">
                      {getTypeText(selectedMessage.type)}
                    </div>
                  </div>

                  <div className="mb-6">
                    <h3 className="text-white font-semibold mb-3">
                      Votre message:
                    </h3>
                    <div className="bg-white/5 rounded-lg p-4">
                      <p className="text-gray-300 leading-relaxed whitespace-pre-line">
                        {selectedMessage.message}
                      </p>
                    </div>
                  </div>

                  {selectedMessage.admin_response && (
                    <div className="mb-6">
                      <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                        <MessageSquare className="text-blue-400" size={20} />
                        Réponse de notre équipe:
                      </h3>
                      <div className="bg-gradient-to-r from-blue-500/10 to-green-500/10 rounded-lg p-4 border border-blue-500/20">
                        <p className="text-gray-300 leading-relaxed whitespace-pre-line">
                          {selectedMessage.admin_response}
                        </p>
                        {selectedMessage.updated_at && (
                          <div className="text-gray-400 text-xs mt-3">
                            Répondu le{' '}
                            {new Date(
                              selectedMessage.updated_at
                            ).toLocaleString('fr-FR')}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-4">
                    <Link
                      to="/contact"
                      className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 flex items-center gap-2"
                    >
                      <Mail size={20} />
                      Nouveau Message
                    </Link>
                    <a
                      href="tel:+33619918719"
                      className="border-2 border-white/30 text-white px-6 py-3 rounded-lg font-semibold hover:bg-white/10 hover:border-white/50 transition-all duration-300 flex items-center gap-2"
                    >
                      <Phone size={20} />
                      Nous Appeler
                    </a>
                  </div>
                </div>
              ) : (
                <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-8 border border-white/10 flex items-center justify-center h-96">
                  <div className="text-center">
                    <MessageSquare
                      className="text-gray-400 mx-auto mb-4"
                      size={48}
                    />
                    <h3 className="text-xl font-bold text-white mb-2">
                      Sélectionnez un message
                    </h3>
                    <p className="text-gray-400">
                      Cliquez sur un message pour voir les détails
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal Nouveau Message */}
        {showNewMessage && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 border border-white/10 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-white">
                  Nouveau Message
                </h3>
                <button
                  onClick={() => setShowNewMessage(false)}
                  className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 flex items-center justify-center gap-2"
                >
                  ×
                </button>
              </div>

              <form onSubmit={sendNewMessage} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Type de demande
                  </label>
                  <select
                    value={newMessage.type}
                    onChange={e =>
                      setNewMessage({ ...newMessage, type: e.target.value })
                    }
                    className="w-full dark-select rounded-lg px-4 py-3 focus:border-yellow-400 focus:outline-none"
                  >
                    <option value="general">Demande générale</option>
                    <option value="demo">Demande de démonstration</option>
                    <option value="quote">Demande de devis</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Sujet *
                  </label>
                  <input
                    type="text"
                    required
                    value={newMessage.subject}
                    onChange={e =>
                      setNewMessage({ ...newMessage, subject: e.target.value })
                    }
                    className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-yellow-400 focus:outline-none"
                    placeholder="Sujet de votre demande"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Message *
                  </label>
                  <textarea
                    required
                    rows={6}
                    value={newMessage.message}
                    onChange={e =>
                      setNewMessage({ ...newMessage, message: e.target.value })
                    }
                    className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-yellow-400 focus:outline-none resize-none"
                    placeholder="Décrivez votre demande en détail..."
                  />
                </div>

                <div className="flex gap-4">
                  <button
                    type="submit"
                    className="flex-1 bg-gradient-to-r from-yellow-400 to-orange-500 text-black py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-yellow-400/25 transition-all duration-300 flex items-center justify-center gap-2"
                  >
                    <Send size={20} />
                    Envoyer le Message
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNewMessage(false)}
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
    </div>
  );
};

export default MessagesPage;
