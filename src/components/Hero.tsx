import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Star, Sparkles, ArrowRight } from 'lucide-react';

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

          <h1 className="text-6xl md:text-8xl font-bold mb-6 bg-gradient-to-r from-white via-yellow-400 to-orange-500 bg-clip-text text-transparent leading-tight">
            <img
              src="/Logo-omega-hq-transparent.png"
              alt="OMEGA"
              className="h-20 mx-auto mb-4"
            />
          </h1>

          <p className="text-2xl text-gray-300 mb-2 font-semibold">
            Depuis 1996
          </p>
          <p className="text-lg text-gray-400 mb-12 max-w-2xl mx-auto leading-relaxed">
            Fabricant français de machines à fumée professionnelles et
            spécialiste des spectacles événementiels
          </p>

          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center mb-16">
            <Link
              to="/machine-hazer"
              className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-8 py-4 rounded-full text-lg font-semibold hover:shadow-2xl hover:shadow-blue-500/25 transform hover:-translate-y-1 transition-all duration-300 flex items-center gap-2"
            >
              Découvrir nos Machines
              <ArrowRight size={20} />
            </Link>
            <Link
              to="/spectacles"
              className="border-2 border-blue-400/50 text-white px-8 py-4 rounded-full text-lg font-semibold hover:bg-blue-500/10 hover:border-blue-400 transition-all duration-300"
            >
              Nos Spectacles
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
