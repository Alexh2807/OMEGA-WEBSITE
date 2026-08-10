import React from 'react';
import { Link } from 'react-router-dom';
import {
  Heart,
  ArrowUp,
  Facebook,
  Twitter,
  Instagram,
  Linkedin,
  Github,
} from 'lucide-react';

const Footer = () => {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="bg-gradient-to-t from-black to-gray-900 py-12 relative">
      <div className="container mx-auto px-6">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-4">
              {/* ⚠ shrink-0 + object-contain : dans un conteneur flex, une image est COMPRESSÉE
                horizontalement quand la place manque (flex-shrink vaut 1 par défaut). La hauteur
                restant fixée par h-12, le logo apparaissait ÉTIRÉ sur téléphone. */}
              <img
                src="/products/logo-omega-hq-transparent.webp"
                alt="OMEGA"
                className="h-12 w-auto shrink-0 object-contain"
              />
            </div>
            <p className="text-gray-400 mb-6 leading-relaxed">
              Spécialiste des spectacles et fabricant de machines à effets
              spéciaux depuis 1996. Votre événement est notre passion.
            </p>
            <div className="flex space-x-4">
              {[Facebook, Twitter, Instagram, Linkedin, Github].map(
                (Icon, index) => (
                  <a
                    key={index}
                    href="#"
                    aria-label="Réseau social"
                    className="bg-white/10 hover:bg-gradient-to-r hover:from-blue-500 hover:to-purple-600 hover:text-white p-2 rounded-lg transition-all duration-300 group"
                 >
                    <Icon
                      size={20}
                      className="text-gray-400 group-hover:text-white"
                    />
                  </a>
                )
              )}
            </div>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">Services</h4>
            <ul className="space-y-2 text-gray-400">
              <li>
                <Link
                  to="/spectacles"
                  className="hover:text-blue-400 transition-colors"
                >
                  Spectacles DJ
                </Link>
              </li>
              <li>
                <Link
                  to="/spectacles"
                  className="hover:text-blue-400 transition-colors"
                >
                  Shows Lumière
                </Link>
              </li>
              <li>
                <Link
                  to="/spectacles"
                  className="hover:text-blue-400 transition-colors"
                >
                  Effets Spéciaux
                </Link>
              </li>
              <li>
                <Link
                  to="/spectacles"
                  className="hover:text-blue-400 transition-colors"
                >
                  Soirées Mousse
                </Link>
              </li>
              <li>
                <Link
                  to="/machines"
                  className="hover:text-blue-400 transition-colors"
                >
                  Machines Hazer
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">Produits</h4>
            <ul className="space-y-2 text-gray-400">
              <li>
                <Link
                  to="/produits"
                  className="hover:text-blue-400 transition-colors"
                >
                  Produits à Mousse
                </Link>
              </li>
              <li>
                <Link
                  to="/machines"
                  className="hover:text-blue-400 transition-colors"
                >
                  Machines CO²
                </Link>
              </li>
              <li>
                <Link
                  to="/produits"
                  className="hover:text-blue-400 transition-colors"
                >
                  Accessoires
                </Link>
              </li>
              <li>
                <Link
                  to="/produits"
                  className="hover:text-blue-400 transition-colors"
                >
                  Pièces Détachées
                </Link>
              </li>
              <li>
                <Link
                  to="/contact"
                  className="hover:text-blue-400 transition-colors"
                >
                  Devis Sur Mesure
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">Support</h4>
            <ul className="space-y-2 text-gray-400">
              <li>
                <Link
                  to="/contact"
                  className="hover:text-blue-400 transition-colors"
                >
                  Service Client
                </Link>
              </li>
              <li>
                <Link
                  to="/contact"
                  className="hover:text-blue-400 transition-colors"
                >
                  SAV
                </Link>
              </li>
              <li>
                <Link
                  to="/contact"
                  className="hover:text-blue-400 transition-colors"
                >
                  Contact
                </Link>
              </li>
              <li>
                <Link
                  to="/privacy-policy"
                  className="hover:text-blue-400 transition-colors"
                >
                  Politique de Confidentialité
                </Link>
              </li>
              <li>
                <Link
                  to="/terms"
                  className="hover:text-blue-400 transition-colors"
                >
                  CGV & Mentions Légales
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 pt-8">
          <div className="text-center text-gray-400 text-xs mb-4">
            <p className="mb-1">
              <strong>OMEGA</strong> - SARL au capital de 1 000 € - SIRET : 481 088 722 00014
            </p>
            <p className="mb-1">
              RCS Béziers B 481 088 722 - N° TVA intracommunautaire : FR74481088722
            </p>
            <p className="mb-1">
              Siège social : Lot Artisanal Communal, 34290 MONTBLANC, France
            </p>
            <p className="mb-3">
              Directeur de la publication : Jose HIDALGO
            </p>
          </div>

          <div className="flex flex-col md:flex-row justify-between items-center">
            <p className="text-gray-400 mb-4 md:mb-0 flex items-center gap-2">
              {/* Année de fin CALCULÉE : figée à 2024, la mention vieillissait toute seule
                  et signalait un site à l'abandon — le genre de détail qu'un client
                  professionnel remarque avant de commander. */}
              © 2005-{new Date().getFullYear()} OMEGA. Créé avec{' '}
              {/* ⚠ « depuis 2005 » contredisait les TROIS autres mentions du site
                  (Hero, À propos, haut de ce pied de page) qui annoncent 1996. Le même
                  écart avait déjà été corrigé sur la facture (cf. InvoicePDF). Les deux
                  dates sont vraies mais ne disent pas la même chose : 1996 = début
                  d'activité, 2005 = constitution de la SARL. C'est l'ANCIENNETÉ qu'on
                  affiche ici, donc 1996 ; le © part de 2005, date de la personne morale
                  qui détient les droits. */}
              <Heart className="text-red-500 fill-current" size={16} /> depuis 1996
            </p>
            <button
              onClick={scrollToTop}
              className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-3 rounded-full hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 hover:-translate-y-1"
            >
              <ArrowUp size={20} />
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
