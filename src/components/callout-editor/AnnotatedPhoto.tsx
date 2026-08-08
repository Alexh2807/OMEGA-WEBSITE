import React, { useEffect, useRef, useState } from 'react';
import { Callout, CalloutDesign, clamp } from './types';

type DragMode = 'point' | 'stretch' | null;

export type AnnotatedPhotoProps = {
  src: string;
  alt: string;
  photoId: string;
  callouts: Callout[];
  className?: string;
  /** Mode édition admin */
  editMode?: boolean;
  /** Outil actif : select ou add */
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
 * Photo annotée — rendu public + interaction complète en mode édition.
 */
export const AnnotatedPhoto: React.FC<AnnotatedPhotoProps> = ({
  src,
  alt,
  photoId,
  callouts,
  className = '',
  editMode = false,
  tool = 'select',
  selectedId = null,
  onSelect,
  onChangeCallout,
  onAddAt,
}) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(editMode);
  const dragRef = useRef<{
    id: string;
    mode: DragMode;
    startStretch: number;
    startPointerX: number;
    side: 'left' | 'right';
    boxWidth: number;
  } | null>(null);

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
      if (d.mode === 'point') {
        const { x, y } = pctFromEvent(e.clientX, e.clientY);
        onChangeCallout(photoId, d.id, { x, y });
      } else if (d.mode === 'stretch') {
        const dxPct = ((e.clientX - d.startPointerX) / Math.max(d.boxWidth, 1)) * 100;
        const stretch = clamp(
          d.startStretch + (d.side === 'right' ? dxPct : -dxPct),
          4,
          45,
        );
        onChangeCallout(photoId, d.id, { stretch });
      }
    };

    const onUp = () => {
      dragRef.current = null;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, photoId, callouts, onChangeCallout]);

  const handleBgClick = (e: React.MouseEvent) => {
    if (!editMode) return;
    if (tool === 'add' && onAddAt) {
      const { x, y } = pctFromEvent(e.clientX, e.clientY);
      onAddAt(photoId, x, y);
      return;
    }
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
      onClick={handleBgClick}
    >
      <img
        src={src}
        alt={alt}
        className="pointer-events-none block w-full h-auto select-none"
        loading="lazy"
        draggable={false}
      />

      {editMode && (
        <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/80">
          {tool === 'add' ? 'Clic pour ajouter' : 'Glisser les points'}
        </div>
      )}

      {callouts.map((c, i) => {
        const stretch = c.stretch ?? 16;
        const labelDy = c.labelDy ?? 0;
        const isRight = c.side === 'right';
        const lineW = stretch;
        const lineLeft = isRight ? c.x : c.x - lineW;
        const labelX = isRight ? c.x + lineW : c.x - lineW;
        const labelY = c.y + labelDy;
        const design = c.design;
        const { main, outline } = lineColors(design);
        const selected = editMode && selectedId === c.id;

        return (
          <div
            key={c.id}
            className={`absolute inset-0 ${editMode ? 'pointer-events-none' : 'pointer-events-none'}`}
            style={{
              opacity: active || editMode ? 1 : 0,
              transition: editMode ? 'none' : `opacity 0.45s ease ${0.12 + i * 0.1}s`,
              zIndex: selected ? 20 : 10,
            }}
          >
            {/* Trait horizontal */}
            <span
              className="absolute block"
              style={{
                left: `${lineLeft}%`,
                top: `${c.y}%`,
                width: `${lineW}%`,
                height: design.strokeWidth,
                transform: 'translateY(-50%)',
                background: main,
                boxShadow: outline ? `0 0 0 1px ${outline}` : undefined,
                backgroundImage:
                  design.lineStyle === 'dashed'
                    ? `repeating-linear-gradient(90deg, ${main} 0, ${main} ${design.strokeWidth * 3}px, transparent ${design.strokeWidth * 3}px, transparent ${design.strokeWidth * 5}px)`
                    : undefined,
                backgroundColor: design.lineStyle === 'dashed' ? 'transparent' : main,
                borderTop:
                  design.lineStyle === 'dashed' && outline
                    ? undefined
                    : undefined,
                opacity: design.lineStyle === 'dashed' ? 1 : 1,
              }}
              aria-hidden
            />
            {Math.abs(labelDy) > 1 && (
              <span
                className="absolute block"
                style={{
                  left: isRight ? `${c.x + lineW}%` : `${c.x - lineW}%`,
                  top: `${Math.min(c.y, labelY)}%`,
                  height: `${Math.abs(labelDy)}%`,
                  width: design.strokeWidth,
                  transform: 'translateX(-50%)',
                  background: main,
                  boxShadow: outline ? `0 0 0 1px ${outline}` : undefined,
                }}
                aria-hidden
              />
            )}

            {/* Point */}
            <button
              type="button"
              className={`absolute block rounded-full ${
                editMode ? 'pointer-events-auto cursor-grab active:cursor-grabbing' : 'pointer-events-none'
              } ${selected ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-black' : ''}`}
              style={{
                left: `${c.x}%`,
                top: `${c.y}%`,
                width: design.pointSize,
                height: design.pointSize,
                transform: 'translate(-50%, -50%)',
                background: main,
                boxShadow: outline ? `0 0 0 1px ${outline}` : `0 0 0 1px rgba(0,0,0,0.5)`,
              }}
              aria-label={c.label}
              onClick={(e) => {
                if (!editMode) return;
                e.stopPropagation();
                onSelect?.(photoId, c.id);
              }}
              onPointerDown={(e) => {
                if (!editMode || tool === 'add') return;
                e.stopPropagation();
                e.preventDefault();
                onSelect?.(photoId, c.id);
                const boxW = boxRef.current?.getBoundingClientRect().width ?? 1;
                dragRef.current = {
                  id: c.id,
                  mode: 'point',
                  startStretch: stretch,
                  startPointerX: e.clientX,
                  side: c.side,
                  boxWidth: boxW,
                };
                (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
              }}
            />

            {/* Poignée stretch (édition) */}
            {editMode && selected && (
              <button
                type="button"
                className="pointer-events-auto absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-sm border border-amber-400 bg-amber-300"
                style={{
                  left: `${labelX}%`,
                  top: `${c.y}%`,
                }}
                title="Allonger / raccourcir le trait"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  const boxW = boxRef.current?.getBoundingClientRect().width ?? 1;
                  dragRef.current = {
                    id: c.id,
                    mode: 'stretch',
                    startStretch: stretch,
                    startPointerX: e.clientX,
                    side: c.side,
                    boxWidth: boxW,
                  };
                }}
              />
            )}

            {/* Étiquette */}
            <div
              className={`absolute max-w-[46%] whitespace-nowrap rounded px-2.5 py-1 ${labelClasses(
                design.labelStyle,
              )} ${
                editMode
                  ? `pointer-events-auto cursor-pointer ${selected ? 'outline outline-2 outline-amber-400' : ''}`
                  : ''
              }`}
              style={{
                left: `${labelX}%`,
                top: `${labelY}%`,
                transform: isRight
                  ? 'translate(8px, -50%)'
                  : 'translate(calc(-100% - 8px), -50%)',
                fontSize: 11,
              }}
              onClick={(e) => {
                if (!editMode) return;
                e.stopPropagation();
                onSelect?.(photoId, c.id);
              }}
            >
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
                    color: design.labelStyle === 'light' ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.5)',
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
