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
3. **Automatisation Make.com (construite, juillet 2026)** : bouton orange « Send » dans Admin → Facturation → Edge Function `send-to-make` (déployée) → webhook Make → module Tiime « Créer une facture ». Voir section suivante. L'Edge Function `transmit-einvoice` reste aussi déployée si une PA gratuite avec API apparaît d'ici 2027.

## Configurer l'automatisation Make.com (une seule fois)

1. **Compte Tiime** : [tiime.fr](https://www.tiime.fr/facturation-electronique) — plan gratuit, SIRET 481 088 722 00014.
2. **Compte Make** : [make.com](https://www.make.com) — plan gratuit (~1 000 opérations/mois, largement assez).
3. **Créer le scénario Make** :
   - Nouveau scénario → 1er module : **Webhooks → Custom webhook** → « Add » → copier l'URL générée (`https://hook.eu2.make.com/…`).
   - 2e module : chercher **Tiime → Create an invoice** → connecter ton compte Tiime.
   - Mapper les champs depuis le webhook : `customer.name`, `customer.email`, `items[]` (description, quantity, unit_price_ht, tax_rate), `invoice_number`, `notes`…
   - Activer le scénario (interrupteur « ON »).
4. **Enregistrer l'URL du webhook côté serveur** (à faire par Claude ou en terminal) :
   ```bash
   npx supabase secrets set --project-ref ebkxdndfcwowevvtoxhr MAKE_WEBHOOK_URL=https://hook.eu2.make.com/…
   ```
5. **Utilisation** : Admin → Facturation → bouton **orange (Send)** sur la facture → elle est créée dans Tiime, qui gère la transmission légale. Astuce : lors du 1er envoi, Make affiche les données reçues, ce qui facilite le mapping de l'étape 3.

## ✅ Scénario Make INSTALLÉ ET ACTIF (10 juillet 2026)

Le scénario **« OMEGA — Factures & Avoirs vers Tiime »** (id 6518240, compte Make d'Alexis) est câblé et testé de bout en bout :

```
Webhook → Routeur
  ├─ type=invoice → Créer client Tiime (si doublon : recherche + reprise) → FACTURE BROUILLON dans Tiime
  └─ type=refund  → Créer client Tiime (idem) → brouillon « AVOIR À CRÉER — FAC-xxx » dans Tiime
```

- Les factures arrivent en **brouillon** dans Tiime (société id 194006) : tu vérifies puis tu valides/envoies depuis Tiime.
- ⚠️ **Limitation API Tiime** : impossible de créer un vrai avoir (code 381) par l'API. En cas de remboursement, un brouillon-mémo « AVOIR À CRÉER » arrive avec toutes les infos ; crée le véritable avoir depuis la facture d'origine dans Tiime, puis supprime le mémo.
- Détail technique : payload `tiime_lines` généré par les Edge Functions au format exact du module Make (TVA en décimal : 0.2 = 20 %).

## Avoirs automatiques sur remboursement (construit juillet 2026)

La fonction `process-refund` envoie automatiquement un événement `type: "refund"` au même webhook Make après chaque remboursement Stripe réussi (non bloquant : un échec Make n'empêche jamais le remboursement). Le webhook reçoit donc 2 types d'événements : `invoice` (bouton orange) et `refund` (automatique).

**Scénario Make recommandé (avec routeur) :**
```
Webhook → Routeur
  ├─ Route « Facture »  [filtre : type = invoice]
  │    └─ Tiime : Créer une facture
  └─ Route « Avoir »    [filtre : type = refund]
       ├─ Tiime : Récupérer ses factures (recherche par invoice_number)
       ├─ [filtre : facture trouvée]  ← évite les avoirs pour les ventes B2C jamais poussées dans Tiime
       └─ Tiime : créer l'avoir (facture négative ou module « Requête API Tiime »)
```

Champs de l'événement refund : `invoice_number`, `customer.name/email`, `refund.amount`, `refund.reason`, `refund.date`, `refund.stripe_refund_id`.

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
