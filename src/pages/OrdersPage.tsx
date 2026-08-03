import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Package,
  Calendar,
  CreditCard,
  Truck,
  CheckCircle,
  Clock,
  XCircle,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  User,
  MapPin,
  FileText,
  Download,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { EURO } from '../utils/prix';
import { Invoice } from '../types/billing';
import InvoicePDF from '../components/InvoicePDF';
import { generateInvoicePDF } from '../utils/pdfGenerator';

interface Order {
  id: string;
  sub_total: number;
  tax: number;
  total: number;
  status: string;
  admin_notes: string;
  created_at: string;
  /* Utilisé plus bas pour le bloc « Suivi de votre colis » mais absent du type :
     TypeScript signalait la propriété comme inexistante à chaque compilation. */
  tracking_link?: string | null;
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
}

const OrdersPage = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  /* Factures du client, indexées par commande. Elles ne pouvaient PAS être lues
     jusqu'ici : la table n'avait qu'une règle d'accès réservée aux administrateurs,
     et cette page ne mentionnait pas le mot « facture ». Le client n'avait donc
     AUCUN moyen d'obtenir sa facture — alors que la remise d'une facture est une
     obligation du vendeur. */
  const [factures, setFactures] = useState<Record<string, Invoice>>({});
  const [factureEnCours, setFactureEnCours] = useState<Invoice | null>(null);

  useEffect(() => {
    if (user) {
      loadOrders();
      loadFactures();
    }
  }, [user]);

  const loadFactures = async () => {
    const { data, error } = await supabase
      .from('invoices')
      .select('*, invoice_items(*), payment_records(*)')
      .eq('customer_id', user?.id)
      .neq('status', 'draft');
    if (error) {
      console.error('Chargement des factures impossible :', error);
      return;
    }
    const parCommande: Record<string, Invoice> = {};
    (data || []).forEach((f: any) => {
      if (f.order_id) parCommande[f.order_id] = f as Invoice;
    });
    setFactures(parCommande);
  };

  /* Le PDF est fabriqué à partir du MÊME composant que celui du back-office : une
     seule mise en page, donc le client et le vendeur regardent le même document.
     On rend la facture hors écran, on la capture, puis on la retire. */
  const telechargerFacture = async (f: Invoice) => {
    const t = toast.loading('Préparation de votre facture…');
    setFactureEnCours(f);
    try {
      // Laisse React peindre le document avant la capture.
      await new Promise(r => setTimeout(r, 400));
      await generateInvoicePDF(`facture-${f.invoice_number}`);
      toast.success(`Facture ${f.invoice_number} téléchargée`, { id: t });
    } catch (e) {
      console.error('Génération du PDF impossible :', e);
      toast.error('Téléchargement impossible — réessayez ou contactez-nous', { id: t });
    } finally {
      setFactureEnCours(null);
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
          )
        `
        )
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading orders:', error);
        toast.error('Erreur lors du chargement des commandes');
      } else {
        setOrders(data || []);
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      toast.error('Erreur inattendue');
    } finally {
      setLoading(false);
    }
  };

  const toggleOrderExpansion = (orderId: string) => {
    const newExpanded = new Set(expandedOrders);
    if (newExpanded.has(orderId)) {
      newExpanded.delete(orderId);
    } else {
      newExpanded.add(orderId);
    }
    setExpandedOrders(newExpanded);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <CheckCircle className="text-green-400" size={20} />;
      case 'shipped':
        return <Truck className="text-blue-400" size={20} />;
      case 'delivered':
        return <Package className="text-green-500" size={20} />;
      case 'cancelled':
        return <XCircle className="text-red-400" size={20} />;
      default:
        return <Clock className="text-blue-400" size={20} />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'Confirmée';
      case 'shipped':
        return 'Expédiée';
      case 'delivered':
        return 'Livrée';
      case 'cancelled':
        return 'Annulée';
      default:
        return 'En attente';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'text-green-400';
      case 'shipped':
        return 'text-blue-400';
      case 'delivered':
        return 'text-green-500';
      case 'cancelled':
        return 'text-red-400';
      default:
        return 'text-blue-400';
    }
  };

  const getStatusProgress = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 25;
      case 'shipped':
        return 75;
      case 'delivered':
        return 100;
      case 'cancelled':
        return 0;
      default:
        return 0;
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24 flex items-center justify-center">
        <div className="text-center">
          <Package className="text-gray-400 mx-auto mb-4" size={64} />
          <h2 className="text-2xl font-bold text-white mb-4">
            Accès non autorisé
          </h2>
          <p className="text-gray-400">
            Veuillez vous connecter pour voir vos commandes
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24 flex items-center justify-center">
        <div className="text-white text-xl">Chargement des commandes...</div>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24 flex items-center justify-center">
        <div className="text-center">
          <Package className="text-gray-400 mx-auto mb-4" size={64} />
          <h2 className="text-2xl font-bold text-white mb-4">
            Aucune commande
          </h2>
          <p className="text-gray-400 mb-6">
            Vous n'avez pas encore passé de commande
          </p>
          <a
            href="/produits"
            className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-full font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300"
          >
            Découvrir nos produits
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24">
      <div className="container mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold text-white mb-8">Mes Commandes</h1>

        <div className="space-y-6">
          {orders.map(order => (
            <div
              key={order.id}
              className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden"
            >
              {/* Order Header */}
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="bg-gradient-to-br from-blue-500/20 to-purple-600/20 rounded-lg p-3">
                      <Package className="text-blue-400" size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">
                        Commande #{order.id.slice(0, 8)}
                      </h3>
                      <div className="flex items-center gap-2 text-gray-400 text-sm">
                        <Calendar size={16} />
                        {new Date(order.created_at).toLocaleDateString(
                          'fr-FR',
                          {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          }
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div
                      className={`flex items-center gap-2 ${getStatusColor(order.status)}`}
                    >
                      {getStatusIcon(order.status)}
                      <span className="font-semibold">
                        {getStatusText(order.status)}
                      </span>
                    </div>

                    <div className="text-right">
                      <div className="text-2xl font-bold text-white">
                        {order.total.toLocaleString('fr-FR', EURO)}
                      </div>
                      <div className="text-gray-400 text-sm flex items-center gap-1">
                        <CreditCard size={14} />
                        {order.status === 'cancelled' ? 'Annulée' : 'Payé'}
                      </div>
                    </div>
                    <button
                      onClick={() => toggleOrderExpansion(order.id)}
                      className="text-gray-400 hover:text-white transition-colors"
                    >
                      {expandedOrders.has(order.id) ? (
                        <ChevronUp size={24} />
                      ) : (
                        <ChevronDown size={24} />
                      )}
                    </button>
                  </div>
                </div>

                {/* FACTURE — le client doit pouvoir la récupérer lui-même, à tout
                    moment, sans avoir à la réclamer. Tant qu'elle n'est pas établie,
                    on le dit clairement plutôt que de ne rien afficher : un blanc
                    laisse croire à un oubli. */}
                <div className="mb-6">
                  {factures[order.id] ? (
                    <button
                      onClick={() => telechargerFacture(factures[order.id])}
                      disabled={!!factureEnCours}
                      className="flex items-center gap-2 px-4 py-3 rounded-lg bg-white/5 border border-white/15 text-white hover:border-blue-400 hover:bg-blue-500/10 transition-colors disabled:opacity-50"
                    >
                      <FileText size={18} className="text-blue-400" />
                      <span className="font-semibold">
                        Facture {factures[order.id].invoice_number}
                      </span>
                      <Download size={16} className="text-gray-400" />
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 text-gray-400 text-sm">
                      <FileText size={16} />
                      Votre facture sera disponible ici dès son établissement.
                    </div>
                  )}
                </div>

                {/* Tracking Link */}
                {order.tracking_link && (
                  <div className="mb-6 p-4 bg-gradient-to-r from-blue-500/10 to-green-500/10 rounded-lg border border-blue-500/20">
                    <h4 className="text-blue-400 font-semibold mb-3 flex items-center gap-2">
                      <Truck className="text-blue-400" size={20} />
                      Suivi de votre colis
                    </h4>
                    <p className="text-gray-300 text-sm mb-3">
                      Votre commande a été expédiée ! Suivez son acheminement en
                      temps réel :
                    </p>
                    <a
                      href={order.tracking_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-500 to-green-500 text-white px-4 py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-400/25 transition-all duration-300"
                    >
                      <ExternalLink size={16} />
                      Suivre mon colis
                    </a>
                  </div>
                )}

                {/* Quick Info - Always Visible */}
                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white/5 rounded-lg p-3">
                    <div className="text-gray-400 text-xs">Articles</div>
                    <div className="text-white font-semibold">
                      {order.order_items?.length || 0}
                    </div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3">
                    <div className="text-gray-400 text-xs">Statut</div>
                    <div
                      className={`font-semibold ${getStatusColor(order.status)}`}
                    >
                      {getStatusText(order.status)}
                    </div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3">
                    <div className="text-gray-400 text-xs">Total</div>
                    <div className="text-white font-semibold">
                      {order.total.toLocaleString('fr-FR', EURO)}
                    </div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3">
                    <div className="text-gray-400 text-xs">Date</div>
                    <div className="text-white font-semibold">
                      {new Date(order.created_at).toLocaleDateString('fr-FR')}
                    </div>
                  </div>
                </div>
              </div>

              {/* Expanded Details */}
              {expandedOrders.has(order.id) && (
                <div className="border-t border-white/10 p-6 bg-white/5">
                  {/* Status Progress Bar */}
                  <div className="mb-6">
                    <h4 className="text-white font-semibold mb-4 flex items-center gap-2">
                      <Truck className="text-blue-400" size={20} />
                      Suivi de Commande
                    </h4>
                    <div className="relative">
                      <div className="w-full bg-gray-700 rounded-full h-3">
                        <div
                          className="h-3 rounded-full transition-all duration-1000 ease-out bg-gradient-to-r from-blue-400 to-green-500"
                          style={{
                            width: `${getStatusProgress(order.status)}%`,
                          }}
                        ></div>
                      </div>
                      <div className="flex justify-between mt-3 text-sm">
                        <span
                          className={`${order.status === 'confirmed' ? 'text-blue-400 font-semibold' : 'text-gray-400'}`}
                        >
                          Confirmée
                        </span>
                        <span
                          className={`${order.status === 'shipped' ? 'text-blue-400 font-semibold' : 'text-gray-400'}`}
                        >
                          Expédiée
                        </span>
                        <span
                          className={`${order.status === 'delivered' ? 'text-green-400 font-semibold' : 'text-gray-400'}`}
                        >
                          Livrée
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Admin Message */}
                  {order.admin_notes && (
                    <div className="mb-6 p-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-lg border border-blue-500/20">
                      <h4 className="text-blue-400 font-semibold mb-2 flex items-center gap-2">
                        <MessageSquare className="text-blue-400" size={16} />
                        Message de notre équipe
                      </h4>
                      <p className="text-gray-300">{order.admin_notes}</p>
                    </div>
                  )}

                  {/* Order Items */}
                  <div className="mb-6">
                    <h4 className="text-white font-semibold mb-4 flex items-center gap-2">
                      <Package className="text-blue-400" size={20} />
                      Articles Commandés
                    </h4>
                    <div className="space-y-3">
                      {order.order_items.map(item => (
                        <div
                          key={item.id}
                          className="flex items-center gap-4 p-4 bg-white/5 rounded-lg"
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
                            className="w-16 h-16 object-cover rounded-lg"
                          />
                          <div className="flex-1">
                            <h4 className="text-white font-semibold">
                              {item.product.name}
                            </h4>
                            <div className="text-gray-400 text-sm">
                              Quantité: {item.quantity} • Prix unitaire:{' '}
                              {item.price.toLocaleString('fr-FR', EURO)}
                            </div>
                          </div>
                          <div className="text-white font-bold">
                            {(item.price * item.quantity).toLocaleString('fr-FR', EURO)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Order Summary */}
                  <div className="pt-4 border-t border-white/20">
                    <div className="flex justify-end">
                      <div className="w-64 space-y-2">
                        <div className="flex justify-between text-gray-300">
                          <span>Sous-total:</span>
                          <span>{order.sub_total.toLocaleString('fr-FR', EURO)}</span>
                        </div>
                        <div className="flex justify-between text-gray-300">
                          <span>TVA:</span>
                          <span>{order.tax.toLocaleString('fr-FR', EURO)}</span>
                        </div>
                        <div className="flex justify-between text-xl font-bold text-white border-t border-white/20 pt-2">
                          <span>Total:</span>
                          <span
                            className={
                              order.status === 'cancelled'
                                ? 'text-red-400'
                                : 'text-white'
                            }
                          >
                            {order.status === 'cancelled'
                              ? 'Commande Annulée'
                              : `${order.total.toLocaleString('fr-FR', EURO)}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Facture rendue HORS ÉCRAN le temps de la capture.
          Elle doit être réellement mise en page (largeur, polices, images) : un
          `display:none` ne produirait qu'une page blanche, html2canvas n'ayant rien à
          photographier. On la sort donc du champ de vision au lieu de la masquer. */}
      {factureEnCours && (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            left: '-10000px',
            top: 0,
            width: '800px',
            background: '#ffffff',
          }}
        >
          <InvoicePDF invoice={factureEnCours} />
        </div>
      )}
    </div>
  );
};

export default OrdersPage;
