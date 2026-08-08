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
  FileCheck,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Invoice, Quote, BillingSettings, Refund } from '../../types/billing';
import toast from 'react-hot-toast';
import Papa from 'papaparse';
import { format } from 'date-fns';
import { EURO } from '../../utils/prix';

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
  /* URL signée de l'ORIGINAL affiché dans l'aperçu.
     `null` = édition en cours · `''` = échec · sinon l'adresse du PDF archivé. */
  const [apercuUrl, setApercuUrl] = useState<string | null>(null);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundData, setRefundData] = useState({
    amount: '',
    reason: '',
    adminNotes: '',
    stripeChargeId: '',
  });
  const [refundLoading, setRefundLoading] = useState(false);
  /* Avoir par ARTICLES : quantité retenue par ligne de facture, et retour en stock.
     `modeLignes` bascule vers un montant libre pour les cas sans article précis
     (geste commercial, erreur de facturation). */
  const [modeLignes, setModeLignes] = useState(true);
  const [lignesAvoir, setLignesAvoir] = useState<Record<string, number>>({});
  const [remettreEnStock, setRemettreEnStock] = useState(true);

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
      /* ⚠ `refunds` DOIT être désigné par le nom de sa clé étrangère.
         Depuis les avoirs il existe DEUX liens entre `invoices` et `refunds` :
         `refunds.invoice_id` (les remboursements DE cette facture) et
         `invoices.refund_id` (l'avoir ÉMIS POUR un remboursement). Écrit `refunds (*)`,
         PostgREST ne peut pas trancher : il répond PGRST201 et TOUTE la requête échoue —
         la page n'affichait plus une seule facture.
         ⚠ Ce commentaire est DEHORS : le `select` part tel quel au serveur, un
         commentaire glissé dedans en ferait partie. */
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
          refunds!refunds_invoice_id_fkey (*),
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
        return <Clock className="text-blue-400" size={16} />;
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
      /* Statut ajouté par la migration du 5 août à la contrainte `invoices_status_check`.
         Sans lui ici, une facture remboursée s'affichait « Brouillon » — c'est-à-dire
         comme un document qui n'existe pas encore, alors qu'elle est émise et annulée. */
      case 'refunded':
        return 'Remboursée';
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
      case 'refunded':
        return 'text-amber-400 bg-amber-500/20';
      default:
        return 'text-blue-400 bg-blue-500/20';
    }
  };

  /** Un avoir se lit à l'œil dans la liste : c'est un document de sens opposé. */
  const estAvoir = (invoice: Invoice) => invoice.document_type === 'credit_note';

  /* ★ ÉDITION ET TÉLÉCHARGEMENT DE L'ORIGINAL (5 août 2026).
     Avant : on ouvrait la fenêtre de la facture, on la photographiait à l'écran
     (`html2canvas`) et on empilait l'image dans un PDF. Le document dépendait donc
     du navigateur, du moment, et n'était conservé nulle part.
     Maintenant : le serveur fabrique l'original la première fois qu'on le demande,
     l'archive, puis le sert. Les appels suivants renvoient LE MÊME fichier — c'est
     ce qui permet au client de retélécharger sa facture, à l'identique, des années
     plus tard. Ce bouton est aussi le rattrapage des factures créées avant ce
     changement : le premier clic les édite. */
  /**
   * ★ L'APERÇU MONTRE L'ORIGINAL, PAS UN SECOND RENDU.
   *
   * Il y avait DEUX factures pour un même document : le composant React `InvoicePDF`
   * (aperçu de l'administration, en HTML) et le PDF fabriqué par la fonction
   * `facture-pdf` — le seul qui soit archivé, joint aux e-mails, téléchargé par le
   * client et transmis à la comptabilité. Les deux mises en page ont dérivé, et
   * l'administration validait donc une facture que le client ne recevait pas.
   *
   * Une facture n'a qu'une forme : celle qui est archivée. L'aperçu affiche désormais
   * ce fichier-là.
   */
  const ouvrirApercu = async (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setApercuUrl(null);
    setShowInvoiceModal(true);
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
          body: JSON.stringify({ invoice_id: invoice.id }),
        }
      );
      const rep = await r.json().catch(() => ({}));
      if (r.ok && rep?.url) setApercuUrl(rep.url);
      else setApercuUrl('');   // '' = échec, on l'affiche franchement
    } catch {
      setApercuUrl('');
    }
  };

  const handleDownloadPDF = async (invoice: Invoice) => {
    const t = toast.loading('Édition de la facture…');
    try {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) throw new Error('Session expirée — reconnectez-vous.');

      const r = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/facture-pdf`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${s.session.access_token}`,
          },
          body: JSON.stringify({ invoice_id: invoice.id }),
        }
      );
      const rep = await r.json().catch(() => ({}));
      if (!r.ok || !rep?.url) throw new Error(rep?.error || 'Édition impossible');

      const a = document.createElement('a');
      a.href = rep.url;
      a.download = `facture-${invoice.invoice_number}.pdf`;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      toast.success(
        rep.archive ? 'Facture téléchargée' : 'Facture éditée et archivée',
        { id: t }
      );
      loadInvoices();
    } catch (error: any) {
      console.error('Édition/téléchargement impossible :', error);
      toast.error(error?.message || 'Erreur lors du téléchargement', { id: t });
    }
  };

  const handleRefund = async (invoice: Invoice) => {
    console.log('🔍 Début handleRefund pour facture:', invoice.invoice_number);
    console.log('📋 Refunds disponibles:', invoice.refunds);

    // Calculer le montant maximum remboursable
    const totalRefunded = (invoice.refunds || [])
      .filter(refund => refund.status === 'succeeded')
      .reduce((sum, refund) => sum + refund.amount, 0);

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
      setLignesAvoir({}); setModeLignes(true); setRemettreEnStock(true);
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
      setLignesAvoir({}); setModeLignes(true); setRemettreEnStock(true);
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
          setLignesAvoir({}); setModeLignes(true); setRemettreEnStock(true);
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
      refunds: invoice.refunds,
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

    const utiliseLignes =
      modeLignes && (selectedInvoice.invoice_items || []).length > 0;
    const montantRembourse = utiliseLignes
      ? Math.round(totalSelection(selectedInvoice) * 100) / 100
      : parseFloat(refundData.amount);

    if (!(montantRembourse > 0)) {
      toast.error(
        utiliseLignes
          ? 'Choisissez au moins un article à rembourser.'
          : 'Indiquez un montant à rembourser.'
      );
      return;
    }

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
            /* ⚠ C'est CE montant qui part chez Stripe. En mode articles il vient de la
               sélection, pas du champ texte (qui n'est alors qu'un affichage). Lire
               `refundData.amount` ici aurait envoyé un montant vide. */
            amount: montantRembourse,
            reason: refundData.reason,
            adminNotes: refundData.adminNotes,
            /* En mode ARTICLES, l'avoir reprend les lignes choisies (quantités, prix et
               taux d'origine) et peut remettre la marchandise en stock. Le serveur
               rembourse d'abord chez Stripe, puis émet l'avoir : jamais l'inverse. */
            ...(utiliseLignes
              ? {
                  lignes: Object.entries(lignesAvoir)
                    .filter(([, q]) => q > 0)
                    .map(([item_id, quantity]) => ({ item_id, quantity })),
                  remettreEnStock,
                }
              : {}),
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
      // Sans ça, la sélection d'articles resterait affichée sur la facture suivante.
      setLignesAvoir({});
      setModeLignes(true);
      setRemettreEnStock(true);
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
      /* ★ Un remboursement peut buter sur l'inaltérabilité de la facture (trigger de
         base). Le message brut de PostgreSQL ne dit pas quoi faire ; on le traduit et on
         propose le seul geste régulier : l'avoir. */
      if (!gererRefusInalterabilite(error, selectedInvoice)) {
        toast.error((error as any)?.message || 'Erreur lors du remboursement');
      }
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
    const totalRefunded = (invoice.refunds || [])
      .filter(refund => refund.status === 'succeeded')
      .reduce((sum, refund) => sum + refund.amount, 0);

    return invoice.total_ttc - totalRefunded;
  };

  const isRefundable = (invoice: Invoice) => {
    return (
      invoice.status === 'paid' &&
      invoice.order_id &&
      getRefundableAmount(invoice) > 0
    );
  };

  /**
   * Où en est le règlement d'une facture.
   *
   * ## Le défaut corrigé — l'affichage était exactement INVERSÉ
   * L'ancien calcul faisait `max(0, total − payé + remboursé)`, puis affichait
   * « REMBOURSÉE » dès que le résultat tombait à zéro. Or :
   *  · une facture réglée normalement (payé = total, remboursé = 0) donne **0**
   *    → elle s'affichait « REMBOURSÉE » ;
   *  · une facture réellement remboursée (payé = total, remboursé = total) donne
   *    **le total** → elle s'affichait comme restant DUE, et une relance partait.
   * La même valeur alimente la colonne « Net à payer » de l'export destiné au comptable :
   * il lisait « REMBOURSÉE » en face de chaque encaissement normal.
   *
   * ## Ce qu'on distingue désormais
   *  · `resteDu`    : ce que le client doit ENCORE = total − payé + remboursé, borné à 0.
   *                   (Le remboursement RECRÉE une dette du client seulement s'il n'avait
   *                    pas encore payé ; sinon les deux se compensent et il reste 0.)
   *  · `soldee`     : plus rien à encaisser (`resteDu` nul) ET rien remboursé.
   *  · `remboursee` : le remboursement couvre la totalité de la facture.
   *  · `partiellementRemboursee` : un remboursement, mais pas la totalité.
   * Trois états distincts, trois libellés distincts — un zéro ne veut pas dire la même
   * chose selon d'où il vient.
   *
   * ⚠ `amountPaid` retombe sur `invoice.amount_paid` quand aucune ligne de règlement n'est
   * encore enregistrée : depuis que la facture est émise par
   * `creer_facture_depuis_commande()`, l'encaissement Stripe est porté par la facture
   * elle-même, et `payment_records` est alimenté par le SERVEUR (cf. rapport).
   */
  /**
   * Combien de chaque ligne a DÉJÀ été crédité par des avoirs antérieurs ?
   * On le déduit des avoirs déjà chargés (`credit_note_of` + `credit_of_item`) : sans ça
   * on proposerait de rembourser 2 exemplaires d'un article vendu à 1.
   */
  const dejaCredite = (invoice: Invoice): Record<string, number> => {
    const par: Record<string, number> = {};
    invoices
      .filter(i => i.document_type === 'credit_note' && (i as any).credit_note_of === invoice.id)
      .forEach(av =>
        (av.invoice_items || []).forEach((li: any) => {
          if (li.credit_of_item) {
            par[li.credit_of_item] = (par[li.credit_of_item] || 0) + Math.abs(li.quantity || 0);
          }
        })
      );
    return par;
  };

  /** Montant TTC de la sélection en cours — c'est lui qui part chez Stripe. */
  const totalSelection = (invoice: Invoice): number => {
    return (invoice.invoice_items || []).reduce((s: number, li: any) => {
      const q = lignesAvoir[li.id] || 0;
      if (q <= 0) return s;
      return s + q * Number(li.unit_price_ht || 0) * (1 + Number(li.tax_rate || 0) / 100);
    }, 0);
  };

  const getPaymentSummary = (invoice: Invoice) => {
    const paiements = (invoice.payment_records || []).filter(
      p => p.payment_method !== 'refund'
    );
    const amountPaid = paiements.length
      ? paiements.reduce((sum, p) => sum + p.amount, 0)
      : invoice.amount_paid || 0;
    const totalRefunded = (invoice.refunds || [])
      .filter(r => r.status === 'succeeded')
      .reduce((sum, r) => sum + r.amount, 0);

    const resteDu = Math.max(0, invoice.total_ttc - amountPaid + totalRefunded);
    const remboursee =
      invoice.status === 'refunded' ||
      (totalRefunded > 0 && totalRefunded >= invoice.total_ttc - 0.005);
    const partiellementRemboursee = totalRefunded > 0 && !remboursee;
    const soldee = resteDu <= 0.005 && totalRefunded === 0;

    return {
      amountPaid,
      totalRefunded,
      resteDu,
      soldee,
      remboursee,
      partiellementRemboursee,
      /* Conservé pour compatibilité de lecture, mais ne s'interprète JAMAIS seul :
         c'est un montant, pas un état. */
      netToPay: resteDu,
    };
  };

  /** Libellé de l'état de règlement — une seule source pour l'écran ET pour l'export. */
  const libelleReglement = (s: ReturnType<typeof getPaymentSummary>): string => {
    if (s.remboursee) return 'REMBOURSÉE';
    if (s.soldee) return 'SOLDÉE';
    if (s.partiellementRemboursee) return 'PARTIELLEMENT REMBOURSÉE';
    return s.resteDu.toLocaleString('fr-FR', EURO);
  };

  /**
   * Émettre un AVOIR sur une facture émise.
   *
   * Depuis la migration du 5 août, une facture émise est INALTÉRABLE : un trigger de base
   * refuse toute modification de son contenu (art. 286 I 3° bis du CGI, 7 500 € d'amende
   * par logiciel non conforme). La correction ne passe donc plus par une retouche mais par
   * un avoir, qui annule la facture sans la réécrire. `creer_avoir_depuis_facture()` est
   * idempotente : un second clic rend l'avoir déjà émis au lieu d'en créer un doublon.
   */
  /**
   * La facture a-t-elle encaissé de l'argent ?
   *
   * C'est ce qui décide si un avoir SEUL est régulier. Sur une facture jamais payée
   * (émise par erreur), l'avoir est la seule correction possible et il n'y a rien à
   * rendre. Sur une facture encaissée, un avoir sans remboursement annule la vente dans
   * les comptes en laissant l'argent chez nous — la base le refuse désormais.
   */
  const estEncaissee = (invoice: Invoice) =>
    Number((invoice as any).amount_paid ?? 0) > 0 ||
    ((invoice as any).payment_records || []).some((p: any) => Number(p.amount) > 0);

  const emettreAvoir = async (invoice: Invoice, motif?: string) => {
    /* ★ UN AVOIR N'EST PAS UN REMBOURSEMENT — on le dit AVANT le clic.
       Constaté le 8 août 2026 : une facture encaissée a été annulée par un avoir sans
       qu'un centime ne reparte. Ni Stripe ni la table des remboursements n'avaient été
       touchés ; seul le document existait, et la commande s'affichait « remboursée ».
       Garde-fou de dernier recours : le bouton est masqué dans ce cas, mais un autre
       chemin d'appel ne doit pas contourner la règle. */
    if (estEncaissee(invoice) &&
        !((invoice as any).refunds || []).some(
          (r: any) => r.status !== 'failed' && r.status !== 'canceled')) {
      toast.error(
        `La facture ${invoice.invoice_number} a été encaissée. Un avoir seul ne rendrait ` +
        `pas l'argent au client : utilisez « Rembourser » — l'avoir est émis ` +
        `automatiquement dès que Stripe a validé.`,
        { duration: 10000 }
      );
      return;
    }
    const t = toast.loading("Émission de l'avoir…");
    try {
      const { data: avoirId, error } = await supabase.rpc(
        'creer_avoir_depuis_facture',
        { p_invoice_id: invoice.id, p_motif: motif ?? null }
      );
      if (error || !avoirId) throw new Error(error?.message || "L'avoir n'a pas pu être émis.");

      const { data: avoir } = await supabase
        .from('invoices')
        .select('invoice_number')
        .eq('id', avoirId as string)
        .maybeSingle();

      /* ★ L'AVOIR DOIT PARTIR EN COMPTABILITÉ — c'est ce qui manquait (5 août 2026).
         Il existe DEUX chemins pour émettre un avoir :
           · le remboursement Stripe (`process-refund`), qui appelle `send-to-make` ;
           · ce bouton, qui créait l'avoir en base ET S'ARRÊTAIT LÀ.
         Résultat constaté : l'avoir apparaissait sur le site, la facture passait en
         « annulée »… et Tiime n'en savait rien. La comptabilité continuait donc de
         porter une vente annulée — donc de la TVA collectée sur une somme rendue.
         On emprunte le MÊME chemin que le remboursement : un seul constructeur de
         payload, un seul format. */
      let transmis = false;
      try {
        const { data: s } = await supabase.auth.getSession();
        const r = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-to-make`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${s.session?.access_token}`,
            },
            body: JSON.stringify({ invoiceId: avoirId }),
          }
        );
        const rep = await r.json().catch(() => ({}));
        transmis = r.ok && (rep?.sent === true || rep?.envoye === true || !!rep?.tiime_invoice_id);
      } catch (e) {
        console.error('Avoir non transmis à la comptabilité :', e);
      }

      toast.success(
        `Avoir ${avoir?.invoice_number ?? ''} émis — la facture ${invoice.invoice_number} est annulée.`,
        { id: t, duration: 8000 }
      );
      /* ⚠ On le DIT quand ça n'est pas parti. Un avoir absent de la comptabilité est
         invisible : c'est précisément le genre d'écart qu'on ne découvre qu'au bilan. */
      if (!transmis) {
        toast('Avoir NON transmis à la comptabilité — à renvoyer depuis cette page', {
          icon: '⚠️',
          duration: 9000,
        });
      }
      loadData();
    } catch (e: any) {
      toast.error(e?.message || "Émission de l'avoir impossible", { id: t });
    }
  };

  /**
   * Traduit un refus d'inaltérabilité de la base en geste possible.
   *
   * Sans cela, l'utilisateur reçoit le message brut de PostgreSQL (« Modification refusée
   * sur la facture … ») et n'a aucune idée de ce qu'il doit faire à la place. On reconnaît
   * le refus, on l'explique, et on PROPOSE l'avoir — le seul chemin régulier.
   * Renvoie `true` si l'erreur a été prise en charge.
   */
  const gererRefusInalterabilite = (e: unknown, invoice: Invoice): boolean => {
    const message = (e as any)?.message ?? String(e ?? '');
    const estRefus =
      /inaltérable|inalterable|Modification refusée|Lignes verrouillées|Suppression refusée|286 I 3/i.test(
        message
      );
    if (!estRefus) return false;

    toast.error(
      `La facture ${invoice.invoice_number} est émise : elle ne peut plus être modifiée.`,
      { duration: 9000 }
    );
    if (
      window.confirm(
        `La facture ${invoice.invoice_number} est émise et donc inaltérable ` +
          `(art. 286 I 3° bis du CGI).\n\n` +
          `La seule correction régulière est d'émettre un AVOIR qui l'annule, ` +
          `puis de refacturer.\n\nÉmettre l'avoir maintenant ?`
      )
    ) {
      void emettreAvoir(invoice);
    }
    return true;
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
          p => p.payment_method !== 'refund'
        )?.created_at;
        const summary = getPaymentSummary(invoice);

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
          /* ⚠ Ces deux colonnes lisaient `total_ht` et `total_tva`, qui N'EXISTENT PAS
             sur une facture : les vrais champs sont `subtotal_ht` et `tax_amount`.
             L'export sortait donc 0,00 € de HT et 0,00 € de TVA sur CHAQUE ligne, seul
             le TTC était juste — un fichier inexploitable par le comptable. */
          'Total HT': (invoice.subtotal_ht || 0).toFixed(2),
          'Total TVA': (invoice.tax_amount || 0).toFixed(2),
          'Total TTC': (invoice.total_ttc || 0).toFixed(2),
          /* Sans le régime, le comptable ne peut pas ventiler : une facture à 0 % peut
             être une autoliquidation UE, une exportation ou une livraison outre-mer —
             trois lignes différentes de la déclaration. */
          'Régime TVA': invoice.vat_regime || '',
          'Taux TVA (%)': invoice.vat_rate != null ? String(invoice.vat_rate) : '',
          'Pays client': invoice.customer_country || '',
          'N° TVA client': invoice.vat_number || '',
          'Mention légale TVA': invoice.vat_mention || '',
          'Transmise en compta le': invoice.tiime_sent_at
            ? format(new Date(invoice.tiime_sent_at), 'yyyy-MM-dd HH:mm')
            : 'NON TRANSMISE',
          'Montant Payé': summary.amountPaid.toFixed(2),
          'Montant Remboursé': summary.totalRefunded.toFixed(2),
          /* ⚠ Cette colonne écrivait « REMBOURSÉE » sur toute facture soldée : le
             comptable lisait un remboursement en face de chaque encaissement normal.
             Le MONTANT et l'ÉTAT sont désormais deux colonnes distinctes — un chiffre
             n'a pas à porter un mot, et un mot n'a pas à remplacer un chiffre. */
          'Net à Payer': summary.resteDu.toFixed(2),
          'État du règlement': summary.remboursee
            ? 'Remboursée'
            : summary.partiellementRemboursee
              ? 'Partiellement remboursée'
              : summary.soldee
                ? 'Soldée'
                : 'Due',
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
      console.error('Erreur lors de la génération du CSV:', error);
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
          <div className="text-2xl font-bold text-blue-400">
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
                        {invoice.total_ttc.toLocaleString('fr-FR', EURO)}
                      </div>
                      {(() => {
                        const summary = getPaymentSummary(invoice);
                        return (
                          <div className="text-gray-400 text-sm">
                            Payé: {summary.amountPaid.toLocaleString('fr-FR', EURO)} • Remboursé:{' '}
                            {summary.totalRefunded.toLocaleString('fr-FR', EURO)}
                            <br />
                            {/* « Soldée » ≠ « Remboursée » : les deux donnaient zéro et
                                portaient le même mot, le plus alarmant des deux. */}
                            Net: {libelleReglement(summary)}
                          </div>
                        );
                      })()}
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
                            void ouvrirApercu(invoice);
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
                        {/* ⚠ LE BOUTON « FACTURE ÉLECTRONIQUE (Factur-X) » A ÉTÉ RETIRÉ.
                            Il fabriquait, dans le navigateur, un TROISIÈME document pour
                            une même facture : une mise en page à lui (« Net à payer » au
                            lieu de « Déjà réglé / Reste dû »), des marges à lui, et une
                            troncature à lui. On validait donc côté administration une
                            facture que le client ne recevait jamais — c'est ce qui a fait
                            perdre le fil le 8 août 2026.
                            Une facture n'a qu'une forme : celle qui est archivée par
                            `facture-pdf`, téléchargée par le client, jointe aux e-mails et
                            transmise à la comptabilité. Le bouton « Télécharger PDF »
                            ci-dessus rend CE fichier.
                            ⚠ L'obligation Factur-X (EN 16931) reste à traiter : le format
                            devra être produit PAR LE SERVEUR, dans `facture-pdf`, pour
                            rester l'unique original. Le code du générateur est conservé
                            dans `src/utils/facturx/` — il n'est simplement plus branché. */}
                        {/* Transmission en comptabilité. Elle part normalement TOUTE
                            SEULE à la création de la facture ; ce bouton ne sert qu'au
                            rattrapage (comptabilité indisponible ce jour-là, facture
                            ancienne). Il dit toujours où en est la facture, et un renvoi
                            — qui créerait un doublon dans Tiime — doit être confirmé. */}
                        <button
                          onClick={async () => {
                            const dejaPartie = !!invoice.tiime_sent_at;
                            if (
                              dejaPartie &&
                              !window.confirm(
                                `La facture ${invoice.invoice_number} a déjà été transmise ` +
                                  `à la comptabilité le ` +
                                  `${new Date(invoice.tiime_sent_at as string).toLocaleString('fr-FR')}.\n\n` +
                                  `La renvoyer créera une SECONDE facture dans Tiime : ` +
                                  `le chiffre d'affaires et la TVA seront comptés deux fois.\n\n` +
                                  `Renvoyer quand même ?`
                              )
                            ) {
                              return;
                            }
                            const t = toast.loading('Transmission à la comptabilité…');
                            try {
                              const { data, error } =
                                await supabase.functions.invoke('send-to-make', {
                                  body: { invoiceId: invoice.id, force: dejaPartie },
                                });
                              if (error) {
                                // Extraire le vrai message renvoyé par la fonction
                                const detail = await (error as any).context
                                  ?.json?.()
                                  .catch(() => null);
                                throw new Error(
                                  detail?.error || detail?.message || error.message
                                );
                              }
                              if (data?.sent) {
                                toast.success(
                                  'Facture transmise à la comptabilité (Tiime)',
                                  { id: t }
                                );
                                loadData();
                              } else {
                                toast.error(
                                  data?.message ||
                                    data?.error ||
                                    'Comptabilité non configurée',
                                  { id: t }
                                );
                              }
                            } catch (e: any) {
                              toast.error(
                                e?.message || 'Transmission impossible',
                                { id: t }
                              );
                            }
                          }}
                          className={`p-2 rounded-lg transition-colors ${
                            invoice.tiime_sent_at
                              ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                              : 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30'
                          }`}
                          title={
                            invoice.tiime_sent_at
                              ? `Déjà transmise à la comptabilité le ${new Date(
                                  invoice.tiime_sent_at
                                ).toLocaleString('fr-FR')} — cliquer pour renvoyer`
                              : 'Transmettre cette facture à la comptabilité (Tiime)'
                          }
                        >
                          <Send size={16} />
                        </button>
                        {isRefundable(invoice) && (
                          <button
                            onClick={() => handleRefund(invoice)}
                            className="p-2 bg-purple-600/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors"
                            title="Rembourser"
                          >
                            <RotateCcw size={16} />
                          </button>
                        )}
                        {/* ★ ÉMETTRE UN AVOIR — le geste de remplacement.
                            Une facture émise est inaltérable : la corriger est refusé par
                            la base. Sans ce bouton, on aurait rendu la correction
                            IMPOSSIBLE au lieu de la rendre régulière. Absent sur un
                            brouillon (qui se corrige directement) et sur un avoir
                            (on n'avoire pas un avoir). */}
                        {/* ⚠ Masqué sur une facture ENCAISSÉE : là, le geste correct est
                            « Rembourser », qui appelle Stripe PUIS émet l'avoir tout seul.
                            Garder ce bouton à côté revenait à proposer deux chemins dont
                            un seul rend l'argent — et c'est le mauvais qui a été pris. */}
                        {!estAvoir(invoice) &&
                          invoice.status !== 'draft' &&
                          invoice.status !== 'refunded' &&
                          !estEncaissee(invoice) && (
                            <button
                              onClick={() => {
                                const motif =
                                  window.prompt(
                                    `Émettre un AVOIR annulant la facture ${invoice.invoice_number}.\n\n` +
                                      `L'avoir reprend toutes les lignes en négatif, porte son propre ` +
                                      `numéro (série AV-) et référence la facture d'origine. ` +
                                      `La facture, elle, n'est PAS modifiée — c'est ce qu'exige ` +
                                      `l'art. 286 I 3° bis du CGI.\n\n` +
                                      `Motif (facultatif, imprimé sur l'avoir) :`
                                  );
                                // `null` = annulation de la boîte de dialogue : on ne fait rien.
                                if (motif === null) return;
                                void emettreAvoir(invoice, motif || undefined);
                              }}
                              className="p-2 bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 transition-colors"
                              title="Émettre un avoir (annule cette facture)"
                            >
                              <FileText size={16} />
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
                <RotateCcw className="text-purple-400" size={28} />
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
                    {selectedInvoice.total_ttc.toLocaleString('fr-FR', EURO)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Remboursable:</span>
                  <span className="text-green-400 ml-2 font-semibold">
                    {getRefundableAmount(selectedInvoice).toLocaleString('fr-FR', EURO)}
                  </span>
                </div>
              </div>
            </div>

            <form onSubmit={processRefund} className="space-y-6">
              {/* ---------- Sur quoi porte l'avoir ? ----------
                  Un remboursement porte presque toujours sur des ARTICLES précis. On les
                  liste, on laisse choisir les quantités, et le montant s'en déduit — plutôt
                  que de faire saisir une somme dont personne ne saura plus à quoi elle
                  correspondait. Le mode « montant libre » reste là pour les gestes
                  commerciaux et les erreurs de facturation. */}
              {(selectedInvoice.invoice_items || []).length > 0 && (
                <div className="bg-white/5 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-white font-semibold">Que remboursez-vous ?</h4>
                    <button
                      type="button"
                      onClick={() => setModeLignes(!modeLignes)}
                      className="text-xs text-blue-400 hover:text-blue-300 underline"
                    >
                      {modeLignes ? 'Saisir un montant libre' : 'Choisir des articles'}
                    </button>
                  </div>

                  {modeLignes && (
                    <>
                      <div className="space-y-2">
                        {(selectedInvoice.invoice_items || []).map((li: any) => {
                          const deja = dejaCredite(selectedInvoice)[li.id] || 0;
                          const dispo = Math.max(0, (li.quantity || 0) - deja);
                          const q = lignesAvoir[li.id] || 0;
                          return (
                            <div
                              key={li.id}
                              className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                                dispo === 0 ? 'border-white/5 opacity-40' : 'border-white/10'
                              }`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="text-white text-sm truncate">{li.description}</div>
                                <div className="text-gray-400 text-xs">
                                  {Number(li.unit_price_ht).toLocaleString('fr-FR', EURO)} HT ·
                                  TVA {Number(li.tax_rate)} % · vendu ×{li.quantity}
                                  {deja > 0 && ` · déjà crédité ×${deja}`}
                                </div>
                              </div>
                              <input
                                type="number"
                                min={0}
                                max={dispo}
                                disabled={dispo === 0}
                                value={q}
                                onChange={e => {
                                  const v = Math.max(0, Math.min(dispo, parseInt(e.target.value) || 0));
                                  setLignesAvoir(prev => ({ ...prev, [li.id]: v }));
                                }}
                                className="w-20 bg-white/5 border border-white/20 rounded-lg px-2 py-1.5 text-white text-center disabled:opacity-40"
                              />
                              <div className="w-24 text-right text-white text-sm">
                                {(
                                  q * Number(li.unit_price_ht) * (1 + Number(li.tax_rate) / 100)
                                ).toLocaleString('fr-FR', EURO)}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/10">
                        <span className="text-gray-300 text-sm">Total à rembourser</span>
                        <span className="text-white font-bold">
                          {totalSelection(selectedInvoice).toLocaleString('fr-FR', EURO)}
                        </span>
                      </div>

                      <label className="flex items-center gap-2 mt-3 text-sm text-gray-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={remettreEnStock}
                          onChange={e => setRemettreEnStock(e.target.checked)}
                          className="accent-blue-500"
                        />
                        Remettre les articles en stock
                      </label>
                      <p className="text-gray-500 text-xs mt-1">
                        À cocher seulement si la marchandise vous revient réellement.
                      </p>
                    </>
                  )}
                </div>
              )}

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
                  readOnly={modeLignes && (selectedInvoice.invoice_items || []).length > 0}
                  value={
                    modeLignes && (selectedInvoice.invoice_items || []).length > 0
                      ? totalSelection(selectedInvoice).toFixed(2)
                      : refundData.amount
                  }
                  onChange={e =>
                    setRefundData({ ...refundData, amount: e.target.value })
                  }
                  className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none"
                  placeholder="0.00"
                />
                <p className="text-gray-400 text-xs mt-1">
                  Maximum: {getRefundableAmount(selectedInvoice).toLocaleString('fr-FR', EURO)}
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
                    setRefundData({
                      ...refundData,
                      adminNotes: e.target.value,
                    })
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
                  Cette action va traiter un remboursement via Stripe et mettre
                  à jour automatiquement le statut de la facture. Cette
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
            {/* Sur un AVOIR, on retrouve la facture annulée dans la liste déjà
                chargée : l'avoir doit imprimer son NUMÉRO, pas un identifiant
                technique que le client ne peut rapprocher de rien. */}
            {apercuUrl === null ? (
              <div className="p-10 text-center text-gray-600">Édition du document…</div>
            ) : apercuUrl === '' ? (
              <div className="p-10 text-center text-gray-700">
                Le document n'a pas pu être édité.
                <div className="text-sm text-gray-500 mt-2">
                  C'est cette même édition qui alimente l'espace client et les e-mails :
                  tant qu'elle échoue, le client ne reçoit rien non plus.
                </div>
              </div>
            ) : (
              <iframe
                src={apercuUrl}
                title="Facture"
                className="w-full"
                style={{ height: '75vh', border: 0 }}
              />
            )}
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
