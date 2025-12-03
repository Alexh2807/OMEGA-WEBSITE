import React, { useState, useEffect } from 'react';
import {
  Download,
  FileText,
  Calendar,
  TrendingUp,
  Users,
  DollarSign,
  FileSpreadsheet,
  Receipt,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import {
  exportInvoicesToCSV,
  exportSalesJournalFEC,
  exportVATReport,
  exportCustomerLedger,
  exportPaymentRecords,
} from '../../utils/exportUtils';
import { Invoice } from '../../types/billing';

const AdminAccounting = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [stats, setStats] = useState({
    totalInvoices: 0,
    totalRevenue: 0,
    totalVAT: 0,
    paidInvoices: 0,
    unpaidAmount: 0,
  });

  useEffect(() => {
    loadInvoices();
    // Définir les dates par défaut : début et fin du mois en cours
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setStartDate(firstDay.toISOString().split('T')[0]);
    setEndDate(lastDay.toISOString().split('T')[0]);
  }, []);

  useEffect(() => {
    calculateStats();
  }, [invoices, startDate, endDate]);

  const loadInvoices = async () => {
    try {
      // Charger d'abord les factures avec leurs relations simples
      const { data, error } = await supabase
        .from('invoices')
        .select(
          `
          *,
          invoice_items (*),
          payment_records (*),
          refunds (*)
        `
        )
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading invoices:', error);
        toast.error('Erreur lors du chargement des factures');
      } else {
        setInvoices(data || []);
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      toast.error('Erreur inattendue');
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = () => {
    const start = startDate ? new Date(startDate) : new Date(0);
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    const filteredInvoices = invoices.filter(inv => {
      const invDate = new Date(inv.created_at);
      return (
        invDate >= start &&
        invDate <= end &&
        inv.status !== 'cancelled' &&
        inv.status !== 'refunded'
      );
    });

    const totalRevenue = filteredInvoices.reduce(
      (sum, inv) => sum + inv.total_ttc,
      0
    );
    const totalVAT = filteredInvoices.reduce(
      (sum, inv) => sum + inv.tax_amount,
      0
    );
    const paidInvoices = filteredInvoices.filter(
      inv => inv.status === 'paid'
    ).length;
    const unpaidAmount = filteredInvoices
      .filter(inv => inv.status !== 'paid')
      .reduce((sum, inv) => sum + (inv.total_ttc - inv.amount_paid), 0);

    setStats({
      totalInvoices: filteredInvoices.length,
      totalRevenue,
      totalVAT,
      paidInvoices,
      unpaidAmount,
    });
  };

  const handleExportAllInvoices = () => {
    if (invoices.length === 0) {
      toast.error('Aucune facture à exporter');
      return;
    }
    exportInvoicesToCSV(invoices);
    toast.success('Export des factures réalisé avec succès');
  };

  const handleExportSalesJournal = () => {
    if (!startDate || !endDate) {
      toast.error('Veuillez sélectionner une période');
      return;
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    exportSalesJournalFEC(invoices, start, end);
    toast.success('Export du journal des ventes (FEC) réalisé avec succès');
  };

  const handleExportVATReport = () => {
    if (!startDate || !endDate) {
      toast.error('Veuillez sélectionner une période');
      return;
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    exportVATReport(invoices, start, end);
    toast.success('Export du rapport de TVA réalisé avec succès');
  };

  const handleExportCustomerLedger = () => {
    if (invoices.length === 0) {
      toast.error('Aucune facture à exporter');
      return;
    }
    exportCustomerLedger(invoices);
    toast.success('Export du grand livre clients réalisé avec succès');
  };

  const handleExportPayments = () => {
    if (!startDate || !endDate) {
      toast.error('Veuillez sélectionner une période');
      return;
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    exportPaymentRecords(invoices, start, end);
    toast.success('Export des paiements réalisé avec succès');
  };

  const setPeriod = (type: string) => {
    const now = new Date();
    let start: Date, end: Date;

    switch (type) {
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'quarter':
        const quarter = Math.floor(now.getMonth() / 3);
        start = new Date(now.getFullYear(), quarter * 3, 1);
        end = new Date(now.getFullYear(), quarter * 3 + 3, 0);
        break;
      case 'year':
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31);
        break;
      case 'last-year':
        start = new Date(now.getFullYear() - 1, 0, 1);
        end = new Date(now.getFullYear() - 1, 11, 31);
        break;
      default:
        return;
    }

    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-white text-xl">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
          <FileSpreadsheet className="text-green-400" size={32} />
          Comptabilité & Exports
        </h1>
        <p className="text-gray-400">
          Exportez vos données comptables pour votre expert-comptable et vos
          déclarations fiscales
        </p>
      </div>

      {/* Sélection de période */}
      <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-6 border border-white/10">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Calendar className="text-blue-400" size={24} />
          Période d'analyse
        </h2>
        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Date de début
            </label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white focus:border-blue-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Date de fin
            </label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white focus:border-blue-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Raccourcis de période */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setPeriod('month')}
            className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors text-sm"
          >
            Mois en cours
          </button>
          <button
            onClick={() => setPeriod('quarter')}
            className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors text-sm"
          >
            Trimestre en cours
          </button>
          <button
            onClick={() => setPeriod('year')}
            className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors text-sm"
          >
            Année en cours
          </button>
          <button
            onClick={() => setPeriod('last-year')}
            className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors text-sm"
          >
            Année précédente
          </button>
        </div>
      </div>

      {/* Statistiques */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/20 backdrop-blur-md rounded-xl p-6 border border-blue-500/30">
          <div className="flex items-center justify-between mb-2">
            <FileText className="text-blue-400" size={28} />
            <span className="text-2xl font-bold text-white">
              {stats.totalInvoices}
            </span>
          </div>
          <div className="text-gray-300 text-sm">Factures sur la période</div>
        </div>

        <div className="bg-gradient-to-br from-green-500/20 to-green-600/20 backdrop-blur-md rounded-xl p-6 border border-green-500/30">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="text-green-400" size={28} />
            <span className="text-2xl font-bold text-white">
              {stats.totalRevenue.toFixed(0)}€
            </span>
          </div>
          <div className="text-gray-300 text-sm">Chiffre d'affaires TTC</div>
        </div>

        <div className="bg-gradient-to-br from-blue-500/20 to-purple-600/20 backdrop-blur-md rounded-xl p-6 border border-blue-500/30">
          <div className="flex items-center justify-between mb-2">
            <Receipt className="text-blue-400" size={28} />
            <span className="text-2xl font-bold text-white">
              {stats.totalVAT.toFixed(0)}€
            </span>
          </div>
          <div className="text-gray-300 text-sm">TVA collectée (20%)</div>
        </div>

        <div className="bg-gradient-to-br from-red-500/20 to-red-600/20 backdrop-blur-md rounded-xl p-6 border border-red-500/30">
          <div className="flex items-center justify-between mb-2">
            <DollarSign className="text-red-400" size={28} />
            <span className="text-2xl font-bold text-white">
              {stats.unpaidAmount.toFixed(0)}€
            </span>
          </div>
          <div className="text-gray-300 text-sm">Impayés / En attente</div>
        </div>
      </div>

      {/* Exports rapides */}
      <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-6 border border-white/10">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Download className="text-green-400" size={24} />
          Exports comptables
        </h2>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Export toutes factures */}
          <div className="bg-white/5 rounded-lg p-6 border border-white/10 hover:border-green-400/50 transition-all">
            <div className="flex items-start gap-4">
              <div className="bg-green-500/20 p-3 rounded-lg">
                <FileText className="text-green-400" size={24} />
              </div>
              <div className="flex-1">
                <h3 className="text-white font-semibold mb-2">
                  Toutes les factures
                </h3>
                <p className="text-gray-400 text-sm mb-4">
                  Export complet de toutes les factures avec détails (client,
                  montants, statuts)
                </p>
                <button
                  onClick={handleExportAllInvoices}
                  className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-green-500/25 transition-all duration-300 flex items-center justify-center gap-2"
                >
                  <Download size={18} />
                  Exporter (CSV)
                </button>
              </div>
            </div>
          </div>

          {/* Export FEC */}
          <div className="bg-white/5 rounded-lg p-6 border border-white/10 hover:border-blue-400/50 transition-all">
            <div className="flex items-start gap-4">
              <div className="bg-blue-500/20 p-3 rounded-lg">
                <FileSpreadsheet className="text-blue-400" size={24} />
              </div>
              <div className="flex-1">
                <h3 className="text-white font-semibold mb-2">
                  Journal des ventes (FEC)
                </h3>
                <p className="text-gray-400 text-sm mb-4">
                  Format FEC normalisé pour l'administration fiscale et votre
                  comptable
                </p>
                <button
                  onClick={handleExportSalesJournal}
                  className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 flex items-center justify-center gap-2"
                >
                  <Download size={18} />
                  Exporter (FEC)
                </button>
              </div>
            </div>
          </div>

          {/* Export TVA */}
          <div className="bg-white/5 rounded-lg p-6 border border-white/10 hover:border-blue-400/50 transition-all">
            <div className="flex items-start gap-4">
              <div className="bg-blue-500/20 p-3 rounded-lg">
                <Receipt className="text-blue-400" size={24} />
              </div>
              <div className="flex-1">
                <h3 className="text-white font-semibold mb-2">
                  Rapport de TVA
                </h3>
                <p className="text-gray-400 text-sm mb-4">
                  Synthèse et détail de la TVA collectée pour vos déclarations
                  fiscales
                </p>
                <button
                  onClick={handleExportVATReport}
                  className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 flex items-center justify-center gap-2"
                >
                  <Download size={18} />
                  Exporter (CSV)
                </button>
              </div>
            </div>
          </div>

          {/* Export grand livre clients */}
          <div className="bg-white/5 rounded-lg p-6 border border-white/10 hover:border-purple-400/50 transition-all">
            <div className="flex items-start gap-4">
              <div className="bg-purple-500/20 p-3 rounded-lg">
                <Users className="text-purple-400" size={24} />
              </div>
              <div className="flex-1">
                <h3 className="text-white font-semibold mb-2">
                  Grand livre clients
                </h3>
                <p className="text-gray-400 text-sm mb-4">
                  Synthèse par client : factures, paiements et soldes dus
                </p>
                <button
                  onClick={handleExportCustomerLedger}
                  className="w-full bg-gradient-to-r from-purple-500 to-purple-600 text-white py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-purple-500/25 transition-all duration-300 flex items-center justify-center gap-2"
                >
                  <Download size={18} />
                  Exporter (CSV)
                </button>
              </div>
            </div>
          </div>

          {/* Export paiements */}
          <div className="bg-white/5 rounded-lg p-6 border border-white/10 hover:border-teal-400/50 transition-all md:col-span-2">
            <div className="flex items-start gap-4">
              <div className="bg-teal-500/20 p-3 rounded-lg">
                <DollarSign className="text-teal-400" size={24} />
              </div>
              <div className="flex-1">
                <h3 className="text-white font-semibold mb-2">
                  Paiements reçus
                </h3>
                <p className="text-gray-400 text-sm mb-4">
                  Détail de tous les paiements reçus avec moyens de paiement et
                  références
                </p>
                <button
                  onClick={handleExportPayments}
                  className="bg-gradient-to-r from-teal-500 to-teal-600 text-white py-2 px-6 rounded-lg font-semibold hover:shadow-lg hover:shadow-teal-500/25 transition-all duration-300 flex items-center justify-center gap-2"
                >
                  <Download size={18} />
                  Exporter (CSV)
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Informations */}
      <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-lg p-6 border border-blue-500/20">
        <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
          <FileText className="text-blue-400" size={20} />
          À propos des exports
        </h3>
        <ul className="text-gray-300 text-sm space-y-2">
          <li>
            • <strong>Format CSV :</strong> Compatible avec Excel, LibreOffice
            et tous les logiciels comptables
          </li>
          <li>
            • <strong>Format FEC :</strong> Normalisé pour l'administration
            fiscale (article A47 A-1 du LPF)
          </li>
          <li>
            • <strong>Encodage UTF-8 :</strong> Garantit l'affichage correct
            des caractères accentués
          </li>
          <li>
            • <strong>Séparateur point-virgule (;) :</strong> Standard français
            pour les fichiers CSV
          </li>
          <li>
            • <strong>Confidentialité :</strong> Les exports sont générés
            localement, aucune donnée n'est envoyée à un serveur externe
          </li>
        </ul>
      </div>
    </div>
  );
};

export default AdminAccounting;
