/**
 * Informations légales de l'entreprise OMEGA
 * Centralisées pour faciliter les mises à jour
 */

export const COMPANY_INFO = {
  name: 'OMEGA',
  legalForm: 'SARL',
  capital: '1 000',
  address: {
    street: 'LOT ARTISANAL COMMUNAL',
    postalCode: '34290',
    city: 'MONTBLANC',
    country: 'France',
  },
  siret: '481 088 722 00014',
  rcs: 'Béziers B 481 088 722',
  vat: 'FR74481088722',
  ape: '518J',
  phone: '06 81 23 99 31',
  phoneHref: 'tel:+33681239931',
  email: 'alexishidalgo34000@gmail.com', // TODO : remplacer par une adresse pro (ex. contact@…) dès qu'elle existe
  manager: 'Jose HIDALGO',
  creationDate: '2005-03-08',
};

export const INSURANCE_INFO = {
  // À compléter avec les informations de votre assurance RC Pro
  provider: '[Nom de votre assureur]',
  policyNumber: '[Numéro de contrat]',
  coverage: 'Responsabilité Civile Professionnelle',
  // Exemple : "Allianz - Contrat n° RC123456789"
};

export const MEDIATOR_INFO = {
  // À compléter si vous avez désigné un médiateur de la consommation
  name: '[Nom du médiateur]',
  website: '[Site web]',
  // Exemple : "Médicys - https://www.medicys.fr"
  // Ou : "CM2C - https://www.cm2c.fr"
};

export const BANK_DETAILS = {
  iban: '',
  bic: '',
  bankName: '',
};

/**
 * Retourne le texte complet des mentions légales pour les factures
 */
export const getInvoiceLegalFooter = (): string => {
  const insurance =
    INSURANCE_INFO.provider !== '[Nom de votre assureur]'
      ? `Assurance RC Pro : ${INSURANCE_INFO.provider}${INSURANCE_INFO.policyNumber ? ` - Contrat n° ${INSURANCE_INFO.policyNumber}` : ''}`
      : 'Assurance RC Pro : [À compléter]';

  const mediator =
    MEDIATOR_INFO.name !== '[Nom du médiateur]'
      ? `Médiateur de la consommation : ${MEDIATOR_INFO.name}${MEDIATOR_INFO.website ? ` - ${MEDIATOR_INFO.website}` : ''}`
      : 'Médiateur de la consommation : [À compléter si applicable]';

  return `${insurance} - ${mediator}`;
};

/**
 * Retourne les mentions obligatoires courtes pour le pied de page
 */
export const getShortLegalMentions = (): string => {
  return `${COMPANY_INFO.name} - ${COMPANY_INFO.legalForm} au capital de ${COMPANY_INFO.capital} € - SIRET : ${COMPANY_INFO.siret} - RCS ${COMPANY_INFO.rcs} - N° TVA : ${COMPANY_INFO.vat}`;
};
