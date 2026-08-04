/**
 * Pays présumé du visiteur, pour PRÉ-REMPLIR le formulaire d'adresse.
 *
 * Pourquoi pas une géolocalisation par IP : il faudrait appeler un service tiers à
 * chaque visite (dépendance externe, latence, données personnelles envoyées ailleurs)
 * pour un simple pré-remplissage. Le fuseau horaire du navigateur donne la même
 * information, sans requête, sans traceur et sans consentement à demander.
 *
 * ⚠ Ce n'est QU'UNE SUGGESTION. La TVA est décidée par le serveur d'après l'adresse de
 * livraison réellement saisie — jamais d'après ceci. Un visiteur en déplacement, un VPN
 * ou un fuseau exotique n'ont donc aucune conséquence sur le montant facturé.
 */
const PAR_FUSEAU: Record<string, string> = {
  'Europe/Paris': 'France', 'Europe/Monaco': 'Monaco', 'Europe/Brussels': 'Belgique',
  'Europe/Luxembourg': 'Luxembourg', 'Europe/Zurich': 'Suisse', 'Europe/Berlin': 'Allemagne',
  'Europe/Rome': 'Italie', 'Europe/Madrid': 'Espagne', 'Europe/Lisbon': 'Portugal',
  'Europe/Amsterdam': 'Pays-Bas', 'Europe/Vienna': 'Autriche', 'Europe/Dublin': 'Irlande',
  'Europe/London': 'Royaume-Uni', 'Europe/Copenhagen': 'Danemark', 'Europe/Stockholm': 'Suède',
  'Europe/Oslo': 'Norvège', 'Europe/Helsinki': 'Finlande', 'Europe/Warsaw': 'Pologne',
  'Europe/Prague': 'Tchéquie', 'Europe/Budapest': 'Hongrie', 'Europe/Bucharest': 'Roumanie',
  'Europe/Sofia': 'Bulgarie', 'Europe/Athens': 'Grèce', 'Europe/Zagreb': 'Croatie',
  'Europe/Ljubljana': 'Slovénie', 'Europe/Bratislava': 'Slovaquie', 'Europe/Tallinn': 'Estonie',
  'Europe/Riga': 'Lettonie', 'Europe/Vilnius': 'Lituanie', 'Europe/Malta': 'Malte',
  'Asia/Nicosia': 'Chypre', 'Atlantic/Reykjavik': 'Islande',
  // Outre-mer : même pays, mais régime de TVA différent — d'où l'intérêt de le proposer.
  'America/Guadeloupe': 'France', 'America/Martinique': 'France', 'America/Cayenne': 'France',
  'Indian/Reunion': 'France', 'Indian/Mayotte': 'France', 'America/Miquelon': 'France',
  'Pacific/Noumea': 'France', 'Pacific/Tahiti': 'France',
};

/** Nom de pays à proposer par défaut. « France » si on ne sait pas : c'est le cas courant. */
export function paysPresume(): string {
  try {
    const fuseau = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    return PAR_FUSEAU[fuseau] || 'France';
  } catch {
    return 'France';
  }
}

/** Code postal à proposer pour l'outre-mer, où il décide de l'exonération (art. 294). */
export function codePostalPresume(): string {
  try {
    const f = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const cp: Record<string, string> = {
      'America/Guadeloupe': '971', 'America/Martinique': '972', 'America/Cayenne': '973',
      'Indian/Reunion': '974', 'America/Miquelon': '975', 'Indian/Mayotte': '976',
    };
    return cp[f] || '';
  } catch { return ''; }
}
