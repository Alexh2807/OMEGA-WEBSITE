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
  email: 'sarl.omega@hotmail.fr',
  manager: 'Jose HIDALGO',
  creationDate: '2005-03-08',
};

/* ═══════════════════════════════════════════════════════════════════════════════
   ★★★ À RENSEIGNER PAR LE GÉRANT ★★★

   Les deux blocs ci-dessous sont les SEULS de ce fichier qui ne soient pas encore
   renseignés. Tant qu'ils sont vides, ils ne s'impriment nulle part : c'est
   volontaire.

   ⚠ Pourquoi le vide plutôt qu'un gabarit ?
   Ils s'imprimaient AUPARAVANT tels quels en pied de facture : le client recevait
   « Assurance RC Pro : [À compléter] — Médiateur de la consommation : [À compléter
   si applicable] ». Une mention manquante est un manquement ; une mention qui
   ANNONCE son propre vide sur un document commercial est un manquement affiché,
   qui décrédibilise le document entier. On masque, et on documente ici.

   ⚠ Le médiateur n'est PAS facultatif en vente aux particuliers.
   L'article L616-1 du code de la consommation impose à tout professionnel qui vend
   à des consommateurs de désigner un médiateur de la consommation et d'en
   communiquer les coordonnées (site, CGV, bons de commande). Le défaut est
   sanctionné par une amende administrative (art. L641-1 : jusqu'à 3 000 € pour une
   personne physique, 15 000 € pour une personne morale).
   Adhésion à prévoir auprès d'un médiateur référencé par la CECMC, par exemple
   Médicys (medicys.fr), CM2C (cm2c.fr) ou la FEVAD (mediateurfevad.fr).

   Pour activer l'affichage : remplacer les chaînes vides par les valeurs réelles.
   Aucune autre modification n'est nécessaire — le pied de facture s'adapte seul.
   ═══════════════════════════════════════════════════════════════════════════════ */

/** Assurance responsabilité civile professionnelle. Vide = non renseignée, non imprimée. */
export const INSURANCE_INFO = {
  /** Ex. « Allianz ». */
  provider: '',
  /** Ex. « RC123456789 ». */
  policyNumber: '',
  coverage: 'Responsabilité Civile Professionnelle',
};

/** Médiateur de la consommation — OBLIGATOIRE en B2C (art. L616-1 c. consom.). */
export const MEDIATOR_INFO = {
  /** Ex. « Médicys ». */
  name: '',
  /** Ex. « https://www.medicys.fr ». */
  website: '',
};

/** Vrai tant que le gérant n'a pas désigné de médiateur — sert aux écrans d'alerte. */
export const MEDIATEUR_A_RENSEIGNER = MEDIATOR_INFO.name.trim() === '';
/** Vrai tant que l'assurance RC Pro n'est pas renseignée. */
export const ASSURANCE_A_RENSEIGNER = INSURANCE_INFO.provider.trim() === '';

export const BANK_DETAILS = {
  iban: '',
  bic: '',
  bankName: '',
};

/**
 * Mentions complémentaires du pied de facture : assurance RC Pro et médiateur.
 *
 * ⚠ Rend une chaîne VIDE tant que rien n'est renseigné, et l'appelant n'affiche alors
 * rien. L'ancienne version imprimait le gabarit « [À compléter] » sur la facture remise
 * au client — c'est-à-dire qu'elle publiait le fait que ces mentions manquaient.
 * Chaque mention renseignée s'ajoute indépendamment : renseigner l'une n'oblige pas à
 * attendre l'autre.
 */
export const getInvoiceLegalFooter = (): string => {
  const morceaux: string[] = [];

  if (!ASSURANCE_A_RENSEIGNER) {
    morceaux.push(
      `Assurance RC Pro : ${INSURANCE_INFO.provider}` +
        (INSURANCE_INFO.policyNumber
          ? ` - Contrat n° ${INSURANCE_INFO.policyNumber}`
          : '')
    );
  }

  if (!MEDIATEUR_A_RENSEIGNER) {
    morceaux.push(
      `Médiateur de la consommation : ${MEDIATOR_INFO.name}` +
        (MEDIATOR_INFO.website ? ` - ${MEDIATOR_INFO.website}` : '')
    );
  }

  return morceaux.join(' - ');
};

/**
 * Retourne les mentions obligatoires courtes pour le pied de page
 */
export const getShortLegalMentions = (): string => {
  return `${COMPANY_INFO.name} - ${COMPANY_INFO.legalForm} au capital de ${COMPANY_INFO.capital} € - SIRET : ${COMPANY_INFO.siret} - RCS ${COMPANY_INFO.rcs} - N° TVA : ${COMPANY_INFO.vat}`;
};
