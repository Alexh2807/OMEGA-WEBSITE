import React, { useState, useEffect } from 'react';
import {
  Menu,
  X,
  ArrowRight,
  ShoppingCart,
  User,
  LogOut,
  MessageSquare,
  Bell,
  Settings,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { supabase } from '../lib/supabase';

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const { user, signOut, isAdmin, userType, setUserType } = useAuth();
  const { totalItems } = useCart();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Fermer les menus lors du changement de page
  useEffect(() => {
    setIsUserMenuOpen(false);
    setIsMenuOpen(false);
  }, [location.pathname]);

  // Fermer les menus lors du clic extérieur
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (
        !target.closest('.user-menu-container') &&
        !target.closest('.mobile-menu-container')
      ) {
        setIsUserMenuOpen(false);
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  useEffect(() => {
    if (user) {
      loadUnreadMessages();
      // Écouter les changements en temps réel
      const subscription = supabase
        .channel('contact_updates')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'contact_requests',
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            loadUnreadMessages();
          }
        )
        .subscribe();

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [user]);

  const loadUnreadMessages = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('contact_requests')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'resolved')
        .is('read_by_user', false);

      if (!error && data) {
        setUnreadMessages(data.length);
      }
    } catch (err) {
      console.error('Error loading unread messages:', err);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
    setIsUserMenuOpen(false);
  };

  const toggleUserType = () => {
    setUserType(userType === 'pro' ? 'particulier' : 'pro');
  };
  return (
    <header
      className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        isScrolled ? 'bg-black/90 backdrop-blur-md' : 'bg-transparent'
      }`}
    >
      <nav className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img
              src="/Logo-omega-hq-transparent.png"
              alt="OMEGA"
              className="h-12 w-auto"
            />
          </Link>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center space-x-8">
            <Link
              to="/"
              className="text-white hover:text-blue-400 transition-colors duration-300"
            >
              Accueil
            </Link>
            <Link
              to="/spectacles"
              className="text-white hover:text-blue-400 transition-colors duration-300"
            >
              Spectacles
            </Link>
            <Link
              to="/machines"
              className="text-white hover:text-blue-400 transition-colors duration-300"
            >
              Machines
            </Link>
            <Link
              to="/produits"
              className="text-white hover:text-blue-400 transition-colors duration-300"
            >
              Produits
            </Link>
            <Link
              to="/contact"
              className="text-white hover:text-blue-400 transition-colors duration-300"
            >
              Contact
            </Link>

            {/* Pro/Particulier Switch */}
            <div className="flex items-center gap-2 bg-white/10 rounded-full px-3 py-2">
              <span
                className={`text-xs font-medium transition-colors ${userType === 'particulier' ? 'text-white' : 'text-gray-400'}`}
              >
                Particulier
              </span>
              <button
                onClick={toggleUserType}
                className="text-blue-400 hover:text-blue-300 transition-colors"
              >
                {userType === 'pro' ? (
                  <ToggleRight size={20} />
                ) : (
                  <ToggleLeft size={20} />
                )}
              </button>
              <span
                className={`text-xs font-medium transition-colors ${userType === 'pro' ? 'text-white' : 'text-gray-400'}`}
              >
                Pro {userType === 'pro' && '(HT)'}
              </span>
            </div>

            {/* Cart */}
            <Link
              to="/panier"
              className="relative text-white hover:text-blue-400 transition-colors duration-300"
            >
              <ShoppingCart size={24} />
              {totalItems > 0 && (
                <span className="absolute -top-2 -right-2 bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                  {totalItems}
                </span>
              )}
            </Link>

            {/* User Menu */}
            {user ? (
              <div className="relative user-menu-container">
                <button
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="text-white hover:text-purple-400 transition-colors duration-300 relative"
                >
                  <User size={24} />
                  {unreadMessages > 0 && (
                    <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                      {unreadMessages}
                    </span>
                  )}
                </button>
                {isUserMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 bg-black/95 backdrop-blur-md rounded-lg p-4 min-w-48">
                    <div className="text-white text-sm mb-2">
                      Bonjour, {user.user_metadata?.full_name || user.email}
                    </div>
                    <Link
                      to="/compte"
                      className="block text-white hover:text-blue-400 py-1"
                    >
                      Mon Compte
                    </Link>
                    <Link
                      to="/commandes"
                      className="block text-white hover:text-blue-400 py-1"
                    >
                      Mes Commandes
                    </Link>
                    <Link
                      to="/mes-messages"
                      className="block text-white hover:text-blue-400 py-1 flex items-center gap-2"
                    >
                      <MessageSquare size={16} />
                      Mes Messages
                      {unreadMessages > 0 && (
                        <span className="bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                          {unreadMessages}
                        </span>
                      )}
                    </Link>
                    <Settings size={16} />
                    {isAdmin && (
                      <Link
                        to="/admin"
                        className="block text-white hover:text-blue-400 py-1"
                      >
                        Administration
                      </Link>
                    )}
                    <button
                      onClick={handleSignOut}
                      className="flex items-center gap-2 text-white hover:text-blue-400 py-1 mt-2"
                    >
                      <LogOut size={16} />
                      Déconnexion
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <Link
                  to="/connexion"
                  className="text-white hover:text-blue-400 transition-colors duration-300"
                >
                  Connexion
                </Link>
                <Link
                  to="/inscription"
                  className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-2 rounded-full hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300"
                >
                  Inscription
                </Link>
              </div>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden text-white"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu */}
        <div
          className={`md:hidden absolute top-full left-0 w-full bg-black/95 backdrop-blur-md transition-all duration-300 ${
            isMenuOpen ? 'opacity-100 visible' : 'opacity-0 invisible'
          } mobile-menu-container`}
        >
          <div className="flex flex-col space-y-4 p-6">
            {/* Mobile Pro/Particulier Switch */}
            <div className="flex items-center justify-between p-3 bg-white/10 rounded-lg">
              <span className="text-white text-sm">Mode d'affichage:</span>
              <button
                onClick={toggleUserType}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  userType === 'pro'
                    ? 'bg-yellow-400 text-black'
                    : 'bg-white/20 text-white'
                }`}
              >
                {userType === 'pro' ? 'Pro (HT)' : 'Particulier (TTC)'}
              </button>
            </div>

            <Link
              to="/"
              className="text-white hover:text-blue-400 transition-colors duration-300"
            >
              Accueil
            </Link>
            <Link
              to="/spectacles"
              className="text-white hover:text-blue-400 transition-colors duration-300"
            >
              Spectacles
            </Link>
            <Link
              to="/machines"
              className="text-white hover:text-blue-400 transition-colors duration-300"
            >
              Machines
            </Link>
            <Link
              to="/produits"
              className="text-white hover:text-blue-400 transition-colors duration-300"
            >
              Produits
            </Link>
            <Link
              to="/contact"
              className="text-white hover:text-blue-400 transition-colors duration-300"
            >
              Contact
            </Link>
            <Link
              to="/panier"
              className="text-white hover:text-blue-400 transition-colors duration-300 flex items-center gap-2"
            >
              <ShoppingCart size={20} />
              Panier ({totalItems})
            </Link>
            {user ? (
              <>
                <Link
                  to="/compte"
                  className="text-white hover:text-blue-400 transition-colors duration-300"
                >
                  Mon Compte
                </Link>
                <Link
                  to="/commandes"
                  className="text-white hover:text-blue-400 transition-colors duration-300"
                >
                  Mes Commandes
                </Link>
                <Link
                  to="/mes-messages"
                  className="text-white hover:text-blue-400 transition-colors duration-300 flex items-center gap-2"
                >
                  <MessageSquare size={20} />
                  Mes Messages ({unreadMessages})
                </Link>
                {isAdmin && (
                  <Link
                    to="/admin"
                    className="text-white hover:text-blue-400 transition-colors duration-300"
                  >
                    Administration
                  </Link>
                )}
                <button
                  onClick={handleSignOut}
                  className="text-white hover:text-blue-400 transition-colors duration-300 text-left"
                >
                  Déconnexion
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/connexion"
                  className="text-white hover:text-blue-400 transition-colors duration-300"
                >
                  Connexion
                </Link>
                <Link
                  to="/inscription"
                  className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-2 rounded-full text-center"
                >
                  Inscription
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>
    </header>
  );
};

export default Header;
