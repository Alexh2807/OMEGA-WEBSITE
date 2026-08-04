import { Invoice } from '../types/billing';
/* Même source que le Factur-X et que la fonction Edge comptable : le régime et le
   territoire figés à la vente décident du compte, jamais un libellé ni un taux. */
import { RegimeTva, TerritoireTva } from './facturx/categorieTva';

/**
 * Convertit un tableau de données en format CSV.
 *
 * @param separateur `;` pour les exports lus dans Excel (défaut), `\t` pour le FEC —
 *   le format à plat de l'art. A47 A-1 du LPF n'admet que la TABULATION ou le pipe.
 */
export const convertToCSV = (
  data: any[],
  headers: string[],
  separateur: string = ';'
): string => {
  const csvRows = [];

  // En-têtes
  csvRows.push(headers.join(separateur));

  // Données
  for (const row of data) {
    const values = headers.map(header => {
      const value = row[header];
      if (value === null || value === undefined) return '';
      /* Le FEC à plat n'admet PAS de guillemets d'encadrement : ils feraient partie de
         la valeur. On neutralise donc le séparateur et les sauts de ligne à l'intérieur
         des champs plutôt que de les protéger par des guillemets. */
      const brut = String(value);
      if (separateur === '\t') {
        return brut.replace(/[\t\r\n]+/g, ' ').trim();
      }
      return `"${brut.replace(/"/g, '""')}"`;
    });
    csvRows.push(values.join(separateur));
  }

  return csvRows.join('\n');
};

/**
 * Télécharge un fichier texte (CSV ou FEC).
 */
export const downloadCSV = (content: string, filename: string) => {
  // Ajouter le BOM UTF-8 pour Excel
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/* ═══════════════════════════════════════════════════════════════════════════════
   REPÈRES COMPTABLES — dérivés du RÉGIME, jamais écrits en dur
   ═══════════════════════════════════════════════════════════════════════════════ */

/**
 * Compte de produits selon le régime et le territoire.
 *
 * ⚠ Un compte 707000 unique pour TOUS les régimes — France, autoliquidation
 * intracommunautaire, exportation et outre-mer confondus — rend la CA3 injustifiable
 * depuis la balance : quatre lignes de déclaration différentes, dont trois à 0 %,
 * atterrissaient sur le même compte, et plus rien ne permettait de les redistinguer.
 *
 * ★ Le PORT va en 708 (produits des activités annexes) et non en 707 : c'est un service
 * refacturé, pas une vente de marchandise. Le payload comptable le distingue déjà par
 * `line_kind` — la colonne existe précisément pour ne pas avoir à reconnaître le libellé
 * « Frais de port », qui casse à la première reformulation.
 */
export const compteProduits = (
  regime: RegimeTva,
  territoire: TerritoireTva,
  natureLigne?: string | null
): { numero: string; libelle: string } => {
  if (natureLigne === 'shipping') {
    return { numero: '708500', libelle: 'Ports et frais accessoires facturés' };
  }
  if (territoire === 'FR-DOM' || territoire === 'FR-COM') {
    return { numero: '707400', libelle: 'Ventes outre-mer (art. 294)' };
  }
  if (regime === 'ue_b2b') {
    return { numero: '707200', libelle: 'Livraisons intracommunautaires' };
  }
  if (regime === 'export') {
    return { numero: '707300', libelle: 'Exportations hors UE' };
  }
  return { numero: '707100', libelle: 'Ventes de marchandises France' };
};

/**
 * Libellé de l'écriture de TVA. ⚠ Écrivait « TVA collectée 20% » EN DUR, y compris sur
 * une facture à 0 % : le journal affirmait une TVA à 20 % en face d'un montant nul.
 */
export const libelleTva = (taux: number): string =>
  `TVA collectée ${Number(taux ?? 0).toLocaleString('fr-FR')} %`;

/**
 * Taux réellement appliqué à la facture, déduit des MONTANTS quand la colonne est vide
 * (factures antérieures à `invoices.vat_rate`). Aucun repli à 20 % : sur une base nulle
 * ou une TVA nulle, le taux est zéro, et c'est l'information juste.
 */
export const tauxFacture = (invoice: Invoice): number => {
  if (invoice.vat_rate != null) return Number(invoice.vat_rate);
  const base = Number(invoice.subtotal_ht ?? 0);
  if (base === 0) return 0;
  return Math.round((Number(invoice.tax_amount ?? 0) / base) * 10000) / 100;
};

/**
 * Compte auxiliaire du client.
 *
 * ⚠ Faisait `invoice.customer_id.slice(0, 8)`. Or `invoices.customer_id` est en
 * `ON DELETE SET NULL` : dès qu'un compte client était supprimé, l'export levait un
 * TypeError — et l'appelant n'avait AUCUN `try/catch`. Résultat : un bouton mort, sans
 * message, sans trace. On retombe sur un auxiliaire « client supprimé » identifiable,
 * parce qu'une écriture doit rester rattachable même quand le tiers a disparu.
 */
export const compteAuxiliaire = (invoice: Invoice): string =>
  invoice.customer_id ? String(invoice.customer_id).slice(0, 8) : 'CLIENTSUP';

/** Un avoir : sens inverse de la facture (707 au DÉBIT, 411 au CRÉDIT). */
const estAvoir = (invoice: Invoice): boolean =>
  invoice.document_type === 'credit_note';

/**
 * Date d'écriture en heure de PARIS, au format AAAAMMJJ.
 *
 * ⚠ `toISOString()` sur un `timestamptz` rend de l'UTC : une facture créée le
 * 1ᵉʳ janvier à 00 h 30 heure de Paris sortait datée du 31 décembre — donc rattachée au
 * mauvais mois de TVA, voire au mauvais EXERCICE, tout en portant un numéro chronologique
 * en heure locale. Rupture de séquence dans le journal des ventes (art. 242 nonies A).
 */
export const dateFecParis = (d: Date): string =>
  new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(d)
    .replace(/-/g, '');

/**
 * Exporte les factures au format CSV pour le comptable
 */
export const exportInvoicesToCSV = (invoices: Invoice[]) => {
  const data = invoices.map(invoice => ({
    numero: invoice.invoice_number,
    // Facture ou avoir : au signe près, les deux se ressemblent trop pour être confondus.
    nature: estAvoir(invoice) ? 'Avoir' : 'Facture',
    date_emission: new Date(invoice.created_at).toLocaleDateString('fr-FR'),
    date_livraison: invoice.delivery_date
      ? new Date(invoice.delivery_date).toLocaleDateString('fr-FR')
      : '',
    date_paiement: invoice.paid_at
      ? new Date(invoice.paid_at).toLocaleDateString('fr-FR')
      : '',
    // ⚠ `customer_id` et `customer_name` survivent à la suppression du compte client
    //    (colonne `SET NULL`) : on ne suppose plus qu'ils sont là.
    client: invoice.customer_name || 'Client supprimé',
    email_client: invoice.customer_email || '',
    statut: getStatusLabel(invoice.status),
    regime_tva: invoice.vat_regime || '',
    territoire: invoice.vat_territory || '',
    taux_tva: String(tauxFacture(invoice)),
    montant_ht: Number(invoice.subtotal_ht ?? 0).toFixed(2),
    tva: Number(invoice.tax_amount ?? 0).toFixed(2),
    montant_ttc: Number(invoice.total_ttc ?? 0).toFixed(2),
    montant_paye: Number(invoice.amount_paid ?? 0).toFixed(2),
    solde_du: (
      Number(invoice.total_ttc ?? 0) - Number(invoice.amount_paid ?? 0)
    ).toFixed(2),
    echeance: invoice.due_date || '',
  }));

  const headers = [
    'numero',
    'nature',
    'date_emission',
    'date_livraison',
    'date_paiement',
    'client',
    'email_client',
    'statut',
    'regime_tva',
    'territoire',
    'taux_tva',
    'montant_ht',
    'tva',
    'montant_ttc',
    'montant_paye',
    'solde_du',
    'echeance',
  ];

  const csv = convertToCSV(data, headers);
  const filename = `factures_${dateFecParis(new Date())}.csv`;
  downloadCSV(csv, filename);
};

/**
 * Journal des ventes au format FEC (Fichier des Écritures Comptables, art. A47 A-1 LPF).
 *
 * ## Ce qui était faux
 *  · **Séparateur `;` et valeurs entre guillemets.** Le format à plat n'admet que la
 *    TABULATION ou le pipe : un contrôleur refuse le fichier tel quel.
 *  · **Un seul compte de produits (707000)** pour la France, l'autoliquidation
 *    intracommunautaire, l'exportation et l'outre-mer. Quatre lignes de CA3 différentes
 *    dans le même compte : la déclaration ne se justifie plus depuis la balance.
 *  · **Libellé « TVA collectée 20% » en dur**, même sur une facture à 0 %.
 *  · **Les avoirs ne produisaient AUCUNE écriture** — le commentaire « Gestion des avoirs
 *    / remboursements (si applicable…) » était suivi de rien. Une facture remboursée
 *    sortait au montant plein : le chiffre d'affaires ne baissait jamais.
 *  · **Date en UTC**, donc rattachement possible au mauvais exercice.
 *  · `customer_id.slice(0, 8)` sur une colonne `SET NULL` : plantage sur un client
 *    supprimé, sans aucun message côté écran.
 *
 * ## Le sens des écritures
 * Vente : 411 au DÉBIT (le client doit) · 707x et 44571 au CRÉDIT.
 * Avoir  : exactement l'inverse — 707x et 44571 au DÉBIT, 411 au CRÉDIT. C'est ce qui
 * diminue le chiffre d'affaires et récupère la TVA reversée à tort.
 * ⚠ Les montants d'un avoir sont NÉGATIFS en base (quantités négatives) : on écrit leur
 * VALEUR ABSOLUE en inversant les colonnes, parce qu'un FEC ne porte pas de montant
 * négatif — un signe moins dans la colonne Débit est un signe d'écriture bricolée.
 */
export const exportSalesJournalFEC = (
  invoices: Invoice[],
  startDate: Date,
  endDate: Date
) => {
  const data: any[] = [];

  invoices.forEach(invoice => {
    const invoiceDate = new Date(invoice.created_at);

    // Filtres de sécurité : Date et Statut
    // On exclut les brouillons et les factures annulées qui ne doivent pas apparaître en compta.
    // ⚠ `refunded` n'est PAS exclu : la vente a bien eu lieu, c'est l'AVOIR qui la défait.
    // L'exclure ferait disparaître la vente ET son annulation, donc ne changerait rien au
    // résultat tout en rendant le journal incomplet.
    if (invoiceDate < startDate || invoiceDate > endDate) return;
    if (invoice.status === 'draft' || invoice.status === 'cancelled') return;

    const dateStr = dateFecParis(invoiceDate);
    const avoir = estAvoir(invoice);
    const regime = (invoice.vat_regime ?? null) as RegimeTva;
    const territoire = (invoice.vat_territory ?? null) as TerritoireTva;
    const taux = tauxFacture(invoice);
    const piece = invoice.invoice_number;
    const nature = avoir ? 'Avoir' : 'Facture';

    /** Montant toujours positif ; c'est la COLONNE qui porte le sens. */
    const mt = (n: number) => Math.abs(Number(n) || 0).toFixed(2);
    /** Débit/Crédit inversés sur un avoir. */
    const sens = (montant: number, debitSiVente: boolean) => {
      const auDebit = avoir ? !debitSiVente : debitSiVente;
      return auDebit
        ? { Debit: mt(montant), Credit: '0.00' }
        : { Debit: '0.00', Credit: mt(montant) };
    };

    const commun = {
      JournalCode: 'VTE',
      JournalLib: 'Journal des Ventes',
      EcritureNum: invoice.invoice_number,
      EcritureDate: dateStr,
      PieceRef: invoice.invoice_number,
      PieceDate: dateStr,
      EcritureLet: '',
      DateLet: '',
      ValidDate: dateStr,
      Montantdevise: '',
      Idevise: '',
    };

    // ── 1. Le tiers (411) ────────────────────────────────────────────────────
    data.push({
      ...commun,
      CompteNum: '411000',
      CompteLib: 'Clients',
      CompAuxNum: compteAuxiliaire(invoice),
      CompAuxLib: invoice.customer_name || 'Client supprimé',
      EcritureLib: `${nature} ${piece}`,
      ...sens(invoice.total_ttc, true),
    });

    // ── 2. La TVA (44571) — omise quand elle est nulle ───────────────────────
    /* Écrire une ligne 445710 à 0,00 € sur un export ou une autoliquidation ne fait
       qu'ajouter du bruit : il n'y a pas de TVA collectée sur une opération exonérée,
       et une ligne à zéro laisse croire le contraire au lecteur pressé. */
    if (Math.abs(Number(invoice.tax_amount) || 0) >= 0.005) {
      data.push({
        ...commun,
        CompteNum: '445710',
        CompteLib: 'TVA collectée',
        CompAuxNum: '',
        CompAuxLib: '',
        EcritureLib: `${libelleTva(taux)} - ${nature} ${piece}`,
        ...sens(invoice.tax_amount, false),
      });
    }

    // ── 3. Les produits (707x / 708x), ventilés par nature de ligne ──────────
    /* Le port ne va pas au même compte que la marchandise : on regroupe les lignes par
       `line_kind`. Sans lignes détaillées (facture ancienne), on retombe sur un seul
       montant — mais toujours avec le compte du BON régime. */
    const parNature = new Map<string, number>();
    for (const item of invoice.invoice_items ?? []) {
      const nat = item.line_kind ?? 'goods';
      parNature.set(nat, (parNature.get(nat) ?? 0) + Number(item.total_ht ?? 0));
    }
    if (parNature.size === 0) {
      parNature.set('goods', Number(invoice.subtotal_ht ?? 0));
    }

    for (const [nat, montant] of parNature) {
      if (Math.abs(montant) < 0.005) continue;
      const compte = compteProduits(regime, territoire, nat);
      data.push({
        ...commun,
        CompteNum: compte.numero,
        CompteLib: compte.libelle,
        CompAuxNum: '',
        CompAuxLib: '',
        EcritureLib: `${avoir ? 'Avoir' : 'Vente'}${
          nat === 'shipping' ? ' (port)' : ''
        } - ${nature} ${piece}`,
        ...sens(montant, false),
      });
    }
  });

  const headers = [
    'JournalCode',
    'JournalLib',
    'EcritureNum',
    'EcritureDate',
    'CompteNum',
    'CompteLib',
    'CompAuxNum',
    'CompAuxLib',
    'PieceRef',
    'PieceDate',
    'EcritureLib',
    'Debit',
    'Credit',
    'EcritureLet',
    'DateLet',
    'ValidDate',
    'Montantdevise',
    'Idevise',
  ];

  /* ★ TABULATION, et extension `.txt` : c'est ce qu'impose l'art. A47 A-1 du LPF pour un
     fichier à plat. L'écran d'administration annonçait « normalisé pour l'administration
     fiscale » en produisant un CSV point-virgule — un fichier refusé en contrôle. */
  const csv = convertToCSV(data, headers, '\t');
  const filename = `FEC_journal_ventes_${dateFecParis(startDate)}_${dateFecParis(endDate)}.txt`;
  downloadCSV(csv, filename);
};

/**
 * Rapport de TVA d'une période.
 *
 * ## Les deux exports se contredisaient
 * Le journal des ventes exclut les BROUILLONS (une facture non émise n'est pas une
 * pièce comptable) ; ce rapport, lui, les COMPTAIT. Sur la même période, le comptable
 * obtenait donc deux chiffres d'affaires différents selon le bouton cliqué, sans qu'aucun
 * des deux ne dise pourquoi. On aligne : mêmes exclusions, exactement.
 *
 * ## Les avoirs entrent enfin dans le calcul
 * Ils étaient au mieux ignorés (statut `refunded` exclu, ce qui retirait la VENTE au lieu
 * de la corriger), au pire absents. Leurs montants étant négatifs en base, il suffit de
 * les additionner : la somme facture + avoir vaut zéro, ce qui est précisément l'effet
 * recherché.
 *
 * ## La ventilation par régime
 * Un total unique de TVA ne se recopie pas sur une CA3 : quatre régimes à 0 % s'y
 * déclarent dans quatre cases différentes. Le rapport les sépare.
 */
export const exportVATReport = (
  invoices: Invoice[],
  startDate: Date,
  endDate: Date
) => {
  let totalHT = 0;
  let totalTVA = 0;
  let totalTTC = 0;

  const filteredInvoices = invoices.filter(invoice => {
    const invoiceDate = new Date(invoice.created_at);
    return (
      invoiceDate >= startDate &&
      invoiceDate <= endDate &&
      /* ★ MÊMES exclusions que le journal des ventes : brouillon (pas encore une pièce)
         et annulée. `refunded` reste INCLUS — la vente a eu lieu, et c'est l'avoir, lui
         aussi inclus, qui la défait. L'exclure faisait disparaître le chiffre d'affaires
         sans jamais enregistrer sa correction. */
      invoice.status !== 'draft' &&
      invoice.status !== 'cancelled'
    );
  });

  /** Ventilation par ligne de déclaration — ce que la CA3 demande, case par case. */
  const parRegime = new Map<
    string,
    { libelle: string; base: number; tva: number; nb: number }
  >();
  const libelleRegime = (regime: RegimeTva, territoire: TerritoireTva): [string, string] => {
    if (territoire === 'FR-DOM' || territoire === 'FR-COM')
      return ['livraisons_outre_mer', 'Livraisons outre-mer (exonérées, art. 294)'];
    if (regime === 'ue_b2b')
      return [
        'livraisons_intracommunautaires',
        'Livraisons intracommunautaires (exonérées, art. 262 ter I)',
      ];
    if (regime === 'export')
      return ['exportations', 'Exportations hors UE (exonérées, art. 262 I)'];
    if (regime === 'ue_b2c') return ['ventes_ue_b2c', 'Ventes à distance UE (particuliers)'];
    return ['ventes_france', 'Ventes taxables France'];
  };

  filteredInvoices.forEach(invoice => {
    totalHT += invoice.subtotal_ht;
    totalTVA += invoice.tax_amount;
    totalTTC += invoice.total_ttc;

    const [cle, libelle] = libelleRegime(
      (invoice.vat_regime ?? null) as RegimeTva,
      (invoice.vat_territory ?? null) as TerritoireTva
    );
    const courant = parRegime.get(cle) ?? { libelle, base: 0, tva: 0, nb: 0 };
    courant.base += Number(invoice.subtotal_ht ?? 0);
    courant.tva += Number(invoice.tax_amount ?? 0);
    courant.nb += 1;
    parRegime.set(cle, courant);
  });

  const data = [
    {
      periode: `Du ${startDate.toLocaleDateString('fr-FR')} au ${endDate.toLocaleDateString('fr-FR')}`,
      nombre_documents: filteredInvoices.length,
      total_ht: totalHT.toFixed(2),
      /* ⚠ La colonne s'appelait « tva_collectee_20 » : elle annonçait un taux de 20 %
         même quand la période ne contenait que des ventes exonérées. */
      tva_collectee: totalTVA.toFixed(2),
      total_ttc: totalTTC.toFixed(2),
    },
  ];

  const ventilationData = [...parRegime.values()].map(v => ({
    categorie: v.libelle,
    base_ht: v.base.toFixed(2),
    tva_collectee: v.tva.toFixed(2),
    nombre_documents: String(v.nb),
  }));

  // Détail par document — l'avoir se lit dans la colonne « nature », pas au signe seul.
  const detailData = filteredInvoices.map(invoice => ({
    numero: invoice.invoice_number,
    nature: estAvoir(invoice) ? 'Avoir' : 'Facture',
    date: new Date(invoice.created_at).toLocaleDateString('fr-FR'),
    client: invoice.customer_name || 'Client supprimé',
    regime: invoice.vat_regime || '',
    territoire: invoice.vat_territory || '',
    taux: String(tauxFacture(invoice)),
    base_ht: invoice.subtotal_ht.toFixed(2),
    tva: invoice.tax_amount.toFixed(2),
    montant_ttc: invoice.total_ttc.toFixed(2),
  }));

  const summaryHeaders = [
    'periode',
    'nombre_documents',
    'total_ht',
    'tva_collectee',
    'total_ttc',
  ];
  const ventilationHeaders = ['categorie', 'base_ht', 'tva_collectee', 'nombre_documents'];
  const detailHeaders = [
    'numero',
    'nature',
    'date',
    'client',
    'regime',
    'territoire',
    'taux',
    'base_ht',
    'tva',
    'montant_ttc',
  ];

  const summaryCsv = convertToCSV(data, summaryHeaders);
  const ventilationCsv = convertToCSV(ventilationData, ventilationHeaders);
  const detailCsv = convertToCSV(detailData, detailHeaders);

  const fullCsv =
    `RAPPORT DE TVA - SYNTHÈSE\n\n${summaryCsv}\n\n\n` +
    `VENTILATION PAR LIGNE DE DÉCLARATION\n\n${ventilationCsv}\n\n\n` +
    `DÉTAIL PAR DOCUMENT\n\n${detailCsv}`;

  const filename = `rapport_TVA_${dateFecParis(startDate)}_${dateFecParis(endDate)}.csv`;
  downloadCSV(fullCsv, filename);
};

/**
 * Exporte le grand livre clients
 */
export const exportCustomerLedger = (invoices: Invoice[]) => {
  // Grouper par client
  const customerMap = new Map<string, any>();

  invoices.forEach(invoice => {
    /* ⚠ `customer_id` est en `ON DELETE SET NULL` : il vaut `null` dès qu'un compte
       client a été supprimé. Servir de clé de `Map` à un `null` regroupait TOUS les
       clients supprimés sous une même ligne muette. On leur donne un auxiliaire nommé,
       identique à celui du FEC, pour que les deux exports se rapprochent. */
    const customerId = invoice.customer_id ?? 'CLIENTSUP';
    if (!customerMap.has(customerId)) {
      customerMap.set(customerId, {
        compte_auxiliaire: compteAuxiliaire(invoice),
        nom_client: invoice.customer_name || 'Client supprimé',
        email: invoice.customer_email || '',
        nombre_documents: 0,
        total_facture: 0,
        total_paye: 0,
        solde_du: 0,
      });
    }

    const customer = customerMap.get(customerId);
    customer.nombre_documents++;
    /* Les avoirs portent des montants négatifs : les additionner DIMINUE le solde du
       client, ce qui est exactement l'effet d'un avoir sur le compte 411. */
    customer.total_facture += Number(invoice.total_ttc ?? 0);
    customer.total_paye += Number(invoice.amount_paid ?? 0);
    customer.solde_du +=
      Number(invoice.total_ttc ?? 0) - Number(invoice.amount_paid ?? 0);
  });

  const data = Array.from(customerMap.values()).map(customer => ({
    compte_auxiliaire: customer.compte_auxiliaire,
    nom_client: customer.nom_client,
    email: customer.email,
    nombre_documents: customer.nombre_documents,
    total_facture: customer.total_facture.toFixed(2),
    total_paye: customer.total_paye.toFixed(2),
    solde_du: customer.solde_du.toFixed(2),
  }));

  const headers = [
    'compte_auxiliaire',
    'nom_client',
    'email',
    'nombre_documents',
    'total_facture',
    'total_paye',
    'solde_du',
  ];

  const csv = convertToCSV(data, headers);
  const filename = `grand_livre_clients_${dateFecParis(new Date())}.csv`;
  downloadCSV(csv, filename);
};

/**
 * Exporte les paiements reçus
 */
export const exportPaymentRecords = (
  invoices: Invoice[],
  startDate: Date,
  endDate: Date
) => {
  const payments: any[] = [];

  invoices.forEach(invoice => {
    if (invoice.payment_records) {
      invoice.payment_records.forEach(payment => {
        const paymentDate = new Date(payment.payment_date);
        if (paymentDate >= startDate && paymentDate <= endDate) {
          payments.push({
            date_paiement: paymentDate.toLocaleDateString('fr-FR'),
            numero_document: invoice.invoice_number,
            client: invoice.customer_name || 'Client supprimé',
            montant: Number(payment.amount ?? 0).toFixed(2),
            moyen_paiement: getPaymentMethodLabel(payment.payment_method),
            reference: payment.reference || '',
            /* Sans l'identifiant de transaction Stripe, le compte 512 ne se lettre pas :
               Stripe verse UN virement groupé pour N ventes, et c'est cette référence qui
               permet de le rapprocher. */
            charge_stripe: payment.stripe_charge_id || '',
            notes: payment.notes || '',
          });
        }
      });
    }
  });

  const headers = [
    'date_paiement',
    'numero_document',
    'client',
    'montant',
    'moyen_paiement',
    'reference',
    'charge_stripe',
    'notes',
  ];

  const csv = convertToCSV(payments, headers);
  const filename = `paiements_recus_${dateFecParis(startDate)}_${dateFecParis(endDate)}.csv`;
  downloadCSV(csv, filename);
};

// Fonctions utilitaires
const getStatusLabel = (status: string): string => {
  const labels: { [key: string]: string } = {
    draft: 'Brouillon',
    sent: 'Envoyée',
    paid: 'Payée',
    overdue: 'En retard',
    cancelled: 'Annulée',
    refunded: 'Remboursée',
  };
  return labels[status] || status;
};

const getPaymentMethodLabel = (method: string): string => {
  const labels: { [key: string]: string } = {
    virement: 'Virement bancaire',
    cheque: 'Chèque',
    especes: 'Espèces',
    carte: 'Carte bancaire',
    prelevement: 'Prélèvement',
    refund: 'Remboursement',
  };
  return labels[method] || method;
};
