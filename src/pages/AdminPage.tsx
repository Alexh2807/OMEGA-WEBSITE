import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  BarChart3,
  Users,
  Package,
  MessageSquare,
  ShoppingCart,
  Settings,
} from 'lucide-react';
import AdminDashboard from './admin/AdminDashboard';
import AdminUsers from './admin/AdminUsers';
import AdminProducts from './admin/AdminProducts';
import AdminOrders from './admin/AdminOrders';
import AdminMessages from './admin/AdminMessages';
import AdminBilling from './admin/AdminBilling';

const AdminPage = () => {
  const { user, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');

  useEffect(() => {
    // Écouter les événements de changement d'onglet
    const handleSwitchToBilling = () => {
      console.log('📋 Changement vers onglet Facturation');
      setActiveTab('billing');
    };

    const handleSwitchToOrders = () => {
      console.log('📦 Changement vers onglet Commandes');
      setActiveTab('orders');
    };

    window.addEventListener('switchToBilling', handleSwitchToBilling);
    window.addEventListener('switchToOrders', handleSwitchToOrders);

    return () => {
      window.removeEventListener('switchToBilling', handleSwitchToBilling);
      window.removeEventListener('switchToOrders', handleSwitchToOrders);
    };
  }, []);

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-4">Accès Refusé</h2>
          <p className="text-gray-400">
            Vous n'avez pas les permissions nécessaires pour accéder à cette
            page.
          </p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'dashboard', label: 'Tableau de Bord', icon: BarChart3 },
    { id: 'users', label: 'Utilisateurs', icon: Users },
    { id: 'products', label: 'Produits', icon: Package },
    { id: 'orders', label: 'Commandes', icon: ShoppingCart },
    { id: 'messages', label: 'Messages', icon: MessageSquare },
    { id: 'billing', label: 'Facturation', icon: Settings },
    { id: 'settings', label: 'Paramètres', icon: Settings },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'users':
        return <AdminUsers />;
      case 'products':
        return <AdminProducts />;
      case 'orders':
        return <AdminOrders />;
      case 'messages':
        return <AdminMessages />;
      case 'billing':
        return <AdminBilling />;
      default:
        return <AdminDashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24">
      <div className="container mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-4xl font-bold text-white">
            Administration OMEGA
          </h1>
          <div className="flex items-center gap-2 bg-gradient-to-r from-yellow-400/20 to-orange-500/20 px-4 py-2 rounded-full">
            <Settings className="text-yellow-400" size={20} />
            <span className="text-yellow-400 font-semibold">Admin</span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-4 mb-8 border-b border-white/20">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-3 font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'text-yellow-400 border-b-2 border-yellow-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <tab.icon size={20} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-8 border border-white/10">
          {renderTabContent()}
        </div>
      </div>
    </div>
  );
};

export default AdminPage;
