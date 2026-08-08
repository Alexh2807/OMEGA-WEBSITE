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
};

/**
 * Conteneur éditable.
 * Orient 0/90/180/270 + tilt 3D X/Y/Z s’appliquent au BLOC ENTIER
 * (image + callouts + bordures), jamais à la balise <img> seule.
 */
export const EditableImage: React.FC<Props> = ({
  transform,
  className = '',
  imgClassName,
  imageSelected = false,
  onSelectImage,
  cover = false,
  aspectClass,
  editMode = false,
  photoId,
  ...photoProps
}) => {
  const outerRef = useRef<HTMLDivElement>(null);
  const blockRef = useRef<HTMLDivElement>(null);
  const [parallax, setParallax] = useState({ x: 0, y: 0 });
  const [natural, setNatural] = useState({ w: 0, h: 0 });

  const orient: ImageOrient = transform.orient ?? 0;
  const swapped = orient === 90 || orient === 270;

  useLayoutEffect(() => {
    const el = blockRef.current;
    if (!el) return;
    const measure = () => {
      // Mesure le contenu dans son orientation “native” (avant de s’appuyer sur le cadre swappé)
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
  }, [photoProps.src, cover]);

  useEffect(() => {
    if (transform.parallaxMode === 'none' || (transform.parallaxX === 0 && transform.parallaxY === 0)) {
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

  const rotX = transform.rotateX + liveY * 0.55;
  const rotY = transform.rotateY + liveX * 0.7;
  const rotZ = orient + (transform.rotateZ || 0);
  const tx = liveX * 0.35;
  const ty = liveY * 0.35;

  // Transform unique sur le CONTENEUR (pas sur <img>)
  const blockTransform = [
    `rotateX(${rotX.toFixed(2)}deg)`,
    `rotateY(${rotY.toFixed(2)}deg)`,
    `rotateZ(${rotZ.toFixed(2)}deg)`,
    `translate3d(${tx.toFixed(2)}%, ${ty.toFixed(2)}%, 0)`,
    `scale(${transform.scale})`,
  ].join(' ');

  const hasNatural = natural.w > 0 && natural.h > 0;

  // Cadre layout : ratio swappé à 90°/270° pour que le conteneur occupe le bon espace
  const frameAspect =
    hasNatural && !cover
      ? swapped
        ? `${natural.h} / ${natural.w}` // portrait si source paysage
        : `${natural.w} / ${natural.h}`
      : undefined;

  return (
    <div
      ref={outerRef}
      className={`relative ${aspectClass || ''} ${className}`}
      style={{
        perspective: `${transform.perspective}px`,
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
      <div
        className={`flex h-full w-full items-center justify-center ${
          editMode && imageSelected
            ? 'ring-2 ring-amber-400/80 ring-offset-2 ring-offset-black'
            : editMode
              ? 'ring-1 ring-white/20 hover:ring-sky-400/50'
              : ''
        }`}
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/*
          BLOC ENTIER transformé — image + SVG callouts + labels dedans.
          À 90°/270° : hauteur 100% du cadre, largeur auto selon ratio source,
          puis rotation du bloc (pas de l’img).
        */}
        <div
          ref={blockRef}
          data-editable-block
          className="relative transition-transform duration-300 ease-out will-change-transform"
          style={{
            transform: blockTransform,
            transformOrigin: 'center center',
            transformStyle: 'preserve-3d',
            ...(swapped && hasNatural && !cover
              ? {
                  height: '100%',
                  width: 'auto',
                  aspectRatio: `${natural.w} / ${natural.h}`,
                  maxWidth: 'none',
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
            className={
              cover
                ? 'h-full w-full !rounded-none border-0'
                : 'h-full w-full border-0'
            }
            imgClassName={
              cover
                ? `h-full w-full object-cover ${imgClassName || ''}`
                : `h-full w-full object-contain ${imgClassName || ''}`
            }
            objectPosition={transform.objectPosition}
          />
        </div>
      </div>

      {editMode && (
        <div className="pointer-events-none absolute right-2 top-2 z-30 rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-white/70">
          {imageSelected ? `conteneur entier · ${orient}°` : 'cliquer pour 3D'}
        </div>
      )}
    </div>
  );
};

export default EditableImage;
