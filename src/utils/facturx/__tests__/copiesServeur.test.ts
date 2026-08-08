/**
 * Les copies serveur de `buildCII.ts` et `categorieTva.ts` ne doivent JAMAIS diverger
 * de leurs originaux.
 *
 * Pourquoi ce test existe : une fonction Edge ne peut pas importer hors de son dossier,
 * le bundle Supabase ne suivant que les chemins relatifs internes. Les deux modules
 * Factur-X sont donc DUPLIQUÉS dans `supabase/functions/facture-pdf/facturx/`.
 *
 * Une duplication silencieuse est une bombe à retardement : on corrige un taux de TVA
 * ou un motif d'exonération d'un côté, l'autre continue de produire l'ancien XML, et
 * personne ne s'en aperçoit avant un rejet à la réception. Ce test transforme cet oubli
 * en échec de build.
 *
 * Trois différences sont ATTENDUES et neutralisées avant comparaison :
 *   · l'en-tête d'avertissement ajouté en tête de chaque copie ;
 *   · l'extension `.ts` des imports, que Deno exige et que le navigateur omet ;
 *   · les fins de ligne (CRLF sous Windows, LF dans le dépôt).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const racine = resolve(__dirname, '../../../..');

const lire = (dossier: string, nom: string): string =>
  readFileSync(resolve(racine, dossier, nom), 'utf-8').split('\r\n').join('\n');

/**
 * Retire l'en-tête de copie puis aligne les imports sur la forme navigateur.
 *
 * On enlève le PREMIER commentaire de bloc sans présumer de ses caractères de
 * décoration : une première version du test cherchait une ligne de `=`, alors que
 * l'en-tête est tracé avec des `═`. La règle est donc « le premier bloc », pas « un
 * bloc qui ressemble à ceci ».
 */
const normaliser = (source: string): string =>
  source
    .replace(/^\/\*[\s\S]*?\*\/\s*/, '')
    .replace(/^\/\/ .*SEULE différence.*\n/m, '')
    .replace(/from '(\.\/[A-Za-z]+)\.ts'/g, "from '$1'");

describe('Factur-X : les copies serveur suivent les originaux', () => {
  for (const nom of ['categorieTva.ts', 'buildCII.ts']) {
    it(`${nom} est identique à son original`, () => {
      const copie = normaliser(
        lire('supabase/functions/facture-pdf/facturx', nom)
      );
      expect(copie).toBe(lire('src/utils/facturx', nom));
    });
  }
});
