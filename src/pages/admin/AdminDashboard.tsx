import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Users,
  Package,
  MessageSquare,
  ShoppingCart,
  TrendingUp,
  Calendar,
  Euro,
} from 'lucide-react';

// Import your Supabase client
import { supabase } from '../../lib/supabase';

const AdminDashboard = () => {
  // Local state to hold statistics fetched from Supabase
  const [statsData, setStatsData] = useState({
    users: 0,
    orders: 0,
    revenue: 0,
    messages: 0,
    products: 0,
  });

  // Fetch statistics when the component mounts
  useEffect(() => {
    const fetchStats = async () => {
      // Get total number of users from profiles table
      const { count: users = 0 } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      // Fetch order totals and compute count and revenue
      const ordersRes = await supabase
        .from('orders')
        .select('total', { count: 'exact' });
      const orders = ordersRes.count || 0;
      const revenue = ordersRes.data
        ? ordersRes.data.reduce((sum: number, o: any) => sum + (o.total || 0), 0)
        : 0;

      // Get contact request count
      const { count: messages = 0 } = await supabase
        .from('contact_requests')
        .select('*', { count: 'exact', head: true });

      // Get product count
      const { count: products = 0 } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true });

      setStatsData({ users, orders, revenue, messages, products });
    };
    fetchStats();
  }, []);

  // Convert numeric values to display strings
  const formattedRevenue = statsData.revenue.toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  });
  const conversionRate =
    statsData.users > 0
      ? ((statsData.orders / statsData.users) * 100).toFixed(1) + '%'
      : '0%';

  // Statistics to display in the dashboard
  const stats = [
    {
      title: 'Utilisateurs totaux',
      value: statsData.users.toString(),
      change: '+12%', // Placeholder change percentage
      icon: Users,
      color: 'from-blue-500 to-blue-600',
    },
    {
      title: 'Commandes ce mois',
      value: statsData.orders.toString(),
      change: '+23%', // Placeholder change percentage
      icon: ShoppingCart,
      color: 'from-green-500 to-green-600',
    },
    {
      title: "Chiffre d'affaires",
      value: formattedRevenue,
      change: '+18%', // Placeholder change percentage
      icon: Euro,
      color: 'from-yellow-500 to-yellow-600',
    },
    {
      title: 'Messages en attente',
      value: statsData.messages.toString(),
      change: '-5%', // Placeholder change percentage
      icon: MessageSquare,
      color: 'from-red-500 to-red-600',
    },
    {
      title: 'Produits en stock',
      value: statsData.products.toString(),
      change: '+3%', // Placeholder change percentage
      icon: Package,
      color: 'from-purple-500 to-purple-600',
    },
    {
      title: 'Taux de conversion',
      value: conversionRate,
      change: '+0.8%', // Placeholder change percentage
      icon: TrendingUp,
      color: 'from-indigo-500 to-indigo-600',
    },
  ];

  const recentActivity = [
    {
      type: 'order',
      message: 'Nouvelle commande #1234',
      time: 'Il y a 5 minutes',
      icon: ShoppingCart,
      color: 'text-green-400',
    },
    {
      type: 'user',
      message: 'Nouvel utilisateur inscrit',
      time: 'Il y a 15 minutes',
      icon: Users,
      color: 'text-blue-400',
    },
    {
      type: 'message',
      message: 'Nouveau message de contact',
      time: 'Il y a 30 minutes',
      icon: MessageSquare,
      color: 'text-yellow-400',
    },
    {
      type: 'product',
      message: 'Stock faible: PRO HAZER CO²',
      time: 'Il y a 1 heure',
      icon: Package,
      color: 'text-red-400',
    },
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <h1 className="text-2xl font-semibold mb-1">Tableau de Bord</h1>
      <p className="text-sm text-gray-500 mb-4">
        Vue d'ensemble de votre activité OMEGA
      </p>

      {/* Statistiques */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat, index) => (
          <div
            key={index}
            className="bg-white rounded-lg shadow p-4 flex items-center justify-between dark:bg-gray-800"
          >
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {stat.title}
              </p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                {stat.value}
              </p>
              <p
                className={`text-sm font-medium ${stat.change.startsWith('-') ? 'text-red-500' : 'text-green-500'}`}
              >
                {stat.change}
              </p>
            </div>
            <div
              className={`p-3 rounded-full bg-gradient-to-r ${stat.color} text-white`}
            >
              <stat.icon size={24} />
            </div>
          </div>
        ))}
      </div>

      {/* Graphiques et activité récente */}
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {/* Graphique des ventes */}
        <div className="bg-white rounded-lg shadow p-4 dark:bg-gray-800">
          <h2 className="text-lg font-semibold mb-2 dark:text-white">
            Ventes des 7 derniers jours
          </h2>
          <div className="flex items-end justify-between mt-4">
            {[65, 45, 78, 52, 89, 67, 94].map((height, index) => (
              <div key={index} className="flex flex-col items-center">
                <div
                  className="w-8 bg-blue-500 dark:bg-blue-400 rounded-t-md"
                  style={{ height: `${height}px` }}
                />
                <span className="text-xs mt-1 dark:text-gray-300">
                  {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'][index]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Activité récente */}
        <div className="bg-white rounded-lg shadow p-4 dark:bg-gray-800">
          <h2 className="text-lg font-semibold mb-2 dark:text-white">
            Activité Récente
          </h2>
          <ul className="space-y-2">
            {recentActivity.map((activity, index) => (
              <li
                key={index}
                className="flex items-center justify-between bg-gray-50 p-2 rounded dark:bg-gray-700"
              >
                <div className="flex items-center">
                  <activity.icon
                    className="w-5 h-5 mr-2"
                    color={activity.color}
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {activity.message}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {activity.time}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Actions rapides */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <button className="bg-blue-500 text-white py-2 px-4 rounded-lg shadow hover:bg-blue-600">
          Gérer Utilisateurs
        </button>
        <button className="bg-green-500 text-white py-2 px-4 rounded-lg shadow hover:bg-green-600">
          Ajouter Produit
        </button>
        <button className="bg-purple-500 text-white py-2 px-4 rounded-lg shadow hover:bg-purple-600">
          Voir Commandes
        </button>
        <button className="bg-yellow-500 text-white py-2 px-4 rounded-lg shadow hover:bg-yellow-600">
          Messages
        </button>
      </div>
    </div>
  );
};

export default AdminDashboard;
