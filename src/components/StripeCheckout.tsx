import React, { useState, useEffect, useRef } from 'react';
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
import { supabase } from '../lib/supabase';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

// MODE TEST Stripe : détecté par la clé publiable (pk_test_…). Affiché même en
// production pour que personne ne croie payer réellement pendant les essais.
const STRIPE_TEST_MODE = String(
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || ''
).startsWith('pk_test_');

/* ⚠ LE MONTANT N'EST PLUS UN PARAMÈTRE.
   Avant, ce composant recevait `amount` et le transmettait à `create-payment-intent`,
   qui créait le paiement pour cette somme. Le montant venait donc du navigateur : on
   pouvait payer 0,50 € une machine à 1 900 €.
   Désormais il envoie seulement DES IDENTIFIANTS DE PRODUIT ET DES QUANTITÉS à la
   fonction `devis-commande`, qui relit les prix en base, calcule la TVA selon le pays
   et le statut du client, ajoute les frais de port, et renvoie le montant qu'ELLE a
   arrêté. `recapitulatif` est remonté au panier pour que l'affichage montre exactement
   ce qui sera débité — un écart entre les deux serait la porte ouverte aux litiges. */
export interface LigneDevis {
  product_id: string;
  quantity: number;
}
export interface RecapitulatifDevis {
  produits_ht: number;
  port_ht: number;
  port_ttc: number;
  port_libelle: string;
  base_ht: number;
  taux_tva: number;
  tva: number;
  total_ttc: number;
  regime: string;
  mention: string | null;
  territoire: string | null;
}

interface CheckoutFormProps {
  items: LigneDevis[];
  addressId: string;
  express?: boolean;
  onQuote?: (recap: RecapitulatifDevis) => void;
  onSuccess: (paymentIntentId: string, quoteId: string) => void;
  onError: (error: string) => void;
}

const CheckoutForm: React.FC<CheckoutFormProps> = ({
  items,
  addressId,
  express,
  onQuote,
  onSuccess,
  onError,
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [clientSecret, setClientSecret] = useState('');
  const [quoteId, setQuoteId] = useState('');
  const [recap, setRecap] = useState<RecapitulatifDevis | null>(null);
  const [cardholderName, setCardholderName] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [isCreatingIntent, setIsCreatingIntent] = useState(false);
  const [cardErrors, setCardErrors] = useState({
    cardNumber: '',
    cardExpiry: '',
    cardCvc: '',
  });

  // Génération d'une clé d'idempotence UNIQUE et PERSISTANTE pour cette instance
  const idempotencyKeyRef = useRef<string>(
    `pi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  );

  useEffect(() => {
    // PROTECTION : Créer le PaymentIntent UNE SEULE FOIS avec clé d'idempotence
    let isMounted = true;

    const createPaymentIntent = async () => {
      // Si déjà en cours de création ou déjà créé, ne rien faire
      if (isCreatingIntent || clientSecret) {
        console.log('⚠️ PaymentIntent déjà en cours ou créé, skip');
        return;
      }

      setIsCreatingIntent(true);

      // Utiliser la clé d'idempotence persistante
      const idempotencyKey = idempotencyKeyRef.current;

      try {
        /* ⚠ JETON DE L'UTILISATEUR, pas la clé anon : la fonction doit savoir QUI
           commande, pour lire son statut d'entreprise, la validité de son numéro de
           TVA et vérifier que l'adresse lui appartient. */
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Session expirée — reconnectez-vous.');

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/devis-commande`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
              'Idempotency-Key': idempotencyKey,
            },
            body: JSON.stringify({ items, address_id: addressId, express: !!express }),
          }
        );

        const data = await response.json();
        if (!response.ok) {
          // Le serveur explique POURQUOI (stock, pays non desservi, adresse) : on
          // remonte son message tel quel, il est écrit pour le client.
          throw new Error(data?.error || 'Erreur lors de la création du paiement');
        }

        if (isMounted) {
          setClientSecret(data.client_secret);
          setQuoteId(data.quote_id);
          setRecap(data.recapitulatif || null);
          if (data.recapitulatif && onQuote) onQuote(data.recapitulatif);
        }
      } catch (error) {
        console.error('Erreur préparation paiement', error);
        if (isMounted) {
          onError(error instanceof Error ? error.message : "Erreur lors de l'initialisation du paiement");
        }
      } finally {
        if (isMounted) {
          setIsCreatingIntent(false);
        }
      }
    };

    if (items.length > 0 && addressId && !clientSecret && !isCreatingIntent) {
      createPaymentIntent();
    }

    // Cleanup function pour éviter les mises à jour sur composant démonté
    return () => {
      isMounted = false;
    };
    // Le devis est demandé UNE fois par ouverture du paiement (le parent remonte une clé
    // à chaque ouverture). On ne dépend pas de `items` : une variation de référence
    // relancerait la préparation en boucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressId]);

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
        // Le devis accompagne le paiement : c'est LUI qui porte les montants et le
        // régime de TVA, et c'est à partir de lui que la commande sera créée.
        onSuccess(paymentIntent.id, quoteId);
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
      {/* Bandeau MODE TEST : visible dès que la clé Stripe est une clé de test */}
      {STRIPE_TEST_MODE && (
        <div className="p-4 bg-orange-500/15 border border-orange-400/40 rounded-lg">
          <div className="flex items-center gap-3">
            <AlertCircle className="text-orange-400 flex-shrink-0" size={20} />
            <div>
              <h4 className="text-orange-300 font-semibold">
                Paiement en MODE TEST
              </h4>
              <p className="text-orange-200/80 text-sm mt-1">
                Aucun débit réel ne sera effectué. Utilisez la carte de test
                4242 4242 4242 4242 (date future, CVC 123).
              </p>
            </div>
          </div>
        </div>
      )}

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

      {/* Cartes de test : en dev local OU dès que la clé Stripe est en mode test */}
      {(import.meta.env.DEV || STRIPE_TEST_MODE) && (
        <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <h4 className="text-blue-400 font-semibold mb-2 flex items-center gap-2">
            <CreditCard size={16} />
            Cartes de test Stripe
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
            {/* Le montant affiché est CELUI DU SERVEUR : le bouton ne peut pas annoncer
                un prix différent de ce qui sera débité. */}
            Payer {recap ? recap.total_ttc.toFixed(2) : '…'}€ en sécurité
          </>
        )}
      </button>
    </form>
  );
};

interface StripeCheckoutProps {
  items: LigneDevis[];
  addressId: string;
  express?: boolean;
  onQuote?: (recap: RecapitulatifDevis) => void;
  onSuccess: (paymentIntentId: string, quoteId: string) => void;
  onError: (error: string) => void;
}

const StripeCheckout: React.FC<StripeCheckoutProps> = ({
  items,
  addressId,
  express,
  onQuote,
  onSuccess,
  onError,
}) => {
  return (
    <Elements stripe={stripePromise}>
      <CheckoutForm
        items={items}
        addressId={addressId}
        express={express}
        onQuote={onQuote}
        onSuccess={onSuccess}
        onError={onError}
      />
    </Elements>
  );
};

export default StripeCheckout;
