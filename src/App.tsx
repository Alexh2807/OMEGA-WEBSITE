import React, { useEffect, Suspense, lazy } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useLocation,
} from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import Header from './components/Header';
import Footer from './components/Footer';
import { supabase } from './lib/supabase';
import toast from 'react-hot-toast';

// Lazy-loaded pages
const HomePage = lazy(() => import('./pages/HomePage'));
const HazerDetailPage = lazy(() => import('./pages/HazerDetailPage'));
const ProductsPage = lazy(() => import('./pages/ProductsPage'));
const ProductDetailPage = lazy(() => import('./pages/ProductDetailPage'));
const CartPage = lazy(() => import('./pages/CartPage'));
const AccountPage = lazy(() => import('./pages/AccountPage'));
const OrdersPage = lazy(() => import('./pages/OrdersPage'));
const ContactPage = lazy(() => import('./pages/ContactPage'));
const AuthPage = lazy(() => import('./pages/AuthPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const MessagesPage = lazy(() => import('./pages/MessagesPage'));
const EmailConfirmationPage = lazy(() => import('./pages/EmailConfirmationPage'));
const SpectaclesPage = lazy(() => import('./pages/SpectaclesPage'));
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));

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
    <AuthProvider>
      <CartProvider>
        <Router>
          <ScrollToTop />
          <div className="min-h-screen">
            <Header />
            <Suspense fallback={Fallback}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/produits" element={<ProductsPage />} />
                <Route path="/produit/:id" element={<ProductDetailPage />} />
                <Route path="/machine-hazer" element={<HazerDetailPage />} />
                <Route path="/panier" element={<CartPage />} />
                <Route path="/compte" element={<AccountPage />} />
                <Route path="/commandes" element={<OrdersPage />} />
                <Route path="/contact" element={<ContactPage />} />
                <Route path="/mes-messages" element={<MessagesPage />} />
                <Route path="/connexion" element={<AuthPage mode="login" />} />
                <Route path="/inscription" element={<AuthPage mode="register" />} />
                <Route path="/email-confirmation" element={<EmailConfirmationPage />} />
                <Route path="/admin" element={<AdminPage />} />
                {/* Placeholder routes */}
                <Route path="/spectacles" element={<SpectaclesPage />} />
                <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
                <Route path="/terms" element={<TermsPage />} />
                <Route
                  path="/machines"
                  element={
                    <div className="pt-24 min-h-screen bg-black text-white flex items-center justify-center">
                      <h1 className="text-4xl">Page Machines - En construction</h1>
                    </div>
                  }
                />
              </Routes>
            </Suspense>
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
  );
}

export default App;
