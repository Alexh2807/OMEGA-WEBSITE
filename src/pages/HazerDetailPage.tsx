import React, { useState, useEffect } from 'react';
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
  Wrench,
  ShoppingCart,
  Phone,
  Snowflake,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Product } from '../types';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

const HazerDetailPage = () => {
  const [activeTab, setActiveTab] = useState('specifications');
  const [scrollY, setScrollY] = useState(0);
  const [hazerProduct, setHazerProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const { addToCart } = useCart();
  const { user, userType } = useAuth();

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    loadHazerProduct();
  }, []);

  const loadHazerProduct = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select(
          `
          *,
          category:categories(*)
        `
        )
        .ilike('name', '%hazer%')
        .not('name', 'ilike', '%liquide%')
        .not('name', 'ilike', '%liquid%')
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
  const specifications = [
    { label: 'Dimensions', value: 'L 41 × l 18 × H 37 cm' },
    { label: 'Poids', value: '12 kg' },
    { label: "Tension d'alimentation", value: '230 V – 50 Hz' },
    {
      label: 'Puissance échangeur',
      value: '1 100 W (standard) / 2 200 W (option)',
    },
    { label: 'Temps de préchauffage', value: '4 à 6 minutes' },
    { label: 'Taille des particules', value: '0,2 à 0,3 microns' },
    {
      label: 'Débit de fumée',
      value: '0 – 150 m³/min (standard) / 290 m³/min (2,2kW)',
    },
    { label: 'Temps de suspension', value: '3 à 4 heures en salle' },
    { label: 'Consommation fluide 100%', value: '≈ 2000 ml/h' },
    { label: 'Consommation 8h continu', value: '0,2L liquide + 1,5-2kg CO²' },
    { label: 'Type de fluide', value: 'Huile alimentaire qualité médicale' },
    { label: 'Réservoir interne', value: 'Standard 1,5L / Option 5L' },
    { label: 'Contrôle température', value: 'PID numérique microprocesseur' },
    { label: 'Classification', value: 'IP 65' },
    { label: 'Garantie', value: "10 ans pièces et main d'œuvre" },
    { label: 'Fabrication', value: 'Europe - Norme ISO 9001' },
  ];

  const advantages = [
    {
      icon: Droplets,
      title: 'Brume Ultra-Fine',
      description:
        'Particules de 0,2-0,3 microns, les plus petites du marché pour une brume homogène et persistante',
    },
    {
      icon: Shield,
      title: 'Fluide Médical',
      description:
        'Huile alimentaire qualité médicale : stérile, non toxique, non irritant, sans résidu huileux',
    },
    {
      icon: Volume2,
      title: 'Fonctionnement Silencieux',
      description:
        'Sans pompe ni compresseur, quasi-silencieux même à pleine puissance',
    },
    {
      icon: Zap,
      title: 'Efficacité Exceptionnelle',
      description:
        '90-95% moins de fluide que les hazers classiques, 20-30% moins que MDG/DF50',
    },
    {
      icon: Clock,
      title: 'Persistance Inégalée',
      description: 'Suspension 3-4h en salle, 0,2L de fluide pour 8h continu',
    },
    {
      icon: Settings,
      title: 'Auto-Nettoyage',
      description:
        'Système de purge automatique et corps de chauffe entièrement démontable',
    },
    {
      icon: Thermometer,
      title: 'Contrôle Numérique',
      description:
        'Régulateur PID microprocesseur avec affichage températures réelle et souhaitée',
    },
    {
      icon: Award,
      title: 'Qualité Professionnelle',
      description:
        'Fabrication européenne ISO 9001, garantie 10 ans, applications théâtre/TV/concert',
    },
  ];

  const included = [
    '1 Mano/détendeur calibré professionnel',
    '1 Flexible de raccordement',
    '1 Télécommande filaire 5 mètres',
    '1 Clé de serrage mano détendeur',
    '1 Bidon 2,5L de fluide spécial pharmaceutique',
  ];

  const options = [
    { name: 'Télécommande sans fil', price: 'Sur devis' },
    { name: 'Réservoir spécial 5 litres', price: 'Sur devis' },
    { name: 'Carte DMX (ON/OFF)', price: 'Sur devis' },
    { name: 'Régulateur DMX haute précision 0-100%', price: 'Sur devis' },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24 flex items-center justify-center">
        <div className="text-white text-xl">Chargement du produit...</div>
      </div>
    );
  }

  if (!hazerProduct) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-4">
            Produit non trouvé
          </h2>
          <p className="text-gray-400 mb-6">
            Le produit PRO HAZER CO² n'est pas disponible
          </p>
          <Link
            to="/produits"
            className="bg-gradient-to-r from-yellow-400 to-orange-500 text-black px-6 py-3 rounded-full font-semibold"
          >
            Voir tous nos produits
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24 overflow-hidden">
      {/* Parallax Background */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          transform: `translateY(${scrollY * 0.2}px)`,
          backgroundImage: `radial-gradient(circle at 30% 40%, rgba(251, 191, 36, 0.1) 0%, transparent 50%), radial-gradient(circle at 70% 60%, rgba(249, 115, 22, 0.1) 0%, transparent 50%)`,
        }}
      />

      <div className="container mx-auto px-6 py-12 relative z-10">
        {/* Breadcrumb */}
        <div className="mb-8">
          <Link
            to="/"
            className="flex items-center gap-2 text-gray-400 hover:text-yellow-400 transition-colors w-fit"
          >
            <ArrowLeft size={20} />
            Retour à l'accueil
          </Link>
        </div>

        {/* Hero Section with Parallax */}
        <div className="grid lg:grid-cols-2 gap-12 mb-16">
          <div
            className="relative"
            style={{
              transform: `translateY(${scrollY * -0.1}px)`,
            }}
          >
            <div className="relative">
              {/* Glow Effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-yellow-400/30 to-orange-500/30 rounded-3xl blur-3xl transform scale-110"></div>

              <div className="relative bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-3xl p-8 border border-white/10">
                <img
                  src={
                    hazerProduct.image
                      ? hazerProduct.image.startsWith('/')
                        ? hazerProduct.image
                        : `/${hazerProduct.image}`
                      : '/Hazer-co2-generated.png'
                  }
                  alt="PRO HAZER CO² OMEGA"
                  className="w-full h-96 object-contain rounded-2xl"
                />
              </div>

              {/* Floating Elements */}
              <div
                className="absolute -top-4 -left-4 w-20 h-20 bg-gradient-to-r from-yellow-400/20 to-orange-500/20 rounded-full blur-xl"
                style={{
                  transform: `translateY(${scrollY * 0.05}px) rotate(${scrollY * 0.1}deg)`,
                }}
              />
            </div>
          </div>

          <div
            style={{
              transform: `translateY(${scrollY * 0.05}px)`,
            }}
          >
            <div className="flex items-center gap-2 mb-4">
              <span className="bg-blue-400/20 text-blue-400 px-3 py-1 rounded-full text-sm font-medium">
                GÉNÉRATEUR PROFESSIONNEL
              </span>
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className="text-blue-400 fill-current"
                    size={16}
                  />
                ))}
              </div>
            </div>

            <h1 className="text-4xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              {hazerProduct.name}
            </h1>

            <p className="text-xl text-gray-300 mb-8 leading-relaxed">
              {hazerProduct.long_description || hazerProduct.description}
            </p>

            <div className="mb-8">
              <div className="text-4xl font-bold text-blue-400">
                {getDisplayPrice(hazerProduct).price.toFixed(2)}€
                <span className="text-lg text-gray-400 ml-2">
                  {getDisplayPrice(hazerProduct).label}
                </span>
              </div>
              {getDisplayPrice(hazerProduct).taxInfo && (
                <div className="text-gray-400 text-sm mt-1">
                  {getDisplayPrice(hazerProduct).taxInfo}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                <Award className="text-blue-400 mb-2" size={24} />
                <div className="text-white font-semibold">Garantie 10 ans</div>
                <div className="text-gray-400 text-sm">
                  Pièces et main d'œuvre
                </div>
              </div>
              <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                <Shield className="text-green-400 mb-2" size={24} />
                <div className="text-white font-semibold">ISO 9001</div>
                <div className="text-gray-400 text-sm">
                  Fabrication européenne
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={handleAddToCart}
                className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-8 py-4 rounded-full font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 flex items-center justify-center gap-2"
              >
                <ShoppingCart size={20} />
                Ajouter au Panier
              </button>
              <Link
                to="/contact"
                className="border-2 border-white/30 text-white px-8 py-4 rounded-full font-semibold hover:bg-white/10 hover:border-white/50 transition-all duration-300 text-center flex items-center justify-center gap-2"
              >
                <Phone size={20} />
                Demander une Démo
              </Link>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-8">
          <div className="flex flex-wrap gap-4 border-b border-white/20">
            {[
              { id: 'specifications', label: 'Spécifications' },
              { id: 'advantages', label: 'Avantages' },
              { id: 'included', label: 'Inclus' },
              { id: 'options', label: 'Options' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-3 font-semibold transition-colors ${
                  activeTab === tab.id
                    ? 'text-blue-400 border-b-2 border-blue-400'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-8 border border-white/10">
          {activeTab === 'specifications' && (
            <div>
              <h3 className="text-2xl font-bold text-white mb-6">
                Spécifications Techniques
              </h3>
              <div className="grid md:grid-cols-2 gap-6">
                {specifications.map((spec, index) => (
                  <div
                    key={index}
                    className="flex justify-between items-center p-4 bg-white/5 rounded-lg"
                  >
                    <span className="text-gray-300">{spec.label}</span>
                    <span className="text-white font-semibold">
                      {spec.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'advantages' && (
            <div>
              <h3 className="text-2xl font-bold text-white mb-6">
                Avantages Techniques
              </h3>
              <div className="grid md:grid-cols-2 gap-6">
                {advantages.map((advantage, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-4 p-4 bg-white/5 rounded-lg"
                  >
                    <div className="bg-gradient-to-br from-blue-500/20 to-purple-600/20 rounded-lg p-3 flex-shrink-0">
                      <advantage.icon className="text-blue-400" size={24} />
                    </div>
                    <div>
                      <h4 className="text-white font-semibold mb-2">
                        {advantage.title}
                      </h4>
                      <p className="text-gray-400 text-sm leading-relaxed">
                        {advantage.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'included' && (
            <div>
              <h3 className="text-2xl font-bold text-white mb-6">
                Livré "Prêt à Fonctionner"
              </h3>
              <div className="space-y-4">
                {included.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-4 bg-white/5 rounded-lg"
                  >
                    <Check className="text-green-400 flex-shrink-0" size={20} />
                    <span className="text-gray-300">{item}</span>
                  </div>
                ))}
              </div>
              <div className="mt-6 p-4 bg-gradient-to-r from-green-500/10 to-blue-500/10 rounded-lg border border-green-500/20">
                <p className="text-green-400 font-semibold mb-2">
                  ✓ Garantie Complète
                </p>
                <p className="text-gray-300 text-sm">
                  Toutes nos machines bénéficient d'une garantie pièces et main
                  d'œuvre de 10 ans.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'options' && (
            <div>
              <h3 className="text-2xl font-bold text-white mb-6">
                Options Disponibles
              </h3>
              <div className="space-y-4">
                {options.map((option, index) => (
                  <div
                    key={index}
                    className="flex justify-between items-center p-4 bg-white/5 rounded-lg"
                  >
                    <span className="text-gray-300">{option.name}</span>
                    <span className="text-blue-400 font-semibold">
                      {option.price}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-6 text-center">
                <Link
                  to="/contact"
                  className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-8 py-3 rounded-full font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 inline-block"
                >
                  Demander un Devis Personnalisé
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Comparison Section */}
        <div className="mt-16 bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-8 border border-white/10">
          <h3 className="text-2xl font-bold text-white mb-6 text-center">
            Pourquoi Choisir OMEGA ?
          </h3>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center p-6 bg-white/5 rounded-lg">
              <div className="text-3xl font-bold text-blue-400 mb-2">
                90-95%
              </div>
              <div className="text-white font-semibold mb-2">
                Moins de Fluide
              </div>
              <div className="text-gray-400 text-sm">
                Comparé aux machines Antari, Martin/Jem, Look
              </div>
            </div>
            <div className="text-center p-6 bg-white/5 rounded-lg">
              <div className="text-3xl font-bold text-blue-400 mb-2">
                20-30%
              </div>
              <div className="text-white font-semibold mb-2">
                Économie de Fluide
              </div>
              <div className="text-gray-400 text-sm">
                Comparé aux MDG et DF 50
              </div>
            </div>
            <div className="text-center p-6 bg-white/5 rounded-lg">
              <div className="text-3xl font-bold text-blue-400 mb-2">20%</div>
              <div className="text-white font-semibold mb-2">
                Prix Inférieur
              </div>
              <div className="text-gray-400 text-sm">
                Liquide moins cher que le fluide MDG
              </div>
            </div>
          </div>
        </div>

        {/* Produits Associés */}
        <div className="mt-16 bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-8 border border-white/10">
          <h3 className="text-2xl font-bold text-white mb-6">
            Produits Associés
          </h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Liquide Hazer Premium 5L */}
            <div className="bg-white/5 rounded-lg p-6 border border-white/10 hover:border-yellow-400/30 transition-all duration-300">
              <img
                src="/LiquideProHazer5L.png"
                alt="Liquide PRO HAZER Premium 5L"
                className="w-full h-32 object-contain mb-4 rounded-lg"
              />
              <h4 className="text-white font-semibold mb-2">
                Liquide PRO HAZER Premium 5L
              </h4>
              <p className="text-gray-400 text-sm mb-4">
                Fluide exclusif à base d'huile alimentaire de qualité médicale.
                Stérile, non toxique et non irritant.
              </p>
              <div className="flex items-center justify-between mb-4">
                <div className="text-blue-400 font-bold">
                  {userType === 'pro' ? '89.00€ HT' : '106.80€ TTC'}
                </div>
                <span className="bg-green-500/20 text-green-400 px-2 py-1 rounded-full text-xs">
                  En stock
                </span>
              </div>
              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <Check className="text-green-400" size={16} />
                  <span>Qualité médicale</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <Check className="text-green-400" size={16} />
                  <span>Ultra-économique</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <Check className="text-green-400" size={16} />
                  <span>Brume ultra-fine</span>
                </div>
              </div>
              <Link
                to="/produits"
                className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 text-center block"
              >
                Voir le produit
              </Link>
            </div>

            {/* Accessoires CO² */}
            <div className="bg-white/5 rounded-lg p-6 border border-white/10 hover:border-yellow-400/30 transition-all duration-300">
              <div className="w-full h-32 bg-gradient-to-br from-gray-700 to-gray-600 rounded-lg mb-4 flex items-center justify-center">
                <Snowflake className="text-blue-400" size={48} />
              </div>
              <h4 className="text-white font-semibold mb-2">
                Bouteille CO² 2kg
              </h4>
              <p className="text-gray-400 text-sm mb-4">
                Bouteille de CO² alimentaire pour votre machine PRO HAZER.
                Autonomie 8h en continu.
              </p>
              <div className="flex items-center justify-between mb-4">
                <div className="text-yellow-400 font-bold">Sur devis</div>
                <span className="bg-blue-500/20 text-blue-400 px-2 py-1 rounded-full text-xs">
                  Sur commande
                </span>
              </div>
              <Link
                to="/contact"
                className="w-full border-2 border-white/30 text-white py-2 rounded-lg font-semibold hover:bg-white/10 hover:border-white/50 transition-all duration-300 text-center block"
              >
                Demander un devis
              </Link>
            </div>

            {/* Télécommande sans fil */}
            <div className="bg-white/5 rounded-lg p-6 border border-white/10 hover:border-yellow-400/30 transition-all duration-300">
              <div className="w-full h-32 bg-gradient-to-br from-gray-700 to-gray-600 rounded-lg mb-4 flex items-center justify-center">
                <Settings className="text-purple-400" size={48} />
              </div>
              <h4 className="text-white font-semibold mb-2">
                Télécommande Sans Fil
              </h4>
              <p className="text-gray-400 text-sm mb-4">
                Contrôle à distance sans fil pour votre PRO HAZER. Portée
                jusqu'à 50 mètres.
              </p>
              <div className="flex items-center justify-between mb-4">
                <div className="text-yellow-400 font-bold">Sur devis</div>
                <span className="bg-green-500/20 text-green-400 px-2 py-1 rounded-full text-xs">
                  Disponible
                </span>
              </div>
              <Link
                to="/contact"
                className="w-full border-2 border-white/30 text-white py-2 rounded-lg font-semibold hover:bg-white/10 hover:border-white/50 transition-all duration-300 text-center block"
              >
                Demander un devis
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HazerDetailPage;
