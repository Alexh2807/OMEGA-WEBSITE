/**
 * Orchestration de la facturation électronique (Factur-X).
 *
 * GARDE-FOU CENTRAL : la transmission officielle à une PA n'a lieu QUE si le
 * mode résolu est "live". Un paiement de test (stripeLivemode === false) force
 * le mode "test" → statut "sandbox", aucune transmission.
 */
import { supabase } from '../../lib/supabase';
import { Invoice } from '../../types/billing';
import { facturxInputFromInvoice } from '../../utils/facturx/fromInvoice';
import { buildFacturXXml } from '../../utils/facturx/buildCII';
import { buildFacturXPdf } from '../../utils/facturx/buildFacturXPdf';
import {
  resolveEInvoiceMode,
  canTransmitToPA,
  getConfiguredEInvoiceMode,
  EInvoiceMode,
} from '../../utils/einvoice/mode';
import { EInvoiceStatus } from '../../types/einvoice';

export interface EmitOptions {
  /** paymentIntent.livemode de Stripe (true = vrai paiement). */
  stripeLivemode?: boolean | null;
  /** Override du mode configuré (sinon lu depuis VITE_EINVOICE_MODE). */
  configuredMode?: string;
}

export interface EmitResult {
  mode: EInvoiceMode;
  status: EInvoiceStatus;
  einvoiceId?: string;
  xml: string;
  pdfBytes: Uint8Array;
  transmitted: boolean;
  paReference?: string;
  storeError?: string;
  /** Message d'information sur la transmission (ex. PA non configurée). */
  transmitMessage?: string;
}

/** Encode des octets en base64 (par blocs, sûr pour les gros PDF). */
const bytesToBase64 = (bytes: Uint8Array): string => {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
};

/**
 * Génère le Factur-X d'une facture, le stocke, et (uniquement en live) le transmet.
 */
export const emitEInvoice = async (
  invoice: Invoice,
  opts: EmitOptions = {}
): Promise<EmitResult> => {
  const mode = resolveEInvoiceMode({
    configuredMode: opts.configuredMode ?? getConfiguredEInvoiceMode(),
    stripeLivemode: opts.stripeLivemode ?? null,
  });

  // 1) Génération (toujours)
  const fx = facturxInputFromInvoice(invoice);
  const xml = buildFacturXXml(fx);
  const pdfBytes = await buildFacturXPdf(fx, xml);

  // 2) Stockage en base (toujours) — le PDF est conservé en base64 pour que
  //    l'Edge Function puisse le transmettre sans regénération.
  const status: EInvoiceStatus = mode === 'test' ? 'sandbox' : 'to_transmit';

  const { data, error } = await supabase
    .from('einvoices')
    .insert({
      invoice_id: invoice.id,
      order_id: invoice.order_id ?? null,
      invoice_number: invoice.invoice_number,
      mode,
      format: 'facturx-basic',
      status,
      currency: 'EUR',
      total_ht: invoice.subtotal_ht,
      total_tva: invoice.tax_amount,
      total_ttc: invoice.total_ttc,
      xml,
      pdf_base64: bytesToBase64(pdfBytes),
      pa_provider: null,
      pa_reference: null,
      transmitted_at: null,
      error_message: null,
    })
    .select('id')
    .single();

  const result: EmitResult = {
    mode,
    status,
    einvoiceId: data?.id,
    xml,
    pdfBytes,
    transmitted: false,
    storeError: error?.message,
  };

  // 3) Transmission — UNIQUEMENT en mode live (garde-fou), via l'Edge Function
  //    `transmit-einvoice` qui détient seule les identifiants de la PA.
  if (canTransmitToPA(mode) && result.einvoiceId) {
    try {
      const { data: tx, error: fnError } = await supabase.functions.invoke(
        'transmit-einvoice',
        { body: { einvoiceId: result.einvoiceId } }
      );
      if (fnError) {
        result.transmitMessage = `Transmission PA indisponible : ${fnError.message}`;
      } else if (tx?.transmitted) {
        result.transmitted = true;
        result.status = 'transmitted';
        result.paReference = tx.reference ?? undefined;
      } else {
        result.transmitMessage = tx?.message ?? tx?.error ?? undefined;
        if (tx?.configured && tx?.error) result.status = 'error';
      }
    } catch (e: any) {
      result.transmitMessage = e?.message ?? 'Erreur de transmission PA';
    }
  }

  return result;
};

/** Déclenche le téléchargement du PDF Factur-X côté navigateur. */
export const downloadFacturXPdf = (pdfBytes: Uint8Array, invoiceNumber: string): void => {
  if (typeof document === 'undefined') return;
  const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `facturx-${invoiceNumber}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
