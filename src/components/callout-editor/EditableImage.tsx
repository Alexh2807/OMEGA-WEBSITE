import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnnotatedPhoto, AnnotatedPhotoProps } from './AnnotatedPhoto';
import { ImageOrient, ImageTransform } from './types';

type Props = Omit<AnnotatedPhotoProps, 'className' | 'imageTransform'> & {
  transform: ImageTransform;
  className?: string;
  imgClassName?: string;
  imageSelected?: boolean;
  onSelectImage?: (photoId: string) => void;
  cover?: boolean;
  aspectClass?: string;
  /** Cadre arrondi (fixe) — la rotation s’applique uniquement à l’image */
  framed?: boolean;
};

/**
 * Cadre fixe (coins arrondis + callouts).
 * Orient / tilt / parallax → UNIQUEMENT sur la photo, pas sur les traits ni textes.
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
      const img = el.querySelector('img');
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
      if (img.complete) measure();
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

  const rotX = (transform.rotateX || 0) + liveY * 0.55;
  const rotY = (transform.rotateY || 0) + liveX * 0.7;
  const rotZ = orient + (transform.rotateZ || 0);
  const tx = liveX * 0.35;
  const ty = liveY * 0.35;

  /** Transform IMAGE ONLY */
  const imageOnlyTransform = [
    `rotateX(${rotX.toFixed(2)}deg)`,
    `rotateY(${rotY.toFixed(2)}deg)`,
    `rotateZ(${rotZ.toFixed(2)}deg)`,
    `translate3d(${tx.toFixed(2)}%, ${ty.toFixed(2)}%, 0)`,
    `scale(${transform.scale ?? 1})`,
  ].join(' ');

  const hasNatural = natural.w > 0 && natural.h > 0;
  // À 90°/270° le cadre change de ratio pour accueillir la photo redressée,
  // mais le cadre lui-même ne tourne pas (callouts restent droits).
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
      {/*
        CADRE FIXE (coins arrondis) — ne tourne PAS.
        Callouts dessus restent horizontaux / lisibles.
      */}
      <div
        ref={cardRef}
        data-editable-card
        className={[
          'relative h-full w-full overflow-hidden bg-zinc-950',
          framed ? 'rounded-2xl border border-white/10 shadow-lg' : '',
          editMode && imageSelected
            ? 'ring-2 ring-amber-400/90 ring-offset-2 ring-offset-black'
            : editMode
              ? 'ring-1 ring-white/25 hover:ring-sky-400/50'
              : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <AnnotatedPhoto
          {...photoProps}
          photoId={photoId}
          editMode={editMode}
          imageTransform={imageOnlyTransform}
          className="h-full w-full !rounded-none !border-0 !bg-transparent"
          imgClassName={
            cover
              ? `h-full w-full object-cover ${imgClassName || ''}`
              : // À 90/270 l’img remplit mieux le cadre swappé
                swapped
                ? `h-full w-full object-cover ${imgClassName || ''}`
                : `h-full w-full object-contain ${imgClassName || ''}`
          }
          objectPosition={transform.objectPosition || 'center center'}
        />

        {editMode && (
          <div className="pointer-events-none absolute right-2 top-2 z-30 rounded bg-black/80 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-white/80">
            {imageSelected ? `image seule · ${orient}°` : 'cliquer'}
          </div>
        )}
      </div>
    </div>
  );
};

export default EditableImage;
