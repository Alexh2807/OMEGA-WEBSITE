import React, { useMemo, useState } from 'react';
import { Plus, Trash2, ChevronLeft, ChevronRight, ImagePlus, X, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { productImages } from '../../utils/imageManager';
import { PageCalloutsApi } from './usePageCallouts';
import { GalleryItem } from './types';

type Props = {
  api: PageCalloutsApi;
  /** Affiché en mode édition dans la section galerie */
  open: boolean;
};

/**
 * Gestion de la galerie produit : ajouter (bibliothèque / URL),
 * supprimer, réordonner, éditer la légende.
 */
export const GalleryManager: React.FC<Props> = ({ api, open }) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [customCap, setCustomCap] = useState('');

  const gallery = api.gallery;

  const library = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Priorité boîtier / p102 / omega
    const preferred = productImages.filter(
      (p) =>
        p.includes('p102') ||
        p.includes('omega-box') ||
        p.includes('omega-dmx') ||
        p.includes('/products/'),
    );
    const list = preferred.length ? preferred : productImages;
    if (!q) return list.slice(0, 80);
    return list.filter((p) => p.toLowerCase().includes(q)).slice(0, 80);
  }, [query]);

  if (!open) return null;

  const addFromSrc = (src: string, cap?: string) => {
    if (gallery.some((g) => g.src === src)) {
      toast.error('Cette image est déjà dans la galerie');
      return;
    }
    const name = src.split('/').pop()?.replace(/\.(webp|png|jpe?g)$/i, '') || 'Photo';
    const entry = api.addGalleryItem({
      src,
      cap: cap || customCap || name.replace(/[-_]/g, ' '),
    });
    toast.success('Image ajoutée à la galerie');
    setPickerOpen(false);
    setCustomCap('');
    setCustomUrl('');
    return entry;
  };

  return (
    <div className="mt-8 rounded-2xl border border-amber-400/30 bg-black/70 p-4 backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-amber-300">
            Galerie · édition
          </div>
          <p className="mt-1 text-[11px] text-white/45">
            {gallery.length} image(s) — ajoutez, supprimez, réordonnez, légendes. Pensez à
            Enregistrer.
          </p>
        </div>
        <button
          type="button"
          data-gallery-add
          onClick={() => setPickerOpen(true)}
          className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black transition hover:bg-white/90"
        >
          <Plus size={14} />
          Ajouter une image
        </button>
      </div>

      {/* Liste compacte avec actions */}
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {gallery.map((g, index) => (
          <GalleryRow
            key={g.id}
            item={g}
            index={index}
            total={gallery.length}
            onCap={(cap) => api.updateGalleryItem(g.id, { cap })}
            onRemove={() => {
              if (!confirm(`Supprimer « ${g.cap || g.src} » de la galerie ?`)) return;
              api.removeGalleryItem(g.id);
              toast.success('Image retirée de la galerie');
            }}
            onMoveLeft={() => api.moveGalleryItem(index, index - 1)}
            onMoveRight={() => api.moveGalleryItem(index, index + 1)}
          />
        ))}
      </div>

      {gallery.length === 0 && (
        <p className="mt-4 text-center text-sm text-white/40">
          Galerie vide — ajoutez des photos depuis la bibliothèque.
        </p>
      )}

      {/* Picker modal */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/80 p-4 sm:items-center"
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-zinc-950 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <ImagePlus size={16} className="text-amber-400" />
                Ajouter à la galerie
              </div>
              <button
                type="button"
                className="rounded p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
                onClick={() => setPickerOpen(false)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 border-b border-white/10 p-4">
              <div className="relative">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35"
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filtrer la bibliothèque (p102, omega-box…)"
                  className="w-full rounded-lg border border-white/12 bg-white/5 py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-amber-400/50"
                />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="Ou coller un chemin / URL (/products/…)"
                  className="min-w-0 flex-1 rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-amber-400/50"
                />
                <input
                  value={customCap}
                  onChange={(e) => setCustomCap(e.target.value)}
                  placeholder="Légende"
                  className="w-full rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-amber-400/50 sm:w-40"
                />
                <button
                  type="button"
                  disabled={!customUrl.trim()}
                  onClick={() => addFromSrc(customUrl.trim(), customCap.trim() || undefined)}
                  className="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black disabled:opacity-40"
                >
                  Ajouter
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                {library.map((src) => {
                  const already = gallery.some((g) => g.src === src);
                  return (
                    <button
                      key={src}
                      type="button"
                      disabled={already}
                      onClick={() => addFromSrc(src)}
                      className={`group relative aspect-square overflow-hidden rounded-lg border transition ${
                        already
                          ? 'border-white/5 opacity-40'
                          : 'border-white/10 hover:border-amber-400/50'
                      }`}
                      title={src}
                    >
                      <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
                      {already && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-[10px] font-medium text-white">
                          Déjà ajoutée
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {library.length === 0 && (
                <p className="py-8 text-center text-sm text-white/40">Aucune image trouvée.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const GalleryRow: React.FC<{
  item: GalleryItem;
  index: number;
  total: number;
  onCap: (cap: string) => void;
  onRemove: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
}> = ({ item, index, total, onCap, onRemove, onMoveLeft, onMoveRight }) => (
  <div className="flex gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-2">
    <img
      src={item.src}
      alt=""
      className="h-14 w-20 shrink-0 rounded-md object-cover"
      loading="lazy"
    />
    <div className="min-w-0 flex-1">
      <input
        value={item.cap}
        onChange={(e) => onCap(e.target.value)}
        placeholder="Légende"
        className="w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-white outline-none focus:border-amber-400/40"
      />
      <div className="mt-1 truncate text-[9px] text-white/30">{item.src}</div>
      <div className="mt-1.5 flex items-center gap-1">
        <button
          type="button"
          disabled={index === 0}
          onClick={onMoveLeft}
          className="rounded border border-white/10 p-1 text-white/50 hover:bg-white/5 disabled:opacity-30"
          title="Déplacer à gauche"
        >
          <ChevronLeft size={12} />
        </button>
        <button
          type="button"
          disabled={index >= total - 1}
          onClick={onMoveRight}
          className="rounded border border-white/10 p-1 text-white/50 hover:bg-white/5 disabled:opacity-30"
          title="Déplacer à droite"
        >
          <ChevronRight size={12} />
        </button>
        <span className="ml-auto text-[9px] text-white/30">#{index + 1}</span>
        <button
          type="button"
          onClick={onRemove}
          className="rounded border border-red-500/25 p-1 text-red-300/80 hover:bg-red-500/10"
          title="Supprimer"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  </div>
);

export default GalleryManager;
