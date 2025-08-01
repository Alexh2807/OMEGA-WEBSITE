import React, { useState, useEffect } from 'react';
import {
  ShoppingCart,
  Search,
  Filter,
  Eye,
  Package,
  Calendar,
  User,
  MapPin,
  CreditCard,
  Truck,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  Edit3,
  FileText,
  Download,
  RefreshCw,
  ExternalLink,
  RotateCcw,
  DollarSign,
  Mail,
  Phone,
  Building,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

interface Order {
  id: string;
  user_id: string;
  sub_total: number;
  tax: number;
  total: number;
  status: string;
  shipping_address: any;
  tracking_link: string;
  admin_notes: string;
  notes: string;
  priority: string;
  estimated_delivery: string;
  created_at: string;
  updated_at: string;
  user_type: string;
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
    phone: string;
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
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    status: '',
    tracking_link: '',
    admin_notes: '',
    notes: '',
    priority: '',
    estimated_delivery: '',
  });

  useEffect(() => {
    loadOrders();
    
    // Écouter l'événement pour ouvrir une commande spécifique
    const handleOpenOrder = () => {
      const orderId = sessionStorage.getItem('openOrderId');
      if (orderId && orders.length > 0) {
        sessionStorage.removeItem('openOrderId');
        const order = orders.find(o => o.id === orderId);
        if (order) {
          setSelectedOrder(order);
          setShowOrderModal(true);
        }
      }
    };

    window.addEventListener('switchToOrders', handleOpenOrder);
    handleOpenOrder(); // Vérifier immédiatement

    return () => {
      window.removeEventListener('switchToOrders', handleOpenOrder);
    };
  }, [orders]);

  const loadOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
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
          profiles!orders_user_id_profiles_fkey (
            first_name,
            last_name,
            phone
          )
        `)
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

  const updateOrder = async (orderId: string, updates: any) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId);

      if (error) {
        console.error('Error updating order:', error);
        toast.error('Erreur lors de la mise à jour');
      } else {
        toast.success('Commande mise à jour avec succès');
        loadOrders();
        setShowEditModal(false);
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      toast.error('Erreur inattendue');
    }
  };

  const createInvoiceFromOrder = async (order: Order) => {
    try {
      const toastId = toast.loading('Création de la facture...');

      // Utiliser la nouvelle fonction atomique pour obtenir le numéro de facture
      const { data: invoiceNumber, error: numberError } = await supabase
        .rpc('get_next_invoice_number');

      if (numberError) {
        console.error('Error getting invoice number:', numberError);
        toast.error('Erreur lors de la génération du numéro de facture', { id: toastId });
        return;
      }

      // Créer la facture avec le numéro généré atomiquement
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          invoice_number: invoiceNumber,
          order_id: order.id,
          customer_id: order.user_id,
          customer_name: `${order.profiles?.first_name || ''} ${order.profiles?.last_name || ''}`.trim() || 'Client',
          customer_email: '',
          customer_phone: order.profiles?.phone || '',
          customer_address: order.shipping_address,
          billing_address: order.shipping_address,
          status: 'sent',
          subtotal_ht: order.sub_total,
          tax_amount: order.tax,
          total_ttc: order.total,
          amount_paid: order.total, // Commande déjà payée
          due_date: new Date().toISOString().split('T')[0],
          payment_terms: 30,
          notes: order.notes,
          created_by: (await supabase.auth.getUser()).data.user?.id,
          sent_at: new Date().toISOString(),
          paid_at: new Date().toISOString(), // Marquer comme payée immédiatement
        })
        .select()
        .single();

      if (invoiceError) {
        console.error('Error creating invoice:', invoiceError);
        toast.error('Erreur lors de la création de la facture: ' + invoiceError.message, { id: toastId });
        return;
      }

      // Créer les items de la facture
      const invoiceItems = order.order_items.map(item => ({
        invoice_id: invoice.id,
        product_id: item.product.id,
        description: item.product.name,
        quantity: item.quantity,
        unit_price_ht: order.user_type === 'pro' ? item.price : item.price / 1.2,
        tax_rate: 20.00,
        total_ht: order.user_type === 'pro' ? item.price * item.quantity : (item.price * item.quantity) / 1.2,
        total_ttc: item.price * item.quantity,
        sort_order: 0,
      }));

      const { error: itemsError } = await supabase
        .from('invoice_items')
        .insert(invoiceItems);

      if (itemsError) {
        console.error('Error creating invoice items:', itemsError);
        toast.error('Erreur lors de la création des items de facture', { id: toastId });
        return;
      }

      toast.success(`Facture ${invoiceNumber} créée avec succès !`, { id: toastId });
      
      // Ouvrir la facture dans l'onglet facturation
      sessionStorage.setItem('openInvoiceId', invoice.id);
      window.dispatchEvent(new CustomEvent('switchToBilling'));
      
    } catch (err: any) {
      console.error('Error creating invoice:', err);
      toast.error('Erreur lors de la création de la facture');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <CheckCircle className="text-green-400" size={16} />;
      case 'shipped':
        return <Truck className="text-blue-400" size={16} />;
      case 'delivered':
        return <Package className="text-green-500" size={16} />;
      case 'cancelled':
        return <XCircle className="text-red-400" size={16} />;
      default:
        return <Clock className="text-yellow-400" size={16} />;
    }
  };

  const getStatusText = (status: string) => {
    const statusMap: { [key: string]: string } = {
      confirmed: 'Confirmée',
      shipped: 'Expédiée',
      delivered: 'Livrée',
      cancelled: 'Annulée',
      pending: 'En attente',
    };
    return statusMap[status] || 'Inconnu';
  };

  const getStatusColor = (status: string) => {
    const colorMap: { [key: string]: string } = {
      confirmed: 'text-green-400 bg-green-500/20',
      shipped: 'text-blue-400 bg-blue-500/20',
      delivered: 'text-green-500 bg-green-500/20',
      cancelled: 'text-red-400 bg-red-500/20',
      pending: 'text-yellow-400 bg-yellow-500/20',
    };
    return colorMap[status] || 'text-gray-400 bg-gray-500/20';
  };

  const getPriorityColor = (priority: string) => {
    const colorMap: { [key: string]: string } = {
      urgent: 'text-red-400 bg-red-500/20',
      high: 'text-orange-400 bg-orange-500/20',
      normal: 'text-blue-400 bg-blue-500/20',
      low: 'text-gray-400 bg-gray-500/20',
    };
    return colorMap[priority] || 'text-blue-400 bg-blue-500/20';
  };

  const startEdit = (order: Order) => {
    setEditForm({
      status: order.status,
      tracking_link: order.tracking_link || '',
      admin_notes: order.admin_notes || '',
      notes: order.notes || '',
      priority: order.priority || 'normal',
      estimated_delivery: order.estimated_delivery || '',
    });
    setSelectedOrder(order);
    setShowEditModal(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedOrder) {
      updateOrder(selectedOrder.id, editForm);
    }
  };

  const filteredOrders = orders.filter(order => {
    const customerName = `${order.profiles?.first_name || ''} ${order.profiles?.last_name || ''}`.trim();
    const matchesSearch = 
      order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (order.profiles?.phone || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || order.priority === priorityFilter;
    
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
            <ShoppingCart className="text-purple-400" size={32} />
            Gestion des Commandes
          </h1>
          <p className="text-gray-400">
            Gérez les commandes clients et leur statut de livraison
          </p>
        </div>
        <button
          onClick={loadOrders}
          className="bg-gradient-to-r from-purple-500 to-purple-600 text-white px-4 py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-purple-500/25 transition-all duration-300 flex items-center gap-2"
        >
          <RefreshCw size={16} />
          Actualiser
        </button>
      </div>

      {/* Statistiques rapides */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-white/10">
          <div className="text-2xl font-bold text-white">{orders.length}</div>
          <div className="text-gray-400 text-sm">Total commandes</div>
        </div>
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-white/10">
          <div className="text-2xl font-bold text-green-400">
            {orders.filter(o => o.status === 'confirmed').length}
          </div>
          <div className="text-gray-400 text-sm">Confirmées</div>
        </div>
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-white/10">
          <div className="text-2xl font-bold text-blue-400">
            {orders.filter(o => o.status === 'shipped').length}
          </div>
          <div className="text-gray-400 text-sm">Expédiées</div>
        </div>
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-white/10">
          <div className="text-2xl font-bold text-purple-400">
            {orders.filter(o => o.status === 'delivered').length}
          </div>
          <div className="text-gray-400 text-sm">Livrées</div>
        </div>
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-white/10">
          <div className="text-2xl font-bold text-yellow-400">
            {orders.reduce((sum, o) => sum + o.total, 0).toFixed(2)}€
          </div>
          <div className="text-gray-400 text-sm">Chiffre d'affaires</div>
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
              placeholder="Rechercher par ID, nom client ou email..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-400 focus:border-purple-400 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="text-gray-400" size={20} />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white focus:border-purple-400 focus:outline-none [&>option]:bg-gray-800 [&>option]:text-white"
            >
              <option value="all">Tous les statuts</option>
              <option value="pending">En attente</option>
              <option value="confirmed">Confirmées</option>
              <option value="shipped">Expédiées</option>
              <option value="delivered">Livrées</option>
              <option value="cancelled">Annulées</option>
            </select>
            <select
              value={priorityFilter}
              onChange={e => setPriorityFilter(e.target.value)}
              className="bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white focus:border-purple-400 focus:outline-none [&>option]:bg-gray-800 [&>option]:text-white"
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
                <th className="text-left p-4 text-gray-300 font-semibold">Commande</th>
                <th className="text-left p-4 text-gray-300 font-semibold">Client</th>
                <th className="text-left p-4 text-gray-300 font-semibold">Statut</th>
                <th className="text-left p-4 text-gray-300 font-semibold">Priorité</th>
                <th className="text-left p-4 text-gray-300 font-semibold">Total</th>
                <th className="text-left p-4 text-gray-300 font-semibold">Date</th>
                <th className="text-left p-4 text-gray-300 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map(order => (
                <tr
                  key={order.id}
                  className="border-t border-white/10 hover:bg-white/5 transition-colors"
                >
                  <td className="p-4">
                    <div className="font-semibold text-white">
                      #{order.id.slice(0, 8)}
                    </div>
                    <div className="text-gray-400 text-sm">
                      {order.order_items?.length || 0} article(s)
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="text-white">
                      {`${order.profiles?.first_name || ''} ${order.profiles?.last_name || ''}`.trim() || 'Client anonyme'}
                    </div>
                    <div className="text-gray-400 text-sm">
                      {order.profiles?.phone || 'Téléphone non disponible'}
                    </div>
                    <div className="text-gray-400 text-xs">
                      Type: {order.user_type === 'pro' ? 'Professionnel' : 'Particulier'}
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                      {getStatusText(order.status)}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getPriorityColor(order.priority)}`}>
                      {order.priority?.charAt(0).toUpperCase() + order.priority?.slice(1) || 'Normal'}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="font-semibold text-white">
                      {order.total.toFixed(2)}€
                    </div>
                    <div className="text-gray-400 text-sm">
                      HT: {order.sub_total.toFixed(2)}€
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="text-gray-300">
                      {new Date(order.created_at).toLocaleDateString('fr-FR')}
                    </div>
                    <div className="text-gray-400 text-sm">
                      {new Date(order.created_at).toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit'
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
                        onClick={() => startEdit(order)}
                        className="p-2 bg-yellow-500/20 text-yellow-400 rounded-lg hover:bg-yellow-500/30 transition-colors"
                        title="Modifier"
                      >
                        <Edit3 size={16} />
                      </button>
                      <button
                        onClick={() => createInvoiceFromOrder(order)}
                        className="p-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors"
                        title="Créer facture"
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
          <h3 className="text-white font-semibold mb-2">Aucune commande trouvée</h3>
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
              {/* Informations client */}
              <div className="space-y-6">
                <div>
                  <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                    <User className="text-blue-400" size={20} />
                    Informations Client
                  </h4>
                  <div className="bg-white/5 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Nom:</span>
                      <span className="text-white">
                        {`${selectedOrder.profiles?.first_name || ''} ${selectedOrder.profiles?.last_name || ''}`.trim() || 'Non renseigné'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Email:</span>
                      <span className="text-white">Non disponible</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Téléphone:</span>
                      <span className="text-white">{selectedOrder.profiles?.phone || 'Non renseigné'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Type:</span>
                      <span className="text-white">
                        {selectedOrder.user_type === 'pro' ? 'Professionnel' : 'Particulier'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Adresse de livraison */}
                {selectedOrder.shipping_address && (
                  <div>
                    <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                      <MapPin className="text-green-400" size={20} />
                      Adresse de Livraison
                    </h4>
                    <div className="bg-white/5 rounded-lg p-4">
                      <div className="text-white">
                        {selectedOrder.shipping_address.first_name} {selectedOrder.shipping_address.last_name}
                      </div>
                      {selectedOrder.shipping_address.company && (
                        <div className="text-gray-300">{selectedOrder.shipping_address.company}</div>
                      )}
                      <div className="text-gray-300 mt-2">
                        {selectedOrder.shipping_address.address_line_1}
                        {selectedOrder.shipping_address.address_line_2 && (
                          <><br />{selectedOrder.shipping_address.address_line_2}</>
                        )}
                        <br />
                        {selectedOrder.shipping_address.postal_code} {selectedOrder.shipping_address.city}
                        <br />
                        {selectedOrder.shipping_address.country}
                      </div>
                      {selectedOrder.shipping_address.phone && (
                        <div className="text-gray-300 mt-2">
                          Tél: {selectedOrder.shipping_address.phone}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Détails commande */}
              <div className="space-y-6">
                <div>
                  <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                    <Package className="text-purple-400" size={20} />
                    Détails de la Commande
                  </h4>
                  <div className="bg-white/5 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Statut:</span>
                      <span className={`px-2 py-1 rounded text-xs ${getStatusColor(selectedOrder.status)}`}>
                        {getStatusText(selectedOrder.status)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Priorité:</span>
                      <span className={`px-2 py-1 rounded text-xs ${getPriorityColor(selectedOrder.priority)}`}>
                        {selectedOrder.priority?.charAt(0).toUpperCase() + selectedOrder.priority?.slice(1) || 'Normal'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Date de commande:</span>
                      <span className="text-white">
                        {new Date(selectedOrder.created_at).toLocaleString('fr-FR')}
                      </span>
                    </div>
                    {selectedOrder.estimated_delivery && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">Livraison estimée:</span>
                        <span className="text-white">
                          {new Date(selectedOrder.estimated_delivery).toLocaleDateString('fr-FR')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Suivi */}
                {selectedOrder.tracking_link && (
                  <div>
                    <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                      <Truck className="text-blue-400" size={20} />
                      Suivi de Livraison
                    </h4>
                    <div className="bg-white/5 rounded-lg p-4">
                      <a
                        href={selectedOrder.tracking_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 flex items-center gap-2"
                      >
                        <ExternalLink size={16} />
                        Suivre le colis
                      </a>
                    </div>
                  </div>
                )}

                {/* Notes */}
                {(selectedOrder.admin_notes || selectedOrder.notes) && (
                  <div>
                    <h4 className="text-white font-semibold mb-3">Notes</h4>
                    <div className="space-y-3">
                      {selectedOrder.admin_notes && (
                        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                          <div className="text-blue-400 font-semibold text-sm mb-1">Note admin:</div>
                          <div className="text-gray-300 text-sm">{selectedOrder.admin_notes}</div>
                        </div>
                      )}
                      {selectedOrder.notes && (
                        <div className="bg-white/5 rounded-lg p-3">
                          <div className="text-gray-400 font-semibold text-sm mb-1">Note client:</div>
                          <div className="text-gray-300 text-sm">{selectedOrder.notes}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Articles commandés */}
            <div className="mt-8">
              <h4 className="text-white font-semibold mb-4 flex items-center gap-2">
                <Package className="text-green-400" size={20} />
                Articles Commandés
              </h4>
              <div className="space-y-3">
                {selectedOrder.order_items?.map(item => (
                  <div key={item.id} className="bg-white/5 rounded-lg p-4 flex items-center gap-4">
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
                      <h5 className="text-white font-semibold">{item.product.name}</h5>
                      <div className="text-gray-400 text-sm">
                        Quantité: {item.quantity} • Prix unitaire: {item.price.toFixed(2)}€
                      </div>
                    </div>
                    <div className="text-white font-bold">
                      {(item.price * item.quantity).toFixed(2)}€
                    </div>
                  </div>
                ))}
              </div>

              {/* Totaux */}
              <div className="mt-6 flex justify-end">
                <div className="w-64 space-y-2">
                  <div className="flex justify-between text-gray-300">
                    <span>Sous-total HT:</span>
                    <span>{selectedOrder.sub_total.toFixed(2)}€</span>
                  </div>
                  <div className="flex justify-between text-gray-300">
                    <span>TVA (20%):</span>
                    <span>{selectedOrder.tax.toFixed(2)}€</span>
                  </div>
                  <div className="flex justify-between text-xl font-bold text-white border-t border-white/20 pt-2">
                    <span>Total TTC:</span>
                    <span>{selectedOrder.total.toFixed(2)}€</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-4 mt-8">
              <button
                onClick={() => startEdit(selectedOrder)}
                className="bg-yellow-600 hover:bg-yellow-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors flex items-center gap-2"
              >
                <Edit3 size={16} />
                Modifier
              </button>
              <button
                onClick={() => createInvoiceFromOrder(selectedOrder)}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors flex items-center gap-2"
              >
                <FileText size={16} />
                Créer Facture
              </button>
              <button
                onClick={() => setShowOrderModal(false)}
                className="border-2 border-white/30 text-white px-6 py-3 rounded-lg font-semibold hover:bg-white/10 transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal modification commande */}
      {showEditModal && selectedOrder && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 border border-white/10 max-w-2xl w-full">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-white">
                Modifier la commande #{selectedOrder.id.slice(0, 8)}
              </h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-gray-400 hover:text-white transition-colors text-2xl"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-6">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Statut
                  </label>
                  <select
                    value={editForm.status}
                    onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                    className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white focus:border-purple-400 focus:outline-none [&>option]:bg-gray-800 [&>option]:text-white"
                  >
                    <option value="pending">En attente</option>
                    <option value="confirmed">Confirmée</option>
                    <option value="shipped">Expédiée</option>
                    <option value="delivered">Livrée</option>
                    <option value="cancelled">Annulée</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Priorité
                  </label>
                  <select
                    value={editForm.priority}
                    onChange={e => setEditForm({ ...editForm, priority: e.target.value })}
                    className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white focus:border-purple-400 focus:outline-none [&>option]:bg-gray-800 [&>option]:text-white"
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
                  Lien de suivi
                </label>
                <input
                  type="url"
                  value={editForm.tracking_link}
                  onChange={e => setEditForm({ ...editForm, tracking_link: e.target.value })}
                  className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-purple-400 focus:outline-none"
                  placeholder="https://..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Date de livraison estimée
                </label>
                <input
                  type="date"
                  value={editForm.estimated_delivery}
                  onChange={e => setEditForm({ ...editForm, estimated_delivery: e.target.value })}
                  className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white focus:border-purple-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Note administrative
                </label>
                <textarea
                  rows={3}
                  value={editForm.admin_notes}
                  onChange={e => setEditForm({ ...editForm, admin_notes: e.target.value })}
                  className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-purple-400 focus:outline-none resize-none"
                  placeholder="Note visible par le client..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Note interne
                </label>
                <textarea
                  rows={3}
                  value={editForm.notes}
                  onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                  className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-purple-400 focus:outline-none resize-none"
                  placeholder="Note interne (non visible par le client)..."
                />
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  className="flex-1 bg-gradient-to-r from-purple-500 to-purple-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-purple-500/25 transition-all duration-300"
                >
                  Mettre à jour
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