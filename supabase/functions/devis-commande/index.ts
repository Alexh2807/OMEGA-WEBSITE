/*
  DEVIS DE COMMANDE — le serveur arrête le montant, puis crée le paiement.

  ## La faille que ceci ferme
  Avant, le navigateur appelait `create-payment-intent` avec le montant de son choix, et
  insérait ensuite la commande avec les totaux de son choix. On pouvait payer 0,50 € une
  machine à 2 000 €. Le contrôle `verify_jwt` n'y changeait rien : la clé anon est un
  jeton valide et elle est publique (elle est dans le bundle du site).

  ## Le principe
  Le navigateur n'envoie plus que **des identifiants** — produits, quantités, adresse,
  code de l'offre de livraison. Tout le reste — prix, remise pro, TVA, frais de port — est
  relu ou recalculé ici, à partir de la base. Le résultat est enregistré dans
  `order_quotes` (table où le client ne peut PAS écrire), et c'est ce devis qui sert à
  créer le PaymentIntent puis la commande.

  ⚠ RÈGLE ABSOLUE : le navigateur ne transmet JAMAIS un prix de port. Il transmet le CODE
  d'une offre (`colissimo_domicile`, `chronopost_chrono13`, `retrait_depot`…) ; le tarif
  est relu ici dans le même moteur que celui qui a servi à l'afficher.

  ## `shipping.ts` est une COPIE CONFORME de `src/utils/shipping.ts`
  Le fichier voisin est un octet-pour-octet du module du site — `diff` doit rendre vide.
  Il n'y a aucune autre façon de garantir que le prix affiché et le prix facturé sont le
  même nombre. La v2 de cette copie était restée en arrière : un colis de 5 kg vers La
  Réunion était facturé 7,99 € côté serveur alors que La Poste facture 38,90 €, et le
  navigateur, lui, affichait déjà le bon prix. À chaque évolution de `src/utils/shipping.ts`,
  RECOPIER le fichier — ne jamais le « réadapter ».

  ## Fiabilité dans le temps (demande explicite : « ne plus jamais toucher au code »)
  Rien n'est écrit en dur ici :
   · les prix viennent de `products` ;
   · les taux de TVA de `eu_vat_rates` (modifiable par l'admin) ;
   · le régime fiscal de la fonction SQL `regime_tva` — source unique ;
   · le barème de port de `site_settings` (+ grilles transporteurs du module partagé) ;
   · la validité du numéro de TVA de `profiles`, alimentée par la vérification VIES.
  Un changement de taux, de prix ou de barème se fait donc en base, sans redéploiement.
*/
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'npm:stripe@14.24.0';
import {
  computeShipping,
  listerOffresLivraison,
  normalizeShippingConfig,
  type OffreLivraison,
  type ShippingLine,
} from './shipping.ts';

/* ─────────────────────────────────────────────────────────────────────────────
   CORS — liste blanche, et non « * »
   `Access-Control-Allow-Origin: *` autorisait n'importe quelle page du web à appeler
   cette fonction avec la clé anon (publique, présente dans le bundle du site). Le JWT
   utilisateur reste indispensable, mais rien n'obligeait à offrir la surface : une page
   hostile ouverte par un client connecté pouvait déclencher des devis en son nom.
   ⚠ `CORS_EXTRA_ORIGINS` (liste séparée par des virgules) permet d'ajouter l'origine de
   développement — `http://localhost:5173` — SANS toucher au code.
   ───────────────────────────────────────────────────────────────────────────── */
const ORIGINES = [
  'https://omegasud.fr',
  'https://www.omegasud.fr',
  'https://omegasud.netlify.app', // préproduction Netlify
  ...(Deno.env.get('CORS_EXTRA_ORIGINS') || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
];

const enTetesCors = (req: Request) => {
  const origine = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ORIGINES.includes(origine) ? origine : ORIGINES[0],
    /* ⚠ `idempotency-key` DOIT figurer ici. Le navigateur l'envoie pour qu'un double clic
       sur « Payer » ne crée pas deux paiements. Sans cette autorisation, le contrôle
       préalable (preflight) échoue et le navigateur n'envoie JAMAIS la requête : plus aucun
       client ne peut commander. Rien ne le montre côté serveur — seul un vrai navigateur
       le révèle. */
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, idempotency-key',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    // Sans `Vary`, un cache intermédiaire servirait l'en-tête calculé pour une AUTRE origine.
    Vary: 'Origin',
  };
};

/** Arrondi au centime — jamais de flottant qui traîne dans un montant facturé. */
const cts = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Fraîcheur maximale d'une vérification VIES pour accorder l'exonération (jours). */
const FRAICHEUR_VIES_JOURS = 30;

/** Un point relais tel qu'on accepte de l'enregistrer : rien d'autre ne passe. */
function assainirRelais(brut: unknown): Record<string, string> | null {
  if (!brut || typeof brut !== 'object') return null;
  const src = brut as Record<string, unknown>;
  const texte = (v: unknown) => String(v ?? '').trim().slice(0, 200);
  const relais = {
    id: texte(src.id ?? src.code),
    nom: texte(src.nom ?? src.name),
    adresse: texte(src.adresse ?? src.address),
    code_postal: texte(src.code_postal ?? src.postal_code),
    ville: texte(src.ville ?? src.city),
  };
  // Un relais sans identifiant n'est pas un relais : on n'enregistre pas du vide.
  return relais.id ? relais : null;
}

Deno.serve(async (req: Request) => {
  const cors = enTetesCors(req);
  const reponse = (corps: unknown, statut = 200) =>
    new Response(JSON.stringify(corps), {
      status: statut,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // ---- 1. Qui appelle ? (jamais l'identité annoncée par le client) ----
    const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || '';
    const { data: u } = await admin.auth.getUser(jwt);
    const user = u?.user;
    if (!user) return reponse({ error: 'Connectez-vous pour commander.' }, 401);

    const body = await req.json();
    const items: Array<{ product_id: string; quantity: number }> = Array.isArray(body?.items) ? body.items : [];
    const addressId: string | null = body?.address_id ?? null;
    const express = body?.express === true;
    /* ★ L'OFFRE DE LIVRAISON CHOISIE — un CODE, jamais un prix.
       Le client arbitre entre domicile, express, relais et retrait ; c'est lui qui décide,
       mais c'est le serveur qui chiffre. Un code inconnu ou une offre non proposable pour
       cette destination sont refusés : on ne se rabat pas silencieusement sur autre chose,
       sinon le client paierait un transport qu'il n'a pas choisi. */
    /* Deux noms circulent pour le même champ : `service` (contrat serveur) et
       `shipping_service` (nom employé par le panier, aligné sur la colonne de la
       commande). On accepte les deux plutôt que d'imposer un renommage des deux côtés :
       un désaccord de nommage ferait silencieusement retomber le devis sur le mode par
       défaut, et le client serait facturé un transport qu'il n'a pas choisi. */
    const serviceDemande =
      String(body?.service || body?.shipping_service || '').trim().slice(0, 60) || null;
    const relaisDemande = assainirRelais(body?.relais);
    /* APERÇU : le panier a besoin du taux et du total DÈS que l'adresse est choisie —
       sinon il affiche « TVA selon votre adresse » jusqu'au bout, ce qui n'apprend rien
       au client. En aperçu on calcule tout, mais on n'enregistre AUCUN devis et on ne
       crée AUCUN paiement : ouvrir son panier ne doit pas semer des PaymentIntents. */
    const apercu = body?.apercu === true;

    if (!items.length) return reponse({ error: 'Panier vide.' }, 400);
    if (items.length > 50) return reponse({ error: 'Trop d\'articles.' }, 400);

    // ---- 2. Adresse : elle doit APPARTENIR à l'appelant ----
    let adresse: Record<string, unknown> | null = null;
    if (addressId) {
      const { data } = await admin
        .from('shipping_addresses').select('*').eq('id', addressId).eq('user_id', user.id).maybeSingle();
      if (!data) return reponse({ error: 'Adresse de livraison introuvable.' }, 400);
      adresse = data;
    }
    if (!adresse) return reponse({ error: 'Sélectionnez une adresse de livraison.' }, 400);

    // ---- 3. Produits : prix et disponibilité relus EN BASE ----
    const ids = [...new Set(items.map(i => String(i.product_id)))];
    const { data: produits } = await admin
      .from('products')
      .select('id, name, price, price_ht, weight_kg, shipping_class, in_stock, stock_quantity, product_type')
      .in('id', ids);
    const parId = new Map((produits || []).map(p => [p.id, p]));

    const lignes: Array<{ product_id: string; name: string; quantity: number; unit_ht: number }> = [];
    const lignesPort: ShippingLine[] = [];
    for (const it of items) {
      const p = parId.get(String(it.product_id));
      const q = Math.max(1, Math.min(999, Math.floor(Number(it.quantity) || 0)));
      if (!p) return reponse({ error: 'Un produit du panier n\'existe plus.' }, 400);
      if (p.in_stock === false) return reponse({ error: `« ${p.name} » n'est plus disponible.` }, 409);
      if (p.stock_quantity != null && p.stock_quantity < q) {
        return reponse({ error: `Stock insuffisant pour « ${p.name} » (${p.stock_quantity} restant).` }, 409);
      }
      // `price` est TTC (TVA 20 % incluse), `price_ht` prioritaire s'il est renseigné.
      const unitHt = cts(p.price_ht != null ? Number(p.price_ht) : Number(p.price || 0) / 1.2);
      if (!(unitHt > 0)) return reponse({ error: `Prix indisponible pour « ${p.name} ».` }, 409);
      lignes.push({ product_id: p.id, name: p.name, quantity: q, unit_ht: unitHt });
      lignesPort.push({
        shipping_class: (p.shipping_class === 'large' ? 'large' : 'small'),
        weight_kg: Number(p.weight_kg) || 0,
        quantity: q,
        // Licence logiciel : rien à transporter, la ligne sort du calcul de port.
        dematerialise: p.product_type === 'licence',
        /* Le prix HT ne sert QU'au franco de port. Les dimensions ne sont volontairement
           PAS transmises : `products.dimensions` est un jsonb historique dont l'unité
           n'est pas garantie, et le module refuse — à raison — de facturer un poids
           volumétrique déduit d'une donnée incertaine. Le navigateur ne les passe pas
           davantage : les deux calculs restent identiques. */
        unit_price_ht: unitHt,
      });
    }

    // ---- 4. Statut fiscal : lu SUR LE PROFIL, pas déclaré par le client ----
    const { data: profil } = await admin
      .from('profiles')
      .select('is_company, company_name, vat_number, vat_number_valid, vat_name_match, vat_checked_name, vat_checked_at, vat_exempt_override')
      .eq('id', user.id).maybeSingle();
    const estEntreprise = profil?.is_company === true;
    // ⚠ La validité vient de la vérification VIES enregistrée côté serveur. Un client qui
    // prétendrait avoir un numéro valide n'obtiendrait rien : ce champ n'est écrit que par
    // la fonction `verifier-tva`.
    let tvaValide = profil?.vat_number_valid === true;
    let nomVies = profil?.vat_checked_name ?? null;
    let concordanceNom: boolean | null = profil?.vat_name_match ?? null;
    let dateVerifVies: string | null = profil?.vat_checked_at ?? null;
    let viesPerime = false;

    /* ★ FRAÎCHEUR DE LA VÉRIFICATION VIES — un cache ne vaut pas une preuve.
       Un numéro intracommunautaire peut être révoqué du jour au lendemain (radiation,
       liquidation, retrait par l'administration). Accorder 0 % sur une vérification
       vieille de six mois, c'est engager le vendeur : en contrôle, c'est LUI qui doit la
       TVA non collectée. Au-delà de 30 jours on redemande donc le verdict à VIES.
       ⚠ Si VIES est injoignable, `verifier-tva` répond `valide: null` — et l'on facture
       20 %. C'est la position prudente, déjà celle du reste du site : mieux vaut facturer
       la TVA et régulariser ensuite que l'inverse. */
    if (estEntreprise && tvaValide && profil?.vat_number) {
      const ageMs = dateVerifVies ? Date.now() - new Date(dateVerifVies).getTime() : Infinity;
      if (!(ageMs < FRAICHEUR_VIES_JOURS * 86400000)) {
        viesPerime = true;
        try {
          const r = await fetch(
            `${Deno.env.get('SUPABASE_URL')}/functions/v1/verifier-tva`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
              body: JSON.stringify({ vat_number: profil.vat_number }),
            }
          );
          const v = await r.json().catch(() => null);
          // `valide === true` seulement : `false` (radié) comme `null` (VIES muet) retirent
          // l'exonération. On ne devine jamais à la place du fichier européen.
          tvaValide = v?.valide === true;
        } catch (e) {
          console.error('devis-commande : VIES injoignable, TVA maintenue', e);
          tvaValide = false;
        }
        // On relit le VERDICT en base — jamais la réponse HTTP — puisque `verifier-tva`
        // est la seule à avoir le droit d'écrire ces trois champs.
        const { data: frais } = await admin
          .from('profiles')
          .select('vat_number_valid, vat_name_match, vat_checked_name, vat_checked_at')
          .eq('id', user.id).maybeSingle();
        if (frais) {
          tvaValide = frais.vat_number_valid === true;
          concordanceNom = frais.vat_name_match ?? null;
          nomVies = frais.vat_checked_name ?? null;
          dateVerifVies = frais.vat_checked_at ?? null;
        }
      }
    }

    /* ⚠ Le formulaire d'adresse enregistre un NOM de pays (« Allemagne », « Suisse »),
       pas un code ISO. Prendre les deux premières lettres — ce que faisait la première
       version — donnait « Allemagne » → AL, pays inconnu, donc EXPORT À 0 % : un client
       allemand échappait à la TVA. On passe par le référentiel (table `country_aliases`),
       et un pays non reconnu BLOQUE la commande au lieu de produire une TVA au hasard. */
    const paysBrut = String((adresse as any).country || '');
    const { data: codeIso } = await admin.rpc('code_pays', { p: paysBrut });
    const pays = codeIso as string | null;
    if (!pays) {
      return reponse({
        error: `Nous ne desservons pas encore « ${paysBrut} ». Contactez-nous pour un devis.`,
      }, 409);
    }
    const cp = String((adresse as any).postal_code || '');

    /* ★ IDENTITÉ DE L'ACQUÉREUR — le numéro de TVA ne suffit pas.
       Les numéros intracommunautaires sont PUBLICS : reprendre celui d'une autre société
       passait la vérification VIES et donnait 0 %. Et si l'exonération est appliquée à
       tort, c'est le VENDEUR qui doit la TVA à l'État, sur une somme jamais encaissée.
       Deux rattachements possibles :
         · le nom que VIES associe au numéro correspond à la raison sociale déclarée ;
         · à défaut SEULEMENT, la livraison est adressée à cette société.

       ★★ L'ORDRE DES BRANCHES EST LE VERROU LUI-MÊME.
       La version précédente testait `memeSociete === true` AVANT `vat_name_match === false`.
       Or `memeSociete` compare deux champs que le CLIENT saisit tous les deux : la raison
       sociale de son profil et le champ « société » de son adresse de livraison. Recopier
       l'un dans l'autre suffisait donc à écraser un refus formel de VIES et à obtenir 0 %.
       Le verdict du fichier européen prime désormais dans les DEUX sens ; la concordance
       déclarative ne sert que lorsque VIES ne dit rien (`null`), c'est-à-dire pour les
       États membres qui ne divulguent pas le nom du titulaire (l'Allemagne au premier chef). */
    const societeLivraison = String((adresse as any).company || '').trim();
    const { data: memeSociete } = societeLivraison && profil?.company_name
      ? await admin.rpc('noms_concordent', {
          p_declare: societeLivraison, p_vies: profil.company_name,
        })
      : { data: null };
    const identiteOk =
      concordanceNom === true ? true
      : concordanceNom === false ? false
      : memeSociete === true ? true
      : null;

    /* ★ VERROU D'ADRESSE — c'est lui qui ôte tout intérêt à l'usurpation d'un numéro.
       Même en devinant la raison sociale du titulaire, il faut se faire livrer là où la
       société est établie : chez elle, donc, et pas chez soi.
       L'adresse enregistrée par VIES est conservée dans `vies_checks`, table réservée aux
       administrateurs — elle ne transite jamais par le navigateur du client. */
    let adresseOk: boolean | null = null;
    let preuveVies: { checked_at?: string; company_name?: string; company_address?: string } | null = null;
    if (estEntreprise && tvaValide && profil?.vat_number) {
      const { data: fiche } = await admin
        .from('vies_checks').select('company_name, company_address, checked_at')
        .eq('vat_number', profil.vat_number).maybeSingle();
      /* ★ On FIGE la réponse de VIES sur le devis, donc sur la commande. Le cache est
         rafraîchi toutes les 24 h : sans cette copie, on ne pourrait plus prouver dans
         deux ans ce que le fichier européen répondait le jour de la vente — c'est
         pourtant ce qui établit la bonne foi du vendeur en cas de contrôle. */
      preuveVies = fiche as any;
      const { data: concordanceAdr } = await admin.rpc('adresses_concordent', {
        p_adresse_vies: fiche?.company_address ?? null,
        p_code_postal: cp,
        p_ville: String((adresse as any).city || ''),
      });
      adresseOk = concordanceAdr ?? null;
    }

    const { data: reg } = await admin.rpc('regime_tva', {
      p_pays: pays, p_entreprise: estEntreprise, p_vat_valide: tvaValide, p_code_postal: cp,
      p_vat_number: profil?.vat_number ?? null, p_identite_ok: identiteOk,
      p_adresse_ok: adresseOk, p_derogation: profil?.vat_exempt_override === true,
    });
    const regime = reg?.[0]?.regime || 'fr';
    const taux = Number(reg?.[0]?.taux ?? 20);
    const mention = reg?.[0]?.mention ?? null;
    // ★ Le territoire fiscal est TOUJOURS renseigné depuis la migration 20260805030000.
    // C'est lui, et non une recherche de « 294 » dans un texte libre, qui dira plus tard
    // à la comptabilité qu'il s'agit d'une livraison outre-mer et non d'une exportation.
    const territoire = reg?.[0]?.territoire ?? null;
    // Motif du refus d'exonération : le client doit savoir POURQUOI on lui facture la TVA.
    let refusExoneration = reg?.[0]?.refus ?? null;
    if (!refusExoneration && viesPerime && estEntreprise && !tvaValide) {
      refusExoneration =
        `Votre numéro de TVA n'a pas pu être revalidé auprès du service européen VIES ` +
        `(dernière vérification concluante il y a plus de ${FRAICHEUR_VIES_JOURS} jours). ` +
        `La TVA est facturée ; contactez-nous pour la régulariser.`;
    }

    // ---- 5. Frais de port : MÊME code que l'affichage, jamais une seconde version ----
    // ⚠ La clé est `shipping_config` (et le format stocké peut être l'ancien :
    // `normalizeShippingConfig` s'en charge — c'est la MÊME fonction que le site, donc
    // aucun risque d'interpréter le barème différemment de ce qui est affiché).
    const { data: reglages } = await admin
      .from('site_settings').select('value').eq('key', 'shipping_config').maybeSingle();
    const config = normalizeShippingConfig((reglages as any)?.value);
    /* ⚠ Le module de livraison raisonne en NOMS de pays (« Allemagne », « Belgique »),
       pas en codes. On lui redonne donc la valeur telle qu'elle a été saisie, pas le code
       ISO — sinon toutes les destinations européennes basculeraient en « devis nécessaire ».
       C'est le même code que celui du site : le prix affiché et le prix facturé ne
       peuvent pas diverger. */
    const destination = { country: paysBrut || 'France', postal_code: cp };
    const produitsHt = cts(lignes.reduce((s, l) => s + l.unit_ht * l.quantity, 0));
    const optionsPort = {
      express,
      destinataire: (estEntreprise ? 'entreprise' : 'particulier') as 'entreprise' | 'particulier',
      montant_ht: produitsHt,
    };
    const offres = listerOffresLivraison(lignesPort, destination, config, optionsPort);
    const parDefaut = computeShipping(lignesPort, destination, config, optionsPort);

    /* ★ PANIER 100 % DÉMATÉRIALISÉ (licence logiciel).
       Rien à transporter : il n'existe AUCUNE offre de livraison, et c'est normal. Sans
       ce cas particulier, la suite refusait la commande — « cette destination nécessite un
       devis de livraison » — parce qu'elle exige toujours une offre. Le client ne pouvait
       donc jamais payer une licence.
       L'adresse reste lue : c'est le PAYS qui détermine le régime de TVA (une licence
       vendue hors de France ne se taxe pas comme en France) et qui figure sur la facture.
       Elle sert de facturation, pas de livraison — l'interface le dit ainsi. */
    const panierDematerialise = lignesPort.length > 0 && lignesPort.every(l => l.dematerialise === true);

    if (!panierDematerialise && parDefaut.needsAddress) {
      return reponse({ error: parDefaut.motif || 'Adresse de livraison incomplète.' }, 409);
    }

    /* Sélection de l'offre. Sans code transmis (parcours historique, aperçu au chargement),
       on retient exactement ce que `computeShipping` retiendrait dans le navigateur : la
       moins chère du mode par défaut. Les deux ne peuvent donc pas diverger. */
    let offre: OffreLivraison | null = null;
    if (panierDematerialise) {
      offre = null;   // pas de transport : le port vaut 0 et aucun mode n'est à choisir
    } else if (serviceDemande) {
      offre = offres.find(o => o.service === serviceDemande) ?? null;
      if (!offre) {
        return reponse({
          error: "Ce mode de livraison n'est pas proposé pour cette adresse — choisissez-en un autre.",
        }, 409);
      }
    } else {
      offre = parDefaut.offre ?? null;
    }
    if (!panierDematerialise && (!offre || offre.sur_devis)) {
      return reponse({
        error:
          offre?.motif ||
          parDefaut.motif ||
          'Cette destination nécessite un devis de livraison — contactez-nous.',
      }, 409);
    }
    /* Un point relais est une ADRESSE de livraison : sans lui, le colis n'a pas de
       destination. Mieux vaut refuser ici que d'encaisser puis découvrir à l'expédition
       qu'on ne sait pas où envoyer.
       ⚠ Pas en APERÇU : le panier affiche les tarifs avant que le client n'ait choisi son
       relais. Refuser à ce moment-là lui cacherait le prix qu'on lui demande justement
       d'arbitrer. Le contrôle joue au moment de créer le devis, c'est-à-dire de payer. */
    if (!apercu && offre && offre.relais_requis && !relaisDemande) {
      return reponse({ error: 'Choisissez un point relais pour cette offre de livraison.' }, 409);
    }

    /* ★ Le port est pris en HT et se voit appliquer le régime de la vente.
       Le module exprime `prix_ttc` au taux français de 20 % : c'est une valeur d'affichage,
       PAS une décision fiscale. Diviser ce TTC par 1,2 — ce que faisait la version
       précédente — revenait à réintroduire 20 % en dur au moment même où le reste de la
       commande était exonéré. Le port suit le sort fiscal du bien transporté. */
    /* ⚠ Cas du PLANCHER (12,99 € TTC en métropole). 12,99 n'a pas d'équivalent HT
       exact à deux décimales au taux de 20 % : 10,82 donne 12,98 et 10,83 donne 13,00.
       Si on repartait du HT arrondi, le panier annoncerait 12,99 et la carte serait
       débitée 13,00 — un centime d'écart entre le prix affiché et le prix payé, ce qui
       est exactement le genre de détail qui fait écrire un client.
       Quand le régime est bien celui au taux duquel le module a exprimé son TTC (la
       France à 20 %), c'est donc le TTC qui fait foi, et le HT s'en déduit. Dès que le
       régime diffère (exonération intracommunautaire, export, outre-mer), on repart du
       HT : le port suit le sort fiscal du bien transporté, et appliquer un TTC calculé
       à 20 % reviendrait à réintroduire une taxe sur une vente exonérée. */
    const TAUX_AFFICHAGE_MODULE = 20;
    const portTtc = !offre
      ? 0
      : taux === TAUX_AFFICHAGE_MODULE && offre.prix_ttc != null
        ? cts(offre.prix_ttc)
        : cts(cts(offre.prix_ht) * (1 + taux / 100));
    const portHt = !offre
      ? 0
      : taux === TAUX_AFFICHAGE_MODULE && offre.prix_ttc != null
        ? cts(portTtc / (1 + taux / 100))
        : cts(offre.prix_ht);

    /* ---- 6. Totaux ----
       La TVA est calculée SÉPARÉMENT sur les produits et sur le port, puis additionnée,
       au lieu d'être appliquée d'un bloc à la base hors taxes. C'est ce qui garantit que
       le port annoncé (12,99 € au plancher) soit exactement le port débité : appliquer
       20 % au HT arrondi de 10,83 aurait rendu 13,00 €.
       Les deux méthodes ne diffèrent jamais de plus d'un centime, mais ce centime-là est
       celui que le client voit. */
    const baseHt = cts(produitsHt + portHt);
    const tvaProduits = cts(produitsHt * (taux / 100));
    const tvaPort = cts(portTtc - portHt);
    const tva = cts(tvaProduits + tvaPort);
    const totalTtc = cts(baseHt + tva);
    if (!(totalTtc >= 0.5)) return reponse({ error: 'Montant trop faible.' }, 400);

    // Ce que le navigateur a besoin de savoir, dans les deux modes.
    const recapitulatif = {
      produits_ht: produitsHt,
      port_ht: portHt,
      port_ttc: portTtc,
      // `offre` est nulle pour un panier dématérialisé : aucun transport à décrire.
      port_libelle: offre ? offre.libelle : 'Sans livraison (produit dématérialisé)',
      port_service: offre?.service ?? null,
      port_carrier: offre?.carrier ?? null,
      port_mode: offre?.mode ?? null,
      port_delai: offre ? [offre.delai_min_j, offre.delai_max_j] : null,
      base_ht: baseHt,
      taux_tva: taux,
      tva,
      total_ttc: totalTtc,
      regime,
      mention,
      territoire,
      // Pourquoi l'exonération n'a PAS été accordée. Sans ce motif, un client
      // professionnel voit 20 % sans comprendre et appelle le support.
      refus_exoneration: refusExoneration,
      /* La liste des offres vient du SERVEUR : c'est elle qui doit alimenter le sélecteur
         de livraison. Si le navigateur composait sa propre liste, on retomberait dans le
         défaut que cette fonction existe pour empêcher — deux calculs, deux vérités. */
      offres,
    };

    /* ⚠ L'APERÇU S'ARRÊTE ICI, avant toute écriture. Le panier veut connaître le taux
       et le total dès que l'adresse est choisie ; il n'a pas à semer un devis et un
       paiement en base à chaque consultation. */
    if (apercu) {
      return reponse({ apercu: true, recapitulatif });
    }

    // ---- 7. Le devis, écrit par le serveur ----
    const { data: devis, error: eDevis } = await admin.from('order_quotes').insert({
      user_id: user.id,
      items: lignes,
      shipping_address: adresse,
      shipping_cost: portTtc,
      // Texte libre repris tel quel sur la ligne de port de la facture : on y met le
      // libellé lisible (« Colissimo Domicile — 4 kg »), pas un code technique.
      shipping_method: offre ? offre.libelle : 'Sans livraison (produit dématérialisé)',
      // ★ Les cinq champs qui manquaient : sans eux, l'offre choisie mourait avec le devis.
      shipping_cost_ht: portHt,
      shipping_carrier: offre?.carrier ?? null,
      shipping_service: offre?.service ?? null,
      shipping_relay: offre && offre.mode === 'relais' ? relaisDemande : null,
      customer_country: pays,
      is_company: estEntreprise,
      company_name: profil?.company_name ?? null,
      vat_number: profil?.vat_number ?? null,
      vat_validated: tvaValide,
      vat_regime: regime,
      vat_rate: taux,
      // ★ Mention et territoire FIGÉS à la vente (contrat §5, invariant 2).
      vat_mention: mention,
      vat_territory: territoire,
      vies_checked_at: preuveVies?.checked_at ?? dateVerifVies,
      vies_name: preuveVies?.company_name ?? nomVies,
      vies_address: preuveVies?.company_address ?? null,
      subtotal_ht: baseHt,
      tax_amount: tva,
      total_ttc: totalTtc,
    }).select().single();
    if (eDevis) {
      console.error('devis-commande : devis non enregistré', eDevis.message);
      return reponse({ error: 'Impossible de préparer la commande.' }, 500);
    }

    // ---- 8. Le paiement, au montant CALCULÉ ICI ----

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2024-06-20',
      httpClient: Stripe.createFetchHttpClient(),
    });
    /* La clé d'idempotence vient du navigateur et vaut pour la durée du panier : deux
       clics sur « Payer » renvoient le MÊME paiement au lieu d'en créer deux. */
    const cleIdem = req.headers.get('idempotency-key') || undefined;
    const centimes = Math.round(totalTtc * 100);
    const corpsPi = {
      amount: centimes,
      currency: 'eur',
      automatic_payment_methods: { enabled: true },
      metadata: {
        source: 'omega-website',
        quote_id: devis.id,
        user_id: user.id,
        vat_regime: regime,
        vat_rate: String(taux),
      },
    };
    let pi = await stripe.paymentIntents.create(
      corpsPi,
      cleIdem ? { idempotencyKey: cleIdem } : undefined
    );
    /* ★ GARDE INDISPENSABLE. Avec une clé d'idempotence, Stripe REJOUE sa première
       réponse : si le client a changé d'adresse ou de quantité entre-temps, on
       récupérerait le paiement de l'ANCIEN panier, à l'ANCIEN montant — et la commande
       serait enregistrée au nouveau total tout en n'encaissant que l'ancien. Dès que le
       montant rejoué ne correspond pas, on refait un paiement neuf, sans clé. */
    if (pi.amount !== centimes) {
      const perime = pi.id;
      pi = await stripe.paymentIntents.create(corpsPi);
      /* ★ ON ANNULE L'ANCIEN. Sans cela, deux PaymentIntents vivants portent le même
         panier : le client peut confirmer celui que Stripe.js a mémorisé (l'ancien
         montant) pendant que la commande sera enregistrée au nouveau. Un paiement laissé
         `requires_payment_method` reste aussi affiché comme « incomplet » dans le tableau
         de bord Stripe pendant une semaine, ce qui pollue le rapprochement.
         Un échec d'annulation ne doit RIEN casser : le paiement neuf, lui, est valide. */
      try {
        await stripe.paymentIntents.cancel(perime, { cancellation_reason: 'duplicate' });
      } catch (e) {
        console.error(`devis-commande : annulation de ${perime} impossible`, e);
      }
    }
    await admin.from('order_quotes').update({ stripe_payment_intent_id: pi.id }).eq('id', devis.id);

    return reponse({
      quote_id: devis.id,
      client_secret: pi.client_secret,
      payment_intent_id: pi.id,
      recapitulatif,
    });
  } catch (e) {
    // Le détail part dans les journaux du serveur, jamais dans la réponse : un message
    // d'erreur technique renseigne un attaquant (version de bibliothèque, structure interne).
    console.error('devis-commande', e);
    return reponse({ error: 'Préparation de la commande impossible.' }, 500);
  }
});
