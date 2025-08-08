import React from 'react';
import { Invoice } from '../types/billing';

interface InvoicePDFProps {
  invoice: Invoice;
  billingSettings?: any;
}

const InvoicePDF: React.FC<InvoicePDFProps> = ({
  invoice,
  billingSettings,
}) => {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  // Calculer le statut de paiement réel
  const paymentStatus = (() => {
    const actualAmountPaid = (invoice.payment_records || [])
      .filter(payment => payment.payment_method !== 'refund')
      .reduce((sum, payment) => sum + payment.amount, 0);
    const totalRefunded = (invoice.refunds || [])
      .filter(refund => refund.status === 'succeeded')
      .reduce((sum, refund) => sum + refund.amount, 0);
    const netToPay = Math.max(0, invoice.total_ttc - actualAmountPaid + totalRefunded);
    const isFullyPaid = netToPay <= 0;
    const isRefunded = invoice.status === 'refunded';
    const hasPartialRefund = totalRefunded > 0 && !isRefunded;
    return {
      amountPaid: actualAmountPaid,
      totalRefunded,
      netToPay,
      isFullyPaid,
      isRefunded,
      hasPartialRefund,
    };
  })();

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
            src="/Logo-omega-hq-transparent.png"
            alt="OMEGA Logo"
            className="h-16 mb-4"
          />
          <div className="font-bold text-xl">OMEGA</div>
          <div className="text-sm text-gray-500">Fabricant français depuis 1996</div>
        </div>
        <div className="text-right">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">FACTURE</h1>
          <div className="text-md font-semibold text-gray-700">N° {invoice.invoice_number}</div>
          <div className="text-sm text-gray-600 mt-2">Date d'émission : {formatDate(invoice.created_at)}</div>
          {invoice.paid_at && (
            <div className="text-sm font-bold text-green-600">
              Facture acquittée le : {formatDate(invoice.paid_at)}
            </div>
          )}
          {invoice.order_id && (
            <div className="text-sm text-gray-600">Commande N° : {invoice.order_id.slice(0, 8)}</div>
          )}
        </div>
      </header>

      {/* --- Informations Vendeur & Client --- */}
      <section className="grid grid-cols-2 gap-10 mb-10">
        <div>
          <h3 className="text-sm font-bold text-gray-500 tracking-wider mb-2">VENDEUR</h3>
          <div className="text-sm">
            <div className="font-bold text-md">OMEGA</div>
            <div className="text-gray-600">Société à responsabilité limitée (SARL)</div>
            <div className="mt-2">
              LOT ARTISANAL COMMUNAL
              <br />
              34290 MONTBLANC
            </div>
          </div>
        </div>
        <div>
          <h3 className="text-sm font-bold text-gray-500 tracking-wider mb-2">FACTURÉ À</h3>
          <div className="text-sm">
            <div className="font-bold text-md">{invoice.customer_name}</div>
            {invoice.billing_address?.company && (
              <div className="text-gray-600">
                {invoice.billing_address.company}
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
            {(invoice.billing_address as any)?.vat_number && (
              <div className="mt-2">
                <span className="font-semibold">N° TVA :</span>{' '}
                {(invoice.billing_address as any).vat_number}
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
              <th className="p-2 text-right font-semibold w-32">P.U. HT</th>
              <th className="p-2 text-right font-semibold w-32">Total HT</th>
            </tr>
          </thead>
          <tbody className="bg-gray-50">
            {(invoice.invoice_items || []).map(item => (
              <tr key={item.id} className="border-b border-gray-200">
                <td className="p-2 align-top">{item.description}</td>
                <td className="p-2 text-center align-top">{item.quantity}</td>
                <td className="p-2 text-right align-top">
                  {item.unit_price_ht.toFixed(2)} €
                </td>
                <td className="p-2 text-right align-top font-semibold">
                  {item.total_ht.toFixed(2)} €
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* --- Totaux --- */}
      <section className="flex justify-end mb-10">
        <div className="w-80 text-sm">
          <div className="bg-gray-50 p-3 rounded">
            <div className="flex justify-between mb-1">
              <span>Sous-total HT</span>
              <span>{invoice.subtotal_ht.toFixed(2)} €</span>
            </div>
            <div className="flex justify-between mb-2">
              <span>TVA (20%)</span>
              <span>{invoice.tax_amount.toFixed(2)} €</span>
            </div>
            <div className="flex justify-between font-bold text-lg border-t-2 border-gray-800 pt-2">
              <span>TOTAL TTC</span>
              <span>{invoice.total_ttc.toFixed(2)} €</span>
            </div>
            {paymentStatus.amountPaid > 0 && (
              <div className="flex justify-between mt-2 text-green-600 font-semibold">
                <span>Montant Payé</span>
                <span>- {paymentStatus.amountPaid.toFixed(2)} €</span>
              </div>
            )}
            {paymentStatus.totalRefunded > 0 && (
              <div className="flex justify-between mt-1 text-orange-600 font-semibold text-sm">
                <span>Montant Remboursé</span>
                <span>+ {paymentStatus.totalRefunded.toFixed(2)} €</span>
              </div>
            )}
            <div
              className={`flex justify-between mt-2 font-bold text-lg ${
                paymentStatus.isRefunded
                  ? 'text-orange-600'
                  : paymentStatus.isFullyPaid
                    ? 'text-green-600'
                    : 'text-red-600'
              }`}
            >
              <span>NET À PAYER</span>
              <span>
                {paymentStatus.isRefunded
                  ? 'REMBOURSÉE'
                  : `${paymentStatus.netToPay.toFixed(2)} €`}
              </span>
            </div>
            {paymentStatus.isRefunded ? (
              <div className="text-center mt-3 p-2 bg-orange-100 border border-orange-300 rounded">
                <span className="text-orange-700 font-bold text-sm">
                  FACTURE REMBOURSÉE
                </span>
              </div>
            ) : paymentStatus.isFullyPaid ? (
              <div className="text-center mt-3 p-2 bg-green-100 border border-green-300 rounded">
                <span className="text-green-700 font-bold text-sm">
                  FACTURE ACQUITTÉE
                </span>
              </div>
            ) : paymentStatus.hasPartialRefund ? (
              <div className="text-center mt-3 p-2 bg-blue-100 border border-blue-300 rounded">
                <span className="text-blue-700 font-bold text-sm">
                  PARTIELLEMENT REMBOURSÉE
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* --- Pied de page légal --- */}
      <footer className="border-t border-gray-300 pt-5 text-xs text-gray-500">
        <p className="mb-2">
          En cas de vente à un professionnel, pénalités de retard applicables au taux de 3 fois le taux d'intérêt légal et indemnité forfaitaire pour frais de recouvrement de 40€.
        </p>
        <p>
          Le vendeur reste propriétaire des biens vendus jusqu'au paiement complet de leur prix.
        </p>
        <p className="mt-2">
          Pour les biens vendus, le consommateur bénéficie de la garantie légale de conformité pour une durée de deux ans à compter de la délivrance du bien (articles L. 217-3 et suivants du code de la consommation).
        </p>
      </footer>
    </div>
  );
};

export default InvoicePDF;
