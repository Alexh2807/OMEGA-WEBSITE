/**
 * Garde-fou TEST / PROD pour la facturation électronique.
 *
 * Règle de sécurité absolue : une facture n'est transmise officiellement à une
 * Plateforme Agréée (PA) QUE si le mode est "live". Tout paiement Stripe de test
 * (livemode === false) force le mode "test", même si l'application est configurée
 * en production. Ainsi, un paiement TEST ne génère JAMAIS de facture officielle.
 */

export type EInvoiceMode = 'test' | 'live';

export interface ResolveModeOptions {
  /** Valeur de configuration (ex. import.meta.env.VITE_EINVOICE_MODE). */
  configuredMode?: string | null;
  /** paymentIntent.livemode renvoyé par Stripe (true = vrai paiement). */
  stripeLivemode?: boolean | null;
}

const LIVE_VALUES = ['live', 'prod', 'production'];

/**
 * Détermine le mode effectif. Fonction PURE (testable).
 *
 * - Par défaut : "test".
 * - "live" uniquement si configuré en live ET (livemode non false).
 * - Un paiement de test (livemode === false) force "test".
 */
export const resolveEInvoiceMode = (opts: ResolveModeOptions): EInvoiceMode => {
  const configured = (opts.configuredMode ?? 'test').toString().trim().toLowerCase();

  if (!LIVE_VALUES.includes(configured)) {
    return 'test';
  }
  if (opts.stripeLivemode === false) {
    return 'test';
  }
  return 'live';
};

/** Vrai UNIQUEMENT si l'on peut transmettre officiellement à une PA. */
export const canTransmitToPA = (mode: EInvoiceMode): boolean => mode === 'live';

/** Lit le mode configuré côté front (Vite). Défaut "test". */
export const getConfiguredEInvoiceMode = (): string => {
  const v = (import.meta as any).env?.VITE_EINVOICE_MODE as string | undefined;
  return v ?? 'test';
};
