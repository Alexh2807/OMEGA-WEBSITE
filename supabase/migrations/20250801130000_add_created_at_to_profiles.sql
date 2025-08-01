/*
  # Ajout de la colonne created_at à la table profiles

  1. Modification
    - Ajout de la colonne `created_at` (timestamp with time zone)
    - Définition d'une valeur par défaut `now()` pour les nouvelles entrées
    - Mise à jour des profils existants pour leur attribuer une date de création

  2. Sécurité
    - Aucune modification des politiques de sécurité (RLS) n'est nécessaire
*/

-- Étape 1: Ajouter la colonne `created_at` à la table `profiles`
-- Utilise `IF NOT EXISTS` pour éviter les erreurs si la colonne existe déjà.
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- Étape 2: Rétro-remplir la colonne `created_at` pour les profils existants
-- Nous utilisons `updated_at` comme une approximation raisonnable de la date de création
-- pour les enregistrements qui n'ont pas de valeur `created_at`.
UPDATE public.profiles
SET created_at = updated_at
WHERE created_at IS NULL;

-- Étape 3: Rendre la colonne non-nulle maintenant que toutes les lignes ont une valeur
-- Cette étape garantit l'intégrité des données pour les futures insertions.
ALTER TABLE public.profiles
ALTER COLUMN created_at SET NOT NULL;