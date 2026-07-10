import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';

/**
 * Réglages globaux du site, pilotés depuis l'admin (table `site_settings`).
 *
 * MODE VITRINE (`vitrineMode`) : le site présente les produits SANS vente en
 * ligne — panier et paiement masqués partout, remplacés par « Demander un
 * devis » et « Appeler ». Tant que la table n'existe pas ou ne répond pas,
 * le mode vitrine est ACTIF PAR DÉFAUT (sécurité : aucune vente ne doit
 * passer tant que la boutique n'est pas explicitement ouverte).
 */

interface SiteSettingsContextType {
  vitrineMode: boolean;
  loading: boolean;
  /** Écrit le mode en base (admin uniquement — protégé par RLS côté Supabase). */
  setVitrineMode: (on: boolean) => Promise<{ error: string | null }>;
  refresh: () => Promise<void>;
}

const SiteSettingsContext = createContext<SiteSettingsContextType | undefined>(
  undefined
);

const SITE_MODE_KEY = 'site_mode';

export const SiteSettingsProvider = ({ children }: { children: ReactNode }) => {
  const [vitrineMode, setVitrine] = useState(true); // vitrine tant qu'on ne sait pas
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', SITE_MODE_KEY)
        .maybeSingle();

      if (!error && data && data.value && typeof data.value.vitrine === 'boolean') {
        setVitrine(data.value.vitrine);
      } else {
        // Table absente / ligne absente / erreur → vitrine par défaut (sûr).
        setVitrine(true);
      }
    } catch {
      setVitrine(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const setVitrineMode = async (on: boolean): Promise<{ error: string | null }> => {
    try {
      const { error } = await supabase
        .from('site_settings')
        .upsert(
          { key: SITE_MODE_KEY, value: { vitrine: on }, updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        );
      if (error) {
        return {
          error:
            error.message.includes('site_settings')
              ? "La table site_settings n'existe pas encore : applique la migration Supabase (supabase/migrations/…_site_settings.sql) via le SQL Editor."
              : error.message,
        };
      }
      setVitrine(on);
      return { error: null };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Erreur inconnue' };
    }
  };

  return (
    <SiteSettingsContext.Provider
      value={{ vitrineMode, loading, setVitrineMode, refresh }}
    >
      {children}
    </SiteSettingsContext.Provider>
  );
};

export const useSiteSettings = () => {
  const context = useContext(SiteSettingsContext);
  if (context === undefined) {
    throw new Error(
      'useSiteSettings doit être utilisé dans un SiteSettingsProvider'
    );
  }
  return context;
};
