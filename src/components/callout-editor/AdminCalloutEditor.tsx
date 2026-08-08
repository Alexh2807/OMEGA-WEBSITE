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
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PageCalloutsApi } from './usePageCallouts';
import { Callout, CalloutDesign, CalloutSide, createCallout } from './types';
import { PHOTO_LABELS, PhotoId } from './defaults';

export type EditorTool = 'select' | 'add';

type Props = {
  api: PageCalloutsApi;
  editMode: boolean;
  setEditMode: (v: boolean) => void;
  tool: EditorTool;
  setTool: (t: EditorTool) => void;
  selected: { photoId: string; calloutId: string } | null;
  setSelected: (s: { photoId: string; calloutId: string } | null) => void;
};

export const AdminCalloutEditor: React.FC<Props> = ({
  api,
  editMode,
  setEditMode,
  tool,
  setTool,
  selected,
  setSelected,
}) => {
  const [panelOpen, setPanelOpen] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  const selectedCallout: Callout | null = (() => {
    if (!selected) return null;
    return api.getCallouts(selected.photoId).find((c) => c.id === selected.calloutId) ?? null;
  })();

  // Raccourcis clavier
  useEffect(() => {
    if (!editMode) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'Escape') {
        setSelected(null);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        e.preventDefault();
        api.removeCallout(selected.photoId, selected.calloutId);
        setSelected(null);
        toast.success('Repère supprimé');
        return;
      }
      if (e.key === 'a' || e.key === 'A') setTool('add');
      if (e.key === 'v' || e.key === 'V') setTool('select');
      if (selected && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 2 : 0.5;
        const c = selectedCallout;
        if (!c) return;
        let { x, y } = c;
        if (e.key === 'ArrowLeft') x -= step;
        if (e.key === 'ArrowRight') x += step;
        if (e.key === 'ArrowUp') y -= step;
        if (e.key === 'ArrowDown') y += step;
        api.updateCallout(selected.photoId, selected.calloutId, {
          x: Math.min(99.5, Math.max(0.5, x)),
          y: Math.min(99.5, Math.max(0.5, y)),
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editMode, selected, selectedCallout, api, setSelected, setTool]);

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

  // Bouton flottant toujours visible (admin)
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
      {/* Barre outils haut-gauche */}
      <div
        className="fixed z-[60] flex flex-col gap-2"
        style={{
          top: 'max(5.5rem, calc(env(safe-area-inset-top) + 4.5rem))',
          left: 'max(0.75rem, env(safe-area-inset-left))',
          maxWidth: 'min(340px, calc(100vw - 1.5rem))',
        }}
      >
        <div className="rounded-2xl border border-amber-400/40 bg-black/92 shadow-2xl backdrop-blur-xl">
          {/* Header */}
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
                title={collapsed ? 'Déplier' : 'Replier'}
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
                }}
                title="Fermer le mode édition"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {!collapsed && (
            <div className="space-y-3 p-3">
              {/* Outils */}
              <div className="flex flex-wrap gap-1.5">
                <ToolBtn
                  active={tool === 'select'}
                  onClick={() => setTool('select')}
                  icon={<MousePointer2 size={14} />}
                  label="Sélection (V)"
                />
                <ToolBtn
                  active={tool === 'add'}
                  onClick={() => setTool('add')}
                  icon={<Plus size={14} />}
                  label="Ajouter (A)"
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

              <p className="text-[10px] leading-relaxed text-white/40">
                {tool === 'add'
                  ? 'Cliquez sur une photo pour placer un nouveau repère.'
                  : 'Glissez le point · poignée ambre = longueur du trait · flèches = nudge'}
              </p>

              {/* Actions save */}
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
                  title="Annuler les changements non sauvés"
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
                  title="Revenir aux repères par défaut"
                >
                  <RotateCcw size={13} />
                </button>
              </div>

              {api.error && (
                <p className="rounded-lg bg-red-500/15 px-2 py-1.5 text-[11px] text-red-300">
                  {api.error}
                </p>
              )}

              {/* Liste des repères de la photo sélectionnée */}
              {selected && (
                <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                  <div className="mb-1.5 flex items-center gap-1 text-[10px] uppercase tracking-wider text-white/40">
                    <Move size={10} />
                    {PHOTO_LABELS[selected.photoId as PhotoId] || selected.photoId}
                  </div>
                  <div className="flex max-h-28 flex-col gap-0.5 overflow-y-auto">
                    {api.getCallouts(selected.photoId).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelected({ photoId: selected.photoId, calloutId: c.id })}
                        className={`rounded px-2 py-1 text-left text-[11px] transition ${
                          c.id === selected.calloutId
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

      {/* Inspecteur droit */}
      {panelOpen && selectedCallout && selected && (
        <div
          className="fixed z-[60] w-[min(320px,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border border-white/15 bg-black/92 shadow-2xl backdrop-blur-xl"
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
              onClick={() => setSelected(null)}
            >
              <X size={14} />
            </button>
          </div>

          <div className="space-y-4 p-3">
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

            <div className="grid grid-cols-2 gap-2">
              <Field label="Côté étiquette">
                <select
                  className="field-input"
                  value={selectedCallout.side}
                  onChange={(e) => patch({ side: e.target.value as CalloutSide })}
                >
                  <option value="left">Gauche</option>
                  <option value="right">Droite</option>
                </select>
              </Field>
              <Field label="Longueur trait %">
                <input
                  type="range"
                  min={4}
                  max={45}
                  step={0.5}
                  value={selectedCallout.stretch}
                  onChange={(e) => patch({ stretch: Number(e.target.value) })}
                  className="w-full accent-amber-400"
                />
                <div className="text-[10px] text-white/40">{selectedCallout.stretch.toFixed(1)}%</div>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Position X %">
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
              <Field label="Position Y %">
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

            <Field label="Décalage vertical label %">
              <input
                type="range"
                min={-20}
                max={20}
                step={0.5}
                value={selectedCallout.labelDy}
                onChange={(e) => patch({ labelDy: Number(e.target.value) })}
                className="w-full accent-amber-400"
              />
              <div className="text-[10px] text-white/40">{selectedCallout.labelDy.toFixed(1)}%</div>
            </Field>

            <div className="border-t border-white/10 pt-3">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                Design du fil
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

                <Field label="Style trait">
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

                <Field label="Style étiquette">
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

/** Helper pour brancher l’ajout depuis la page */
export function handleAddCallout(
  api: PageCalloutsApi,
  photoId: string,
  x: number,
  y: number,
  setSelected: (s: { photoId: string; calloutId: string } | null) => void,
  setTool: (t: EditorTool) => void,
) {
  const callout = createCallout({
    x,
    y,
    label: 'Nouveau repère',
    sub: '',
    side: x > 50 ? 'right' : 'left',
  });
  api.addCallout(photoId, callout);
  setSelected({ photoId, calloutId: callout.id });
  setTool('select');
  toast.success('Repère ajouté — éditez le texte à droite');
}

export default AdminCalloutEditor;
