/*
  DEVIS DE COMMANDE — le serveur arrête le montant, puis crée le paiement.

  ## La faille que ceci ferme
  Avant, le navigateur appelait `create-payment-intent` avec le montant de son choix, et
  insérait ensuite la commande avec les totaux de son choix. On pouvait payer 0,50 € une
  machine à 2 000 €. Le contrôle `verify_jwt` n'y changeait rien : la clé anon est un
  jeton valide et elle est publique (elle est dans le bundle du site).

  ## Le principe
  Le navigateur n'envoie plus que **des identifiants de produit et des quantités**. Tout
  le reste — prix, remise pro, TVA, frais de port — est relu ou recalculé ici, à partir
  de la base. Le résultat est enregistré dans `order_quotes` (table où le client ne peut
  PAS écrire), et c'est ce devis qui sert à créer le PaymentIntent puis la commande.

  ## Fiabilité dans le temps (demande explicite : « ne plus jamais toucher au code »)
  Rien n'est écrit en dur ici :
   · les prix viennent de `products` ;
   · les taux de TVA de `eu_vat_rates` (modifiable par l'admin) ;
   · le régime fiscal de la fonction SQL `regime_tva` — source unique ;
   · le barème de port de `site_settings` ;
   · la validité du numéro de TVA de `profiles`, alimentée par la vérification VIES.
  Un changement de taux, de prix ou de barème se fait donc en base, sans redéploiement.
*/
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'npm:stripe@14.21.0';
import {
  computeShipping,
  normalizeShippingConfig,
  type ShippingLine,
} from './shipping.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  /* ⚠ `idempotency-key` DOIT figurer ici. Le navigateur l'envoie pour qu'un double clic
     sur « Payer » ne crée pas deux paiements. Sans cette autorisation, le contrôle
     préalable (preflight) échoue et le navigateur n'envoie JAMAIS la requête : plus aucun
     client ne peut commander. Rien ne le montre côté serveur — seul un vrai navigateur
     le révèle. */
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, idempotency-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reponse = (corps: unknown, statut = 200) =>
  new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

/** Arrondi au centime — jamais de flottant qui traîne dans un montant facturé. */
const cts = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

Deno.serve(async (req: Request) => {
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
      .select('id, name, price, price_ht, weight_kg, shipping_class, in_stock, stock_quantity')
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
      });
    }

    // ---- 4. Statut fiscal : lu SUR LE PROFIL, pas déclaré par le client ----
    const { data: profil } = await admin
      .from('profiles')
      .select('is_company, company_name, vat_number, vat_number_valid, vat_name_match, vat_checked_name, vat_exempt_override')
      .eq('id', user.id).maybeSingle();
    const estEntreprise = profil?.is_company === true;
    // ⚠ La validité vient de la vérification VIES enregistrée côté serveur. Un client qui
    // prétendrait avoir un numéro valide n'obtiendrait rien : ce champ n'est écrit que par
    // la fonction `verifier-tva`.
    const tvaValide = profil?.vat_number_valid === true;

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
       Deux rattachements possibles, l'un suffit :
         · le nom que VIES associe au numéro correspond à la raison sociale déclarée ;
         · la livraison est adressée à cette société (nom porté sur le colis).
       `null` = on n'a pas pu contrôler (État membre qui ne divulgue pas de nom ET pas de
       société sur l'adresse) : on n'invente pas de refus, les autres verrous jouent. */
    const societeLivraison = String((adresse as any).company || '').trim();
    const { data: memeSociete } = societeLivraison && profil?.company_name
      ? await admin.rpc('noms_concordent', {
          p_declare: societeLivraison, p_vies: profil.company_name,
        })
      : { data: null };
    const identiteOk =
      profil?.vat_name_match === true ? true
      : memeSociete === true ? true
      : profil?.vat_name_match === false ? false
      : null;

    /* ★ VERROU D'ADRESSE — c'est lui qui ôte tout intérêt à l'usurpation d'un numéro.
       Même en devinant la raison sociale du titulaire, il faut se faire livrer là où la
       société est établie : chez elle, donc, et pas chez soi.
       L'adresse enregistrée par VIES est conservée dans `vies_checks`, table réservée aux
       administrateurs — elle ne transite jamais par le navigateur du client. */
    let adresseOk: boolean | null = null;
    if (estEntreprise && tvaValide && profil?.vat_number) {
      const { data: fiche } = await admin
        .from('vies_checks').select('company_address').eq('vat_number', profil.vat_number).maybeSingle();
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
    // Motif du refus d'exonération : le client doit savoir POURQUOI on lui facture la TVA.
    const refusExoneration = reg?.[0]?.refus ?? null;

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
    const port = computeShipping(
      lignesPort,
      { country: paysBrut || 'France', postal_code: cp },
      config,
      { express }
    );
    if (port.needsQuote) {
      return reponse({ error: 'Cette destination nécessite un devis de livraison — contactez-nous.' }, 409);
    }
    if (port.cost === null || port.cost === undefined) {
      return reponse({ error: 'Frais de livraison indéterminés pour cette adresse.' }, 409);
    }
    // Le barème est exprimé TTC (TVA 20 %) : on le ramène en HT pour appliquer le régime.
    const portHt = cts(Number(port.cost) / 1.2);

    // ---- 6. Totaux ----
    const produitsHt = cts(lignes.reduce((s, l) => s + l.unit_ht * l.quantity, 0));
    const baseHt = cts(produitsHt + portHt);
    const tva = cts(baseHt * (taux / 100));
    const totalTtc = cts(baseHt + tva);
    if (!(totalTtc >= 0.5)) return reponse({ error: 'Montant trop faible.' }, 400);

    // ---- 7. Le devis, écrit par le serveur ----
    const { data: devis, error: eDevis } = await admin.from('order_quotes').insert({
      user_id: user.id,
      items: lignes,
      shipping_address: adresse,
      shipping_cost: cts(Number(port.cost)),
      shipping_method: port.method,
      customer_country: pays,
      is_company: estEntreprise,
      company_name: profil?.company_name ?? null,
      vat_number: profil?.vat_number ?? null,
      vat_validated: profil?.vat_number_valid ?? null,
      vat_regime: regime,
      vat_rate: taux,
      subtotal_ht: baseHt,
      tax_amount: tva,
      total_ttc: totalTtc,
    }).select().single();
    if (eDevis) return reponse({ error: 'Impossible de préparer la commande.' }, 500);

    // ---- 8. Le paiement, au montant CALCULÉ ICI ----
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2023-10-16' });
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
      pi = await stripe.paymentIntents.create(corpsPi);
    }
    await admin.from('order_quotes').update({ stripe_payment_intent_id: pi.id }).eq('id', devis.id);

    return reponse({
      quote_id: devis.id,
      client_secret: pi.client_secret,
      payment_intent_id: pi.id,
      recapitulatif: {
        produits_ht: produitsHt,
        port_ht: portHt,
        port_ttc: cts(Number(port.cost)),
        port_libelle: port.label,
        base_ht: baseHt,
        taux_tva: taux,
        tva: tva,
        total_ttc: totalTtc,
        regime,
        mention: reg?.[0]?.mention ?? null,
        territoire: reg?.[0]?.territoire ?? null,
        // Pourquoi l'exonération n'a PAS été accordée. Sans ce motif, un client
        // professionnel voit 20 % sans comprendre et appelle le support.
        refus_exoneration: refusExoneration,
      },
    });
  } catch (e) {
    // Le détail part dans les journaux du serveur, jamais dans la réponse : un message
    // d'erreur technique renseigne un attaquant (version de bibliothèque, structure interne).
    console.error('devis-commande', e);
    return reponse({ error: 'Préparation de la commande impossible.' }, 500);
  }
});
