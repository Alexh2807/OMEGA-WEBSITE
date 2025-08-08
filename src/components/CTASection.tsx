import React from 'react';
import { Link } from 'react-router-dom';

const CTASection = () => {
  return (
    <section className="py-20 bg-gradient-to-r from-yellow-400 to-orange-500 text-black text-center">
      <div className="container mx-auto px-6">
        <h2 className="text-3xl md:text-4xl font-bold mb-4">
          Prêt à concrétiser votre projet ?
        </h2>
        <p className="mb-8 max-w-2xl mx-auto text-lg">
          Contactez notre équipe pour obtenir un devis personnalisé et découvrez
          comment OMEGA peut sublimer votre événement.
        </p>
        <Link
          to="/contact"
          className="inline-block px-8 py-4 rounded-full bg-black text-white font-semibold hover:bg-gray-900 transition-colors"
        >
          Nous contacter
        </Link>
      </div>
    </section>
  );
};

export default CTASection;
