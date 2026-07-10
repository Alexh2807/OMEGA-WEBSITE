import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';

// Fonction utilitaire pour "débouncer" les événements de défilement
const debounce = (func: (...args: unknown[]) => void, delay: number) => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return (...args: unknown[]) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), delay);
  };
};

// Composant pour le bloc de contenu principal (côté gauche)
const ProductContent = ({ isVisible, scrollY }: { isVisible: boolean; scrollY: number }) => (
  <div
    className={`space-y-8 transition-all duration-1000 ${
      isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8'
    }`}
    // Effet de parallaxe subtil sur le contenu
    style={{ transform: `translateY(${scrollY * -0.015}px)` }}
  >
    {/* Badge Professional Series */}
    <div className="inline-block mt-6 md:mt-12">
      <span className="bg-gradient-to-r from-cyan-400 to-blue-500 text-white px-5 py-2 text-sm font-semibold tracking-wider uppercase shadow-lg">
        Événementiel Premium
      </span>
    </div>

    {/* Titre et description du produit */}
    <div className="space-y-6">
      <h1 className="text-7xl md:text-8xl lg:text-9xl font-extralight leading-none text-white">
        OMEGA
        <br />
        <span className="font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">MOUSSE</span>
        <br />
        <span className="text-gray-500">PREMIUM</span>
      </h1>
      <div className="w-20 h-1 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full"></div>
      <p className="text-xl md:text-2xl text-gray-300 leading-relaxed max-w-md font-light">
        Le liquide à mousse événementielle le plus performant du marché mondial.
        <br />
        <span className="font-medium text-white">Développé depuis 2005, perfectionné en 2023.</span>
        <br />
        <span className="font-medium text-cyan-400">Une qualité inégalée pour vos soirées mousse.</span>
      </p>
    </div>

    {/* Caractéristiques clés / Statistiques */}
    <div className="grid grid-cols-3 gap-4 py-4 border-t border-b border-gray-700">
      <div className="text-center md:text-left">
        <div className="text-4xl font-bold text-cyan-400 mb-1">2005</div>
        <div className="text-sm text-gray-400 uppercase tracking-wide">Développement initial</div>
      </div>
      <div className="text-center md:text-left">
        <div className="text-4xl font-bold text-cyan-400 mb-1">2023</div>
        <div className="text-sm text-gray-400 uppercase tracking-wide">Version optimisée</div>
      </div>
      <div className="text-center md:text-left">
        <div className="text-4xl font-bold text-cyan-400 mb-1">N°1</div>
        <div className="text-sm text-gray-400 uppercase tracking-wide">Mondial</div>
      </div>
    </div>

    {/* Appel à l'action */}
    <div className="space-y-4">
      <Link
        to="/produit-mousse"
        className="inline-flex items-center gap-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-10 py-4 font-bold text-lg hover:shadow-2xl hover:shadow-cyan-500/25 transition-all duration-300 group"
      >
        <Sparkles size={20} />
        <span>DÉCOUVRIR</span>
        <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
      </Link>
      <p className="text-sm text-gray-500">
        Le produit de référence pour vos événements mousse professionnels.
      </p>
    </div>
  </div>
);

// Composant pour le bloc d'image du produit (côté droit)
const ProductImage = ({ isVisible, scrollY }: { isVisible: boolean; scrollY: number }) => (
  <div
    className={`relative flex justify-center items-center h-full transition-all duration-1200 delay-300 ${
      isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
    }`}
    // Effet de parallaxe subtil sur l'image
    style={{ transform: `translateY(${scrollY * -0.005}px)` }}
  >
    <div className="relative w-full max-w-lg lg:max-w-none">
      {/* Ombre dynamique pour la profondeur */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          transform: 'translateY(50px) translateX(30px) scale(0.95)',
          background: 'radial-gradient(ellipse 65% 35% at center, rgba(6, 182, 212, 0.15) 0%, transparent 70%)',
          filter: 'blur(30px)',
          borderRadius: '50%',
          opacity: 0.8,
        }}
      />
      {/* Image du produit - redimensionnée et centrée */}
      <div
        className="relative z-10"
        style={{
          transform: `
            scale(1.2)
            translateX(0%)
            translateY(${Math.sin(scrollY * 0.002) * 3}px)
          `,
        }}
      >
        <img
          src="/products/omega mousse.png"
          alt="OMEGA MOUSSE - Liquide premium pour soirées mousse événementielles"
          className="w-full h-auto object-contain object-center"
          style={{
            filter: 'drop-shadow(0 30px 80px rgba(6, 182, 212, 0.3))',
            maxWidth: 'none',
            imageRendering: 'crisp-edges',
          }}
        />
      </div>
    </div>
  </div>
);

// Composant principal de la section Mousse
const MousseSection = () => {
  const [scrollY, setScrollY] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement | null>(null);

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
      { threshold: 0.3 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    // Fonction de nettoyage
    return () => {
      window.removeEventListener('scroll', handleScroll);
      observer.disconnect();
    };
  }, [handleScroll]);

  return (
    <section
      ref={sectionRef}
      id="mousse-section"
      className="min-h-[60vh] bg-gradient-to-b from-gray-900 via-black to-gray-900 flex items-center relative overflow-hidden text-white"
    >
      {/* Motif de fond subtil pour la texture */}
      <div className="absolute inset-0 opacity-[0.03]">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(6, 182, 212, 0.2) 1px, transparent 0)`,
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      {/* Effet de bulles flottantes en arrière-plan */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(15)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-cyan-400/10"
            style={{
              width: `${Math.random() * 100 + 20}px`,
              height: `${Math.random() * 100 + 20}px`,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animation: `float ${Math.random() * 10 + 10}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 5}s`,
            }}
          />
        ))}
      </div>

      <div className="container mx-auto px-6 relative z-10 py-6">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Côté gauche : Détails du produit */}
          <ProductContent isVisible={isVisible} scrollY={scrollY} />

          {/* Côté droit : Image du produit */}
          <ProductImage isVisible={isVisible} scrollY={scrollY} />
        </div>
      </div>

      <style>{`
        @keyframes float {
          0%, 100% {
            transform: translateY(0) translateX(0);
          }
          50% {
            transform: translateY(-30px) translateX(10px);
          }
        }
      `}</style>
    </section>
  );
};

export default MousseSection;
