# 🔍 Audit du site OMEGA — Rapport technique

> ⚠️ **Mise à jour du 11 juillet 2026** — voir la section « Intervention du 11/07/2026 » en fin de document : mode Vitrine ajouté, branding corrigé, plusieurs bugs de cet audit corrigés.

> **Date :** 20 juin 2026
> **Périmètre :** site `OMEGA-WEBSITE` (React + TypeScript + Vite + Supabase + Stripe)
> **Méthode :** analyse statique du code (auth, administration, e‑commerce, infrastructure).
> **Limite :** cet audit lit le **code source**. Il ne peut pas vérifier le **runtime de production** : déploiement effectif des Edge Functions, secrets Supabase (`STRIPE_SECRET_KEY`…), politiques RLS réelles en base, délivrabilité des emails. Ces points sont signalés « **à vérifier en prod** ».

Légende de priorité : 🔴 **P1 critique** · 🟠 **P2 à corriger** · 🟡 **P3 mineur / cosmétique** · ✅ fonctionne

---

## 1. Synthèse

| Domaine | État global | Détail |
|---|---|---|
| Connexion / Inscription | ✅ Fonctionnel | Validation, email de confirmation, formatage téléphone OK. Quelques points de robustesse. |
| Administration | ✅ Fonctionnel | 10 modules, Edge Functions sécurisées. Garde d'accès côté client uniquement. |
| Catalogue / Panier | ✅ Fonctionnel | Panier persistant, prix HT/TTC. |
| Paiement / Commande | 🟠 Fonctionnel mais incomplet | Stripe + commande OK, mais **adresse de livraison non collectée** et **stock non décrémenté**. |
| Liens / Navigation | 🟠 2 liens cassés | « Produits associés » sur 2 fiches. |
| Robustesse globale | 🟠 À renforcer | Pas d'ErrorBoundary global, pas de page 404. |

**En une phrase :** le site est globalement fonctionnel et bien construit (le tunnel de paiement est même soigné), mais il reste **3 bugs e‑commerce** à corriger avant une vraie mise en vente, et quelques points de robustesse.

---

## 2. Connexion & Inscription

### Ce qui marche ✅
- Inscription avec validation **Yup** (email, mot de passe ≥ 6, confirmation, téléphone) — `AuthPage.tsx`.
- Formatage automatique du numéro FR + sélecteur d'indicatif pays (9 pays).
- Email de confirmation Supabase avec `emailRedirectTo` vers `/email-confirmation`.
- Connexion email/mot de passe, gestion d'erreurs traduite, écran « Vérifiez votre email ».
- Session gérée globalement via `onAuthStateChange` (`AuthContext.tsx`).

### Points à corriger
- 🟠 **Email admin codé en dur dans le front** — `AuthContext.tsx:65`
  ```ts
  const adminEmails = ['alexishidalgo34000@gmail.com'];
  ```
  Présent dans le bundle JS livré au navigateur. Ce n'est pas une faille *si* la base est protégée par RLS, mais l'autorisation admin devrait reposer **uniquement** sur le rôle en base (`profiles.role`), pas sur un email en dur.
- 🟠 **Course (race condition) sur le statut admin** — `AuthContext.tsx:42‑96` + `AdminPage.tsx:53`
  `setLoading(false)` est appelé **avant** que `checkUserRole()` (asynchrone) ne réponde. Un admin défini **par rôle en base** (et non par email) peut voir brièvement « Accès Refusé », car `AdminPage` ne teste pas `loading`. → Tester `loading` avant d'afficher le refus.
- 🟡 **`EmailConfirmationPage` peu fiable** — `EmailConfirmationPage.tsx:25‑31`
  La page lit les paramètres en **query string** (`useSearchParams`) alors que Supabase renvoie les jetons dans le **hash** (`#access_token=…`). De plus, la branche `else` affiche un **faux succès après 1,5 s** même sans jeton. La confirmation réelle fonctionne (gérée par `supabase-js` dans `App.tsx`), mais l'affichage de cette page ne reflète pas l'état réel.
- 🟡 **Découpage prénom/nom rigide** — `AuthContext.tsx:104‑112` : `signUp` exige un prénom **et** un nom (split sur l'espace). Impact limité car le formulaire impose déjà 2 champs séparés.
- 🟡 **Code mort** — `lib/supabase.ts:35‑70` : `signUp/signIn/getCurrentUser` y sont redéfinis mais **jamais utilisés** (doublon avec `AuthContext`).

---

## 3. Administration

### Ce qui marche ✅
- Console admin avec **10 modules** lazy‑loadés (`AdminPage.tsx`) : Tableau de bord, Utilisateurs, Produits, Commandes, Avis, Planning, Messages, Facturation, Comptabilité, Paramètres.
- **Bon pattern de sécurité** : les opérations sensibles passent par des Edge Functions appelées avec le **jeton de session** de l'utilisateur (la fonction revalide les droits côté serveur) :
  - `admin-users` (liste / changement de rôle) — `AdminUsers.tsx:49,81`
  - `admin-delete-user`, `admin-reset-password`, `process-refund`, `get-charge-id`.
- Gestion produits complète (CRUD, images, prix HT/TTC auto, SKU, vedette) — `AdminProducts.tsx`.

### Points à corriger
- 🟠 **Garde d'accès uniquement côté composant** — `AdminPage.tsx:53` (`if (!user || !isAdmin)`). La route `/admin` (`App.tsx:113`) n'a pas de wrapper de protection. C'est acceptable **à condition** que toutes les tables exposées (produits, commandes, profils, avis, planning…) aient des **politiques RLS strictes** côté Supabase. → **À vérifier en prod**, table par table.
- 🟡 Flash « Accès Refusé » possible (voir race condition §2).

---

## 4. E‑commerce (catalogue, panier, paiement)

### Ce qui marche ✅
- Catalogue + fiche produit + filtres catégorie (`ProductsPage.tsx`, `ProductDetailPage.tsx`).
- **Panier persistant** en base (`cart_items`), rechargé à la connexion (`CartContext.tsx`).
- Affichage **HT (pro) / TTC (particulier)** cohérent, calcul TVA 20 %.
- **Tunnel de paiement Stripe soigné** (`StripeCheckout.tsx` + `CartPage.tsx`) :
  - PaymentIntent via Edge Function `create-payment-intent` avec **clé d'idempotence persistante** (anti‑double‑débit) ;
  - récupération du **Charge ID** (`get-charge-id`) pour les remboursements ;
  - **anti‑double‑commande** (vérifie `stripe_payment_intent_id` avant insertion) ;
  - création `orders` + `payment_records` + `order_items`, puis vidage du panier.

### Bugs à corriger
- 🔴 **P1 — L'adresse de livraison n'est jamais collectée** — `CartPage.tsx:16,27‑28,120‑133`
  `AddressManager` est **importé** et les états `showAddressManager` / `selectedAddress` existent, mais **le sélecteur d'adresse n'est jamais affiché** : on passe directement du bouton « Passer la Commande » au paiement Stripe. Résultat : **toutes les commandes sont enregistrées avec `shipping_address: null`**. Impossible d'expédier. → Afficher le `AddressManager` et **exiger** une adresse avant le paiement.
- 🟠 **P2 — Le stock n'est jamais décrémenté** après une commande. Aucun `update` de `stock_quantity` au moment du checkout → risque de **survente**. → Décrémenter le stock (idéalement via une fonction SQL/Edge transactionnelle).
- 🟠 **P2 — `toast.warn` n'existe pas** dans `react-hot-toast` — `CartPage.tsx:101`
  ```ts
  toast.warn('Impossible de récupérer tous les détails du paiement.');
  ```
  Cet appel **lève une exception** (heureusement capturée par le `catch`), donc l'avertissement **ne s'affiche jamais**. → Remplacer par `toast('…')` ou `toast.error('…')`.
- 🟠 **P2 — Liens « Produits associés » cassés** — `HazerDetailPage.tsx:538` et `MousseDetailPage.tsx:555`
  ```tsx
  to={`/produits/${product.id}`}   // ❌ n'existe pas
  ```
  La route déclarée est `/produit/:id` (`App.tsx:97`). `/produits/:id` ne correspond à **aucune route** → page blanche. → Corriger en `/produit/${product.id}`.
- 🟡 **P3 — Dépendance au déploiement** : le paiement ne fonctionne que si les Edge Functions sont **déployées** et que le secret `STRIPE_SECRET_KEY` est configuré côté Supabase (`create-payment-intent/index.ts:17`). **À vérifier en prod.**

---

## 5. Robustesse & infrastructure

- 🟠 **Pas d'ErrorBoundary global** : le composant `ErrorBoundary.tsx` existe mais **n'enveloppe pas l'application** dans `App.tsx`. Une erreur de rendu non gérée = **écran blanc total**. → Envelopper `<Routes>` (ou l'app) dans `<ErrorBoundary>`.
- 🟡 **Pas de page 404** : aucune route `path="*"`. Une URL inconnue affiche une page vide (Header + Footer uniquement).
- 🟡 **Route `/machines` = placeholder** « En construction » (`App.tsx:118‑125`).
- ✅ Bonnes pratiques présentes : lazy‑loading des pages, `ScrollToTop`, `Suspense` avec fallback, validation des variables d'env Supabase au démarrage (`lib/supabase.ts:7‑30`), `Toaster` global.

---

## 6. Plan d'action recommandé (par priorité)

### 🔴 Avant toute vente réelle
1. **Collecter l'adresse de livraison** dans le panier (afficher `AddressManager`, la rendre obligatoire) — `CartPage.tsx`.
2. **Vérifier en prod** : Edge Functions déployées + `STRIPE_SECRET_KEY` + clés Stripe (test vs live) + délivrabilité des emails de confirmation.

### 🟠 Rapidement
3. **Décrémenter le stock** à la validation de commande (transaction SQL/Edge).
4. Remplacer `toast.warn` par un appel valide — `CartPage.tsx:101`.
5. Corriger les 2 liens `/produits/${id}` → `/produit/${id}` — `HazerDetailPage.tsx:538`, `MousseDetailPage.tsx:555`.
6. Ajouter un **ErrorBoundary global** dans `App.tsx`.
7. **Auditer les politiques RLS** Supabase, table par table (la sécurité réelle de l'admin en dépend).
8. Corriger la **race condition admin** (tester `loading`) — `AuthContext.tsx` / `AdminPage.tsx`.

### 🟡 Quand possible
9. Fiabiliser `EmailConfirmationPage` (lire le hash, supprimer le faux succès).
10. Externaliser l'email admin en dur vers le rôle DB uniquement.
11. Ajouter une page **404** (`path="*"`).
12. Finaliser ou masquer la route `/machines`.
13. Supprimer le code mort dans `lib/supabase.ts`.

---

## 7. Ce qui n'a PAS pu être testé (nécessite la prod / un test live)

- Déploiement réel et bon fonctionnement des **Edge Functions** Supabase.
- Présence et validité des **secrets** (`STRIPE_SECRET_KEY`, clés Stripe live).
- **Politiques RLS** réelles sur les tables (lecture seule du code ici).
- **Envoi/réception réel** des emails de confirmation (config SMTP Supabase).
- Un **paiement de bout en bout** avec une vraie carte de test.

> Si tu veux, je peux corriger directement les bugs 🔴/🟠 (adresse de livraison, `toast.warn`, liens cassés, ErrorBoundary, décrément de stock) dans une prochaine étape.

---

## Intervention du 11/07/2026 — Mode Vitrine, branding, corrections

### ✅ Fait
1. **MODE VITRINE** (nouveau) : option dans Admin → Paramètres → « Mode du site ». Vitrine = AUCUNE vente en ligne : panier/paiement masqués partout (verrou central dans `CartContext.addToCart` + UI par page), remplacés par « Demander un devis » (formulaire pré-rempli via `/contact?sujet=devis&produit=…`) et « Appeler » (06 81 23 99 31). Page `/panier` = écran d'orientation devis/appel. **Par défaut : Vitrine ACTIVE** (repli sûr tant que la table `site_settings` n'existe pas).
2. **Navigation « Foam System » → « Fluid System »** (Header desktop + mobile) : pointe sur `/fluid-system` qui présente toute la gamme de liquides (Mousse, Neige, Fumée, Flamme).
3. **Branding** : téléphone unifié **06 81 23 99 31** partout (ancien 06 19 91 87 19 supprimé) ; email `contact@captivision.fr` remplacé (Capti'Vision ≠ OMEGA). Centralisés dans `src/config/legalInfo.ts` (`COMPANY_INFO.phone/phoneHref/email`).
4. Corrections de l'audit du 20/06 : liens cassés `/produits/:id` → `/produit/:id` (Hazer + Mousse), `toast.warn` → `toast(…)`, **ErrorBoundary global** autour des routes, **page 404**, route `/machines` → redirection `/produits`.

### 📌 À faire par l'admin (une fois)
- **Appliquer la migration** `supabase/migrations/20260711100000_site_settings.sql` dans le SQL Editor Supabase. Sans elle, le site reste en Vitrine (voulu) mais le bouton admin ne peut pas persister le choix.

### 🖼️ Photos produits manquantes (à fournir dans /public/products/)
- **OMEGA NEIGE** : réutilise la photo de la Mousse (placeholder) — vraie photo du bidon à fournir.
- **OMEGA FLAMME** : illustrée par la machine El Fuego, pas par le bidon de liquide.
- Ménage possible : doublons « ChatGPT Image … copy.png » et « Logo OMEGA … copy.png » (3× chacun, ~2 Mo pièce).

### ⏳ Avant de réactiver la Boutique en ligne (rappels de l'audit du 20/06, toujours valables)
- 🔴 Adresse de livraison jamais collectée (CartPage) ; 🟠 stock non décrémenté ; 🟠 RLS à auditer table par table ; 🟠 race condition admin ; 🟡 EmailConfirmationPage ; 🟡 email admin en dur.

### 📝 Notes
- Email public provisoire = Gmail (changer dans `legalInfo.ts` dès qu'une adresse pro existe).
- Boutons « Favoris » / « Partager » de la fiche produit : sans action (décoratifs) — à câbler ou retirer.
- `npx tsc --noEmit` remonte des erreurs PRÉEXISTANTES (AdminBilling, AdminDashboard, AuthContext…) qui n'empêchent pas le build Vite ; à assainir un jour.
- Vérifié le 11/07 : build de production OK, 28/28 tests unitaires OK, parcours visuels (accueil, fluid-system, panier vitrine, contact pré-rempli, 404) OK en local.
