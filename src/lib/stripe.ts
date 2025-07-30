import { loadStripe } from '@stripe/stripe-js';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

export const getStripe = () => stripePromise;

export const createPaymentIntent = async (amount: number, currency = 'eur') => {
  try {
    const response = await fetch('/api/create-payment-intent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: Math.round(amount * 100), // Stripe utilise les centimes
        currency,
      }),
    });

    if (!response.ok) {
      throw new Error('Erreur lors de la création du paiement');
    }

    return await response.json();
  } catch (error) {
    console.error('Erreur Stripe:', error);
    throw error;
  }
};
