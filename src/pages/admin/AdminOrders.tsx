import React, { useState, useEffect } from 'react';
import {
  ShoppingCart,
  Search,
  Filter,
  Eye,
  Edit3,
  Package,
  Truck,
  CheckCircle,
  Clock,
  AlertCircle,
  Calendar,
  Euro,
  User,
  MapPin,
  FileText,
  ExternalLink,
  RotateCcw,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import { EURO } from '../../utils/prix';

/* ★ `MENTIONS_REGIME` et `mentionRegime()` ont été SUPPRIMÉS.
   Ils re-déduisaient la mention légale du seul `vat_regime`, alors que `regime_tva()`
   renvoie « export » aussi bien pour la Suisse que pour la Guadeloupe : une livraison en
   outre-mer portait donc « exportation hors Union européenne (art. 262 I) » au lieu de
   l'art. 294. Mention inexacte sur un document légal, exonération contestable en contrôle,
   et ventilation comptable fausse (exportations au lieu de livraisons outre-mer).
   La mention est désormais FIGÉE sur la commande (`orders.vat_mention`, arrêtée par le
   serveur au moment de la vente) et recopiée telle quelle par
   `creer_facture_depuis_commande()`. Un fait fiscal ne se re-déduit pas côté React. */

interface Order {
  id: string;
  user_id: string;
  sub_total: number;
  tax: number;
  total: number;
  status: string;
  user_type: string;
  priority: string;
  estimated_delivery: string;
  tracking_link: string;
  admin_notes: string;
  created_at: string;
  updated_at: string;
  shipping_address: any;
  stripe_payment_intent_id: string | null;
  /* Régime fiscal figé au moment de la vente (cf. migration 20260803190000). */
  customer_country: string | null;
  is_company: boolean | null;
  company_name: string | null;
  vat_number: string | null;
  vat_regime: string | null;
  vat_rate: number | null;
  order_items: {
    id: string;
    quantity: number;
    price: number;
    product: {
      id: string;
      name: string;
      image: string;
    };
  }[];
  profiles: {
    first_name: string;
    last_name: string;
  };
}

const AdminOrders = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [orderInvoices, setOrderInvoices] = useState<{ [key: string]: any }>(
    {}
  );
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundData, setRefundData] = useState({
    amount: '',
    reason: '',
    adminNotes: '',
  });
  const [refundLoading, setRefundLoading] = useState(false);

  useEffect(() => {
    // Vérifier si on doit ouvrir une commande spécifique
    const openOrderId = sessionStorage.getItem('openOrderId');
    if (openOrderId && orders.length > 0) {
      sessionStorage.removeItem('openOrderId');
      const order = orders.find(o => o.id === openOrderId);
      if (order) {
        console.log(
          '🎯 Ouverture automatique de la commande:',
          order.id.slice(0, 8)
        );
        setSelectedOrder(order);
        setShowOrderModal(true);
      }
    }
  }, [orders]);

  useEffect(() => {
    loadOrders();
    loadOrderInvoices();
  }, []);

  const loadOrderInvoices = async () => {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('id, invoice_number, order_id, status')
        .not('order_id', 'is', null);

      if (!error && data) {
        const invoiceMap: { [key: string]: any } = {};
        data.forEach(invoice => {
          if (invoice.order_id) {
            invoiceMap[invoice.order_id] = invoice;
          }
        });
        setOrderInvoices(invoiceMap);
      }
    } catch (err) {
      console.error('Erreur chargement factures:', err);
    }
  };
  const loadOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(
          `
          *,
          order_items (
            id,
            quantity,
            price,
            product:products (
              id,
              name,
              image
            )
          ),
          profiles (
            first_name,
            last_name
          )
        `
        )
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading orders:', error);
        toast.error('Erreur lors du chargement des commandes');
      } else {
        setOrders(data || []);
      }
      // Recharger les factures après avoir chargé les commandes
      loadOrderInvoices();
    } catch (err) {
      console.error('Unexpected error:', err);
      toast.error('Erreur inattendue');
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (
    orderId: string,
    status: string,
    adminNotes?: string,
    trackingLink?: string,
    estimatedDelivery?: string,
    priority?: string
  ) => {
    try {
      const updateData: any = {
        status,
        updated_at: new Date().toISOString(),
      };

      /* ⚠ Un champ VIDÉ n'était jamais écrit : la condition exigeait une valeur non vide.
         Conséquence concrète et signalée : un lien de suivi collé sur la mauvaise
         commande restait affiché au client INDÉFINIMENT — l'effacer dans le formulaire
         ne faisait rien, et rien ne le disait. Un champ effacé est une INTENTION, au
         même titre qu'un champ rempli : on écrit `null`, ce qui vide la colonne.
         `undefined` (champ non soumis) reste, lui, sans effet. */
      const vider = (v: string) => (v.trim() === '' ? null : v.trim());

      if (adminNotes !== undefined) updateData.admin_notes = vider(adminNotes);
      if (trackingLink !== undefined) updateData.tracking_link = vider(trackingLink);
      if (estimatedDelivery !== undefined)
        updateData.estimated_delivery = estimatedDelivery === '' ? null : estimatedDelivery;
      if (priority !== undefined) updateData.priority = priority;

      const { error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', orderId);

      if (error) {
        console.error('Error updating order:', error);
        toast.error('Erreur lors de la mise à jour');
      } else {
        toast.success('Commande mise à jour avec succès');
        loadOrders();
        setShowEditModal(false);
        setEditingOrder(null);
        // Recharger les factures après mise à jour
        loadOrderInvoices();
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      toast.error('Erreur inattendue');
    }
  };

  /* ── STATUTS DE COMMANDE ────────────────────────────────────────────────────
     ⚠ `paid`, `processing` et `refunded` manquaient ici alors que la page CLIENT les
     affiche déjà (OrdersPage.tsx:164-240) et que la base les écrit : le back-office
     annonçait donc « En attente », en bleu, sur une commande REMBOURSÉE. Les deux écrans
     racontaient deux histoires différentes de la même commande. La liste est alignée sur
     celle du client, libellés compris — c'est la même commande, ce doit être le même mot. */
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid':
        return <CheckCircle className="text-emerald-400" size={20} />;
      case 'confirmed':
        return <CheckCircle className="text-green-400" size={20} />;
      case 'processing':
        return <Package className="text-blue-400" size={20} />;
      case 'shipped':
        return <Truck className="text-blue-400" size={20} />;
      case 'delivered':
        return <Package className="text-green-500" size={20} />;
      case 'cancelled':
        return <AlertCircle className="text-red-400" size={20} />;
      case 'refunded':
        return <RotateCcw className="text-amber-400" size={20} />;
      default:
        return <Clock className="text-blue-400" size={20} />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'paid':
        return 'Payée';
      case 'confirmed':
        return 'Confirmée';
      case 'processing':
        return 'En préparation';
      case 'shipped':
        return 'Expédiée';
      case 'delivered':
        return 'Livrée';
      case 'cancelled':
        return 'Annulée';
      case 'refunded':
        return 'Remboursée';
      default:
        return 'En attente';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'text-emerald-400 bg-emerald-500/20';
      case 'confirmed':
        return 'text-green-400 bg-green-500/20';
      case 'processing':
        return 'text-blue-400 bg-blue-500/20';
      case 'shipped':
        return 'text-blue-400 bg-blue-500/20';
      case 'delivered':
        return 'text-green-500 bg-green-500/20';
      case 'cancelled':
        return 'text-red-400 bg-red-500/20';
      case 'refunded':
        return 'text-amber-400 bg-amber-500/20';
      default:
        return 'text-blue-400 bg-blue-500/20';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'text-red-400 bg-red-500/20';
      case 'high':
        return 'text-purple-400 bg-purple-600/20';
      case 'normal':
        return 'text-blue-400 bg-blue-500/20';
      case 'low':
        return 'text-gray-400 bg-gray-500/20';
      default:
        return 'text-blue-400 bg-blue-500/20';
    }
  };

  /**
   * Émettre la facture d'une commande — UN SEUL APPEL, une seule transaction.
   *
   * ## Ce que faisait l'ancien code, et pourquoi il coûtait cher
   * Cinq allers-retours depuis le NAVIGATEUR : (1) consommer un numéro,
   * (2) insérer la facture, (3) insérer les lignes, (4) insérer le règlement,
   * (5) passer le statut à « payée ». Trois conséquences, toutes constatées :
   *
   *  a) **Aucune ligne de frais de port n'était créée.** Les lignes venaient des seuls
   *     `order_items`, puis le trigger de totalisation ÉCRASAIT les totaux de la facture
   *     par la somme de ces lignes. On encaissait 2 036 € et on facturait 1 907 € : le
   *     chiffre d'affaires ET la TVA du port n'étaient jamais déclarés, et le client
   *     recevait une facture inférieure à son débit carte (art. 242 nonies A du CGI).
   *  b) **Des trous permanents dans la séquence de numérotation.** Le numéro était
   *     consommé EN PREMIER, dans sa propre transaction, alors que CINQ sorties
   *     anticipées suivaient — dont un `prompt()` que l'utilisateur pouvait annuler.
   *     Chaque abandon brûlait un numéro, et une séquence de facturation doit être
   *     continue (art. 289 du CGI).
   *  c) **La mention légale était re-déduite du régime** au lieu d'être recopiée : une
   *     livraison en Guadeloupe portait la mention d'exportation hors UE.
   *
   * ## Ce qui le remplace
   * `creer_facture_depuis_commande()` numérote, insère la facture, ses lignes produits ET
   * sa ligne de port, calcule les totaux en un seul arrondi, RECOPIE la mention et le
   * territoire figés sur la commande, puis REFUSE d'émettre si le total s'écarte de plus
   * d'un centime du montant encaissé. Tout ou rien : une erreur en cours de route annule
   * l'ensemble, numéro compris. La fonction est idempotente — un double clic rend la
   * facture existante au lieu d'en créer une seconde.
   *
   * ⚠ L'e-mail du client vient du profil, lu côté serveur. Le `prompt()` du navigateur a
   * disparu : demander une saisie au milieu d'une séquence de facturation, c'est offrir
   * un bouton « Annuler » qui laisse un numéro dans la nature.
   */
  const createInvoiceFromOrder = async (orderId: string) => {
    const loadingToast = toast.loading('Création de la facture en cours...');
    try {
      /* UN SEUL APPEL. Plus de `get_next_invoice_number_atomic` depuis le navigateur :
         la numérotation est désormais réservée au serveur, précisément pour qu'un numéro
         ne puisse plus être consommé sans facture. */
      const { data: invoiceId, error: rpcError } = await supabase.rpc(
        'creer_facture_depuis_commande',
        { p_order_id: orderId }
      );

      if (rpcError || !invoiceId) {
        console.error('Erreur création facture :', rpcError);
        toast.dismiss(loadingToast);
        /* Le message de la base est REPRIS TEL QUEL : quand la fonction refuse d'émettre
           parce que le total ne colle pas à la commande, elle dit exactement quel écart
           elle a trouvé et quoi vérifier. Le masquer derrière un « erreur » générique
           obligerait à ouvrir les journaux Postgres pour comprendre. */
        toast.error(
          rpcError?.message || "La facture n'a pas pu être créée.",
          { duration: 9000 }
        );
        return;
      }

      // Relecture pour l'affichage et pour la suite du parcours.
      const { data: invoice } = await supabase
        .from('invoices')
        .select('id, invoice_number, total_ttc, status')
        .eq('id', invoiceId as string)
        .maybeSingle();

      toast.dismiss(loadingToast);
      toast.success(
        `✅ Facture ${invoice?.invoice_number ?? ''} créée avec succès !`.replace(
          '  ',
          ' '
        )
      );

      /* ENVOI AUTOMATIQUE VERS LA COMPTABILITÉ (Make → Tiime).
         Générer une facture, c'est décider qu'elle existe : elle doit partir en
         comptabilité dans la foulée, sans qu'on ait à y penser. Avant, il fallait
         cliquer un second bouton facture par facture — donc on l'oubliait.
         Deux garde-fous : la fonction refuse une facture déjà transmise (pas de
         doublon dans Tiime), et un échec ne casse pas la création — la facture
         réapparaît simplement comme « non transmise » dans l'écran Facturation. */
      try {
        const { data: envoi } = await supabase.functions.invoke('send-to-make', {
          body: { invoiceId: invoiceId as string },
        });
        if (envoi?.sent) {
          toast.success('Facture transmise à la comptabilité (Tiime)');
        } else if (envoi?.configured === false) {
          toast('Comptabilité non configurée : facture à transmettre manuellement', {
            icon: '⚠️',
          });
        } else if (!envoi?.deja_envoye) {
          toast('Facture NON transmise à la comptabilité — à envoyer depuis Facturation', {
            icon: '⚠️',
            duration: 7000,
          });
        }
      } catch (e) {
        console.error('Envoi comptabilité impossible :', e);
        toast('Facture NON transmise à la comptabilité — à envoyer depuis Facturation', {
          icon: '⚠️',
          duration: 7000,
        });
      }

      /* ★ FABRICATION DE L'ORIGINAL — c'est le maillon qui manquait.
         Sans cet appel, la facture existait en base mais son PDF n'était jamais
         fabriqué : le client lisait « cette facture n'a pas encore été éditée » et
         l'e-mail partait sans pièce jointe. On l'édite DÈS la création, une fois
         pour toutes ; le fichier est ensuite servi tel quel, au client comme à
         l'e-mail.
         ⚠ Un échec ici ne doit pas casser la création : la facture est déjà en
         base et transmise à la comptabilité. On le dit, et l'édition reste
         rattrapable depuis Facturation. */
      try {
        const { data: s } = await supabase.auth.getSession();
        const r = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/facture-pdf`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${s.session?.access_token}`,
            },
            body: JSON.stringify({ invoice_id: invoiceId }),
          }
        );
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d?.error || `HTTP ${r.status}`);
        }
      } catch (e) {
        console.error('Édition du PDF impossible :', e);
        toast('Facture créée, mais son PDF n’a pas pu être édité — relancez depuis Facturation', {
          icon: '⚠️',
          duration: 8000,
        });
      }

      // Stocker l'ID de la facture et naviguer vers la facturation
      sessionStorage.setItem('openInvoiceId', invoiceId as string);

      // Déclencher l'événement pour changer d'onglet avec un délai
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('switchToBilling'));
        // Recharger les factures pour mettre à jour l'état des boutons
        loadOrderInvoices();
      }, 100);
    } catch (err) {
      console.error('Erreur inattendue :', err);
      toast.dismiss(loadingToast);
      toast.error('Erreur inattendue');
    }
  };

  const handleInvoiceAction = async (orderId: string) => {
    // Vérifier si une facture existe déjà
    try {
      const { data: existingInvoice, error } = await supabase
        .from('invoices')
        .select('id, invoice_number')
        .eq('order_id', orderId);

      if (error && error.code !== 'PGRST116') {
        console.error('Erreur vérification facture:', error);
        toast.error('Erreur lors de la vérification');
        return;
      }

      if (existingInvoice && existingInvoice.length > 0) {
        // Facture existe, aller directement dessus
        console.log(
          '🔗 Navigation vers facture existante:',
          existingInvoice[0].invoice_number
        );
        sessionStorage.setItem('openInvoiceId', existingInvoice[0].id);
        window.dispatchEvent(new CustomEvent('switchToBilling'));
      } else {
        // Pas de facture, en créer une
        console.log(
          "🆕 Création d'une nouvelle facture pour commande:",
          orderId
        );
        createInvoiceFromOrder(orderId);
      }
    } catch (err) {
      console.error('Erreur inattendue:', err);
      toast.error('Erreur inattendue');
    }
  };

  const handleRefund = async (order: Order) => {
    if (!order.stripe_payment_intent_id) {
      toast.error('Aucun paiement Stripe associé à cette commande');
      return;
    }

    // Calculer le montant maximum remboursable
    const { data: existingRefunds } = await supabase
      .from('refunds')
      .select('amount')
      .eq('order_id', order.id)
      .eq('status', 'succeeded');

    const totalRefunded =
      existingRefunds?.reduce((sum, refund) => sum + refund.amount, 0) || 0;
    const maxRefundable = order.total - totalRefunded;

    if (maxRefundable <= 0) {
      toast.error('Cette commande a déjà été entièrement remboursée');
      return;
    }

    setSelectedOrder(order);
    setRefundData({
      amount: maxRefundable.toFixed(2),
      reason: '',
      adminNotes: '',
    });
    setShowRefundModal(true);
  };

  // Dans le fichier src/pages/admin/AdminOrders.tsx

  const processRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;

    // ⭐ CORRECTION : Trouver la facture associée à la commande
    const invoice = orderInvoices[selectedOrder.id];

    if (!invoice || !invoice.id) {
      toast.error(
        "Veuillez d'abord créer une facture pour cette commande avant de la rembourser."
      );
      return;
    }

    setRefundLoading(true);
    const toastId = toast.loading('Traitement du remboursement...');
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        toast.error('Session expirée', { id: toastId });
        setRefundLoading(false);
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-refund`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            // ⭐ CORRECTION : On envoie invoiceId, pas orderId
            invoiceId: invoice.id,
            amount: parseFloat(refundData.amount),
            reason: refundData.reason,
            adminNotes: refundData.adminNotes,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erreur lors du remboursement');
      }

      toast.success(result.message || 'Remboursement traité avec succès', {
        id: toastId,
      });
      setShowRefundModal(false);
      setSelectedOrder(null);
      setRefundData({ amount: '', reason: '', adminNotes: '' });

      await loadOrders();
    } catch (error: any) {
      console.error('Erreur remboursement:', error);
      toast.error(error.message || 'Erreur lors du remboursement', {
        id: toastId,
      });
    } finally {
      setRefundLoading(false);
    }
  };

  const getRefundableAmount = async (order: Order) => {
    const { data: existingRefunds } = await supabase
      .from('refunds')
      .select('amount')
      .eq('order_id', order.id)
      .eq('status', 'succeeded');

    const totalRefunded =
      existingRefunds?.reduce((sum, refund) => sum + refund.amount, 0) || 0;
    return order.total - totalRefunded;
  };

  const isRefundable = (order: Order) => {
    return (
      order.stripe_payment_intent_id &&
      (order.status === 'confirmed' ||
        order.status === 'shipped' ||
        order.status === 'delivered')
    );
  };

  const filteredOrders = orders.filter(order => {
    const customerName = order.profiles
      ? `${order.profiles.first_name} ${order.profiles.last_name}`
      : '';
    const matchesSearch =
      order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customerName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' || order.status === statusFilter;
    const matchesPriority =
      priorityFilter === 'all' || order.priority === priorityFilter;
    return matchesSearch && matchesStatus && matchesPriority;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-white text-xl">Chargement des commandes...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
            <ShoppingCart className="text-blue-400" size={32} />
            Gestion des Commandes
          </h1>
          <p className="text-gray-400">
            Suivez et gérez toutes les commandes clients
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-blue-400">
            {orders
              .filter(order => order.status !== 'cancelled')
              .reduce((sum, order) => sum + order.total, 0)
              .toFixed(2)}
            €
          </div>
          <div className="text-gray-400 text-sm">Chiffre d'affaires total</div>
        </div>
      </div>

      {/* Statistiques rapides */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-white/10">
          <div className="text-2xl font-bold text-white">{orders.length}</div>
          <div className="text-gray-400 text-sm">Total commandes</div>
        </div>
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-white/10">
          <div className="text-2xl font-bold text-blue-400">
            {orders.filter(o => o.status === 'pending').length}
          </div>
          <div className="text-gray-400 text-sm">En attente</div>
        </div>
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-white/10">
          <div className="text-2xl font-bold text-blue-400">
            {orders.filter(o => o.status === 'shipped').length}
          </div>
          <div className="text-gray-400 text-sm">Expédiées</div>
        </div>
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-white/10">
          <div className="text-2xl font-bold text-green-400">
            {orders.filter(o => o.status === 'delivered').length}
          </div>
          <div className="text-gray-400 text-sm">Livrées</div>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-6 border border-white/10">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={20}
            />
            <input
              type="text"
              placeholder="Rechercher par ID ou client..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="text-gray-400" size={20} />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="dark-select rounded-lg px-4 py-3 focus:border-blue-400 focus:outline-none"
            >
              <option value="all">Tous les statuts</option>
              <option value="pending">En attente</option>
              <option value="paid">Payées</option>
              <option value="confirmed">Confirmées</option>
              <option value="processing">En préparation</option>
              <option value="shipped">Expédiées</option>
              <option value="delivered">Livrées</option>
              <option value="cancelled">Annulées</option>
              <option value="refunded">Remboursées</option>
            </select>
            <select
              value={priorityFilter}
              onChange={e => setPriorityFilter(e.target.value)}
              className="dark-select rounded-lg px-4 py-3 focus:border-blue-400 focus:outline-none"
            >
              <option value="all">Toutes priorités</option>
              <option value="urgent">Urgent</option>
              <option value="high">Haute</option>
              <option value="normal">Normale</option>
              <option value="low">Basse</option>
            </select>
          </div>
        </div>
      </div>

      {/* Liste des commandes */}
      <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-white/5">
              <tr>
                <th className="text-left p-4 text-gray-300 font-semibold">
                  Commande
                </th>
                <th className="text-left p-4 text-gray-300 font-semibold">
                  Client
                </th>
                <th className="text-left p-4 text-gray-300 font-semibold">
                  Statut
                </th>
                <th className="text-left p-4 text-gray-300 font-semibold">
                  Priorité
                </th>
                <th className="text-left p-4 text-gray-300 font-semibold">
                  Total
                </th>
                <th className="text-left p-4 text-gray-300 font-semibold">
                  Date
                </th>
                <th className="text-left p-4 text-gray-300 font-semibold">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map(order => (
                <tr
                  key={order.id}
                  className="border-t border-white/10 hover:bg-white/5 transition-colors"
                >
                  <td className="p-4">
                    <div>
                      <div className="text-white font-semibold">
                        #{order.id.slice(0, 8)}
                      </div>
                      <div className="text-gray-400 text-sm flex items-center gap-1">
                        <User size={12} />
                        {order.user_type === 'pro'
                          ? 'Professionnel'
                          : 'Particulier'}
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="text-white">
                      {order.profiles
                        ? `${order.profiles.first_name} ${order.profiles.last_name}`
                        : 'Client inconnu'}
                    </div>
                  </td>
                  <td className="p-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}
                    >
                      {getStatusText(order.status)}
                    </span>
                  </td>
                  <td className="p-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${getPriorityColor(order.priority)}`}
                    >
                      {order.priority?.charAt(0).toUpperCase() +
                        order.priority?.slice(1) || 'Normal'}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="text-white font-semibold">
                      {order.total.toLocaleString('fr-FR', EURO)}
                    </div>
                    <div className="text-gray-400 text-sm">
                      {order.order_items?.length || 0} article
                      {(order.order_items?.length || 0) > 1 ? 's' : ''}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="text-gray-300">
                      {new Date(order.created_at).toLocaleDateString('fr-FR')}
                    </div>
                    <div className="text-gray-400 text-sm">
                      {new Date(order.created_at).toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setSelectedOrder(order);
                          setShowOrderModal(true);
                        }}
                        className="p-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors"
                        title="Voir détails"
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        onClick={() => {
                          setEditingOrder(order);
                          setShowEditModal(true);
                        }}
                        className="p-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors"
                        title="Modifier"
                      >
                        <Edit3 size={16} />
                      </button>

                      {isRefundable(order) && (
                        <button
                          onClick={() => handleRefund(order)}
                          className="p-2 bg-purple-600/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors"
                          title="Rembourser"
                        >
                          <RotateCcw size={16} />
                        </button>
                      )}

                      {/* ★ « VOIR LA FACTURE » — un seul bouton, un seul geste.
                          La facture est désormais émise TOUTE SEULE au paiement
                          (`confirmer-commande`), avec son PDF. « Créer la facture » n'a
                          donc plus lieu d'être comme action courante : il laissait croire
                          qu'il fallait la fabriquer, et l'oublier bloquait tout
                          remboursement (un avoir doit référencer une facture).
                          `handleInvoiceAction` reste le rattrapage : si la facture manque
                          — comptabilité indisponible, commande antérieure — il l'émet
                          avant d'y conduire. Le libellé dit ce qu'on obtient, pas ce que
                          le programme fait. */}
                      <button
                        onClick={() => handleInvoiceAction(order.id)}
                        className={`p-2 rounded-lg transition-colors ${
                          orderInvoices[order.id]
                            ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                            : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                        }`}
                        title={
                          orderInvoices[order.id]
                            ? `Voir la facture ${orderInvoices[order.id].invoice_number}`
                            : "Voir la facture (elle sera émise si elle manque)"
                        }
                      >
                        <FileText size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {filteredOrders.length === 0 && (
        <div className="text-center py-12">
          <ShoppingCart className="text-gray-400 mx-auto mb-4" size={48} />
          <h3 className="text-white font-semibold mb-2">
            Aucune commande trouvée
          </h3>
          <p className="text-gray-400">
            Aucune commande ne correspond à vos critères de recherche
          </p>
        </div>
      )}

      {/* Modal détails commande */}
      {showOrderModal && selectedOrder && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 border border-white/10 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-white">
                Commande #{selectedOrder.id.slice(0, 8)}
              </h3>
              <button
                onClick={() => setShowOrderModal(false)}
                className="text-gray-400 hover:text-white transition-colors text-2xl"
              >
                ×
              </button>
            </div>

            <div className="grid lg:grid-cols-2 gap-8">
              {/* Informations commande */}
              <div className="space-y-6">
                <div>
                  <h4 className="text-white font-semibold mb-3">
                    Informations générales
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Statut:</span>
                      <span
                        className={`px-2 py-1 rounded text-xs ${getStatusColor(selectedOrder.status)}`}
                      >
                        {getStatusText(selectedOrder.status)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Priorité:</span>
                      <span
                        className={`px-2 py-1 rounded text-xs ${getPriorityColor(selectedOrder.priority)}`}
                      >
                        {selectedOrder.priority?.charAt(0).toUpperCase() +
                          selectedOrder.priority?.slice(1)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Type client:</span>
                      <span className="text-white">
                        {selectedOrder.user_type === 'pro'
                          ? 'Professionnel'
                          : 'Particulier'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Date:</span>
                      <span className="text-white">
                        {new Date(selectedOrder.created_at).toLocaleString(
                          'fr-FR'
                        )}
                      </span>
                    </div>
                    {selectedOrder.estimated_delivery && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">
                          Livraison estimée:
                        </span>
                        <span className="text-white">
                          {new Date(
                            selectedOrder.estimated_delivery
                          ).toLocaleDateString('fr-FR')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Adresse de livraison */}
                {selectedOrder.shipping_address && (
                  <div>
                    <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                      <MapPin size={16} />
                      Adresse de livraison
                    </h4>
                    <div className="bg-white/5 rounded-lg p-4 text-sm">
                      <div className="text-white font-medium">
                        {selectedOrder.shipping_address.first_name}{' '}
                        {selectedOrder.shipping_address.last_name}
                      </div>
                      {selectedOrder.shipping_address.company && (
                        <div className="text-gray-300">
                          {selectedOrder.shipping_address.company}
                        </div>
                      )}
                      <div className="text-gray-300">
                        {selectedOrder.shipping_address.address_line_1}
                      </div>
                      {selectedOrder.shipping_address.address_line_2 && (
                        <div className="text-gray-300">
                          {selectedOrder.shipping_address.address_line_2}
                        </div>
                      )}
                      <div className="text-gray-300">
                        {selectedOrder.shipping_address.postal_code}{' '}
                        {selectedOrder.shipping_address.city}
                      </div>
                      <div className="text-gray-300">
                        {selectedOrder.shipping_address.country}
                      </div>
                      {selectedOrder.shipping_address.phone && (
                        <div className="text-gray-300">
                          Tél: {selectedOrder.shipping_address.phone}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Notes admin */}
                {selectedOrder.admin_notes && (
                  <div>
                    <h4 className="text-white font-semibold mb-3">
                      Notes administrateur
                    </h4>
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                      <p className="text-blue-300 text-sm">
                        {selectedOrder.admin_notes}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Articles commandés */}
              <div>
                <h4 className="text-white font-semibold mb-3">
                  Articles commandés
                </h4>
                <div className="space-y-3 mb-6">
                  {selectedOrder.order_items?.map(item => (
                    <div
                      key={item.id}
                      className="flex items-center gap-4 p-3 bg-white/5 rounded-lg"
                    >
                      <img
                        src={
                          item.product.image
                            ? item.product.image.startsWith('/')
                              ? item.product.image
                              : `/${item.product.image}`
                            : 'https://images.pexels.com/photos/1181467/pexels-photo-1181467.jpeg'
                        }
                        alt={item.product.name}
                        className="w-12 h-12 object-cover rounded"
                      />
                      <div className="flex-1">
                        <div className="text-white font-medium">
                          {item.product.name}
                        </div>
                        <div className="text-gray-400 text-sm">
                          Quantité: {item.quantity} • Prix unitaire:{' '}
                          {item.price.toLocaleString('fr-FR', EURO)}
                        </div>
                      </div>
                      <div className="text-white font-semibold">
                        {(item.price * item.quantity).toLocaleString('fr-FR', EURO)}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Récapitulatif */}
                <div className="bg-white/5 rounded-lg p-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Sous-total:</span>
                      <span className="text-white">
                        {selectedOrder.sub_total.toLocaleString('fr-FR', EURO)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">TVA:</span>
                      <span className="text-white">
                        {selectedOrder.tax.toLocaleString('fr-FR', EURO)}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-white/20 pt-2 font-semibold">
                      <span className="text-white">Total:</span>
                      <span className="text-blue-400 text-lg">
                        {selectedOrder.total.toLocaleString('fr-FR', EURO)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal remboursement */}
      {showRefundModal && selectedOrder && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 border border-white/10 max-w-2xl w-full">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                <RotateCcw className="text-purple-400" size={28} />
                Remboursement
              </h3>
              <button
                onClick={() => {
                  setShowRefundModal(false);
                  setSelectedOrder(null);
                }}
                className="text-gray-400 hover:text-white transition-colors text-2xl"
              >
                ×
              </button>
            </div>

            {/* Informations commande */}
            <div className="bg-white/5 rounded-lg p-4 mb-6">
              <h4 className="text-white font-semibold mb-3">
                Commande à rembourser
              </h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-400">Numéro:</span>
                  <span className="text-white ml-2">
                    #{selectedOrder.id.slice(0, 8)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Client:</span>
                  <span className="text-white ml-2">
                    {selectedOrder.profiles
                      ? `${selectedOrder.profiles.first_name} ${selectedOrder.profiles.last_name}`
                      : 'Client inconnu'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Total:</span>
                  <span className="text-white ml-2">
                    {selectedOrder.total.toLocaleString('fr-FR', EURO)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Statut:</span>
                  <span
                    className={`ml-2 px-2 py-1 rounded text-xs ${getStatusColor(selectedOrder.status)}`}
                  >
                    {getStatusText(selectedOrder.status)}
                  </span>
                </div>
              </div>
            </div>

            <form onSubmit={processRefund} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Montant à rembourser (€) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={selectedOrder.total}
                  required
                  value={refundData.amount}
                  onChange={e =>
                    setRefundData({ ...refundData, amount: e.target.value })
                  }
                  className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none"
                  placeholder="0.00"
                />
                <p className="text-gray-400 text-xs mt-1">
                  Maximum: {selectedOrder.total.toLocaleString('fr-FR', EURO)}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Raison du remboursement *
                </label>
                <select
                  required
                  value={refundData.reason}
                  onChange={e =>
                    setRefundData({ ...refundData, reason: e.target.value })
                  }
                  className="w-full dark-select rounded-lg px-4 py-3 focus:border-blue-400 focus:outline-none"
                >
                  <option value="">Sélectionner une raison</option>
                  <option value="defaut_produit">Défaut produit</option>
                  <option value="annulation_client">Annulation client</option>
                  <option value="erreur_commande">Erreur de commande</option>
                  <option value="retour_produit">Retour produit</option>
                  <option value="geste_commercial">Geste commercial</option>
                  <option value="autre">Autre</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Notes administrateur (optionnel)
                </label>
                <textarea
                  rows={3}
                  value={refundData.adminNotes}
                  onChange={e =>
                    setRefundData({ ...refundData, adminNotes: e.target.value })
                  }
                  className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none resize-none"
                  placeholder="Notes internes sur ce remboursement..."
                />
              </div>

              <div className="bg-purple-600/10 border border-purple-600/20 rounded-lg p-4">
                <h4 className="text-purple-400 font-semibold mb-2">
                  ⚠️ Attention
                </h4>
                <p className="text-gray-300 text-sm">
                  Cette action va traiter un remboursement via Stripe. Cette
                  opération est irréversible.
                </p>
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={refundLoading}
                  className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-purple-500/25 transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {refundLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Traitement...
                    </>
                  ) : (
                    <>
                      <RotateCcw size={20} />
                      Traiter le Remboursement
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowRefundModal(false);
                    setSelectedOrder(null);
                  }}
                  className="px-6 border-2 border-white/30 text-white rounded-lg font-semibold hover:bg-white/10 hover:border-white/50 transition-all duration-300"
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal édition commande */}
      {showEditModal && editingOrder && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 border border-white/10 max-w-2xl w-full">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-white">
                Modifier la commande
              </h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-gray-400 hover:text-white transition-colors text-2xl"
              >
                ×
              </button>
            </div>

            <form
              onSubmit={e => {
                e.preventDefault();
                const formData = new FormData(e.target as HTMLFormElement);
                /* ⚠ `|| undefined` transformait une chaîne VIDE en « champ non soumis » :
                   effacer un lien de suivi erroné n'avait donc aucun effet, et le client
                   continuait de suivre le colis de quelqu'un d'autre. On passe la valeur
                   telle quelle (`?? undefined` ne neutralise que le champ ABSENT) et
                   c'est `updateOrderStatus` qui traduit « vide » par « effacer ». */
                const champ = (nom: string) =>
                  (formData.get(nom) as string | null) ?? undefined;
                updateOrderStatus(
                  editingOrder.id,
                  formData.get('status') as string,
                  champ('admin_notes'),
                  champ('tracking_link'),
                  champ('estimated_delivery'),
                  formData.get('priority') as string
                );
              }}
              className="space-y-6"
            >
              {/* Actions rapides */}
              <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-lg p-4 border border-blue-500/20">
                <h4 className="text-blue-400 font-semibold mb-3">
                  🚀 Actions Rapides
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      updateOrderStatus(editingOrder.id, 'confirmed');
                    }}
                    className="bg-green-500/20 text-green-400 px-3 py-2 rounded-lg hover:bg-green-500/30 transition-colors text-sm font-medium"
                  >
                    ✅ Confirmer
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateOrderStatus(editingOrder.id, 'shipped');
                    }}
                    className="bg-blue-500/20 text-blue-400 px-3 py-2 rounded-lg hover:bg-blue-500/30 transition-colors text-sm font-medium"
                  >
                    🚚 Expédier
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateOrderStatus(editingOrder.id, 'delivered');
                    }}
                    className="bg-green-500/20 text-green-400 px-3 py-2 rounded-lg hover:bg-green-500/30 transition-colors text-sm font-medium"
                  >
                    📦 Livrer
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        confirm(
                          'Êtes-vous sûr de vouloir annuler cette commande ?'
                        )
                      ) {
                        updateOrderStatus(editingOrder.id, 'cancelled');
                      }
                    }}
                    className="bg-red-500/20 text-red-400 px-3 py-2 rounded-lg hover:bg-red-500/30 transition-colors text-sm font-medium"
                  >
                    ❌ Annuler
                  </button>
                </div>
                <p className="text-gray-400 text-xs mt-2">
                  Cliquez sur une action pour changer rapidement le statut sans
                  remplir le formulaire
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Statut (ou utilisez les actions rapides ci-dessus)
                  </label>
                  <select
                    name="status"
                    defaultValue={editingOrder.status}
                    className="w-full dark-select rounded-lg px-4 py-3 focus:border-blue-400 focus:outline-none"
                  >
                    <option value="pending">En attente</option>
                    <option value="paid">Payée</option>
                    <option value="confirmed">Confirmée</option>
                    {/* « En préparation » : l'étape entre la confirmation et l'expédition,
                        que le client voit déjà sur sa page « Mes commandes ». Sans elle au
                        menu, l'exploitant ne pouvait pas la poser. */}
                    <option value="processing">En préparation</option>
                    <option value="shipped">Expédiée</option>
                    <option value="delivered">Livrée</option>
                    <option value="cancelled">Annulée</option>
                    {/* ⚠ « Remboursée » est posé automatiquement par le remboursement
                        Stripe ; il figure ici pour les cas traités hors ligne (virement de
                        retour, geste commercial) — et pour que l'exploitant puisse au
                        moins remettre une commande dans le bon état. Poser ce statut REND
                        LE STOCK (trigger `restaurer_stock_commande_trg`). */}
                    <option value="refunded">Remboursée</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Priorité
                  </label>
                  <select
                    name="priority"
                    defaultValue={editingOrder.priority}
                    className="w-full dark-select rounded-lg px-4 py-3 focus:border-blue-400 focus:outline-none"
                  >
                    <option value="low">Basse</option>
                    <option value="normal">Normale</option>
                    <option value="high">Haute</option>
                    <option value="urgent">Urgente</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Lien de suivi (optionnel)
                </label>
                <input
                  type="url"
                  name="tracking_link"
                  defaultValue={editingOrder.tracking_link || ''}
                  className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none"
                  placeholder="https://..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Date de livraison estimée (optionnel)
                </label>
                <input
                  type="date"
                  name="estimated_delivery"
                  defaultValue={editingOrder.estimated_delivery || ''}
                  className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white focus:border-blue-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Notes administrateur (optionnel)
                </label>
                <textarea
                  name="admin_notes"
                  rows={4}
                  defaultValue={editingOrder.admin_notes || ''}
                  className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none resize-none"
                  placeholder="Notes internes sur cette commande..."
                />
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300"
                >
                  Mettre à jour avec le formulaire
                </button>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-6 border-2 border-white/30 text-white rounded-lg font-semibold hover:bg-white/10 hover:border-white/50 transition-all duration-300"
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminOrders;