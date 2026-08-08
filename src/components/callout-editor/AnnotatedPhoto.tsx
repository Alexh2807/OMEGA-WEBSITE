import React, { useEffect, useRef, useState } from 'react';
import {
  buildPathPoints,
  Callout,
  CalloutDesign,
  clamp,
  pathToSvgD,
} from './types';

type DragMode = 'point' | 'card' | null;

export type AnnotatedPhotoProps = {
  src: string;
  alt: string;
  photoId: string;
  callouts: Callout[];
  className?: string;
  imgClassName?: string;
  objectPosition?: string;
  editMode?: boolean;
  tool?: 'select' | 'add';
  selectedId?: string | null;
  onSelect?: (photoId: string, calloutId: string | null) => void;
  onChangeCallout?: (photoId: string, calloutId: string, patch: Partial<Callout>) => void;
  onAddAt?: (photoId: string, x: number, y: number) => void;
};

function lineColors(design: CalloutDesign): { main: string; outline: string | null } {
  if (design.lineColor === 'white') return { main: '#fff', outline: null };
  if (design.lineColor === 'black') return { main: '#000', outline: null };
  return { main: '#fff', outline: '#000' };
}

function labelClasses(style: CalloutDesign['labelStyle']): string {
  if (style === 'light') {
    return 'border border-black/20 bg-white/95 text-black shadow-sm';
  }
  if (style === 'minimal') {
    return 'border-0 bg-transparent text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]';
  }
  return 'border border-white/30 bg-black/90 text-white shadow-lg';
}

/**
 * Photo annotée — rendu public + édition :
 * - outil Ajouter → clic sur l’image pour poser le POINT
 * - glisser le POINT pour le déplacer
 * - glisser la CARD pour placer le texte (point B)
 * - 4 styles de fil (droit, horizontal, coude, 45°)
 */
export const AnnotatedPhoto: React.FC<AnnotatedPhotoProps> = ({
  src,
  alt,
  photoId,
  callouts,
  className = '',
  imgClassName = '',
  objectPosition = 'center center',
  editMode = false,
  tool = 'select',
  selectedId = null,
  onSelect,
  onChangeCallout,
  onAddAt,
}) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(editMode);
  const [aspect, setAspect] = useState(16 / 9);
  const dragRef = useRef<{
    id: string;
    mode: DragMode;
  } | null>(null);
  const didDragRef = useRef(false);

  useEffect(() => {
    if (editMode) {
      setActive(true);
      return;
    }
    const el = boxRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setActive(true);
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [editMode]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.height > 0) setAspect(r.width / r.height);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pctFromEvent = (clientX: number, clientY: number) => {
    const el = boxRef.current;
    if (!el) return { x: 50, y: 50 };
    const r = el.getBoundingClientRect();
    return {
      x: clamp(((clientX - r.left) / r.width) * 100, 0.5, 99.5),
      y: clamp(((clientY - r.top) / r.height) * 100, 0.5, 99.5),
    };
  };

  useEffect(() => {
    if (!editMode) return;

    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || !onChangeCallout) return;
      didDragRef.current = true;
      const { x, y } = pctFromEvent(e.clientX, e.clientY);
      if (d.mode === 'point') {
        onChangeCallout(photoId, d.id, { x, y });
      } else if (d.mode === 'card') {
        const c = callouts.find((k) => k.id === d.id);
        const side = c ? (x >= c.x ? 'right' : 'left') : x > 50 ? 'right' : 'left';
        onChangeCallout(photoId, d.id, { labelX: x, labelY: y, side });
      }
    };

    const onUp = () => {
      dragRef.current = null;
      // laisser le click handler lire didDrag puis reset
      requestAnimationFrame(() => {
        didDragRef.current = false;
      });
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, photoId, callouts, onChangeCallout]);

  const handleBgPointerDown = (e: React.PointerEvent) => {
    if (!editMode) return;
    // Ne pas traiter si on clique un élément interactif (point / card)
    if ((e.target as HTMLElement).closest('[data-callout-hit]')) return;

    if (tool === 'add' && onAddAt) {
      e.preventDefault();
      e.stopPropagation();
      const { x, y } = pctFromEvent(e.clientX, e.clientY);
      onAddAt(photoId, x, y);
      return;
    }
  };

  const handleBgClick = (e: React.MouseEvent) => {
    if (!editMode) return;
    if ((e.target as HTMLElement).closest('[data-callout-hit]')) return;
    if (tool === 'add') return; // déjà géré en pointerdown
    onSelect?.(photoId, null);
  };

  return (
    <div
      ref={boxRef}
      data-photo-id={photoId}
      className={`relative overflow-hidden rounded-2xl border bg-zinc-950 ${
        editMode
          ? tool === 'add'
            ? 'border-amber-400/80 ring-2 ring-amber-400/30 cursor-crosshair'
            : 'border-sky-400/60 ring-2 ring-sky-400/20'
          : 'border-white/10'
      } ${className}`}
      onPointerDown={handleBgPointerDown}
      onClick={handleBgClick}
    >
      <img
        src={src}
        alt={alt}
        className={`pointer-events-none block h-auto w-full select-none ${imgClassName}`}
        style={{ objectPosition }}
        loading="lazy"
        draggable={false}
      />

      {editMode && (
        <div className="pointer-events-none absolute left-2 top-2 z-30 rounded bg-black/75 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-white/85">
          {tool === 'add' ? (
            <span className="text-amber-300">① Cliquez l’endroit du point à montrer</span>
          ) : (
            <span>Point = cible · Card = glisser le texte</span>
          )}
        </div>
      )}

      {/* SVG des fils — viewBox 0–100 pour suivre le % de l’image */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        {callouts.map((c, i) => {
          const design = c.design;
          const { main, outline } = lineColors(design);
          const points = buildPathPoints(c, aspect);
          const d = pathToSvgD(points);
          const selected = editMode && selectedId === c.id;
          const sw = design.strokeWidth * 0.35; // viewBox % scale approx
          const dash =
            design.lineStyle === 'dashed' ? `${0.8 + sw} ${0.6 + sw * 0.5}` : undefined;

          return (
            <g
              key={`line-${c.id}`}
              style={{
                opacity: active || editMode ? 1 : 0,
                transition: editMode ? 'none' : `opacity 0.45s ease ${0.12 + i * 0.1}s`,
              }}
            >
              {outline && (
                <path
                  d={d}
                  fill="none"
                  stroke={outline}
                  strokeWidth={sw + 0.35}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={dash}
                  vectorEffect="non-scaling-stroke"
                  style={{ strokeWidth: design.strokeWidth + 1.5 }}
                />
              )}
              <path
                d={d}
                fill="none"
                stroke={main}
                strokeWidth={sw}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={dash}
                vectorEffect="non-scaling-stroke"
                style={{
                  strokeWidth: design.strokeWidth,
                  filter: selected ? 'drop-shadow(0 0 2px rgba(251,191,36,0.8))' : undefined,
                }}
              />
            </g>
          );
        })}
      </svg>

      {callouts.map((c, i) => {
        const design = c.design;
        const { main, outline } = lineColors(design);
        const selected = editMode && selectedId === c.id;
        // Attache carte : si label à droite du point, carte part vers la droite
        const cardOnRight = c.labelX >= c.x;

        return (
          <div
            key={c.id}
            className="absolute inset-0"
            style={{
              opacity: active || editMode ? 1 : 0,
              transition: editMode ? 'none' : `opacity 0.45s ease ${0.12 + i * 0.1}s`,
              zIndex: selected ? 20 : 10,
              pointerEvents: 'none',
            }}
          >
            {/* Point A — cible */}
            <button
              type="button"
              data-callout-hit="point"
              className={`absolute block rounded-full ${
                editMode
                  ? 'pointer-events-auto cursor-grab active:cursor-grabbing'
                  : 'pointer-events-none'
              } ${selected ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-black' : ''}`}
              style={{
                left: `${c.x}%`,
                top: `${c.y}%`,
                width: design.pointSize,
                height: design.pointSize,
                transform: 'translate(-50%, -50%)',
                background: main,
                boxShadow: outline
                  ? `0 0 0 1px ${outline}`
                  : '0 0 0 1px rgba(0,0,0,0.5)',
              }}
              aria-label={c.label}
              title={editMode ? 'Glisser le point cible' : c.label}
              onClick={(e) => {
                if (!editMode) return;
                e.stopPropagation();
                if (didDragRef.current) return;
                onSelect?.(photoId, c.id);
              }}
              onPointerDown={(e) => {
                if (!editMode || tool === 'add') return;
                e.stopPropagation();
                e.preventDefault();
                didDragRef.current = false;
                onSelect?.(photoId, c.id);
                dragRef.current = { id: c.id, mode: 'point' };
              }}
            />

            {/* Card B — texte, glissable librement */}
            <div
              data-callout-hit="card"
              className={`absolute max-w-[48%] whitespace-nowrap rounded px-2.5 py-1.5 ${labelClasses(
                design.labelStyle,
              )} ${
                editMode
                  ? `pointer-events-auto cursor-grab active:cursor-grabbing select-none ${
                      selected ? 'outline outline-2 outline-amber-400 shadow-[0_0_0_3px_rgba(251,191,36,0.25)]' : 'hover:outline hover:outline-1 hover:outline-white/40'
                    }`
                  : ''
              }`}
              style={{
                left: `${c.labelX}%`,
                top: `${c.labelY}%`,
                transform: cardOnRight
                  ? 'translate(6px, -50%)'
                  : 'translate(calc(-100% - 6px), -50%)',
                fontSize: 11,
              }}
              title={editMode ? 'Glisser la carte texte' : undefined}
              onClick={(e) => {
                if (!editMode) return;
                e.stopPropagation();
                if (didDragRef.current) return;
                onSelect?.(photoId, c.id);
              }}
              onPointerDown={(e) => {
                if (!editMode || tool === 'add') return;
                e.stopPropagation();
                e.preventDefault();
                didDragRef.current = false;
                onSelect?.(photoId, c.id);
                dragRef.current = { id: c.id, mode: 'card' };
              }}
            >
              {editMode && selected && (
                <div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-amber-400/90">
                  carte · glisser
                </div>
              )}
              <div
                className="font-semibold tracking-wide"
                style={{
                  color: design.labelStyle === 'light' ? '#000' : '#fff',
                  fontSize: 11,
                }}
              >
                {c.label || '…'}
              </div>
              {design.showSub && c.sub && (
                <div
                  className="mt-0.5 leading-snug"
                  style={{
                    fontSize: 10,
                    color:
                      design.labelStyle === 'light'
                        ? 'rgba(0,0,0,0.55)'
                        : 'rgba(255,255,255,0.5)',
                  }}
                >
                  {c.sub}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default AnnotatedPhoto;
