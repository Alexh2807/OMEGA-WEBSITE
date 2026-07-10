import React, { useState, useEffect } from 'react';
import {
  Star,
  CheckCircle,
  XCircle,
  MessageSquare,
  Trash2,
  Clock,
  Eye,
  Filter,
  Search,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

interface Review {
  id: string;
  rating: number;
  title: string;
  comment: string;
  verified_purchase: boolean;
  status: 'pending' | 'approved' | 'rejected';
  admin_response?: string;
  helpful_count: number;
  created_at: string;
  user_id: string;
  product_id: string;
  profiles?: {
    first_name: string;
    last_name: string;
  };
  products?: {
    name: string;
    image: string;
  };
}

const AdminReviews = () => {
  const { isAdmin } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);
  const [adminResponse, setAdminResponse] = useState('');
  const [showResponseModal, setShowResponseModal] = useState(false);

  useEffect(() => {
    if (isAdmin) {
      loadReviews();
    }
  }, [isAdmin, filterStatus]);

  const loadReviews = async () => {
    try {
      let query = supabase
        .from('product_reviews')
        .select(
          `
          *,
          profiles!product_reviews_user_id_fkey(first_name, last_name),
          products(name, image)
        `
        )
        .order('created_at', { ascending: false });

      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }

      const { data, error } = await query;

      if (error) throw error;
      setReviews(data || []);
    } catch (err) {
      console.error('Error loading reviews:', err);
      toast.error('Erreur lors du chargement des avis');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (
    reviewId: string,
    newStatus: 'approved' | 'rejected'
  ) => {
    try {
      const { error } = await supabase
        .from('product_reviews')
        .update({ status: newStatus })
        .eq('id', reviewId);

      if (error) throw error;

      toast.success(
        `Avis ${newStatus === 'approved' ? 'approuvé' : 'rejeté'} avec succès`
      );
      loadReviews();
    } catch (err) {
      console.error('Error updating review status:', err);
      toast.error('Erreur lors de la mise à jour du statut');
    }
  };

  const handleAddResponse = async () => {
    if (!selectedReview || !adminResponse.trim()) {
      toast.error('Veuillez saisir une réponse');
      return;
    }

    try {
      const { error } = await supabase
        .from('product_reviews')
        .update({
          admin_response: adminResponse.trim(),
          status: 'approved', // Automatically approve when responding
        })
        .eq('id', selectedReview.id);

      if (error) throw error;

      toast.success('Réponse ajoutée avec succès');
      setShowResponseModal(false);
      setSelectedReview(null);
      setAdminResponse('');
      loadReviews();
    } catch (err) {
      console.error('Error adding response:', err);
      toast.error('Erreur lors de l\'ajout de la réponse');
    }
  };

  const handleDeleteReview = async (reviewId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet avis ?')) return;

    try {
      const { error } = await supabase
        .from('product_reviews')
        .delete()
        .eq('id', reviewId);

      if (error) throw error;

      toast.success('Avis supprimé avec succès');
      loadReviews();
    } catch (err) {
      console.error('Error deleting review:', err);
      toast.error('Erreur lors de la suppression de l\'avis');
    }
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(star => (
          <Star
            key={star}
            size={16}
            className={
              star <= rating
                ? 'fill-blue-400 text-blue-400'
                : 'text-gray-600'
            }
          />
        ))}
      </div>
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <span className="flex items-center gap-1 bg-green-500/20 text-green-400 px-2 py-1 rounded-lg text-xs font-semibold">
            <CheckCircle size={14} />
            Approuvé
          </span>
        );
      case 'rejected':
        return (
          <span className="flex items-center gap-1 bg-red-500/20 text-red-400 px-2 py-1 rounded-lg text-xs font-semibold">
            <XCircle size={14} />
            Rejeté
          </span>
        );
      case 'pending':
        return (
          <span className="flex items-center gap-1 bg-blue-500/20 text-blue-400 px-2 py-1 rounded-lg text-xs font-semibold">
            <Clock size={14} />
            En attente
          </span>
        );
      default:
        return null;
    }
  };

  const getUserName = (profile: { first_name: string; last_name: string } | undefined) => {
    if (!profile) return 'Utilisateur';
    return `${profile.first_name} ${profile.last_name}`;
  };

  const filteredReviews = reviews.filter(
    review =>
      review.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      review.comment.toLowerCase().includes(searchQuery.toLowerCase()) ||
      review.products?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      getUserName(review.profiles).toLowerCase().includes(searchQuery.toLowerCase())
  );

  const stats = {
    total: reviews.length,
    pending: reviews.filter(r => r.status === 'pending').length,
    approved: reviews.filter(r => r.status === 'approved').length,
    rejected: reviews.filter(r => r.status === 'rejected').length,
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24 flex items-center justify-center">
        <div className="text-center">
          <XCircle className="text-red-400 mx-auto mb-4" size={64} />
          <h2 className="text-2xl font-bold text-white mb-4">
            Accès non autorisé
          </h2>
          <p className="text-gray-400">
            Vous devez être administrateur pour accéder à cette page
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24 flex items-center justify-center">
        <div className="text-white text-xl">Chargement des avis...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24">
      <div className="container mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold text-white mb-8">
          Gestion des Avis Clients
        </h1>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl border border-white/10 p-6">
            <div className="text-gray-400 text-sm mb-2">Total</div>
            <div className="text-3xl font-bold text-white">{stats.total}</div>
          </div>
          <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/10 backdrop-blur-md rounded-2xl border border-blue-500/20 p-6">
            <div className="text-blue-400 text-sm mb-2">En attente</div>
            <div className="text-3xl font-bold text-white">{stats.pending}</div>
          </div>
          <div className="bg-gradient-to-br from-green-500/10 to-green-600/10 backdrop-blur-md rounded-2xl border border-green-500/20 p-6">
            <div className="text-green-400 text-sm mb-2">Approuvés</div>
            <div className="text-3xl font-bold text-white">{stats.approved}</div>
          </div>
          <div className="bg-gradient-to-br from-red-500/10 to-red-600/10 backdrop-blur-md rounded-2xl border border-red-500/20 p-6">
            <div className="text-red-400 text-sm mb-2">Rejetés</div>
            <div className="text-3xl font-bold text-white">{stats.rejected}</div>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl border border-white/10 p-6 mb-8">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <Filter className="text-gray-400" size={20} />
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:border-blue-400 focus:outline-none"
              >
                <option value="all">Tous les statuts</option>
                <option value="pending">En attente</option>
                <option value="approved">Approuvés</option>
                <option value="rejected">Rejetés</option>
              </select>
            </div>

            {/* Search */}
            <div className="flex-1 relative">
              <Search
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                size={20}
              />
              <input
                type="text"
                placeholder="Rechercher un avis, produit ou utilisateur..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-white placeholder-gray-500 focus:border-blue-400 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Reviews List */}
        {filteredReviews.length === 0 ? (
          <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl border border-white/10 p-12 text-center">
            <MessageSquare className="text-gray-400 mx-auto mb-4" size={64} />
            <h3 className="text-xl font-semibold text-white mb-2">
              Aucun avis trouvé
            </h3>
            <p className="text-gray-400">
              {searchQuery
                ? 'Essayez une autre recherche'
                : 'Aucun avis correspondant aux filtres'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {filteredReviews.map(review => (
              <div
                key={review.id}
                className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl border border-white/10 p-6 hover:border-white/20 transition-all"
              >
                <div className="flex items-start gap-6">
                  {/* Product Image */}
                  <img
                    src={
                      review.products?.image?.startsWith('/')
                        ? review.products.image
                        : `/${review.products?.image}`
                    }
                    alt={review.products?.name}
                    className="w-24 h-24 object-cover rounded-lg"
                  />

                  {/* Review Content */}
                  <div className="flex-1">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          {renderStars(review.rating)}
                          {getStatusBadge(review.status)}
                          {review.verified_purchase && (
                            <span className="flex items-center gap-1 text-green-400 text-xs">
                              <CheckCircle size={14} />
                              Achat vérifié
                            </span>
                          )}
                        </div>
                        <h3 className="text-lg font-semibold text-white mb-1">
                          {review.title}
                        </h3>
                        <div className="text-sm text-gray-400">
                          Par {getUserName(review.profiles)} •{' '}
                          {new Date(review.created_at).toLocaleDateString(
                            'fr-FR',
                            {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                            }
                          )}
                        </div>
                        <div className="text-sm text-blue-400 mt-1">
                          Produit: {review.products?.name}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        {review.status === 'pending' && (
                          <>
                            <button
                              onClick={() =>
                                handleUpdateStatus(review.id, 'approved')
                              }
                              className="bg-green-500/20 hover:bg-green-500/30 text-green-400 p-2 rounded-lg transition-colors"
                              title="Approuver"
                            >
                              <CheckCircle size={20} />
                            </button>
                            <button
                              onClick={() =>
                                handleUpdateStatus(review.id, 'rejected')
                              }
                              className="bg-red-500/20 hover:bg-red-500/30 text-red-400 p-2 rounded-lg transition-colors"
                              title="Rejeter"
                            >
                              <XCircle size={20} />
                            </button>
                          </>
                        )}
                        {review.status === 'approved' && !review.admin_response && (
                          <button
                            onClick={() => {
                              setSelectedReview(review);
                              setShowResponseModal(true);
                            }}
                            className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 p-2 rounded-lg transition-colors"
                            title="Répondre"
                          >
                            <MessageSquare size={20} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteReview(review.id)}
                          className="bg-red-500/20 hover:bg-red-500/30 text-red-400 p-2 rounded-lg transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    </div>

                    {/* Comment */}
                    <p className="text-gray-300 mb-3">{review.comment}</p>

                    {/* Admin Response */}
                    {review.admin_response && (
                      <div className="bg-blue-500/10 rounded-lg p-4 border border-blue-500/20">
                        <div className="flex items-center gap-2 mb-2">
                          <MessageSquare className="text-blue-400" size={16} />
                          <span className="text-blue-400 font-semibold text-sm">
                            Votre réponse
                          </span>
                        </div>
                        <p className="text-gray-300 text-sm">
                          {review.admin_response}
                        </p>
                      </div>
                    )}

                    {/* Footer */}
                    <div className="text-sm text-gray-400 mt-3">
                      {review.helpful_count} personne
                      {review.helpful_count > 1 ? 's ont' : ' a'} trouvé cet avis
                      utile
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Response Modal */}
      {showResponseModal && selectedReview && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-6">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl border border-white/10 p-8 max-w-2xl w-full">
            <h3 className="text-2xl font-bold text-white mb-4">
              Répondre à l'avis
            </h3>

            {/* Review Preview */}
            <div className="bg-white/5 rounded-lg p-4 mb-6">
              <div className="flex items-center gap-2 mb-2">
                {renderStars(selectedReview.rating)}
              </div>
              <h4 className="text-white font-semibold mb-1">
                {selectedReview.title}
              </h4>
              <p className="text-gray-300 text-sm">{selectedReview.comment}</p>
            </div>

            {/* Response Input */}
            <textarea
              value={adminResponse}
              onChange={e => setAdminResponse(e.target.value)}
              placeholder="Votre réponse..."
              rows={6}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-blue-400 focus:outline-none resize-none mb-6"
            />

            {/* Actions */}
            <div className="flex gap-4">
              <button
                onClick={handleAddResponse}
                className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-full font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300"
              >
                Envoyer la réponse
              </button>
              <button
                onClick={() => {
                  setShowResponseModal(false);
                  setSelectedReview(null);
                  setAdminResponse('');
                }}
                className="border-2 border-white/30 text-white px-6 py-3 rounded-full font-semibold hover:bg-white/10 hover:border-white/50 transition-all duration-300"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminReviews;
