import React, { useState, useRef } from 'react';
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
  Settings,
  Thermometer,
  ShoppingCart,
  ExternalLink,
  ChevronDown,
  Info,
  Snowflake,
} from 'lucide-react';

const NeigeDetailPage = () => {
  const [activeSection, setActiveSection] = useState('hero');
  const [showStickyBar, setShowStickyBar] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const heroRef = useRef<HTMLDivElement>(null);
  const specsRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);

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

  React.useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (ref: React.RefObject<HTMLDivElement>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const keyFeatures = [
    {
      icon: Snowflake,
      title: 'Effet Neige Réaliste',
      subtitle: 'Particules fines et légères',
      description: 'Créez une atmosphère hivernale magique avec des particules qui imitent parfaitement la neige naturelle',
    },
    {
      icon: Clock,
      title: 'Dissipation Lente',
      subtitle: 'Effet durable',
      description: 'Les particules restent en suspension plus longtemps pour un effet visuel prolongé et immersif',
    },
    {
      icon: Shield,
      title: 'Non-Toxique',
      subtitle: 'Sécurité garantie',
      description: 'Formule entièrement non-toxique et sans danger pour les participants et lenvironnement',
    },
    {
      icon: Droplets,
      title: 'Résidu Minimal',
      subtitle: 'Nettoyage facile',
      description: 'Les particules sèchent rapidement et laissent un résidu minimal, facile à nettoyer après lévénement',
    },
  ];

  const specifications = [
    { label: 'Type', value: 'Liquide à neige', icon: Settings },
    { label: 'Taille particules', value: '0.5-2mm', icon: Snowflake },
    { label: 'Durée effet', value: '15-30 minutes', icon: Clock },
    { label: 'Température', value: '5°C à 35°C', icon: Thermometer },
    { label: 'pH', value: '6.5 - 7.5 (neutre)', icon: Shield },
    { label: 'Dilution', value: 'Prêt à l\'emploi', icon: Droplets },
    { label: 'Non-toxicité', value: 'Certifiée', icon: Award },
    { label: 'Résidu', value: 'Minimal', icon: Zap },
  ];

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
              src="/products/omega mousse.png"
              alt="OMEGA NEIGE"
              className="w-12 h-12 object-contain"
            />
            <div>
              <h2 className="text-white font-bold">OMEGA NEIGE</h2>
              <div className="text-blue-400 font-semibold">
                Bientôt disponible
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              disabled
              className="bg-gray-700 text-gray-400 px-6 py-3 rounded-full font-semibold cursor-not-allowed"
            >
              Bientôt disponible
            </button>
            <Link
              to="/fluid-system"
              className="border-2 border-white/30 text-white px-6 py-3 rounded-full font-semibold hover:bg-white/10 transition-all flex items-center justify-center gap-2"
            >
              <ArrowLeft size={20} />
              Retour à la gamme
            </Link>
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <div ref={heroRef} className="relative pt-32 pb-16 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-950/20 via-black to-black" />

        <div className="container mx-auto px-6 relative z-10">
          <Link
            to="/fluid-system"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-blue-400 transition-colors mb-8"
          >
            <ArrowLeft size={20} />
            Retour à la gamme Fluid System
          </Link>

          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="order-2 lg:order-1">
              <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-2 mb-6">
                <Snowflake className="text-blue-400" size={16} />
                <span className="text-blue-400 font-medium text-sm">
                  BIENTÔT DISPONIBLE
                </span>
              </div>

              <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
                OMEGA NEIGE
              </h1>

              <p className="text-xl text-gray-300 mb-8 leading-relaxed">
                Liquide à neige pour effets hivernaux réalistes. 
                Créez une atmosphère hivernale magique avec notre liquide à neige professionnel.
              </p>

              <div className="mb-8 p-6 bg-gradient-to-r from-blue-950/30 to-indigo-950/30 rounded-2xl border border-blue-500/20">
                <div className="text-sm text-gray-400 mb-2">Statut</div>
                <div className="text-3xl font-bold text-blue-400 mb-2">
                  Bientôt disponible
                </div>
                <div className="text-gray-400 text-sm">
                  Lancement prévu : T3 2024
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="text-center p-4 bg-white/5 rounded-xl">
                  <div className="text-3xl font-bold text-blue-400 mb-1">0.5-2</div>
                  <div className="text-xs text-gray-400">mm particules</div>
                </div>
                <div className="text-center p-4 bg-white/5 rounded-xl">
                  <div className="text-3xl font-bold text-blue-400 mb-1">30</div>
                  <div className="text-xs text-gray-400">min effet</div>
                </div>
                <div className="text-center p-4 bg-white/5 rounded-xl">
                  <div className="text-3xl font-bold text-blue-400 mb-1">100%</div>
                  <div className="text-xs text-gray-400">Non-toxique</div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  disabled
                  className="flex-1 bg-gray-700 text-gray-400 px-8 py-4 rounded-full font-semibold cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <ShoppingCart size={20} />
                  Bientôt disponible
                </button>
                <Link
                  to="/contact"
                  className="flex-1 border-2 border-blue-400/50 text-blue-400 px-8 py-4 rounded-full font-semibold hover:bg-blue-500/10 hover:border-blue-400 transition-all duration-300 text-center flex items-center justify-center gap-2"
                >
                  <ExternalLink size={20} />
                  Être notifié
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
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/30 to-indigo-500/30 rounded-3xl blur-3xl" />

                <div className="relative bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-sm rounded-3xl p-8 border border-white/10">
                  <img
                    src="/products/omega mousse.png"
                    alt="OMEGA NEIGE"
                    className="w-full h-[500px] object-contain"
                    onLoad={() => setImageLoaded(true)}
                  />
                </div>

                <div className="absolute -top-4 -right-4 bg-gradient-to-r from-blue-500 to-indigo-500 text-white px-6 py-3 rounded-full font-bold text-sm shadow-lg">
                  BIENTÔT DISPONIBLE
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
                ? 'bg-gradient-to-r from-blue-950/10 to-indigo-950/10'
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
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500/20 to-indigo-600/20 rounded-2xl mb-6">
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
                  <div className="relative aspect-video bg-gradient-to-br from-blue-950/20 to-indigo-950/20 rounded-3xl overflow-hidden border border-white/10">
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
              Tout ce que vous devez savoir sur OMEGA NEIGE
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

          <div className="mt-12 p-8 bg-gradient-to-r from-blue-950/20 to-indigo-950/20 rounded-3xl border border-blue-500/20 max-w-4xl mx-auto">
            <div className="flex items-start gap-4">
              <Info className="text-blue-400 flex-shrink-0 mt-1" size={24} />
              <div>
                <h3 className="text-white font-bold text-lg mb-2">
                  Lancement T3 2024
                </h3>
                <p className="text-gray-300">
                  OMEGA NEIGE est actuellement en phase finale de développement. 
                  Inscrivez-vous à notre newsletter pour être notifié de sa disponibilité 
                  et bénéficier d'une offre de lancement exclusive.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Final CTA */}
      <div className="py-20 bg-gradient-to-r from-blue-950/20 to-indigo-950/20 border-t border-white/10">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Intéressé par OMEGA NEIGE ?
          </h2>
          <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
            Soyez le premier informé de sa disponibilité et bénéficiez d'une offre de lancement exclusive
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/contact"
              className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-8 py-4 rounded-full font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 flex items-center justify-center gap-2"
            >
              <ExternalLink size={20} />
              Être notifié du lancement
            </Link>
            <Link
              to="/fluid-system"
              className="border-2 border-white/30 text-white px-8 py-4 rounded-full font-semibold hover:bg-white/10 hover:border-white/50 transition-all duration-300 flex items-center justify-center gap-2"
            >
              <ArrowLeft size={20} />
              Retour à la gamme
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NeigeDetailPage;