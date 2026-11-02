export type QualityLevel = 'low' | 'medium' | 'high';

export interface QualityPreset {
  level: QualityLevel;
  /** Max device pixel ratio used for the canvas. */
  maxPixelRatio: number;
  /** Minimum pixel ratio dynamic resolution may drop to. */
  minPixelRatio: number;
  shadows: boolean;
  shadowResolution: number;
  shadowDistance: number;
  cascades: number;
  textureSize: '512' | '1k';
  useArmMaps: boolean;
  antialias: boolean;
  interiorLights: boolean;
  drawDistance: number;
  dynamicResolution: boolean;
}

export const PRESETS: Record<QualityLevel, QualityPreset> = {
  low: {
    level: 'low', maxPixelRatio: 1.0, minPixelRatio: 0.65, shadows: true, shadowResolution: 1024, shadowDistance: 28,
    cascades: 1, textureSize: '512', useArmMaps: false, antialias: false, interiorLights: false, drawDistance: 140,
    dynamicResolution: true,
  },
  medium: {
    level: 'medium', maxPixelRatio: 1.6, minPixelRatio: 0.8, shadows: true, shadowResolution: 1024, shadowDistance: 40,
    cascades: 1, textureSize: '512', useArmMaps: true, antialias: false, interiorLights: true, drawDistance: 180,
    dynamicResolution: true,
  },
  high: {
    level: 'high', maxPixelRatio: 2.0, minPixelRatio: 1.0, shadows: true, shadowResolution: 2048, shadowDistance: 70,
    cascades: 2, textureSize: '1k', useArmMaps: true, antialias: true, interiorLights: true, drawDistance: 260,
    dynamicResolution: false,
  },
};

const KEY = 'casefiles.quality';

export const isTouchDevice = () =>
  'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;

export function loadQuality(): QualityPreset {
  let level: QualityLevel | null = null;
  try { level = localStorage.getItem(KEY) as QualityLevel | null; } catch { /* private mode */ }
  const fromUrl = new URLSearchParams(location.search).get('quality') as QualityLevel | null;
  if (fromUrl && PRESETS[fromUrl]) level = fromUrl;
  if (!level || !PRESETS[level]) level = isTouchDevice() ? 'medium' : 'high';
  return { ...PRESETS[level] };
}

export function saveQuality(level: QualityLevel) {
  try { localStorage.setItem(KEY, level); } catch { /* ignore */ }
}
