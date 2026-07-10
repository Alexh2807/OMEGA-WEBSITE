import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Sparkles, Droplets, Shield, Zap, Clock, Check } from 'lucide-react';

const SmokeSystemPage = () => {
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
      id: 'pro-hazer-co2',
      name: 'PRO HAZER CO²',
      description: 'Technologie de brouillard révolutionnaire pour des effets atmosphériques inégalés',
      longDescription: 'Le générateur de brume professionnel le plus avancé du marché. Consommation de fluide réduite de 90%, particules ultra-fines de 0.2-0.3µ pour une brume homogène et persistante.',
      image: '/products/HazerCO2remake.png',
      features: [
        '90% de consommation de fluide en moins',
        'Jusqu\'à 40 heures de fonctionnement continu par litre',
        'Particules ultra-fines (0.2-0.3µ)',
        'Garantie 10 ans pièces et main d\'œuvre',
        'Fluide médical qualité pharmaceutique',
        '3-4 heures de suspension en salle fermée'
      ],
      specs: [
        { label: 'Dimensions', value: 'L 41 × l 18 × H 37 cm' },
        { label: 'Poids', value: '12 kg' },
        { label: 'Puissance', value: '1100W (2200W option)' },
        { label: 'Préchauffage', value: '4-6 minutes' }
      ],
      available: true,
      detailPage: '/machine-hazer'
    },
    {
      id: 'pro-smoke-700',
      name: 'PRO SMOKE 700',
      description: 'Machine à fumée compacte et performante pour professionnels',
      longDescription: 'La solution idéale pour les petites et moyennes productions. Offre une densité de fumée exceptionnelle avec un encombrement réduit, parfait pour les scènes, les studios et les événements.',
      image: '/products/HazerCO2test.png',
      features: [
        'Densité de fumée exceptionnelle',
        'Format compact et portable',
        'Contrôle DMX intégré',
        'Réservoir de fluide de grande capacité',
        'Chauffage rapide',
        'Faible consommation énergétique'
      ],
      specs: [
        { label: 'Dimensions', value: 'L 35 × l 25 × H 20 cm' },
        { label: 'Poids', value: '8 kg' },
        { label: 'Puissance', value: '700W' },
        { label: 'Préchauffage', value: '3-5 minutes' }
      ],
      available: true,
      detailPage: '/smoke-700-detail',
      comingSoon: true
    }
  ];

  return (
    <div className="min-h-screen bg-black">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute w-96 h-96 bg-gradient-to-r from-blue-500/10 to-purple-600/10 rounded-full blur-3xl transition-all duration-1000"
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
        <div className="absolute inset-0 bg-gradient-to-b from-blue-950/20 via-black to-black" />
        
        <div className="container mx-auto px-6 relative z-10">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-blue-400 transition-colors mb-8"
          >
            <ArrowLeft size={20} />
            Retour à l'accueil
          </Link>

          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-2 mb-6">
              <Sparkles className="text-blue-400" size={16} />
              <span className="text-blue-400 font-medium text-sm">
                SMOKE SYSTEM
              </span>
            </div>

            <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
              Gamme
              <br />
              <span className="bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                Smoke System
              </span>
            </h1>

            <p className="text-xl text-gray-300 mb-12 leading-relaxed max-w-3xl mx-auto">
              Découvrez notre gamme de machines à fumée professionnelles, 
              conçues et fabriquées en France depuis 1996. 
              Alliant technologie de pointe, fiabilité et performance exceptionnelle.
            </p>

            <div className="grid md:grid-cols-3 gap-6 max-w-3xl mx-auto mb-12">
              <div className="text-center p-4 bg-white/5 rounded-xl">
                <div className="text-3xl font-bold text-blue-400 mb-1">90%</div>
                <div className="text-sm text-gray-400">Économies de fluide</div>
              </div>
              <div className="text-center p-4 bg-white/5 rounded-xl">
                <div className="text-3xl font-bold text-blue-400 mb-1">10</div>
                <div className="text-sm text-gray-400">Ans de garantie</div>
              </div>
              <div className="text-center p-4 bg-white/5 rounded-xl">
                <div className="text-3xl font-bold text-blue-400 mb-1">0.2µ</div>
                <div className="text-sm text-gray-400">Taille particules</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Products Grid */}
      <section className="py-20 relative">
        <div className="container mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 max-w-6xl mx-auto">
            {products.map((product, index) => (
              <div
                key={product.id}
                className={`group relative bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-sm rounded-3xl p-8 border border-white/10 hover:border-blue-500/30 transition-all duration-500 ${
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
                  <h3 className="text-3xl font-bold text-white group-hover:text-blue-400 transition-colors">
                    {product.name}
                  </h3>

                  <p className="text-gray-300 leading-relaxed">
                    {product.description}
                  </p>

                  <p className="text-gray-400 text-sm leading-relaxed">
                    {product.longDescription}
                  </p>

                  <div className="space-y-3">
                    <h4 className="text-white font-semibold flex items-center gap-2">
                      <Check size={18} className="text-blue-400" />
                      Caractéristiques principales
                    </h4>
                    <ul className="space-y-2">
                      {product.features.slice(0, 3).map((feature, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-gray-300 text-sm">
                          <div className="w-1.5 h-1.5 bg-blue-400 rounded-full mt-2 flex-shrink-0" />
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
                        className="block w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-full font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 text-center flex items-center justify-center gap-2 group"
                      >
                        <span>Découvrir</span>
                        <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* CTA Section */}
          <div className="mt-20 text-center max-w-4xl mx-auto">
            <div className="p-8 bg-gradient-to-r from-blue-950/30 to-purple-950/30 rounded-3xl border border-blue-500/20">
              <h2 className="text-3xl font-bold text-white mb-4">
                Besoin de conseils pour choisir ?
              </h2>
              <p className="text-gray-300 mb-6">
                Notre équipe d'experts est à votre disposition pour vous aider à sélectionner 
                la machine parfaite pour vos besoins spécifiques.
              </p>
              <Link
                to="/contact"
                className="inline-flex items-center gap-2 border-2 border-blue-400/50 text-white px-8 py-3 rounded-full font-semibold hover:bg-blue-500/10 hover:border-blue-400 transition-all duration-300"
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

export default SmokeSystemPage;