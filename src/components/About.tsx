import React from 'react';
import { Award, Users, TrendingUp, Shield } from 'lucide-react';

const About = () => {
  const stats = [
    { icon: Award, label: 'Projets Réalisés', value: '500+' },
    { icon: Users, label: 'Clients Satisfaits', value: '200+' },
    { icon: TrendingUp, label: "Années d'Expérience", value: '10+' },
    { icon: Shield, label: 'Garantie Qualité', value: '100%' },
  ];

  return (
    <section
      id="about"
      className="py-20 bg-gradient-to-b from-gray-900 to-black"
    >
      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto text-center mb-16">
          <h2 className="text-5xl font-bold mb-6 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
            OMEGA depuis 1996
          </h2>
          <p className="text-xl text-gray-400 leading-relaxed">
            Depuis plus de 25 ans, OMEGA crée des spectacles inoubliables et
            développe des machines à effets spéciaux de haute qualité pour
            l'industrie du divertissement.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-16">
          {stats.map((stat, index) => (
            <div key={index} className="text-center group">
              <div className="bg-gradient-to-br from-blue-500/20 to-purple-600/20 backdrop-blur-md rounded-2xl p-6 mb-4 group-hover:scale-105 transition-transform duration-300">
                <stat.icon className="text-blue-400 mx-auto mb-4" size={40} />
                <div className="text-3xl font-bold text-white mb-2">
                  {stat.value}
                </div>
                <div className="text-gray-400 text-sm">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h3 className="text-3xl font-bold text-white mb-6">
              Une Expertise <span className="text-blue-400">Reconnue</span>
            </h3>
            <p className="text-gray-400 mb-6 leading-relaxed">
              OMEGA combine savoir-faire artisanal et innovation technologique
              pour créer des spectacles mémorables et fabriquer des machines à
              effets spéciaux de qualité professionnelle.
            </p>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                <span className="text-gray-300">Spectacles sur mesure</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                <span className="text-gray-300">
                  Machines fabriquées en France
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                <span className="text-gray-300">
                  Service après-vente premium
                </span>
              </div>
            </div>
          </div>
          <div className="relative">
            <div className="bg-gradient-to-br from-yellow-400/10 to-orange-500/10 backdrop-blur-md rounded-3xl p-8 border border-white/10">
              <div className="text-center">
                <div className="text-6xl font-bold bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent mb-4"></div>
                <div className="text-6xl font-bold bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent mb-4">
                  25+
                </div>
                <p className="text-white text-xl mb-2">Années d'Expérience</p>
                <p className="text-gray-400">
                  Un quart de siècle dédié à l'art du spectacle et à
                  l'innovation technique
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default About;
