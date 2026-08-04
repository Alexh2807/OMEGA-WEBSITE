/**
 * Catégorie de TVA d'une opération — la table de décision, en un seul endroit.
 *
 * ## Pourquoi ce module existe
 * `buildCII.ts` écrivait `CategoryCode` = **`S` en dur**, sur la ligne comme sur le
 * récapitulatif. Or la catégorie « S » (taux normal ou réduit) IMPOSE un taux non nul :
 * la règle BR-S-05 de la norme EN 16931 refuse le couple (S, 0 %). Toute vente exonérée
 * — livraison intracommunautaire, exportation, outre-mer — produisait donc un XML
 * **invalide**, qui sera rejeté à la réception obligatoire du 1ᵉʳ septembre 2026.
 * Symétriquement, les règles BR-E-10 / BR-G-10 / BR-K-10 exigent un MOTIF d'exonération
 * dès que la catégorie n'est pas « S » : il était absent.
 *
 * La logique correcte existait déjà, mais seulement dans la fonction Edge `send-to-make`
 * (`codeCategorieTva`, `baseLegale`, `motifExoneration`). Deux implémentations d'un même
 * fait fiscal, c'est deux vérités dans le même système : le XML archivé — celui qui a
 * valeur légale — disait le contraire de ce qui partait en comptabilité. On la reprend
 * ici, à l'identique, pour que le navigateur et le serveur ne puissent plus diverger.
 *
 * ## La table (UNCL 5305, reprise par EN 16931 / Factur-X)
 * | Régime / territoire            | Taux | Code | Motif                |
 * |--------------------------------|------|------|----------------------|
 * | France, Monaco (tout taux)     | > 0  | `S`  | ∅                    |
 * | UE B2C (sous seuil ou OSS)     | > 0  | `S`  | ∅                    |
 * | UE B2B, n° VIES validé, biens  | 0    | `K`  | art. 262 ter I       |
 * | Export hors UE                 | 0    | `G`  | art. 262 I           |
 * | Outre-mer (DOM/COM)            | 0    | `G`  | **art. 294**         |
 *
 * ⚠ La catégorie est déduite du RÉGIME et du TERRITOIRE, jamais du taux : quatre régimes
 * donnent 0 % et ne se déclarent pas au même endroit. `Z` (« bien taxé à taux nul ») n'est
 * jamais émis, et c'est volontaire — ce n'est pas une exonération.
 *
 * ⚠ Arbitrage outre-mer : `E` (« exempt ») et `G` (« free export item ») sont tous deux
 * défendables, les DOM étant hors du champ territorial de la TVA de l'Union. On retient
 * `G`, comme `send-to-make`, pour que les deux chemins restent identiques ; ce qui
 * distingue vraiment l'opération, c'est la base légale (art. 294) portée par le motif.
 */

/** Codes de catégorie de TVA effectivement émis par OMEGA. */
export type CategorieTva = 'S' | 'K' | 'G' | 'AE' | 'E' | 'Z';

/** Régimes arrêtés par `regime_tva()` et figés sur la commande puis la facture. */
export type RegimeTva = 'fr' | 'ue_b2b' | 'ue_b2c' | 'export' | null | undefined;

/** Territoires renvoyés par `regime_tva().territoire`, figés sur la commande. */
export type TerritoireTva =
  | 'FR'
  | 'FR-DOM'
  | 'FR-COM'
  | 'MC'
  | 'UE'
  | 'HORS-UE'
  | 'UE-EXCLU'
  | string
  | null
  | undefined;

const estOutreMer = (territoire: TerritoireTva): boolean =>
  territoire === 'FR-DOM' || territoire === 'FR-COM';

/**
 * Code de catégorie de TVA de l'opération.
 * ⚠ Ne regarde JAMAIS le taux : c'est le régime qui décide, pas le montant.
 */
export const categorieTva = (
  regime: RegimeTva,
  territoire: TerritoireTva
): CategorieTva => {
  if (regime === 'ue_b2b') return 'K';
  if (estOutreMer(territoire)) return 'G';
  if (regime === 'export') return 'G';
  return 'S';
};

/** Base légale de l'exonération — ce que le comptable doit lire noir sur blanc. */
export const baseLegaleTva = (
  regime: RegimeTva,
  territoire: TerritoireTva
): string | null => {
  if (estOutreMer(territoire)) return 'CGI art. 294';
  if (regime === 'ue_b2b') return 'CGI art. 262 ter I';
  if (regime === 'export') return 'CGI art. 262 I';
  return null;
};

/**
 * Motif d'exonération à porter dans le XML (BT-120 au récapitulatif, BT-127 en ligne).
 *
 * La mention FIGÉE à la vente est prioritaire : c'est le texte exact imprimé sur la
 * facture remise au client, et le document électronique ne doit pas en dire un autre.
 * Le repli n'existe que pour les factures antérieures à la mise en place de
 * `orders.vat_mention` — une catégorie ≠ S SANS motif est refusée par la norme.
 */
export const motifExonerationTva = (
  code: CategorieTva,
  mention: string | null | undefined,
  regime: RegimeTva,
  territoire: TerritoireTva
): string | null => {
  if (code === 'S') return null;
  if (mention && mention.trim() !== '') return mention.trim();

  if (estOutreMer(territoire)) {
    return "Exonération de TVA — livraison vers un département ou une collectivité d'outre-mer (art. 294 du CGI).";
  }
  if (regime === 'ue_b2b') {
    return 'Exonération de TVA — livraison intracommunautaire, autoliquidation par le preneur (art. 262 ter I du CGI).';
  }
  if (regime === 'export') {
    return "Exonération de TVA — exportation hors de l'Union européenne (art. 262 I du CGI).";
  }
  return 'Opération exonérée de TVA.';
};
