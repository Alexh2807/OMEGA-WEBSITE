import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { dateApresOffre, dateFinOffre, useOffreLancement } from '../utils/offreLancement';

/**
 * Bandeau d'annonce de l'offre de lancement, en tête de l'en-tête fixe.
 *
 * L'en-tête est FIXE et transparent au-dessus des pages : ajouter une ligne en haut
 * poussait le menu sur le visuel d'accueil. On décale donc le CORPS de la page de la
 * hauteur du bandeau (padding-top), pour que chaque page garde sa mise en page
 * d'origine, simplement abaissée. Le bandeau se replie au défilement (`visible` faux)
 * pour ne jamais masquer une barre collante de page ; le décalage, lui, reste constant
 * afin que le contenu ne saute pas. Rien n'est rendu hors période d'offre.
 */
const OffreLancementBandeau = ({ visible }: { visible: boolean }) => {
  const offre = useOffreLancement();
  const lien = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!offre) return;
    const appliquer = () => {
      const h = lien.current ? lien.current.offsetHeight + 1 : 0; // +1 : filet du bas
      document.body.style.paddingTop = `${h}px`;
    };
    appliquer();
    window.addEventListener('resize', appliquer);
    return () => {
      window.removeEventListener('resize', appliquer);
      document.body.style.paddingTop = '';
    };
  }, [offre]);

  if (!offre) return null;
  return (
    <div
      className={`overflow-hidden border-b border-white/10 bg-black text-white transition-all duration-300 ${
        visible ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0'
      }`}
      aria-hidden={!visible}
    >
      <Link
        ref={lien}
        to={offre.lien}
        tabIndex={visible ? 0 : -1}
        className="block px-4 py-2 text-center text-xs leading-snug text-white/80 transition-colors hover:text-white sm:text-sm"
      >
        <span className="font-semibold text-white">Offre de lancement</span>
        <span className="mx-2 text-white/30">·</span>
        Boîtier OMEGA DMX à <span className="font-semibold text-white">{offre.prixLancementTtc} € TTC</span>{' '}
        jusqu'au {dateFinOffre(offre)}
        <span className="hidden sm:inline"> — {offre.prixApresTtc} € TTC à partir du {dateApresOffre(offre)}</span>
        <span className="ml-2 underline underline-offset-4">Découvrir</span>
      </Link>
    </div>
  );
};

export default OffreLancementBandeau;
