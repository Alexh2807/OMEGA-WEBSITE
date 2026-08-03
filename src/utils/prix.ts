/**
 * Format monétaire unique du site.
 *
 * Le site affichait « 1599.99€ » : point décimal, pas de séparateur de milliers, pas
 * d'espace avant le symbole. Sur un site marchand français, le montant s'écrit
 * « 1 599,99 € ». C'est visible partout : panier, page de paiement, facture.
 *
 * Utilisation : `{montant.toLocaleString('fr-FR', EURO)}` — le symbole € est produit par
 * le format, il ne faut donc PAS le réécrire après.
 */
export const EURO: Intl.NumberFormatOptions = {
  style: 'currency',
  currency: 'EUR',
};

/** Même chose sans le symbole, pour les colonnes de tableau qui l'affichent en en-tête. */
export const DEUX_DECIMALES: Intl.NumberFormatOptions = {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
};
