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
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import AddressManager from '../components/AddressManager';
import StripeCheckout, {
  type RecapitulatifDevis,
} from '../components/StripeCheckout';
import VitrineCTA from '../components/VitrineCTA';
import AchatEntreprise from '../components/AchatEntreprise';
import ChoixLivraison from '../components/ChoixLivraison';
import { useSiteSettings } from '../contexts/SiteSettingsContext';
import {
  computeShipping,
  listerOffresLivraison,
  type OffreLivraison,
} from '../utils/shipping';
import toast from 'react-hot-toast';
import { EURO } from '../utils/prix';

/* ═══════════════════════════════════════════════════════════════════════════
   REPRISE D'UN PAIEMENT ENCAISSÉ MAIS NON CONFIRMÉ
   ═══════════════════════════════════════════════════════════════════════════

   Le scénario, le plus coûteux de tout le tunnel : Stripe encaisse, puis l'appel à
   `confirmer-commande` échoue (réseau coupé dans le train, jeton rafraîchi entre-temps,
   500 côté serveur). L'identifiant du devis et celui du paiement ne vivaient que dans
   l'état du composant : la fenêtre se démontait, ils disparaissaient AVEC elle. Le
   panier n'était pas vidé, le client relançait la commande, et comme le composant de
   paiement était remonté avec une NOUVELLE clé d'idempotence, un SECOND paiement était
   créé. Deuxième débit, pour une commande qui n'existait toujours pas.

   La correction tient en une phrase : on grave le couple {devis, paiement} sur le poste
   du client DÈS que Stripe répond « succeeded », avant toute autre opération. Tant qu'il
   est là, la commande n'est pas finalisée — et on rejoue la confirmation à chaque retour
   sur le panier. `confirmer_commande` est idempotente (elle renvoie `deja_creee` si la
   commande existe déjà) : rejouer ne crée jamais de doublon, et c'est la seule façon de
   ne pas perdre un encaissement.

   ⚠ `localStorage` et non l'état React : il faut précisément que l'information SURVIVE
   au démontage du composant, à la fermeture de l'onglet et au redémarrage du téléphone. */
const CLE_PAIEMENT_EN_ATTENTE = 'omega:commande-a-confirmer';

interface PaiementEnAttente {
  quote_id: string;
  payment_intent: string;
  /** Le compte concerné : sur un poste partagé, on ne rejoue pas le paiement d'autrui. */
  user_id: string;
  cree_le: number;
}

/** Au-delà de ce délai on cesse de réessayer tout seul (le SAV prend le relais). */
const DUREE_REPRISE_MS = 7 * 24 * 3600 * 1000;

function lireEnAttente(userId?: string): PaiementEnAttente | null {
  if (!userId) return null;
  try {
    const brut = localStorage.getItem(CLE_PAIEMENT_EN_ATTENTE);
    if (!brut) return null;
    const p = JSON.parse(brut) as PaiementEnAttente;
    if (!p?.quote_id || !p?.payment_intent) return null;
    if (p.user_id && p.user_id !== userId) return null;
    if (Date.now() - (p.cree_le || 0) > DUREE_REPRISE_MS) {
      oublierEnAttente();
      return null;
    }
    return p;
  } catch {
    return null; // navigation privée, quota plein : on n'empêche pas le panier de vivre
  }
}

function memoriserEnAttente(p: PaiementEnAttente) {
  try {
    localStorage.setItem(CLE_PAIEMENT_EN_ATTENTE, JSON.stringify(p));
  } catch {
    /* Stockage indisponible : on continue, la confirmation immédiate reste tentée. */
  }
}

function oublierEnAttente() {
  try {
    localStorage.removeItem(CLE_PAIEMENT_EN_ATTENTE);
  } catch {
    /* ignoré */
  }
}

const CartPage = () => {
  const { items, updateQuantity, removeFromCart, totalItems, clearCart, estEnCours } =
    useCart();
  /* `loading` était exposé par le contexte mais consommé UNIQUEMENT par l'administration :
     ici on testait `!user`, qui vaut `null` tant que la session n'est pas restaurée. Au
     rafraîchissement — ou en arrivant depuis un e-mail sur mobile — le client voyait donc
     « Connectez-vous pour voir votre panier » pendant plusieurs secondes, alors qu'il
     était connecté. */
  const { user, loading: sessionEnCours, affichagePrix } = useAuth();
  const { vitrineMode, shippingConfig } = useSiteSettings();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showAddressManager, setShowAddressManager] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<any>(null);
  const [expressShipping, setExpressShipping] = useState(false);
  const [checkoutKey, setCheckoutKey] = useState(0); // Pour forcer la re-création du composant
  /* Offre de livraison retenue par le client — on ne retient QUE son identifiant.
     Le prix qui l'accompagne est un affichage : c'est le serveur qui le relit en base. */
  const [serviceLivraison, setServiceLivraison] = useState<string | null>(null);
  /** Paiement encaissé dont la commande n'est pas encore enregistrée (voir plus haut). */
  const [enAttente, setEnAttente] = useState<PaiementEnAttente | null>(null);
  /** Une seule reprise automatique par visite : sinon un échec durable bouclerait. */
  const repriseTentee = React.useRef(false);
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
            /* ⚠ L'IDENTIFIANT de l'offre, jamais son prix. Le serveur relit le barème
               pour ce service : le navigateur ne fixe aucun montant (invariant n° 1). */
            shipping_service: serviceLivraison,
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
  }, [user?.id, selectedAddress?.id, expressShipping, serviceLivraison,
      items.map(i => `${i.product_id}x${i.quantity}`).join('|')]);

  React.useEffect(() => { demanderApercu(); }, [demanderApercu]);

  /* ★ ADRESSE PAR DÉFAUT PRÉSÉLECTIONNÉE.
     Le client avait beau avoir désigné une adresse « par défaut » dans son compte, le
     panier s'ouvrait sur « Sélectionnez une adresse » : ni frais de port, ni TVA, ni
     total tant qu'il n'avait pas rouvert la fenêtre des adresses pour re-choisir celle
     qu'il avait déjà choisie.
     ⚠ On ne remplace JAMAIS un choix déjà fait dans cette visite (`selectedAddress`
     non nul) : la présélection est un point de départ, pas une reprise en main. */
  React.useEffect(() => {
    let vivant = true;
    if (!user || selectedAddress) return;
    (async () => {
      const { data, error } = await supabase
        .from('shipping_addresses')
        .select('*')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });
      if (!vivant || error || !data?.length) return;
      /* L'adresse marquée par défaut ; à défaut, l'adresse unique du compte — s'il n'y
         en a qu'une, la faire choisir n'apprend rien à personne. Avec plusieurs adresses
         et aucune par défaut, on laisse le client trancher : livrer au mauvais endroit
         coûte plus cher qu'un clic. */
      const parDefaut = data.find((a: any) => a.is_default) || (data.length === 1 ? data[0] : null);
      if (parDefaut) setSelectedAddress(parDefaut);
    })();
    return () => { vivant = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleCheckoutClick = () => {
    if (vitrineMode) return; // vente en ligne désactivée
    if (!user) {
      toast.error('Veuillez vous connecter pour passer commande');
      // On dit d'où l'on vient : après connexion, le client revient à SON panier.
      navigate('/connexion', { state: { from: '/panier' } });
      return;
    }

    if (items.length === 0) {
      toast.error('Votre panier est vide');
      return;
    }

    /* ★ VERROU ANTI DOUBLE DÉBIT. Un paiement est déjà encaissé et sa commande n'est pas
       enregistrée : relancer une commande créerait un SECOND paiement — c'est exactement
       ce que le client faisait quand le message d'erreur l'y invitait. On le renvoie vers
       la reprise, qui est gratuite et idempotente. */
    if (enAttente) {
      toast.error(
        'Un paiement est déjà en cours de finalisation pour ce panier. Utilisez « Finaliser ma commande » en haut de page — ne payez pas une seconde fois.',
        { duration: 10000 }
      );
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
    /* Aucun mode de livraison chiffrable retenu : on reprend le MOTIF exact calculé par
       `shipping.ts` (adresse à compléter, code postal invalide, destination hors zone)
       au lieu du message unique « DOM-TOM / hors Europe » qui s'affichait même pour une
       simple faute de frappe dans le code postal. */
    // Rien à expédier → pas d'offre à choisir. Exiger une offre ici bloquait tout achat
    // de licence, alors même que le port vaut zéro.
    if (!offreChoisie && !panierDematerialise) {
      toast.error(
        shipping.motif ||
          'Frais de livraison indéterminés — vérifiez votre adresse de livraison.'
      );
      return;
    }

    /* ★ LE PAIEMENT N'A PAS LIEU DANS LE PANIER — décision du commit ed55095 :
       « le panier mélangeait tout : l'adresse dans une fenêtre, le statut d'entreprise
       dans un bloc à côté, et le paiement dans une SECONDE fenêtre par-dessus le panier
       resté affiché derrière avec son propre récapitulatif. D'où l'impression de
       doublons et de désordre. »
       Le panier garde donc ses garde-fous (connexion, adresse, offre chiffrable, verrou
       anti double débit) puis PASSE LA MAIN à /commande, qui encaisse. Le mode de
       livraison déjà choisi voyage avec, pour ne pas le redemander. */
    navigate('/commande', {
      state: { service: serviceLivraison, express: expressShipping },
    });
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
  const finaliserCommande = async (
    quoteId: string,
    paymentIntentId: string,
    reprise = false
  ) => {
    setLoading(true);
    const toastId = toast.loading(
      reprise
        ? 'Reprise de votre commande déjà payée…'
        : 'Finalisation de votre commande...'
    );

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
      // ★ La commande EXISTE : on peut oublier le paiement en attente. Cet oubli vient
      //   APRÈS la création côté serveur, jamais avant — sinon un échec du vidage de
      //   panier effacerait la trace du seul élément qui permet de retrouver l'argent.
      oublierEnAttente();
      setEnAttente(null);
      await clearCart();

      toast.success(
        dejaCreee
          ? 'Votre commande était déjà enregistrée.'
          : 'Commande passée avec succès !',
        { id: toastId }
      );
      navigate('/commandes');
    } catch (err: any) {
      console.error('Finalisation de la commande impossible :', err);
      /* ★ ON NE DIT PLUS « Erreur inattendue lors de la commande ».
         Le client vient d'être débité : lui annoncer une erreur sèche l'envoie
         recommencer, donc payer deux fois. On lui dit ce qui est vrai — l'argent est
         arrivé, la commande se termine de notre côté — et le couple {devis, paiement}
         reste mémorisé pour être rejoué au prochain affichage du panier. */
      toast.error(
        'Votre paiement a été reçu, ne payez pas à nouveau — nous finalisons votre commande.',
        { id: toastId, duration: 12000 }
      );
    } finally {
      setLoading(false);
      setShowCheckout(false);
    }
  };

  const handlePaymentSuccess = async (
    paymentIntentId: string,
    quoteId: string
  ) => {
    /* ⚠ PREMIÈRE INSTRUCTION, avant tout appel réseau : à cet instant l'argent est déjà
       débité. Si l'onglet se ferme à la ligne suivante, ces deux identifiants sont tout
       ce qui permet de rattacher le paiement à une commande. */
    const trace: PaiementEnAttente = {
      quote_id: quoteId,
      payment_intent: paymentIntentId,
      user_id: user?.id || '',
      cree_le: Date.now(),
    };
    memoriserEnAttente(trace);
    setEnAttente(trace);
    await finaliserCommande(quoteId, paymentIntentId);
  };

  /* Rejeu automatique au retour sur le panier : c'est ce qui rattrape la coupure réseau,
     la session rafraîchie ou le 500 passager, sans que le client ait à comprendre quoi
     que ce soit. Une seule tentative par visite — un échec durable relève du SAV, pas
     d'une boucle de requêtes. */
  React.useEffect(() => {
    if (!user || repriseTentee.current) return;
    const p = lireEnAttente(user.id);
    if (!p) return;
    repriseTentee.current = true;
    setEnAttente(p);
    finaliserCommande(p.quote_id, p.payment_intent, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

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

  /* Le panier contient-il DÉJÀ tout le stock disponible de ce produit ?
     ⚠ Même convention que `CartContext` : un stock à 0 avec `in_stock` vrai signifie
     « catalogue qui ne compte pas les pièces », et non « rupture » — on ne plafonne
     alors rien, sinon plus rien ne serait commandable. */
  const atteintLeStock = (item: (typeof items)[number]): boolean => {
    const stock = item.product?.stock_quantity;
    if (typeof stock !== 'number' || !Number.isFinite(stock)) return false;
    if (stock <= 0 && item.product?.in_stock !== false) return false;
    return item.quantity >= stock;
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
  /* Panier 100 % DÉMATÉRIALISÉ (licences) : rien à expédier, donc AUCUNE offre de
     livraison — et c'est normal. Sans ce drapeau, l'absence d'offre était prise pour une
     erreur et bloquait la commande sur « Frais de livraison indéterminés ». */
  const panierDematerialise =
    items.length > 0 &&
    items.every(i => (i.product as { product_type?: string } | undefined)?.product_type === 'licence');

  const lignesLivraison = items.map(item => {
    const p = item.product as
      | { shipping_class?: string; weight_kg?: number | null; price_ht?: number | null; price?: number | null; product_type?: string }
      | undefined;
    return {
      shipping_class: p?.shipping_class,
      weight_kg: p?.weight_kg,
      // Une licence logiciel ne s'expédie pas : hors de tout calcul de port.
      dematerialise: p?.product_type === 'licence',
      /* Le prix HT sert UNIQUEMENT au franco de port. Sans lui, le seuil « livraison
         offerte » ne se déclenchait jamais et le client payait un port qu'on avait
         annoncé gratuit. */
      unit_price_ht: p?.price_ht ?? (p?.price != null ? p.price / 1.2 : null),
      quantity: item.quantity,
    };
  });
  const destination = selectedAddress
    ? {
        postal_code: selectedAddress.postal_code,
        country: selectedAddress.country,
      }
    : null;
  const optionsLivraison = {
    express: expressShipping,
    /* Une livraison chez un professionnel n'appelle ni hayon ni prise de rendez-vous :
       ce sont les suppléments les plus lourds du barème palette. Le statut déclaré dans
       « J'achète en tant que » est donc l'information utile, et elle est déjà là. */
    destinataire: (affichagePrix === 'ht' ? 'entreprise' : 'particulier') as
      | 'entreprise'
      | 'particulier',
  };

  const shipping = computeShipping(
    lignesLivraison,
    destination,
    shippingConfig,
    optionsLivraison
  );

  /* ★ LES OFFRES PROPOSÉES AU CLIENT (domicile, express, point relais, palette,
     retrait au dépôt). Le panier n'en affichait aucune : un seul tarif, choisi par le
     code, sans que le client puisse préférer un relais moins cher ou un retrait
     gratuit au dépôt de Montblanc. */
  const offresLivraison: OffreLivraison[] = listerOffresLivraison(
    lignesLivraison,
    destination,
    shippingConfig,
    optionsLivraison
  );
  const offresChiffrables = offresLivraison.filter(o => !o.sur_devis);
  const offreChoisie =
    offresChiffrables.find(o => o.service === serviceLivraison) ?? null;

  /* Présélection : l'offre que `computeShipping` retiendrait (le mode par défaut, au
     meilleur prix). Le client peut en changer ; on ne le force à rien, mais il ne doit
     pas non plus avoir à choisir pour voir un total.
     ⚠ On resélectionne aussi quand l'offre retenue DISPARAÎT (changement d'adresse, de
     poids, de pays) : sinon le panier restait sur un service que le serveur aurait
     refusé, et le total affiché n'était plus celui qui allait être débité. */
  React.useEffect(() => {
    // Un choix encore proposé reste le choix du client : on n'y touche pas.
    if (serviceLivraison && offresChiffrables.some(o => o.service === serviceLivraison)) {
      return;
    }
    /* ⚠ On ne présélectionne QUE l'offre que `computeShipping` retiendrait. Se rabattre
       sur « la première offre chiffrable » ferait cocher « Retrait au dépôt » (gratuit,
       et seule offre chiffrable tant qu'aucune adresse n'est saisie) : le panier
       annoncerait « Livraison offerte » à un client qui attend une livraison. Sans
       adresse, on n'affiche donc aucun port — c'est la vérité. */
    const defaut = offresChiffrables.find(o => o.service === shipping.offre?.service);
    setServiceLivraison(defaut ? defaut.service : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offresChiffrables.map(o => o.service).join('|'), shipping.offre?.service]);

  /* Le port réellement retenu pour l'affichage : celui de l'offre CHOISIE, sinon celui
     de l'offre par défaut. Reste une estimation — le montant qui fait foi est celui du
     récapitulatif serveur. */
  const portTtc = offreChoisie ? offreChoisie.prix_ttc : shipping.cost;
  // Total encaissé = produits TTC + livraison (tarifs livraison exprimés TTC).
  const grandTotal = totals.total + (portTtc ?? 0);

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

  /* ★ ÉCRAN D'ATTENTE PENDANT LA RESTAURATION DE SESSION.
     Il doit venir AVANT le test `!user` : au rafraîchissement, `user` vaut `null`
     pendant que Supabase relit la session, et le client — pourtant connecté — lisait
     « Connectez-vous pour voir votre panier ». Sur mobile, en arrivant depuis un e-mail,
     cela durait plusieurs secondes et beaucoup repartaient. */
  if (sessionEnCours) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="text-blue-400 mx-auto mb-4 animate-spin" size={40} />
          <p className="text-gray-300">Chargement de votre panier…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24 flex items-center justify-center px-6">
        <div className="text-center">
          <ShoppingBag className="text-gray-400 mx-auto mb-4" size={64} />
          <h2 className="text-2xl font-bold text-white mb-4">
            Connectez-vous pour voir votre panier
          </h2>
          <Link
            to="/connexion"
            state={{ from: '/panier' }}
            className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-full font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all"
          >
            Se connecter
          </Link>
        </div>
      </div>
    );
  }

  /* Bandeau de reprise — visible AUSSI quand le panier est vide : un paiement encaissé
     dont la commande n'est pas enregistrée doit se voir, quel que soit l'état du panier.
     C'est la trace à laquelle le client (et le SAV) se raccrochent. */
  const banniereReprise = enAttente ? (
    <div className="mb-8 p-5 rounded-2xl border border-amber-400/40 bg-amber-500/10 backdrop-blur-md">
      <div className="flex items-start gap-3">
        <ShieldCheck className="text-amber-300 shrink-0 mt-0.5" size={22} />
        <div className="min-w-0 flex-1">
          <h2 className="text-white font-semibold">
            Votre paiement a été reçu — ne payez pas à nouveau
          </h2>
          <p className="text-amber-100/90 text-sm mt-1 leading-relaxed">
            Nous n'avons pas encore pu enregistrer la commande correspondante. Nous
            reprenons automatiquement l'opération ; vous pouvez aussi la relancer
            vous-même. Aucun second débit ne peut avoir lieu.
          </p>
          <p className="text-amber-200/70 text-xs mt-2 font-mono break-all">
            Référence de paiement : {enAttente.payment_intent}
          </p>
          <button
            type="button"
            onClick={() =>
              finaliserCommande(enAttente.quote_id, enAttente.payment_intent, true)
            }
            disabled={loading}
            className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-400/20 border border-amber-300/50 text-amber-100 text-sm font-semibold hover:bg-amber-400/30 transition-colors disabled:opacity-50"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            Finaliser ma commande
          </button>
        </div>
      </div>
    </div>
  ) : null;

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24">
        <div className="container mx-auto px-6 py-12">
          {banniereReprise}
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
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24">
      <div className="container mx-auto px-6 py-12">
        {banniereReprise}
        <div className="mb-8">
          <Link
            to="/produits"
            className="flex items-center gap-2 text-gray-400 hover:text-blue-400 transition-colors w-fit mb-4"
          >
            <ArrowLeft size={20} />
            Continuer mes achats
          </Link>
          <h1 className="text-3xl sm:text-4xl font-bold text-white">
            Mon Panier ({totalItems} article{totalItems > 1 ? 's' : ''})
          </h1>
          {/* ★ LE DOUBLON SIGNALÉ PAR LE CLIENT.
              Cette ligne annonçait « Prix HT (Professionnel) » ou « Prix TTC
              (Particulier) » — c'est-à-dire, mot pour mot, le vocabulaire du bloc
              « J'achète en tant que » situé quelques centimètres plus bas dans le
              récapitulatif. Le client lisait donc DEUX déclarations de statut sur le
              même écran, dont une qu'il ne pouvait pas modifier ici : d'où le doublon
              perçu, et la question « laquelle fait foi ? ».
              Il n'en reste qu'une seule, « J'achète en tant que » (elle décide de la
              TVA). Ici on se contente d'annoncer le FORMAT des montants affichés, sans
              jamais nommer le statut. */}
          <div className="mt-2 text-gray-400 text-sm">
            Montants affichés {affichagePrix === 'ht' ? 'hors taxes' : 'toutes taxes comprises'}
            {' '}— réglable dans l'en-tête du site.
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Cart Items */}
          <div className="lg:col-span-2 space-y-4">
            {items.map(item => (
              <div
                key={item.id}
                className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-4 sm:p-6 border border-white/10"
              >
                {/* ★ MOBILE : LA LIGNE S'EMPILE.
                    `flex items-center gap-6` sans point de rupture : sur un écran de
                    375 px, la vignette (80) + les boutons de quantité (~110) + le total
                    (80) + la corbeille (36) + les espaces dépassent la largeur
                    disponible, et c'est le nom du produit — seul élément compressible —
                    qui était écrasé à quelques pixels. Le client ne lisait donc plus ce
                    qu'il achetait au moment de payer. */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
                  <div className="flex items-start gap-4 min-w-0 flex-1">
                    <img
                      src={
                        item.product?.image
                          ? item.product.image.startsWith('/')
                            ? item.product.image
                            : `/${item.product.image}`
                          : 'https://images.pexels.com/photos/1181467/pexels-photo-1181467.jpeg'
                      }
                      alt={item.product?.name}
                      className="w-20 h-20 shrink-0 object-cover rounded-lg"
                    />

                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg sm:text-xl font-bold text-white mb-2 break-words">
                        {item.product?.name}
                      </h3>
                      <p className="text-gray-400 text-sm mb-3 line-clamp-2">
                        {item.product?.description}
                      </p>
                      <div className="text-blue-400 font-bold text-lg">
                        {getItemPrice(item).toLocaleString('fr-FR', EURO)} {totals.label}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 sm:gap-4 sm:justify-end">
                    <div className="flex items-center gap-2 bg-white/10 rounded-lg p-2">
                      <button
                        onClick={() =>
                          updateQuantity(item.product_id, item.quantity - 1)
                        }
                        disabled={estEnCours(item.product_id)}
                        aria-label="Retirer un exemplaire"
                        className="text-white hover:text-blue-400 transition-colors disabled:opacity-40"
                      >
                        <Minus size={16} />
                      </button>
                      <span className="text-white font-semibold w-8 text-center">
                        {item.quantity}
                      </span>
                      {/* ★ PLAFOND DE STOCK. Le client pouvait saisir 12 exemplaires d'un
                          produit qu'il en restait 2, saisir sa carte, et découvrir la
                          rupture au refus du serveur — après avoir tout tapé. Le bouton
                          « + » s'arrête maintenant au stock réel. */}
                      <button
                        onClick={() =>
                          updateQuantity(item.product_id, item.quantity + 1)
                        }
                        disabled={
                          estEnCours(item.product_id) || atteintLeStock(item)
                        }
                        aria-label="Ajouter un exemplaire"
                        title={
                          atteintLeStock(item)
                            ? 'Stock disponible atteint pour ce produit'
                            : undefined
                        }
                        className="text-white hover:text-blue-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Plus size={16} />
                      </button>
                    </div>

                    <div className="text-white font-bold text-lg text-right whitespace-nowrap">
                      {(getItemPrice(item) * item.quantity).toLocaleString('fr-FR', EURO)}{' '}
                      {totals.label}
                    </div>

                    <button
                      onClick={() => removeFromCart(item.product_id)}
                      aria-label={`Retirer ${item.product?.name ?? 'ce produit'} du panier`}
                      className="text-red-400 hover:text-red-300 transition-colors p-2 shrink-0"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                </div>

                {atteintLeStock(item) && (
                  <p className="text-amber-300 text-xs mt-3">
                    Stock disponible atteint : {item.product?.stock_quantity} exemplaire
                    {(item.product?.stock_quantity ?? 0) > 1 ? 's' : ''} pour ce produit.
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-4 sm:p-6 border border-white/10 sticky top-24">
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

              {/* ★ CHOIX DU MODE DE LIVRAISON.
                  Le panier imposait un tarif unique, décidé par le code : le client ne
                  pouvait ni prendre un point relais moins cher, ni venir retirer sa
                  commande au dépôt (gratuit), ni payer un express quand il en avait
                  besoin. Les offres viennent de `listerOffresLivraison()`, qui applique
                  le barème 2026 ; seul l'IDENTIFIANT du service part au serveur. */}
              {panierDematerialise ? (
                <div className="mb-6 text-sm text-gray-400 bg-white/5 border border-white/10 rounded-lg px-4 py-3">
                  Commande dématérialisée — aucune livraison. Votre licence est rattachée à
                  votre compte OMEGA dès le paiement.
                </div>
              ) : (
              <div className="mb-6">
                <h4 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
                  <Truck size={16} className="text-blue-400" />
                  Mode de livraison
                </h4>
                <ChoixLivraison
                  offres={offresLivraison}
                  valeur={serviceLivraison}
                  onChange={offre => {
                    /* Changer de mode change le port, donc le total ET le devis serveur :
                       on invalide l'ancien récapitulatif et on force une nouvelle
                       préparation de paiement, sinon le client paierait le port du mode
                       précédent. */
                    setServiceLivraison(offre.service);
                    setRecapServeur(null);
                    setCheckoutKey(prev => prev + 1);
                  }}
                  affichageHt={affichagePrix === 'ht'}
                  chargement={!!selectedAddress && offresLivraison.length === 0}
                />

                {/* Option historique « palette express Europe » : elle ne concerne QUE le
                    groupage palette vers l'UE, ce n'est donc pas un mode de plus mais une
                    variante de l'offre palette — d'où sa place ici, sous le sélecteur.
                    ⚠ Elle était cochée par le client, affichée dans le récapitulatif…
                    et jamais transmise à `devis-commande` : la palette partait en
                    groupage standard et l'express n'était pas facturé. */}
                {shipping.expressAvailable && (
                  <label className="mt-3 flex items-start gap-2 text-sm text-gray-300 cursor-pointer bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                    <input
                      type="checkbox"
                      checked={expressShipping}
                      onChange={e => {
                        setExpressShipping(e.target.checked);
                        setRecapServeur(null);
                        setCheckoutKey(prev => prev + 1);
                      }}
                      className="accent-blue-500 mt-0.5"
                    />
                    <span>
                      Palette express Europe (24-48 h) au lieu du groupage
                      <span className="block text-xs text-gray-400">
                        Supplément facturé sur le devis ; le tarif exact est arrêté par
                        nos serveurs d'après le barème en vigueur.
                      </span>
                    </span>
                  </label>
                )}
              </div>
              )}

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
                      montant se lisait comme un HT et venait grossir un total mélangé.
                      Le montant affiché est celui de l'offre CHOISIE par le client. */}
                  <span>
                    {panierDematerialise
                      ? 'Sans objet'
                      : offreChoisie
                        ? offreChoisie.prix_ttc === 0
                          ? 'Offerte'
                          : `${offreChoisie.prix_ttc.toLocaleString('fr-FR', EURO)} TTC`
                        : shipping.needsQuote
                          ? 'Sur devis'
                          : 'Selon adresse'}
                  </span>
                </div>
                {offreChoisie && (
                  <div className="text-xs text-gray-400 -mt-2">
                    {offreChoisie.libelle}
                    {offreChoisie.mode === 'retrait'
                      ? ` · Dépôt de ${shippingConfig.depot.label}`
                      : ` · Expédition sous ${shippingConfig.delay_days} jours`}
                  </div>
                )}
                {/* MOTIF EXACT plutôt que message unique : « code postal invalide » n'est
                    pas « destination hors zone », et le client n'a pas la même chose à
                    faire dans les deux cas. */}
                {!offreChoisie && !panierDematerialise && shipping.motif && (
                  <div className="text-xs text-orange-300 -mt-1 leading-relaxed">
                    {shipping.motif}
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

              {/* Le devis de transport n'est proposé que si AUCUNE offre chiffrée n'existe
                  — le retrait au dépôt en est une : tant qu'il reste possible, le client
                  doit pouvoir commander plutôt qu'être renvoyé vers un formulaire. */}
              {shipping.needsQuote && !offresChiffrables.length && !panierDematerialise ? (
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
                  disabled={loading || !!enAttente}
                  className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-4 rounded-full font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 mb-4 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? <Loader2 size={20} className="animate-spin" /> : <CreditCard size={20} />}
                  {enAttente
                    ? 'Paiement déjà reçu'
                    : selectedAddress
                      ? 'Passer la Commande'
                      : 'Choisir mon adresse'}
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
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-5 sm:p-8 border border-white/10 max-w-2xl w-full max-h-[85vh] overflow-y-auto">
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
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-5 sm:p-8 border border-white/10 max-w-md w-full max-h-[90vh] overflow-y-auto">
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
                    {(recapServeur ? recapServeur.port_ht : portTtc ?? 0).toLocaleString('fr-FR', EURO)}
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
              {/* ⚠ `express` ÉTAIT DÉCLARÉ MAIS JAMAIS TRANSMIS.
                  Le client cochait « Livraison Express Europe », la voyait dans le
                  récapitulatif… et `devis-commande` recevait `express: false` : la
                  commande partait en groupage standard, l'express n'était pas facturé.
                  Environ 170 € de marge perdus par commande concernée, et un client
                  livré en standard alors qu'il avait demandé du 24-48 h. */}
              <StripeCheckout
                key={checkoutKey}
                items={items.map(i => ({
                  product_id: i.product_id,
                  quantity: i.quantity,
                }))}
                addressId={selectedAddress?.id || ''}
                express={expressShipping}
                serviceLivraison={serviceLivraison}
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
