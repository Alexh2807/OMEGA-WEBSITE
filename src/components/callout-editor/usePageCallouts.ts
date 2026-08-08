import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  CALLOUTS_SETTINGS_KEY,
  Callout,
  CalloutDesign,
  DEFAULT_TRANSFORM,
  GalleryItem,
  ImageTransform,
  normalizeConfig,
  normalizeTransform,
  newCalloutId,
  PageCalloutsConfig,
  PAGE_ID,
} from './types';
import { DEFAULT_PAGE_CALLOUTS } from './defaults';

function cloneConfig(cfg: PageCalloutsConfig): PageCalloutsConfig {
  return structuredClone(cfg);
}

function snapshotOf(cfg: PageCalloutsConfig): string {
  return JSON.stringify({
    photos: cfg.photos,
    transforms: cfg.transforms || {},
    gallery: cfg.gallery || [],
  });
}

export function usePageCallouts() {
  const [config, setConfig] = useState<PageCalloutsConfig>(() => cloneConfig(DEFAULT_PAGE_CALLOUTS));
  const [savedSnapshot, setSavedSnapshot] = useState<string>(() =>
    snapshotOf(DEFAULT_PAGE_CALLOUTS),
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
        setConfig(cloneConfig(DEFAULT_PAGE_CALLOUTS));
        setSavedSnapshot(snapshotOf(DEFAULT_PAGE_CALLOUTS));
        setError(null);
        return;
      }

      if (data?.value) {
        const normalized = normalizeConfig(data.value, DEFAULT_PAGE_CALLOUTS);
        setConfig(normalized);
        setSavedSnapshot(snapshotOf(normalized));
      } else {
        setConfig(cloneConfig(DEFAULT_PAGE_CALLOUTS));
        setSavedSnapshot(snapshotOf(DEFAULT_PAGE_CALLOUTS));
      }
    } catch {
      setConfig(cloneConfig(DEFAULT_PAGE_CALLOUTS));
      setSavedSnapshot(snapshotOf(DEFAULT_PAGE_CALLOUTS));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = useMemo(() => snapshotOf(config) !== savedSnapshot, [config, savedSnapshot]);

  const gallery: GalleryItem[] = config.gallery ?? DEFAULT_PAGE_CALLOUTS.gallery ?? [];

  const getCallouts = useCallback(
    (photoId: string): Callout[] => config.photos[photoId] ?? [],
    [config.photos],
  );

  const getTransform = useCallback(
    (photoId: string): ImageTransform =>
      normalizeTransform(config.transforms?.[photoId] ?? DEFAULT_TRANSFORM),
    [config.transforms],
  );

  const updateTransform = useCallback((photoId: string, patch: Partial<ImageTransform>) => {
    setConfig((prev) => {
      const current = normalizeTransform(prev.transforms?.[photoId] ?? DEFAULT_TRANSFORM);
      return {
        ...prev,
        version: 3,
        transforms: {
          ...(prev.transforms || {}),
          [photoId]: { ...current, ...patch },
        },
      };
    });
  }, []);

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

  /* ── Galerie ── */
  const addGalleryItem = useCallback((item: Omit<GalleryItem, 'id'> & { id?: string }) => {
    const id = item.id || `g_${newCalloutId().slice(2)}`;
    const entry: GalleryItem = {
      id,
      src: item.src,
      cap: item.cap || '',
    };
    setConfig((prev) => ({
      ...prev,
      version: 3,
      gallery: [...(prev.gallery || []), entry],
    }));
    return entry;
  }, []);

  const removeGalleryItem = useCallback((id: string) => {
    setConfig((prev) => ({
      ...prev,
      version: 3,
      gallery: (prev.gallery || []).filter((g) => g.id !== id),
      // garder callouts/transforms orphelins n’est pas grave ; on peut nettoyer
    }));
  }, []);

  const updateGalleryItem = useCallback((id: string, patch: Partial<Pick<GalleryItem, 'src' | 'cap'>>) => {
    setConfig((prev) => ({
      ...prev,
      version: 3,
      gallery: (prev.gallery || []).map((g) => (g.id === id ? { ...g, ...patch } : g)),
    }));
  }, []);

  const moveGalleryItem = useCallback((from: number, to: number) => {
    setConfig((prev) => {
      const list = [...(prev.gallery || [])];
      if (from < 0 || from >= list.length || to < 0 || to >= list.length) return prev;
      const [item] = list.splice(from, 1);
      list.splice(to, 0, item);
      return { ...prev, version: 3, gallery: list };
    });
  }, []);

  const setGallery = useCallback((items: GalleryItem[]) => {
    setConfig((prev) => ({ ...prev, version: 3, gallery: items }));
  }, []);

  const resetToDefaults = useCallback(() => {
    setConfig(cloneConfig(DEFAULT_PAGE_CALLOUTS));
  }, []);

  const revert = useCallback(() => {
    try {
      const snap = JSON.parse(savedSnapshot) as {
        photos: PageCalloutsConfig['photos'];
        transforms: PageCalloutsConfig['transforms'];
        gallery: GalleryItem[];
      };
      setConfig({
        version: 3,
        pageId: PAGE_ID,
        photos: snap.photos,
        transforms: snap.transforms || {},
        gallery: snap.gallery || [],
      });
    } catch {
      setConfig(cloneConfig(DEFAULT_PAGE_CALLOUTS));
    }
  }, [savedSnapshot]);

  const save = useCallback(async (): Promise<{ error: string | null }> => {
    setSaving(true);
    setError(null);
    const payload: PageCalloutsConfig = {
      version: 3,
      pageId: PAGE_ID,
      photos: config.photos,
      transforms: config.transforms || {},
      gallery: config.gallery || [],
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
      setSavedSnapshot(snapshotOf(payload));
      setConfig(payload);
      setSaving(false);
      return { error: null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur inconnue';
      setError(msg);
      setSaving(false);
      return { error: msg };
    }
  }, [config.photos, config.transforms, config.gallery]);

  return {
    config,
    loading,
    saving,
    dirty,
    error,
    gallery,
    getCallouts,
    getTransform,
    updateTransform,
    setPhotoCallouts,
    updateCallout,
    updateCalloutDesign,
    addCallout,
    removeCallout,
    addGalleryItem,
    removeGalleryItem,
    updateGalleryItem,
    moveGalleryItem,
    setGallery,
    resetToDefaults,
    revert,
    save,
    reload: load,
  };
}

export type PageCalloutsApi = ReturnType<typeof usePageCallouts>;
