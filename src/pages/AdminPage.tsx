import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  BarChart3,
  Users,
  Package,
  MessageSquare,
  ShoppingCart,
  Calendar,
  Settings,
} from 'lucide-react';
import AdminDashboard from './admin/AdminDashboard';
import AdminUsers from './admin/AdminUsers';
import AdminProducts from './admin/AdminProducts';
import AdminOrders from './admin/AdminOrders';
import AdminPlanningEditor from './admin/AdminPlanningEditor';
import AdminMessages from './admin/AdminMessages';
import AdminBilling from './admin/AdminBilling';
import AdminSettings from './admin/AdminSettings';

const AdminPage = () => {
  const { user, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');

  useEffect(() => {
    // Listen for custom events to switch tabs programmatically
    const handleSwitchToBilling = () => setActiveTab('billing');
    const handleSwitchToOrders = () => setActiveTab('orders');

    window.addEventListener('switchToBilling', handleSwitchToBilling);
    window.addEventListener('switchToOrders', handleSwitchToOrders);

    return () => {
      window.removeEventListener('switchToBilling', handleSwitchToBilling);
      window.removeEventListener('switchToOrders', handleSwitchToOrders);
    };
  }, []);

  if (!user || !isAdmin) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-2 text-red-600">Accès Refusé</h1>
        <p className="text-gray-600 dark:text-gray-300">
          Vous n'avez pas les permissions nécessaires pour accéder à cette page.
        </p>
      </div>
    );
  }

  const tabs = [
    { id: 'dashboard', label: 'Tableau de Bord', icon: BarChart3 },
    { id: 'users', label: 'Utilisateurs', icon: Users },
    { id: 'products', label: 'Produits', icon: Package },
    { id: 'orders', label: 'Commandes', icon: ShoppingCart },
    { id: 'planning', label: 'Planning', icon: Calendar },
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
      case 'planning':
        return <AdminPlanningEditor />;
      case 'messages':
        return <AdminMessages />;
      case 'billing':
        return <AdminBilling />;
      case 'settings':
        return <AdminSettings />;
      case 'dashboard':
      default:
        return <AdminDashboard />;
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Administration OMEGA</h1>
      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-gray-700 dark:border-gray-600 mb-4">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 font-semibold transition-colors focus:outline-none ${
              activeTab === tab.id
                ? 'text-yellow-400 border-b-2 border-yellow-400'
                : 'text-gray-500 hover:text-white'
            }`}
          >
            <tab.icon size={18} /> {tab.label}
          </button>
        ))}
      </div>
      {/* Content */}
      <div className="mt-4">
        {renderTabContent()}
      </div>
    </div>
  );
};

export default AdminPage;
