/*
  # Ajout du type de soirée aux lieux de planification

  1. Modification de la table `planning_locations`
    - Ajout de la colonne `type` (TEXT) pour stocker le type de soirée.
    - Définition d'une valeur par défaut 'Fete de village'.
    - Ajout d'une contrainte CHECK pour limiter les valeurs possibles.

  2. Sécurité
    - Aucune modification des politiques de sécurité (RLS) n'est nécessaire.
*/

-- Étape 1: Ajouter la colonne `type` à la table `planning_locations`
ALTER TABLE public.planning_locations
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'Fete de village' NOT NULL;

-- Étape 2: Ajouter une contrainte CHECK pour valider les types de soirées
-- Supprimer l'ancienne contrainte si elle existe pour la remplacer
ALTER TABLE public.planning_locations
DROP CONSTRAINT IF EXISTS planning_locations_type_check;

ALTER TABLE public.planning_locations
ADD CONSTRAINT planning_locations_type_check
CHECK (type IN ('Camping', 'Fete de village', 'Mousse', 'Pool Party (Journée)', 'Pool Party (Nuit)'));