/** Callouts annotés sur photos produit — types + defaults + stockage */

export type CalloutLineColor = 'white' | 'black' | 'bw';
export type CalloutLineStyle = 'solid' | 'dashed';
export type CalloutLabelStyle = 'dark' | 'light' | 'minimal';
export type CalloutSide = 'left' | 'right';

/**
 * Forme du fil entre le point (cible) et la carte (texte) :
 * - straight  : ligne directe A → B
 * - horizontal: horizontal depuis A, puis vertical vers B (style actuel)
 * - elbow     : coude orthogonal (H puis V ou V puis H selon la distance)
 * - diag45    : départ à 45°, puis trait 0° ou 90° pour finir sur B
 */
export type CalloutPathStyle = 'straight' | 'horizontal' | 'elbow' | 'diag45';

export type CalloutDesign = {
  lineColor: CalloutLineColor;
  strokeWidth: number;
  lineStyle: CalloutLineStyle;
  pointSize: number;
  labelStyle: CalloutLabelStyle;
  showSub: boolean;
  /** Style du parcours du fil */
  pathStyle: CalloutPathStyle;
};

export type Callout = {
  id: string;
  /** Point A — centre de l’élément à montrer (0–100 %) */
  x: number;
  y: number;
  /** Point B — ancre de la carte texte (0–100 %) */
  labelX: number;
  labelY: number;
  label: string;
  sub?: string;
  /**
   * Côté d’attache de la carte par rapport au fil
   * (déduit souvent de labelX vs x, mais forçable)
   */
  side: CalloutSide;
  design: CalloutDesign;

  /** @deprecated legacy — migré vers labelX/labelY */
  stretch?: number;
  /** @deprecated legacy */
  labelDy?: number;
};

/** Transform 3D + parallax par image */
export type ParallaxMode = 'none' | 'scroll' | 'mouse';

export type ImageTransform = {
  /** Rotation plane (°) */
  rotateZ: number;
  /** Inclinaison 3D haut/bas (°) */
  rotateX: number;
  /** Inclinaison 3D gauche/droite (°) — effet “carte 3D” */
  rotateY: number;
  /** Perspective CSS (px) */
  perspective: number;
  /** Échelle 0.5–1.5 */
  scale: number;
  /** Amplitude parallax horizontal (% translate / tilt) */
  parallaxX: number;
  /** Amplitude parallax vertical */
  parallaxY: number;
  parallaxMode: ParallaxMode;
  /** object-position CSS ex. "center 40%" */
  objectPosition: string;
};

export const DEFAULT_TRANSFORM: ImageTransform = {
  rotateZ: 0,
  rotateX: 0,
  rotateY: 0,
  perspective: 900,
  scale: 1,
  parallaxX: 0,
  parallaxY: 0,
  parallaxMode: 'none',
  objectPosition: 'center center',
};

/** Entrée de la galerie produit (éditable admin) */
export type GalleryItem = {
  id: string;
  src: string;
  cap: string;
};

export type PageCalloutsConfig = {
  version: 1 | 2 | 3;
  pageId: string;
  /** Callouts par photoId (toute image de la page) */
  photos: Record<string, Callout[]>;
  /** Transforms 3D / parallax par photoId */
  transforms?: Record<string, ImageTransform>;
  /** Galerie photos (ordre = affichage) */
  gallery?: GalleryItem[];
  updatedAt?: string;
};

export const DEFAULT_DESIGN: CalloutDesign = {
  lineColor: 'bw',
  strokeWidth: 2,
  lineStyle: 'solid',
  pointSize: 8,
  labelStyle: 'dark',
  showSub: true,
  pathStyle: 'horizontal',
};

export const CALLOUTS_SETTINGS_KEY = 'page_callouts_omega_dmx_interface';
export const PAGE_ID = 'omega-dmx-interface';

export function newCalloutId(): string {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Calcule labelX/labelY depuis l’ancien modèle stretch/side/labelDy */
export function legacyToLabelPos(
  x: number,
  y: number,
  side: CalloutSide,
  stretch = 16,
  labelDy = 0,
): { labelX: number; labelY: number } {
  const labelX = side === 'right' ? clamp(x + stretch, 0.5, 99.5) : clamp(x - stretch, 0.5, 99.5);
  const labelY = clamp(y + labelDy, 0.5, 99.5);
  return { labelX, labelY };
}

export function createCallout(
  partial: Partial<Callout> & { x: number; y: number },
): Callout {
  const x = clamp(partial.x, 0, 100);
  const y = clamp(partial.y, 0, 100);
  const side: CalloutSide =
    partial.side ??
    (typeof partial.labelX === 'number'
      ? partial.labelX >= x
        ? 'right'
        : 'left'
      : x > 50
        ? 'right'
        : 'left');

  let labelX = partial.labelX;
  let labelY = partial.labelY;

  if (typeof labelX !== 'number' || typeof labelY !== 'number') {
    const legacy = legacyToLabelPos(
      x,
      y,
      side,
      typeof partial.stretch === 'number' ? partial.stretch : 16,
      typeof partial.labelDy === 'number' ? partial.labelDy : 0,
    );
    labelX = legacy.labelX;
    labelY = legacy.labelY;
  }

  return {
    id: partial.id || newCalloutId(),
    x,
    y,
    labelX: clamp(labelX, 0.5, 99.5),
    labelY: clamp(labelY, 0.5, 99.5),
    label: partial.label ?? 'Nouveau repère',
    sub: partial.sub ?? '',
    side,
    design: { ...DEFAULT_DESIGN, ...partial.design },
  };
}

/**
 * Points du chemin A → … → B selon pathStyle (coords en %).
 * @param aspect ratio largeur/hauteur de l’image (pour un vrai 45° visuel)
 */
export function buildPathPoints(
  c: Pick<Callout, 'x' | 'y' | 'labelX' | 'labelY' | 'design'>,
  aspect = 16 / 9,
): { x: number; y: number }[] {
  const A = { x: c.x, y: c.y };
  const B = { x: c.labelX, y: c.labelY };
  const style = c.design?.pathStyle ?? 'horizontal';
  const dx = B.x - A.x;
  const dy = B.y - A.y;

  if (style === 'straight') {
    return [A, B];
  }

  if (style === 'horizontal') {
    if (Math.abs(dy) < 0.15) return [A, B];
    return [A, { x: B.x, y: A.y }, B];
  }

  if (style === 'elbow') {
    if (Math.abs(dx) < 0.15 || Math.abs(dy) < 0.15) return [A, B];
    // En pixels, l’axe le plus long décide H-then-V vs V-then-H
    const dxPx = Math.abs(dx) * aspect;
    const dyPx = Math.abs(dy);
    if (dxPx >= dyPx) {
      return [A, { x: B.x, y: A.y }, B];
    }
    return [A, { x: A.x, y: B.y }, B];
  }

  // diag45 : 45° visuel puis horizontal (0°) ou vertical (90°)
  if (Math.abs(dx) < 0.15 || Math.abs(dy) < 0.15) return [A, B];
  const sx = dx >= 0 ? 1 : -1;
  const sy = dy >= 0 ? 1 : -1;
  // En espace « pixel normalisé » : X' = x * aspect, Y' = y
  // 45° ⇒ |ΔX'| = |ΔY'| ⇒ |dx| * aspect = |dy_step|
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  // Distance max en X% pour rester sur 45° sans dépasser B
  // mid: dx45 * aspect = dy45  ⇒ dy45 = dx45 * aspect
  // bornes : dx45 ≤ adx, dy45 ≤ ady ⇒ dx45 ≤ ady/aspect
  const dx45 = Math.min(adx, ady / Math.max(aspect, 0.01));
  const dy45 = dx45 * aspect;
  const mid = { x: A.x + sx * dx45, y: A.y + sy * dy45 };
  if (Math.abs(mid.x - B.x) < 0.2 && Math.abs(mid.y - B.y) < 0.2) {
    return [A, B];
  }
  return [A, mid, B];
}

export function pathToSvgD(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ');
}

export function normalizeCallout(raw: unknown): Callout | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.x !== 'number' || typeof r.y !== 'number') return null;

  const designRaw = (r.design && typeof r.design === 'object' ? r.design : {}) as Partial<CalloutDesign>;

  const pathStyle: CalloutPathStyle =
    designRaw.pathStyle === 'straight' ||
    designRaw.pathStyle === 'elbow' ||
    designRaw.pathStyle === 'diag45' ||
    designRaw.pathStyle === 'horizontal'
      ? designRaw.pathStyle
      : DEFAULT_DESIGN.pathStyle;

  const side: CalloutSide = r.side === 'right' ? 'right' : 'left';
  const x = r.x;
  const y = r.y;

  let labelX: number | undefined = typeof r.labelX === 'number' ? r.labelX : undefined;
  let labelY: number | undefined = typeof r.labelY === 'number' ? r.labelY : undefined;

  // Migration legacy stretch / labelDy
  if (labelX === undefined || labelY === undefined) {
    const legacy = legacyToLabelPos(
      x,
      y,
      side,
      typeof r.stretch === 'number' ? r.stretch : 16,
      typeof r.labelDy === 'number' ? r.labelDy : 0,
    );
    labelX = legacy.labelX;
    labelY = legacy.labelY;
  }

  return createCallout({
    id: typeof r.id === 'string' ? r.id : undefined,
    x,
    y,
    labelX,
    labelY,
    label: typeof r.label === 'string' ? r.label : 'Repère',
    sub: typeof r.sub === 'string' ? r.sub : '',
    side: labelX >= x ? 'right' : 'left',
    design: {
      lineColor:
        designRaw.lineColor === 'white' ||
        designRaw.lineColor === 'black' ||
        designRaw.lineColor === 'bw'
          ? designRaw.lineColor
          : DEFAULT_DESIGN.lineColor,
      strokeWidth:
        typeof designRaw.strokeWidth === 'number'
          ? clamp(designRaw.strokeWidth, 1, 6)
          : DEFAULT_DESIGN.strokeWidth,
      lineStyle: designRaw.lineStyle === 'dashed' ? 'dashed' : 'solid',
      pointSize:
        typeof designRaw.pointSize === 'number'
          ? clamp(designRaw.pointSize, 4, 20)
          : DEFAULT_DESIGN.pointSize,
      labelStyle:
        designRaw.labelStyle === 'light' || designRaw.labelStyle === 'minimal'
          ? designRaw.labelStyle
          : 'dark',
      showSub: designRaw.showSub !== false,
      pathStyle,
    },
  });
}

export function normalizeTransform(raw: unknown): ImageTransform {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_TRANSFORM };
  const t = raw as Record<string, unknown>;
  const mode =
    t.parallaxMode === 'scroll' || t.parallaxMode === 'mouse' || t.parallaxMode === 'none'
      ? t.parallaxMode
      : DEFAULT_TRANSFORM.parallaxMode;
  return {
    rotateZ: typeof t.rotateZ === 'number' ? clamp(t.rotateZ, -180, 180) : 0,
    rotateX: typeof t.rotateX === 'number' ? clamp(t.rotateX, -60, 60) : 0,
    rotateY: typeof t.rotateY === 'number' ? clamp(t.rotateY, -60, 60) : 0,
    perspective:
      typeof t.perspective === 'number' ? clamp(t.perspective, 200, 2000) : DEFAULT_TRANSFORM.perspective,
    scale: typeof t.scale === 'number' ? clamp(t.scale, 0.5, 1.6) : 1,
    parallaxX: typeof t.parallaxX === 'number' ? clamp(t.parallaxX, 0, 30) : 0,
    parallaxY: typeof t.parallaxY === 'number' ? clamp(t.parallaxY, 0, 30) : 0,
    parallaxMode: mode,
    objectPosition:
      typeof t.objectPosition === 'string' && t.objectPosition.trim()
        ? t.objectPosition
        : DEFAULT_TRANSFORM.objectPosition,
  };
}

export function normalizeConfig(raw: unknown, defaults: PageCalloutsConfig): PageCalloutsConfig {
  if (!raw || typeof raw !== 'object') return structuredClone(defaults);
  const r = raw as Record<string, unknown>;
  const photosIn = (r.photos && typeof r.photos === 'object' ? r.photos : {}) as Record<
    string,
    unknown
  >;
  const photos: Record<string, Callout[]> = {};
  for (const key of Object.keys(defaults.photos)) {
    const arr = Array.isArray(photosIn[key]) ? (photosIn[key] as unknown[]) : null;
    if (arr) {
      photos[key] = arr.map(normalizeCallout).filter((c): c is Callout => !!c);
    } else {
      photos[key] = structuredClone(defaults.photos[key]);
    }
  }
  for (const key of Object.keys(photosIn)) {
    if (photos[key]) continue;
    const arr = Array.isArray(photosIn[key]) ? (photosIn[key] as unknown[]) : [];
    photos[key] = arr.map(normalizeCallout).filter((c): c is Callout => !!c);
  }

  const transformsIn =
    r.transforms && typeof r.transforms === 'object'
      ? (r.transforms as Record<string, unknown>)
      : {};
  const transforms: Record<string, ImageTransform> = {
    ...(defaults.transforms || {}),
  };
  for (const key of Object.keys(transformsIn)) {
    transforms[key] = normalizeTransform(transformsIn[key]);
  }

  const galleryIn = Array.isArray(r.gallery) ? (r.gallery as unknown[]) : null;
  const gallery: GalleryItem[] = galleryIn
    ? galleryIn
        .map((item): GalleryItem | null => {
          if (!item || typeof item !== 'object') return null;
          const g = item as Record<string, unknown>;
          if (typeof g.src !== 'string' || !g.src.trim()) return null;
          return {
            id:
              typeof g.id === 'string' && g.id
                ? g.id
                : `g_${Math.random().toString(36).slice(2, 9)}`,
            src: g.src.trim(),
            cap: typeof g.cap === 'string' ? g.cap : '',
          };
        })
        .filter((g): g is GalleryItem => !!g)
    : structuredClone(defaults.gallery || []);

  return {
    version: 3,
    pageId: PAGE_ID,
    photos,
    transforms,
    gallery,
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : undefined,
  };
}
