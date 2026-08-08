/** Callouts annotés sur photos produit — types + defaults + stockage */

export type CalloutLineColor = 'white' | 'black' | 'bw';
export type CalloutLineStyle = 'solid' | 'dashed';
export type CalloutLabelStyle = 'dark' | 'light' | 'minimal';
export type CalloutSide = 'left' | 'right';

export type CalloutDesign = {
  /** Couleur du trait */
  lineColor: CalloutLineColor;
  /** Épaisseur trait (px) */
  strokeWidth: number;
  /** Continu ou pointillé */
  lineStyle: CalloutLineStyle;
  /** Diamètre du point (px) */
  pointSize: number;
  /** Style de l’étiquette */
  labelStyle: CalloutLabelStyle;
  /** Afficher le sous-titre */
  showSub: boolean;
};

export type Callout = {
  id: string;
  /** Position centre 0–100 % */
  x: number;
  y: number;
  label: string;
  sub?: string;
  side: CalloutSide;
  /** Longueur du trait horizontal (%) */
  stretch: number;
  /** Décalage vertical de l’étiquette (%) */
  labelDy: number;
  design: CalloutDesign;
};

export type PageCalloutsConfig = {
  version: 1;
  pageId: string;
  photos: Record<string, Callout[]>;
  updatedAt?: string;
};

export const DEFAULT_DESIGN: CalloutDesign = {
  lineColor: 'bw',
  strokeWidth: 2,
  lineStyle: 'solid',
  pointSize: 8,
  labelStyle: 'dark',
  showSub: true,
};

export const CALLOUTS_SETTINGS_KEY = 'page_callouts_omega_dmx_interface';
export const PAGE_ID = 'omega-dmx-interface';

export function newCalloutId(): string {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function createCallout(partial: Partial<Callout> & { x: number; y: number }): Callout {
  return {
    id: partial.id || newCalloutId(),
    x: clamp(partial.x, 0, 100),
    y: clamp(partial.y, 0, 100),
    label: partial.label ?? 'Nouveau repère',
    sub: partial.sub ?? '',
    side: partial.side ?? (partial.x > 50 ? 'right' : 'left'),
    stretch: partial.stretch ?? 16,
    labelDy: partial.labelDy ?? 0,
    design: { ...DEFAULT_DESIGN, ...partial.design },
  };
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function normalizeCallout(raw: unknown): Callout | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.x !== 'number' || typeof r.y !== 'number') return null;
  const designRaw = (r.design && typeof r.design === 'object' ? r.design : {}) as Partial<CalloutDesign>;
  return createCallout({
    id: typeof r.id === 'string' ? r.id : undefined,
    x: r.x,
    y: r.y,
    label: typeof r.label === 'string' ? r.label : 'Repère',
    sub: typeof r.sub === 'string' ? r.sub : '',
    side: r.side === 'right' ? 'right' : 'left',
    stretch: typeof r.stretch === 'number' ? r.stretch : 16,
    labelDy: typeof r.labelDy === 'number' ? r.labelDy : 0,
    design: {
      lineColor:
        designRaw.lineColor === 'white' || designRaw.lineColor === 'black' || designRaw.lineColor === 'bw'
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
    },
  });
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
  // Keep any extra photo keys saved by admin
  for (const key of Object.keys(photosIn)) {
    if (photos[key]) continue;
    const arr = Array.isArray(photosIn[key]) ? (photosIn[key] as unknown[]) : [];
    photos[key] = arr.map(normalizeCallout).filter((c): c is Callout => !!c);
  }
  return {
    version: 1,
    pageId: PAGE_ID,
    photos,
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : undefined,
  };
}
