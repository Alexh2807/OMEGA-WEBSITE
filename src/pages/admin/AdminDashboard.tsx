import React from 'react';
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

const AdminDashboard = () => {
  const stats = [
    {
      title: 'Utilisateurs Total',
      value: '1,234',
      change: '+12%',
      icon: Users,
      color: 'from-blue-500 to-blue-600',
    },
    {
      title: 'Commandes ce mois',
      value: '89',
      change: '+23%',
      icon: ShoppingCart,
      color: 'from-green-500 to-green-600',
    },
    {
      title: "Chiffre d'affaires",
      value: '45,678€',
      change: '+18%',
      icon: Euro,
      color: 'from-yellow-500 to-yellow-600',
    },
    {
      title: 'Messages en attente',
      value: '12',
      change: '-5%',
      icon: MessageSquare,
      color: 'from-red-500 to-red-600',
    },
    {
      title: 'Produits en stock',
      value: '156',
      change: '+3%',
      icon: Package,
      color: 'from-purple-500 to-purple-600',
    },
    {
      title: 'Taux de conversion',
      value: '3.2%',
      change: '+0.8%',
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
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Tableau de Bord</h1>
        <p className="text-gray-400">Vue d'ensemble de votre activité OMEGA</p>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {stats.map((stat, index) => (
          <div
            key={index}
            className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-6 border border-white/10"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`bg-gradient-to-r ${stat.color} rounded-lg p-3`}>
                <stat.icon className="text-white" size={24} />
              </div>
              <span
                className={`text-sm font-medium ${
                  stat.change.startsWith('+')
                    ? 'text-green-400'
                    : 'text-red-400'
                }`}
              >
                {stat.change}
              </span>
            </div>
            <h3 className="text-2xl font-bold text-white mb-1">{stat.value}</h3>
            <p className="text-gray-400 text-sm">{stat.title}</p>
          </div>
        ))}
      </div>

      {/* Graphiques et activité récente */}
      <div className="grid lg:grid-cols-2 gap-8">
        {/* Graphique des ventes */}
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-6 border border-white/10">
          <div className="flex items-center gap-3 mb-6">
            <BarChart3 className="text-yellow-400" size={24} />
            <h3 className="text-xl font-bold text-white">
              Ventes des 7 derniers jours
            </h3>
          </div>
          <div className="h-64 flex items-end justify-between gap-2">
            {[65, 45, 78, 52, 89, 67, 94].map((height, index) => (
              <div key={index} className="flex-1 flex flex-col items-center">
                <div
                  className="w-full bg-gradient-to-t from-yellow-400 to-orange-500 rounded-t-lg transition-all duration-500 hover:opacity-80"
                  style={{ height: `${height}%` }}
                />
                <span className="text-gray-400 text-xs mt-2">
                  {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'][index]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Activité récente */}
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-6 border border-white/10">
          <div className="flex items-center gap-3 mb-6">
            <Calendar className="text-blue-400" size={24} />
            <h3 className="text-xl font-bold text-white">Activité Récente</h3>
          </div>
          <div className="space-y-4">
            {recentActivity.map((activity, index) => (
              <div
                key={index}
                className="flex items-center gap-4 p-3 bg-white/5 rounded-lg"
              >
                <div className={`${activity.color}`}>
                  <activity.icon size={20} />
                </div>
                <div className="flex-1">
                  <p className="text-white text-sm">{activity.message}</p>
                  <p className="text-gray-400 text-xs">{activity.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Actions rapides */}
      <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-6 border border-white/10">
        <h3 className="text-xl font-bold text-white mb-6">Actions Rapides</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-4 rounded-lg hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300">
            <Users className="mx-auto mb-2" size={24} />
            <span className="text-sm font-medium">Gérer Utilisateurs</span>
          </button>
          <button className="bg-gradient-to-r from-green-500 to-green-600 text-white p-4 rounded-lg hover:shadow-lg hover:shadow-green-500/25 transition-all duration-300">
            <Package className="mx-auto mb-2" size={24} />
            <span className="text-sm font-medium">Ajouter Produit</span>
          </button>
          <button className="bg-gradient-to-r from-yellow-500 to-yellow-600 text-white p-4 rounded-lg hover:shadow-lg hover:shadow-yellow-500/25 transition-all duration-300">
            <ShoppingCart className="mx-auto mb-2" size={24} />
            <span className="text-sm font-medium">Voir Commandes</span>
          </button>
          <button className="bg-gradient-to-r from-purple-500 to-purple-600 text-white p-4 rounded-lg hover:shadow-lg hover:shadow-purple-500/25 transition-all duration-300">
            <MessageSquare className="mx-auto mb-2" size={24} />
            <span className="text-sm font-medium">Messages</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
