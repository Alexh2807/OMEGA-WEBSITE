# Guide — Facturation électronique OMEGA (100% gratuit)

*Mis à jour : juillet 2026*

## Ce que la loi exige vraiment (et quand)

| Obligation | Pour OMEGA (TPE) | Date |
|---|---|---|
| **Recevoir** les factures électroniques de tes fournisseurs | ✅ Obligatoire | **1er sept. 2026** |
| **Émettre** tes factures B2B (clients professionnels) via une plateforme | Obligatoire | **1er sept. 2027** |
| **E-reporting** des ventes B2C (particuliers) | Obligatoire | **1er sept. 2027** |

👉 **Tes ventes aux particuliers (l'essentiel de la boutique) ne passent PAS par la facturation électronique.** Elles relèveront du e-reporting en sept. 2027 seulement.

⚠️ Le portail public gratuit de l'État (PPF) a été **abandonné en octobre 2024** : il n'existe pas d'API officielle gratuite. Il faut passer par une **Plateforme Agréée (PA)** privée — mais plusieurs sont gratuites.

## Ce que le site fait déjà (gratuit, fait maison)

- ✅ Génération de factures **Factur-X** (PDF + XML EN 16931, profil BASIC) — le format légal français. Aucun abonnement, tout est généré par le site.
- ✅ **Garde-fou absolu** : un paiement Stripe de TEST ne produit jamais de facture officielle (mode `test` forcé, statut `sandbox`).
- ✅ Archivage en base (`einvoices`) : XML + PDF de chaque facture, accès admin uniquement.
- ✅ Bouton de génération dans **Admin → Facturation** (icône cyan FileCheck).
- ✅ Edge Function **`transmit-einvoice`** : transmission serveur vers n'importe quelle PA (OAuth2 + dépôt), clés jamais exposées dans le navigateur. Tant qu'aucune PA n'est configurée, elle répond « PA non configurée » et la facture reste « à transmettre ».

## Stratégie gratuite retenue : Tiime (décision juillet 2026)

*B2Brouter écarté : ~110 €HT/an vérifié par Alexis. L'API Tiime est réservée aux éditeurs de logiciels (partenariat) — mais aucune API n'est nécessaire pour être conforme.*

1. **Avant sept. 2026 (réception)** : compte **Tiime gratuit** ([tiime.fr](https://www.tiime.fr/facturation-electronique)) — la conformité réception est automatique dès l'inscription. 0 €.
2. **Avant sept. 2027 (émission B2B)** : les factures aux clients professionnels se créent directement dans l'appli Tiime (illimité, gratuit) qui les transmet officiellement. Les ventes B2C ne sont pas concernées. Le site continue de générer ses Factur-X pour toutes les commandes (document commercial + archive).
3. **Automatisation optionnelle plus tard** : intégration officielle Tiime ↔ Make.com (plan gratuit ~1 000 ops/mois) pour créer automatiquement les factures B2B dans Tiime ; ou brancher l'Edge Function `transmit-einvoice` (déjà déployée, compatible toute PA à API) si une PA gratuite avec API apparaît d'ici 2027.

## Brancher une PA au site (quand tu auras le compte)

1. Crée le compte PA et récupère dans leur espace développeur : URL du token OAuth2, URL de dépôt, client ID, client secret. **Demande d'abord les identifiants SANDBOX** pour tester sans rien émettre d'officiel.
2. Configure les secrets côté serveur (jamais dans le code) :
   ```bash
   npx supabase secrets set --project-ref ebkxdndfcwowevvtoxhr \
     PA_NAME=b2brouter \
     PA_TOKEN_URL=https://... \
     PA_DEPOSIT_URL=https://... \
     PA_CLIENT_ID=... \
     PA_CLIENT_SECRET=...
   ```
3. Ajuste si besoin les noms de champs du dépôt dans `supabase/functions/transmit-einvoice/index.ts` (zone marquée `--- ADAPTER ---`) selon la doc API de la PA, puis redéploie :
   ```bash
   npx supabase functions deploy transmit-einvoice --project-ref ebkxdndfcwowevvtoxhr --use-api
   ```
4. Teste avec les identifiants sandbox de la PA, puis passe `VITE_EINVOICE_MODE=live` (variable d'environnement Netlify) **uniquement** quand tout est validé. Même en live, un paiement Stripe test ne transmettra jamais rien.

## À compléter (mentions légales des factures)

Dans `src/config/legalInfo.ts` : téléphone, email de contact, assurance RC Pro, médiateur de la consommation. Ces mentions apparaissent sur les factures — à remplir avec les vraies informations d'OMEGA.
