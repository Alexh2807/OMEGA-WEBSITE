import React, { useState, useEffect } from 'react';
import {
  FileText,
  Search,
  Filter,
  Eye,
  Download,
  Send,
  Calendar,
  User,
  Building,
  CheckCircle,
  Clock,
  AlertCircle,
  ExternalLink,
  Package,
  RotateCcw,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Invoice, Quote, BillingSettings } from '../../types/billing';
import InvoicePDF from '../../components/InvoicePDF';
import { generateInvoicePDF } from '../../utils/pdfGenerator';
import toast from 'react-hot-toast';
import Papa from 'papaparse';
import { format } from 'date-fns';

const AdminBilling = () => {
  const [activeTab, setActiveTab] = useState('invoices');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [billingSettings, setBillingSettings] = useState<BillingSettings | null>(null);
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
  });
  const [refundLoading, setRefundLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
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
        .select(`
          *,
          invoice_items(*, product:products(name, sku)),
          payment_records(*),
          refunds(*),
          customer:profiles!invoices_customer_id_fkey(first_name, last_name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setInvoices(data || []);
    } catch (err: any) {
      console.error('Erreur chargement factures:', err);
      toast.error(`Erreur chargement factures: ${err.message}`);
    }
  };

  const loadQuotes = async () => {
    try {
      const { data, error } = await supabase
        .from('quotes')
        .select(`
          *,
          quote_items(*, product:products(name, sku)),
          customer:profiles!quotes_customer_id_fkey(first_name, last_name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setQuotes(data || []);
    } catch (err: any) {
      console.error('Erreur chargement devis:', err);
      toast.error(`Erreur chargement devis: ${err.message}`);
    }
  };

  const loadBillingSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('billing_settings')
        .select('*')
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      setBillingSettings(data);
    } catch (err: any) {
      console.error('Erreur chargement paramètres:', err);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid': return <CheckCircle className="text-green-400" size={16} />;
      case 'sent': return <Send className="text-blue-400" size={16} />;
      case 'overdue': return <AlertCircle className="text-red-400" size={16} />;
      case 'cancelled': return <X className="text-gray-400" size={16} />;
      case 'refunded': return <RotateCcw className="text-orange-400" size={16} />;
      default: return <Clock className="text-yellow-400" size={16} />;
    }
  };

  const getStatusText = (status: string) => {
    const statusMap: { [key: string]: string } = {
      paid: 'Payée', sent: 'Envoyée', overdue: 'En retard',
      cancelled: 'Annulée', draft: 'Brouillon', refunded: 'Remboursée'
    };
    return statusMap[status] || 'Inconnu';
  };

  const getStatusColor = (status: string) => {
    const colorMap: { [key: string]: string } = {
      paid: 'text-green-400 bg-green-500/20', sent: 'text-blue-400 bg-blue-500/20',
      overdue: 'text-red-400 bg-red-500/20', cancelled: 'text-gray-400 bg-gray-500/20',
      draft: 'text-yellow-400 bg-yellow-500/20', refunded: 'text-orange-400 bg-orange-500/20'
    };
    return colorMap[status] || 'text-gray-400 bg-gray-500/20';
  };

  const handleDownloadPDF = async (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setShowInvoiceModal(true);
    const toastId = toast.loading('Génération du PDF...');
    setTimeout(async () => {
      try {
        await generateInvoicePDF(`facture-${invoice.invoice_number}`);
        toast.success('PDF téléchargé !', { id: toastId });
      } catch (error) {
        toast.error('Erreur de génération du PDF.', { id: toastId });
      } finally {
        setShowInvoiceModal(false);
        setSelectedInvoice(null);
      }
    }, 500);
  };

  const getRefundableAmount = (invoice: Invoice) => {
    const totalRefunded = (invoice.refunds || [])
      .filter(r => r.status === 'succeeded')
      .reduce((sum, r) => sum + r.amount, 0);
    return Math.max(0, invoice.amount_paid - totalRefunded);
  };

  const isRefundable = (invoice: Invoice) => {
    return (invoice.status === 'paid' || invoice.status === 'refunded') && getRefundableAmount(invoice) > 0.01;
  };

  const handleRefund = (invoice: Invoice) => {
    const maxRefundable = getRefundableAmount(invoice);
    setSelectedInvoice(invoice);
    setRefundData({ amount: maxRefundable.toFixed(2), reason: '', adminNotes: '' });
    setShowRefundModal(true);
  };

  const processRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;
    setRefundLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session expirée');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-refund`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            invoiceId: selectedInvoice.id,
            amount: parseFloat(refundData.amount),
            reason: refundData.reason,
            adminNotes: refundData.adminNotes,
          }),
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erreur lors du remboursement');
      toast.success(result.message || 'Remboursement traité avec succès');
      setShowRefundModal(false);
      setSelectedInvoice(null);
      loadInvoices();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setRefundLoading(false);
    }
  };

  const goToOrder = (orderId: string) => {
    sessionStorage.setItem('openOrderId', orderId);
    window.dispatchEvent(new CustomEvent('switchToOrders'));
  };

  const filteredInvoices = invoices.filter(invoice => {
    const customerName = invoice.customer_name || '';
    const invoiceNumber = invoice.invoice_number || '';
    const matchesSearch = invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customerName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || invoice.status === statusFilter;
    const invoiceDate = new Date(invoice.created_at);
    const startDate = dateRange.start ? new Date(dateRange.start) : null;
    const endDate = dateRange.end ? new Date(dateRange.end) : null;
    if (startDate) startDate.setHours(0, 0, 0, 0);
    if (endDate) endDate.setHours(23, 59, 59, 999);
    const matchesDate = (!startDate || invoiceDate >= startDate) && (!endDate || invoiceDate <= endDate);
    return matchesSearch && matchesStatus && matchesDate;
  });

  const handleExportCSV = () => {
    if (filteredInvoices.length === 0) {
      toast.error('Aucune facture à exporter.');
      return;
    }
    const dataToExport = filteredInvoices.map(invoice => ({
      'Numéro Facture': invoice.invoice_number,
      'Date Création': format(new Date(invoice.created_at), 'yyyy-MM-dd'),
      'Client': invoice.customer_name,
      'Statut': getStatusText(invoice.status),
      'Total TTC': invoice.total_ttc.toFixed(2),
      'Montant Payé': invoice.amount_paid.toFixed(2),
      'ID Commande': invoice.order_id || '',
    }));
    const csv = Papa.unparse(dataToExport);
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `export-factures-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success('Export CSV généré !');
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
        <FileText className="text-green-400" size={32} />
        Gestion de la Facturation
      </h1>
      <p className="text-gray-400">Gérez vos factures, devis et paramètres de facturation.</p>

      <div className="flex flex-wrap gap-4 border-b border-white/20">
        {[
          { id: 'invoices', label: 'Factures', icon: FileText },
          { id: 'quotes', label: 'Devis', icon: FileText },
          { id: 'settings', label: 'Paramètres', icon: Building },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-6 py-3 font-semibold transition-colors ${activeTab === tab.id
              ? 'text-green-400 border-b-2 border-green-400'
              : 'text-gray-400 hover:text-white'
              }`}
          >
            <tab.icon size={20} />
            {tab.label}
          </button>
        ))}
      </div>

      {(activeTab === 'invoices' || activeTab === 'quotes') && (
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-6 border border-white/10">
          <div className="flex flex-col md:flex-row flex-wrap gap-4 items-center">
            <div className="flex-1 relative min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input type="text" placeholder="Rechercher..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-white/10 border border-white/20 rounded-lg pl-10 pr-4 py-3 text-white focus:outline-none" />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="text-gray-400" size={20} />
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="dark-select rounded-lg px-4 py-3">
                <option value="all">Tous les statuts</option>
                <option value="draft">Brouillon</option>
                <option value="sent">Envoyée</option>
                <option value="paid">Payée</option>
                <option value="overdue">En retard</option>
                <option value="cancelled">Annulée</option>
                <option value="refunded">Remboursée</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="text-gray-400" size={20} />
              <input type="date" value={dateRange.start} onChange={e => setDateRange({ ...dateRange, start: e.target.value })} className="dark-select rounded-lg px-4 py-3" />
              <span className="text-gray-400">-</span>
              <input type="date" value={dateRange.end} onChange={e => setDateRange({ ...dateRange, end: e.target.value })} className="dark-select rounded-lg px-4 py-3" />
            </div>
            <button onClick={handleExportCSV} className="flex items-center gap-2 bg-green-500/20 text-green-400 rounded-lg px-4 py-3 font-semibold hover:bg-green-500/30">
              <Download size={18} /> Exporter CSV
            </button>
          </div>
        </div>
      )}

      {activeTab === 'invoices' && (
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/5">
                <tr>
                  <th className="p-4 text-left text-gray-300 font-semibold">Facture</th>
                  <th className="p-4 text-left text-gray-300 font-semibold">Client</th>
                  <th className="p-4 text-left text-gray-300 font-semibold">Statut</th>
                  <th className="p-4 text-left text-gray-300 font-semibold">Total</th>
                  <th className="p-4 text-left text-gray-300 font-semibold">Date</th>
                  <th className="p-4 text-left text-gray-300 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map(invoice => (
                  <tr key={invoice.id} className="border-t border-white/10 hover:bg-white/5">
                    <td className="p-4">
                      <div className="font-semibold text-white">{invoice.invoice_number}</div>
                      {invoice.order_id && <div className="text-sm text-gray-400 flex items-center gap-1"><Package size={12} />#{invoice.order_id.slice(0, 8)}</div>}
                    </td>
                    <td className="p-4">
                      <div className="text-white">{invoice.customer_name || 'N/A'}</div>
                      <div className="text-sm text-gray-400">{invoice.customer_email}</div>
                    </td>
                    <td className="p-4"><span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(invoice.status)}`}>{getStatusText(invoice.status)}</span></td>
                    <td className="p-4">
                      <div className="font-semibold text-white">{invoice.total_ttc.toFixed(2)}€</div>
                      <div className="text-sm text-gray-400">Payé: {invoice.amount_paid.toFixed(2)}€</div>
                    </td>
                    <td className="p-4 text-gray-300">{new Date(invoice.created_at).toLocaleDateString('fr-FR')}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <button onClick={() => { setSelectedInvoice(invoice); setShowInvoiceModal(true); }} className="p-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30" title="Voir"><Eye size={16} /></button>
                        <button onClick={() => handleDownloadPDF(invoice)} className="p-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30" title="PDF"><Download size={16} /></button>
                        {isRefundable(invoice) && <button onClick={() => handleRefund(invoice)} className="p-2 bg-orange-500/20 text-orange-400 rounded-lg hover:bg-orange-500/30" title="Rembourser"><RotateCcw size={16} /></button>}
                        {invoice.order_id && <button onClick={() => goToOrder(invoice.order_id!)} className="p-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30" title="Voir la commande"><ExternalLink size={16} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      {/* ... autres onglets et modals ... */}
      
      {showRefundModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 border border-white/10 max-w-2xl w-full">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-white flex items-center gap-3"><RotateCcw className="text-orange-400" /> Remboursement</h3>
              <button onClick={() => setShowRefundModal(false)} className="text-gray-400 hover:text-white text-2xl">×</button>
            </div>
            <div className="bg-white/5 p-4 rounded-lg mb-6">
              <h4 className="text-white font-semibold mb-3">Facture à rembourser</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-gray-400">Numéro:</span><span className="text-white ml-2">{selectedInvoice.invoice_number}</span></div>
                <div><span className="text-gray-400">Client:</span><span className="text-white ml-2">{selectedInvoice.customer_name}</span></div>
                <div><span className="text-gray-400">Total Payé:</span><span className="text-white ml-2">{selectedInvoice.amount_paid.toFixed(2)}€</span></div>
                <div><span className="text-gray-400">Remboursable:</span><span className="text-green-400 ml-2 font-semibold">{getRefundableAmount(selectedInvoice).toFixed(2)}€</span></div>
              </div>
            </div>
            <form onSubmit={processRefund} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Montant à rembourser (€) *</label>
                <input type="number" step="0.01" min="0.01" max={getRefundableAmount(selectedInvoice)} required value={refundData.amount} onChange={e => setRefundData({ ...refundData, amount: e.target.value })} className="w-full bg-white/5 border border-white/20 rounded-lg p-3 text-white focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Raison *</label>
                <select required value={refundData.reason} onChange={e => setRefundData({ ...refundData, reason: e.target.value })} className="w-full dark-select rounded-lg p-3">
                  <option value="">Sélectionner</option>
                  <option value="defaut_produit">Défaut produit</option>
                  <option value="annulation_client">Annulation client</option>
                  <option value="retour_produit">Retour produit</option>
                  <option value="geste_commercial">Geste commercial</option>
                  <option value="autre">Autre</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Notes (optionnel)</label>
                <textarea rows={3} value={refundData.adminNotes} onChange={e => setRefundData({ ...refundData, adminNotes: e.target.value })} className="w-full bg-white/5 border border-white/20 rounded-lg p-3 text-white resize-none focus:outline-none"></textarea>
              </div>
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4">
                <h4 className="text-orange-400 font-semibold mb-2">⚠️ Attention</h4>
                <p className="text-gray-300 text-sm">Cette action est irréversible et traitera un remboursement via Stripe.</p>
              </div>
              <div className="flex gap-4">
                <button type="submit" disabled={refundLoading} className="flex-1 bg-gradient-to-r from-orange-500 to-red-600 text-white py-3 rounded-lg font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
                  {refundLoading ? 'Traitement...' : 'Traiter le Remboursement'}
                </button>
                <button type="button" onClick={() => setShowRefundModal(false)} className="px-6 border-2 border-white/30 text-white rounded-lg font-semibold hover:bg-white/10">Annuler</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showInvoiceModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b flex items-center justify-between bg-gray-100 sticky top-0">
              <h3 className="text-xl font-bold text-gray-800">Aperçu Facture</h3>
              <button onClick={() => setShowInvoiceModal(false)} className="text-gray-600 hover:text-gray-800 text-2xl">×</button>
            </div>
            <InvoicePDF invoice={selectedInvoice} billingSettings={billingSettings} />
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminBilling;