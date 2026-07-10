import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Star, Droplets, Snowflake, Flame, Wind, Check } from 'lucide-react';

const FluidSystemPage = () => {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const products = [
    {
      id: 'omega-mousse',
      name: 'OMEGA MOUSSE PREMIUM',
      description: 'Le liquide à mousse événementielle le plus performant du marché',
      longDescription: 'Développé depuis 2005, perfectionné en 2023. 18 ans de R&D pour la mousse la plus dense et stable du marché. Formule éco-responsable à 98% biodégradable.',
      image: '/products/omega mousse.png',
      icon: Droplets,
      color: 'cyan',
      features: [
        'Mousse ultra-dense et stable',
        '98% biodégradable et éco-responsable',
        'Rendement exceptionnel : 500m³ par litre',
        'Tenue prolongée de 30-45 minutes',
        'Dilution 1:50 à 1:100',
        'Compatible avec toutes les machines'
      ],
      specs: [
        { label: 'Type', value: 'Liquide concentré' },
        { label: 'pH', value: '6.5 - 7.5 (neutre)' },
        { label: 'Dilution', value: '1:50 à 1:100' },
        { label: 'Biodégradabilité', value: '98% en 28 jours' }
      ],
      available: true,
      detailPage: '/produit-mousse'
    },
    {
      id: 'omega-neige',
      name: 'OMEGA NEIGE',
      description: 'Liquide à neige pour effets hivernaux réalistes',
      longDescription: 'Créez une atmosphère hivernale magique avec notre liquide à neige professionnel. Particules fines et légères pour une chute de neige réaliste et persistante.',
      image: '/products/omega mousse.png',
      icon: Snowflake,
      color: 'blue',
      features: [
        'Effet neige réaliste et naturel',
        'Particules fines et légères',
        'Dissipation lente pour effet durable',
        'Non-toxicité garantie',
        'Résidu minimal et facile à nettoyer',
        'Idéal pour scènes et événements'
      ],
      specs: [
        { label: 'Type', value: 'Liquide à neige' },
        { label: 'Particules', value: '0.5-2mm' },
        { label: 'Durée effet', value: '15-30 minutes' },
        { label: 'Température', value: '5°C à 35°C' }
      ],
      available: true,
      detailPage: '/neige-detail',
      comingSoon: true
    },
    {
      id: 'omega-fumee',
      name: 'OMEGA FUMÉE',
      description: 'Liquide fumigène pour effets atmosphériques',
      longDescription: 'Liquide fumigène haute performance pour créer des ambiances mystérieuses et dramatiques. Densité optimale avec dispersion contrôlée pour effets visuels percutants.',
      image: '/products/LiquideProHazer5L.png',
      icon: Wind,
      color: 'gray',
      features: [
        'Densité de fumée exceptionnelle',
        'Dispersion contrôlée et homogène',
        'Non-toxique et inodore',
        'Rapidité de diffusion',
        'Compatible avec toutes les machines',
        'Formule à faible résidu'
      ],
      specs: [
        { label: 'Type', value: 'Liquide fumigène' },
        { label: 'Viscosité', value: '20-25 cSt' },
        { label: 'Point éclair', value: '> 250°C' },
        { label: 'Densité', value: '0.95 g/cm³' }
      ],
      available: true,
      detailPage: '/fumee-detail',
      comingSoon: true
    },
    {
      id: 'omega-flamme',
      name: 'OMEGA FLAMME',
      description: 'Liquide pour effets de flamme spectaculaires',
      longDescription: 'Créez des effets de flamme impressionnants en toute sécurité. Notre formule spéciale offre des couleurs vives et une combustion contrôlée pour des spectacles inoubliables.',
      image: '/products/El-Fuego-Sagrador.png',
      icon: Flame,
      color: 'orange',
      features: [
        'Flammes jusqu\'à 10 mètres de hauteur',
        'Couleurs vives et intenses',
        'Combustion contrôlée et sécurisée',
        'Formule à faible résidu',
        'Idéal pour spectacles et événements',
        'Compatible avec nos générateurs'
      ],
      specs: [
        { label: 'Type', value: 'Liquide inflammable' },
        { label: 'Hauteur flamme', value: 'Jusqu\'à 10m' },
        { label: 'Durée combustion', value: 'Variable selon réglage' },
        { label: 'Sécurité', value: 'Certifiée NF' }
      ],
      available: true,
      detailPage: '/flamme-detail',
      comingSoon: true
    }
  ];

  const getColorClasses = (color: string) => {
    const colorMap: Record<string, { bg: string; border: string; text: string; from: string; to: string }> = {
      cyan: {
        bg: 'bg-cyan-500/10',
        border: 'border-cyan-500/20',
        text: 'text-cyan-400',
        from: 'from-cyan-500',
        to: 'to-blue-600'
      },
      blue: {
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/20',
        text: 'text-blue-400',
        from: 'from-blue-500',
        to: 'to-indigo-600'
      },
      gray: {
        bg: 'bg-gray-500/10',
        border: 'border-gray-500/20',
        text: 'text-gray-400',
        from: 'from-gray-500',
        to: 'to-gray-600'
      },
      orange: {
        bg: 'bg-orange-500/10',
        border: 'border-orange-500/20',
        text: 'text-orange-400',
        from: 'from-orange-500',
        to: 'to-red-600'
      }
    };
    return colorMap[color] || colorMap.cyan;
  };

  return (
    <div className="min-h-screen bg-black">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute w-96 h-96 bg-gradient-to-r from-purple-500/10 to-pink-600/10 rounded-full blur-3xl transition-all duration-1000"
          style={{
            left: mousePosition.x - 192,
            top: mousePosition.y - 192,
          }}
        />
        <div className="absolute inset-0 opacity-[0.03]">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255, 255, 255, 0.1) 1px, transparent 0)`,
              backgroundSize: '40px 40px',
            }}
          />
        </div>
      </div>

      {/* Header Section */}
      <section className="relative pt-32 pb-16 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-purple-950/20 via-black to-black" />
        
        <div className="container mx-auto px-6 relative z-10">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-purple-400 transition-colors mb-8"
          >
            <ArrowLeft size={20} />
            Retour à l'accueil
          </Link>

          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 rounded-full px-4 py-2 mb-6">
              <Star className="text-purple-400" size={16} />
              <span className="text-purple-400 font-medium text-sm">
                FLUID SYSTEM
              </span>
            </div>

            <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
              Gamme
              <br />
              <span className="bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
                Fluid System
              </span>
            </h1>

            <p className="text-xl text-gray-300 mb-12 leading-relaxed max-w-3xl mx-auto">
              Découvrez notre gamme complète de liquides professionnels pour effets spéciaux. 
              Conçus et fabriqués en France, nos produits allient performance, sécurité 
              et qualité professionnelle pour tous vos événements et spectacles.
            </p>

            <div className="grid md:grid-cols-3 gap-6 max-w-3xl mx-auto mb-12">
              <div className="text-center p-4 bg-white/5 rounded-xl">
                <div className="text-3xl font-bold text-purple-400 mb-1">1996</div>
                <div className="text-sm text-gray-400">Année de création</div>
              </div>
              <div className="text-center p-4 bg-white/5 rounded-xl">
                <div className="text-3xl font-bold text-purple-400 mb-1">4</div>
                <div className="text-sm text-gray-400">Types de produits</div>
              </div>
              <div className="text-center p-4 bg-white/5 rounded-xl">
                <div className="text-3xl font-bold text-purple-400 mb-1">100%</div>
                <div className="text-sm text-gray-400">Fabrication française</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Products Grid */}
      <section className="py-20 relative">
        <div className="container mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 max-w-6xl mx-auto">
            {products.map((product, index) => {
              const colors = getColorClasses(product.color);
              const Icon = product.icon;
              
              return (
                <div
                  key={product.id}
                  className={`group relative bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-sm rounded-3xl p-8 border border-white/10 hover:border-purple-500/30 transition-all duration-500 ${
                    product.comingSoon ? 'opacity-90' : ''
                  }`}
                >
                  {product.comingSoon && (
                    <div className="absolute -top-4 -right-4 bg-gradient-to-r from-orange-500 to-red-500 text-white px-6 py-3 rounded-full font-bold text-sm shadow-lg z-10">
                      BIENTÔT DISPONIBLE
                    </div>
                  )}

                  <div className="relative mb-8 h-64 overflow-hidden rounded-2xl bg-black/30">
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent z-10" />
                    <img
                      src={product.image}
                      alt={product.name}
                      className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
                    />
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${colors.bg} ${colors.text}`}>
                        <Icon size={24} />
                      </div>
                      <h3 className="text-2xl font-bold text-white group-hover:text-purple-400 transition-colors">
                        {product.name}
                      </h3>
                    </div>

                    <p className="text-gray-300 leading-relaxed">
                      {product.description}
                    </p>

                    <p className="text-gray-400 text-sm leading-relaxed">
                      {product.longDescription}
                    </p>

                    <div className="space-y-3">
                      <h4 className="text-white font-semibold flex items-center gap-2">
                        <Check size={18} className="text-purple-400" />
                        Caractéristiques principales
                      </h4>
                      <ul className="space-y-2">
                        {product.features.slice(0, 3).map((feature, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-gray-300 text-sm">
                            <div className="w-1.5 h-1.5 bg-purple-400 rounded-full mt-2 flex-shrink-0" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-700">
                      {product.specs.slice(0, 2).map((spec, idx) => (
                        <div key={idx} className="text-center">
                          <div className="text-xs text-gray-400 mb-1">{spec.label}</div>
                          <div className="text-sm text-white font-medium">{spec.value}</div>
                        </div>
                      ))}
                    </div>

                    <div className="pt-4">
                      {product.comingSoon ? (
                        <button
                          disabled
                          className="w-full bg-gray-700 text-gray-400 px-6 py-3 rounded-full font-semibold cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          Bientôt disponible
                        </button>
                      ) : (
                        <Link
                          to={product.detailPage}
                          className={`block w-full bg-gradient-to-r ${colors.from} ${colors.to} text-white px-6 py-3 rounded-full font-semibold hover:shadow-lg hover:shadow-purple-500/25 transition-all duration-300 text-center flex items-center justify-center gap-2 group`}
                        >
                          <span>Découvrir</span>
                          <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* CTA Section */}
          <div className="mt-20 text-center max-w-4xl mx-auto">
            <div className="p-8 bg-gradient-to-r from-purple-950/30 to-pink-950/30 rounded-3xl border border-purple-500/20">
              <h2 className="text-3xl font-bold text-white mb-4">
                Besoin de conseils pour choisir ?
              </h2>
              <p className="text-gray-300 mb-6">
                Notre équipe d'experts est à votre disposition pour vous aider à sélectionner 
                les liquides parfaits pour vos besoins spécifiques et vos équipements.
              </p>
              <Link
                to="/contact"
                className="inline-flex items-center gap-2 border-2 border-purple-400/50 text-white px-8 py-3 rounded-full font-semibold hover:bg-purple-500/10 hover:border-purple-400 transition-all duration-300"
              >
                Contacter nos experts
                <ArrowRight size={20} />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default FluidSystemPage;