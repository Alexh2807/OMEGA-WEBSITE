import React from 'react';

const PrivacyPolicyPage = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24">
      <div className="container mx-auto px-6 py-12 space-y-6 text-gray-300">
        <h1 className="text-4xl font-bold text-white mb-4">
          Politique de Confidentialité
        </h1>
        <p>
          Votre vie privée est importante pour nous. Cette politique explique
          comment nous collectons, utilisons et protégeons vos informations
          lorsque vous utilisez notre site Web et nos services.
        </p>
        <p>
          Les données personnelles recueillies sont utilisées uniquement pour le
          bon fonctionnement de nos services et ne sont jamais vendues à des
          tiers.
        </p>
        <p>
          Conformément à la réglementation en vigueur, vous disposez d&apos;un
          droit d&apos;accès, de rectification et de suppression de vos données.
          Pour toute demande, contactez-nous via la page&nbsp;Contact.
        </p>
      </div>
    </div>
  );
};

export default PrivacyPolicyPage;
