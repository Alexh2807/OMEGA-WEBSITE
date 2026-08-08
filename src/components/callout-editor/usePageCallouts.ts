import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  CALLOUTS_SETTINGS_KEY,
  Callout,
  CalloutDesign,
  normalizeConfig,
  PageCalloutsConfig,
  PAGE_ID,
} from './types';
import { DEFAULT_PAGE_CALLOUTS, PhotoId } from './defaults';

function cloneConfig(cfg: PageCalloutsConfig): PageCalloutsConfig {
  return structuredClone(cfg);
}

export function usePageCallouts() {
  const [config, setConfig] = useState<PageCalloutsConfig>(() => cloneConfig(DEFAULT_PAGE_CALLOUTS));
  const [savedSnapshot, setSavedSnapshot] = useState<string>(() =>
    JSON.stringify(DEFAULT_PAGE_CALLOUTS.photos),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: qErr } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', CALLOUTS_SETTINGS_KEY)
        .maybeSingle();

      if (qErr) {
        // Table absente ou RLS : on garde les defaults
        setConfig(cloneConfig(DEFAULT_PAGE_CALLOUTS));
        setSavedSnapshot(JSON.stringify(DEFAULT_PAGE_CALLOUTS.photos));
        setError(null);
        return;
      }

      if (data?.value) {
        const normalized = normalizeConfig(data.value, DEFAULT_PAGE_CALLOUTS);
        setConfig(normalized);
        setSavedSnapshot(JSON.stringify(normalized.photos));
      } else {
        setConfig(cloneConfig(DEFAULT_PAGE_CALLOUTS));
        setSavedSnapshot(JSON.stringify(DEFAULT_PAGE_CALLOUTS.photos));
      }
    } catch {
      setConfig(cloneConfig(DEFAULT_PAGE_CALLOUTS));
      setSavedSnapshot(JSON.stringify(DEFAULT_PAGE_CALLOUTS.photos));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = useMemo(
    () => JSON.stringify(config.photos) !== savedSnapshot,
    [config.photos, savedSnapshot],
  );

  const getCallouts = useCallback(
    (photoId: PhotoId | string): Callout[] => config.photos[photoId] ?? [],
    [config.photos],
  );

  const setPhotoCallouts = useCallback((photoId: string, callouts: Callout[]) => {
    setConfig((prev) => ({
      ...prev,
      photos: { ...prev.photos, [photoId]: callouts },
    }));
  }, []);

  const updateCallout = useCallback(
    (photoId: string, calloutId: string, patch: Partial<Callout>) => {
      setConfig((prev) => {
        const list = prev.photos[photoId] ?? [];
        return {
          ...prev,
          photos: {
            ...prev.photos,
            [photoId]: list.map((c) =>
              c.id === calloutId
                ? {
                    ...c,
                    ...patch,
                    design: patch.design ? { ...c.design, ...patch.design } : c.design,
                  }
                : c,
            ),
          },
        };
      });
    },
    [],
  );

  const updateCalloutDesign = useCallback(
    (photoId: string, calloutId: string, designPatch: Partial<CalloutDesign>) => {
      setConfig((prev) => {
        const list = prev.photos[photoId] ?? [];
        return {
          ...prev,
          photos: {
            ...prev.photos,
            [photoId]: list.map((c) =>
              c.id === calloutId ? { ...c, design: { ...c.design, ...designPatch } } : c,
            ),
          },
        };
      });
    },
    [],
  );

  const addCallout = useCallback((photoId: string, callout: Callout) => {
    setConfig((prev) => ({
      ...prev,
      photos: {
        ...prev.photos,
        [photoId]: [...(prev.photos[photoId] ?? []), callout],
      },
    }));
  }, []);

  const removeCallout = useCallback((photoId: string, calloutId: string) => {
    setConfig((prev) => ({
      ...prev,
      photos: {
        ...prev.photos,
        [photoId]: (prev.photos[photoId] ?? []).filter((c) => c.id !== calloutId),
      },
    }));
  }, []);

  const resetToDefaults = useCallback(() => {
    setConfig(cloneConfig(DEFAULT_PAGE_CALLOUTS));
  }, []);

  const revert = useCallback(() => {
    try {
      const photos = JSON.parse(savedSnapshot) as PageCalloutsConfig['photos'];
      setConfig({ version: 1, pageId: PAGE_ID, photos });
    } catch {
      setConfig(cloneConfig(DEFAULT_PAGE_CALLOUTS));
    }
  }, [savedSnapshot]);

  const save = useCallback(async (): Promise<{ error: string | null }> => {
    setSaving(true);
    setError(null);
    const payload: PageCalloutsConfig = {
      version: 1,
      pageId: PAGE_ID,
      photos: config.photos,
      updatedAt: new Date().toISOString(),
    };
    try {
      const { error: upErr } = await supabase.from('site_settings').upsert(
        {
          key: CALLOUTS_SETTINGS_KEY,
          value: payload,
          updated_at: payload.updatedAt,
        },
        { onConflict: 'key' },
      );
      if (upErr) {
        const msg = upErr.message.includes('site_settings')
          ? "Impossible d'enregistrer : table site_settings ou droits admin manquants."
          : upErr.message;
        setError(msg);
        setSaving(false);
        return { error: msg };
      }
      setSavedSnapshot(JSON.stringify(payload.photos));
      setConfig(payload);
      setSaving(false);
      return { error: null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur inconnue';
      setError(msg);
      setSaving(false);
      return { error: msg };
    }
  }, [config.photos]);

  return {
    config,
    loading,
    saving,
    dirty,
    error,
    getCallouts,
    setPhotoCallouts,
    updateCallout,
    updateCalloutDesign,
    addCallout,
    removeCallout,
    resetToDefaults,
    revert,
    save,
    reload: load,
  };
}

export type PageCalloutsApi = ReturnType<typeof usePageCallouts>;
