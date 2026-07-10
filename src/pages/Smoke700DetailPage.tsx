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
  Volume2,
  Settings,
  Thermometer,
  ShoppingCart,
  ExternalLink,
  ChevronDown,
  Info,
  Wind,
} from 'lucide-react';

const Smoke700DetailPage = () => {
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
      icon: Wind,
      title: 'Densité Exceptionnelle',
      subtitle: 'Fumée épaisse et rapide',
      description: 'Production de fumée dense et rapide grâce à sa puissance de 700W, idéal pour les scènes de théâtre et les événements live',
    },
    {
      icon: Clock,
      title: 'Chauffage Rapide',
      subtitle: 'Prêt en 3-5 minutes',
      description: 'Temps de préchauffage optimisé pour une utilisation immédiate, parfait pour les événements avec des contraintes de temps',
    },
    {
      icon: Settings,
      title: 'Contrôle DMX Intégré',
      subtitle: 'Commande à distance',
      description: 'Interface DMX complète pour une intégration parfaite dans les installations professionnelles et les systèmes de contrôle',
    },
    {
      icon: Droplets,
      title: 'Réservoir Capacité',
      subtitle: 'Autonomie prolongée',
      description: 'Grand réservoir de fluide pour une utilisation prolongée sans interruption, idéal pour les longues sessions',
    },
  ];

  const specifications = [
    { label: 'Dimensions', value: 'L 35 × l 25 × H 20 cm', icon: Settings },
    { label: 'Poids', value: '8 kg', icon: Shield },
    { label: 'Puissance', value: '700W', icon: Zap },
    { label: 'Préchauffage', value: '3-5 minutes', icon: Clock },
    { label: 'Capacité réservoir', value: '2.5L', icon: Droplets },
    { label: 'Débit fumée', value: '150 m³/min', icon: Volume2 },
    { label: 'Contrôle', value: 'DMX intégré', icon: Settings },
    { label: 'Garantie', value: '5 ans pièces + MO', icon: Award },
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
              src="/products/HazerCO2test.png"
              alt="PRO SMOKE 700"
              className="w-12 h-12 object-contain"
            />
            <div>
              <h2 className="text-white font-bold">PRO SMOKE 700</h2>
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
              to="/smoke-system"
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
            to="/smoke-system"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-blue-400 transition-colors mb-8"
          >
            <ArrowLeft size={20} />
            Retour à la gamme Smoke System
          </Link>

          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="order-2 lg:order-1">
              <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-full px-4 py-2 mb-6">
                <Wind className="text-orange-400" size={16} />
                <span className="text-orange-400 font-medium text-sm">
                  BIENTÔT DISPONIBLE
                </span>
              </div>

              <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
                PRO SMOKE 700
              </h1>

              <p className="text-xl text-gray-300 mb-8 leading-relaxed">
                La machine à fumée compacte et performante pour professionnels. 
                Idéale pour les petites et moyennes productions, offrant une densité 
                de fumée exceptionnelle avec un encombrement réduit.
              </p>

              <div className="mb-8 p-6 bg-gradient-to-r from-orange-950/30 to-red-950/30 rounded-2xl border border-orange-500/20">
                <div className="text-sm text-gray-400 mb-2">Statut</div>
                <div className="text-3xl font-bold text-orange-400 mb-2">
                  Bientôt disponible
                </div>
                <div className="text-gray-400 text-sm">
                  Lancement prévu : T2 2024
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="text-center p-4 bg-white/5 rounded-xl">
                  <div className="text-3xl font-bold text-orange-400 mb-1">700W</div>
                  <div className="text-xs text-gray-400">Puissance</div>
                </div>
                <div className="text-center p-4 bg-white/5 rounded-xl">
                  <div className="text-3xl font-bold text-orange-400 mb-1">8kg</div>
                  <div className="text-xs text-gray-400">Poids</div>
                </div>
                <div className="text-center p-4 bg-white/5 rounded-xl">
                  <div className="text-3xl font-bold text-orange-400 mb-1">5</div>
                  <div className="text-xs text-gray-400">Ans Garantie</div>
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
                  className="flex-1 border-2 border-orange-400/50 text-orange-400 px-8 py-4 rounded-full font-semibold hover:bg-orange-500/10 hover:border-orange-400 transition-all duration-300 text-center flex items-center justify-center gap-2"
                >
                  <ExternalLink size={20} />
                  Être notifié
                </Link>
              </div>

              <div className="mt-12 text-center">
                <button
                  onClick={() => scrollToSection(featuresRef)}
                  className="inline-flex flex-col items-center gap-2 text-gray-400 hover:text-orange-400 transition-colors"
                >
                  <span className="text-sm">Découvrir plus</span>
                  <ChevronDown size={24} className="animate-bounce" />
                </button>
              </div>
            </div>

            <div className="order-1 lg:order-2 relative">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-orange-500/30 to-red-500/30 rounded-3xl blur-3xl" />

                <div className="relative bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-sm rounded-3xl p-8 border border-white/10">
                  <img
                    src="/products/HazerCO2test.png"
                    alt="PRO SMOKE 700"
                    className="w-full h-[500px] object-contain"
                    onLoad={() => setImageLoaded(true)}
                  />
                </div>

                <div className="absolute -top-4 -right-4 bg-gradient-to-r from-orange-500 to-red-500 text-white px-6 py-3 rounded-full font-bold text-sm shadow-lg">
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
                ? 'bg-gradient-to-r from-orange-950/10 to-red-950/10'
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
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-orange-500/20 to-red-600/20 rounded-2xl mb-6">
                    <feature.icon className="text-orange-400" size={32} />
                  </div>
                  <h2 className="text-4xl font-bold text-white mb-4">
                    {feature.title}
                  </h2>
                  <div className="text-orange-400 font-semibold mb-6 text-lg">
                    {feature.subtitle}
                  </div>
                  <p className="text-xl text-gray-300 leading-relaxed">
                    {feature.description}
                  </p>
                </div>

                <div className={index % 2 === 1 ? 'lg:col-start-1 lg:row-start-1' : ''}>
                  <div className="relative aspect-video bg-gradient-to-br from-orange-950/20 to-red-950/20 rounded-3xl overflow-hidden border border-white/10">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <feature.icon className="text-orange-400/20" size={120} />
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
              Tout ce que vous devez savoir sur PRO SMOKE 700
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
            {specifications.map((spec, index) => (
              <div
                key={index}
                className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-orange-500/30 transition-all duration-300 group"
              >
                <div className="flex items-start gap-4">
                  <div className="bg-orange-500/10 rounded-xl p-3 group-hover:bg-orange-500/20 transition-colors">
                    <spec.icon className="text-orange-400" size={24} />
                  </div>
                  <div className="flex-1">
                    <div className="text-gray-400 text-sm mb-2">{spec.label}</div>
                    <div className="text-white font-semibold">{spec.value}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-12 p-8 bg-gradient-to-r from-orange-950/20 to-red-950/20 rounded-3xl border border-orange-500/20 max-w-4xl mx-auto">
            <div className="flex items-start gap-4">
              <Info className="text-orange-400 flex-shrink-0 mt-1" size={24} />
              <div>
                <h3 className="text-white font-bold text-lg mb-2">
                  Lancement T2 2024
                </h3>
                <p className="text-gray-300">
                  Le PRO SMOKE 700 est actuellement en phase finale de développement. 
                  Inscrivez-vous à notre newsletter pour être notifié de sa disponibilité 
                  et bénéficier d'une offre de lancement exclusive.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Final CTA */}
      <div className="py-20 bg-gradient-to-r from-orange-950/20 to-red-950/20 border-t border-white/10">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Intéressé par le PRO SMOKE 700 ?
          </h2>
          <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
            Soyez le premier informé de sa disponibilité et bénéficiez d'une offre de lancement exclusive
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/contact"
              className="bg-gradient-to-r from-orange-500 to-red-600 text-white px-8 py-4 rounded-full font-semibold hover:shadow-lg hover:shadow-orange-500/25 transition-all duration-300 flex items-center justify-center gap-2"
            >
              <ExternalLink size={20} />
              Être notifié du lancement
            </Link>
            <Link
              to="/smoke-system"
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

export default Smoke700DetailPage;