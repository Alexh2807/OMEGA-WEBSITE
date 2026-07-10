/**
 * Connecteur générique vers une Plateforme Agréée (PA).
 *
 * Couvre le schéma le plus répandu : OAuth2 (client_credentials) pour obtenir un
 * jeton, puis dépôt de la facture Factur-X (multipart) sur l'endpoint de la PA.
 *
 * ⚠️ Les noms de champs du dépôt (`file`, `invoiceNumber`) et le champ de la
 *    référence renvoyée varient d'une PA à l'autre : ce sont les SEULS points à
 *    ajuster une fois la PA choisie (zone "ADAPTER" ci-dessous).
 *
 * 🔒 SÉCURITÉ : ce connecteur utilise le SECRET de la PA. Il ne doit donc tourner
 *    QUE côté serveur (Edge Function), jamais dans le bundle front. Côté front,
 *    `getPaProvider()` reste sur le Sandbox.
 */
import { IPaProvider, PaTransmitInput, PaTransmitResult } from './provider';

export interface PaConfig {
  /** Nom du provider (ex. 'iopole', 'b2brouter'). */
  name: string;
  tokenUrl: string;
  depositUrl: string;
  clientId: string;
  clientSecret: string;
  scope?: string;
}

type FetchLike = typeof fetch;

export class GenericPaProvider implements IPaProvider {
  readonly name: string;

  constructor(
    private readonly cfg: PaConfig,
    private readonly fetchImpl: FetchLike = fetch
  ) {
    this.name = cfg.name;
  }

  private async getAccessToken(): Promise<string> {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.cfg.clientId,
      client_secret: this.cfg.clientSecret,
    });
    if (this.cfg.scope) body.set('scope', this.cfg.scope);

    const res = await this.fetchImpl(this.cfg.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) {
      throw new Error(`PA: échec de l'authentification (${res.status})`);
    }
    const data: any = await res.json();
    if (!data?.access_token) {
      throw new Error('PA: jeton d’accès manquant dans la réponse');
    }
    return data.access_token as string;
  }

  async transmit(input: PaTransmitInput): Promise<PaTransmitResult> {
    const token = await this.getAccessToken();

    // --- ADAPTER (selon la PA choisie) ---
    const form = new FormData();
    form.append(
      'file',
      new Blob([input.pdfBytes as BlobPart], { type: 'application/pdf' }),
      `facturx-${input.invoiceNumber}.pdf`
    );
    form.append('invoiceNumber', input.invoiceNumber);
    // --- fin ADAPTER ---

    const res = await this.fetchImpl(this.cfg.depositUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`PA: échec du dépôt (${res.status}) ${detail}`.trim());
    }
    const data: any = await res.json().catch(() => ({}));
    const reference = data?.id ?? data?.reference ?? data?.depositId;
    return { transmitted: true, reference };
  }
}
