import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Star, Sparkles, ArrowRight, Radio } from 'lucide-react';

const Hero = () => {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <section
      id="home"
      className="min-h-screen relative overflow-hidden bg-gradient-to-br from-black via-gray-900 to-black flex items-center"
    >
      {/* Animated Background */}
      <div className="absolute inset-0">
        <div
          className={`absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="none" fill-rule="evenodd"%3E%3Cg fill="%23ffffff" fill-opacity="0.05"%3E%3Ccircle cx="7" cy="7" r="1"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-30`}
        ></div>
        <div
          className="absolute w-96 h-96 bg-gradient-to-r from-blue-500/20 to-purple-600/20 rounded-full blur-3xl transition-all duration-1000"
          style={{
            left: mousePosition.x - 192,
            top: mousePosition.y - 192,
          }}
        ></div>
      </div>

      <div className="container mx-auto px-6 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex justify-center mb-6"></div>

          <div className="mb-6">
            <img
              src="/products/logo-omega-hq-transparent.webp"
              alt="OMEGA"
              className="h-32 md:h-40 mx-auto"
            />
          </div>

          <p className="text-2xl text-gray-300 mb-2 font-semibold">
            Depuis 1996
          </p>
          <p className="text-lg text-gray-400 mb-12 max-w-2xl mx-auto leading-relaxed">
            Fabricant français de systèmes professionnels pour spectacles et événements
          </p>

          {/* Nos Gammes Phares */}
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-white mb-8">
              Nos Gammes <span className="text-blue-400">OMEGA</span>
            </h2>
            <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {/* Smoke System */}
              <Link
                to="/smoke-system"
                className="group bg-gradient-to-br from-gray-900/80 to-gray-800/80 backdrop-blur-md rounded-2xl p-8 border border-white/10 hover:border-blue-400/50 transition-all duration-500 transform hover:-translate-y-2 hover:shadow-2xl hover:shadow-blue-500/25"
              >
                <div className="flex items-center gap-3 mb-4">
                  <Sparkles className="text-blue-400" size={32} />
                  <h3 className="text-2xl font-bold text-white">Smoke System</h3>
                </div>
                <p className="text-gray-300 mb-6 leading-relaxed">
                  Machines à fumée professionnelles de haute qualité. Fabrication française, fiabilité garantie 10 ans.
                </p>
                <div className="flex items-center gap-2 text-blue-400 font-semibold group-hover:gap-4 transition-all">
                  Découvrir la gamme
                  <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>

              {/* Foam System */}
              <Link
                to="/fluid-system"
                className="group bg-gradient-to-br from-gray-900/80 to-gray-800/80 backdrop-blur-md rounded-2xl p-8 border border-white/10 hover:border-purple-400/50 transition-all duration-500 transform hover:-translate-y-2 hover:shadow-2xl hover:shadow-purple-500/25"
              >
                <div className="flex items-center gap-3 mb-4">
                  <Star className="text-purple-400" size={32} />
                  <h3 className="text-2xl font-bold text-white">Fluid System</h3>
                </div>
                <p className="text-gray-300 mb-6 leading-relaxed">
                  Liquides pour mousse, neige, fumée et flammes, développés en france, alliant performance et qualité.
                </p>
                <div className="flex items-center gap-2 text-purple-400 font-semibold group-hover:gap-4 transition-all">
                  Découvrir la gamme
                  <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>

              {/* DMX Interface */}
              <Link
                to="/omega-dmx-interface"
                className="group bg-gradient-to-br from-gray-900/80 to-gray-800/80 backdrop-blur-md rounded-2xl p-8 border border-white/10 hover:border-cyan-400/50 transition-all duration-500 transform hover:-translate-y-2 hover:shadow-2xl hover:shadow-cyan-500/25"
              >
                <div className="flex items-center gap-3 mb-4">
                  <Radio className="text-cyan-400" size={32} />
                  <h3 className="text-2xl font-bold text-white">DMX Interface</h3>
                </div>
                <p className="text-gray-300 mb-6 leading-relaxed">
                  Boîtier DMX 2 univers (1024 canaux), sans abonnement. Sans fil jusqu'à 1 km avec les cartes OMEGA.
                </p>
                <div className="flex items-center gap-2 text-cyan-400 font-semibold group-hover:gap-4 transition-all">
                  Découvrir le boîtier
                  <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            </div>
          </div>

          {/* CTA Spectacles */}
          <div className="mt-12">
            <Link
              to="/spectacles"
              className="inline-flex items-center gap-2 border-2 border-blue-400/50 text-white px-8 py-3 rounded-full text-lg font-semibold hover:bg-blue-500/10 hover:border-blue-400 transition-all duration-300"
            >
              Découvrir nos Spectacles
              <ArrowRight size={20} />
            </Link>
          </div>
        </div>
      </div>

      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce">
        <ChevronDown className="text-white/60" size={32} />
      </div>
    </section>
  );
};

export default Hero;
