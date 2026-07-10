import React, { useState, useEffect } from 'react';
import { Star, Send, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

interface ReviewFormProps {
  productId: string;
  onReviewSubmitted: () => void;
}

const ReviewForm: React.FC<ReviewFormProps> = ({
  productId,
  onReviewSubmitted,
}) => {
  const { user } = useAuth();
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasOrdered, setHasOrdered] = useState(false);
  const [checkingOrder, setCheckingOrder] = useState(true);
  const [existingReview, setExistingReview] = useState<any>(null);

  useEffect(() => {
    if (user) {
      checkIfUserOrderedProduct();
      checkExistingReview();
    }
  }, [user, productId]);

  const checkIfUserOrderedProduct = async () => {
    if (!user) return;

    try {
      // Check if user has ordered this product
      const { data, error } = await supabase
        .from('order_items')
        .select(
          `
          id,
          orders!inner(
            id,
            user_id,
            status
          )
        `
        )
        .eq('product_id', productId)
        .eq('orders.user_id', user.id)
        .in('orders.status', ['confirmed', 'shipped', 'delivered']);

      if (error) throw error;

      setHasOrdered((data || []).length > 0);
    } catch (err) {
      console.error('Error checking order:', err);
    } finally {
      setCheckingOrder(false);
    }
  };

  const checkExistingReview = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('product_reviews')
        .select('*')
        .eq('product_id', productId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      setExistingReview(data);
    } catch (err) {
      console.error('Error checking existing review:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      toast.error('Vous devez être connecté pour laisser un avis');
      return;
    }

    if (rating === 0) {
      toast.error('Veuillez sélectionner une note');
      return;
    }

    if (title.trim() === '' || comment.trim() === '') {
      toast.error('Veuillez remplir tous les champs');
      return;
    }

    setLoading(true);

    try {
      // Get order_id if user has ordered the product
      let orderId = null;
      if (hasOrdered) {
        const { data: orderData } = await supabase
          .from('order_items')
          .select(
            `
            order_id,
            orders!inner(
              id,
              user_id,
              status
            )
          `
          )
          .eq('product_id', productId)
          .eq('orders.user_id', user.id)
          .in('orders.status', ['confirmed', 'shipped', 'delivered'])
          .limit(1)
          .maybeSingle();

        if (orderData) {
          orderId = orderData.order_id;
        }
      }

      // Create review
      const { error } = await supabase.from('product_reviews').insert({
        product_id: productId,
        user_id: user.id,
        order_id: orderId,
        rating,
        title: title.trim(),
        comment: comment.trim(),
        verified_purchase: hasOrdered,
        status: 'pending',
      });

      if (error) throw error;

      toast.success(
        'Votre avis a été envoyé ! Il sera publié après modération.'
      );

      // Reset form
      setRating(0);
      setTitle('');
      setComment('');

      // Notify parent
      onReviewSubmitted();

      // Refresh existing review check
      checkExistingReview();
    } catch (err: any) {
      console.error('Error submitting review:', err);
      toast.error(err.message || 'Erreur lors de l\'envoi de l\'avis');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl border border-white/10 p-8">
        <div className="text-center">
          <AlertCircle className="text-gray-400 mx-auto mb-4" size={48} />
          <h3 className="text-xl font-semibold text-white mb-2">
            Connectez-vous pour laisser un avis
          </h3>
          <p className="text-gray-400 mb-6">
            Vous devez être connecté pour partager votre expérience
          </p>
          <a
            href="/connexion"
            className="inline-block bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-full font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300"
          >
            Se connecter
          </a>
        </div>
      </div>
    );
  }

  if (checkingOrder) {
    return (
      <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl border border-white/10 p-8">
        <div className="text-center text-gray-400">
          Vérification de votre éligibilité...
        </div>
      </div>
    );
  }

  if (existingReview) {
    return (
      <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl border border-white/10 p-8">
        <div className="text-center">
          <CheckCircle className="text-green-400 mx-auto mb-4" size={48} />
          <h3 className="text-xl font-semibold text-white mb-2">
            Merci pour votre avis !
          </h3>
          <p className="text-gray-400 mb-4">
            Vous avez déjà laissé un avis pour ce produit
          </p>
          <div className="bg-white/5 rounded-lg p-4 max-w-md mx-auto">
            <div className="flex items-center gap-2 mb-2">
              {[1, 2, 3, 4, 5].map(star => (
                <Star
                  key={star}
                  size={20}
                  className={
                    star <= existingReview.rating
                      ? 'fill-blue-400 text-blue-400'
                      : 'text-gray-600'
                  }
                />
              ))}
            </div>
            <h4 className="text-white font-semibold mb-1">
              {existingReview.title}
            </h4>
            <p className="text-gray-300 text-sm">{existingReview.comment}</p>
            <div className="mt-3 text-sm">
              {existingReview.status === 'pending' && (
                <span className="text-blue-400">En attente de modération</span>
              )}
              {existingReview.status === 'approved' && (
                <span className="text-green-400">Publié</span>
              )}
              {existingReview.status === 'rejected' && (
                <span className="text-red-400">Rejeté</span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl border border-white/10 p-8">
      <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
        <Star className="text-blue-400" size={28} />
        Laisser un avis
      </h3>

      {hasOrdered && (
        <div className="mb-6 p-4 bg-green-500/10 rounded-lg border border-green-500/20">
          <div className="flex items-center gap-2 text-green-400">
            <CheckCircle size={20} />
            <span className="font-semibold">
              Vous avez commandé ce produit - Votre avis sera marqué comme "Achat
              vérifié"
            </span>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Rating */}
        <div>
          <label className="block text-white font-semibold mb-3">
            Votre note *
          </label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(star => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                onMouseEnter={() => setHoveredRating(star)}
                onMouseLeave={() => setHoveredRating(0)}
                className="transition-transform hover:scale-110"
              >
                <Star
                  size={36}
                  className={
                    star <= (hoveredRating || rating)
                      ? 'fill-blue-400 text-blue-400'
                      : 'text-gray-600 hover:text-gray-500'
                  }
                />
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <div>
          <label className="block text-white font-semibold mb-3">
            Titre de votre avis *
          </label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={100}
            placeholder="Ex: Excellent produit !"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-blue-400 focus:outline-none transition-colors"
            required
          />
          <div className="text-gray-400 text-sm mt-1">
            {title.length}/100 caractères
          </div>
        </div>

        {/* Comment */}
        <div>
          <label className="block text-white font-semibold mb-3">
            Votre avis *
          </label>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            maxLength={1000}
            rows={6}
            placeholder="Partagez votre expérience avec ce produit..."
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-blue-400 focus:outline-none transition-colors resize-none"
            required
          />
          <div className="text-gray-400 text-sm mt-1">
            {comment.length}/1000 caractères
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading || rating === 0}
          className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white px-8 py-4 rounded-full font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            'Envoi en cours...'
          ) : (
            <>
              <Send size={20} />
              Envoyer mon avis
            </>
          )}
        </button>

        <p className="text-gray-400 text-sm text-center">
          Votre avis sera vérifié par notre équipe avant publication
        </p>
      </form>
    </div>
  );
};

export default ReviewForm;
