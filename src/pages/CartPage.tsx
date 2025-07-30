import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import {
  Minus,
  Plus,
  Trash2,
  ShoppingBag,
  ArrowLeft,
  CreditCard,
  MapPin,
  Plus as PlusIcon,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import AddressManager from '../components/AddressManager';
import StripeCheckout from '../components/StripeCheckout';
import toast from 'react-hot-toast';

const CartPage = () => {
  const { items, updateQuantity, removeFromCart, totalItems, clearCart } =
    useCart();
  const { user, userType } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showAddressManager, setShowAddressManager] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<any>(null);

  const handleCheckoutClick = () => {
    if (!user) {
      toast.error('Veuillez vous connecter pour passer commande');
      navigate('/connexion');
      return;
    }

    if (items.length === 0) {
      toast.error('Votre panier est vide');
      return;
    }

    setShowCheckout(true);
  };

  const handlePaymentSuccess = async (paymentIntentId: string) => {
    setLoading(true);
    const toastId = toast.loading('Finalisation de votre commande...');

    try {
      // Étape 1 : Récupérer le token d'authentification de l'utilisateur
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        throw new Error(
          'Session utilisateur introuvable. Veuillez vous reconnecter.'
        );
      }

      // Étape 2 : Récupérer le Charge ID depuis notre fonction backend sécurisée
      let chargeId = '';
      try {
        const chargeResponse = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-charge-id`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`, // Envoi du token
            },
            body: JSON.stringify({ paymentIntentId }),
          }
        );

        if (chargeResponse.ok) {
          const chargeData = await chargeResponse.json();
          chargeId = chargeData.chargeId;
          console.log('✅ Charge ID récupéré avec succès:', chargeId);
        } else {
          const errorData = await chargeResponse.json();
          console.error('Erreur retournée par get-charge-id:', errorData);
          // On informe l'utilisateur mais on continue le processus pour ne pas bloquer la commande
          toast.warn('Impossible de récupérer tous les détails du paiement.');
        }
      } catch (e) {
        console.error("Erreur critique lors de l'appel à get-charge-id:", e);
      }

      const totals = calculateTotals();

      // Étape 3 : Créer la commande dans la base de données
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          user_id: user.id,
          stripe_payment_intent_id: paymentIntentId,
          sub_total: totals.subTotal,
          tax: totals.tax,
          total: totals.total,
          status: 'confirmed',
          user_type: userType,
          shipping_address: selectedAddress
            ? {
                name: selectedAddress.name,
                first_name: selectedAddress.first_name,
                last_name: selectedAddress.last_name,
                company: selectedAddress.company,
                address_line_1: selectedAddress.address_line_1,
                address_line_2: selectedAddress.address_line_2,
                city: selectedAddress.city,
                postal_code: selectedAddress.postal_code,
                country: selectedAddress.country,
                phone: selectedAddress.phone,
              }
            : null,
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Étape 4 : Créer l'enregistrement de paiement de manière complète et fiable
      const { error: paymentRecordError } = await supabase
        .from('payment_records')
        .insert({
          invoice_id: null,
          order_id: order.id, // Lier à la commande
          amount: totals.total,
          payment_date: new Date().toISOString(),
          payment_method: 'carte',
          status: 'succeeded', // Ajouter un statut clair
          reference: paymentIntentId, // Garder le Payment Intent comme référence
          stripe_charge_id: chargeId || null, // Le Charge ID, crucial pour les remboursements
          created_by: user.id,
          notes: `Paiement pour la commande ${order.id}`,
        });

      if (paymentRecordError) {
        // Log l'erreur mais ne bloque pas l'utilisateur qui a déjà payé
        console.error(
          "Erreur lors de la création de l'enregistrement de paiement:",
          paymentRecordError
        );
      } else {
        console.log('✅ Enregistrement de paiement créé avec succès.');
      }

      // Créer les items de la commande
      const orderItems = items.map(item => ({
        order_id: order.id,
        product_id: item.product_id,
        quantity: item.quantity,
        price:
          userType === 'pro'
            ? item.product?.price_ht || item.product?.price || 0
            : item.product?.price || 0,
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);
      if (itemsError) throw itemsError;

      // Vider le panier
      await clearCart();

      toast.success('Commande passée avec succès !', { id: toastId });
      navigate('/commandes');
    } catch (err: any) {
      console.error('Erreur inattendue lors de la finalisation:', err);
      toast.error(err.message || 'Erreur inattendue lors de la commande', {
        id: toastId,
      });
    } finally {
      setLoading(false);
      setShowCheckout(false);
    }
  };

  const handlePaymentError = (error: string) => {
    toast.error(error);
    setShowCheckout(false);
  };

  const getItemPrice = (item: any) => {
    if (userType === 'pro' && item.product?.price_ht) {
      return item.product.price_ht;
    }
    return userType === 'pro'
      ? (item.product?.price || 0) / 1.2
      : item.product?.price || 0;
  };

  const calculateTotals = () => {
    const itemsTotal = items.reduce(
      (sum, item) => sum + getItemPrice(item) * item.quantity,
      0
    );

    if (userType === 'pro') {
      const subTotal = itemsTotal;
      const tax = subTotal * 0.2;
      const total = subTotal + tax;
      return { subTotal, tax, total, label: 'HT' };
    } else {
      const total = itemsTotal;
      const subTotal = total / 1.2;
      const tax = total - subTotal;
      return { subTotal, tax, total, label: 'TTC' };
    }
  };

  const totals = calculateTotals();

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24 flex items-center justify-center">
        <div className="text-center">
          <ShoppingBag className="text-gray-400 mx-auto mb-4" size={64} />
          <h2 className="text-2xl font-bold text-white mb-4">
            Connectez-vous pour voir votre panier
          </h2>
          <Link
            to="/connexion"
            className="bg-gradient-to-r from-yellow-400 to-orange-500 text-black px-6 py-3 rounded-full font-semibold"
          >
            Se connecter
          </Link>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24 flex items-center justify-center">
        <div className="text-center">
          <ShoppingBag className="text-gray-400 mx-auto mb-4" size={64} />
          <h2 className="text-2xl font-bold text-white mb-4">
            Votre panier est vide
          </h2>
          <p className="text-gray-400 mb-6">
            Découvrez nos produits et machines professionnelles
          </p>
          <Link
            to="/produits"
            className="bg-gradient-to-r from-yellow-400 to-orange-500 text-black px-6 py-3 rounded-full font-semibold"
          >
            Voir nos produits
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24">
      <div className="container mx-auto px-6 py-12">
        <div className="mb-8">
          <Link
            to="/produits"
            className="flex items-center gap-2 text-gray-400 hover:text-yellow-400 transition-colors w-fit mb-4"
          >
            <ArrowLeft size={20} />
            Continuer mes achats
          </Link>
          <h1 className="text-4xl font-bold text-white">
            Mon Panier ({totalItems} article{totalItems > 1 ? 's' : ''})
          </h1>
          <div className="mt-2 text-gray-400">
            Affichage:{' '}
            {userType === 'pro'
              ? 'Prix HT (Professionnel)'
              : 'Prix TTC (Particulier)'}
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Cart Items */}
          <div className="lg:col-span-2 space-y-4">
            {items.map(item => (
              <div
                key={item.id}
                className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-6 border border-white/10"
              >
                <div className="flex items-center gap-6">
                  <img
                    src={
                      item.product?.image
                        ? item.product.image.startsWith('/')
                          ? item.product.image
                          : `/${item.product.image}`
                        : 'https://images.pexels.com/photos/1181467/pexels-photo-1181467.jpeg'
                    }
                    alt={item.product?.name}
                    className="w-20 h-20 object-cover rounded-lg"
                  />

                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-white mb-2">
                      {item.product?.name}
                    </h3>
                    <p className="text-gray-400 text-sm mb-3">
                      {item.product?.description}
                    </p>
                    <div className="text-yellow-400 font-bold text-lg">
                      {getItemPrice(item).toFixed(2)}€ {totals.label}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 bg-white/10 rounded-lg p-2">
                      <button
                        onClick={() =>
                          updateQuantity(item.product_id, item.quantity - 1)
                        }
                        className="text-white hover:text-yellow-400 transition-colors"
                      >
                        <Minus size={16} />
                      </button>
                      <span className="text-white font-semibold w-8 text-center">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() =>
                          updateQuantity(item.product_id, item.quantity + 1)
                        }
                        className="text-white hover:text-yellow-400 transition-colors"
                      >
                        <Plus size={16} />
                      </button>
                    </div>

                    <div className="text-white font-bold text-lg min-w-[80px] text-right">
                      {(getItemPrice(item) * item.quantity).toFixed(2)}€{' '}
                      {totals.label}
                    </div>

                    <button
                      onClick={() => removeFromCart(item.product_id)}
                      className="text-red-400 hover:text-red-300 transition-colors p-2"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-6 border border-white/10 sticky top-24">
              <h3 className="text-2xl font-bold text-white mb-6">
                Récapitulatif
              </h3>

              <div className="space-y-4 mb-6">
                <div className="flex justify-between text-gray-300">
                  <span>Sous-total</span>
                  <span>{totals.subTotal.toFixed(2)}€ HT</span>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>TVA (20%)</span>
                  <span>{totals.tax.toFixed(2)}€</span>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>Livraison</span>
                  <span className="text-green-400">Gratuite</span>
                </div>
                <div className="border-t border-white/20 pt-4">
                  <div className="flex justify-between text-xl font-bold text-white">
                    <span>Total TTC</span>
                    <span>{totals.total.toFixed(2)}€</span>
                  </div>
                </div>
              </div>

              <button
                onClick={handleCheckoutClick}
                disabled={loading}
                className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-4 rounded-full font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 mb-4 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <CreditCard size={20} />
                Passer la Commande
              </button>

              <p className="text-gray-400 text-sm text-center">
                Paiement sécurisé • Livraison gratuite • Garantie OMEGA
              </p>

              <div className="mt-6 p-4 bg-gradient-to-r from-green-500/10 to-blue-500/10 rounded-lg border border-green-500/20">
                <h4 className="text-green-400 font-semibold mb-2">
                  ✓ Garanties Incluses
                </h4>
                <ul className="text-gray-300 text-sm space-y-1">
                  <li>• Garantie 10 ans sur les machines</li>
                  <li>• Livraison gratuite en France</li>
                  <li>• Support technique inclus</li>
                  <li>• Retour sous 30 jours</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Stripe Checkout Modal */}
        {showCheckout && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 border border-white/10 max-w-md w-full">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-white">
                  Paiement Sécurisé
                </h3>
                <button
                  onClick={() => setShowCheckout(false)}
                  className="text-gray-400 hover:text-white transition-colors text-2xl"
                >
                  ×
                </button>
              </div>

              <div className="mb-6 p-4 bg-white/5 rounded-lg">
                <div className="flex justify-between text-white mb-2">
                  <span>Total à payer:</span>
                  <span className="font-bold text-xl">
                    {totals.total.toFixed(2)}€
                  </span>
                </div>
                <div className="text-gray-400 text-sm">
                  TVA incluse • Paiement sécurisé par Stripe
                </div>
              </div>

              <StripeCheckout
                amount={totals.total}
                onSuccess={handlePaymentSuccess}
                onError={handlePaymentError}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CartPage;
