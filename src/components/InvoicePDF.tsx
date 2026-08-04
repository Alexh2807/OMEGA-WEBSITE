import React from 'react';
import { Invoice, InvoiceItem, BillingSettings } from '../types/billing';
import { COMPANY_INFO, getInvoiceLegalFooter } from '../config/legalInfo';
import { EURO } from '../utils/prix';

/**
 * Le document REMIS AU CLIENT — facture ou avoir.
 *
 * ## Mentions obligatoires qui manquaient (art. 242 nonies A de l'annexe II du CGI)
 *  · **Date de livraison** — obligatoire dès lors qu'elle est connue et différente de la
 *    date d'édition. C'est elle qui fixe l'exigibilité de la TVA sur les biens.
 *  · **Date d'échéance** — `due_date` était calculée à J+30 et enregistrée en base…
 *    puis jamais affichée, pendant que le pied de page écrivait EN DUR « Paiement à
 *    réception de facture ». Le document contredisait la base : en cas d'impayé, aucune
 *    des deux versions n'était opposable.
 *  · **Taux de TVA PAR LIGNE** — absent du tableau.
 *  · **Ventilation par taux** — un seul bloc, avec un repli à 20 % quand le taux valait
 *    zéro : une facture exonérée annonçait « TVA (20 %) 0,00 € ». Mention fausse sur un
 *    document légal, et incompréhensible pour l'acheteur.
 *
 * ## Identité du vendeur
 * La prop `billingSettings` était reçue et JAMAIS lue : toute l'identité était en dur.
 * Changer l'adresse, le SIRET ou le n° de TVA dans l'administration n'avait donc aucun
 * effet sur les factures émises ensuite. Elle est désormais la source, `legalInfo.ts`
 * ne servant que de repli pour ce que la table ne porte pas (capital, RCS, APE).
 *
 * ## Avoir
 * `document_type = 'credit_note'` : titre « AVOIR », montants négatifs (ils le sont DÉJÀ
 * en base — les quantités des lignes sont négatives, on ne re-négative rien), et renvoi
 * à la facture d'origine. Un avoir qui ne dit pas ce qu'il annule n'annule rien.
 */

interface InvoicePDFProps {
  invoice: Invoice;
  billingSettings?: BillingSettings | null;
  /** Numéro de la facture annulée, quand le document est un avoir. */
  factureOrigine?: { invoice_number: string; created_at?: string } | null;
}

/** Une entrée de la ventilation de TVA : un couple (taux, base) et sa TVA. */
interface VentilationTva {
  taux: number;
  base: number;
  tva: number;
}

/**
 * Ventilation par TAUX, calculée dans l'ordre imposé par la norme (règle BR-CO-17) :
 * base = Σ des totaux de ligne du taux, puis TVA = round(base × taux / 100).
 * Jamais trois sommes indépendantes — c'est ce qui fabrique les écarts d'un centime.
 * ⚠ Aucun repli à 20 % : un taux nul est un taux nul, et c'est précisément ce qu'il faut
 * imprimer sur une vente exonérée.
 */
const ventilerTva = (items: InvoiceItem[]): VentilationTva[] => {
  const parTaux = new Map<number, number>();
  for (const it of items) {
    const taux = Number(it.tax_rate ?? 0);
    parTaux.set(taux, (parTaux.get(taux) ?? 0) + Number(it.total_ht ?? 0));
  }
  return [...parTaux.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([taux, base]) => {
      const baseArrondie = Math.round(base * 100) / 100;
      return {
        taux,
        base: baseArrondie,
        tva: Math.round((baseArrondie * taux) / 100 * 100) / 100,
      };
    });
};

const InvoicePDF: React.FC<InvoicePDFProps> = ({
  invoice,
  billingSettings,
  factureOrigine,
}) => {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const estAvoir = invoice.document_type === 'credit_note';
  const titre = estAvoir ? 'AVOIR' : 'FACTURE';

  /* ── VENDEUR : les réglages d'abord, le fichier de configuration en repli ────────
     `??` et non `||` sur les seules valeurs qui peuvent légitimement être vides ;
     partout ailleurs une chaîne vide en base (défaut `''` du schéma) doit retomber sur
     la valeur connue plutôt que d'imprimer un blanc à la place du SIRET. */
  const nonVide = (v?: string | null) => (v && v.trim() !== '' ? v.trim() : undefined);
  const vendeur = {
    nom: nonVide(billingSettings?.company_name) ?? COMPANY_INFO.name,
    adresse: nonVide(billingSettings?.company_address) ?? COMPANY_INFO.address.street,
    codePostal:
      nonVide(billingSettings?.company_postal_code) ?? COMPANY_INFO.address.postalCode,
    ville: nonVide(billingSettings?.company_city) ?? COMPANY_INFO.address.city,
    pays: nonVide(billingSettings?.company_country) ?? COMPANY_INFO.address.country,
    telephone: nonVide(billingSettings?.company_phone) ?? COMPANY_INFO.phone,
    email: nonVide(billingSettings?.company_email) ?? COMPANY_INFO.email,
    siret: nonVide(billingSettings?.siret) ?? COMPANY_INFO.siret,
    tva: nonVide(billingSettings?.vat_number) ?? COMPANY_INFO.vat,
    /* ⚠ Capital, RCS, forme juridique et code APE n'ont PAS de colonne dans
       `billing_settings` : ils restent dans `legalInfo.ts`. Les rendre modifiables
       depuis l'administration demande une migration — signalé dans le rapport. */
    formeJuridique: COMPANY_INFO.legalForm,
    capital: COMPANY_INFO.capital,
    rcs: COMPANY_INFO.rcs,
    ape: COMPANY_INFO.ape,
  };
  const iban = nonVide(billingSettings?.bank_details?.iban);
  const bic = nonVide(billingSettings?.bank_details?.bic);

  const items = invoice.invoice_items || [];
  const ventilation = ventilerTva(items);
  /* Une seule catégorie de taux : on reste sur la ligne unique « TVA (x %) », plus lisible.
     Deux taux ou plus (le port peut en introduire un second) : le tableau de ventilation
     devient obligatoire — sans lui, l'acheteur ne peut pas retrouver sa TVA déductible. */
  const ventilationDetaillee = ventilation.length > 1;

  /* ── Règlement ───────────────────────────────────────────────────────────────
     ⚠ Le calcul historique `max(0, total − payé + remboursé)` était INVERSÉ dans son
     interprétation : une facture normalement réglée tombait à zéro et s'affichait
     « REMBOURSÉE », tandis qu'une facture réellement remboursée affichait le total, donc
     comme restant due. « Soldée » et « remboursée » sont deux états différents. */
  const paymentStatus = (() => {
    const paiements = (invoice.payment_records || []).filter(
      payment => payment.payment_method !== 'refund'
    );
    const amountPaid = paiements.length
      ? paiements.reduce((sum, payment) => sum + payment.amount, 0)
      : invoice.amount_paid || 0;
    const totalRefunded = (invoice.refunds || [])
      .filter(refund => refund.status === 'succeeded')
      .reduce((sum, refund) => sum + refund.amount, 0);

    const resteDu = Math.max(0, invoice.total_ttc - amountPaid + totalRefunded);
    const remboursee =
      invoice.status === 'refunded' ||
      (totalRefunded > 0 && totalRefunded >= invoice.total_ttc - 0.005);
    const partiellementRemboursee = totalRefunded > 0 && !remboursee;
    const soldee = resteDu <= 0.005 && totalRefunded === 0;

    return {
      amountPaid,
      totalRefunded,
      resteDu,
      soldee,
      remboursee,
      partiellementRemboursee,
    };
  })();

  /* Conditions de règlement — LUES sur le document, plus écrites en dur.
     `payment_terms` est le délai en jours arrêté à l'émission ; `due_date` la date qui
     en découle. Le pied de page disait « Paiement à réception » quoi qu'il arrive. */
  const delai = invoice.payment_terms;
  const conditionsReglement = estAvoir
    ? "Avoir : le montant est porté au crédit du compte client ou remboursé selon le moyen de paiement d'origine."
    : invoice.due_date
      ? `Paiement à ${delai ? `${delai} jours` : 'échéance'}, soit au plus tard le ${formatDate(
          invoice.due_date
        )}. Escompte pour paiement anticipé : néant.`
      : 'Paiement à réception de facture. Escompte pour paiement anticipé : néant.';

  return (
    <div
      id="invoice-pdf"
      className="bg-white text-black p-10 max-w-4xl mx-auto"
      style={{
        fontFamily: 'Arial, sans-serif',
        fontSize: '12px',
        lineHeight: '1.5',
        color: '#333',
      }}
    >
      {/* --- Header --- */}
      <header className="flex justify-between items-start mb-10 border-b-2 border-gray-800 pb-5">
        <div>
          <img
            id="invoice-logo"
            src="/products/logo-omega-hq-transparent.webp"
            alt="OMEGA Logo"
            className="h-16 mb-4"
          />
          <div className="font-bold text-xl">{vendeur.nom}</div>
          <div className="text-sm text-gray-500">
            {vendeur.formeJuridique} au capital de {vendeur.capital} €
          </div>
          {/* ⚠ La facture annonçait « depuis 2005 » alors que la base (mentions légales
              de `billing_settings`) et tout le reste du site annoncent 1996 : deux dates
              d'ancienneté pour la même société sur des documents commerciaux, dont l'un
              a valeur légale. 1996 = début d'activité ; 2005 = constitution de la SARL
              (`COMPANY_INFO.creationDate`), qui n'a pas à figurer ici. */}
          <div className="text-sm text-gray-500">Fabricant français depuis 1996</div>
        </div>
        <div className="text-right">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">{titre}</h1>
          <div className="text-md font-semibold text-gray-700">
            N° {invoice.invoice_number}
          </div>
          <div className="text-sm text-gray-600 mt-2">
            Date d'émission : {formatDate(invoice.created_at)}
          </div>
          {/* ★ DATE DE LIVRAISON — mention obligatoire (art. 242 nonies A ann. II du CGI)
              et fait générateur de l'exigibilité de la TVA sur les biens. Elle était
              simplement absente du document. */}
          {invoice.delivery_date && (
            <div className="text-sm text-gray-600">
              Date de livraison : {formatDate(invoice.delivery_date)}
            </div>
          )}
          {/* ★ DATE D'ÉCHÉANCE — enregistrée en base, jamais imprimée. Sans elle, aucune
              pénalité de retard n'est exigible : il n'y a pas de retard sans terme. */}
          {!estAvoir && invoice.due_date && (
            <div className="text-sm font-semibold text-gray-700">
              Échéance : {formatDate(invoice.due_date)}
            </div>
          )}
          {invoice.paid_at && !estAvoir && (
            <div className="text-sm font-bold text-green-600">
              Facture acquittée le : {formatDate(invoice.paid_at)}
            </div>
          )}
          {invoice.order_id && (
            <div className="text-sm text-gray-600">
              Commande N° : {invoice.order_id.slice(0, 8)}
            </div>
          )}
          {/* ★ AVOIR : le renvoi à la facture annulée (blocs BG-3 / BT-25, BT-26 de la
              norme EN 16931). Un avoir sans référence n'est rattachable à rien. */}
          {estAvoir && (
            <div className="mt-2 text-sm font-semibold text-gray-800">
              Annule et remplace la facture{' '}
              {factureOrigine?.invoice_number ?? invoice.credit_note_of ?? '—'}
              {factureOrigine?.created_at
                ? ` du ${formatDate(factureOrigine.created_at)}`
                : ''}
            </div>
          )}
        </div>
      </header>

      {/* --- Informations Vendeur & Client --- */}
      <section className="grid grid-cols-2 gap-10 mb-10">
        <div>
          <h3 className="text-sm font-bold text-gray-500 tracking-wider mb-2">VENDEUR</h3>
          <div className="text-sm">
            <div className="font-bold text-md">{vendeur.nom}</div>
            <div className="text-gray-600">
              Société à responsabilité limitée ({vendeur.formeJuridique})
            </div>
            <div className="text-gray-600">Capital social : {vendeur.capital} €</div>
            <div className="mt-2">
              {vendeur.adresse}
              <br />
              {vendeur.codePostal} {vendeur.ville}
              {vendeur.pays && vendeur.pays !== 'France' && (
                <>
                  <br />
                  {vendeur.pays}
                </>
              )}
            </div>
            <div className="mt-2 text-gray-600">
              <div><span className="font-semibold">SIRET :</span> {vendeur.siret}</div>
              <div><span className="font-semibold">RCS :</span> {vendeur.rcs}</div>
              <div><span className="font-semibold">N° TVA :</span> {vendeur.tva}</div>
              <div><span className="font-semibold">APE :</span> {vendeur.ape}</div>
            </div>
          </div>
        </div>
        <div>
          <h3 className="text-sm font-bold text-gray-500 tracking-wider mb-2">
            {estAvoir ? 'AVOIR ÉTABLI À' : 'FACTURÉ À'}
          </h3>
          <div className="text-sm">
            <div className="font-bold text-md">{invoice.customer_name}</div>
            {(invoice.company_name || invoice.billing_address?.company) && (
              <div className="text-gray-600">
                {invoice.company_name || invoice.billing_address.company}
              </div>
            )}
            {invoice.billing_address && (
              <div className="mt-2">
                {invoice.billing_address.address_line_1}
                <br />
                {invoice.billing_address.address_line_2 && (
                  <>
                    {invoice.billing_address.address_line_2}
                    <br />
                  </>
                )}
                {invoice.billing_address.postal_code} {invoice.billing_address.city}
                <br />{invoice.billing_address.country}
              </div>
            )}
            {(invoice.billing_address as any)?.siren && (
              <div className="mt-2">
                <span className="font-semibold">SIREN :</span>{' '}
                {(invoice.billing_address as any).siren}
              </div>
            )}
            {/* Le numéro de TVA du client vient d'abord de la FACTURE (recopié depuis la
                commande au moment de l'achat). L'adresse de facturation ne sert que de
                secours : sur une livraison intracommunautaire, ce numéro est une mention
                obligatoire, il ne doit pas dépendre d'un champ d'adresse optionnel. */}
            {(invoice.vat_number || (invoice.billing_address as any)?.vat_number) && (
              <div className="mt-2">
                <span className="font-semibold">N° TVA :</span>{' '}
                {invoice.vat_number || (invoice.billing_address as any).vat_number}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* --- Tableau des articles --- */}
      <section className="mb-10">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-800 text-white">
              <th className="p-2 text-left font-semibold">Description</th>
              <th className="p-2 text-center font-semibold w-16">Qté</th>
              <th className="p-2 text-right font-semibold w-28">P.U. HT</th>
              {/* ★ TAUX PAR LIGNE — mention obligatoire, et seul moyen de comprendre une
                  facture qui mêle deux taux (la ligne de port en introduit un). */}
              <th className="p-2 text-center font-semibold w-20">TVA</th>
              <th className="p-2 text-right font-semibold w-28">Total HT</th>
            </tr>
          </thead>
          <tbody className="bg-gray-50">
            {items.map(item => (
              <tr key={item.id} className="border-b border-gray-200">
                <td className="p-2 align-top">{item.description}</td>
                <td className="p-2 text-center align-top">{item.quantity}</td>
                <td className="p-2 text-right align-top">
                  {item.unit_price_ht.toLocaleString('fr-FR', EURO)}
                </td>
                <td className="p-2 text-center align-top">
                  {Number(item.tax_rate ?? 0).toLocaleString('fr-FR')} %
                </td>
                <td className="p-2 text-right align-top font-semibold">
                  {item.total_ht.toLocaleString('fr-FR', EURO)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* --- Totaux --- */}
      <section className="flex justify-end mb-10">
        <div className="w-96 text-sm">
          <div className="bg-gray-50 p-3 rounded">
            <div className="flex justify-between mb-1">
              <span>Sous-total HT</span>
              <span>{invoice.subtotal_ht.toLocaleString('fr-FR', EURO)}</span>
            </div>

            {/* ★ VENTILATION PAR TAUX.
                Avant : un bloc unique « TVA (20 %) », le 20 étant un REPLI appliqué dès
                que le taux valait zéro — donc une mention fausse sur toute vente
                exonérée. Désormais une ligne par taux réellement présent, et rien
                d'inventé quand il n'y a pas de TVA. */}
            {ventilationDetaillee ? (
              <div className="border-t border-gray-300 mt-2 pt-2 mb-2">
                <div className="text-xs font-semibold text-gray-600 mb-1">
                  Ventilation de la TVA
                </div>
                <table className="w-full text-xs mb-1">
                  <thead>
                    <tr className="text-gray-500">
                      <th className="text-left font-medium">Taux</th>
                      <th className="text-right font-medium">Base HT</th>
                      <th className="text-right font-medium">TVA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ventilation.map(v => (
                      <tr key={v.taux}>
                        <td>{v.taux.toLocaleString('fr-FR')} %</td>
                        <td className="text-right">
                          {v.base.toLocaleString('fr-FR', EURO)}
                        </td>
                        <td className="text-right">
                          {v.tva.toLocaleString('fr-FR', EURO)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex justify-between font-semibold">
                  <span>Total TVA</span>
                  <span>{invoice.tax_amount.toLocaleString('fr-FR', EURO)}</span>
                </div>
              </div>
            ) : (
              <div className="flex justify-between mb-2">
                <span>
                  TVA ({(ventilation[0]?.taux ?? invoice.vat_rate ?? 0).toLocaleString(
                    'fr-FR'
                  )}{' '}
                  %)
                </span>
                <span>{invoice.tax_amount.toLocaleString('fr-FR', EURO)}</span>
              </div>
            )}

            <div className="flex justify-between font-bold text-lg border-t-2 border-gray-800 pt-2">
              <span>{estAvoir ? 'TOTAL AVOIR TTC' : 'TOTAL TTC'}</span>
              <span>{invoice.total_ttc.toLocaleString('fr-FR', EURO)}</span>
            </div>

            {/* Sur un avoir, il n'y a rien à encaisser : le bloc de règlement n'a pas de
                sens et son « NET À PAYER » ferait croire à une nouvelle dette. */}
            {!estAvoir && (
              <>
                {paymentStatus.amountPaid > 0 && (
                  <div className="flex justify-between mt-2 text-green-600 font-semibold">
                    <span>Montant payé</span>
                    <span>
                      - {paymentStatus.amountPaid.toLocaleString('fr-FR', EURO)}
                    </span>
                  </div>
                )}
                {paymentStatus.totalRefunded > 0 && (
                  <div className="flex justify-between mt-1 text-purple-600 font-semibold text-sm">
                    <span>Montant remboursé</span>
                    <span>
                      + {paymentStatus.totalRefunded.toLocaleString('fr-FR', EURO)}
                    </span>
                  </div>
                )}
                <div
                  className={`flex justify-between mt-2 font-bold text-lg ${
                    paymentStatus.remboursee
                      ? 'text-purple-600'
                      : paymentStatus.soldee
                        ? 'text-green-600'
                        : 'text-red-600'
                  }`}
                >
                  <span>NET À PAYER</span>
                  <span>{paymentStatus.resteDu.toLocaleString('fr-FR', EURO)}</span>
                </div>
                {paymentStatus.remboursee ? (
                  <div className="text-center mt-3 p-2 bg-blue-100 border border-blue-300 rounded">
                    <span className="text-purple-700 font-bold text-sm">
                      FACTURE REMBOURSÉE
                    </span>
                  </div>
                ) : paymentStatus.partiellementRemboursee ? (
                  <div className="text-center mt-3 p-2 bg-blue-100 border border-blue-300 rounded">
                    <span className="text-blue-700 font-bold text-sm">
                      PARTIELLEMENT REMBOURSÉE
                    </span>
                  </div>
                ) : paymentStatus.soldee ? (
                  <div className="text-center mt-3 p-2 bg-green-100 border border-green-300 rounded">
                    <span className="text-green-700 font-bold text-sm">
                      FACTURE ACQUITTÉE
                    </span>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </section>

      {/* ★ MENTION D'EXONÉRATION — OBLIGATOIRE sur toute facture sans TVA.
          Elle était absente : une livraison intracommunautaire, une exportation ou une
          livraison outre-mer partaient à 0 % sans dire POURQUOI, ce qui rend la facture
          irrégulière et expose l'acheteur comme le vendeur en cas de contrôle.
          Le texte est celui qu'a arrêté le serveur au moment de la vente (art. 262 ter I,
          262 I ou 294 selon le cas), FIGÉ sur la commande puis recopié — jamais
          re-déduit du régime, ce qui faisait porter la mention d'exportation hors UE à
          une livraison en Guadeloupe. */}
      {invoice.vat_mention && (
        <section className="mb-6">
          <div className="border border-gray-400 rounded p-3 text-sm">
            <span className="font-semibold">Régime de TVA : </span>
            {invoice.vat_mention}
          </div>
        </section>
      )}

      {/* --- Pied de page légal --- */}
      <footer className="border-t border-gray-300 pt-5 text-xs text-gray-500">
        <div className="mb-3 font-semibold text-gray-700">
          {vendeur.nom} - {vendeur.formeJuridique} au capital de {vendeur.capital} € -
          SIRET : {vendeur.siret} - RCS {vendeur.rcs} - N° TVA : {vendeur.tva}
        </div>
        <p className="mb-2">
          <span className="font-semibold">
            {estAvoir ? 'Modalités de remboursement :' : 'Conditions de paiement :'}
          </span>{' '}
          {conditionsReglement}
        </p>
        {/* Les coordonnées bancaires viennent des réglages : une facture réglable par
            virement sans IBAN oblige le client à appeler pour payer. Masquées quand
            elles ne sont pas renseignées, plutôt qu'imprimées vides. */}
        {!estAvoir && iban && (
          <p className="mb-2">
            <span className="font-semibold">Coordonnées bancaires :</span> IBAN {iban}
            {bic ? ` — BIC ${bic}` : ''}
          </p>
        )}
        <p className="mb-2">
          <span className="font-semibold">Pénalités de retard :</span> En cas de retard de paiement, seront exigibles, conformément à l'article L. 441-10 du Code de commerce, une indemnité calculée sur la base de trois fois le taux de l'intérêt légal en vigueur ainsi qu'une indemnité forfaitaire pour frais de recouvrement de 40 euros.
        </p>
        <p className="mb-2">
          <span className="font-semibold">Clause de réserve de propriété :</span> Le vendeur reste propriétaire des biens vendus jusqu'au paiement complet de leur prix.
        </p>
        <p className="mb-2">
          <span className="font-semibold">Garanties légales :</span> Le consommateur bénéficie de la garantie légale de conformité (articles L. 217-4 à L. 217-14 du Code de la consommation) et de la garantie des vices cachés (articles 1641 à 1649 du Code civil).
        </p>
        {/* Mentions de la société lues dans les RÉGLAGES (Admin → Facturation) : elles
            s'y modifient sans redéploiement. */}
        {nonVide(billingSettings?.legal_mentions ?? invoice.legal_mentions) && (
          <p className="mb-2">
            {billingSettings?.legal_mentions || invoice.legal_mentions}
          </p>
        )}
        {/* Assurance RC Pro et médiateur : imprimés SEULEMENT s'ils sont renseignés.
            Un gabarit « [À compléter] » sur une facture remise au client est pire que
            l'absence de mention — voir `src/config/legalInfo.ts`. */}
        {getInvoiceLegalFooter() && (
          <p className="text-xs text-gray-400 mt-3">{getInvoiceLegalFooter()}</p>
        )}
      </footer>
    </div>
  );
};

export default InvoicePDF;
