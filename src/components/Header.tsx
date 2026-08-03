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
  ToggleRight,
  ChevronDown,
} from 'lucide-react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Phone } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { useSiteSettings } from '../contexts/SiteSettingsContext';
import { COMPANY_INFO } from '../config/legalInfo';
import { supabase } from '../lib/supabase';

/**
 * La gamme OMEGA, regroupée sous un seul onglet.
 *
 * Sept liens côte à côte faisaient passer la barre sur DEUX lignes. Les quatre entrées
 * produits sont donc réunies ici, et cette liste sert aux deux menus : celui du bureau
 * et celui du mobile. Une seule source, pas deux listes à maintenir en parallèle.
 *
 * ⚠ Les destinations sont EXACTEMENT celles de l'ancien menu — « Smoke System » pointe
 * bien vers /machine-hazer, comme avant. Regrouper des liens ne doit pas en changer un
 * seul au passage.
 */
const GAMME_OMEGA = [
  { to: '/machine-hazer', libelle: 'Smoke System' },
  { to: '/fluid-system', libelle: 'Fluid System' },
  { to: '/omega-dmx-interface', libelle: 'DMX Interface' },
  { to: '/produits', libelle: 'Tous les produits' },
];

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isGammeOpen, setIsGammeOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const { user, signOut, isAdmin, userType } = useAuth();
  const { totalItems } = useCart();
  const { vitrineMode } = useSiteSettings();
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
    setIsGammeOpen(false);
  }, [location.pathname]);

  // Fermer les menus lors du clic extérieur
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (
        !target.closest('.user-menu-container') &&
        !target.closest('.mobile-menu-container') &&
        !target.closest('.gamme-menu-container')
      ) {
        setIsUserMenuOpen(false);
        setIsMenuOpen(false);
        setIsGammeOpen(false);
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

  /* `toggleUserType` a été retiré : le mode d'affichage n'est plus un choix libre mais
     la conséquence du statut entreprise du compte (cf. AuthContext). */

  // L'onglet reste allumé tant qu'on est sur l'une de ses pages : sans cela, entrer
  // dans la gamme ferait perdre tout repère de position dans la barre.
  const gammeActive = GAMME_OMEGA.some(lien => location.pathname === lien.to);
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
              src="/products/logo-omega-hq-transparent.webp"
              alt="OMEGA"
              className="h-12 w-auto"
            />
          </Link>

          {/* Menu bureau — `lg` et non `md` : à 768 px, la barre ne peut pas tenir sur
              une ligne, le menu compact est alors préférable. */}
          <div className="hidden lg:flex items-center gap-6">
            <Link
              to="/"
              className="text-white hover:text-blue-400 transition-colors duration-300 whitespace-nowrap"
            >
              Accueil
            </Link>

            {/* Gamme OMEGA — même mécanique que le menu du compte, juste en dessous :
                clic pour ouvrir, fermeture au clic extérieur et au changement de page. */}
            <div className="relative gamme-menu-container">
              <button
                onClick={() => setIsGammeOpen(!isGammeOpen)}
                aria-expanded={isGammeOpen}
                className={`flex items-center gap-1 transition-colors duration-300 whitespace-nowrap font-medium ${
                  gammeActive ? 'text-blue-400' : 'text-white hover:text-blue-400'
                }`}
              >
                Gamme OMEGA
                <ChevronDown
                  size={16}
                  className={`transition-transform duration-200 ${isGammeOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {isGammeOpen && (
                <div className="absolute left-0 top-full mt-2 bg-black/95 backdrop-blur-md rounded-lg p-2 min-w-56 border border-white/10 shadow-xl">
                  {GAMME_OMEGA.map(lien => (
                    <Link
                      key={lien.to}
                      to={lien.to}
                      className={`block px-3 py-2 rounded-md transition-colors whitespace-nowrap ${
                        location.pathname === lien.to
                          ? 'text-blue-400 bg-white/5'
                          : 'text-white hover:text-blue-400 hover:bg-white/5'
                      }`}
                    >
                      {lien.libelle}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <Link
              to="/spectacles"
              className="text-white hover:text-blue-400 transition-colors duration-300 whitespace-nowrap"
            >
              Spectacles
            </Link>
            <Link
              to="/contact"
              className="text-white hover:text-blue-400 transition-colors duration-300 whitespace-nowrap"
            >
              Contact
            </Link>

            {/* ⚠ PLUS DE BASCULE LIBRE : l'affichage HT n'est plus un choix, c'est la
                conséquence du statut déclaré dans le compte. Une bascule libre affichait
                −20 % à qui cliquait, et le vrai prix n'apparaissait qu'au paiement.
                Ici on se contente d'INDIQUER le mode ; il se change dans « Mon compte ». */}
            {user && userType === 'pro' && (
              <Link
                to="/compte"
                title="Vous êtes enregistré comme entreprise : les prix sont affichés hors taxes. Modifiable dans votre compte."
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 rounded-full px-3 py-2 transition-colors"
              >
                <ToggleRight size={18} className="text-blue-400" />
                <span className="text-xs font-medium text-white">Pro (HT)</span>
              </Link>
            )}

            {/* Panier (vente en ligne) — ou téléphone en MODE VITRINE */}
            {vitrineMode ? (
              <a
                href={COMPANY_INFO.phoneHref}
                className="flex items-center gap-2 text-white hover:text-blue-400 transition-colors duration-300 font-medium"
                title="Appelez-nous pour un devis"
              >
                <Phone size={20} />
                {/* Le numéro en toutes lettres n'apparaît qu'à partir de `xl` : entre
                    1024 et 1280 px, il suffirait à faire repasser la barre sur deux
                    lignes. En dessous, l'icône reste cliquable et appelle le même
                    numéro. */}
                <span className="hidden xl:inline">{COMPANY_INFO.phone}</span>
              </a>
            ) : (
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
            )}

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

          {/* Bouton du menu compact — même seuil que le menu bureau ci-dessus (`lg`),
              sinon il resterait une plage de largeurs sans aucun menu affiché. */}
          <button
            className="lg:hidden text-white"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu */}
        <div
          className={`lg:hidden absolute top-full left-0 w-full bg-black/95 backdrop-blur-md transition-all duration-300 ${
            isMenuOpen ? 'opacity-100 visible' : 'opacity-0 invisible'
          } mobile-menu-container`}
        >
          <div className="flex flex-col space-y-4 p-6">
            {/* Même règle qu'en version bureau : on indique le mode, on ne le bascule
                pas. Il découle du statut entreprise déclaré dans le compte. */}
            {user && (
              <Link
                to="/compte"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center justify-between p-3 bg-white/10 rounded-lg"
              >
                <span className="text-white text-sm">Prix affichés :</span>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-white/20 text-white">
                  {userType === 'pro' ? 'Pro (HT)' : 'Particulier (TTC)'}
                </span>
              </Link>
            )}

            <Link
              to="/"
              className="text-white hover:text-blue-400 transition-colors duration-300"
            >
              Accueil
            </Link>

            {/* Même regroupement qu'en bureau, mais déplié : sur un menu vertical la
                place ne manque pas, et un second niveau à ouvrir serait une gêne. */}
            <div>
              <div className="text-gray-400 text-xs uppercase tracking-wider mb-2">
                Gamme OMEGA
              </div>
              <div className="flex flex-col space-y-3 pl-3 border-l border-white/10">
                {GAMME_OMEGA.map(lien => (
                  <Link
                    key={lien.to}
                    to={lien.to}
                    className={`transition-colors duration-300 ${
                      location.pathname === lien.to
                        ? 'text-blue-400'
                        : 'text-white hover:text-blue-400'
                    }`}
                  >
                    {lien.libelle}
                  </Link>
                ))}
              </div>
            </div>

            <Link
              to="/spectacles"
              className="text-white hover:text-blue-400 transition-colors duration-300"
            >
              Spectacles
            </Link>
            <Link
              to="/contact"
              className="text-white hover:text-blue-400 transition-colors duration-300"
            >
              Contact
            </Link>
            {vitrineMode ? (
              <a
                href={COMPANY_INFO.phoneHref}
                className="text-white hover:text-blue-400 transition-colors duration-300 flex items-center gap-2"
              >
                <Phone size={20} />
                {COMPANY_INFO.phone}
              </a>
            ) : (
              <Link
                to="/panier"
                className="text-white hover:text-blue-400 transition-colors duration-300 flex items-center gap-2"
              >
                <ShoppingCart size={20} />
                Panier ({totalItems})
              </Link>
            )}
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
