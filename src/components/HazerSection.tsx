import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

// Fonction utilitaire pour "débouncer" les événements de défilement
const debounce = (func, delay) => {
  let timeout;
  return function (...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), delay);
  };
};

// Composant pour le bloc de contenu principal (côté gauche)
const ProductContent = ({ isVisible, scrollY }) => (
  <div
    className={`space-y-8 transition-all duration-1000 ${
      isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8'
    }`}
    // Effet de parallaxe subtil sur le contenu
    style={{ transform: `translateY(${scrollY * -0.015}px)` }}
  >
    {/* Badge Professional Series */}
    <div className="inline-block mt-6 md:mt-12">
      {' '}
      {/* Plus de marge supérieure pour aérer */}
      <span className="bg-white text-black px-5 py-2 text-sm font-semibold tracking-wider uppercase shadow-lg">
        Professional Series
      </span>
    </div>

    {/* Titre et description du produit */}
    <div className="space-y-6">
      <h1 className="text-7xl md:text-8xl lg:text-9xl font-extralight leading-none text-white">
        PRO
        <br />
        <span className="font-bold">HAZER</span>
        <br />
        <span className="text-gray-500">CO²</span>
      </h1>
      <div className="w-20 h-1 bg-white rounded-full"></div>{' '}
      {/* Séparateur plus épais et arrondi */}
      <p className="text-xl md:text-2xl text-gray-300 leading-relaxed max-w-md font-light">
        Technologie de brouillard révolutionnaire pour des effets atmosphériques
        inégalés.
        <br />
        <span className="font-medium text-white">
          90% de consommation de fluide en moins.
        </span>
        <br />
        <span className="font-medium text-white">
          Jusqu'à 40 heures de fonctionnement continu par litre.
        </span>
      </p>
    </div>

    {/* Caractéristiques clés / Statistiques */}
    <div className="grid grid-cols-3 gap-4 py-4 border-t border-b border-gray-700">

      {' '}
      {/* Bordures pour l'emphase */}
      <div className="text-center md:text-left">
        <div className="text-4xl font-bold text-white mb-1">90%</div>
        <div className="text-sm text-gray-400 uppercase tracking-wide">
          Efficacité accrue
        </div>
      </div>
      <div className="text-center md:text-left">
        <div className="text-4xl font-bold text-white mb-1">40h</div>
        <div className="text-sm text-gray-400 uppercase tracking-wide">
          Utilisation prolongée
        </div>
      </div>
      <div className="text-center md:text-left">
        <div className="text-4xl font-bold text-white mb-1">10</div>
        <div className="text-sm text-gray-400 uppercase tracking-wide">
          Ans de garantie
        </div>
      </div>
    </div>

    {/* Appel à l'action */}
    <div className="space-y-4">
      <Link
        to="/machine-hazer"
        className="inline-flex items-center gap-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white px-10 py-4 font-bold text-lg hover:shadow-2xl hover:shadow-blue-500/25 transition-all duration-300 group"
      >
        <span>DÉCOUVRIR</span>
        <ArrowRight
          size={20}
          className="group-hover:translate-x-1 transition-transform"
        />
      </Link>
      <p className="text-sm text-gray-500">
        Demandez une démonstration gratuite dès aujourd'hui.
      </p>
    </div>
  </div>
);

// Composant pour le bloc d'image de la machine (côté droit)
const ProductImage = ({ isVisible, scrollY }) => (
  <div
    className={`relative flex justify-center items-center h-full transition-all duration-1200 delay-300 ${
      isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
    }`}
    // Effet de parallaxe subtil sur l'image
    style={{ transform: `translateY(${scrollY * -0.005}px)` }}
  >
    <div className="relative w-full max-w-lg lg:max-w-none">
      {' '}
      {/* Largeur responsive pour le conteneur */}
      {/* Ombre dynamique pour la profondeur */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          transform: 'translateY(50px) translateX(30px) scale(0.95)',
          background:
            'radial-gradient(ellipse 65% 35% at center, rgba(255, 255, 255, 0.08) 0%, transparent 70%)',
          filter: 'blur(30px)',
          borderRadius: '50%',
          opacity: 0.7,
        }}
      />
      {/* Image de la machine - redimensionnée et centrée */}
      <div
        className="relative z-10"
        style={{
          transform: `
            scale(1.35) /* Image réduite de 25% par rapport à l'échelle de 1.8 (1.8 * 0.75 = 1.35) */
            translateX(0%) /* Centrée horizontalement */
            translateY(${Math.sin(scrollY * 0.002) * 3}px) /* Effet de flottement plus prononcé */
          `,
        }}
      >
        <img
          src="/HazerCO2remake.png"
          alt="Machine PRO HAZER CO² OMEGA, un appareil de technologie de brouillard avancé."
          className="w-full h-auto object-contain object-center" // Assure que l'image s'adapte et est centrée
          style={{
            filter: 'drop-shadow(0 30px 80px rgba(0, 0, 0, 0.4))', // Ombre plus forte pour un fond sombre
            maxWidth: 'none',
            imageRendering: 'crisp-edges',
          }}
        />
      </div>
    </div>
  </div>
);

// Composant principal de la section Hazer
const HazerSection = () => {
  const [scrollY, setScrollY] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef(null);

  // Gestionnaire de défilement "débouncé" pour limiter les mises à jour d'état
  const handleScroll = useCallback(
    debounce(() => {
      setScrollY(window.scrollY);
    }, 50),
    []
  );

  useEffect(() => {
    window.addEventListener('scroll', handleScroll);

    // Intersection Observer pour détecter quand la section est visible
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0.3 } // Ajuster le seuil selon les besoins pour le déclenchement de la visibilité
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    // Fonction de nettoyage pour supprimer l'écouteur d'événements et déconnecter l'observateur
    return () => {
      window.removeEventListener('scroll', handleScroll);
      observer.disconnect();
    };
  }, [handleScroll]); // Le tableau de dépendances inclut handleScroll grâce à useCallback

  return (
    <section
      ref={sectionRef} // Assigner la référence à l'élément de la section
      id="hazer-section" // Garder l'ID pour un lien externe ou un CSS spécifique potentiel
      className="min-h-[60vh] bg-gradient-to-b from-black to-gray-900 flex items-center relative overflow-hidden text-white" // Hauteur réduite d'environ 30% supplémentaire

    >
      {/* Motif de fond subtil pour la texture */}
      <div className="absolute inset-0 opacity-[0.03]">
        {' '}
        {/* Motif légèrement plus visible */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255, 255, 255, 0.1) 1px, transparent 0)`, // Points blancs pour le thème sombre
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      <div className="container mx-auto px-6 relative z-10 py-6">
        {' '}
        {/* Ajouter un rembourrage vertical pour le contenu */}
        <div className="grid lg:grid-cols-2 gap-12 items-center">

          {/* Côté gauche : Détails du produit */}
          <ProductContent isVisible={isVisible} scrollY={scrollY} />

          {/* Côté droit : Image du produit */}
          <ProductImage isVisible={isVisible} scrollY={scrollY} />
        </div>
      </div>
    </section>
  );
};

export default HazerSection;
