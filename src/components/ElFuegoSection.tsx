import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Music,
  Zap,
  Flame,
  Snowflake,
  Star,
  Mail,
  Phone,
} from 'lucide-react';

const ElFuegoSection = () => {
  const features = [
    {
      icon: Music,
      title: 'DJ Professionnel',
      description: 'Animation musicale pour tous les âges',
    },
    {
      icon: Zap,
      title: 'Light-Jockey',
      description: 'Show lumière dynamique et immersif',
    },
    {
      icon: Star,
      title: 'Décor Scénique',
      description: 'Mise en scène El Fuego Sagrador',
    },
    {
      icon: Flame,
      title: 'Flammes Motorisées',
      description: "Générateurs jusqu'à 10 mètres de hauteur",
    },
    {
      icon: Snowflake,
      title: 'Effets CO²',
      description: 'Jets spectaculaires pour impact visuel',
    },
  ];

  return (
    <section className="py-20 bg-black">
      <div className="container mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-20 items-center">
          {/* Contenu à gauche */}
          <div className="space-y-8">
            <div className="space-y-4">
              <span className="bg-white text-black px-4 py-2 text-sm font-medium tracking-wider uppercase">
                Notre Prestation Populaire
              </span>

              <h2 className="text-5xl md:text-6xl font-light leading-tight text-white">
                El Fuego
                <br />
                <span className="font-bold">Sagrador</span>
                <span className="text-4xl">🔥</span>
              </h2>

              <div className="w-16 h-0.5 bg-white"></div>

              <p className="text-xl text-gray-300 leading-relaxed max-w-lg">
                Un spectacle de feu, de lumière et de musique… inoubliable.
              </p>

              <p className="text-gray-400 leading-relaxed">
                Transformez votre événement en véritable show immersif. Pensé
                pour les fêtes de village, bals populaires et soirées estivales.
              </p>
            </div>

            {/* Features Grid */}
            <div className="grid grid-cols-1 gap-4">
              {features.map((feature, index) => (
                <div
                  key={index}
                  className="flex items-start gap-4 p-4 border border-white/20 rounded-lg hover:border-white/30 transition-colors"
                >
                  <div className="bg-white text-black p-2 rounded-lg flex-shrink-0">
                    <feature.icon size={20} />
                  </div>
                  <div>
                    <h4 className="font-semibold text-white mb-1">
                      {feature.title}
                    </h4>
                    <p className="text-gray-400 text-sm">
                      {feature.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="space-y-4">
              <div className="mb-6">
                <div className="text-4xl font-bold text-white mb-2">
                  5 200€ TTC
                </div>
                <div className="text-gray-400 text-sm">
                  Pack complet clé en main
                </div>
              </div>

              <Link
                to="/spectacles"
                className="inline-flex items-center gap-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white px-8 py-4 font-semibold hover:shadow-2xl hover:shadow-blue-500/25 transition-all duration-300 group"
              >
                <span>EN SAVOIR PLUS</span>
                <ArrowRight
                  size={20}
                  className="group-hover:translate-x-1 transition-transform"
                />
              </Link>

              <div className="flex items-center gap-6 text-sm text-gray-400">
                <Link
                  to="/contact"
                  className="flex items-center gap-2 hover:text-white transition-colors"
                >
                  <Mail size={16} />
                  Prendre contact
                </Link>
                <a
                  href="mailto:contact@captivision.fr"
                  className="flex items-center gap-2 hover:text-white transition-colors"
                >
                  <Phone size={16} />
                  06 19 91 87 19
                </a>
              </div>
            </div>
          </div>

          {/* Image à droite */}
          <div className="relative">
            <div className="relative">
              <img
                src="/El-Fuego-Sagrador.png"
                alt="El Fuego Sagrador - Spectacle de feu et lumière OMEGA"
                className="w-full h-auto object-contain rounded-lg"
                style={{
                  filter: 'drop-shadow(0 20px 40px rgba(0, 0, 0, 0.4))',
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ElFuegoSection;
