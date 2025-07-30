import React from 'react';
import {
  Music,
  Zap,
  Droplets,
  Lightbulb,
  Settings,
  Headphones,
} from 'lucide-react';
import { Link } from 'react-router-dom';

const Services = () => {
  const services = [
    {
      icon: Music,
      title: 'Spectacles DJ',
      description:
        'Animation musicale professionnelle avec DJ expérimenté pour tous vos événements',
      features: ['Mariages', 'Soirées privées', 'Événements corporate'],
      link: '/spectacles',
    },
    {
      icon: Lightbulb,
      title: 'Shows Lumière',
      description:
        'Éclairages spectaculaires et jeux de lumière synchronisés pour sublimer vos événements',
      features: ['LED professionnel', 'Lasers', 'Stroboscopes'],
      link: '/spectacles',
    },
    {
      icon: Zap,
      title: 'Effets Spéciaux',
      description:
        'Effets pyrotechniques et spéciaux pour des moments inoubliables',
      features: ['Fumée', 'Confettis', 'Flammes froides'],
      link: '/spectacles',
    },
    {
      icon: Droplets,
      title: 'Soirées Mousse',
      description:
        'Animation unique avec mousse de qualité premium pour une ambiance festive',
      features: [
        'Mousse biodégradable',
        'Machines haute capacité',
        'Sécurité garantie',
      ],
      link: '/spectacles',
    },
    {
      icon: Settings,
      title: 'Machines Hazer CO²',
      description:
        'Fabrication de machines à fumée professionnelles haute performance',
      features: ['Fabrication française', 'Garantie 2 ans', 'SAV premium'],
      link: '/machines',
    },
    {
      icon: Headphones,
      title: 'Produits à Mousse',
      description:
        'Gamme complète de produits à mousse pour machines professionnelles',
      features: ['Formules exclusives', 'Biodégradable', 'Longue durée'],
      link: '/produits',
    },
  ];

  return (
    <section id="services" className="py-20 bg-black">
      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto text-center mb-16">
          <h2 className="text-5xl font-bold mb-6 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
            Nos Services
          </h2>
          <p className="text-xl text-gray-400 leading-relaxed">
            OMEGA vous propose une gamme complète de services pour vos
            événements et des produits techniques de haute qualité.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {services.map((service, index) => (
            <Link
              key={index}
              to={service.link}
              className="group relative block"
            >
              <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-8 border border-white/10 hover:border-yellow-400/30 transition-all duration-500 hover:transform hover:-translate-y-2 hover:shadow-2xl hover:shadow-yellow-400/10">
                <div className="bg-gradient-to-br from-yellow-400/20 to-orange-500/20 rounded-xl p-4 w-fit mb-6 group-hover:scale-110 transition-transform duration-300">
                  <service.icon className="text-yellow-400" size={32} />
                </div>

                <h3 className="text-2xl font-bold text-white mb-4">
                  {service.title}
                </h3>
                <p className="text-gray-400 mb-6 leading-relaxed">
                  {service.description}
                </p>

                <div className="space-y-2">
                  {service.features.map((feature, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full"></div>
                      <span className="text-gray-300 text-sm">{feature}</span>
                    </div>
                  ))}
                </div>

                <div className="absolute inset-0 bg-gradient-to-br from-yellow-400/5 to-orange-500/5 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Services;
