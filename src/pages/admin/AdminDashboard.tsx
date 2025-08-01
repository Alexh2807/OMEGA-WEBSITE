import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  ShoppingCart,
  Euro,
  MessageSquare,
  Package,
  TrendingUp,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { RecentActivity } from '../../types'; // Assurez-vous que ce type est bien défini

const AdminDashboard = () => {
  const [statsData, setStatsData] = useState({
    users: 0,
    validOrders: 0,
    netRevenue: 0,
    pendingMessages: 0,
    products: 0,
    totalRefunded: 0,
  });
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);

    try {
      // --- Statistiques de base ---
      const { count: usersCount = 0 } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      const { count: productsCount = 0 } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true });

      const { count: pendingMessagesCount = 0 } = await supabase
        .from('contact_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      // --- Calculs financiers avancés ---
      // 1. Récupérer toutes les commandes non annulées
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('total')
        .not('status', 'eq', 'cancelled');

      if (ordersError) throw ordersError;

      const validOrdersCount = orders?.length || 0;
      const grossRevenue = orders
        ? orders.reduce((sum, o) => sum + (o.total || 0), 0)
        : 0;

      // 2. Récupérer tous les remboursements réussis
      const { data: refunds, error: refundsError } = await supabase
        .from('refunds')
        .select('amount')
        .eq('status', 'succeeded');

      if (refundsError) throw refundsError;

      const totalRefunded = refunds
        ? refunds.reduce((sum, r) => sum + (r.amount || 0), 0)
        : 0;

      // 3. Calculer le chiffre d'affaires net
      const netRevenue = grossRevenue - totalRefunded;

      // --- Activités récentes ---
      const { data: recentOrdersData } = await supabase
        .from('orders')
        .select('id, created_at, total, profiles(first_name, last_name)')
        .order('created_at', { ascending: false })
        .limit(3);

      const { data: recentUsersData } = await supabase
        .from('profiles')
        .select('id, created_at, first_name, last_name')
        .order('created_at', { ascending: false })
        .limit(3);

      const { data: recentMessagesData } = await supabase
        .from('contact_requests')
        .select('id, created_at, name, subject')
        .order('created_at', { ascending: false })
        .limit(3);

      // --- Mettre à jour l'état ---
      setStatsData({
        users: usersCount,
        validOrders: validOrdersCount,
        netRevenue,
        pendingMessages: pendingMessagesCount,
        products: productsCount,
        totalRefunded,
      });

      const activities: RecentActivity[] = [];
      (recentOrdersData || []).forEach(o =>
        activities.push({
          type: 'order',
          message: `Nouvelle commande de ${o.profiles?.first_name || 'un client'} (${o.total.toFixed(2)}€)`,
          time: new Date(o.created_at).toLocaleString('fr-FR'),
          icon: ShoppingCart,
          color: 'text-green-400',
          timestamp: new Date(o.created_at),
        })
      );
      (recentUsersData || []).forEach(u =>
        activities.push({
          type: 'user',
          message: `Nouvel utilisateur: ${u.first_name || 'Anonyme'} ${u.last_name || ''}`,
          time: new Date(u.created_at).toLocaleString('fr-FR'),
          icon: Users,
          color: 'text-blue-400',
          timestamp: new Date(u.created_at),
        })
      );
      (recentMessagesData || []).forEach(m =>
        activities.push({
          type: 'message',
          message: `Nouveau message de ${m.name}: "${m.subject}"`,
          time: new Date(m.created_at).toLocaleString('fr-FR'),
          icon: MessageSquare,
          color: 'text-yellow-400',
          timestamp: new Date(m.created_at),
        })
      );

      setRecentActivity(
        activities
          .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
          .slice(0, 5)
      );
    } catch (error) {
      console.error('Erreur de chargement du tableau de bord:', error);
      toast.error('Impossible de charger les statistiques.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const formattedNetRevenue = statsData.netRevenue.toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  });
  const conversionRate =
    statsData.users > 0
      ? ((statsData.validOrders / statsData.users) * 100).toFixed(1) + '%'
      : '0%';

  const stats = [
    {
      title: 'Chiffre d\'Affaires Net',
      value: formattedNetRevenue,
      change: `-${statsData.totalRefunded.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })} remboursés`,
      icon: Euro,
      color: 'from-yellow-500 to-yellow-600',
      isBad: statsData.totalRefunded > 0,
    },
    {
      title: 'Commandes Valides',
      value: statsData.validOrders.toString(),
      change: 'Hors commandes annulées',
      icon: ShoppingCart,
      color: 'from-green-500 to-green-600',
    },
    {
      title: 'Utilisateurs Totaux',
      value: statsData.users.toString(),
      change: 'Tous les comptes créés',
      icon: Users,
      color: 'from-blue-500 to-blue-600',
    },
    {
      title: 'Messages en Attente',
      value: statsData.pendingMessages.toString(),
      change: 'Non lus ou non résolus',
      icon: MessageSquare,
      color: 'from-red-500 to-red-600',
      isBad: statsData.pendingMessages > 0,
    },
    {
      title: 'Produits au Catalogue',
      value: statsData.products.toString(),
      change: 'Actifs et inactifs',
      icon: Package,
      color: 'from-purple-500 to-purple-600',
    },
    {
      title: 'Taux de Conversion',
      value: conversionRate,
      change: 'Basé sur les commandes valides',
      icon: TrendingUp,
      color: 'from-indigo-500 to-indigo-600',
    },
  ];

  const dispatchSwitchTab = (tabId: string) => {
    window.dispatchEvent(new CustomEvent('switchAdminTab', { detail: tabId }));
  };

  if (loading) {
    return (
      <div className="text-white text-center p-10">
        Chargement du tableau de bord...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-white mb-2">
        Tableau de Bord
      </h1>
      <p className="text-gray-400">
        Vue d'ensemble de votre activité OMEGA en temps réel.
      </p>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat, index) => (
          <div
            key={index}
            className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-6 border border-white/10"
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-gray-400">{stat.title}</p>
              <div
                className={`p-3 rounded-full bg-gradient-to-r ${stat.color} text-white shadow-lg`}
              >
                <stat.icon size={24} />
              </div>
            </div>
            <div>
              <p className="text-4xl font-bold text-white mb-2">{stat.value}</p>
              <div className="flex items-center gap-2 text-sm">
                {stat.isBad ? (
                  <AlertCircle className="text-red-400" size={16} />
                ) : (
                  <CheckCircle className="text-green-400" size={16} />
                )}
                <span className={stat.isBad ? "text-red-400" : "text-gray-400"}>{stat.change}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-6 border border-white/10">
          <h2 className="text-xl font-semibold mb-4 text-white">
            Activité Récente
          </h2>
          <ul className="space-y-4">
            {recentActivity.length > 0 ? (
              recentActivity.map((activity, index) => (
                <li key={index} className="flex items-center gap-4">
                  <div
                    className={`p-3 rounded-full bg-gray-700 ${activity.color}`}
                  >
                    <activity.icon size={20} />
                  </div>
                  <div>
                    <p className="font-medium text-white">{activity.message}</p>
                    <p className="text-xs text-gray-400">{activity.time}</p>
                  </div>
                </li>
              ))
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">
                Aucune activité récente à afficher.
              </p>
            )}
          </ul>
        </div>

        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-6 border border-white/10">
          <h2 className="text-xl font-semibold mb-4 text-white">
            Actions Rapides
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <button
              onClick={() => dispatchSwitchTab('users')}
              className="bg-blue-500/20 text-blue-400 py-3 px-4 rounded-lg shadow hover:bg-blue-500/30 transition-colors w-full text-left font-semibold flex items-center gap-3"
            >
              <Users size={20} /> Gérer les Utilisateurs
            </button>
            <button
              onClick={() => dispatchSwitchTab('products')}
              className="bg-green-500/20 text-green-400 py-3 px-4 rounded-lg shadow hover:bg-green-500/30 transition-colors w-full text-left font-semibold flex items-center gap-3"
            >
              <Package size={20} /> Ajouter un Produit
            </button>
            <button
              onClick={() => dispatchSwitchTab('orders')}
              className="bg-purple-500/20 text-purple-400 py-3 px-4 rounded-lg shadow hover:bg-purple-500/30 transition-colors w-full text-left font-semibold flex items-center gap-3"
            >
              <ShoppingCart size={20} /> Voir les Commandes
            </button>
            <button
              onClick={() => dispatchSwitchTab('messages')}
              className="bg-yellow-500/20 text-yellow-400 py-3 px-4 rounded-lg shadow hover:bg-yellow-500/30 transition-colors w-full text-left font-semibold flex items-center gap-3"
            >
              <MessageSquare size={20} /> Consulter les Messages
            </button>
            <button
              onClick={() => dispatchSwitchTab('billing')}
              className="bg-red-500/20 text-red-400 py-3 px-4 rounded-lg shadow hover:bg-red-500/30 transition-colors w-full text-left font-semibold flex items-center gap-3"
            >
              <Euro size={20} /> Gérer la Facturation
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;