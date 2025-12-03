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
  Volume2,
  Settings,
  Thermometer,
  ShoppingCart,
  ExternalLink,
  Beaker,
  ChevronDown,
  Info,
  Snowflake,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Product } from '../types';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

const HazerDetailPage = () => {
  const [activeSection, setActiveSection] = useState('hero');
  const [showStickyBar, setShowStickyBar] = useState(false);
  const [hazerProduct, setHazerProduct] = useState<Product | null>(null);
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
    loadHazerProduct();
    loadRelatedProducts();
  }, []);

  const loadHazerProduct = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .ilike('name', '%hazer%')
        .not('name', 'ilike', '%liquide%')
        .limit(1)
        .single();

      if (error) {
        console.error('Erreur chargement produit Hazer:', error);
        toast.error('Produit non trouvé en base de données');
      } else {
        setHazerProduct(data);
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
      const { data, error} = await supabase
        .from('products')
        .select('*')
        .or('name.ilike.%mousse%,name.ilike.%liquide%')
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
    if (!hazerProduct) {
      toast.error('Produit non disponible');
      return;
    }
    addToCart(hazerProduct);
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
      icon: Droplets,
      title: 'Brume Ultra-Fine',
      subtitle: 'Particules 0.2-0.3µ',
      description: 'Les plus petites particules du marché pour une brume homogène et persistante, sans traces ni résidus visibles',
    },
    {
      icon: Shield,
      title: 'Fluide Médical',
      subtitle: 'Qualité pharmaceutique',
      description: 'Huile alimentaire de qualité médicale : stérile, non toxique, non irritant, parfaitement sûr pour tous',
    },
    {
      icon: Zap,
      title: 'Ultra-Économique',
      subtitle: '90-95% d\'économies',
      description: 'Consommation réduite de 90-95% vs machines classiques, 20-30% vs MDG/DF50. ROI rapide garanti',
    },
    {
      icon: Clock,
      title: 'Persistance Inégalée',
      subtitle: '3-4 heures en salle',
      description: 'Suspension exceptionnelle de 3 à 4 heures en salle fermée, 0.2L de fluide suffisent pour 8h continu',
    },
  ];

  const specifications = [
    { label: 'Dimensions', value: 'L 41 × l 18 × H 37 cm', icon: Beaker },
    { label: 'Poids', value: '12 kg', icon: Shield },
    { label: 'Puissance', value: '1100W (2200W option)', icon: Zap },
    { label: 'Préchauffage', value: '4-6 minutes', icon: Clock },
    { label: 'Taille particules', value: '0.2-0.3 microns', icon: Droplets },
    { label: 'Débit fumée', value: '0-150 m³/min (290 option)', icon: Volume2 },
    { label: 'Suspension', value: '3-4 heures en salle', icon: Clock },
    { label: 'Garantie', value: '10 ans pièces + MO', icon: Award },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-black pt-24 flex items-center justify-center">
        <div className="text-white text-xl">Chargement...</div>
      </div>
    );
  }

  if (!hazerProduct) {
    return (
      <div className="min-h-screen bg-black pt-24 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Produit non trouvé</h2>
          <Link
            to="/produits"
            className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-full font-semibold"
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
                hazerProduct.image
                  ? hazerProduct.image.startsWith('/')
                    ? hazerProduct.image
                    : `/${hazerProduct.image}`
                  : '/Hazer-co2-generated.png'
              }
              alt={hazerProduct.name}
              className="w-12 h-12 object-contain"
            />
            <div>
              <h2 className="text-white font-bold">{hazerProduct.name}</h2>
              <div className="text-blue-400 font-semibold">
                {getDisplayPrice(hazerProduct).price.toFixed(2)}€{' '}
                <span className="text-sm text-gray-400">
                  {getDisplayPrice(hazerProduct).label}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleAddToCart}
              className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-full font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all"
            >
              Ajouter au Panier
            </button>
            <Link
              to={`/produit/${hazerProduct.id}`}
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
        <div className="absolute inset-0 bg-gradient-to-b from-blue-950/20 via-black to-black" />

        <div className="container mx-auto px-6 relative z-10">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-blue-400 transition-colors mb-8"
          >
            <ArrowLeft size={20} />
            Retour
          </Link>

          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="order-2 lg:order-1">
              <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-2 mb-6">
                <Snowflake className="text-blue-400" size={16} />
                <span className="text-blue-400 font-medium text-sm">
                  GÉNÉRATEUR PROFESSIONNEL
                </span>
              </div>

              <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
                {hazerProduct.name}
              </h1>

              <p className="text-xl text-gray-300 mb-8 leading-relaxed">
                {hazerProduct.long_description || hazerProduct.description}
              </p>

              <div className="mb-8 p-6 bg-gradient-to-r from-blue-950/30 to-purple-950/30 rounded-2xl border border-blue-500/20">
                <div className="text-sm text-gray-400 mb-2">Prix</div>
                <div className="text-5xl font-bold text-white mb-2">
                  {getDisplayPrice(hazerProduct).price.toFixed(2)}€
                  <span className="text-2xl text-gray-400 ml-2">
                    {getDisplayPrice(hazerProduct).label}
                  </span>
                </div>
                {getDisplayPrice(hazerProduct).taxInfo && (
                  <div className="text-gray-400 text-sm">
                    {getDisplayPrice(hazerProduct).taxInfo}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="text-center p-4 bg-white/5 rounded-xl">
                  <div className="text-3xl font-bold text-blue-400 mb-1">10</div>
                  <div className="text-xs text-gray-400">Ans Garantie</div>
                </div>
                <div className="text-center p-4 bg-white/5 rounded-xl">
                  <div className="text-3xl font-bold text-blue-400 mb-1">90%</div>
                  <div className="text-xs text-gray-400">Économies</div>
                </div>
                <div className="text-center p-4 bg-white/5 rounded-xl">
                  <div className="text-3xl font-bold text-blue-400 mb-1">0.2µ</div>
                  <div className="text-xs text-gray-400">Particules</div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={handleAddToCart}
                  className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 text-white px-8 py-4 rounded-full font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 flex items-center justify-center gap-2"
                >
                  <ShoppingCart size={20} />
                  Ajouter au Panier
                </button>
                <Link
                  to={`/produit/${hazerProduct.id}`}
                  className="flex-1 border-2 border-white/30 text-white px-8 py-4 rounded-full font-semibold hover:bg-white/10 hover:border-white/50 transition-all duration-300 text-center flex items-center justify-center gap-2"
                >
                  <ExternalLink size={20} />
                  Voir la page du produit
                </Link>
              </div>

              <div className="mt-12 text-center">
                <button
                  onClick={() => scrollToSection(featuresRef)}
                  className="inline-flex flex-col items-center gap-2 text-gray-400 hover:text-blue-400 transition-colors"
                >
                  <span className="text-sm">Découvrir plus</span>
                  <ChevronDown size={24} className="animate-bounce" />
                </button>
              </div>
            </div>

            <div className="order-1 lg:order-2 relative">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/30 to-purple-500/30 rounded-3xl blur-3xl" />

                <div className="relative bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-sm rounded-3xl p-8 border border-white/10">
                  <img
                    src={
                      hazerProduct.image
                        ? hazerProduct.image.startsWith('/')
                          ? hazerProduct.image
                          : `/${hazerProduct.image}`
                        : '/Hazer-co2-generated.png'
                    }
                    alt={hazerProduct.name}
                    className="w-full h-[500px] object-contain"
                    onLoad={() => setImageLoaded(true)}
                  />
                </div>

                <div className="absolute -top-4 -right-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-full font-bold text-sm shadow-lg">
                  PROFESSIONNEL
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Key Features Section */}
      <div ref={featuresRef} className="py-16">
        {keyFeatures.map((feature, index) => (
          <div
            key={index}
            className={`py-20 ${
              index % 2 === 0
                ? 'bg-gradient-to-r from-blue-950/10 to-purple-950/10'
                : 'bg-black'
            }`}
          >
            <div className="container mx-auto px-6">
              <div
                className={`grid lg:grid-cols-2 gap-12 items-center ${
                  index % 2 === 1 ? 'lg:grid-flow-dense' : ''
                }`}
              >
                <div className={index % 2 === 1 ? 'lg:col-start-2' : ''}>
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500/20 to-purple-600/20 rounded-2xl mb-6">
                    <feature.icon className="text-blue-400" size={32} />
                  </div>
                  <h2 className="text-4xl font-bold text-white mb-4">
                    {feature.title}
                  </h2>
                  <div className="text-blue-400 font-semibold mb-6 text-lg">
                    {feature.subtitle}
                  </div>
                  <p className="text-xl text-gray-300 leading-relaxed">
                    {feature.description}
                  </p>
                </div>

                <div className={index % 2 === 1 ? 'lg:col-start-1 lg:row-start-1' : ''}>
                  <div className="relative aspect-video bg-gradient-to-br from-blue-950/20 to-purple-950/20 rounded-3xl overflow-hidden border border-white/10">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <feature.icon className="text-blue-400/20" size={120} />
                    </div>
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
              Tout ce que vous devez savoir sur PRO HAZER CO²
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
            {specifications.map((spec, index) => (
              <div
                key={index}
                className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-blue-500/30 transition-all duration-300 group"
              >
                <div className="flex items-start gap-4">
                  <div className="bg-blue-500/10 rounded-xl p-3 group-hover:bg-blue-500/20 transition-colors">
                    <spec.icon className="text-blue-400" size={24} />
                  </div>
                  <div className="flex-1">
                    <div className="text-gray-400 text-sm mb-2">{spec.label}</div>
                    <div className="text-white font-semibold">{spec.value}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-12 p-8 bg-gradient-to-r from-blue-950/20 to-purple-950/20 rounded-3xl border border-blue-500/20 max-w-4xl mx-auto">
            <div className="flex items-start gap-4">
              <Info className="text-blue-400 flex-shrink-0 mt-1" size={24} />
              <div>
                <h3 className="text-white font-bold text-lg mb-2">
                  Livré prêt à fonctionner
                </h3>
                <p className="text-gray-300">
                  Votre PRO HAZER CO² est livré avec mano/détendeur, flexible, télécommande filaire 5m, clé de serrage et 2.5L de fluide pharmaceutique. Garantie 10 ans pièces et main d'œuvre.
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
            <div className="text-center p-8 bg-gradient-to-br from-blue-950/20 to-purple-950/20 rounded-3xl border border-blue-500/20">
              <div className="text-6xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent mb-4">
                90-95%
              </div>
              <div className="text-white font-bold text-xl mb-2">
                Moins de Fluide
              </div>
              <div className="text-gray-400">
                Comparé aux machines classiques
              </div>
            </div>

            <div className="text-center p-8 bg-gradient-to-br from-blue-950/20 to-purple-950/20 rounded-3xl border border-blue-500/20">
              <div className="text-6xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent mb-4">
                3-4h
              </div>
              <div className="text-white font-bold text-xl mb-2">
                Temps de Suspension
              </div>
              <div className="text-gray-400">
                En salle fermée
              </div>
            </div>

            <div className="text-center p-8 bg-gradient-to-br from-blue-950/20 to-purple-950/20 rounded-3xl border border-blue-500/20">
              <div className="text-6xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent mb-4">
                10
              </div>
              <div className="text-white font-bold text-xl mb-2">
                Ans de Garantie
              </div>
              <div className="text-gray-400">
                Pièces et main d'œuvre
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
                  className="group bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-blue-500/30 transition-all duration-300"
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

                  <h3 className="text-xl font-bold text-white mb-2 group-hover:text-blue-400 transition-colors">
                    {product.name}
                  </h3>

                  <p className="text-gray-400 text-sm mb-4 line-clamp-2">
                    {product.description}
                  </p>

                  <div className="flex items-center justify-between">
                    <div className="text-2xl font-bold text-blue-400">
                      {product.price.toFixed(2)}€
                      <span className="text-sm text-gray-400 ml-1">
                        {userType === 'pro' && product.price_ht ? 'HT' : 'TTC'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-blue-400 group-hover:translate-x-1 transition-transform">
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
      <div className="py-20 bg-gradient-to-r from-blue-950/20 to-purple-950/20 border-t border-white/10">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Prêt pour une brume professionnelle ?
          </h2>
          <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
            Rejoignez les plus grands théâtres, studios TV et salles de concert qui font confiance à OMEGA
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={handleAddToCart}
              className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-8 py-4 rounded-full font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 flex items-center justify-center gap-2"
            >
              <ShoppingCart size={20} />
              Ajouter au Panier
            </button>
            <Link
              to={`/produit/${hazerProduct.id}`}
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

export default HazerDetailPage;
