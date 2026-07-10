import React from 'react';
import { Link } from 'react-router-dom';
import { FileText, Phone } from 'lucide-react';
import { COMPANY_INFO } from '../config/legalInfo';

/**
 * Boutons d'action du MODE VITRINE : remplacent « Ajouter au panier » partout
 * quand la vente en ligne est désactivée — « Demander un devis » (formulaire de
 * contact pré-rempli avec le produit) et « Appeler » (06 81 23 99 31).
 */
interface VitrineCTAProps {
  /** Nom du produit à pré-remplir dans la demande de devis. */
  productName?: string;
  /** Empile les boutons verticalement (fiches produit) ou côte à côte. */
  vertical?: boolean;
  className?: string;
}

const VitrineCTA = ({ productName, vertical = false, className = '' }: VitrineCTAProps) => {
  const quoteLink = productName
    ? `/contact?sujet=devis&produit=${encodeURIComponent(productName)}`
    : '/contact?sujet=devis';

  return (
    <div
      className={`flex ${vertical ? 'flex-col' : 'flex-col sm:flex-row'} gap-3 ${className}`}
    >
      <Link
        to={quoteLink}
        className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-full font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 flex items-center justify-center gap-2"
      >
        <FileText size={18} />
        Demander un devis
      </Link>
      <a
        href={COMPANY_INFO.phoneHref}
        className="flex-1 border-2 border-white/30 text-white px-6 py-3 rounded-full font-semibold hover:bg-white/10 hover:border-white/50 transition-all duration-300 flex items-center justify-center gap-2"
      >
        <Phone size={18} />
        {COMPANY_INFO.phone}
      </a>
    </div>
  );
};

export default VitrineCTA;
