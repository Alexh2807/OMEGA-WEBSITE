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
  Truck,
  Plus as PlusIcon,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import AddressManager from '../components/AddressManager';
import StripeCheckout, {
  type RecapitulatifDevis,
} from '../components/StripeCheckout';
import VitrineCTA from '../components/VitrineCTA';
import AchatEntreprise from '../components/AchatEntreprise';
import { useSiteSettings } from '../contexts/SiteSettingsContext';
import { computeShipping } from '../utils/shipping';
import toast from 'react-hot-toast';
import { EURO } from '../utils/prix';

const CartPage = () => {
  const { items, updateQuantity, removeFromCart, totalItems, clearCart } =
    useCart();
  const { user, affichagePrix } = useAuth();
  const { vitrineMode, shippingConfig } = useSiteSettings();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showAddressManager, setShowAddressManager] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<any>(null);
  const [expressShipping, setExpressShipping] = useState(false);
  const [checkoutKey, setCheckoutKey] = useState(0); // Pour forcer la re-création du composant
  /* Récapitulatif calculé PAR LE SERVEUR (TVA du pays du client, port, total). Il fait
     autorité sur l'affichage : les totaux calculés localement ne servent qu'à donner un
     ordre d'idée avant que l'adresse ne soit connue. */
  const [recapServeur, setRecapServeur] = useState<RecapitulatifDevis | null>(null);

  /* ★ APERÇU DU DEVIS dès que l'adresse (ou le statut d'entreprise) est connue.
     Le panier annonçait « TVA selon votre adresse » et le gardait même une fois
     l'adresse choisie : le client ne connaissait son taux qu'en ouvrant la fenêtre de
     paiement. C'est le SERVEUR qui répond — le navigateur ne recalcule rien — mais en
     mode aperçu : aucun devis ni paiement n'est créé tant qu'on ne commande pas. */
  const demanderApercu = React.useCallback(async () => {
    if (!user || !selectedAddress || items.length === 0) { setRecapServeur(null); return; }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const r = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/devis-commande`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({
            items: items.map(i => ({ product_id: i.product_id, quantity: i.quantity })),
            address_id: selectedAddress.id,
            express: expressShipping,
            apercu: true,
          }),
        }
      );
      const j = await r.json();
      if (r.ok && j?.recapitulatif) setRecapServeur(j.recapitulatif);
    } catch {
      // Un aperçu qui échoue ne doit rien casser : on retombe sur « selon votre adresse ».
    }
    /* ⚠ On dépend du CONTENU du panier, pas de la référence du tableau : `items` est
       recréé à chaque rendu, et l'aperçu partirait en boucle. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, selectedAddress?.id, expressShipping,
      items.map(i => `${i.product_id}x${i.quantity}`).join('|')]);

  React.useEffect(() => { demanderApercu(); }, [demanderApercu]);

  const handleCheckoutClick = () => {
    if (vitrineMode) return; // vente en ligne désactivée
    if (!user) {
      toast.error('Veuillez vous connecter pour passer commande');
      navigate('/connexion');
      return;
    }

    if (items.length === 0) {
      toast.error('Votre panier est vide');
      return;
    }

    // ADRESSE DE LIVRAISON OBLIGATOIRE (P1 audit : les commandes partaient
    // avec shipping_address null — impossibles à expédier) + nécessaire au
    // calcul des frais des gros produits (zone proche / longue distance).
    if (!selectedAddress) {
      toast.error('Sélectionnez votre adresse de livraison');
      setShowAddressManager(true);
      return;
    }
    if (shipping.needsQuote) {
      toast.error(
        'Cette destination nécessite un devis de livraison — contactez-nous.'
      );
      return;
    }
    if (shipping.cost === null) {
      toast.error('Frais de livraison indéterminés — vérifiez votre adresse');
      return;
    }

    // PROTECTION : Forcer une nouvelle instance du composant Stripe à chaque ouverture
    setCheckoutKey(prev => prev + 1);
    setShowCheckout(true);
  };

  /* ⚠ LA COMMANDE N'EST PLUS CRÉÉE PAR LE NAVIGATEUR.
     Avant, cette fonction insérait la commande avec `sub_total`, `tax` et `total`
     calculés côté client : n'importe qui pouvait enregistrer une commande de 1 € pour
     une machine à 1 900 €, ou une TVA nulle.
     Désormais on appelle `confirmer_commande(devis, paiement)` : le serveur recopie les
     montants ET le régime de TVA depuis le DEVIS qu'il avait lui-même calculé. Le
     navigateur ne transmet que deux identifiants. La fonction est idempotente : un
     double clic, un retour arrière ou une reprise après coupure ne créent pas de
     seconde commande. */
  const handlePaymentSuccess = async (
    paymentIntentId: string,
    quoteId: string
  ) => {
    setLoading(true);
    const toastId = toast.loading('Finalisation de votre commande...');

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        throw new Error(
          'Session utilisateur introuvable. Veuillez vous reconnecter.'
        );
      }

      /* ★ La commande est enregistrée par le SERVEUR, qui vérifie d'abord auprès de
         Stripe que le paiement a réellement abouti et pour le bon montant.
         Avant, le navigateur appelait directement la fonction SQL : elle ne contrôlait
         que la propriété du devis, jamais le paiement. On obtenait donc une commande
         « confirmée » sans payer un centime. */
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
      const conf = await rep.json();
      if (!rep.ok) throw new Error(conf?.error || 'Commande non enregistrée.');
      const orderId = (conf as { order_id?: string } | null)?.order_id;
      if (!orderId) throw new Error('Commande introuvable après paiement.');
      const dejaCreee = (conf as { deja_creee?: boolean } | null)?.deja_creee;

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
          // toast.warn n'existe pas dans react-hot-toast (levait une exception silencieuse)
          toast('Impossible de récupérer tous les détails du paiement.', { icon: '⚠️' });
        }
      } catch (e) {
        console.error("Erreur critique lors de l'appel à get-charge-id:", e);
      }

      /* Trace du paiement. Le montant est relu SUR LA COMMANDE (donc sur le devis
         serveur), jamais recalculé ici : deux calculs, ce sont deux vérités.
         Un échec n'interrompt pas le parcours — le client a payé et sa commande
         existe ; il ne doit pas voir d'erreur pour un enregistrement annexe. */
      if (!dejaCreee) {
        const { data: cmd } = await supabase
          .from('orders')
          .select('total')
          .eq('id', orderId)
          .single();

        const { error: paymentRecordError } = await supabase
          .from('payment_records')
          .insert({
            invoice_id: null,
            order_id: orderId,
            amount: cmd?.total ?? null,
            payment_date: new Date().toISOString(),
            payment_method: 'carte',
            status: 'succeeded',
            reference: paymentIntentId,
            stripe_charge_id: chargeId || null, // crucial pour les remboursements
            created_by: user?.id ?? null,
            notes: `Paiement pour la commande ${orderId}`,
          });

        if (paymentRecordError) {
          console.error(
            "Erreur lors de la création de l'enregistrement de paiement:",
            paymentRecordError
          );
        }
      }

      // Les lignes de commande ont été créées par `confirmer_commande`, à partir du
      // devis : rien à insérer ici.
      await clearCart();

      toast.success(
        dejaCreee
          ? 'Votre commande était déjà enregistrée.'
          : 'Commande passée avec succès !',
        { id: toastId }
      );
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
    if (affichagePrix === 'ht' && item.product?.price_ht) {
      return item.product.price_ht;
    }
    return affichagePrix === 'ht'
      ? (item.product?.price || 0) / 1.2
      : item.product?.price || 0;
  };

  const calculateTotals = () => {
    const itemsTotal = items.reduce(
      (sum, item) => sum + getItemPrice(item) * item.quantity,
      0
    );

    if (affichagePrix === 'ht') {
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

  // FRAIS DE LIVRAISON : colis = barème au poids total ; palette/encombrant =
  // tarif par unité selon la zone (distance calculée depuis le code postal,
  // Europe selon le pays, DOM/hors Europe = devis). Barèmes configurables
  // dans Admin → Paramètres → Livraison.
  const shipping = computeShipping(
    items.map(item => {
      const p = item.product as
        | { shipping_class?: string; weight_kg?: number | null }
        | undefined;
      return {
        shipping_class: p?.shipping_class,
        weight_kg: p?.weight_kg,
        quantity: item.quantity,
      };
    }),
    selectedAddress
      ? {
          postal_code: selectedAddress.postal_code,
          country: selectedAddress.country,
        }
      : null,
    shippingConfig,
    { express: expressShipping }
  );
  // Total encaissé = produits TTC + livraison (tarifs livraison exprimés TTC).
  const grandTotal = totals.total + (shipping.cost ?? 0);

  // MODE VITRINE : le panier n'existe plus — on oriente vers le devis / l'appel.
  // (AVANT le test de connexion : la vitrine s'applique à tout le monde.)
  if (vitrineMode) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24 flex items-center justify-center px-6">
        <div className="text-center max-w-lg">
          <ShoppingBag className="text-gray-400 mx-auto mb-4" size={64} />
          <h2 className="text-2xl font-bold text-white mb-4">
            La vente en ligne est momentanément désactivée
          </h2>
          <p className="text-gray-400 mb-8">
            Tous nos produits restent disponibles : demandez un devis gratuit
            via le formulaire de contact, ou appelez-nous directement.
          </p>
          <VitrineCTA />
        </div>
      </div>
    );
  }

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
            className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-full font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all"
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
            className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-full font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all"
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
            className="flex items-center gap-2 text-gray-400 hover:text-blue-400 transition-colors w-fit mb-4"
          >
            <ArrowLeft size={20} />
            Continuer mes achats
          </Link>
          <h1 className="text-4xl font-bold text-white">
            Mon Panier ({totalItems} article{totalItems > 1 ? 's' : ''})
          </h1>
          <div className="mt-2 text-gray-400">
            Affichage:{' '}
            {affichagePrix === 'ht'
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
                    <div className="text-blue-400 font-bold text-lg">
                      {getItemPrice(item).toLocaleString('fr-FR', EURO)} {totals.label}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 bg-white/10 rounded-lg p-2">
                      <button
                        onClick={() =>
                          updateQuantity(item.product_id, item.quantity - 1)
                        }
                        className="text-white hover:text-blue-400 transition-colors"
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
                        className="text-white hover:text-blue-400 transition-colors"
                      >
                        <Plus size={16} />
                      </button>
                    </div>

                    <div className="text-white font-bold text-lg min-w-[80px] text-right">
                      {(getItemPrice(item) * item.quantity).toLocaleString('fr-FR', EURO)}{' '}
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

              {/* Statut d'achat : c'est LUI qui décide de la TVA, il doit donc être ici,
                  au-dessus du montant, et non caché dans la page Compte. Tout changement
                  invalide le devis en cours — on force une nouvelle demande au serveur. */}
              <AchatEntreprise
                onChangement={() => {
                  /* Le statut change ⇒ le taux change. On vide l'ancien récapitulatif ET
                     on en redemande un aussitôt : le vider seul laissait le panier sur
                     « TVA selon votre adresse » alors que le serveur savait répondre. */
                  setRecapServeur(null);
                  setCheckoutKey(prev => prev + 1);
                  demanderApercu();
                }}
              />

              {/* Adresse de livraison — OBLIGATOIRE avant paiement */}
              <div className="mb-6 p-4 bg-white/5 rounded-lg border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-white font-semibold">
                    <MapPin size={18} className="text-blue-400" />
                    Adresse de livraison
                  </div>
                  <button
                    onClick={() => setShowAddressManager(true)}
                    className="text-blue-400 hover:text-blue-300 text-sm font-medium"
                  >
                    {selectedAddress ? 'Modifier' : 'Choisir'}
                  </button>
                </div>
                {selectedAddress ? (
                  <div className="text-gray-300 text-sm leading-relaxed">
                    {selectedAddress.first_name} {selectedAddress.last_name}
                    <br />
                    {selectedAddress.address_line_1}
                    {selectedAddress.address_line_2 ? <><br />{selectedAddress.address_line_2}</> : null}
                    <br />
                    {selectedAddress.postal_code} {selectedAddress.city}
                  </div>
                ) : (
                  <div className="text-orange-300 text-sm">
                    Sélectionnez une adresse pour calculer la livraison.
                  </div>
                )}
              </div>

              <div className="space-y-4 mb-6">
                <div className="flex justify-between text-gray-300">
                  <span>Sous-total produits</span>
                  <span>{totals.subTotal.toLocaleString('fr-FR', EURO)} HT</span>
                </div>
                {/* ⚠ Ne JAMAIS affirmer « TVA (20 %) » ici : à ce stade le navigateur ne
                    connaît pas le régime. Une entreprise européenne au numéro vérifié paie
                    0 %, un client des DOM aussi. C'est `regime_tva`, côté serveur, qui
                    tranche — et son verdict n'arrive qu'avec le récapitulatif de paiement.
                    Afficher 20 % faisait lire au client un montant qu'il n'allait pas payer. */}
                <div className="flex justify-between text-gray-300">
                  <span>
                    TVA
                    {recapServeur
                      ? ` (${Number(recapServeur.taux_tva).toLocaleString('fr-FR')} %)`
                      : ''}
                  </span>
                  {recapServeur ? (
                    <span>{recapServeur.tva.toLocaleString('fr-FR', EURO)}</span>
                  ) : (
                    <span className="text-sm text-gray-400">selon votre adresse</span>
                  )}
                </div>
                <div className="flex justify-between text-gray-300">
                  <span className="flex items-center gap-2">
                    <Truck size={16} className="text-blue-400" />
                    Livraison
                  </span>
                  {/* Le barème de livraison est exprimé en TTC : on le DIT, sinon ce
                      montant se lisait comme un HT et venait grossir un total mélangé. */}
                  <span>
                    {shipping.needsQuote
                      ? 'Sur devis'
                      : shipping.cost !== null
                        ? `${shipping.cost.toLocaleString('fr-FR', EURO)} TTC`
                        : 'Selon adresse'}
                  </span>
                </div>
                {shipping.label && (
                  <div className="text-xs text-gray-400 -mt-2">
                    {shipping.label}
                    {!shipping.needsQuote &&
                      ` · Expédition sous ${shippingConfig.delay_days} jours`}
                  </div>
                )}
                {shipping.expressAvailable && (
                  <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                    <input
                      type="checkbox"
                      checked={expressShipping}
                      onChange={e => setExpressShipping(e.target.checked)}
                      className="accent-blue-500"
                    />
                    Livraison Express Europe (
                    {(shippingConfig.pallet_zones.express_eu * shipping.palletUnits).toFixed(2)}
                    €)
                  </label>
                )}
                {shipping.needsQuote && (
                  <div className="text-xs text-orange-300 -mt-1">
                    Destination hors zones automatiques (DOM-TOM / hors
                    Europe) : contactez-nous pour un devis de transport.
                  </div>
                )}
                <div className="border-t border-white/20 pt-4">
                  {/* ⚠ Pas de « total » ici. Les produits sont en HT, le barème de
                      livraison en TTC, et le taux de TVA n'est pas encore connu :
                      additionner les trois donnerait un chiffre qui ne veut rien dire et
                      qui ne correspondrait pas au montant débité. Le total exact — celui
                      qu'arrête le serveur — s'affiche au clic suivant, avant toute
                      saisie de carte. */}
                  <div className="flex justify-between text-white">
                    <span className="font-semibold text-xl">Total à payer</span>
                    {recapServeur ? (
                      <span className="font-bold text-xl">
                        {recapServeur.total_ttc.toLocaleString('fr-FR', EURO)}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">à l'étape suivante</span>
                    )}
                  </div>
                  {recapServeur?.mention && (
                    <p className="text-emerald-300 text-xs mt-2 leading-relaxed">
                      {recapServeur.mention}
                    </p>
                  )}
                  {recapServeur?.refus_exoneration && (
                    <p className="text-amber-300 text-xs mt-2 leading-relaxed">
                      {recapServeur.refus_exoneration}
                    </p>
                  )}
                  {!recapServeur && (
                    <p className="text-xs text-gray-400 mt-2">
                      Le montant exact, TVA et livraison comprises, s'affiche dès que vous
                      aurez choisi votre adresse de livraison.
                    </p>
                  )}
                </div>
              </div>

              {shipping.needsQuote ? (
                <Link
                  to="/contact?sujet=devis"
                  className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-4 rounded-full font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 mb-4 flex items-center justify-center gap-2"
                >
                  <Truck size={20} />
                  Demander un devis livraison
                </Link>
              ) : (
                <button
                  onClick={handleCheckoutClick}
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-4 rounded-full font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 mb-4 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <CreditCard size={20} />
                  {selectedAddress ? 'Passer la Commande' : 'Choisir mon adresse'}
                </button>
              )}

              <p className="text-gray-400 text-sm text-center">
                Paiement sécurisé • Expédition sous {shippingConfig.delay_days} jours • Garantie OMEGA
              </p>

              <div className="mt-6 p-4 bg-gradient-to-r from-green-500/10 to-blue-500/10 rounded-lg border border-green-500/20">
                <h4 className="text-green-400 font-semibold mb-2">
                  ✓ Garanties Incluses
                </h4>
                <ul className="text-gray-300 text-sm space-y-1">
                  <li>• Garantie 10 ans sur les machines</li>
                  <li>• Expédition sous {shippingConfig.delay_days} jours</li>
                  <li>• Support technique inclus</li>
                  <li>• Retour sous 30 jours</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Sélection de l'adresse de livraison (obligatoire avant paiement) */}
        {showAddressManager && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 border border-white/10 max-w-2xl w-full max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-white flex items-center gap-2">
                  <MapPin size={22} className="text-blue-400" />
                  Adresse de livraison
                </h3>
                <button
                  onClick={() => setShowAddressManager(false)}
                  className="text-gray-400 hover:text-white transition-colors text-2xl"
                >
                  ×
                </button>
              </div>
              <AddressManager
                showSelection
                selectedAddressId={selectedAddress?.id}
                onAddressSelect={address => {
                  setSelectedAddress(address);
                  setShowAddressManager(false);
                }}
              />
            </div>
          </div>
        )}

        {/* Stripe Checkout Modal */}
        {showCheckout && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 border border-white/10 max-w-md w-full">
              <div className="flex items-center justify-between mb-6">
                {/* « Paiement Sécurisé » en titre PUIS « Paiement sécurisé par Stripe »
                    sous le bouton : la même promesse deux fois dans la même fenêtre.
                    Le titre dit maintenant l'étape, la ligne du bas rassure. */}
                <h3 className="text-2xl font-bold text-white">
                  Régler ma commande
                </h3>
                <button
                  onClick={() => setShowCheckout(false)}
                  className="text-gray-400 hover:text-white transition-colors text-2xl"
                >
                  ×
                </button>
              </div>

              {/* ⚠ Tant que le serveur n'a pas répondu, on affiche l'estimation locale ;
                  dès qu'il a arrêté le devis, c'est LUI qui s'affiche. Le client doit
                  toujours lire exactement ce qui sera débité, TVA comprise — et selon son
                  pays elle peut être nulle (autoliquidation, export). */}
              <div className="mb-6 p-4 bg-white/5 rounded-lg">
                <div className="flex justify-between text-white mb-1">
                  <span>Produits HT :</span>
                  <span className="font-semibold">
                    {(recapServeur ? recapServeur.produits_ht : totals.subTotal).toLocaleString('fr-FR', EURO)}
                  </span>
                </div>
                <div className="flex justify-between text-white mb-1">
                  <span>Livraison{recapServeur ? ' HT' : ''} :</span>
                  <span className="font-semibold">
                    {(recapServeur ? recapServeur.port_ht : shipping.cost ?? 0).toLocaleString('fr-FR', EURO)}
                  </span>
                </div>
                <div className="flex justify-between text-white mb-2">
                  {/* Typographie française : espace avant le %, et taux du SERVEUR.
                      Tant qu'il n'a pas répondu on n'annonce aucun taux plutôt que d'en
                      supposer un — le client d'une entreprise UE vérifiée paie 0 %. */}
                  <span>
                    {recapServeur
                      ? `TVA (${Number(recapServeur.taux_tva).toLocaleString('fr-FR')} %) :`
                      : 'TVA :'}
                  </span>
                  <span className="font-semibold">
                    {(recapServeur ? recapServeur.tva : totals.tax).toLocaleString('fr-FR', EURO)}
                  </span>
                </div>
                <div className="flex justify-between text-white mb-2 border-t border-white/10 pt-2">
                  <span>Total à payer:</span>
                  <span className="font-bold text-xl">
                    {(recapServeur ? recapServeur.total_ttc : grandTotal).toLocaleString('fr-FR', EURO)}
                  </span>
                </div>
                {recapServeur?.mention && (
                  <div className="text-emerald-300 text-sm mb-2 leading-relaxed">
                    {recapServeur.mention}
                  </div>
                )}
                {/* Un professionnel qui voit 20 % alors qu'il attendait 0 % doit savoir
                    POURQUOI, sinon il abandonne son panier ou appelle le support. */}
                {recapServeur?.refus_exoneration && (
                  <div className="text-amber-300 text-sm mb-2 leading-relaxed">
                    {recapServeur.refus_exoneration}
                  </div>
                )}
                {/* La mention « paiement sécurisé » est portée UNE SEULE FOIS, sous le
                    bouton de paiement. Elle était répétée ici et deux lignes plus bas. */}
                <div className="text-gray-400 text-sm">
                  Expédition sous {shippingConfig.delay_days} jours
                </div>
              </div>

              {/* On ne transmet QUE des identifiants de produit et des quantités :
                  le serveur relit les prix, calcule la TVA du pays et les frais de
                  port, et arrête lui-même le montant à débiter. */}
              <StripeCheckout
                key={checkoutKey}
                items={items.map(i => ({
                  product_id: i.product_id,
                  quantity: i.quantity,
                }))}
                addressId={selectedAddress?.id || ''}
                onQuote={setRecapServeur}
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
