/**
 * RETOUR DE PAIEMENT — l'unique endroit qui annonce au client si sa commande est passée.
 *
 * Pourquoi cette page existe :
 *
 * 1. Le tunnel ne traitait QUE `succeeded`. Un paiement en `processing` (virement
 *    instantané, certaines cartes), en `requires_action` ou refusé après authentification
 *    ne produisait STRICTEMENT RIEN : pas de message, pas de navigation, le bouton
 *    redevenait cliquable. Le client ne savait pas s'il avait payé. C'est le pire état
 *    possible sur une page de paiement — il repaie, ou il appelle.
 *
 * 2. Quand la banque exige une authentification par REDIRECTION COMPLÈTE (et non par la
 *    fenêtre 3-D Secure intégrée), le navigateur quitte le site. Sans `return_url` et sans
 *    page de retour, il revenait — s'il revenait — sur un tunnel vide, panier intact,
 *    commande jamais enregistrée côté client. Seul le webhook la rattrapait, en silence.
 *
 * Cette page est donc le point d'arrivée COMMUN aux deux chemins : paiement réglé sans
 * quitter le site, ou retour depuis la banque. Elle relit l'état auprès de Stripe — jamais
 * auprès de ce que le navigateur croit savoir — et enchaîne l'enregistrement de la commande.
 *
 * ⚠ Le `quote_id` doit survivre à un aller-retour par la banque : il voyage à la fois dans
 * l'URL de retour et dans `sessionStorage`. L'URL peut être tronquée par un intermédiaire,
 * le sessionStorage peut être vide dans un nouvel onglet ; l'un rattrape l'autre.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { CheckCircle, XCircle, Clock, Loader2, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useCart } from '../contexts/CartContext';
import { CLE_DEVIS_EN_COURS, CLE_SECRET_PAIEMENT } from '../utils/paiement';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

type Etat = 'verification' | 'reussi' | 'en_cours' | 'echec';

const PaiementRetourPage: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { clearCart } = useCart();

  const [etat, setEtat] = useState<Etat>('verification');
  const [message, setMessage] = useState('');
  const [numero, setNumero] = useState<string | null>(null);
  // Un rendu double de React 18 en développement relancerait la confirmation.
  const dejaFait = useRef(false);

  useEffect(() => {
    if (dejaFait.current) return;
    dejaFait.current = true;

    let annule = false;
    /* Un paiement `processing` n'est pas un échec : il se résout en quelques secondes.
       On le suit au lieu de renvoyer le client sur une erreur qui n'en est pas une. */
    let tentatives = 0;

    const enregistrer = async (paymentIntentId: string, quoteId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // Le paiement est passé : ne JAMAIS annoncer un échec ici. Le webhook Stripe
        // enregistre la commande de son côté ; le client la retrouvera dans son espace.
        setEtat('reussi');
        setMessage(
          "Votre paiement est accepté. Reconnectez-vous pour retrouver votre commande " +
          'dans « Mes commandes ».'
        );
        return;
      }
      const rep = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/confirmer-commande`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ quote_id: quoteId, payment_intent: paymentIntentId }),
        }
      );
      const conf = await rep.json().catch(() => null);
      if (annule) return;

      sessionStorage.removeItem(CLE_DEVIS_EN_COURS);
      try { clearCart(); } catch { /* le panier se videra au prochain chargement */ }
      setEtat('reussi');
      setNumero(conf?.order_number ?? conf?.numero ?? null);

      if (!rep.ok) {
        /* L'argent est encaissé : l'échec d'enregistrement ne doit pas se lire comme un
           échec de paiement, sinon le client repaie. Le webhook Stripe rattrape la
           commande de toute façon. */
        setMessage(
          'Votre paiement est accepté. L’enregistrement de la commande se termine ' +
          'de notre côté — elle apparaîtra dans « Mes commandes » d’ici une minute.'
        );
      }
    };

    const verifier = async (): Promise<void> => {
      const stripe = await stripePromise;
      const clientSecret =
        params.get('payment_intent_client_secret') ||
        sessionStorage.getItem(CLE_SECRET_PAIEMENT);
      const quoteId = params.get('quote_id') || sessionStorage.getItem(CLE_DEVIS_EN_COURS);

      if (!stripe || !clientSecret) {
        setEtat('echec');
        setMessage(
          "Nous n'avons pas retrouvé ce paiement. S'il a été débité, il apparaîtra dans " +
          '« Mes commandes » ; sinon, votre panier est intact.'
        );
        return;
      }

      const { paymentIntent, error } = await stripe.retrievePaymentIntent(clientSecret);
      if (annule) return;

      if (error || !paymentIntent) {
        setEtat('echec');
        setMessage(error?.message || "Impossible de lire l'état du paiement.");
        return;
      }

      switch (paymentIntent.status) {
        case 'succeeded':
          if (!quoteId) {
            // Sans devis on ne peut pas créer la commande ici — le webhook le fera.
            sessionStorage.removeItem(CLE_DEVIS_EN_COURS);
            try { clearCart(); } catch { /* le panier se videra au prochain chargement */ }
            setEtat('reussi');
            setMessage(
              'Votre paiement est accepté. Votre commande apparaîtra dans « Mes ' +
              'commandes » dans un instant.'
            );
            return;
          }
          await enregistrer(paymentIntent.id, quoteId);
          return;

        case 'processing':
          setEtat('en_cours');
          setMessage(
            'Votre banque finalise le paiement. Cette page se met à jour toute seule, ' +
            'vous pouvez la laisser ouverte.'
          );
          if (tentatives++ < 20) {
            setTimeout(() => { if (!annule) verifier(); }, 3000);
          }
          return;

        case 'requires_payment_method':
          setEtat('echec');
          setMessage(
            paymentIntent.last_payment_error?.message ||
            "Le paiement n'a pas abouti : votre banque a refusé l'opération. Aucun montant " +
            "n'a été débité et votre panier est intact."
          );
          return;

        case 'canceled':
          setEtat('echec');
          setMessage('Le paiement a été annulé. Aucun montant n’a été débité.');
          return;

        default:
          // requires_action / requires_confirmation : l'authentification n'est pas allée
          // au bout. Rien n'est débité.
          setEtat('echec');
          setMessage(
            "L'authentification auprès de votre banque n'a pas été menée à son terme. " +
            "Aucun montant n'a été débité — vous pouvez réessayer."
          );
      }
    };

    verifier().catch(() => {
      if (!annule) {
        setEtat('echec');
        setMessage('Une erreur est survenue pendant la vérification du paiement.');
      }
    });

    return () => { annule = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visuel = {
    verification: { Icone: Loader2, couleur: 'text-blue-400', anim: 'animate-spin' },
    reussi:       { Icone: CheckCircle, couleur: 'text-green-400', anim: '' },
    en_cours:     { Icone: Clock, couleur: 'text-orange-400', anim: '' },
    echec:        { Icone: XCircle, couleur: 'text-red-400', anim: '' },
  }[etat];

  const titre = {
    verification: 'Vérification de votre paiement…',
    reussi: 'Paiement accepté',
    en_cours: 'Paiement en cours de traitement',
    echec: "Le paiement n'a pas abouti",
  }[etat];

  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24 pb-16">
      <div className="container mx-auto px-6 max-w-xl">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
          <visuel.Icone className={`mx-auto mb-5 ${visuel.couleur} ${visuel.anim}`} size={56} />
          <h1 className="text-2xl font-bold text-white mb-3">{titre}</h1>

          {etat === 'reussi' && !message && (
            <p className="text-gray-300 leading-relaxed">
              Merci — votre commande est enregistrée{numero ? ` sous le numéro ${numero}` : ''}.
              Vous recevez sa confirmation par e-mail, avec votre facture.
            </p>
          )}
          {message && <p className="text-gray-300 leading-relaxed">{message}</p>}

          {etat === 'verification' && (
            <p className="text-gray-500 text-sm mt-3">
              Ne fermez pas cette page.
            </p>
          )}

          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            {etat === 'echec' ? (
              <>
                <button
                  onClick={() => navigate('/commande')}
                  className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-lg font-semibold"
                >
                  Reprendre ma commande
                </button>
                <Link
                  to="/panier"
                  className="bg-white/5 hover:bg-white/10 text-gray-200 px-6 py-3 rounded-lg font-semibold"
                >
                  Revoir mon panier
                </Link>
              </>
            ) : etat === 'reussi' ? (
              <>
                <Link
                  to="/commandes"
                  className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-lg font-semibold"
                >
                  Voir ma commande
                </Link>
                <Link
                  to="/produits"
                  className="bg-white/5 hover:bg-white/10 text-gray-200 px-6 py-3 rounded-lg font-semibold flex items-center justify-center gap-2"
                >
                  <ArrowLeft size={16} /> Continuer mes achats
                </Link>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaiementRetourPage;
