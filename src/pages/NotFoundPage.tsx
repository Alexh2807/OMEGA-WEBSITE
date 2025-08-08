import React from 'react';

const NotFoundPage = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24 flex items-center justify-center">
      <div className="text-center px-6">
        <h1 className="text-5xl font-extrabold text-white mb-4">404</h1>
        <p className="text-gray-400 mb-6">La page que vous recherchez n'existe pas.</p>
        <a
          href="/"
          className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-full font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300"
        >
          Retour à l'accueil
        </a>
      </div>
    </div>
  );
};

export default NotFoundPage;