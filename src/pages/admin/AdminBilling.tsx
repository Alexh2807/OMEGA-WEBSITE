import React, { useState, useEffect } from 'react';
import {
  FileText,
  Plus,
  Search,
  Filter,
  Eye,
  Edit3,
  Trash2,
  Download,
  Send,
  DollarSign,
  Calendar,
  User,
  Building,
  CreditCard,
  CheckCircle,
  Clock,
  AlertCircle,
  ExternalLink,
  Package,
  RotateCcw,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Invoice, Quote, BillingSettings, Refund } from '../../types/billing';
import InvoicePDF from '../../components/InvoicePDF';
import { generateInvoicePDF } from '../../utils/pdfGenerator';
import toast from 'react-hot-toast';
import Papa from 'papaparse';
import { format } from 'date-fns';

const AdminBilling = () => {
  const [activeTab, setActiveTab] = useState('invoices');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [billingSettings, setBillingSettings] =
    useState<BillingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundData, setRefundData] = useState({
    amount: '',
    reason: '',
    adminNotes: '',
    stripeChargeId: '',
  });
  const [refundLoading, setRefundLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    // Vérifier si on doit ouvrir une facture spécifique après chargement des factures
    const openInvoiceId = sessionStorage.getItem('openInvoiceId');
    if (openInvoiceId && invoices.length > 0) {
      sessionStorage.removeItem('openInvoiceId');
      const invoice = invoices.find(inv => inv.id === openInvoiceId);
      if (invoice) {
        console.log(
          '🎯 Ouverture automatique de la facture:',
          invoice.invoice_number
        );
        setSelectedInvoice(invoice);
        setShowInvoiceModal(true);
      }
    }
  }, [invoices]);

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([loadInvoices(), loadQuotes(), loadBillingSettings()]);
    } catch (err) {
      console.error('Erreur chargement données:', err);
      toast.error('Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  const loadInvoices = async () => {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select(
          `
          *,
          invoice_items (
            *,
            product:products (name, sku)
          ),
          payment_records (*),
          customer:profiles!invoices_customer_id_fkey (
            first_name,
            last_name
          )
        `
        )
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erreur chargement factures:', error);
        toast.error('Erreur lors du chargement des factures');
      } else {
        setInvoices(data || []);
      }
    } catch (err) {
      console.error('Erreur inattendue:', err);
    }
  };

  const loadQuotes = async () => {
    try {
      const { data, error } = await supabase
        .from('quotes')
        .select(
          `
          *,
          quote_items (
            *,
            product:products (name, sku)
          ),
          customer:profiles!quotes_customer_id_fkey (
            first_name,
            last_name
          )
        `
        )
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erreur chargement devis:', error);
        toast.error('Erreur lors du chargement des devis');
      } else {
        setQuotes(data || []);
      }
    } catch (err) {
      console.error('Erreur inattendue:', err);
    }
  };

  const loadBillingSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('billing_settings')
        .select('*')
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Erreur chargement paramètres:', error);
      } else {
        setBillingSettings(data);
      }
    } catch (err) {
      console.error('Erreur inattendue:', err);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid':
        return <CheckCircle className="text-green-400" size={16} />;
      case 'sent':
        return <Send className="text-blue-400" size={16} />;
      case 'overdue':
        return <AlertCircle className="text-red-400" size={16} />;
      case 'cancelled':
        return <AlertCircle className="text-gray-400" size={16} />;
      default:
        return <Clock className="text-yellow-400" size={16} />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'paid':
        return 'Payée';
      case 'sent':
        return 'Envoyée';
      case 'overdue':
        return 'En retard';
      case 'cancelled':
        return 'Annulée';
      default:
        return 'Brouillon';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'text-green-400 bg-green-500/20';
      case 'sent':
        return 'text-blue-400 bg-blue-500/20';
      case 'overdue':
        return 'text-red-400 bg-red-500/20';
      case 'cancelled':
        return 'text-gray-400 bg-gray-500/20';
      default:
        return 'text-yellow-400 bg-yellow-500/20';
    }
  };

  const handleDownloadPDF = async (invoice: Invoice) => {
    try {
      setSelectedInvoice(invoice);
      setShowInvoiceModal(true);

      // Attendre que le modal soit rendu
      setTimeout(async () => {
        try {
          await generateInvoicePDF(`facture-${invoice.invoice_number}`);
          toast.success('PDF téléchargé avec succès');
        } catch (error) {
          console.error('Erreur génération PDF:', error);
          toast.error('Erreur lors de la génération du PDF');
        } finally {
          setShowInvoiceModal(false);
          setSelectedInvoice(null);
        }
      }, 500);
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors du téléchargement');
    }
  };

  const handleRefund = async (invoice: Invoice) => {
    console.log('🔍 Début handleRefund pour facture:', invoice.invoice_number);
    console.log('📋 Payment records disponibles:', invoice.payment_records);

    // Calculer le montant maximum remboursable
    const totalRefunded = (invoice.payment_records || [])
      .filter(record => record.payment_method === 'refund')
      .reduce((sum, record) => sum + record.amount, 0);

    const maxRefundable = invoice.total_ttc - totalRefunded;

    if (maxRefundable <= 0) {
      toast.error('Cette facture a déjà été entièrement remboursée');
      return;
    }

    // Stratégie 1: Chercher un paiement avec charge_id
    const primaryPayment = (invoice.payment_records || []).find(
      record =>
        record.payment_method === 'carte' &&
        record.amount > 0 &&
        record.stripe_charge_id &&
        record.stripe_charge_id.startsWith('ch_')
    );

    console.log('💳 Paiement principal trouvé:', primaryPayment);

    if (primaryPayment && primaryPayment.stripe_charge_id) {
      // Cas idéal: nous avons un charge ID
      console.log('✅ Charge ID trouvé:', primaryPayment.stripe_charge_id);
      setSelectedInvoice(invoice);
      setRefundData({
        amount: maxRefundable.toFixed(2),
        reason: '',
        adminNotes: '',
        stripeChargeId: primaryPayment.stripe_charge_id,
      });
      setShowRefundModal(true);
      return;
    }

    // Stratégie 2: Chercher un paiement avec reference (Payment Intent)
    const paymentWithIntent = (invoice.payment_records || []).find(
      record =>
        record.payment_method === 'carte' &&
        record.amount > 0 &&
        record.reference &&
        record.reference.startsWith('pi_')
    );

    console.log('🔄 Paiement avec Payment Intent trouvé:', paymentWithIntent);

    if (paymentWithIntent && paymentWithIntent.reference) {
      // Nous avons un Payment Intent, on peut récupérer le charge ID via Stripe
      console.log(
        '⚠️ Utilisation du Payment Intent ID:',
        paymentWithIntent.reference
      );
      setSelectedInvoice(invoice);
      setRefundData({
        amount: maxRefundable.toFixed(2),
        reason: '',
        adminNotes: '',
        stripeChargeId: paymentWithIntent.reference, // Le backend gérera la conversion PI -> Charge
      });
      setShowRefundModal(true);
      return;
    }

    // Stratégie 3: Utiliser l'order pour récupérer le Payment Intent
    if (invoice.order_id) {
      console.log(
        '🔍 Tentative de récupération via order_id:',
        invoice.order_id
      );
      try {
        const { data: order, error } = await supabase
          .from('orders')
          .select('stripe_payment_intent_id')
          .eq('id', invoice.order_id)
          .single();

        if (!error && order?.stripe_payment_intent_id) {
          console.log(
            '✅ Payment Intent trouvé via order:',
            order.stripe_payment_intent_id
          );
          setSelectedInvoice(invoice);
          setRefundData({
            amount: maxRefundable.toFixed(2),
            reason: '',
            adminNotes: '',
            stripeChargeId: order.stripe_payment_intent_id,
          });
          setShowRefundModal(true);
          return;
        }
      } catch (err) {
        console.error('Erreur récupération order:', err);
      }
    }

    // Aucune stratégie n'a fonctionné
    console.error('❌ Aucun identifiant Stripe trouvé pour cette facture');
    console.error('📊 Données disponibles:', {
      payment_records: invoice.payment_records,
      order_id: invoice.order_id,
    });

    toast.error(
      'Impossible de traiter le remboursement : aucun identifiant de paiement Stripe trouvé. ' +
        "Cette facture n'a peut-être pas été payée via Stripe ou les données de paiement sont incomplètes."
    );
  };

  const processRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;

    setRefundLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        toast.error('Session expirée');
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
            invoiceId: selectedInvoice.id,
            orderId: selectedInvoice.order_id,
            chargeId: refundData.stripeChargeId,
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

      toast.success(result.message || 'Remboursement traité avec succès');
      setShowRefundModal(false);
      setSelectedInvoice(null);
      setRefundData({
        amount: '',
        reason: '',
        adminNotes: '',
        stripeChargeId: '',
      });

      // Recharger les données
      loadInvoices();
    } catch (error) {
      console.error('Erreur remboursement:', error);
      toast.error(error.message || 'Erreur lors du remboursement');
    } finally {
      setRefundLoading(false);
    }
  };

  // Fonction pour aller à la commande depuis une facture
  const goToOrder = (orderId: string) => {
    console.log('🔗 Navigation vers commande depuis facture:', orderId);
    // Stocker l'ID de la commande et naviguer vers les commandes
    sessionStorage.setItem('openOrderId', orderId);

    // Déclencher l'événement pour changer d'onglet avec un délai
    setTimeout(() => {
      console.log('🔄 Déclenchement événement switchToOrders');
      window.dispatchEvent(new CustomEvent('switchToOrders'));
    }, 100);
  };

  const getRefundableAmount = (invoice: Invoice) => {
    const totalRefunded = (invoice.payment_records || [])
      .filter(record => record.payment_method === 'refund')
      .reduce((sum, record) => sum + record.amount, 0);

    return invoice.total_ttc - totalRefunded;
  };

  const isRefundable = (invoice: Invoice) => {
    return (
      invoice.status === 'paid' &&
      invoice.order_id &&
      getRefundableAmount(invoice) > 0
    );
  };

  const filteredInvoices = invoices.filter(invoice => {
    // Logique de filtrage rendue plus robuste
    const customerName =
      (invoice.customer
        ? `${invoice.customer.first_name} ${invoice.customer.last_name}`
        : invoice.customer_name) || '';
    const invoiceNumber = invoice.invoice_number || '';

    const matchesSearch =
      invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customerName.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === 'all' || invoice.status === statusFilter;

    // Filtre par plage de dates
    const invoiceDate = new Date(invoice.created_at);
    const startDate = dateRange.start ? new Date(dateRange.start) : null;
    const endDate = dateRange.end ? new Date(dateRange.end) : null;

    if (startDate) startDate.setHours(0, 0, 0, 0);
    if (endDate) endDate.setHours(23, 59, 59, 999);

    const matchesDate =
      (!startDate || invoiceDate >= startDate) &&
      (!endDate || invoiceDate <= endDate);

    return matchesSearch && matchesStatus && matchesDate;
  });

  const filteredQuotes = quotes.filter(quote => {
    const customerName =
      (quote.customer
        ? `${quote.customer.first_name} ${quote.customer.last_name}`
        : quote.customer_name) || '';
    const quoteNumber = quote.quote_number || '';

    const matchesSearch =
      quoteNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customerName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' || quote.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleExportCSV = () => {
    if (filteredInvoices.length === 0) {
      toast.error('Aucune facture à exporter pour les filtres sélectionnés.');
      return;
    }

    try {
      const dataToExport = filteredInvoices.map(invoice => {
        const paymentDate = invoice.payment_records?.find(
          p => p.status === 'succeeded' && p.payment_method !== 'refund'
        )?.created_at;

        return {
          'Numéro Facture': invoice.invoice_number || '',
          'Date Création': format(new Date(invoice.created_at), 'yyyy-MM-dd'),
          'Date Échéance': invoice.due_date
            ? format(new Date(invoice.due_date), 'yyyy-MM-dd')
            : '',
          Client:
            (invoice.customer
              ? `${invoice.customer.first_name} ${invoice.customer.last_name}`
              : invoice.customer_name) || '',
          'Email Client': invoice.customer_email || '',
          Statut: getStatusText(invoice.status),
          'Total HT': (invoice.total_ht || 0).toFixed(2),
          'Total TVA': (invoice.total_tva || 0).toFixed(2),
          'Total TTC': (invoice.total_ttc || 0).toFixed(2),
          'Montant Payé': (invoice.amount_paid || 0).toFixed(2),
          'Date Paiement': paymentDate
            ? format(new Date(paymentDate), 'yyyy-MM-dd HH:mm')
            : '',
          'ID Commande': invoice.order_id || '',
        };
      });

      const csv = Papa.unparse(dataToExport);
      const blob = new Blob([`\uFEFF${csv}`], {
        type: 'text/csv;charset=utf-8;',
      });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);

      link.href = url;
      link.style.visibility = 'hidden';
      link.download = `export-factures-${format(new Date(), 'yyyy-MM-dd')}.csv`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('Export CSV généré avec succès !');
    } catch (error) {
      console.error("Erreur lors de la génération du CSV:", error);
      toast.error("Une erreur est survenue lors de l'export.");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-white text-xl">
          Chargement de la facturation...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
            <FileText className="text-green-400" size={32} />
            Gestion de la Facturation
          </h1>
          <p className="text-gray-400">
            Gérez vos factures, devis et paramètres de facturation
          </p>
        </div>
      </div>

      {/* Statistiques rapides */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-white/10">
          <div className="text-2xl font-bold text-white">{invoices.length}</div>
          <div className="text-gray-400 text-sm">Total factures</div>
        </div>
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-white/10">
          <div className="text-2xl font-bold text-green-400">
            {invoices.filter(i => i.status === 'paid').length}
          </div>
          <div className="text-gray-400 text-sm">Payées</div>
        </div>
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-white/10">
          <div className="text-2xl font-bold text-blue-400">
            {invoices.filter(i => i.status === 'sent').length}
          </div>
          <div className="text-gray-400 text-sm">Envoyées</div>
        </div>
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-white/10">
          <div className="text-2xl font-bold text-yellow-400">
            {invoices.filter(i => i.status === 'draft').length}
          </div>
          <div className="text-gray-400 text-sm">Brouillons</div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-4 border-b border-white/20">
        {[
          { id: 'invoices', label: 'Factures', icon: FileText },
          { id: 'quotes', label: 'Devis', icon: FileText },
          { id: 'settings', label: 'Paramètres', icon: Building },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-6 py-3 font-semibold transition-colors ${
              activeTab === tab.id
                ? 'text-green-400 border-b-2 border-green-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <tab.icon size={20} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filtres */}
      {(activeTab === 'invoices' || activeTab === 'quotes') && (
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-6 border border-white/10">
          <div className="flex flex-col md:flex-row flex-wrap gap-4 items-center">
            <div className="flex-1 relative min-w-[200px]">
              <Search
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                size={20}
              />
              <input
                type="text"
                placeholder={`Rechercher ${
                  activeTab === 'invoices' ? 'une facture' : 'un devis'
                }...`}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-white/10 border border-white/20 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-400 focus:border-green-400 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="text-gray-400" size={20} />
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="dark-select rounded-lg px-4 py-3 focus:border-green-400 focus:outline-none"
              >
                <option value="all">Tous les statuts</option>
                <option value="draft">Brouillons</option>
                <option value="sent">Envoyés</option>
                {activeTab === 'invoices' && (
                  <>
                    <option value="paid">Payées</option>
                    <option value="overdue">En retard</option>
                  </>
                )}
                {activeTab === 'quotes' && (
                  <>
                    <option value="accepted">Acceptés</option>
                    <option value="rejected">Refusés</option>
                    <option value="expired">Expirés</option>
                  </>
                )}
                <option value="cancelled">Annulés</option>
              </select>
            </div>
            {activeTab === 'invoices' && (
              <>
                <div className="flex items-center gap-2">
                  <Calendar className="text-gray-400" size={20} />
                  <input
                    type="date"
                    value={dateRange.start}
                    onChange={e =>
                      setDateRange({ ...dateRange, start: e.target.value })
                    }
                    className="dark-select rounded-lg px-4 py-3 focus:border-green-400 focus:outline-none"
                    title="Date de début"
                  />
                  <span className="text-gray-400">-</span>
                  <input
                    type="date"
                    value={dateRange.end}
                    onChange={e =>
                      setDateRange({ ...dateRange, end: e.target.value })
                    }
                    className="dark-select rounded-lg px-4 py-3 focus:border-green-400 focus:outline-none"
                    title="Date de fin"
                  />
                </div>
                <button
                  onClick={handleExportCSV}
                  className="flex items-center justify-center gap-2 bg-green-500/20 text-green-400 rounded-lg px-4 py-3 font-semibold hover:bg-green-500/30 transition-colors"
                >
                  <Download size={18} />
                  Exporter CSV
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Contenu des onglets */}
      {activeTab === 'invoices' && (
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/5">
                <tr>
                  <th className="text-left p-4 text-gray-300 font-semibold">
                    Facture
                  </th>
                  <th className="text-left p-4 text-gray-300 font-semibold">
                    Client
                  </th>
                  <th className="text-left p-4 text-gray-300 font-semibold">
                    Statut
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
                {filteredInvoices.map(invoice => (
                  <tr
                    key={invoice.id}
                    className="border-t border-white/10 hover:bg-white/5 transition-colors"
                  >
                    <td className="p-4">
                      <div>
                        <div className="text-white font-semibold">
                          {invoice.invoice_number}
                        </div>
                        {invoice.order_id && (
                          <div className="text-gray-400 text-sm flex items-center gap-1">
                            <Package size={12} />
                            Commande #{invoice.order_id.slice(0, 8)}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="text-white">
                        {(invoice.customer
                          ? `${invoice.customer.first_name} ${invoice.customer.last_name}`
                          : invoice.customer_name) || 'N/A'}
                      </div>
                      <div className="text-gray-400 text-sm">
                        {invoice.customer_email}
                      </div>
                    </td>
                    <td className="p-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(
                          invoice.status
                        )}`}
                      >
                        {getStatusText(invoice.status)}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="text-white font-semibold">
                        {invoice.total_ttc.toFixed(2)}€
                      </div>
                      <div className="text-gray-400 text-sm">
                        Payé: {invoice.amount_paid.toFixed(2)}€
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="text-gray-300">
                        {new Date(invoice.created_at).toLocaleDateString(
                          'fr-FR'
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setSelectedInvoice(invoice);
                            setShowInvoiceModal(true);
                          }}
                          className="p-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors"
                          title="Voir détails"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => handleDownloadPDF(invoice)}
                          className="p-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors"
                          title="Télécharger PDF"
                        >
                          <Download size={16} />
                        </button>
                        {isRefundable(invoice) && (
                          <button
                            onClick={() => handleRefund(invoice)}
                            className="p-2 bg-orange-500/20 text-orange-400 rounded-lg hover:bg-orange-500/30 transition-colors"
                            title="Rembourser"
                          >
                            <RotateCcw size={16} />
                          </button>
                        )}
                        {invoice.order_id && (
                          <button
                            onClick={() => goToOrder(invoice.order_id!)}
                            className="p-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors"
                            title="Aller à la commande"
                          >
                            <ExternalLink size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'quotes' && (
        <div className="text-center py-12">
          <FileText className="text-gray-400 mx-auto mb-4" size={48} />
          <h3 className="text-white font-semibold mb-2">Gestion des Devis</h3>
          <p className="text-gray-400">
            Fonctionnalité en cours de développement
          </p>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="text-center py-12">
          <Building className="text-gray-400 mx-auto mb-4" size={48} />
          <h3 className="text-white font-semibold mb-2">
            Paramètres de Facturation
          </h3>
          <p className="text-gray-400">
            Fonctionnalité en cours de développement
          </p>
        </div>
      )}

      {/* Modal remboursement */}
      {showRefundModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 border border-white/10 max-w-2xl w-full">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                <RotateCcw className="text-orange-400" size={28} />
                Remboursement
              </h3>
              <button
                onClick={() => {
                  setShowRefundModal(false);
                  setSelectedInvoice(null);
                }}
                className="text-gray-400 hover:text-white transition-colors text-2xl"
              >
                ×
              </button>
            </div>

            {/* Informations facture */}
            <div className="bg-white/5 rounded-lg p-4 mb-6">
              <h4 className="text-white font-semibold mb-3">
                Facture à rembourser
              </h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-400">Numéro:</span>
                  <span className="text-white ml-2">
                    {selectedInvoice.invoice_number}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Client:</span>
                  <span className="text-white ml-2">
                    {selectedInvoice.customer_name}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Total TTC:</span>
                  <span className="text-white ml-2">
                    {selectedInvoice.total_ttc.toFixed(2)}€
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Remboursable:</span>
                  <span className="text-green-400 ml-2 font-semibold">
                    {getRefundableAmount(selectedInvoice).toFixed(2)}€
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
                  max={getRefundableAmount(selectedInvoice)}
                  required
                  value={refundData.amount}
                  onChange={e =>
                    setRefundData({ ...refundData, amount: e.target.value })
                  }
                  className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-orange-400 focus:outline-none"
                  placeholder="0.00"
                />
                <p className="text-gray-400 text-xs mt-1">
                  Maximum: {getRefundableAmount(selectedInvoice).toFixed(2)}€
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
                  className="w-full dark-select rounded-lg px-4 py-3 focus:border-orange-400 focus:outline-none"
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
                    setRefundData({
                      ...refundData,
                      adminNotes: e.target.value,
                    })
                  }
                  className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-orange-400 focus:outline-none resize-none"
                  placeholder="Notes internes sur ce remboursement..."
                />
              </div>

              <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4">
                <h4 className="text-orange-400 font-semibold mb-2">
                  ⚠️ Attention
                </h4>
                <p className="text-gray-300 text-sm">
                  Cette action va traiter un remboursement via Stripe et mettre
                  à jour automatiquement le statut de la facture. Cette
                  opération est irréversible.
                </p>
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={refundLoading}
                  className="flex-1 bg-gradient-to-r from-orange-500 to-red-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-orange-500/25 transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-2"
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
                    setSelectedInvoice(null);
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

      {/* Modal détails facture */}
      {showInvoiceModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b flex items-center justify-between bg-gray-100">
              <h3 className="text-xl font-bold text-gray-800">
                Aperçu Facture
              </h3>
              <button
                onClick={() => {
                  setShowInvoiceModal(false);
                  setSelectedInvoice(null);
                }}
                className="text-gray-600 hover:text-gray-800 text-2xl"
              >
                ×
              </button>
            </div>
            <InvoicePDF
              invoice={selectedInvoice}
              billingSettings={billingSettings}
            />
          </div>
        </div>
      )}

      {filteredInvoices.length === 0 && activeTab === 'invoices' && (
        <div className="text-center py-12">
          <FileText className="text-gray-400 mx-auto mb-4" size={48} />
          <h3 className="text-white font-semibold mb-2">
            Aucune facture trouvée
          </h3>
          <p className="text-gray-400">
            Aucune facture ne correspond à vos critères de recherche.
          </p>
        </div>
      )}
    </div>
  );
};

export default AdminBilling; 