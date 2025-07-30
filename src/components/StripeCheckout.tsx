import React, { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import {
  CreditCard,
  Lock,
  CheckCircle,
  AlertCircle,
  Calendar,
  Shield,
  User,
} from 'lucide-react';
import toast from 'react-hot-toast';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

interface CheckoutFormProps {
  amount: number;
  onSuccess: (paymentIntentId: string) => void;
  onError: (error: string) => void;
}

const CheckoutForm: React.FC<CheckoutFormProps> = ({
  amount,
  onSuccess,
  onError,
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [clientSecret, setClientSecret] = useState('');
  const [cardholderName, setCardholderName] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [cardErrors, setCardErrors] = useState({
    cardNumber: '',
    cardExpiry: '',
    cardCvc: '',
  });

  useEffect(() => {
    // Créer le PaymentIntent côté serveur
    const createPaymentIntent = async () => {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-payment-intent`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              amount: Math.round(amount * 100), // Convertir en centimes
              currency: 'eur',
            }),
          }
        );

        if (!response.ok) {
          throw new Error('Erreur lors de la création du paiement');
        }

        const data = await response.json();
        setClientSecret(data.client_secret);
      } catch (error) {
        console.error('Erreur PaymentIntent:', error);
        onError("Erreur lors de l'initialisation du paiement");
      }
    };

    if (amount > 0) {
      createPaymentIntent();
    }
  }, [amount, onError]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPaymentError('');

    if (!stripe || !elements || !clientSecret) {
      return;
    }

    if (!cardholderName.trim()) {
      setPaymentError('Veuillez saisir le nom du porteur de la carte');
      return;
    }

    setLoading(true);

    const cardNumberElement = elements.getElement(CardNumberElement);
    if (!cardNumberElement) {
      setLoading(false);
      return;
    }

    try {
      const { error, paymentIntent } = await stripe.confirmCardPayment(
        clientSecret,
        {
          payment_method: {
            card: cardNumberElement,
            billing_details: {
              name: cardholderName,
            },
          },
        }
      );

      if (error) {
        console.error('Erreur paiement:', error);

        // Messages d'erreur personnalisés en français
        let errorMessage = 'Erreur lors du paiement';
        switch (error.code) {
          case 'card_declined':
            errorMessage =
              'Votre carte a été refusée. Veuillez vérifier vos informations ou utiliser une autre carte.';
            break;
          case 'insufficient_funds':
            errorMessage = 'Fonds insuffisants sur votre carte.';
            break;
          case 'expired_card':
            errorMessage = 'Votre carte a expiré.';
            break;
          case 'incorrect_cvc':
            errorMessage = 'Le code CVC est incorrect.';
            break;
          case 'processing_error':
            errorMessage = 'Erreur de traitement. Veuillez réessayer.';
            break;
          case 'incorrect_number':
            errorMessage = 'Le numéro de carte est incorrect.';
            break;
          default:
            errorMessage = error.message || 'Erreur lors du paiement';
        }

        setPaymentError(errorMessage);
        toast.error(errorMessage);
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        toast.success('Paiement réussi !');
        onSuccess(paymentIntent.id);
      }
    } catch (err) {
      console.error('Erreur inattendue:', err);
      const errorMsg = 'Erreur inattendue lors du paiement';
      setPaymentError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const cardElementOptions = {
    style: {
      base: {
        fontSize: '16px',
        color: '#ffffff',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        '::placeholder': {
          color: '#9ca3af',
        },
        backgroundColor: 'transparent',
      },
      invalid: {
        color: '#ef4444',
        iconColor: '#ef4444',
      },
      complete: {
        color: '#10b981',
        iconColor: '#10b981',
      },
    },
  };

  const handleCardChange = (elementType: string) => (event: any) => {
    if (event.error) {
      setCardErrors(prev => ({
        ...prev,
        [elementType]: event.error.message,
      }));
    } else {
      setCardErrors(prev => ({
        ...prev,
        [elementType]: '',
      }));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Nom du porteur */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-3">
          <User className="inline mr-2" size={16} />
          Nom du porteur de la carte *
        </label>
        <input
          type="text"
          value={cardholderName}
          onChange={e => setCardholderName(e.target.value)}
          placeholder="Nom complet tel qu'il apparaît sur la carte"
          className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none transition-colors"
          required
        />
      </div>

      {/* Numéro de carte */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-3">
          <CreditCard className="inline mr-2" size={16} />
          Numéro de carte *
        </label>
        <div className="bg-white/5 border border-white/20 rounded-lg p-4 focus-within:border-blue-400 transition-colors">
          <CardNumberElement
            options={cardElementOptions}
            onChange={handleCardChange('cardNumber')}
          />
        </div>
        {cardErrors.cardNumber && (
          <p className="text-red-400 text-sm mt-2 flex items-center gap-2">
            <AlertCircle size={16} />
            {cardErrors.cardNumber}
          </p>
        )}
      </div>

      {/* Date d'expiration et CVC */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-3">
            <Calendar className="inline mr-2" size={16} />
            Date d'expiration *
          </label>
          <div className="bg-white/5 border border-white/20 rounded-lg p-4 focus-within:border-blue-400 transition-colors">
            <CardExpiryElement
              options={cardElementOptions}
              onChange={handleCardChange('cardExpiry')}
            />
          </div>
          {cardErrors.cardExpiry && (
            <p className="text-red-400 text-sm mt-2 flex items-center gap-2">
              <AlertCircle size={16} />
              {cardErrors.cardExpiry}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-3">
            <Shield className="inline mr-2" size={16} />
            Code CVC *
          </label>
          <div className="bg-white/5 border border-white/20 rounded-lg p-4 focus-within:border-blue-400 transition-colors">
            <CardCvcElement
              options={cardElementOptions}
              onChange={handleCardChange('cardCvc')}
            />
          </div>
          {cardErrors.cardCvc && (
            <p className="text-red-400 text-sm mt-2 flex items-center gap-2">
              <AlertCircle size={16} />
              {cardErrors.cardCvc}
            </p>
          )}
        </div>
      </div>

      {/* Message d'erreur de paiement */}
      {paymentError && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
          <div className="flex items-center gap-3">
            <AlertCircle className="text-red-400 flex-shrink-0" size={20} />
            <div>
              <h4 className="text-red-400 font-semibold">Erreur de paiement</h4>
              <p className="text-red-300 text-sm mt-1">{paymentError}</p>
            </div>
          </div>
        </div>
      )}

      {/* Informations de sécurité */}
      <div className="flex items-center gap-2 text-gray-400 text-sm bg-white/5 p-3 rounded-lg">
        <Lock size={16} />
        <span>
          Paiement sécurisé SSL • Vos données sont protégées par Stripe
        </span>
      </div>

      {/* Cartes de test (en mode développement) */}
      {import.meta.env.DEV && (
        <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <h4 className="text-blue-400 font-semibold mb-2 flex items-center gap-2">
            <CreditCard size={16} />
            Cartes de test (développement)
          </h4>
          <div className="text-blue-300 text-sm space-y-1">
            <p>
              • <strong>Succès :</strong> 4242 4242 4242 4242
            </p>
            <p>
              • <strong>Refusée :</strong> 4000 0000 0000 0002
            </p>
            <p>
              • <strong>Date :</strong> 12/25 • <strong>CVC :</strong> 123
            </p>
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || loading || !clientSecret || !cardholderName.trim()}
        className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-4 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            Traitement en cours...
          </>
        ) : (
          <>
            <Lock size={20} />
            Payer {amount.toFixed(2)}€ en sécurité
          </>
        )}
      </button>
    </form>
  );
};

interface StripeCheckoutProps {
  amount: number;
  onSuccess: (paymentIntentId: string) => void;
  onError: (error: string) => void;
}

const StripeCheckout: React.FC<StripeCheckoutProps> = ({
  amount,
  onSuccess,
  onError,
}) => {
  return (
    <Elements stripe={stripePromise}>
      <CheckoutForm amount={amount} onSuccess={onSuccess} onError={onError} />
    </Elements>
  );
};

export default StripeCheckout;
