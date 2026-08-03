/*
  # Un client ne peut pas s'auto-déclarer « TVA vérifiée »

  ## La faille, trouvée au banc de bout en bout (3 août 2026)
  Les policies de `profiles` laissent chacun modifier SON profil — ce qui est normal pour
  le prénom, le nom ou le téléphone. Mais la colonne `vat_number_valid` y était incluse :
  un simple PATCH REST suffisait à se déclarer vérifié.

      PATCH /rest/v1/profiles?id=eq.<moi>   { "vat_number_valid": true }   → 200

  Conséquence directe : `regime_tva` accorde alors l'autoliquidation, donc **0 % de TVA**.
  N'importe quel client pouvait s'exonérer de 20 % en une requête. C'est la faille la plus
  grave de l'audit, plus grave que le montant du paiement — elle produit des factures
  fausses, et la TVA non collectée reste due par le vendeur.

  ## La correction
  Un trigger qui REMET les champs de vérification à leur valeur d'avant dès que
  l'écriture ne vient pas du serveur. On ne rejette pas l'UPDATE (cela casserait les
  formulaires qui renvoient tout l'objet) : on **ignore** simplement ces colonnes.
  Seuls `service_role` (les fonctions serveur) et les admins peuvent les écrire.

  ⚠ `is_company` reste librement modifiable : se déclarer entreprise est une simple
  déclaration, sans effet fiscal tant que le numéro n'est pas VÉRIFIÉ. C'est bien la
  vérification qui fait foi, pas la déclaration.
*/
CREATE OR REPLACE FUNCTION profiles_proteger_verification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_role text;
BEGIN
  v_role := coalesce(current_setting('request.jwt.claim.role', true), '');

  -- Le serveur (service_role) et les admins écrivent librement.
  IF v_role = 'service_role' OR auth.uid() IS NULL OR is_admin() THEN
    RETURN NEW;
  END IF;

  -- Tout autre appelant : ces trois colonnes ne bougent pas.
  NEW.vat_number_valid := OLD.vat_number_valid;
  NEW.vat_checked_at   := OLD.vat_checked_at;
  NEW.vat_checked_name := OLD.vat_checked_name;

  -- Changer de numéro de TVA invalide la vérification précédente : sinon on saisirait un
  -- numéro valide, on le ferait vérifier, puis on le remplacerait par un autre en gardant
  -- le drapeau « vérifié ».
  IF coalesce(NEW.vat_number, '') IS DISTINCT FROM coalesce(OLD.vat_number, '') THEN
    NEW.vat_number_valid := NULL;
    NEW.vat_checked_at   := NULL;
    NEW.vat_checked_name := NULL;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS profiles_proteger_verification_trg ON profiles;
CREATE TRIGGER profiles_proteger_verification_trg
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION profiles_proteger_verification();

COMMENT ON FUNCTION profiles_proteger_verification() IS
  'Empêche un client de se déclarer « TVA vérifiée » et donc de s''exonérer de TVA. Seul le serveur écrit vat_number_valid.';
