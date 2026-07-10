/**
 * Interface d'une Plateforme Agréée (PA). Permet de brancher une vraie PA
 * (Iopole, B2Brouter, Storecove…) plus tard sans toucher au reste du code.
 */
import { SandboxProvider } from './sandboxProvider';

export interface PaTransmitInput {
  xml: string;
  pdfBytes: Uint8Array;
  invoiceNumber: string;
}

export interface PaTransmitResult {
  transmitted: boolean;
  /** Référence renvoyée par la PA (id de dépôt). */
  reference?: string;
}

export interface IPaProvider {
  /** Nom du provider (stocké dans einvoices.pa_provider). */
  readonly name: string;
  transmit(input: PaTransmitInput): Promise<PaTransmitResult>;
}

/**
 * Retourne le provider PA actif.
 * Tant qu'aucune PA réelle n'est configurée → SandboxProvider (ne transmet rien).
 */
export const getPaProvider = (): IPaProvider => {
  return new SandboxProvider();
};
