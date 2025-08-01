import React, { useState, useEffect, useCallback } from 'react';
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
  FileUp,
  ChevronsRight,
  Save,
} from 'lucide-react';
import { supabase } from '../../lib/supabase'; // Assurez-vous que ce chemin est correct
import { Invoice, Quote, BillingSettings, Refund, PaymentRecord, InvoiceItem, QuoteItem } from '../../types/billing'; // Assurez-vous que ce chemin est correct
import InvoicePDF from '../../components/InvoicePDF'; // Assurez-vous que ce chemin est correct
import { generateInvoicePDF } from '../../utils/pdfGenerator'; // Assurez-vous que ce chemin est correct
import toast from 'react-hot-toast';

// --- MAIN COMPONENT ---
const AdminBilling = () => {
  // --- STATE MANAGEMENT ---
  const [activeTab, setActiveTab] = useState('invoices');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [billingSettings, setBillingSettings] = useState<BillingSettings | null>(null);
  const [settingsForm, setSettingsForm] = useState<Partial<BillingSettings>>({});
  const [loading, setLoading] = useState(true);

  // Filters and Search
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });

  // Modals and Selected Items
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // Forms Data
  const [refundData, setRefundData] = useState({ amount: '', reason: '', adminNotes: '', stripeChargeId: '' });
  const [paymentData, setPaymentData] = useState({ amount: '', payment_date: new Date().toISOString().slice(0, 10), payment_method: 'virement', reference: '' });
  const [refundLoading, setRefundLoading] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);

  // --- DATA LOADING & REALTIME SUBSCRIPTIONS ---

  const loadInvoices = useCallback(async () => {
    const { data, error } = await supabase
      .from('invoices')
      .select('*, invoice_items(*, product:products(name, sku)), payment_records(*), customer:profiles!invoices_customer_id_fkey(first_name, last_name)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erreur chargement factures:', error);
      toast.error('Erreur lors du chargement des factures');
    } else {
      setInvoices(data || []);
    }
  }, []);

  const loadQuotes = useCallback(async () => {
    const { data, error } = await supabase
      .from('quotes')
      .select('*, quote_items(*, product:products(name, sku)), customer:profiles!quotes_customer_id_fkey(first_name, last_name)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erreur chargement devis:', error);
      toast.error('Erreur lors du chargement des devis');
    } else {
      setQuotes(data || []);
    }
  }, []);

  const loadBillingSettings = useCallback(async () => {
    const { data, error } = await supabase.from('billing_settings').select('*').single();
    if (error && error.code !== 'PGRST116') {
      console.error('Erreur chargement paramètres:', error);
    } else {
      setBillingSettings(data);
      setSettingsForm(data || {});
    }
  }, []);

  useEffect(() => {
    const loadAllData = async () => {
      setLoading(true);
      await Promise.all([loadInvoices(), loadQuotes(), loadBillingSettings()]);
      setLoading(false);
    };
    loadAllData();

    // Realtime Subscriptions
    const channel = supabase.channel('billing-changes');
    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, loadInvoices)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quotes' }, loadQuotes)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'billing_settings' }, loadBillingSettings)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadInvoices, loadQuotes, loadBillingSettings]);

  useEffect(() => {
    // Auto-open invoice if specified in sessionStorage
    const openInvoiceId = sessionStorage.getItem('openInvoiceId');
    if (openInvoiceId && invoices.length > 0) {
      sessionStorage.removeItem('openInvoiceId');
      const invoice = invoices.find(inv => inv.id === openInvoiceId);
      if (invoice) {
        setSelectedInvoice(invoice);
        setShowInvoiceModal(true);
      }
    }
  }, [invoices]);
  
  // --- UI HELPER FUNCTIONS ---

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'paid': return { text: 'Payée', color: 'text-green-400 bg-green-500/20', icon: <CheckCircle size={16} /> };
      case 'sent': return { text: 'Envoyée', color: 'text-blue-400 bg-blue-500/20', icon: <Send size={16} /> };
      case 'overdue': return { text: 'En retard', color: 'text-red-400 bg-red-500/20', icon: <AlertCircle size={16} /> };
      case 'cancelled': return { text: 'Annulée', color: 'text-gray-400 bg-gray-500/20', icon: <X size={16} /> };
      case 'accepted': return { text: 'Accepté', color: 'text-teal-400 bg-teal-500/20', icon: <CheckCircle size={16} /> };
      case 'rejected': return { text: 'Refusé', color: 'text-red-400 bg-red-500/20', icon: <X size={16} /> };
      case 'expired': return { text: 'Expiré', color: 'text-yellow-500 bg-yellow-500/20', icon: <Clock size={16} /> };
      case 'converted': return { text: 'Converti', color: 'text-purple-400 bg-purple-500/20', icon: <FileUp size={16} /> };
      default: return { text: 'Brouillon', color: 'text-yellow-400 bg-yellow-500/20', icon: <Clock size={16} /> };
    }
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
      getRefundableAmount(invoice) > 0
    );
  };

  // --- FILTERING LOGIC ---

  const filteredInvoices = invoices.filter(invoice => {
    const customerName = invoice.customer ? `${invoice.customer.first_name} ${invoice.customer.last_name}` : invoice.customer_name;
    const matchesSearch = invoice.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) || customerName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || invoice.status === statusFilter;
    const invoiceDate = new Date(invoice.created_at);
    const matchesDate = (!dateRange.startDate || invoiceDate >= new Date(dateRange.startDate)) && (!dateRange.endDate || invoiceDate <= new Date(dateRange.endDate));
    return matchesSearch && matchesStatus && matchesDate;
  });

  const filteredQuotes = quotes.filter(quote => {
    const customerName = quote.customer ? `${quote.customer.first_name} ${quote.customer.last_name}` : quote.customer_name;
    const matchesSearch = quote.quote_number.toLowerCase().includes(searchTerm.toLowerCase()) || customerName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || quote.status === statusFilter;
    const quoteDate = new Date(quote.created_at);
    const matchesDate = (!dateRange.startDate || quoteDate >= new Date(dateRange.startDate)) && (!dateRange.endDate || quoteDate <= new Date(dateRange.endDate));
    return matchesSearch && matchesStatus && matchesDate;
  });

  // --- CORE FUNCTIONALITIES ---

  const handleDownloadPDF = async (invoice: Invoice) => {
    try {
      setSelectedInvoice(invoice);
      setShowInvoiceModal(true); // Show modal for PDF generation context
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

  const handleExportCSV = () => {
    const headers = ["Numéro Facture", "Date", "Client", "Email Client", "Total HT", "Total TVA", "Total TTC", "Montant Payé", "Statut"];
    const rows = filteredInvoices.map(inv => [
      `"${inv.invoice_number}"`,
      new Date(inv.created_at).toLocaleDateString('fr-FR'),
      `"${inv.customer ? `${inv.customer.first_name} ${inv.customer.last_name}` : inv.customer_name}"`,
      `"${inv.customer_email}"`,
      inv.total_ht.toFixed(2),
      inv.total_tva.toFixed(2),
      inv.total_ttc.toFixed(2),
      inv.amount_paid.toFixed(2),
      `"${getStatusInfo(inv.status).text}"`
    ]);

    let csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `export_factures_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Export CSV généré !");
  };

  const handleRecordPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice || !paymentData.amount || !paymentData.payment_date) {
      toast.error("Veuillez remplir tous les champs.");
      return;
    }
    setPaymentLoading(true);
    try {
      const { error } = await supabase.rpc('record_manual_payment', {
        invoice_id: selectedInvoice.id,
        payment_amount: parseFloat(paymentData.amount),
        payment_date: paymentData.payment_date,
        payment_method: paymentData.payment_method,
        payment_reference: paymentData.reference,
      });

      if (error) throw error;

      toast.success("Paiement enregistré avec succès !");
      setShowPaymentModal(false);
      setSelectedInvoice(null);
    } catch (error: any) {
      console.error("Erreur enregistrement paiement:", error);
      toast.error(error.message || "Une erreur est survenue.");
    } finally {
      setPaymentLoading(false);
    }
  };
  
  const handleConvertToInvoice = async (quoteId: string) => {
    if (!window.confirm("Voulez-vous vraiment convertir ce devis en facture ? Cette action est irréversible.")) return;
    try {
        const { error } = await supabase.rpc('convert_quote_to_invoice', { p_quote_id: quoteId });
        if (error) throw error;
        toast.success('Devis converti en facture avec succès!');
    } catch (error: any) {
        console.error("Erreur conversion devis:", error);
        toast.error(error.message || "Erreur lors de la conversion du devis.");
    }
  };

  const handleSettingsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsLoading(true);
    try {
      const { error } = await supabase.from('billing_settings').upsert({ ...settingsForm, id: billingSettings?.id || 1 });
      if (error) throw error;
      toast.success("Paramètres de facturation mis à jour !");
    } catch(error: any) {
      console.error("Erreur mise à jour paramètres:", error);
      toast.error(error.message || "Erreur lors de la mise à jour.");
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleRefund = async (invoice: Invoice) => {
    const maxRefundable = getRefundableAmount(invoice);
    if (maxRefundable <= 0) {
      toast.error('Cette facture a déjà été entièrement remboursée');
      return;
    }

    const primaryPayment = (invoice.payment_records || []).find(
      record => (record.stripe_charge_id && record.stripe_charge_id.startsWith('ch_')) || (record.reference && record.reference.startsWith('pi_'))
    );

    if (primaryPayment) {
      setSelectedInvoice(invoice);
      setRefundData({
        amount: maxRefundable.toFixed(2),
        reason: '',
        adminNotes: '',
        stripeChargeId: primaryPayment.stripe_charge_id || primaryPayment.reference!,
      });
      setShowRefundModal(true);
      return;
    }
    
    toast.error('Impossible de traiter le remboursement : aucun identifiant de paiement Stripe trouvé.');
  };

  const processRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;

    setRefundLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session expirée');

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-refund`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          invoiceId: selectedInvoice.id,
          chargeId: refundData.stripeChargeId,
          amount: parseFloat(refundData.amount),
          reason: refundData.reason,
          adminNotes: refundData.adminNotes,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erreur lors du remboursement');

      toast.success(result.message || 'Remboursement traité avec succès');
      setShowRefundModal(false);
      setSelectedInvoice(null);
    } catch (error: any) {
      console.error('Erreur remboursement:', error);
      toast.error(error.message || 'Erreur lors du remboursement');
    } finally {
      setRefundLoading(false);
    }
  };

  const goToOrder = (orderId: string) => {
    sessionStorage.setItem('openOrderId', orderId);
    window.dispatchEvent(new CustomEvent('switchToOrders'));
  };

  // --- RENDER ---
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="text-white text-xl animate-pulse">Chargement du Centre Financier...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-8 bg-gray-900 text-white min-h-screen font-sans">
      {/* --- HEADER --- */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
            <DollarSign className="text-green-400" size={32} />
            Centre Financier
          </h1>
          <p className="text-gray-400">Gérez vos factures, devis, paiements et paramètres comptables.</p>
        </div>
      </div>

      {/* --- TABS --- */}
      <div className="flex flex-wrap gap-4 border-b border-white/20">
        {[
          { id: 'invoices', label: 'Factures', icon: FileText },
          { id: 'quotes', label: 'Devis', icon: FileText },
          { id: 'settings', label: 'Paramètres', icon: Building },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-6 py-3 font-semibold transition-colors ${activeTab === tab.id ? 'text-green-400 border-b-2 border-green-400' : 'text-gray-400 hover:text-white'}`}>
            <tab.icon size={20} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* --- FILTERS & ACTIONS --- */}
      {(activeTab === 'invoices' || activeTab === 'quotes') && (
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-4 md:p-6 border border-white/10">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <div className="lg:col-span-2">
              <label className="text-sm font-medium text-gray-400 mb-2 block">Rechercher</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <input type="text" placeholder={`Rechercher par N° ou client...`} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-white/10 border border-white/20 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-gray-400 focus:border-green-400 focus:outline-none" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-400 mb-2 block">Statut</label>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2.5 text-white focus:border-green-400 focus:outline-none">
                <option value="all">Tous les statuts</option>
                {activeTab === 'invoices' && <>
                  <option value="draft">Brouillons</option>
                  <option value="sent">Envoyées</option>
                  <option value="paid">Payées</option>
                  <option value="overdue">En retard</option>
                  <option value="cancelled">Annulées</option>
                </>}
                {activeTab === 'quotes' && <>
                  <option value="draft">Brouillons</option>
                  <option value="sent">Envoyés</option>
                  <option value="accepted">Acceptés</option>
                  <option value="rejected">Refusés</option>
                  <option value="expired">Expirés</option>
                  <option value="converted">Convertis</option>
                </>}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleExportCSV} className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white px-4 py-2.5 rounded-lg font-semibold hover:shadow-lg hover:shadow-green-500/25 transition-all duration-300 flex items-center justify-center gap-2">
                <Download size={16} />
                Exporter CSV
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- INVOICES TAB --- */}
      {activeTab === 'invoices' && (
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/5">
                <tr>
                  <th className="text-left p-4 font-semibold text-gray-300">Facture</th>
                  <th className="text-left p-4 font-semibold text-gray-300">Client</th>
                  <th className="text-left p-4 font-semibold text-gray-300">Statut</th>
                  <th className="text-left p-4 font-semibold text-gray-300">Total</th>
                  <th className="text-left p-4 font-semibold text-gray-300">Date</th>
                  <th className="text-center p-4 font-semibold text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map(invoice => (
                  <tr key={invoice.id} className="border-t border-white/10 hover:bg-white/5 transition-colors">
                    <td className="p-4">{invoice.invoice_number}</td>
                    <td className="p-4">{invoice.customer ? `${invoice.customer.first_name} ${invoice.customer.last_name}` : invoice.customer_name}</td>
                    <td className="p-4"><span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusInfo(invoice.status).color}`}>{getStatusInfo(invoice.status).text}</span></td>
                    <td className="p-4">{invoice.total_ttc.toFixed(2)}€</td>
                    <td className="p-4">{new Date(invoice.created_at).toLocaleDateString('fr-FR')}</td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => { setSelectedInvoice(invoice); setShowInvoiceModal(true); }} className="p-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30" title="Voir"><Eye size={16} /></button>
                        <button onClick={() => { setSelectedInvoice(invoice); setShowPaymentModal(true); setPaymentData(prev => ({...prev, amount: (invoice.total_ttc - invoice.amount_paid).toFixed(2)}))}} className="p-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30" title="Enregistrer un paiement"><CreditCard size={16} /></button>
                        {isRefundable(invoice) && <button onClick={() => handleRefund(invoice)} className="p-2 bg-orange-500/20 text-orange-400 rounded-lg hover:bg-orange-500/30" title="Rembourser"><RotateCcw size={16} /></button>}
                        {invoice.order_id && <button onClick={() => goToOrder(invoice.order_id!)} className="p-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30" title="Aller à la commande"><ExternalLink size={16} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      {/* --- QUOTES TAB --- */}
      {activeTab === 'quotes' && (
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/5">
                <tr>
                  <th className="text-left p-4 font-semibold text-gray-300">Devis</th>
                  <th className="text-left p-4 font-semibold text-gray-300">Client</th>
                  <th className="text-left p-4 font-semibold text-gray-300">Statut</th>
                  <th className="text-left p-4 font-semibold text-gray-300">Total</th>
                  <th className="text-left p-4 font-semibold text-gray-300">Date</th>
                  <th className="text-center p-4 font-semibold text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredQuotes.map(quote => (
                  <tr key={quote.id} className="border-t border-white/10 hover:bg-white/5 transition-colors">
                    <td className="p-4">{quote.quote_number}</td>
                    <td className="p-4">{quote.customer ? `${quote.customer.first_name} ${quote.customer.last_name}` : quote.customer_name}</td>
                    <td className="p-4"><span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusInfo(quote.status).color}`}>{getStatusInfo(quote.status).text}</span></td>
                    <td className="p-4">{quote.total_ttc.toFixed(2)}€</td>
                    <td className="p-4">{new Date(quote.created_at).toLocaleDateString('fr-FR')}</td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-2">
                        <button className="p-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30" title="Voir"><Eye size={16} /></button>
                        {quote.status === 'accepted' && (
                            <button onClick={() => handleConvertToInvoice(quote.id)} className="p-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30" title="Convertir en facture"><FileUp size={16} /></button>
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

      {/* --- SETTINGS TAB --- */}
      {activeTab === 'settings' && (
        <div className="max-w-4xl mx-auto">
            <form onSubmit={handleSettingsSubmit} className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-8 border border-white/10 space-y-6">
                <h2 className="text-2xl font-bold text-white">Paramètres de Facturation</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="text-sm font-medium text-gray-300 mb-2 block">Nom de l'entreprise</label>
                        <input type="text" value={settingsForm.company_name || ''} onChange={e => setSettingsForm({...settingsForm, company_name: e.target.value})} className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2.5 text-white focus:border-green-400 focus:outline-none" />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-gray-300 mb-2 block">Adresse</label>
                        <input type="text" value={settingsForm.company_address || ''} onChange={e => setSettingsForm({...settingsForm, company_address: e.target.value})} className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2.5 text-white focus:border-green-400 focus:outline-none" />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-gray-300 mb-2 block">N° SIRET</label>
                        <input type="text" value={settingsForm.company_siret || ''} onChange={e => setSettingsForm({...settingsForm, company_siret: e.target.value})} className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2.5 text-white focus:border-green-400 focus:outline-none" />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-gray-300 mb-2 block">N° TVA</label>
                        <input type="text" value={settingsForm.company_vat_number || ''} onChange={e => setSettingsForm({...settingsForm, company_vat_number: e.target.value})} className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2.5 text-white focus:border-green-400 focus:outline-none" />
                    </div>
                </div>
                <div className="pt-4">
                    <button type="submit" disabled={settingsLoading} className="bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-green-500/25 transition-all duration-300 flex items-center gap-2 disabled:opacity-50">
                        {settingsLoading ? 'Enregistrement...' : <><Save size={16} /> Enregistrer les modifications</>}
                    </button>
                </div>
            </form>
        </div>
      )}

      {/* --- MODALS --- */}

      {/* MANUAL PAYMENT MODAL */}
      {showPaymentModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 border border-white/10 max-w-lg w-full">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-white">Enregistrer un Paiement</h3>
              <button onClick={() => setShowPaymentModal(false)} className="text-gray-400 hover:text-white text-2xl">×</button>
            </div>
            <form onSubmit={handleRecordPaymentSubmit} className="space-y-4">
                <div>
                    <label className="text-sm font-medium text-gray-300 mb-2 block">Montant (€)</label>
                    <input type="number" step="0.01" required value={paymentData.amount} onChange={e => setPaymentData({...paymentData, amount: e.target.value})} className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white focus:border-green-400 focus:outline-none" />
                </div>
                <div>
                    <label className="text-sm font-medium text-gray-300 mb-2 block">Date de paiement</label>
                    <input type="date" required value={paymentData.payment_date} onChange={e => setPaymentData({...paymentData, payment_date: e.target.value})} className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white focus:border-green-400 focus:outline-none" />
                </div>
                <div>
                    <label className="text-sm font-medium text-gray-300 mb-2 block">Méthode de paiement</label>
                    <select value={paymentData.payment_method} onChange={e => setPaymentData({...paymentData, payment_method: e.target.value})} className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white focus:border-green-400 focus:outline-none">
                        <option value="virement">Virement bancaire</option>
                        <option value="cheque">Chèque</option>
                        <option value="especes">Espèces</option>
                        <option value="autre">Autre</option>
                    </select>
                </div>
                <div>
                    <label className="text-sm font-medium text-gray-300 mb-2 block">Référence (optionnel)</label>
                    <input type="text" value={paymentData.reference} onChange={e => setPaymentData({...paymentData, reference: e.target.value})} className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white focus:border-green-400 focus:outline-none" placeholder="Ex: N° de chèque, référence virement..."/>
                </div>
                <div className="pt-4 flex gap-4">
                    <button type="button" onClick={() => setShowPaymentModal(false)} className="px-6 border-2 border-white/30 text-white rounded-lg font-semibold hover:bg-white/10 w-1/2 py-3">Annuler</button>
                    <button type="submit" disabled={paymentLoading} className="bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg font-semibold hover:shadow-lg w-1/2 py-3 disabled:opacity-50">{paymentLoading ? 'Enregistrement...' : 'Enregistrer'}</button>
                </div>
            </form>
          </div>
        </div>
      )}
      
      {/* REFUND MODAL */}
      {showRefundModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 border border-white/10 max-w-2xl w-full">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-white flex items-center gap-3"><RotateCcw className="text-orange-400" /> Remboursement</h3>
              <button onClick={() => setShowRefundModal(false)} className="text-gray-400 hover:text-white text-2xl">×</button>
            </div>
            <form onSubmit={processRefund} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Montant à rembourser (€)</label>
                <input type="number" step="0.01" max={getRefundableAmount(selectedInvoice)} required value={refundData.amount} onChange={e => setRefundData({ ...refundData, amount: e.target.value })} className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white focus:border-orange-400 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Raison du remboursement</label>
                <select required value={refundData.reason} onChange={e => setRefundData({ ...refundData, reason: e.target.value })} className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white focus:border-orange-400 focus:outline-none">
                  <option value="">Sélectionner une raison</option>
                  <option value="defaut_produit">Défaut produit</option>
                  <option value="annulation_client">Annulation client</option>
                  <option value="autre">Autre</option>
                </select>
              </div>
              <div className="pt-4 flex gap-4">
                <button type="button" onClick={() => setShowRefundModal(false)} className="px-6 border-2 border-white/30 text-white rounded-lg font-semibold hover:bg-white/10 w-1/2 py-3">Annuler</button>
                <button type="submit" disabled={refundLoading} className="bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-lg font-semibold hover:shadow-lg w-1/2 py-3 disabled:opacity-50">{refundLoading ? 'Traitement...' : 'Traiter le Remboursement'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* INVOICE PREVIEW MODAL */}
      {showInvoiceModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b flex items-center justify-between bg-gray-50 sticky top-0 z-10">
              <h3 className="text-xl font-bold text-gray-800">Aperçu Facture: {selectedInvoice.invoice_number}</h3>
              <button onClick={() => { setShowInvoiceModal(false); setSelectedInvoice(null); }} className="text-gray-600 hover:text-gray-800 text-2xl">×</button>
            </div>
            <InvoicePDF invoice={selectedInvoice} billingSettings={billingSettings} />
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminBilling;
