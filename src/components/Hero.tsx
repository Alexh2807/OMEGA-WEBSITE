import React from 'react';
import { Link } from 'react-router-dom';

const Hero = () => {
  return (
    <section
      id="home"
      className="relative flex items-center justify-center min-h-[80vh] md:min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900"
    >
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.2),transparent_70%)]"></div>
      </div>

      <div className="relative z-10 text-center px-6 max-w-3xl">
        <img
          src="/Logo-omega-hq-transparent.png"
          alt="OMEGA"
          className="mx-auto h-24 md:h-32 mb-8"
        />
        <h1 className="text-4xl md:text-6xl font-extrabold text-white mb-6 leading-tight">
          Solutions événementielles haut de gamme
        </h1>
        <p className="text-lg md:text-xl text-gray-300 mb-10">
          Machines à fumée professionnelles, spectacles sur‑mesure et expertise
          technique depuis 1996.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            to="/machine-hazer"
            className="px-8 py-4 rounded-full bg-yellow-400 text-black font-semibold hover:bg-yellow-300 transition-colors"
          >
            Nos Machines
          </Link>
          <Link
            to="/spectacles"
            className="px-8 py-4 rounded-full border border-white text-white font-semibold hover:bg-white hover:text-black transition-colors"
          >
            Nos Spectacles
          </Link>
        </div>
      </div>
    </section>
  );
};

export default Hero;
