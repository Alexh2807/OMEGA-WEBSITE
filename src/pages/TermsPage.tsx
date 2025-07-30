import React from 'react';

const TermsPage = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24">
      <div className="container mx-auto px-6 py-12 space-y-6 text-gray-300">
        <h1 className="text-4xl font-bold text-white mb-4">
          Conditions d&apos;Utilisation
        </h1>
        <p>
          En accédant à ce site, vous acceptez de respecter nos conditions
          d&apos;utilisation. Nous nous réservons le droit de modifier ces
          conditions à tout moment.
        </p>
        <p>
          Tout contenu présent sur ce site est la propriété d&apos;OMEGA. Il est
          interdit de le reproduire sans autorisation préalable.
        </p>
        <p>
          Pour toute question concernant ces conditions, veuillez nous contacter
          directement.
        </p>
      </div>
    </div>
  );
};

export default TermsPage;
