/**
 * Clés de survie du paiement.
 *
 * Une authentification bancaire en pleine page fait QUITTER le site : tout l'état React
 * disparaît. Ces deux valeurs sont donc écrites dans `sessionStorage` avant de confirmer,
 * pour que la page de retour sache quel paiement relire et à partir de quel devis créer
 * la commande.
 *
 * ⚠ Elles vivent dans ce module minuscule, et non dans la page de retour : le composant de
 * paiement l'importe, et importer la page y tirerait toute la page de retour — donc
 * Stripe, le panier et le routeur — dans le bundle du tunnel.
 */
export const CLE_DEVIS_EN_COURS = 'omega.devis_en_cours';
export const CLE_SECRET_PAIEMENT = 'omega.client_secret';
