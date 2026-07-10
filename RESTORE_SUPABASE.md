# ♻️ Restauration Supabase OMEGA (nouveau projet cloud)

Guide pour remonter la base sur un **nouveau projet Supabase** à partir du backup
`db_cluster-14-08-2025@23-26-48.backup.gz`.

- **Backup décompressé & nettoyé :** `C:\Users\gravi\Downloads\db_cluster_clean.sql`
  (méta-commandes `\restrict` retirées — compatible avec n'importe quelle version de `psql`).
- **Contenu :** schéma `public` complet + **2 comptes** (`auth.users` + identités) + storage + 51 policies RLS + 53 fonctions.
- **Outil de restauration :** `psql` via **Docker** (psql n'est pas installé localement, Docker oui).

---

## Étape 1 — Créer le nouveau projet

1. Va sur **https://supabase.com/dashboard** → **New project**.
2. Choisis l'organisation, un **nom** (ex. `omega`), une **région** (ex. `Europe West (Paris)` / `eu-west-3`).
3. **Définis un mot de passe de base de données** et **note-le** (il sert à la restauration).
4. Attends ~2 min que le projet soit prêt.

## Étape 2 — Récupérer les infos de connexion

Dans le projet :

- **Settings → Database → Connection string → onglet `URI` → "Session pooler"**
  Format :
  ```
  postgresql://postgres.<REF>:<MOT_DE_PASSE>@aws-0-<REGION>.pooler.supabase.com:5432/postgres
  ```
- **Settings → API :**
  - **Project URL** : `https://<REF>.supabase.co`
  - **anon public** : la clé `anon` (publique, utilisée par le front).

## Étape 3 — Restaurer le backup (Docker)

> Remplace la chaîne de connexion par celle de l'étape 2 (Session pooler, port **5432**).

```bash
docker run --rm -v "C:\Users\gravi\Downloads:/data" postgres:17 \
  psql "postgresql://postgres.<REF>:<MOT_DE_PASSE>@aws-0-<REGION>.pooler.supabase.com:5432/postgres" \
  -v ON_ERROR_STOP=0 \
  -f /data/db_cluster_clean.sql
```

⚠️ **Des erreurs `already exists` vont défiler, c'est NORMAL** : le nouveau projet a déjà
ses rôles et ses schémas gérés (`auth`, `storage`…). On utilise `ON_ERROR_STOP=0` pour
que la restauration continue malgré ces erreurs. Les **données** (`public.*`, `auth.users`),
elles, s'insèrent correctement.

## Étape 4 — Recâbler le site (`.env`)

Mettre à jour `OMEGA-WEBSITE/.env` :

```ini
VITE_SUPABASE_URL=https://<REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<clé anon publique>
VITE_STRIPE_PUBLISHABLE_KEY=<inchangé>
VITE_SITE_URL=<inchangé>
```

Puis **relancer** `npm run dev`.

## Étape 5 — Vérifications

- Le site charge les **produits** (3), **catégories** (8) → base lue OK.
- **Connexion** avec un compte existant → comptes restaurés OK.
- Dans Supabase → **Table Editor**, vérifier `products`, `profiles`, `orders`.

## Étape 6 — (Important) Edge Functions & secrets

Le paiement Stripe et la gestion des utilisateurs admin reposent sur des **Edge Functions**
qu'il faut **redéployer** sur le nouveau projet, avec leurs secrets :

```bash
npx supabase login                       # token depuis supabase.com/dashboard/account/tokens
npx supabase link --project-ref <REF>
npx supabase functions deploy            # déploie create-payment-intent, admin-users, etc.
npx supabase secrets set STRIPE_SECRET_KEY=sk_...   # + autres secrets nécessaires
```

> Sans cette étape : le site marche, mais **le paiement et l'admin-utilisateurs ne fonctionneront pas**.

---

## Si les comptes ne se restaurent pas

Si la connexion échoue après restauration (incompatibilité de version `auth`), on bascule
sur un plan B : recréer le schéma proprement via `npx supabase db push` (les 33 migrations
du repo) puis ré-importer uniquement les **données métier** + `auth.users`/`auth.identities`.
Dis-le-moi et je le prépare.
