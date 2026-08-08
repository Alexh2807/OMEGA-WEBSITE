import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnnotatedPhoto, AnnotatedPhotoProps } from './AnnotatedPhoto';
import { ImageOrient, ImageTransform } from './types';

type Props = Omit<AnnotatedPhotoProps, 'className' | 'imageTransform' | 'orient'> & {
  transform: ImageTransform;
  className?: string;
  imgClassName?: string;
  imageSelected?: boolean;
  onSelectImage?: (photoId: string) => void;
  cover?: boolean;
  aspectClass?: string;
  framed?: boolean;
  /** Légende galerie — à l’intérieur de la carte (suit le tilt) */
  caption?: string;
  /** Masque dégradé + légende au survol (suit le tilt) */
  hoverCaption?: boolean;
  /** Clic hors édition (ex. ouvrir lightbox) — zone sur la carte */
  onActivate?: () => void;
};

/**
 * Cadre cliquable (tilt 3D sur l’élément entier).
 * Orient 0/90/180/270 = photo seule, centrée dans le cadre.
 * Overlays (légende, clic) sont DANS la carte → suivent le tilt.
 */
export const EditableImage: React.FC<Props> = ({
  transform,
  className = '',
  imgClassName,
  imageSelected = false,
  onSelectImage,
  cover = false,
  aspectClass,
  framed = true,
  editMode = false,
  photoId,
  caption,
  hoverCaption = false,
  onActivate,
  ...photoProps
}) => {
  const outerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [parallax, setParallax] = useState({ x: 0, y: 0 });
  const [natural, setNatural] = useState({ w: 0, h: 0 });

  const orient: ImageOrient = (transform.orient ?? 0) as ImageOrient;
  const swapped = orient === 90 || orient === 270;

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const measure = () => {
      const img = el.querySelector('[data-image-layer] img') as HTMLImageElement | null;
      if (img && img.naturalWidth > 0) {
        setNatural({ w: img.naturalWidth, h: img.naturalHeight });
        return;
      }
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (w > 2 && h > 2) setNatural({ w, h });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const img = el.querySelector('img');
    if (img) {
      if ((img as HTMLImageElement).complete) measure();
      else img.addEventListener('load', measure);
    }
    return () => {
      ro.disconnect();
      img?.removeEventListener('load', measure);
    };
  }, [photoProps.src, cover, orient]);

  useEffect(() => {
    if (
      transform.parallaxMode === 'none' ||
      (transform.parallaxX === 0 && transform.parallaxY === 0)
    ) {
      setParallax({ x: 0, y: 0 });
      return;
    }

    if (transform.parallaxMode === 'mouse') {
      const el = outerRef.current;
      if (!el) return;
      const onMove = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return;
        const nx = ((e.clientX - r.left) / r.width - 0.5) * 2;
        const ny = ((e.clientY - r.top) / r.height - 0.5) * 2;
        setParallax({
          x: nx * transform.parallaxX,
          y: ny * transform.parallaxY,
        });
      };
      const onLeave = () => setParallax({ x: 0, y: 0 });
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerleave', onLeave);
      return () => {
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerleave', onLeave);
      };
    }

    const onScroll = () => {
      const el = outerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const mid = r.top + r.height / 2 - window.innerHeight / 2;
      const t = Math.max(-1, Math.min(1, mid / (window.innerHeight * 0.6)));
      setParallax({
        x: -t * transform.parallaxX,
        y: t * transform.parallaxY,
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [transform.parallaxMode, transform.parallaxX, transform.parallaxY]);

  const liveX = editMode ? 0 : parallax.x;
  const liveY = editMode ? 0 : parallax.y;

  const tiltX = (transform.rotateX || 0) + liveY * 0.55;
  const tiltY = (transform.rotateY || 0) + liveX * 0.7;
  const tiltZ = transform.rotateZ || 0;
  const tx = liveX * 0.35;
  const ty = liveY * 0.35;

  const elementTransform = [
    `rotateX(${tiltX.toFixed(2)}deg)`,
    `rotateY(${tiltY.toFixed(2)}deg)`,
    `rotateZ(${tiltZ.toFixed(2)}deg)`,
    `translate3d(${tx.toFixed(2)}%, ${ty.toFixed(2)}%, 0)`,
    `scale(${transform.scale ?? 1})`,
  ].join(' ');

  const hasNatural = natural.w > 0 && natural.h > 0;
  const frameAspect =
    hasNatural && !cover
      ? swapped
        ? `${natural.h} / ${natural.w}`
        : `${natural.w} / ${natural.h}`
      : undefined;

  return (
    <div
      ref={outerRef}
      className={`relative ${aspectClass || ''} ${className}`}
      style={{
        perspective: `${transform.perspective || 900}px`,
        perspectiveOrigin: '50% 50%',
        overflow: 'visible',
        ...(frameAspect ? { aspectRatio: frameAspect } : {}),
      }}
      onClick={(e) => {
        if (!editMode || !onSelectImage) return;
        if ((e.target as HTMLElement).closest('[data-callout-hit]')) return;
        onSelectImage(photoId);
      }}
    >
      {/* Carte = élément d’édition : tilt ici. Overlays dedans. */}
      <div
        ref={cardRef}
        data-editable-card
        className={[
          'group/card relative h-full w-full overflow-hidden bg-zinc-950 transition-transform duration-300 ease-out will-change-transform',
          framed ? 'rounded-2xl border border-white/10 shadow-lg' : '',
          editMode && imageSelected
            ? 'ring-2 ring-amber-400/90 ring-offset-2 ring-offset-black'
            : editMode
              ? 'ring-1 ring-white/25 hover:ring-sky-400/50'
              : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{
          transform: elementTransform,
          transformOrigin: 'center center',
          transformStyle: 'preserve-3d',
        }}
      >
        <AnnotatedPhoto
          {...photoProps}
          photoId={photoId}
          editMode={editMode}
          orient={orient}
          imageScale={transform.imageScale ?? 1}
          imageOffsetX={transform.imageOffsetX ?? 0}
          imageOffsetY={transform.imageOffsetY ?? 0}
          coverFill={cover || swapped}
          className="h-full w-full !rounded-none !border-0 !bg-transparent"
          imgClassName={imgClassName}
          objectPosition={transform.objectPosition || 'center center'}
        />

        {/* Overlay clic + légende — DANS la carte → suit le tilt */}
        {!editMode && onActivate && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onActivate();
            }}
            className="absolute inset-0 z-10 cursor-zoom-in"
            aria-label={caption ? `Agrandir : ${caption}` : 'Agrandir'}
          />
        )}
        {hoverCaption && caption && (
          <span
            className={[
              'pointer-events-none absolute inset-x-0 bottom-0 z-20',
              'bg-gradient-to-t from-black/85 via-black/40 to-transparent',
              'px-3 pb-2.5 pt-10 text-[11px] text-white/85 sm:text-xs',
              'opacity-0 transition-opacity duration-300',
              'group-hover/card:opacity-100',
            ].join(' ')}
          >
            {caption}
          </span>
        )}

        {editMode && (
          <div className="pointer-events-none absolute right-2 top-2 z-30 rounded bg-black/80 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-white/80">
            {imageSelected
              ? `élément · tilt carte · photo ${orient}°`
              : 'cliquer'}
          </div>
        )}
      </div>
    </div>
  );
};

export default EditableImage;
