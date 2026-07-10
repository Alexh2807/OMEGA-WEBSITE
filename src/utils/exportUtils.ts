import { Invoice, PaymentRecord } from '../types/billing';

/**
 * Convertit un tableau de données en format CSV
 */
export const convertToCSV = (data: any[], headers: string[]): string => {
  const csvRows = [];

  // En-têtes
  csvRows.push(headers.join(';'));

  // Données
  for (const row of data) {
    const values = headers.map(header => {
      const value = row[header];
      // Échapper les guillemets et encadrer avec des guillemets si nécessaire
      if (value === null || value === undefined) return '';
      const escaped = String(value).replace(/"/g, '""');
      return `"${escaped}"`;
    });
    csvRows.push(values.join(';'));
  }

  return csvRows.join('\n');
};

/**
 * Télécharge un fichier CSV
 */
export const downloadCSV = (content: string, filename: string) => {
  // Ajouter le BOM UTF-8 pour Excel
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Exporte les factures au format CSV pour le comptable
 */
export const exportInvoicesToCSV = (invoices: Invoice[]) => {
  const data = invoices.map(invoice => ({
    numero_facture: invoice.invoice_number,
    date_emission: new Date(invoice.created_at).toLocaleDateString('fr-FR'),
    date_paiement: invoice.paid_at
      ? new Date(invoice.paid_at).toLocaleDateString('fr-FR')
      : '',
    client: invoice.customer_name,
    email_client: invoice.customer_email,
    statut: getStatusLabel(invoice.status),
    montant_ht: invoice.subtotal_ht.toFixed(2),
    tva: invoice.tax_amount.toFixed(2),
    montant_ttc: invoice.total_ttc.toFixed(2),
    montant_paye: invoice.amount_paid.toFixed(2),
    solde_du: (invoice.total_ttc - invoice.amount_paid).toFixed(2),
    echeance: invoice.due_date || '',
  }));

  const headers = [
    'numero_facture',
    'date_emission',
    'date_paiement',
    'client',
    'email_client',
    'statut',
    'montant_ht',
    'tva',
    'montant_ttc',
    'montant_paye',
    'solde_du',
    'echeance',
  ];

  const csv = convertToCSV(data, headers);
  const filename = `factures_${new Date().toISOString().split('T')[0]}.csv`;
  downloadCSV(csv, filename);
};

/**
 * Exporte le journal des ventes (format FEC - Fichier des Écritures Comptables)
 */
export const exportSalesJournalFEC = (
  invoices: Invoice[],
  startDate: Date,
  endDate: Date
) => {
  const data: any[] = [];
  let lineNumber = 1;

  invoices.forEach(invoice => {
    const invoiceDate = new Date(invoice.created_at);
    
    // Filtres de sécurité : Date et Statut
    // On exclut les brouillons et les factures annulées qui ne doivent pas apparaître en compta
    if (invoiceDate < startDate || invoiceDate > endDate) return;
    if (invoice.status === 'draft' || invoice.status === 'cancelled') return;

    const dateStr = invoiceDate.toISOString().split('T')[0].replace(/-/g, '');

    // Gestion des avoirs / remboursements (si applicable, sinon traité comme vente standard)
    // Note : Idéalement, un avoir devrait avoir son propre document et numérotation.
    // Ici, on suppose que c'est une facture de vente validée.

    // Ligne de vente (crédit)
    data.push({
      JournalCode: 'VTE',
      JournalLib: 'Journal des Ventes',
      EcritureNum: invoice.invoice_number,
      EcritureDate: dateStr,
      CompteNum: '411000',
      CompteLib: 'Clients',
      CompAuxNum: invoice.customer_id.slice(0, 8),
      CompAuxLib: invoice.customer_name,
      PieceRef: invoice.invoice_number,
      PieceDate: dateStr,
      EcritureLib: `Facture ${invoice.invoice_number}`,
      Debit: invoice.total_ttc.toFixed(2),
      Credit: '0.00',
      EcritureLet: '',
      DateLet: '',
      ValidDate: dateStr,
      Montantdevise: '',
      Idevise: '',
    });

    // Ligne de TVA collectée (crédit)
    data.push({
      JournalCode: 'VTE',
      JournalLib: 'Journal des Ventes',
      EcritureNum: invoice.invoice_number,
      EcritureDate: dateStr,
      CompteNum: '445710',
      CompteLib: 'TVA collectée',
      CompAuxNum: '',
      CompAuxLib: '',
      PieceRef: invoice.invoice_number,
      PieceDate: dateStr,
      EcritureLib: `TVA collectée 20% - Facture ${invoice.invoice_number}`,
      Debit: '0.00',
      Credit: invoice.tax_amount.toFixed(2),
      EcritureLet: '',
      DateLet: '',
      ValidDate: dateStr,
      Montantdevise: '',
      Idevise: '',
    });

    // Ligne de vente HT (crédit)
    data.push({
      JournalCode: 'VTE',
      JournalLib: 'Journal des Ventes',
      EcritureNum: invoice.invoice_number,
      EcritureDate: dateStr,
      CompteNum: '707000',
      CompteLib: 'Ventes de marchandises',
      CompAuxNum: '',
      CompAuxLib: '',
      PieceRef: invoice.invoice_number,
      PieceDate: dateStr,
      EcritureLib: `Vente - Facture ${invoice.invoice_number}`,
      Debit: '0.00',
      Credit: invoice.subtotal_ht.toFixed(2),
      EcritureLet: '',
      DateLet: '',
      ValidDate: dateStr,
      Montantdevise: '',
      Idevise: '',
    });
  });

  const headers = [
    'JournalCode',
    'JournalLib',
    'EcritureNum',
    'EcritureDate',
    'CompteNum',
    'CompteLib',
    'CompAuxNum',
    'CompAuxLib',
    'PieceRef',
    'PieceDate',
    'EcritureLib',
    'Debit',
    'Credit',
    'EcritureLet',
    'DateLet',
    'ValidDate',
    'Montantdevise',
    'Idevise',
  ];

  const csv = convertToCSV(data, headers);
  const filename = `FEC_journal_ventes_${startDate.toISOString().split('T')[0]}_${endDate.toISOString().split('T')[0]}.csv`;
  downloadCSV(csv, filename);
};

/**
 * Exporte un rapport de TVA pour une période donnée
 */
export const exportVATReport = (
  invoices: Invoice[],
  startDate: Date,
  endDate: Date
) => {
  let totalHT = 0;
  let totalTVA = 0;
  let totalTTC = 0;

  const filteredInvoices = invoices.filter(invoice => {
    const invoiceDate = new Date(invoice.created_at);
    return (
      invoiceDate >= startDate &&
      invoiceDate <= endDate &&
      invoice.status !== 'cancelled' &&
      invoice.status !== 'refunded'
    );
  });

  filteredInvoices.forEach(invoice => {
    totalHT += invoice.subtotal_ht;
    totalTVA += invoice.tax_amount;
    totalTTC += invoice.total_ttc;
  });

  const data = [
    {
      periode: `Du ${startDate.toLocaleDateString('fr-FR')} au ${endDate.toLocaleDateString('fr-FR')}`,
      nombre_factures: filteredInvoices.length,
      total_ht: totalHT.toFixed(2),
      tva_collectee_20: totalTVA.toFixed(2),
      total_ttc: totalTTC.toFixed(2),
    },
  ];

  // Ajouter le détail par facture
  const detailData = filteredInvoices.map(invoice => ({
    numero_facture: invoice.invoice_number,
    date: new Date(invoice.created_at).toLocaleDateString('fr-FR'),
    client: invoice.customer_name,
    base_ht: invoice.subtotal_ht.toFixed(2),
    tva_20: invoice.tax_amount.toFixed(2),
    montant_ttc: invoice.total_ttc.toFixed(2),
  }));

  const summaryHeaders = [
    'periode',
    'nombre_factures',
    'total_ht',
    'tva_collectee_20',
    'total_ttc',
  ];
  const detailHeaders = [
    'numero_facture',
    'date',
    'client',
    'base_ht',
    'tva_20',
    'montant_ttc',
  ];

  const summaryCsv = convertToCSV(data, summaryHeaders);
  const detailCsv = convertToCSV(detailData, detailHeaders);

  const fullCsv = `RAPPORT DE TVA - SYNTHÈSE\n\n${summaryCsv}\n\n\nDÉTAIL PAR FACTURE\n\n${detailCsv}`;

  const filename = `rapport_TVA_${startDate.toISOString().split('T')[0]}_${endDate.toISOString().split('T')[0]}.csv`;
  downloadCSV(fullCsv, filename);
};

/**
 * Exporte le grand livre clients
 */
export const exportCustomerLedger = (invoices: Invoice[]) => {
  // Grouper par client
  const customerMap = new Map<string, any>();

  invoices.forEach(invoice => {
    const customerId = invoice.customer_id;
    if (!customerMap.has(customerId)) {
      customerMap.set(customerId, {
        nom_client: invoice.customer_name,
        email: invoice.customer_email,
        nombre_factures: 0,
        total_facture: 0,
        total_paye: 0,
        solde_du: 0,
      });
    }

    const customer = customerMap.get(customerId);
    customer.nombre_factures++;
    customer.total_facture += invoice.total_ttc;
    customer.total_paye += invoice.amount_paid;
    customer.solde_du += invoice.total_ttc - invoice.amount_paid;
  });

  const data = Array.from(customerMap.values()).map(customer => ({
    nom_client: customer.nom_client,
    email: customer.email,
    nombre_factures: customer.nombre_factures,
    total_facture: customer.total_facture.toFixed(2),
    total_paye: customer.total_paye.toFixed(2),
    solde_du: customer.solde_du.toFixed(2),
  }));

  const headers = [
    'nom_client',
    'email',
    'nombre_factures',
    'total_facture',
    'total_paye',
    'solde_du',
  ];

  const csv = convertToCSV(data, headers);
  const filename = `grand_livre_clients_${new Date().toISOString().split('T')[0]}.csv`;
  downloadCSV(csv, filename);
};

/**
 * Exporte les paiements reçus
 */
export const exportPaymentRecords = (
  invoices: Invoice[],
  startDate: Date,
  endDate: Date
) => {
  const payments: any[] = [];

  invoices.forEach(invoice => {
    if (invoice.payment_records) {
      invoice.payment_records.forEach(payment => {
        const paymentDate = new Date(payment.payment_date);
        if (paymentDate >= startDate && paymentDate <= endDate) {
          payments.push({
            date_paiement: paymentDate.toLocaleDateString('fr-FR'),
            numero_facture: invoice.invoice_number,
            client: invoice.customer_name,
            montant: payment.amount.toFixed(2),
            moyen_paiement: getPaymentMethodLabel(payment.payment_method),
            reference: payment.reference || '',
            notes: payment.notes || '',
          });
        }
      });
    }
  });

  const headers = [
    'date_paiement',
    'numero_facture',
    'client',
    'montant',
    'moyen_paiement',
    'reference',
    'notes',
  ];

  const csv = convertToCSV(payments, headers);
  const filename = `paiements_recus_${startDate.toISOString().split('T')[0]}_${endDate.toISOString().split('T')[0]}.csv`;
  downloadCSV(csv, filename);
};

// Fonctions utilitaires
const getStatusLabel = (status: string): string => {
  const labels: { [key: string]: string } = {
    draft: 'Brouillon',
    sent: 'Envoyée',
    paid: 'Payée',
    overdue: 'En retard',
    cancelled: 'Annulée',
    refunded: 'Remboursée',
  };
  return labels[status] || status;
};

const getPaymentMethodLabel = (method: string): string => {
  const labels: { [key: string]: string } = {
    virement: 'Virement bancaire',
    cheque: 'Chèque',
    especes: 'Espèces',
    carte: 'Carte bancaire',
    prelevement: 'Prélèvement',
    refund: 'Remboursement',
  };
  return labels[method] || method;
};
