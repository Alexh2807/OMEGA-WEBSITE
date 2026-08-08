import React, { useEffect, useState } from 'react';
import {
  Pencil,
  MousePointer2,
  Plus,
  Trash2,
  Save,
  RotateCcw,
  Undo2,
  X,
  ChevronDown,
  ChevronUp,
  Move,
  Crosshair,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PageCalloutsApi } from './usePageCallouts';
import {
  Callout,
  CalloutDesign,
  CalloutPathStyle,
  clamp,
  createCallout,
  DEFAULT_TRANSFORM,
  ImageOrient,
  ImageTransform,
  ParallaxMode,
} from './types';
import { PHOTO_LABELS } from './defaults';

export type EditorTool = 'select' | 'add';

type Props = {
  api: PageCalloutsApi;
  editMode: boolean;
  setEditMode: (v: boolean) => void;
  tool: EditorTool;
  setTool: (t: EditorTool) => void;
  selected: { photoId: string; calloutId: string } | null;
  setSelected: (s: { photoId: string; calloutId: string } | null) => void;
  /** Image sélectionnée pour 3D / parallax (même sans callout) */
  selectedImageId: string | null;
  setSelectedImageId: (id: string | null) => void;
};

const PATH_STYLES: {
  id: CalloutPathStyle;
  label: string;
  hint: string;
  /** Mini SVG preview path in 40x24 viewBox */
  preview: string;
}[] = [
  {
    id: 'straight',
    label: 'Droit',
    hint: 'Ligne directe A → B',
    preview: 'M4 20 L36 4',
  },
  {
    id: 'horizontal',
    label: 'Horizontal',
    hint: 'Horizontal puis vertical',
    preview: 'M4 12 H28 V6',
  },
  {
    id: 'elbow',
    label: 'Coude 90°',
    hint: 'Orthogonal H/V selon la distance',
    preview: 'M4 20 V8 H36',
  },
  {
    id: 'diag45',
    label: '45° + fin',
    hint: 'Départ 45° puis 0° ou 90°',
    preview: 'M4 20 L16 8 H36',
  },
];

export const AdminCalloutEditor: React.FC<Props> = ({
  api,
  editMode,
  setEditMode,
  tool,
  setTool,
  selected,
  setSelected,
  selectedImageId,
  setSelectedImageId,
}) => {
  const [panelOpen, setPanelOpen] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  const selectedCallout: Callout | null = (() => {
    if (!selected) return null;
    return api.getCallouts(selected.photoId).find((c) => c.id === selected.calloutId) ?? null;
  })();

  const activeImageId = selected?.photoId || selectedImageId;
  const transform: ImageTransform = activeImageId
    ? api.getTransform(activeImageId)
    : DEFAULT_TRANSFORM;

  const patchTransform = (p: Partial<ImageTransform>) => {
    if (!activeImageId) return;
    api.updateTransform(activeImageId, p);
  };

  useEffect(() => {
    if (!editMode) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'Escape') {
        if (tool === 'add') {
          setTool('select');
          toast('Placement annulé');
          return;
        }
        setSelected(null);
        setSelectedImageId(null);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        e.preventDefault();
        api.removeCallout(selected.photoId, selected.calloutId);
        setSelected(null);
        toast.success('Repère supprimé');
        return;
      }
      if (e.key === 'a' || e.key === 'A') {
        setTool('add');
        toast('Mode placement — cliquez le point sur l’image', { icon: '①' });
      }
      if (e.key === 'v' || e.key === 'V') setTool('select');
      if (selected && selectedCallout && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 2 : 0.5;
        // Shift+Alt = move card, else move point
        const moveCard = e.altKey;
        let x = moveCard ? selectedCallout.labelX : selectedCallout.x;
        let y = moveCard ? selectedCallout.labelY : selectedCallout.y;
        if (e.key === 'ArrowLeft') x -= step;
        if (e.key === 'ArrowRight') x += step;
        if (e.key === 'ArrowUp') y -= step;
        if (e.key === 'ArrowDown') y += step;
        x = clamp(x, 0.5, 99.5);
        y = clamp(y, 0.5, 99.5);
        if (moveCard) {
          api.updateCallout(selected.photoId, selected.calloutId, {
            labelX: x,
            labelY: y,
            side: x >= selectedCallout.x ? 'right' : 'left',
          });
        } else {
          api.updateCallout(selected.photoId, selected.calloutId, { x, y });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    editMode,
    selected,
    selectedCallout,
    api,
    setSelected,
    setSelectedImageId,
    setTool,
    tool,
  ]);

  const handleSave = async () => {
    const { error } = await api.save();
    if (error) toast.error(error);
    else toast.success('Repères enregistrés — visibles pour tout le monde');
  };

  const patch = (p: Partial<Callout>) => {
    if (!selected) return;
    api.updateCallout(selected.photoId, selected.calloutId, p);
  };

  const patchDesign = (d: Partial<CalloutDesign>) => {
    if (!selected) return;
    api.updateCalloutDesign(selected.photoId, selected.calloutId, d);
  };

  if (!editMode) {
    return (
      <div
        className="fixed z-[60]"
        style={{
          top: 'max(5.5rem, calc(env(safe-area-inset-top) + 4.5rem))',
          left: 'max(0.75rem, env(safe-area-inset-left))',
        }}
      >
        <button
          type="button"
          onClick={() => {
            setEditMode(true);
            setTool('select');
            setPanelOpen(true);
          }}
          className="group flex items-center gap-2 rounded-full border border-white/20 bg-black/85 px-3.5 py-2 text-xs font-semibold text-white shadow-xl backdrop-blur-md transition hover:border-amber-400/60 hover:bg-zinc-900"
          title="Mode édition des repères (admin)"
        >
          <Pencil size={14} className="text-amber-400" />
          <span>Mode édition</span>
        </button>
      </div>
    );
  }

  return (
    <>
      <div
        className="fixed z-[60] flex flex-col gap-2"
        style={{
          top: 'max(5.5rem, calc(env(safe-area-inset-top) + 4.5rem))',
          left: 'max(0.75rem, env(safe-area-inset-left))',
          maxWidth: 'min(360px, calc(100vw - 1.5rem))',
        }}
      >
        <div className="rounded-2xl border border-amber-400/40 bg-black/92 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-amber-300">
                Édition repères
              </span>
              {api.dirty && (
                <span className="rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-200">
                  non sauvé
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="rounded p-1 text-white/50 hover:bg-white/10 hover:text-white"
                onClick={() => setCollapsed((v) => !v)}
              >
                {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              </button>
              <button
                type="button"
                className="rounded p-1 text-white/50 hover:bg-white/10 hover:text-white"
                onClick={() => {
                  if (api.dirty && !confirm('Quitter sans enregistrer ?')) return;
                  if (api.dirty) api.revert();
                  setEditMode(false);
                  setSelected(null);
                  setSelectedImageId(null);
                }}
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {!collapsed && (
            <div className="space-y-3 p-3">
              {/* Workflow guide */}
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-[10px] leading-relaxed text-white/50">
                <div className="mb-1 font-semibold uppercase tracking-wider text-white/35">
                  Workflow
                </div>
                <ol className="list-decimal space-y-0.5 pl-3.5">
                  <li>
                    <strong className="text-white/70">Cliquez une image</strong> de la page pour la
                    sélectionner (3D / parallax)
                  </li>
                  <li>
                    <strong className="text-white/70">Ajouter</strong> → posez un point sur
                    n’importe quelle image
                  </li>
                  <li>
                    <strong className="text-white/70">Glissez la carte</strong> texte, choisissez le
                    fil
                  </li>
                  <li>
                    <strong className="text-white/70">Enregistrer</strong> pour publier
                  </li>
                </ol>
              </div>

              {activeImageId && (
                <div className="rounded-lg border border-sky-400/30 bg-sky-400/10 px-2.5 py-2 text-[11px] text-sky-100">
                  Image :{' '}
                  <strong>{PHOTO_LABELS[activeImageId] || activeImageId}</strong>
                  <span className="ml-1 text-sky-200/60">
                    · {api.getCallouts(activeImageId).length} repère(s)
                  </span>
                </div>
              )}

              <div className="flex flex-wrap gap-1.5">
                <ToolBtn
                  active={tool === 'select'}
                  onClick={() => setTool('select')}
                  icon={<MousePointer2 size={14} />}
                  label="Sélection (V)"
                />
                <ToolBtn
                  active={tool === 'add'}
                  onClick={() => {
                    setTool('add');
                    toast('Cliquez sur la photo pour placer le point', {
                      icon: '①',
                      duration: 3500,
                    });
                  }}
                  icon={<Plus size={14} />}
                  label="Placer un point (A)"
                />
                <ToolBtn
                  active={false}
                  onClick={() => {
                    if (!selected) {
                      toast.error('Sélectionnez un repère');
                      return;
                    }
                    api.removeCallout(selected.photoId, selected.calloutId);
                    setSelected(null);
                    toast.success('Supprimé');
                  }}
                  icon={<Trash2 size={14} />}
                  label="Suppr."
                  danger
                />
              </div>

              {tool === 'add' && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-400/10 px-2.5 py-2 text-[11px] text-amber-100">
                  <Crosshair size={14} className="mt-0.5 shrink-0" />
                  <span>
                    <strong>Mode placement actif</strong> — cliquez précisément sur l’élément à
                    montrer (prise XLR, antenne…). La carte se place à côté ; glissez-la ensuite.
                    Échap pour annuler.
                  </span>
                </div>
              )}

              {tool === 'select' && (
                <p className="text-[10px] leading-relaxed text-white/40">
                  Point = cible · carte = texte déplaçable · flèches = nudge point · Alt+flèches =
                  nudge carte
                </p>
              )}

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  disabled={!api.dirty || api.saving}
                  onClick={handleSave}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black transition enabled:hover:bg-white/90 disabled:opacity-40"
                >
                  <Save size={13} />
                  {api.saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
                <button
                  type="button"
                  disabled={!api.dirty}
                  onClick={() => {
                    api.revert();
                    toast('Modifications annulées');
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-2 text-xs text-white/70 transition hover:bg-white/5 disabled:opacity-40"
                >
                  <Undo2 size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!confirm('Réinitialiser tous les repères aux valeurs d’usine ?')) return;
                    api.resetToDefaults();
                    setSelected(null);
                    toast.success('Defaults chargés — pensez à Enregistrer');
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-2 text-xs text-white/70 transition hover:bg-white/5"
                >
                  <RotateCcw size={13} />
                </button>
              </div>

              {api.error && (
                <p className="rounded-lg bg-red-500/15 px-2 py-1.5 text-[11px] text-red-300">
                  {api.error}
                </p>
              )}

              {activeImageId && (
                <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                  <div className="mb-1.5 flex items-center gap-1 text-[10px] uppercase tracking-wider text-white/40">
                    <Move size={10} />
                    Repères · {PHOTO_LABELS[activeImageId] || activeImageId}
                  </div>
                  <div className="flex max-h-28 flex-col gap-0.5 overflow-y-auto">
                    {api.getCallouts(activeImageId).length === 0 && (
                      <p className="px-1 py-1 text-[10px] text-white/35">
                        Aucun repère — outil Ajouter puis clic sur l’image
                      </p>
                    )}
                    {api.getCallouts(activeImageId).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() =>
                          setSelected({ photoId: activeImageId, calloutId: c.id })
                        }
                        className={`rounded px-2 py-1 text-left text-[11px] transition ${
                          selected?.calloutId === c.id
                            ? 'bg-amber-400/20 text-amber-100'
                            : 'text-white/60 hover:bg-white/5'
                        }`}
                      >
                        {c.label || '(sans titre)'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => setPanelOpen((v) => !v)}
                className="w-full text-[10px] text-white/40 underline-offset-2 hover:text-white/70 hover:underline"
              >
                {panelOpen ? 'Masquer l’inspecteur' : 'Afficher l’inspecteur'}
              </button>
            </div>
          )}
        </div>
      </div>

      {panelOpen && activeImageId && (
        <div
          className="fixed z-[60] w-[min(340px,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border border-white/15 bg-black/92 shadow-2xl backdrop-blur-xl"
          style={{
            top: 'max(5.5rem, calc(env(safe-area-inset-top) + 4.5rem))',
            right: 'max(0.75rem, env(safe-area-inset-right))',
            maxHeight: 'calc(100vh - 7rem)',
          }}
        >
          <div className="sticky top-0 flex items-center justify-between border-b border-white/10 bg-black/95 px-3 py-2">
            <span className="text-xs font-bold uppercase tracking-wider text-white/70">
              Inspecteur
            </span>
            <button
              type="button"
              className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white"
              onClick={() => {
                setSelected(null);
                setSelectedImageId(null);
              }}
            >
              <X size={14} />
            </button>
          </div>

          <div className="space-y-4 p-3">
            {/* ── 3D / Parallax ── */}
            <div>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-amber-300/80">
                Conteneur 3D (bloc entier)
              </div>
              <p className="mb-3 text-[10px] text-white/40">
                {PHOTO_LABELS[activeImageId] || activeImageId} — la rotation s’applique au{' '}
                <strong className="text-white/60">conteneur complet</strong> (photo + repères),
                pas à l’image seule.
              </p>

              <div className="space-y-3">
                <Field label="Orientation conteneur">
                  <div className="grid grid-cols-4 gap-1">
                    {([0, 90, 180, 270] as ImageOrient[]).map((deg) => (
                      <button
                        key={deg}
                        type="button"
                        onClick={() => patchTransform({ orient: deg })}
                        className={`rounded-lg border py-2 text-center text-xs font-bold transition ${
                          (transform.orient ?? 0) === deg
                            ? 'border-amber-400/70 bg-amber-400/20 text-amber-100'
                            : 'border-white/10 text-white/55 hover:bg-white/5'
                        }`}
                      >
                        {deg}°
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-[9px] text-white/30">
                    90° / 270° : le cadre s’adapte (swap largeur/hauteur)
                  </p>
                </Field>

                <Field label={`Tilt Y (gauche/droite) · ${transform.rotateY.toFixed(0)}°`}>
                  <input
                    type="range"
                    min={-45}
                    max={45}
                    step={1}
                    value={transform.rotateY}
                    onChange={(e) => patchTransform({ rotateY: Number(e.target.value) })}
                    className="w-full accent-amber-400"
                  />
                </Field>
                <Field label={`Tilt X (haut/bas) · ${transform.rotateX.toFixed(0)}°`}>
                  <input
                    type="range"
                    min={-40}
                    max={40}
                    step={1}
                    value={transform.rotateX}
                    onChange={(e) => patchTransform({ rotateX: Number(e.target.value) })}
                    className="w-full accent-amber-400"
                  />
                </Field>
                <Field label={`Tilt Z fin · ${transform.rotateZ.toFixed(0)}°`}>
                  <input
                    type="range"
                    min={-45}
                    max={45}
                    step={1}
                    value={transform.rotateZ}
                    onChange={(e) => patchTransform({ rotateZ: Number(e.target.value) })}
                    className="w-full accent-amber-400"
                  />
                </Field>
                <Field label={`Perspective · ${transform.perspective}px`}>
                  <input
                    type="range"
                    min={400}
                    max={1600}
                    step={50}
                    value={transform.perspective}
                    onChange={(e) => patchTransform({ perspective: Number(e.target.value) })}
                    className="w-full accent-amber-400"
                  />
                </Field>
                <Field label={`Échelle · ${transform.scale.toFixed(2)}`}>
                  <input
                    type="range"
                    min={0.7}
                    max={1.3}
                    step={0.01}
                    value={transform.scale}
                    onChange={(e) => patchTransform({ scale: Number(e.target.value) })}
                    className="w-full accent-amber-400"
                  />
                </Field>

                <Field label="Parallax (animation)">
                  <div className="flex gap-1">
                    {(
                      [
                        ['none', 'Off'],
                        ['scroll', 'Scroll'],
                        ['mouse', 'Souris'],
                      ] as const
                    ).map(([val, lab]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => patchTransform({ parallaxMode: val as ParallaxMode })}
                        className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-medium transition ${
                          transform.parallaxMode === val
                            ? 'border-amber-400/60 bg-amber-400/15 text-amber-100'
                            : 'border-white/10 text-white/50 hover:bg-white/5'
                        }`}
                      >
                        {lab}
                      </button>
                    ))}
                  </div>
                </Field>

                {transform.parallaxMode !== 'none' && (
                  <>
                    <Field label={`Amplitude G/D · ${transform.parallaxX}`}>
                      <input
                        type="range"
                        min={0}
                        max={20}
                        step={0.5}
                        value={transform.parallaxX}
                        onChange={(e) => patchTransform({ parallaxX: Number(e.target.value) })}
                        className="w-full accent-amber-400"
                      />
                    </Field>
                    <Field label={`Amplitude H/B · ${transform.parallaxY}`}>
                      <input
                        type="range"
                        min={0}
                        max={20}
                        step={0.5}
                        value={transform.parallaxY}
                        onChange={(e) => patchTransform({ parallaxY: Number(e.target.value) })}
                        className="w-full accent-amber-400"
                      />
                    </Field>
                  </>
                )}

                <Field label="Focus image (object-position)">
                  <select
                    className="field-input"
                    value={transform.objectPosition}
                    onChange={(e) => patchTransform({ objectPosition: e.target.value })}
                  >
                    <option value="center center">Centre</option>
                    <option value="center top">Haut</option>
                    <option value="center bottom">Bas</option>
                    <option value="left center">Gauche</option>
                    <option value="right center">Droite</option>
                    <option value="center 30%">Haut 30%</option>
                    <option value="center 60%">Bas 60%</option>
                  </select>
                </Field>

                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    className="rounded-lg border border-white/15 px-2 py-1 text-[10px] text-white/60 hover:bg-white/5"
                    onClick={() =>
                      patchTransform({
                        orient: transform.orient ?? 0,
                        rotateY: 12,
                        rotateX: 4,
                        rotateZ: 0,
                        parallaxMode: 'mouse',
                        parallaxX: 8,
                        parallaxY: 4,
                        perspective: 900,
                      })
                    }
                  >
                    Preset carte 3D
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-white/15 px-2 py-1 text-[10px] text-white/60 hover:bg-white/5"
                    onClick={() =>
                      patchTransform({
                        orient: transform.orient ?? 0,
                        rotateY: 0,
                        rotateX: 0,
                        rotateZ: 0,
                        parallaxMode: 'scroll',
                        parallaxX: 6,
                        parallaxY: 10,
                      })
                    }
                  >
                    Preset scroll
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-white/15 px-2 py-1 text-[10px] text-white/60 hover:bg-white/5"
                    onClick={() => patchTransform({ ...DEFAULT_TRANSFORM })}
                  >
                    Reset 3D
                  </button>
                </div>
              </div>
            </div>

            {/* ── Callout ── */}
            {selectedCallout && selected && (
              <>
            <div className="border-t border-white/10 pt-3 text-[10px] font-semibold uppercase tracking-wider text-white/40">
              Repère sélectionné
            </div>
            <Field label="Titre">
              <input
                className="field-input"
                value={selectedCallout.label}
                onChange={(e) => patch({ label: e.target.value })}
                placeholder="Univers 1"
              />
            </Field>
            <Field label="Sous-titre">
              <input
                className="field-input"
                value={selectedCallout.sub || ''}
                onChange={(e) => patch({ sub: e.target.value })}
                placeholder="DMX OUT · 512 canaux"
              />
            </Field>

            {/* Path style */}
            <div className="border-t border-white/10 pt-3">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                Forme du fil (A → carte)
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {PATH_STYLES.map((ps) => {
                  const active = (selectedCallout.design.pathStyle || 'horizontal') === ps.id;
                  return (
                    <button
                      key={ps.id}
                      type="button"
                      onClick={() => patchDesign({ pathStyle: ps.id })}
                      className={`rounded-xl border p-2 text-left transition ${
                        active
                          ? 'border-amber-400/60 bg-amber-400/15'
                          : 'border-white/10 hover:bg-white/5'
                      }`}
                      title={ps.hint}
                    >
                      <svg
                        viewBox="0 0 40 24"
                        className="mb-1 h-6 w-full"
                        fill="none"
                        aria-hidden
                      >
                        <path
                          d={ps.preview}
                          stroke={active ? '#fbbf24' : '#fff'}
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          opacity={active ? 1 : 0.55}
                        />
                        <circle cx="4" cy={ps.id === 'straight' ? 20 : ps.id === 'elbow' ? 20 : 12} r="1.8" fill={active ? '#fbbf24' : '#fff'} opacity={0.9} />
                      </svg>
                      <div
                        className={`text-[11px] font-semibold ${
                          active ? 'text-amber-100' : 'text-white/70'
                        }`}
                      >
                        {ps.label}
                      </div>
                      <div className="mt-0.5 text-[9px] leading-snug text-white/35">{ps.hint}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Point X %">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  className="field-input"
                  value={Number(selectedCallout.x.toFixed(1))}
                  onChange={(e) => patch({ x: Number(e.target.value) })}
                />
              </Field>
              <Field label="Point Y %">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  className="field-input"
                  value={Number(selectedCallout.y.toFixed(1))}
                  onChange={(e) => patch({ y: Number(e.target.value) })}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Carte X %">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  className="field-input"
                  value={Number(selectedCallout.labelX.toFixed(1))}
                  onChange={(e) => {
                    const labelX = Number(e.target.value);
                    patch({
                      labelX,
                      side: labelX >= selectedCallout.x ? 'right' : 'left',
                    });
                  }}
                />
              </Field>
              <Field label="Carte Y %">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  className="field-input"
                  value={Number(selectedCallout.labelY.toFixed(1))}
                  onChange={(e) => patch({ labelY: Number(e.target.value) })}
                />
              </Field>
            </div>

            <div className="border-t border-white/10 pt-3">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                Apparence
              </div>
              <div className="space-y-3">
                <Field label="Couleur">
                  <div className="flex gap-1">
                    {(
                      [
                        ['bw', 'N&B'],
                        ['white', 'Blanc'],
                        ['black', 'Noir'],
                      ] as const
                    ).map(([val, lab]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => patchDesign({ lineColor: val })}
                        className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-medium transition ${
                          selectedCallout.design.lineColor === val
                            ? 'border-amber-400/60 bg-amber-400/15 text-amber-100'
                            : 'border-white/10 text-white/50 hover:bg-white/5'
                        }`}
                      >
                        {lab}
                      </button>
                    ))}
                  </div>
                </Field>

                <Field label="Trait">
                  <div className="flex gap-1">
                    {(
                      [
                        ['solid', 'Continu'],
                        ['dashed', 'Pointillé'],
                      ] as const
                    ).map(([val, lab]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => patchDesign({ lineStyle: val })}
                        className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-medium transition ${
                          selectedCallout.design.lineStyle === val
                            ? 'border-amber-400/60 bg-amber-400/15 text-amber-100'
                            : 'border-white/10 text-white/50 hover:bg-white/5'
                        }`}
                      >
                        {lab}
                      </button>
                    ))}
                  </div>
                </Field>

                <Field label={`Épaisseur (${selectedCallout.design.strokeWidth}px)`}>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={1}
                    value={selectedCallout.design.strokeWidth}
                    onChange={(e) => patchDesign({ strokeWidth: Number(e.target.value) })}
                    className="w-full accent-amber-400"
                  />
                </Field>

                <Field label={`Taille point (${selectedCallout.design.pointSize}px)`}>
                  <input
                    type="range"
                    min={4}
                    max={16}
                    step={1}
                    value={selectedCallout.design.pointSize}
                    onChange={(e) => patchDesign({ pointSize: Number(e.target.value) })}
                    className="w-full accent-amber-400"
                  />
                </Field>

                <Field label="Style carte">
                  <select
                    className="field-input"
                    value={selectedCallout.design.labelStyle}
                    onChange={(e) =>
                      patchDesign({
                        labelStyle: e.target.value as CalloutDesign['labelStyle'],
                      })
                    }
                  >
                    <option value="dark">Sombre (défaut)</option>
                    <option value="light">Claire</option>
                    <option value="minimal">Minimal (sans fond)</option>
                  </select>
                </Field>

                <label className="flex items-center gap-2 text-[11px] text-white/70">
                  <input
                    type="checkbox"
                    checked={selectedCallout.design.showSub}
                    onChange={(e) => patchDesign({ showSub: e.target.checked })}
                    className="accent-amber-400"
                  />
                  Afficher le sous-titre
                </label>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                api.removeCallout(selected.photoId, selected.calloutId);
                setSelected(null);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/30 py-2 text-xs font-medium text-red-300 transition hover:bg-red-500/10"
            >
              <Trash2 size={13} />
              Supprimer ce repère
            </button>
              </>
            )}

            {!selectedCallout && (
              <p className="border-t border-white/10 pt-3 text-[11px] text-white/40">
                Sélectionnez un repère sur l’image, ou utilisez <strong className="text-white/60">Ajouter</strong> pour en créer un.
              </p>
            )}
          </div>

          <style>{`
            .field-input {
              width: 100%;
              border-radius: 0.5rem;
              border: 1px solid rgba(255,255,255,0.12);
              background: rgba(255,255,255,0.05);
              padding: 0.4rem 0.55rem;
              font-size: 12px;
              color: white;
              outline: none;
            }
            .field-input:focus {
              border-color: rgba(251, 191, 36, 0.5);
            }
            .field-input option {
              background: #111;
              color: white;
            }
          `}</style>
        </div>
      )}
    </>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-white/40">
      {label}
    </span>
    {children}
  </label>
);

const ToolBtn: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
}> = ({ active, onClick, icon, label, danger }) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition ${
      active
        ? 'border-amber-400/50 bg-amber-400/15 text-amber-100'
        : danger
          ? 'border-white/10 text-red-300/80 hover:bg-red-500/10'
          : 'border-white/10 text-white/60 hover:bg-white/5'
    }`}
  >
    {icon}
    {label}
  </button>
);

/** ① Clic menu Ajouter → ② clic sur l’image = pose le POINT, carte offset à côté */
export function handleAddCallout(
  api: PageCalloutsApi,
  photoId: string,
  x: number,
  y: number,
  setSelected: (s: { photoId: string; calloutId: string } | null) => void,
  setTool: (t: EditorTool) => void,
) {
  const side = x > 50 ? 'left' : 'right'; // carte du côté où il y a de la place
  const offset = 14;
  const labelX = clamp(side === 'right' ? x + offset : x - offset, 2, 98);
  const labelY = clamp(y - 4, 2, 98);

  const callout = createCallout({
    x,
    y,
    labelX,
    labelY,
    label: 'Nouveau repère',
    sub: 'Double-clic → éditer le texte',
    side,
    design: {
      pathStyle: 'horizontal',
      lineColor: 'bw',
      strokeWidth: 2,
      lineStyle: 'solid',
      pointSize: 8,
      labelStyle: 'dark',
      showSub: true,
    },
  });
  api.addCallout(photoId, callout);
  setSelected({ photoId, calloutId: callout.id });
  setTool('select');
  toast.success('Point placé — glissez la carte pour positionner le texte', {
    duration: 4000,
  });
}

export default AdminCalloutEditor;
