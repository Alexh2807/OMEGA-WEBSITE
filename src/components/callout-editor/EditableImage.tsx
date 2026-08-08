import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnnotatedPhoto, AnnotatedPhotoProps } from './AnnotatedPhoto';
import { ImageOrient, ImageTransform } from './types';

type Props = Omit<AnnotatedPhotoProps, 'className'> & {
  transform: ImageTransform;
  className?: string;
  imgClassName?: string;
  imageSelected?: boolean;
  onSelectImage?: (photoId: string) => void;
  cover?: boolean;
  aspectClass?: string;
  /**
   * true = ce composant EST le cadre arrondi transformé
   * (ne pas envelopper d’un autre rounded + overflow outside)
   */
  framed?: boolean;
};

/**
 * Cadre arrondi = bloc transformé (image + callouts solidaires).
 * orient 0/90/180/270 + tilt X/Y/Z s’appliquent sur CE conteneur, pas sur <img>.
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

  /** Transform sur la CARTE (cadre arrondi), jamais sur <img> seule */
  const cardTransform = [
    `rotateX(${rotX.toFixed(2)}deg)`,
    `rotateY(${rotY.toFixed(2)}deg)`,
    `rotateZ(${rotZ.toFixed(2)}deg)`,
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
      <div className="flex h-full w-full items-center justify-center" style={{ transformStyle: 'preserve-3d' }}>
        {/*
          ★ CARTE = conteneur arrondi TRANSFORMÉ
          Tout ce qui est dedans (photo, fils, labels) tourne avec.
        */}
        <div
          ref={cardRef}
          data-editable-card
          className={[
            'relative overflow-hidden bg-zinc-950 transition-transform duration-300 ease-out will-change-transform',
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
            transform: cardTransform,
            transformOrigin: 'center center',
            transformStyle: 'preserve-3d',
            ...(swapped && hasNatural && !cover
              ? {
                  height: '100%',
                  width: 'auto',
                  aspectRatio: `${natural.w} / ${natural.h}`,
                }
              : {
                  width: '100%',
                  height: cover ? '100%' : 'auto',
                }),
          }}
        >
          <AnnotatedPhoto
            {...photoProps}
            photoId={photoId}
            editMode={editMode}
            className="h-full w-full !rounded-none !border-0 !bg-transparent"
            imgClassName={
              cover
                ? `h-full w-full object-cover ${imgClassName || ''}`
                : `h-full w-full object-contain ${imgClassName || ''}`
            }
            objectPosition={transform.objectPosition || 'center center'}
          />

          {editMode && (
            <div className="pointer-events-none absolute right-2 top-2 z-30 rounded bg-black/80 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-white/80">
              {imageSelected ? `carte · ${orient}°` : 'cliquer'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EditableImage;
