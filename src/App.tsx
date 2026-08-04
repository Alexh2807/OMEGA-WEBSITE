import React, { useEffect, Suspense } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useLocation,
  Navigate,
  Link,
} from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import { SiteSettingsProvider } from './contexts/SiteSettingsContext';
import Header from './components/Header';
import Footer from './components/Footer';
import ErrorBoundary from './components/ErrorBoundary';
import { supabase } from './lib/supabase';
import toast from 'react-hot-toast';
import { lazyPage } from './utils/lazyPage';

// Pages chargées à la demande. `lazyPage` et non `lazy` : après un déploiement, les
// morceaux de l'ancienne version n'existent plus sur le serveur et un onglet resté
// ouvert échouerait à charger sa page suivante. Voir src/utils/lazyPage.ts.
const HomePage = lazyPage(() => import('./pages/HomePage'));
const HazerDetailPage = lazyPage(() => import('./pages/HazerDetailPage'));
const MousseDetailPage = lazyPage(() => import('./pages/MousseDetailPage'));
const SmokeSystemPage = lazyPage(() => import('./pages/SmokeSystemPage'));
const Smoke700DetailPage = lazyPage(() => import('./pages/Smoke700DetailPage'));
const FluidSystemPage = lazyPage(() => import('./pages/FluidSystemPage'));
const NeigeDetailPage = lazyPage(() => import('./pages/NeigeDetailPage'));
const FumeeDetailPage = lazyPage(() => import('./pages/FumeeDetailPage'));
const FlammeDetailPage = lazyPage(() => import('./pages/FlammeDetailPage'));
const ProductsPage = lazyPage(() => import('./pages/ProductsPage'));
const OmegaDmxInterfacePage = lazyPage(() => import('./pages/OmegaDmxInterfacePage'));
const ProductDetailPage = lazyPage(() => import('./pages/ProductDetailPage'));
const CartPage = lazyPage(() => import('./pages/CartPage'));
const CheckoutPage = lazyPage(() => import('./pages/CheckoutPage'));
const AccountPage = lazyPage(() => import('./pages/AccountPage'));
const OrdersPage = lazyPage(() => import('./pages/OrdersPage'));
const ContactPage = lazyPage(() => import('./pages/ContactPage'));
const AuthPage = lazyPage(() => import('./pages/AuthPage'));
const AdminPage = lazyPage(() => import('./pages/AdminPage'));
const MessagesPage = lazyPage(() => import('./pages/MessagesPage'));
const EmailConfirmationPage = lazyPage(() => import('./pages/EmailConfirmationPage'));
const SpectaclesPage = lazyPage(() => import('./pages/SpectaclesPage'));
const PrivacyPolicyPage = lazyPage(() => import('./pages/PrivacyPolicyPage'));
const TermsPage = lazyPage(() => import('./pages/TermsPage'));

// Composant pour gérer le scroll vers le haut
const ScrollToTop = () => {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return null;
};

function App() {
  useEffect(() => {
    // Gérer la confirmation email au retour depuis l'email
    const handleAuthCallback = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        console.error('Erreur session:', error);
        return;
      }

      // Vérifier si c'est une confirmation email
      const urlParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = urlParams.get('access_token');
      const type = urlParams.get('type');

      if (accessToken && type === 'signup') {
        // L'utilisateur vient de confirmer son email
        toast.success('🎉 Email confirmé avec succès ! Bienvenue chez OMEGA !');

        // Nettoyer l'URL
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    };

    handleAuthCallback();
  }, []);

  const Fallback = (
    <div className="pt-24 min-h-screen bg-black text-white flex items-center justify-center">
      <div className="animate-pulse text-gray-300">Chargement...</div>
    </div>
  );

  return (
    <SiteSettingsProvider>
    <AuthProvider>
      <CartProvider>
        <Router>
          <ScrollToTop />
          <div className="min-h-screen">
            <Header />
            <ErrorBoundary>
            <Suspense fallback={Fallback}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/produits" element={<ProductsPage />} />
                <Route path="/produit/:id" element={<ProductDetailPage />} />
                <Route path="/machine-hazer" element={<HazerDetailPage />} />
                <Route path="/smoke-system" element={<SmokeSystemPage />} />
                <Route path="/smoke-700-detail" element={<Smoke700DetailPage />} />
                <Route path="/fluid-system" element={<FluidSystemPage />} />
                <Route path="/neige-detail" element={<NeigeDetailPage />} />
                <Route path="/fumee-detail" element={<FumeeDetailPage />} />
                <Route path="/flamme-detail" element={<FlammeDetailPage />} />
                <Route path="/produit-mousse" element={<MousseDetailPage />} />
                <Route path="/omega-dmx-interface" element={<OmegaDmxInterfacePage />} />
                <Route path="/panier" element={<CartPage />} />
                {/* Page de commande : adresse, statut fiscal et paiement, dans l'ordre. */}
                <Route path="/commande" element={<CheckoutPage />} />
                <Route path="/compte" element={<AccountPage />} />
                <Route path="/commandes" element={<OrdersPage />} />
                <Route path="/contact" element={<ContactPage />} />
                <Route path="/mes-messages" element={<MessagesPage />} />
                <Route path="/connexion" element={<AuthPage mode="login" />} />
                <Route path="/inscription" element={<AuthPage mode="register" />} />
                <Route path="/email-confirmation" element={<EmailConfirmationPage />} />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="/spectacles" element={<SpectaclesPage />} />
                <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
                <Route path="/terms" element={<TermsPage />} />
                {/* Anciennes URL : la page « Machines » n'a jamais existé → catalogue */}
                <Route path="/machines" element={<Navigate to="/produits" replace />} />
                {/* 404 : URL inconnue → page claire avec retours utiles */}
                <Route
                  path="*"
                  element={
                    <div className="pt-24 min-h-screen bg-black text-white flex flex-col items-center justify-center gap-6 px-6 text-center">
                      <div className="text-7xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">404</div>
                      <h1 className="text-3xl font-bold">Page introuvable</h1>
                      <p className="text-gray-400 max-w-md">
                        La page que vous cherchez n'existe pas ou a été déplacée.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-4">
                        <Link to="/" className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-8 py-3 rounded-full font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300">
                          Retour à l'accueil
                        </Link>
                        <Link to="/produits" className="border-2 border-white/30 text-white px-8 py-3 rounded-full font-semibold hover:bg-white/10 transition-all duration-300">
                          Voir les produits
                        </Link>
                      </div>
                    </div>
                  }
                />
              </Routes>
            </Suspense>
            </ErrorBoundary>
            <Footer />
            <Toaster
              position="top-right"
              toastOptions={{
                style: {
                  background: '#1f2937',
                  color: '#fff',
                  border: '1px solid #374151',
                },
              }}
            />
          </div>
        </Router>
      </CartProvider>
    </AuthProvider>
    </SiteSettingsProvider>
  );
}

export default App;
