import React, { useState, useEffect } from 'react';
import {
  Users,
  Package,
  MessageSquare,
  ShoppingCart,
  TrendingUp,
  Euro,
  BarChart3,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Link } from 'react-router-dom';

// Interface pour uniformiser les activités récentes
interface RecentActivity {
  type: 'order' | 'user' | 'message';
  message: string;
  time: string;
  icon: React.ElementType;
  color: string;
  timestamp: Date;
}

// Composant Tooltip simple pour les infobulles
const Tooltip = ({ text, children }) => (
  <div className="relative group">
    {children}
    <div className="absolute bottom-full mb-2 w-max max-w-xs bg-gray-800 text-white text-xs rounded py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none shadow-lg border border-white/10">
      {text}
    </div>
  </div>
);

const AdminDashboard = () => {
  const [stats, setStats] = useState({
    users: { value: 0, change: 0 },
    orders: { value: 0, change: 0 },
    revenue: { value: 0, change: 0 },
    messages: { value: 0 },
    products: { value: 0 },
    conversionRate: { value: 0, change: 0 },
  });
  const [salesData, setSalesData] = useState<number[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      // --- 1. Récupérer les données de base ---
      const { count: usersCount = 0 } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      const { count: productsCount = 0 } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true });

      const { count: messagesCount = 0 } = await supabase
        .from('contact_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      // --- 2. Récupérer les commandes des 60 derniers jours pour les stats et le graphique ---
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('total, created_at')
        .gte('created_at', sixtyDaysAgo.toISOString());

      if (ordersError) {
        console.error('Erreur chargement commandes:', ordersError);
        setLoading(false);
        return;
      }

      // --- 3. Calculer les statistiques ---
      const now = new Date();
      const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

      const thisMonthOrders = orders.filter(
        o => new Date(o.created_at) >= firstDayThisMonth
      );
      const lastMonthOrders = orders.filter(
        o =>
          new Date(o.created_at) >= firstDayLastMonth &&
          new Date(o.created_at) < firstDayThisMonth
      );

      const revenueThisMonth = thisMonthOrders.reduce(
        (sum, o) => sum + (o.total || 0),
        0
      );
      const revenueLastMonth = lastMonthOrders.reduce(
        (sum, o) => sum + (o.total || 0),
        0
      );
      
      const calculateChange = (current, previous) => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return ((current - previous) / previous) * 100;
      };

      const conversionRate = usersCount > 0 ? (thisMonthOrders.length / usersCount) * 100 : 0;
      
      setStats({
        users: { value: usersCount, change: 0 },
        orders: { value: thisMonthOrders.length, change: calculateChange(thisMonthOrders.length, lastMonthOrders.length) },
        revenue: { value: revenueThisMonth, change: calculateChange(revenueThisMonth, revenueLastMonth) },
        messages: { value: messagesCount },
        products: { value: productsCount },
        conversionRate: { value: conversionRate, change: 0 },
      });

      // --- 4. Préparer les données pour le graphique des ventes des 7 derniers jours ---
      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return d.toISOString().split('T')[0];
      }).reverse();

      const dailySales = last7Days.map(day => {
        return orders
          .filter(o => o.created_at.startsWith(day))
          .reduce((sum, o) => sum + (o.total || 0), 0);
      });
      setSalesData(dailySales);

      // --- 5. Récupérer les activités récentes ---
      const { data: recentOrders } = await supabase.from('orders').select('id, created_at, profiles(first_name, last_name)').order('created_at', { ascending: false }).limit(3);
      const { data: recentUsers } = await supabase.from('profiles').select('id, created_at, first_name, last_name').order('created_at', { ascending: false }).limit(3);
      const { data: recentMessages } = await supabase.from('contact_requests').select('id, created_at, name').order('created_at', { ascending: false }).limit(3);

      const activities: RecentActivity[] = [];
      
      (recentOrders || []).forEach(o => activities.push({ type: 'order', message: `Nouvelle commande de ${o.profiles?.first_name || 'un client'}`, time: new Date(o.created_at).toLocaleString('fr-FR'), icon: ShoppingCart, color: 'text-green-400', timestamp: new Date(o.created_at) }));
      (recentUsers || []).forEach(u => activities.push({ type: 'user', message: `Nouvel utilisateur: ${u.first_name || 'Anonyme'}`, time: new Date(u.created_at).toLocaleString('fr-FR'), icon: Users, color: 'text-blue-400', timestamp: new Date(u.created_at) }));
      (recentMessages || []).forEach(m => activities.push({ type: 'message', message: `Nouveau message de ${m.name}`, time: new Date(m.created_at).toLocaleString('fr-FR'), icon: MessageSquare, color: 'text-yellow-400', timestamp: new Date(m.created_at) }));
      
      setRecentActivity(activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 4));

      setLoading(false);
    };

    fetchData();
  }, []);
  
  const StatChange = ({ value }) => {
    const isPositive = value > 0;
    const isNeutral = value === 0 || !isFinite(value);
    
    if (isNeutral) {
      return <span className="text-sm font-medium text-gray-500">--</span>;
    }
    
    return (
      <span className={`text-sm font-medium ${isPositive ? 'text-green-500' : 'text-red-500'} flex items-center`}>
        {isPositive ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
        {Math.abs(value).toFixed(1)}%
      </span>
    );
  };

  const statCards = [
    { title: 'Utilisateurs Totaux', value: stats.users.value.toString(), change: stats.users.change, icon: Users, color: 'from-blue-500 to-blue-600', tooltip: 'Nombre total de profils enregistrés dans la base de données.' },
    { title: 'Commandes ce mois', value: stats.orders.value.toString(), change: stats.orders.change, icon: ShoppingCart, color: 'from-green-500 to-green-600', tooltip: 'Nombre de commandes passées durant le mois en cours, comparé au mois précédent.' },
    { title: "Chiffre d'affaires (mois)", value: stats.revenue.value.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }), change: stats.revenue.change, icon: Euro, color: 'from-yellow-500 to-yellow-600', tooltip: 'Revenu total généré ce mois-ci, comparé au mois précédent.' },
    { title: 'Messages en attente', value: stats.messages.value.toString(), change: null, icon: MessageSquare, color: 'from-red-500 to-red-600', tooltip: 'Nombre de demandes de contact avec le statut "en attente".' },
    { title: 'Produits en catalogue', value: stats.products.value.toString(), change: null, icon: Package, color: 'from-purple-500 to-purple-600', tooltip: 'Nombre total de produits distincts dans votre catalogue.' },
    { title: 'Taux de conversion (mois)', value: `${stats.conversionRate.value.toFixed(1)}%`, change: null, icon: TrendingUp, color: 'from-indigo-500 to-indigo-600', tooltip: "Pourcentage d'utilisateurs inscrits ayant passé au moins une commande ce mois-ci." },
  ];

  if (loading) {
    return <div className="text-white text-center p-10">Chargement des données du tableau de bord...</div>
  }
  
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl text-white font-semibold mb-1">Tableau de Bord</h1>
        <p className="text-sm text-gray-500">
          Vue d'ensemble de votre activité OMEGA
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {statCards.map((stat, index) => (
          <Tooltip key={index} text={stat.tooltip}>
            <div className="bg-white rounded-lg shadow p-4 flex items-center justify-between dark:bg-gray-800 border border-transparent hover:border-blue-500 transition-colors">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  {stat.title}
                </p>
                <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                  {stat.value}
                </p>
                {stat.change !== null && <StatChange value={stat.change} />}
              </div>
              <div
                className={`p-3 rounded-full bg-gradient-to-r ${stat.color} text-white`}
              >
                <stat.icon size={24} />
              </div>
            </div>
          </Tooltip>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="bg-white rounded-lg shadow p-4 dark:bg-gray-800 lg:col-span-3">
          <h2 className="text-lg font-semibold mb-2 dark:text-white">
            Ventes des 7 derniers jours
          </h2>
          <div className="flex items-end justify-between mt-4 h-48">
            {salesData.map((height, index) => {
                const maxSales = Math.max(...salesData);
                const barHeight = maxSales > 0 ? (height / maxSales) * 100 : 0;
                const dayLabel = ['-6j', '-5j', '-4j', '-3j', '-2j', 'Hier', "Auj."][index];
                
                return (
                    <Tooltip key={index} text={`${dayLabel}: ${height.toFixed(2)}€`}>
                        <div className="flex flex-col items-center h-full justify-end w-full">
                            <div
                              className="w-8 bg-blue-500 dark:bg-blue-400 rounded-t-md hover:bg-blue-300 transition-all"
                              style={{ height: `${barHeight}%` }}
                            />
                            <span className="text-xs mt-1 dark:text-gray-300">
                                {dayLabel}
                            </span>
                        </div>
                    </Tooltip>
                )
            })}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4 dark:bg-gray-800 lg:col-span-2">
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
                    className={`w-5 h-5 mr-3 ${activity.color}`}
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
             {recentActivity.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Aucune activité récente.</p>}
          </ul>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4 dark:text-white">Actions rapides</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Link to="/admin" onClick={() => window.dispatchEvent(new CustomEvent('switchAdminTab', { detail: 'users' }))} className="bg-blue-500 text-white py-3 px-4 rounded-lg shadow hover:bg-blue-600 text-center font-medium">
              Gérer les Utilisateurs
            </Link>
            <Link to="/admin" onClick={() => window.dispatchEvent(new CustomEvent('switchAdminTab', { detail: 'products' }))} className="bg-green-500 text-white py-3 px-4 rounded-lg shadow hover:bg-green-600 text-center font-medium">
              Gérer les Produits
            </Link>
            <Link to="/admin" onClick={() => window.dispatchEvent(new CustomEvent('switchAdminTab', { detail: 'orders' }))} className="bg-purple-500 text-white py-3 px-4 rounded-lg shadow hover:bg-purple-600 text-center font-medium">
              Voir les Commandes
            </Link>
            <Link to="/admin" onClick={() => window.dispatchEvent(new CustomEvent('switchAdminTab', { detail: 'messages' }))} className="bg-yellow-500 text-white py-3 px-4 rounded-lg shadow hover:bg-yellow-600 text-center font-medium">
              Voir les Messages
            </Link>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;