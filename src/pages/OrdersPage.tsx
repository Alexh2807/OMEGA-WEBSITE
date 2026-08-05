import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
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
  RotateCcw,
  Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { EURO } from '../utils/prix';
import { Invoice } from '../types/billing';

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
  /* `loading` du contexte d'authentification : sans lui, `!user` vaut vrai pendant la
     restauration de session et le client — connecté — lisait « Accès non autorisé ».
     C'est le pire endroit pour ce message : on arrive ici depuis l'e-mail de suivi. */
  const { user, loading: sessionEnCours } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  /* Factures du client, indexées par commande. Elles ne pouvaient PAS être lues
     jusqu'ici : la table n'avait qu'une règle d'accès réservée aux administrateurs,
     et cette page ne mentionnait pas le mot « facture ». Le client n'avait donc
     AUCUN moyen d'obtenir sa facture — alors que la remise d'une facture est une
     obligation du vendeur. */
  const [factures, setFactures] = useState<Record<string, Invoice>>({});
  /* Verrou anti double-clic pendant la preparation du telechargement. L'etat ne
     sert plus a rendre la facture hors ecran (elle n'est plus photographiee), mais
     un bouton qui ne reagit pas donne l'impression d'une panne : on le desactive
     visiblement le temps de l'appel. */
  const [telechargementEnCours, setTelechargementEnCours] = useState(false);

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

  /* ★ ON SERT L'ORIGINAL ARCHIVÉ, ON NE LE REFABRIQUE PLUS (5 août 2026).
     Avant, ce bouton rendait la facture hors écran, la photographiait
     (`html2canvas`) et empilait l'image dans un PDF — à chaque clic, à partir des
     données du moment. Deux téléchargements à six mois d'écart pouvaient donc
     donner DEUX DOCUMENTS DIFFÉRENTS : il suffisait qu'une mention légale, une
     adresse ou le logo ait changé entre-temps. Il n'existait aucun original, et
     rien n'assurait la conservation de 10 ans (art. L102 B du LPF).
     Désormais le serveur a fabriqué le PDF UNE fois, l'a archivé et empreinté ; on
     demande simplement un accès signé de courte durée à ce fichier-là. */
  const telechargerFacture = async (f: Invoice) => {
    const t = toast.loading('Préparation de votre facture…');
    setTelechargementEnCours(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session expirée — reconnectez-vous.');

      const r = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/facture-pdf`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ invoice_id: f.id }),
        }
      );
      const rep = await r.json().catch(() => ({}));

      /* 409 = la facture existe mais son original n'a pas encore été édité. Ce
         n'est pas une panne, et le dire franchement évite l'appel au support. */
      if (r.status === 409) {
        toast.error(
          "Cette facture n'a pas encore été éditée. Elle vous sera envoyée par e-mail dès qu'elle le sera.",
          { id: t, duration: 8000 }
        );
        return;
      }
      if (!r.ok || !rep?.url) throw new Error(rep?.error || 'Facture indisponible');

      /* Téléchargement direct plutôt qu'un simple `window.open` : sur mobile, un
         nouvel onglet vers une URL signée se referme parfois sans rien enregistrer. */
      const a = document.createElement('a');
      a.href = rep.url;
      a.download = `facture-${f.invoice_number}.pdf`;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      toast.success(`Facture ${f.invoice_number} téléchargée`, { id: t });
    } catch (e: any) {
      console.error('Téléchargement de la facture impossible :', e);
      toast.error(e?.message || 'Téléchargement impossible — réessayez ou contactez-nous', { id: t });
    } finally {
      setTelechargementEnCours(false);
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

  /* ── STATUTS DE COMMANDE, VUS PAR LE CLIENT ──────────────────────────────────
     La liste était incomplète : `paid`, `processing` et `refunded` — tous trois
     écrits en base (le back-office pose `paid`, la migration du 5 août ajoute
     `refunded` au remboursement) — tombaient dans le `default` et s'affichaient
     « En attente ». Une commande remboursée était donc annoncée « En attente », en
     bleu, avec la mention « Payé » à côté du montant. */
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid':
        return <CreditCard className="text-emerald-400" size={20} />;
      case 'confirmed':
        return <CheckCircle className="text-green-400" size={20} />;
      case 'processing':
        return <Package className="text-blue-400" size={20} />;
      case 'shipped':
        return <Truck className="text-blue-400" size={20} />;
      case 'delivered':
        return <Package className="text-green-500" size={20} />;
      case 'cancelled':
        return <XCircle className="text-red-400" size={20} />;
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
        return 'text-emerald-400';
      case 'confirmed':
        return 'text-green-400';
      case 'processing':
        return 'text-blue-400';
      case 'shipped':
        return 'text-blue-400';
      case 'delivered':
        return 'text-green-500';
      case 'cancelled':
        return 'text-red-400';
      case 'refunded':
        return 'text-amber-400';
      default:
        return 'text-blue-400';
    }
  };

  const getStatusProgress = (status: string) => {
    switch (status) {
      case 'paid':
      case 'confirmed':
        return 25;
      case 'processing':
        return 50;
      case 'shipped':
        return 75;
      case 'delivered':
        return 100;
      case 'cancelled':
      case 'refunded':
        return 0;
      default:
        return 0;
    }
  };

  /* Ce que le client a réellement payé, ou non.
     ⚠ « Payé » s'affichait sur TOUTE commande non annulée — donc aussi sur une commande
     REMBOURSÉE : le client lisait « Payé » sur de l'argent qu'on venait de lui rendre,
     et rappelait le support pour comprendre. */
  const libellePaiement = (status: string) => {
    switch (status) {
      case 'cancelled':
        return 'Annulée';
      case 'refunded':
        return 'Remboursée';
      case 'pending':
        return 'En attente de paiement';
      default:
        return 'Payé';
    }
  };

  /* AVANT le test `!user` : tant que la session n'est pas restaurée, on ne sait rien —
     et « Accès non autorisé » est un verdict, pas une attente. */
  if (sessionEnCours) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="text-blue-400 mx-auto mb-4 animate-spin" size={40} />
          <p className="text-gray-300">Chargement de vos commandes…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24 flex items-center justify-center px-6">
        <div className="text-center">
          <Package className="text-gray-400 mx-auto mb-4" size={64} />
          <h2 className="text-2xl font-bold text-white mb-4">
            Connectez-vous pour voir vos commandes
          </h2>
          <p className="text-gray-400 mb-6">
            Vos commandes et vos factures sont rattachées à votre compte.
          </p>
          <Link
            to="/connexion"
            state={{ from: '/commandes' }}
            className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-full font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all"
          >
            Se connecter
          </Link>
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
              <div className="p-4 sm:p-6">
                {/* 375 px : l'en-tête portait la vignette, le numéro, la date, le statut,
                    le montant et le chevron sur UNE seule ligne — le numéro de commande
                    et le montant se chevauchaient. On empile en dessous de `sm`. */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="bg-gradient-to-br from-blue-500/20 to-purple-600/20 rounded-lg p-3 shrink-0">
                      <Package className="text-blue-400" size={24} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-lg sm:text-xl font-bold text-white truncate">
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

                  <div className="flex items-center justify-between sm:justify-end gap-4 flex-wrap">
                    <div
                      className={`flex items-center gap-2 ${getStatusColor(order.status)}`}
                    >
                      {getStatusIcon(order.status)}
                      <span className="font-semibold whitespace-nowrap">
                        {getStatusText(order.status)}
                      </span>
                    </div>

                    <div className="text-right">
                      <div className="text-xl sm:text-2xl font-bold text-white whitespace-nowrap">
                        {order.total.toLocaleString('fr-FR', EURO)}
                      </div>
                      <div className="text-gray-400 text-sm flex items-center gap-1">
                        <CreditCard size={14} />
                        {libellePaiement(order.status)}
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
                      disabled={telechargementEnCours}
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
                          {/* Une commande remboursée conserve un montant : c'est celui
                              qui a été rendu. L'effacer laissait le client sans aucun
                              chiffre au moment de vérifier son relevé bancaire. */}
                          <span
                            className={
                              order.status === 'cancelled'
                                ? 'text-red-400'
                                : order.status === 'refunded'
                                  ? 'text-amber-400'
                                  : 'text-white'
                            }
                          >
                            {order.status === 'cancelled'
                              ? 'Commande annulée'
                              : `${order.total.toLocaleString('fr-FR', EURO)}`}
                          </span>
                        </div>
                        {order.status === 'refunded' && (
                          <p className="text-amber-300 text-xs text-right">
                            Montant remboursé sur votre moyen de paiement.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

export default OrdersPage;
