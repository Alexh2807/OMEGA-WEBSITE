// Remplace denomailer : on capture le message au lieu de l'envoyer.
export class SMTPClient {
  constructor() {}
  async send(m) {
    globalThis.__envois.push(m);
  }
  async close() {}
}
