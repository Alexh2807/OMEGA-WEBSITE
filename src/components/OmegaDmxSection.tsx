import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Layers, Ban, Save, CircuitBoard } from 'lucide-react';

const OmegaDmxSection = () => {
  const points = [
    { icon: Layers, title: '2 univers DMX', description: '1024 canaux pilotés en simultané' },
    { icon: Ban, title: 'Sans abonnement', description: 'Vous achetez, vous gardez — logiciel inclus' },
    { icon: CircuitBoard, title: "Sans fil jusqu'à 1 km", description: "Jusqu'à 300 lyres avec les cartes OMEGA (en option)" },
    { icon: Save, title: 'Zéro perte', description: 'Sauvegarde interne automatique des shows' },
  ];

  return (
    <section className="py-16 bg-black overflow-hidden">
      <div className="container mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Image à gauche */}
          <div className="relative order-1">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 to-purple-600/10 rounded-3xl blur-3xl opacity-60" />
            <div className="relative bg-black/60 backdrop-blur-sm rounded-3xl p-8 border border-white/5">
              <img
                src="/products/OMEGA-DMX-Interface.png"
                alt="OMEGA DMX Interface - boîtier de pilotage DMX sans fil"
                className="w-full h-auto object-contain"
                style={{ filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.5))' }}
              />
            </div>
          </div>

          {/* Contenu à droite */}
          <div className="order-2 space-y-6">
            <span className="inline-block bg-blue-500/10 border border-blue-500/20 text-blue-400 px-4 py-2 text-sm font-medium tracking-wider uppercase rounded-full">
              Nouveau · Notre boîtier DMX
            </span>

            <h2 className="text-5xl md:text-6xl font-light leading-tight text-white">
              OMEGA DMX
              <br />
              <span className="font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                Interface
              </span>
            </h2>

            <div className="w-16 h-0.5 bg-blue-500" />

            <p className="text-xl text-gray-300 leading-relaxed max-w-lg">
              Le boîtier qui pilote 2 univers DMX — 1024 canaux — sans le moindre
              abonnement, et qui passe en sans fil jusqu'à 1 km avec les cartes
              réceptrices OMEGA.
            </p>

            {/* Points clés */}
            <div className="grid sm:grid-cols-2 gap-4">
              {points.map((p, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 p-4 bg-white/[0.02] border border-white/5 rounded-xl hover:border-blue-500/30 hover:bg-white/[0.04] transition-colors"
                >
                  <div className="bg-gradient-to-br from-blue-500/20 to-purple-600/20 text-blue-400 p-2 rounded-lg flex-shrink-0">
                    <p.icon size={20} />
                  </div>
                  <div>
                    <h4 className="font-semibold text-white mb-1">{p.title}</h4>
                    <p className="text-gray-400 text-sm">{p.description}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Prix + CTA */}
            <div className="pt-2">
              <div className="text-4xl font-bold text-white mb-1">429€ TTC</div>
              <div className="text-gray-400 text-sm mb-5">
                Logiciel inclus · sans abonnement
              </div>

              <Link
                to="/omega-dmx-interface"
                className="inline-flex items-center gap-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white px-8 py-4 rounded-full font-semibold hover:shadow-2xl hover:shadow-blue-500/25 transition-all duration-300 group"
              >
                <span>DÉCOUVRIR LE BOÎTIER</span>
                <ArrowRight
                  size={20}
                  className="group-hover:translate-x-1 transition-transform"
                />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default OmegaDmxSection;
