import { IPaProvider, PaTransmitInput, PaTransmitResult } from './provider';

/**
 * Provider "bac à sable" : génère/garde la facture mais NE TRANSMET RIEN
 * à une plateforme officielle. Utilisé tant qu'aucune PA réelle n'est branchée.
 */
export class SandboxProvider implements IPaProvider {
  readonly name = 'sandbox';

  async transmit(_input: PaTransmitInput): Promise<PaTransmitResult> {
    return { transmitted: false };
  }
}
