import React, { useEffect, useRef, useState } from 'react';
import { AnnotatedPhoto, AnnotatedPhotoProps } from './AnnotatedPhoto';
import { ImageTransform } from './types';

type Props = Omit<AnnotatedPhotoProps, 'className'> & {
  transform: ImageTransform;
  className?: string;
  imgClassName?: string;
  /** Sélection de l’image entière (transforms) */
  imageSelected?: boolean;
  onSelectImage?: (photoId: string) => void;
  /** Mode cover (hero/gallery) vs contain (photos produit) */
  cover?: boolean;
  aspectClass?: string;
};

/**
 * Image éditable : callouts + rotation 3D + parallax (scroll / souris).
 * Toute image de la page peut être enveloppée ici.
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
  const wrapRef = useRef<HTMLDivElement>(null);
  const [parallax, setParallax] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (transform.parallaxMode === 'none' || (transform.parallaxX === 0 && transform.parallaxY === 0)) {
      setParallax({ x: 0, y: 0 });
      return;
    }

    if (transform.parallaxMode === 'mouse') {
      const el = wrapRef.current;
      if (!el) return;
      const onMove = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return;
        const nx = ((e.clientX - r.left) / r.width - 0.5) * 2; // -1..1
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

    // scroll
    const onScroll = () => {
      const el = wrapRef.current;
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

  // En édition : le parallax scroll/souris peut gêner → on garde le tilt de base
  const liveX = editMode ? 0 : parallax.x;
  const liveY = editMode ? 0 : parallax.y;

  // Rotation 3D : base + contribution parallax (effet carte)
  const rotX = transform.rotateX + liveY * 0.55;
  const rotY = transform.rotateY + liveX * 0.7;
  const rotZ = transform.rotateZ;
  const tx = liveX * 0.35;
  const ty = liveY * 0.35;

  const transformCss = [
    `rotateX(${rotX.toFixed(2)}deg)`,
    `rotateY(${rotY.toFixed(2)}deg)`,
    `rotateZ(${rotZ.toFixed(2)}deg)`,
    `translate3d(${tx.toFixed(2)}%, ${ty.toFixed(2)}%, 0)`,
    `scale(${transform.scale})`,
  ].join(' ');

  return (
    <div
      ref={wrapRef}
      className={`relative ${aspectClass || ''} ${className}`}
      style={{
        perspective: `${transform.perspective}px`,
        perspectiveOrigin: '50% 50%',
      }}
      onClick={(e) => {
        if (!editMode || !onSelectImage) return;
        // Ne pas voler les clics callout
        if ((e.target as HTMLElement).closest('[data-callout-hit]')) return;
        onSelectImage(photoId);
      }}
    >
      <div
        className={`relative h-full w-full transition-transform duration-200 ease-out will-change-transform ${
          editMode && imageSelected
            ? 'ring-2 ring-amber-400/80 ring-offset-2 ring-offset-black'
            : editMode
              ? 'ring-1 ring-white/20 hover:ring-sky-400/50'
              : ''
        }`}
        style={{
          transform: transformCss,
          transformStyle: 'preserve-3d',
        }}
      >
        <AnnotatedPhoto
          {...photoProps}
          photoId={photoId}
          editMode={editMode}
          className={cover ? 'h-full w-full !rounded-none border-0' : undefined}
          imgClassName={
            cover
              ? `h-full w-full object-cover ${imgClassName || ''}`
              : imgClassName
          }
          objectPosition={transform.objectPosition}
        />

        {editMode && (
          <div className="pointer-events-none absolute right-2 top-2 z-30 rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-white/70">
            {imageSelected ? 'image active' : 'cliquer pour 3D'}
          </div>
        )}
      </div>
    </div>
  );
};

export default EditableImage;
