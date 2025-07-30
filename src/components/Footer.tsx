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
              <img
                src="/Logo-omega-hq-transparent.png"
                alt="OMEGA"
                className="h-8 w-auto"
              />
              <span className="text-2xl font-bold bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
                OMEGA
              </span>
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
                <a
                  href="/spectacles"
                  className="hover:text-blue-400 transition-colors"
                >
                  Spectacles DJ
                </a>
              </li>
              <li>
                <a
                  href="/spectacles"
                  className="hover:text-blue-400 transition-colors"
                >
                  Shows Lumière
                </a>
              </li>
              <li>
                <a
                  href="/spectacles"
                  className="hover:text-blue-400 transition-colors"
                >
                  Effets Spéciaux
                </a>
              </li>
              <li>
                <a
                  href="/spectacles"
                  className="hover:text-blue-400 transition-colors"
                >
                  Soirées Mousse
                </a>
              </li>
              <li>
                <a
                  href="/machines"
                  className="hover:text-blue-400 transition-colors"
                >
                  Machines Hazer
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">Produits</h4>
            <ul className="space-y-2 text-gray-400">
              <li>
                <a
                  href="/produits"
                  className="hover:text-blue-400 transition-colors"
                >
                  Produits à Mousse
                </a>
              </li>
              <li>
                <a
                  href="/machines"
                  className="hover:text-blue-400 transition-colors"
                >
                  Machines CO²
                </a>
              </li>
              <li>
                <a
                  href="/produits"
                  className="hover:text-blue-400 transition-colors"
                >
                  Accessoires
                </a>
              </li>
              <li>
                <a
                  href="/produits"
                  className="hover:text-blue-400 transition-colors"
                >
                  Pièces Détachées
                </a>
              </li>
              <li>
                <a
                  href="/contact"
                  className="hover:text-blue-400 transition-colors"
                >
                  Devis Sur Mesure
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">Support</h4>
            <ul className="space-y-2 text-gray-400">
              <li>
                <a
                  href="/contact"
                  className="hover:text-blue-400 transition-colors"
                >
                  Service Client
                </a>
              </li>
              <li>
                <a
                  href="/contact"
                  className="hover:text-blue-400 transition-colors"
                >
                  SAV
                </a>
              </li>
              <li>
                <a
                  href="/contact"
                  className="hover:text-blue-400 transition-colors"
                >
                  Contact
                </a>
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
                  Conditions d'Utilisation
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row justify-between items-center">
          <p className="text-gray-400 mb-4 md:mb-0 flex items-center gap-2">
            © 2024 OMEGA. Créé avec{' '}
            <Heart className="text-red-500 fill-current" size={16} /> depuis
            1996
          </p>
          <button
            onClick={scrollToTop}
            className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-3 rounded-full hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 hover:-translate-y-1"
          >
            <ArrowUp size={20} />
          </button>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
