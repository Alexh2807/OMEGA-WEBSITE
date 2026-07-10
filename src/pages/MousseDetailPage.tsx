import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Star,
  Shield,
  Award,
  Zap,
  Clock,
  Droplets,
  Sparkles,
  Waves,
  Leaf,
  ShoppingCart,
  ExternalLink,
  Beaker,
  Play,
  ChevronDown,
  Info,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Product } from '../types';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

const MousseDetailPage = () => {
  const [activeSection, setActiveSection] = useState('hero');
  const [showStickyBar, setShowStickyBar] = useState(false);
  const [mousseProduct, setMousseProduct] = useState<Product | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [imageLoaded, setImageLoaded] = useState(false);
  const { addToCart } = useCart();
  const { user, userType } = useAuth();

  const heroRef = useRef<HTMLDivElement>(null);
  const specsRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (heroRef.current) {
        const heroBottom = heroRef.current.getBoundingClientRect().bottom;
        setShowStickyBar(heroBottom < 0);
      }

      // Detect active section
      const sections = [
        { ref: heroRef, name: 'hero' },
        { ref: featuresRef, name: 'features' },
        { ref: specsRef, name: 'specs' },
      ];

      for (const section of sections) {
        if (section.ref.current) {
          const rect = section.ref.current.getBoundingClientRect();
          if (rect.top <= 100 && rect.bottom >= 100) {
            setActiveSection(section.name);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    loadMousseProduct();
    loadRelatedProducts();
  }, []);

  const loadMousseProduct = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .ilike('name', '%mousse%')
        .limit(1)
        .single();

      if (error) {
        console.error('Erreur chargement produit Mousse:', error);
        toast.error('Produit non trouvé en base de données');
      } else {
        setMousseProduct(data);
      }
    } catch (err) {
      console.error('Erreur inattendue:', err);
      toast.error('Erreur lors du chargement du produit');
    } finally {
      setLoading(false);
    }
  };

  const loadRelatedProducts = async () => {
    try {
      // Charger les produits liquides et machines liés
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .or('name.ilike.%hazer%,name.ilike.%liquide%')
        .limit(3);

      if (error) {
        console.error('Erreur chargement produits liés:', error);
      } else {
        setRelatedProducts(data || []);
      }
    } catch (err) {
      console.error('Erreur inattendue:', err);
    }
  };

  const handleAddToCart = () => {
    if (!user) {
      toast.error('Veuillez vous connecter pour ajouter au panier');
      return;
    }
    if (!mousseProduct) {
      toast.error('Produit non disponible');
      return;
    }
    addToCart(mousseProduct);
  };

  const getDisplayPrice = (product: Product) => {
    if (userType === 'pro' && product.price_ht) {
      return {
        price: product.price_ht,
        label: 'HT',
        taxInfo: `${product.price.toFixed(2)}€ TTC`,
      };
    }
    return {
      price: product.price,
      label: 'TTC',
      taxInfo: product.price_ht ? `${product.price_ht.toFixed(2)}€ HT` : null,
    };
  };

  const scrollToSection = (ref: React.RefObject<HTMLDivElement>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const keyFeatures = [
    {
      icon: Sparkles,
      title: 'Mousse Ultra-Dense',
      subtitle: 'Formule exclusive',
      description: '18 ans de R&D pour la mousse la plus dense et stable du marché',
    },
    {
      icon: Leaf,
      title: '98% Biodégradable',
      subtitle: 'Éco-responsable',
      description: 'Tensioactifs végétaux, sans danger pour l\'environnement',
    },
    {
      icon: Zap,
      title: 'Rendement Exceptionnel',
      subtitle: 'Dilution 1:100',
      description: 'Jusqu\'à 500m³ de mousse par litre de concentré',
    },
    {
      icon: Clock,
      title: 'Tenue Prolongée',
      subtitle: '30-45 minutes',
      description: 'Mousse stable et persistante pour vos événements',
    },
  ];

  const specifications = [
    { label: 'Type', value: 'Liquide concentré pour mousse événementielle', icon: Beaker },
    { label: 'pH', value: '6.5 - 7.5 (neutre)', icon: Shield },
    { label: 'Dilution', value: '1:50 à 1:100', icon: Droplets },
    { label: 'Rendement', value: 'Jusqu\'à 500m³ par litre', icon: Zap },
    { label: 'Tenue', value: '30-45 minutes', icon: Clock },
    { label: 'Biodégradabilité', value: '98% en 28 jours', icon: Leaf },
    { label: 'Température', value: '5°C à 35°C', icon: Waves },
    { label: 'Stockage', value: '2 ans à l\'abri de la lumière', icon: Award },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-black pt-24 flex items-center justify-center">
        <div className="text-white text-xl">Chargement...</div>
      </div>
    );
  }

  if (!mousseProduct) {
    return (
      <div className="min-h-screen bg-black pt-24 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Produit non trouvé</h2>
          <Link
            to="/produits"
            className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-6 py-3 rounded-full font-semibold"
          >
            Voir tous nos produits
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Sticky Buy Bar */}
      <div
        className={`fixed top-0 left-0 right-0 bg-black/95 backdrop-blur-lg border-b border-white/10 z-40 transition-transform duration-300 ${
          showStickyBar ? 'translate-y-0' : '-translate-y-full'
        }`}
        style={{ paddingTop: '80px' }}
      >
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img
              src={
                mousseProduct.image
                  ? mousseProduct.image.startsWith('/')
                    ? mousseProduct.image
                    : `/${mousseProduct.image}`
                  : '/omega mousse.png'
              }
              alt={mousseProduct.name}
              className="w-12 h-12 object-contain"
            />
            <div>
              <h2 className="text-white font-bold">{mousseProduct.name}</h2>
              <div className="text-cyan-400 font-semibold">
                {getDisplayPrice(mousseProduct).price.toFixed(2)}€{' '}
                <span className="text-sm text-gray-400">
                  {getDisplayPrice(mousseProduct).label}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleAddToCart}
              className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-6 py-3 rounded-full font-semibold hover:shadow-lg hover:shadow-cyan-500/25 transition-all"
            >
              Ajouter au Panier
            </button>
            <Link
              to={`/produit/${mousseProduct.id}`}
              className="border-2 border-white/30 text-white px-6 py-3 rounded-full font-semibold hover:bg-white/10 transition-all flex items-center justify-center gap-2"
            >
              <ExternalLink size={20} />
              Voir la page du produit
            </Link>
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <div ref={heroRef} className="relative pt-32 pb-16 overflow-hidden">
        {/* Background Gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-cyan-950/20 via-black to-black" />

        <div className="container mx-auto px-6 relative z-10">
          {/* Breadcrumb */}
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-cyan-400 transition-colors mb-8"
          >
            <ArrowLeft size={20} />
            Retour
          </Link>

          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Product Info */}
            <div className="order-2 lg:order-1">
              <div className="inline-flex items-center gap-2 bg-cyan-500/10 border border-cyan-500/20 rounded-full px-4 py-2 mb-6">
                <Sparkles className="text-cyan-400" size={16} />
                <span className="text-cyan-400 font-medium text-sm">
                  FORMULE PREMIUM
                </span>
              </div>

              <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
                {mousseProduct.name}
              </h1>

              <p className="text-xl text-gray-300 mb-8 leading-relaxed">
                {mousseProduct.long_description || mousseProduct.description}
              </p>

              {/* Price */}
              <div className="mb-8 p-6 bg-gradient-to-r from-cyan-950/30 to-blue-950/30 rounded-2xl border border-cyan-500/20">
                <div className="text-sm text-gray-400 mb-2">Prix</div>
                <div className="text-5xl font-bold text-white mb-2">
                  {getDisplayPrice(mousseProduct).price.toFixed(2)}€
                  <span className="text-2xl text-gray-400 ml-2">
                    {getDisplayPrice(mousseProduct).label}
                  </span>
                </div>
                {getDisplayPrice(mousseProduct).taxInfo && (
                  <div className="text-gray-400 text-sm">
                    {getDisplayPrice(mousseProduct).taxInfo}
                  </div>
                )}
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="text-center p-4 bg-white/5 rounded-xl">
                  <div className="text-3xl font-bold text-cyan-400 mb-1">18</div>
                  <div className="text-xs text-gray-400">Ans de R&D</div>
                </div>
                <div className="text-center p-4 bg-white/5 rounded-xl">
                  <div className="text-3xl font-bold text-cyan-400 mb-1">98%</div>
                  <div className="text-xs text-gray-400">Biodégradable</div>
                </div>
                <div className="text-center p-4 bg-white/5 rounded-xl">
                  <div className="text-3xl font-bold text-cyan-400 mb-1">500m³</div>
                  <div className="text-xs text-gray-400">Par litre</div>
                </div>
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={handleAddToCart}
                  className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-8 py-4 rounded-full font-semibold hover:shadow-lg hover:shadow-cyan-500/25 transition-all duration-300 flex items-center justify-center gap-2"
                >
                  <ShoppingCart size={20} />
                  Ajouter au Panier
                </button>
                <Link
                  to={`/produit/${mousseProduct.id}`}
                  className="flex-1 border-2 border-white/30 text-white px-8 py-4 rounded-full font-semibold hover:bg-white/10 hover:border-white/50 transition-all duration-300 text-center flex items-center justify-center gap-2"
                >
                  <ExternalLink size={20} />
                  Voir la page du produit
                </Link>
              </div>

              {/* Scroll Indicator */}
              <div className="mt-12 text-center">
                <button
                  onClick={() => scrollToSection(featuresRef)}
                  className="inline-flex flex-col items-center gap-2 text-gray-400 hover:text-cyan-400 transition-colors"
                >
                  <span className="text-sm">Découvrir plus</span>
                  <ChevronDown size={24} className="animate-bounce" />
                </button>
              </div>
            </div>

            {/* Product Image */}
            <div className="order-1 lg:order-2 relative">
              <div className="relative">
                {/* Glow Effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/30 to-blue-500/30 rounded-3xl blur-3xl" />

                {/* Image Container */}
                <div className="relative bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-sm rounded-3xl p-8 border border-white/10">
                  <img
                    src={
                      mousseProduct.image
                        ? mousseProduct.image.startsWith('/')
                          ? mousseProduct.image
                          : `/${mousseProduct.image}`
                        : '/omega mousse.png'
                    }
                    alt={mousseProduct.name}
                    className="w-full h-[500px] object-contain"
                    onLoad={() => setImageLoaded(true)}
                  />
                </div>

                {/* Floating Badge */}
                <div className="absolute -top-4 -right-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-6 py-3 rounded-full font-bold text-sm shadow-lg">
                  PREMIUM
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Key Features Section - Full Width Images */}
      <div ref={featuresRef} className="py-16">
        {keyFeatures.map((feature, index) => (
          <div
            key={index}
            className={`py-20 ${
              index % 2 === 0
                ? 'bg-gradient-to-r from-cyan-950/10 to-blue-950/10'
                : 'bg-black'
            }`}
          >
            <div className="container mx-auto px-6">
              <div
                className={`grid lg:grid-cols-2 gap-12 items-center ${
                  index % 2 === 1 ? 'lg:grid-flow-dense' : ''
                }`}
              >
                {/* Text Content */}
                <div className={index % 2 === 1 ? 'lg:col-start-2' : ''}>
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-cyan-500/20 to-blue-600/20 rounded-2xl mb-6">
                    <feature.icon className="text-cyan-400" size={32} />
                  </div>
                  <h2 className="text-4xl font-bold text-white mb-4">
                    {feature.title}
                  </h2>
                  <div className="text-cyan-400 font-semibold mb-6 text-lg">
                    {feature.subtitle}
                  </div>
                  <p className="text-xl text-gray-300 leading-relaxed">
                    {feature.description}
                  </p>
                </div>

                {/* Visual Placeholder - Could be replaced with actual images */}
                <div className={index % 2 === 1 ? 'lg:col-start-1 lg:row-start-1' : ''}>
                  <div className="relative aspect-video bg-gradient-to-br from-cyan-950/20 to-blue-950/20 rounded-3xl overflow-hidden border border-white/10">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <feature.icon className="text-cyan-400/20" size={120} />
                    </div>
                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Specifications Section */}
      <div ref={specsRef} className="py-20 bg-gradient-to-b from-black to-gray-900">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Spécifications Techniques
            </h2>
            <p className="text-xl text-gray-400">
              Tout ce que vous devez savoir sur OMEGA MOUSSE
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
            {specifications.map((spec, index) => (
              <div
                key={index}
                className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-cyan-500/30 transition-all duration-300 group"
              >
                <div className="flex items-start gap-4">
                  <div className="bg-cyan-500/10 rounded-xl p-3 group-hover:bg-cyan-500/20 transition-colors">
                    <spec.icon className="text-cyan-400" size={24} />
                  </div>
                  <div className="flex-1">
                    <div className="text-gray-400 text-sm mb-2">{spec.label}</div>
                    <div className="text-white font-semibold">{spec.value}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Additional Info */}
          <div className="mt-12 p-8 bg-gradient-to-r from-cyan-950/20 to-blue-950/20 rounded-3xl border border-cyan-500/20 max-w-4xl mx-auto">
            <div className="flex items-start gap-4">
              <Info className="text-cyan-400 flex-shrink-0 mt-1" size={24} />
              <div>
                <h3 className="text-white font-bold text-lg mb-2">
                  Compatible avec tous vos équipements
                </h3>
                <p className="text-gray-300">
                  OMEGA MOUSSE fonctionne avec toutes les machines à mousse professionnelles :
                  canons à mousse, jets de mousse, tapis de mousse, et systèmes de piscine à mousse.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Comparison Section */}
      <div className="py-20 bg-black">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Pourquoi choisir OMEGA ?
            </h2>
            <p className="text-xl text-gray-400">
              Les chiffres parlent d'eux-mêmes
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="text-center p-8 bg-gradient-to-br from-cyan-950/20 to-blue-950/20 rounded-3xl border border-cyan-500/20">
              <div className="text-6xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent mb-4">
                +50%
              </div>
              <div className="text-white font-bold text-xl mb-2">
                Plus de Volume
              </div>
              <div className="text-gray-400">
                Comparé aux liquides standards
              </div>
            </div>

            <div className="text-center p-8 bg-gradient-to-br from-cyan-950/20 to-blue-950/20 rounded-3xl border border-cyan-500/20">
              <div className="text-6xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent mb-4">
                2x
              </div>
              <div className="text-white font-bold text-xl mb-2">
                Durée de Tenue
              </div>
              <div className="text-gray-400">
                Mousse stable plus longtemps
              </div>
            </div>

            <div className="text-center p-8 bg-gradient-to-br from-cyan-950/20 to-blue-950/20 rounded-3xl border border-cyan-500/20">
              <div className="text-6xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent mb-4">
                98%
              </div>
              <div className="text-white font-bold text-xl mb-2">
                Biodégradable
              </div>
              <div className="text-gray-400">
                Formule éco-responsable
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Related Products Section */}
      {relatedProducts.length > 0 && (
        <div className="py-20 bg-gradient-to-b from-gray-900 to-black">
          <div className="container mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                Produits Associés
              </h2>
              <p className="text-xl text-gray-400">
                Complétez votre équipement avec nos autres produits
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {relatedProducts.map((product) => (
                <Link
                  key={product.id}
                  to={`/produits/${product.id}`}
                  className="group bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-cyan-500/30 transition-all duration-300"
                >
                  <div className="relative mb-6 h-48 overflow-hidden rounded-xl bg-black/30">
                    <img
                      src={
                        product.image
                          ? product.image.startsWith('/')
                            ? product.image
                            : `/${product.image}`
                          : '/placeholder.png'
                      }
                      alt={product.name}
                      className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>

                  <h3 className="text-xl font-bold text-white mb-2 group-hover:text-cyan-400 transition-colors">
                    {product.name}
                  </h3>

                  <p className="text-gray-400 text-sm mb-4 line-clamp-2">
                    {product.description}
                  </p>

                  <div className="flex items-center justify-between">
                    <div className="text-2xl font-bold text-cyan-400">
                      {product.price.toFixed(2)}€
                      <span className="text-sm text-gray-400 ml-1">
                        {userType === 'pro' && product.price_ht ? 'HT' : 'TTC'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-cyan-400 group-hover:translate-x-1 transition-transform">
                      <span className="text-sm font-medium">Voir</span>
                      <ExternalLink size={16} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Final CTA */}
      <div className="py-20 bg-gradient-to-r from-cyan-950/20 to-blue-950/20 border-t border-white/10">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Prêt à créer l'événement ?
          </h2>
          <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
            Rejoignez les milliers d'événements qui font confiance à OMEGA MOUSSE
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={handleAddToCart}
              className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-8 py-4 rounded-full font-semibold hover:shadow-lg hover:shadow-cyan-500/25 transition-all duration-300 flex items-center justify-center gap-2"
            >
              <ShoppingCart size={20} />
              Ajouter au Panier
            </button>
            <Link
              to={`/produit/${mousseProduct.id}`}
              className="border-2 border-white/30 text-white px-8 py-4 rounded-full font-semibold hover:bg-white/10 hover:border-white/50 transition-all duration-300 flex items-center justify-center gap-2"
            >
              <ExternalLink size={20} />
              Voir la page du produit
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MousseDetailPage;
