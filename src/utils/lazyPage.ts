import { lazy, type ComponentType } from 'react';

/**
 * `React.lazy()` qui survit à un déploiement pendant la visite.
 *
 * ## Le défaut corrigé (constaté en production le 2 août 2026)
 * Les pages sont chargées à la demande, et Vite nomme chaque morceau avec une empreinte
 * de son contenu : `HomePage-CpDUu6xM.js`. À chaque déploiement, ces noms changent et les
 * anciens fichiers disparaissent du serveur.
 *
 * Un visiteur dont l'onglet est resté ouvert garde en mémoire l'ancien `index.js`, qui
 * référence les anciens noms. À sa première navigation après une mise en ligne, le
 * morceau demandé n'existe plus :
 *   « TypeError: Failed to fetch dynamically imported module »
 * et l'ErrorBoundary affiche un écran d'erreur pour un site pourtant en parfait état.
 *
 * ## La correction
 * Recharger la page : le navigateur récupère alors l'`index.html` courant, donc les bons
 * noms de morceaux, et la navigation reprend là où elle allait.
 *
 * ⚠ Une seule tentative, mémorisée dans `sessionStorage`. Sans ce garde-fou, un échec
 * qui n'a rien à voir avec un déploiement — réseau coupé, morceau réellement absent —
 * ferait recharger la page en boucle, ce qui est bien pire que l'erreur d'origine.
 */
const CLE_REPRISE = 'omega:reprise-module';

export function lazyPage<T extends ComponentType<any>>(
  charger: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      const module = await charger();
      // Chargement réussi : on réarme la reprise pour le prochain déploiement.
      sessionStorage.removeItem(CLE_REPRISE);
      return module;
    } catch (erreur) {
      if (sessionStorage.getItem(CLE_REPRISE)) {
        // On a déjà rechargé sans succès : le problème est ailleurs, on laisse
        // l'ErrorBoundary faire son travail plutôt que de boucler.
        throw erreur;
      }

      sessionStorage.setItem(CLE_REPRISE, '1');
      window.location.reload();

      // Le rechargement est lancé : cette promesse ne se résout jamais, pour éviter
      // d'afficher une erreur ou un écran vide pendant la fraction de seconde qui reste.
      return new Promise<{ default: T }>(() => {});
    }
  });
}
