import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * OFFRE DE LANCEMENT, lue dans `site_settings.offre_lancement`
 * (cf. supabase/migrations/20260924120000_offre_lancement_boitier.sql).
 *
 * ⚖ Présentée comme un PRIX DE LANCEMENT avec annonce du prix suivant — jamais comme
 * un prix barré : le prix de référence d'une réduction doit être le plus bas des 30
 * derniers jours (art. L112-1-1 C. conso), et ce n'est pas le prix futur.
 *
 * Le prix affiché et encaissé reste celui de la table `products` : ce réglage ne sert
 * qu'à ANNONCER l'offre et sa date de fin. Passée `fin`, le site cesse de l'annoncer
 * même si la tâche planifiée qui remet le prix à jour n'a pas encore tourné.
 */
export interface OffreLancement {
  sku: string;
  prixLancementTtc: number;
  prixApresTtc: number;
  fin: Date;
  lien: string;
}

let promesse: Promise<OffreLancement | null> | null = null;

function charger(): Promise<OffreLancement | null> {
  if (!promesse) {
    promesse = (async () => {
      try {
        const { data } = await supabase
          .from('site_settings')
          .select('value')
          .eq('key', 'offre_lancement')
          .maybeSingle();
        const v = data?.value as Record<string, unknown> | undefined;
        if (!v || v.actif !== true) return null;
        const fin = new Date(String(v.fin));
        if (Number.isNaN(fin.getTime())) return null;
        return {
          sku: String(v.sku || ''),
          prixLancementTtc: Number(v.prix_lancement_ttc),
          prixApresTtc: Number(v.prix_apres_ttc),
          fin,
          lien: String(v.lien || '/omega-dmx-interface'),
        };
      } catch {
        return null; // une offre illisible ne doit jamais casser une page
      }
    })();
  }
  return promesse;
}

/** Offre en cours, ou `null` (absente, désactivée ou échue). */
export function useOffreLancement(): OffreLancement | null {
  const [offre, setOffre] = useState<OffreLancement | null>(null);
  useEffect(() => {
    let vivant = true;
    charger().then(o => {
      if (vivant) setOffre(o && Date.now() < o.fin.getTime() ? o : null);
    });
    return () => {
      vivant = false;
    };
  }, []);
  return offre;
}

/** « 31 décembre » — date de fin lue à l'heure de Paris. */
export function dateFinOffre(o: OffreLancement, avecAnnee = false): string {
  return o.fin.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    ...(avecAnnee ? { year: 'numeric' } : {}),
    timeZone: 'Europe/Paris',
  });
}

/** Jour où le prix suivant s'applique (lendemain de la fin) : « 1er janvier ». */
export function dateApresOffre(o: OffreLancement): string {
  const d = new Date(o.fin.getTime() + 1000);
  const jour = Number(d.toLocaleDateString('fr-FR', { day: 'numeric', timeZone: 'Europe/Paris' }));
  const mois = d.toLocaleDateString('fr-FR', { month: 'long', timeZone: 'Europe/Paris' });
  return `${jour === 1 ? '1er' : jour} ${mois}`;
}

/** Prix suivant l'offre, dans le mode d'affichage du visiteur (TTC ou HT). */
export function prixApres(o: OffreLancement, ht: boolean): string {
  const v = ht ? Math.round((o.prixApresTtc / 1.2) * 100) / 100 : o.prixApresTtc;
  return `${v.toLocaleString('fr-FR', { minimumFractionDigits: ht ? 2 : 0, maximumFractionDigits: 2 })} € ${ht ? 'HT' : 'TTC'}`;
}
