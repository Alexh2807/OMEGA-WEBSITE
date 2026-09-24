/**
 * Le VRAI formulaire d'adresse monté dans jsdom, derrière un faux client Supabase.
 *
 * Pourquoi ce test existe (24 septembre 2026) — la 1re commande réelle est arrivée avec
 * une adresse mélangée : « France » en ligne d'adresse, la rue en complément, l'adresse
 * entière dans « Nom de l'adresse » et le nom complet dans « Nom ». Recopiée telle quelle
 * sur la facture, qui est inaltérable.
 *
 * Cause : aucun champ ne portait d'attribut `autocomplete`, le remplissage automatique
 * du navigateur devinait d'après les intitulés. Le banc remplit donc le formulaire
 * COMME UN NAVIGATEUR : en cherchant chaque champ par son jeton `autocomplete`, jamais
 * par sa position ni par son intitulé. Un champ sans jeton, ou avec le mauvais, fait
 * échouer le test au lieu de recevoir la valeur d'un autre.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* ---------- Faux serveur ---------- */
let inserees: Record<string, unknown>[];

function requete(table: string) {
  const chaine: Record<string, unknown> = {
    select: () => chaine,
    eq: () => chaine,
    order: () => chaine,
    insert: (ligne: Record<string, unknown>) => {
      inserees.push(ligne);
      return Promise.resolve({ data: null, error: null });
    },
    update: () => chaine,
    then: (res: (v: unknown) => void) =>
      Promise.resolve(
        table === 'country_aliases'
          ? { data: [{ code: 'FR' }, { code: 'BE' }], error: null }
          : { data: [], error: null }
      ).then(res),
  };
  return chaine;
}
vi.mock('../../lib/supabase', () => ({
  supabase: { from: (t: string) => requete(t) },
}));
// ⚠ Utilisateur STABLE : le composant recharge ses adresses à chaque changement de
// `user` ; un objet neuf à chaque rendu le ferait boucler indéfiniment.
vi.mock('../../contexts/AuthContext', () => {
  const utilisateur = { id: 'u1' };
  return { useAuth: () => ({ user: utilisateur }) };
});
vi.mock('../../utils/paysVisiteur', () => ({
  paysPresume: () => 'France',
  codePostalPresume: () => '',
}));
vi.mock('react-hot-toast', () => ({
  default: { success: () => {}, error: () => {} },
}));

import AddressManager from '../AddressManager';

/* ---------- Montage ---------- */
let conteneur: HTMLDivElement;
let racine: Root;
// Laisse passer les promesses en attente (requêtes du faux serveur, puis rendu).
const respirer = async () => {
  await React.act(async () => {
    await new Promise(r => setTimeout(r, 0));
  });
};

beforeEach(async () => {
  inserees = [];
  (
    globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  conteneur = document.createElement('div');
  document.body.appendChild(conteneur);
  racine = createRoot(conteneur);
  await React.act(async () => {
    racine.render(<AddressManager />);
  });
  await respirer();
  // Ouvre le formulaire « Nouvelle adresse ».
  const ajouter = Array.from(conteneur.querySelectorAll('button')).find(
    b => b.textContent?.trim() === 'Ajouter'
  );
  expect(ajouter, 'bouton « Ajouter » introuvable').toBeTruthy();
  await React.act(async () => {
    ajouter!.click();
  });
});

afterEach(async () => {
  await React.act(async () => {
    racine.unmount();
  });
  conteneur.remove();
});

const formulaire = () => conteneur.querySelector('form') as HTMLFormElement;

/** Le champ que viserait un navigateur pour ce jeton — exactement un. */
function champ(jeton: string) {
  const trouves = formulaire().querySelectorAll(`[autocomplete="${jeton}"]`);
  expect(trouves.length, `champ autocomplete="${jeton}"`).toBe(1);
  return trouves[0] as HTMLInputElement | HTMLSelectElement;
}

/** Saisie « à la React » : setter natif + événement, comme le fait le navigateur. */
async function saisir(el: HTMLInputElement | HTMLSelectElement, valeur: string) {
  const proto =
    el instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, valeur);
    el.dispatchEvent(
      new Event(el instanceof HTMLSelectElement ? 'change' : 'input', {
        bubbles: true,
      })
    );
  });
}

async function soumettre() {
  await React.act(async () => {
    formulaire().requestSubmit();
  });
  await respirer();
}

/** Ce que pose un remplissage automatique : une valeur par jeton. */
const PROFIL: Record<string, string> = {
  'given-name': 'Alexis',
  'family-name': 'HIDALGO',
  'address-line1': '1 rue lou tarral',
  'postal-code': '34290',
  'address-level2': 'Montblanc',
  'country-name': 'France',
  tel: '0600000000',
};

describe('AddressManager — chaque valeur arrive dans SA colonne', () => {
  it('chaque champ porte son jeton autocomplete et un intitulé qui lui est relié', () => {
    const attendus: [string, string][] = [
      ['given-name', 'Prénom'],
      ['family-name', 'Nom'],
      ['organization', 'Société'],
      ['address-line1', 'Adresse'],
      ['address-line2', 'Complément'],
      ['postal-code', 'Code postal'],
      ['address-level2', 'Ville'],
      ['country-name', 'Pays'],
      ['tel', 'Téléphone'],
    ];
    for (const [jeton, intitule] of attendus) {
      const el = champ(jeton);
      const label = formulaire().querySelector(`label[for="${el.id}"]`);
      expect(el.id, `id du champ ${jeton}`).toBeTruthy();
      expect(label?.textContent, `intitulé du champ ${jeton}`).toContain(
        intitule
      );
    }
  });

  it('le libellé est facultatif, en fin de formulaire, et ne ressemble ni à un nom ni à une adresse', () => {
    const libelle = formulaire().querySelector(
      '#adr-libelle'
    ) as HTMLInputElement;
    expect(libelle).toBeTruthy();
    expect(libelle.required).toBe(false);
    // Aucun des mots sur lesquels les navigateurs devinent un nom ou une adresse.
    const indices = [
      libelle.id,
      libelle.name,
      libelle.getAttribute('autocomplete') || '',
      formulaire().querySelector('label[for="adr-libelle"]')?.textContent ||
        '',
    ].join(' ');
    expect(indices).not.toMatch(/nom|name|adres|addr|street|rue/i);
    // Après tous les champs d'adresse : le dernier champ texte avant la case « par défaut ».
    const textes = Array.from(
      formulaire().querySelectorAll('input:not([type="checkbox"]), select')
    );
    expect(textes[textes.length - 1]).toBe(libelle);
  });

  it('★ rempli comme par un navigateur, chaque valeur arrive dans sa colonne', async () => {
    for (const [jeton, valeur] of Object.entries(PROFIL)) {
      await saisir(champ(jeton), valeur);
    }
    await soumettre();

    expect(inserees).toHaveLength(1);
    expect(inserees[0]).toMatchObject({
      user_id: 'u1',
      first_name: 'Alexis',
      last_name: 'HIDALGO',
      address_line_1: '1 rue lou tarral',
      address_line_2: '',
      postal_code: '34290',
      city: 'Montblanc',
      country: 'France',
      phone: '0600000000',
      // Libellé laissé vide : valeur par défaut de la colonne, jamais une chaîne vide.
      name: 'Adresse principale',
    });
  });

  it('un libellé saisi est conservé tel quel (sans espaces autour)', async () => {
    for (const [jeton, valeur] of Object.entries(PROFIL)) {
      await saisir(champ(jeton), valeur);
    }
    await saisir(
      formulaire().querySelector('#adr-libelle') as HTMLInputElement,
      '  Bureau  '
    );
    await soumettre();

    expect(inserees).toHaveLength(1);
    expect(inserees[0].name).toBe('Bureau');
  });
});
