/*
  # Fermeture de `profiles` et des tables `planning_*` (RLS)

  ## Ce qui était ouvert (mesuré sur la base de production avec la SEULE clé anon publique)
  Les tables `profiles`, `planning_events`, `planning_locations` et `planning_providers`
  n'avaient pas RLS activé. Or le rôle `anon` détient, par défaut chez Supabase,
  SELECT/INSERT/UPDATE/DELETE sur ces tables : sans RLS, plus rien ne le retient.
  Constaté, sans être connecté :
  - lecture de `first_name, last_name, phone, address, city` de TOUS les clients —
    donnée personnelle au sens du RGPD, et le champ `role` désignait au passage les
    deux comptes administrateurs ;
  - écriture acceptée (HTTP 204 sur un PATCH `{"role":"admin"}`). N'importe quel
    visiteur pouvait donc se promouvoir administrateur, puis lire commandes, devis,
    factures et paramètres — ou vider les tables.

  `profiles` portait déjà 5 policies, mais RLS désactivé les rendait inertes. L'une
  d'elles, « Admins can manage all profiles. », interrogeait `profiles` depuis une
  policy DE `profiles` : l'activer telle quelle aurait produit l'erreur
  « infinite recursion detected in policy for relation profiles ».
  → elle est remplacée par `is_admin()`, fonction SECURITY DEFINER qui existait déjà
  et qui, s'exécutant avec les droits du propriétaire, ne repasse pas par les policies.

  ## Découpage retenu pour le planning
  Le calendrier public (`PublicPlanningCalendar`, page Spectacles) lit `planning_events`
  joint à `planning_locations` et `planning_event_types` sans être connecté : ces trois
  tables restent donc en lecture publique — c'est un agenda de spectacles, publié
  volontairement. `planning_providers` NON : sa colonne `costs` est un coût interne.
  Écriture réservée aux administrateurs dans les quatre cas.

  Au passage : `planning_event_types` n'autorisait la lecture qu'aux comptes connectés,
  alors que le calendrier public en tire le libellé du type d'événement. Un visiteur non
  connecté voyait donc « Type non défini » sur chaque date. La policy est élargie à
  `anon`, ce qui corrige cet affichage.

  ## Escalade de privilèges par mise à jour de son propre profil
  Autoriser un utilisateur à mettre à jour SA ligne (nécessaire : la page Compte le fait)
  l'autoriserait aussi à y passer `role = 'admin'`. RLS filtre des lignes, pas des
  colonnes : la garde est donc un trigger, `profiles_protect_privileged_columns`, qui
  restaure les colonnes de privilège, de vérification et de statistiques dès que
  l'auteur de l'écriture n'est pas administrateur.
  Il laisse passer deux contextes légitimes, sans quoi il casserait l'existant :
  - `auth.uid() IS NULL` — clé service_role (fonctions Edge `admin-users`,
    `admin-delete-user`) et tâches SQL ;
  - `pg_trigger_depth() > 1` — écriture faite PAR un trigger : `handle_new_user`
    (pose `role='customer'` à l'inscription, puis `email_verified` à la confirmation)
    et `update_user_stats` (recalcule `total_orders`/`total_spent` à chaque commande).
  Aucun trigger n'écrit `role` : cette seconde porte ne rouvre pas l'escalade.
*/

-- ---------------------------------------------------------------------------
-- 1. profiles
-- ---------------------------------------------------------------------------

-- Table rase : les 5 policies héritées, dont deux doublons d'UPDATE et la version
-- récursive de la policy admin.
DROP POLICY IF EXISTS "Admins can manage all profiles."      ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile."    ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile"   ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile"   ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile."  ON public.profiles;

-- Chacun sa ligne, et rien d'autre.
CREATE POLICY "profiles_select_self" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "profiles_insert_self" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_self" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- L'administrateur voit et gère tout le monde.
CREATE POLICY "profiles_admin_all" ON public.profiles
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Pas de policy pour `anon` : un visiteur non connecté n'a plus aucun accès.
-- Pas de DELETE pour un client : la suppression de compte passe par la fonction
-- Edge `admin-delete-user` (service_role), qui doit aussi retirer le compte auth.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Garde anti-escalade (voir l'en-tête).
CREATE OR REPLACE FUNCTION public.profiles_protect_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR pg_trigger_depth() > 1 OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.role           := 'customer';
    NEW.is_active      := true;
    NEW.total_orders   := 0;
    NEW.total_spent    := 0;
    NEW.email_verified := false;
    NEW.phone_verified := false;
  ELSE
    NEW.role           := OLD.role;
    NEW.is_active      := OLD.is_active;
    NEW.total_orders   := OLD.total_orders;
    NEW.total_spent    := OLD.total_spent;
    NEW.email_verified := OLD.email_verified;
    NEW.phone_verified := OLD.phone_verified;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_privileged_columns ON public.profiles;
CREATE TRIGGER profiles_protect_privileged_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_protect_privileged_columns();

-- ---------------------------------------------------------------------------
-- 2. planning_events / planning_locations — lecture publique, écriture admin
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "planning_events_select_public" ON public.planning_events;
CREATE POLICY "planning_events_select_public" ON public.planning_events
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "planning_events_admin_all" ON public.planning_events;
CREATE POLICY "planning_events_admin_all" ON public.planning_events
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

ALTER TABLE public.planning_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "planning_locations_select_public" ON public.planning_locations;
CREATE POLICY "planning_locations_select_public" ON public.planning_locations
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "planning_locations_admin_all" ON public.planning_locations;
CREATE POLICY "planning_locations_admin_all" ON public.planning_locations
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

ALTER TABLE public.planning_locations ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. planning_event_types — lecture élargie à `anon` (calendrier public)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Authenticated users can view event types" ON public.planning_event_types;
DROP POLICY IF EXISTS "Admins can manage event types"            ON public.planning_event_types;

CREATE POLICY "planning_event_types_select_public" ON public.planning_event_types
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "planning_event_types_admin_all" ON public.planning_event_types
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. planning_providers — interne (colonne `costs`) : administrateurs seulement
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "planning_providers_admin_all" ON public.planning_providers;
CREATE POLICY "planning_providers_admin_all" ON public.planning_providers
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

ALTER TABLE public.planning_providers ENABLE ROW LEVEL SECURITY;
