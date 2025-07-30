import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Music,
  Zap,
  Flame,
  Snowflake,
  Star,
  Mail,
  Phone,
  Calendar,
  Users,
  MapPin,
  Clock,
  Euro,
  CheckCircle,
  ArrowRight,
} from 'lucide-react';

const SpectaclesPage = () => {
  const features = [
    {
      icon: Music,
      title: 'DJ Professionnel',
      description:
        'Animation musicale adaptée à tous les âges avec playlist personnalisée',
    },
    {
      icon: Zap,
      title: 'Light-Jockey Expert',
      description:
        'Show lumière dynamique et immersif synchronisé avec la musique',
    },
    {
      icon: Star,
      title: 'Décor Scénique',
      description:
        'Mise en scène El Fuego Sagrador avec éléments visuels spectaculaires',
    },
    {
      icon: Flame,
      title: 'Flammes Motorisées',
      description:
        "Générateurs de flammes atteignant jusqu'à 10 mètres de hauteur",
    },
    {
      icon: Snowflake,
      title: 'Effets CO² Spectaculaires',
      description: 'Jets de CO² pour un impact visuel saisissant',
    },
  ];

  const applications = [
    'Fêtes de village et bals populaires',
    'Soirées estivales et festivals',
    'Événements municipaux',
    'Grands rassemblements',
    'Célébrations communales',
    "Soirées privées d'exception",
  ];

  const advantages = [
    'Concept clé en main',
    'Équipe professionnelle complète',
    'Matériel haut de gamme',
    'Effets spéciaux impressionnants',
    "Adaptable à tous types d'événements",
    'Expérience inoubliable garantie',
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24">
      <div className="container mx-auto px-6 py-12">
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

        {/* Hero Section */}
        <div className="text-center mb-16">
          <div className="inline-block bg-gradient-to-r from-yellow-400/20 to-orange-500/20 px-6 py-2 rounded-full mb-6">
            <span className="text-blue-400 font-semibold tracking-wider uppercase text-sm">
              Notre Prestation Populaire
            </span>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
            El Fuego Sagrador 🔥
          </h1>

          <p className="text-2xl text-gray-300 mb-4 max-w-3xl mx-auto">
            Un spectacle de feu, de lumière et de musique… inoubliable.
          </p>

          <p className="text-lg text-gray-400 mb-8 max-w-4xl mx-auto leading-relaxed">
            Transformez votre événement en véritable show immersif avec notre
            concept clé en main. Pensé pour les fêtes de village, bals
            populaires et soirées estivales.
          </p>

          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center mb-12">
            <div className="text-center">
              <div className="text-4xl font-bold text-blue-400 mb-2">
                5 200€ TTC
              </div>
              <div className="text-gray-400">Pack complet clé en main</div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid lg:grid-cols-2 gap-16 mb-16">
          {/* Image */}
          <div className="relative">
            <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-3xl p-8 border border-white/10">
              <img
                src="/El-Fuego-Sagrador.png"
                alt="El Fuego Sagrador - Spectacle de feu et lumière OMEGA"
                className="w-full h-auto object-contain rounded-2xl"
                style={{
                  filter: 'drop-shadow(0 20px 40px rgba(0, 0, 0, 0.4))',
                }}
              />
            </div>
          </div>

          {/* Content */}
          <div className="space-y-8">
            <div>
              <h2 className="text-3xl font-bold text-white mb-6">
                Ce que comprend le pack :
              </h2>

              <div className="space-y-4">
                {features.map((feature, index) => (
                  <div
                    key={index}
                    className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-xl p-6 border border-white/10 hover:border-yellow-400/30 transition-all duration-300"
                  >
                    <div className="flex items-start gap-4">
                      <div className="bg-gradient-to-br from-blue-500/20 to-purple-600/20 rounded-lg p-3 flex-shrink-0">
                        <feature.icon className="text-blue-400" size={24} />
                      </div>
                      <div>
                        <h3 className="text-white font-semibold mb-2">
                          {feature.title}
                        </h3>
                        <p className="text-gray-400 text-sm leading-relaxed">
                          {feature.description}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                to="/contact"
                className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-8 py-4 rounded-full font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 flex items-center justify-center gap-2"
              >
                <Mail size={20} />
                Prendre Contact
              </Link>
              <a
                href="tel:+33619918719"
                className="border-2 border-white/30 text-white px-8 py-4 rounded-full font-semibold hover:bg-white/10 hover:border-white/50 transition-all duration-300 flex items-center justify-center gap-2"
              >
                <Phone size={20} />
                06 19 91 87 19
              </a>
            </div>
          </div>
        </div>

        {/* Applications Section */}
        <div className="grid lg:grid-cols-2 gap-12 mb-16">
          <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-8 border border-white/10">
            <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
              <Calendar className="text-purple-400" size={28} />
              Événements Adaptés
            </h3>
            <div className="space-y-3">
              {applications.map((app, index) => (
                <div key={index} className="flex items-center gap-3">
                  <CheckCircle
                    className="text-green-400 flex-shrink-0"
                    size={20}
                  />
                  <span className="text-gray-300">{app}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-8 border border-white/10">
            <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
              <Star className="text-blue-400" size={28} />
              Nos Avantages
            </h3>
            <div className="space-y-3">
              {advantages.map((advantage, index) => (
                <div key={index} className="flex items-center gap-3">
                  <CheckCircle
                    className="text-green-400 flex-shrink-0"
                    size={20}
                  />
                  <span className="text-gray-300">{advantage}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Detailed Description */}
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-8 border border-white/10 mb-16">
          <h3 className="text-2xl font-bold text-white mb-6">
            Pourquoi choisir El Fuego Sagrador ?
          </h3>
          <div className="prose prose-invert max-w-none">
            <p className="text-gray-300 leading-relaxed mb-6">
              Vous cherchez une idée forte pour faire vibrer votre commune,
              dynamiser vos festivités ou marquer les esprits lors de votre
              prochaine soirée ? OMEGA vous propose une expérience unique avec
              le pack El Fuego Sagrador : une soirée spectaculaire, rythmée par
              la musique, les jeux de lumière, et des effets spéciaux
              impressionnants dignes des plus grandes scènes.
            </p>

            <p className="text-gray-300 leading-relaxed">
              Ce concept clé en main transforme votre événement en un véritable
              show immersif. Avec des options personnalisables selon vos envies,
              nous nous adaptons à votre vision pour créer un spectacle unique
              et mémorable.
            </p>
          </div>
        </div>

        {/* Contact Section */}
        <div className="text-center bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-8 border border-white/10">
          <h3 className="text-2xl font-bold text-white mb-4">
            Intéressé par El Fuego Sagrador ?
          </h3>
          <p className="text-gray-400 mb-8">
            Contactez-nous dès maintenant pour organiser votre spectacle
            inoubliable
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/contact"
              className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-8 py-4 rounded-full font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 flex items-center justify-center gap-2"
            >
              <Mail size={20} />
              Formulaire de Contact
            </Link>
            <a
              href="mailto:contact@captivision.fr"
              className="border-2 border-white/30 text-white px-8 py-4 rounded-full font-semibold hover:bg-white/10 hover:border-white/50 transition-all duration-300 flex items-center justify-center gap-2"
            >
              <Mail size={20} />
              contact@captivision.fr
            </a>
            <a
              href="tel:+33619918719"
              className="border-2 border-white/30 text-white px-8 py-4 rounded-full font-semibold hover:bg-white/10 hover:border-white/50 transition-all duration-300 flex items-center justify-center gap-2"
            >
              <Phone size={20} />
              06 19 91 87 19
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SpectaclesPage;
