import React, { useState, useEffect } from 'react';
import { Star, ThumbsUp, CheckCircle, MessageSquare } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

interface Review {
  id: string;
  rating: number;
  title: string;
  comment: string;
  verified_purchase: boolean;
  admin_response?: string;
  helpful_count: number;
  created_at: string;
  user_id: string;
  profiles?: {
    first_name: string;
    last_name: string;
  };
}

interface ProductReviewsProps {
  productId: string;
  onReviewAdded?: () => void;
}

const ProductReviews: React.FC<ProductReviewsProps> = ({
  productId,
  onReviewAdded,
}) => {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [averageRating, setAverageRating] = useState(0);
  const [totalReviews, setTotalReviews] = useState(0);
  const [sortBy, setSortBy] = useState<'recent' | 'rating' | 'helpful'>(
    'recent'
  );
  const [helpfulVotes, setHelpfulVotes] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadReviews();
    loadStats();
    loadHelpfulVotes();
  }, [productId, sortBy]);

  const loadReviews = async () => {
    try {
      let query = supabase
        .from('product_reviews')
        .select(
          `
          *,
          profiles!product_reviews_user_id_fkey(first_name, last_name)
        `
        )
        .eq('product_id', productId)
        .eq('status', 'approved');

      // Sort by selected criteria
      if (sortBy === 'recent') {
        query = query.order('created_at', { ascending: false });
      } else if (sortBy === 'rating') {
        query = query.order('rating', { ascending: false });
      } else if (sortBy === 'helpful') {
        query = query.order('helpful_count', { ascending: false });
      }

      const { data, error } = await query;

      if (error) throw error;
      setReviews(data || []);
    } catch (err) {
      console.error('Error loading reviews:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      // Get average rating
      const { data: avgData, error: avgError } = await supabase.rpc(
        'get_product_average_rating',
        { product_uuid: productId }
      );

      if (avgError) throw avgError;
      setAverageRating(avgData || 0);

      // Get total reviews count
      const { data: countData, error: countError } = await supabase.rpc(
        'get_product_reviews_count',
        { product_uuid: productId }
      );

      if (countError) throw countError;
      setTotalReviews(countData || 0);
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  };

  const loadHelpfulVotes = async () => {
    if (!user) return;

    try {
      const storedVotes = localStorage.getItem(`helpful_votes_${user.id}`);
      if (storedVotes) {
        setHelpfulVotes(new Set(JSON.parse(storedVotes)));
      }
    } catch (err) {
      console.error('Error loading helpful votes:', err);
    }
  };

  const handleHelpfulVote = async (reviewId: string) => {
    if (!user) {
      toast.error('Connectez-vous pour voter');
      return;
    }

    if (helpfulVotes.has(reviewId)) {
      toast.error('Vous avez déjà voté pour cet avis');
      return;
    }

    try {
      // Get current helpful count
      const review = reviews.find(r => r.id === reviewId);
      if (!review) return;

      // Update helpful count
      const { error } = await supabase
        .from('product_reviews')
        .update({ helpful_count: review.helpful_count + 1 })
        .eq('id', reviewId);

      if (error) throw error;

      // Update local state
      setReviews(
        reviews.map(r =>
          r.id === reviewId ? { ...r, helpful_count: r.helpful_count + 1 } : r
        )
      );

      // Save vote to localStorage
      const newVotes = new Set(helpfulVotes);
      newVotes.add(reviewId);
      setHelpfulVotes(newVotes);
      localStorage.setItem(
        `helpful_votes_${user.id}`,
        JSON.stringify([...newVotes])
      );

      toast.success('Merci pour votre vote !');
    } catch (err) {
      console.error('Error voting:', err);
      toast.error('Erreur lors du vote');
    }
  };

  const renderStars = (rating: number, size: number = 20) => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(star => (
          <Star
            key={star}
            size={size}
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

  const getRatingDistribution = () => {
    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach(review => {
      distribution[review.rating as keyof typeof distribution]++;
    });
    return distribution;
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-400">Chargement des avis...</div>
      </div>
    );
  }

  const distribution = getRatingDistribution();

  return (
    <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl border border-white/10 p-8">
      {/* Header - Stats Section */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-2">
          <Star className="text-blue-400" size={32} />
          Avis Clients
        </h2>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Average Rating */}
          <div className="bg-white/5 rounded-lg p-6">
            <div className="text-center">
              <div className="text-5xl font-bold text-white mb-2">
                {averageRating.toFixed(1)}
              </div>
              {renderStars(Math.round(averageRating), 28)}
              <div className="text-gray-400 mt-2">
                Basé sur {totalReviews} avis
              </div>
            </div>
          </div>

          {/* Rating Distribution */}
          <div className="bg-white/5 rounded-lg p-6">
            <div className="space-y-2">
              {[5, 4, 3, 2, 1].map(rating => {
                const count = distribution[rating as keyof typeof distribution];
                const percentage =
                  totalReviews > 0 ? (count / totalReviews) * 100 : 0;

                return (
                  <div key={rating} className="flex items-center gap-3">
                    <div className="flex items-center gap-1 w-20">
                      <span className="text-white font-semibold">{rating}</span>
                      <Star size={16} className="text-blue-400 fill-blue-400" />
                    </div>
                    <div className="flex-1 bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="text-gray-400 text-sm w-12">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Sort Options */}
      {reviews.length > 0 && (
        <div className="mb-6 flex items-center gap-4">
          <span className="text-gray-400">Trier par:</span>
          <div className="flex gap-2">
            <button
              onClick={() => setSortBy('recent')}
              className={`px-4 py-2 rounded-lg transition-all ${
                sortBy === 'recent'
                  ? 'bg-blue-500 text-white'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10'
              }`}
            >
              Plus récents
            </button>
            <button
              onClick={() => setSortBy('rating')}
              className={`px-4 py-2 rounded-lg transition-all ${
                sortBy === 'rating'
                  ? 'bg-blue-500 text-white'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10'
              }`}
            >
              Meilleures notes
            </button>
            <button
              onClick={() => setSortBy('helpful')}
              className={`px-4 py-2 rounded-lg transition-all ${
                sortBy === 'helpful'
                  ? 'bg-blue-500 text-white'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10'
              }`}
            >
              Plus utiles
            </button>
          </div>
        </div>
      )}

      {/* Reviews List */}
      {reviews.length === 0 ? (
        <div className="text-center py-12 bg-white/5 rounded-lg">
          <MessageSquare className="text-gray-400 mx-auto mb-4" size={48} />
          <h3 className="text-xl font-semibold text-white mb-2">
            Aucun avis pour le moment
          </h3>
          <p className="text-gray-400">
            Soyez le premier à laisser un avis sur ce produit !
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {reviews.map(review => (
            <div
              key={review.id}
              className="bg-white/5 rounded-lg p-6 hover:bg-white/10 transition-all"
            >
              {/* Review Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    {renderStars(review.rating)}
                    {review.verified_purchase && (
                      <span className="flex items-center gap-1 text-green-400 text-sm">
                        <CheckCircle size={16} />
                        Achat vérifié
                      </span>
                    )}
                  </div>
                  <h4 className="text-lg font-semibold text-white mb-1">
                    {review.title}
                  </h4>
                  <div className="text-sm text-gray-400">
                    Par {review.profiles ? `${review.profiles.first_name} ${review.profiles.last_name}` : 'Client'} •{' '}
                    {new Date(review.created_at).toLocaleDateString('fr-FR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </div>
                </div>
              </div>

              {/* Review Content */}
              <p className="text-gray-300 mb-4 leading-relaxed">
                {review.comment}
              </p>

              {/* Admin Response */}
              {review.admin_response && (
                <div className="mt-4 p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="text-blue-400" size={16} />
                    <span className="text-blue-400 font-semibold text-sm">
                      Réponse d'OMEGA
                    </span>
                  </div>
                  <p className="text-gray-300 text-sm">{review.admin_response}</p>
                </div>
              )}

              {/* Helpful Button */}
              <div className="mt-4 flex items-center gap-4">
                <button
                  onClick={() => handleHelpfulVote(review.id)}
                  disabled={!user || helpfulVotes.has(review.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                    helpfulVotes.has(review.id)
                      ? 'bg-blue-500/20 text-blue-400 cursor-not-allowed'
                      : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <ThumbsUp size={16} />
                  Utile ({review.helpful_count})
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProductReviews;
