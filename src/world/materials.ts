import * as pc from 'playcanvas';
import type { Assets } from '../core/assets';
import type { QualityPreset } from '../core/quality';

/** PBR surface definitions (Poly Haven CC0 texture sets) + flat materials. */
export const SURFACES = {
  asphalt: { tex: 'asphalt_02', scale: 4 },
  sidewalk: { tex: 'concrete_pavement', scale: 2.5 },
  brickRed: { tex: 'brick_wall_10', scale: 3 },
  brickDark: { tex: 'brick_wall_02', scale: 3 },
  beige: { tex: 'beige_wall_001', scale: 3 },
  stucco: { tex: 'white_stucco', scale: 3 },
  facade: { tex: 'concrete_tile_facade', scale: 4 },
  woodFloor: { tex: 'wood_floor', scale: 2.5 },
  marble: { tex: 'marble_tiles', scale: 2 },
  tiles: { tex: 'grey_tiles', scale: 2 },
  plaster: { tex: 'painted_plaster_wall', scale: 3 },
  grass: { tex: 'leafy_grass', scale: 3 },
  concrete: { tex: 'concrete_floor_02', scale: 4 },
} as const;

export type SurfaceName = keyof typeof SURFACES;

export const TEXTURE_SETS = [...new Set(Object.values(SURFACES).map((s) => s.tex))];

export function queueSurfaceTextures(assets: Assets, q: QualityPreset) {
  const base = `assets/tex/${q.textureSize}`;
  for (const t of TEXTURE_SETS) {
    assets.texture(`${t}_diff`, `${base}/${t}_diff.webp`, true);
    assets.texture(`${t}_nor`, `${base}/${t}_nor.webp`, false);
    if (q.useArmMaps) assets.texture(`${t}_arm`, `${base}/${t}_arm.webp`, false);
  }
}

export class Materials {
  private cache = new Map<string, pc.StandardMaterial>();

  constructor(private assets: Assets, private q: QualityPreset) {}

  /** Textured surface; tint multiplies the albedo. */
  surface(name: SurfaceName, tint?: pc.Color, key = ''): pc.StandardMaterial {
    const id = `${name}:${tint?.toString() ?? ''}:${key}`;
    let m = this.cache.get(id);
    if (m) return m;
    const tex = SURFACES[name].tex;
    m = new pc.StandardMaterial();
    m.name = id;
    m.useMetalness = true;
    m.metalness = 0;
    const diff = this.assets.tex(`${tex}_diff`);
    if (diff) m.diffuseMap = diff;
    if (tint) m.diffuse = tint.clone();
    const nor = this.assets.tex(`${tex}_nor`);
    if (nor) { m.normalMap = nor; m.bumpiness = 1; }
    const arm = this.q.useArmMaps ? this.assets.tex(`${tex}_arm`) : null;
    if (arm) {
      m.aoMap = arm; m.aoMapChannel = 'r';
      m.glossMap = arm; m.glossMapChannel = 'g'; m.glossInvert = true; m.gloss = 1;
    } else {
      m.gloss = 0.25;
    }
    m.update();
    this.cache.set(id, m);
    return m;
  }

  flat(key: string, color: pc.Color, opts: { gloss?: number; metal?: number; emissive?: pc.Color; emissiveIntensity?: number; opacity?: number } = {}) {
    const id = `flat:${key}`;
    let m = this.cache.get(id);
    if (m) return m;
    m = new pc.StandardMaterial();
    m.name = id;
    m.useMetalness = true;
    m.diffuse = color.clone();
    m.gloss = opts.gloss ?? 0.4;
    m.metalness = opts.metal ?? 0;
    if (opts.emissive) { m.emissive = opts.emissive.clone(); m.emissiveIntensity = opts.emissiveIntensity ?? 1; }
    if (opts.opacity !== undefined && opts.opacity < 1) {
      m.opacity = opts.opacity;
      m.blendType = pc.BLEND_NORMAL;
      m.depthWrite = false;
    }
    m.update();
    this.cache.set(id, m);
    return m;
  }

  glass(key = 'glass', tint = new pc.Color(0.55, 0.65, 0.7)) {
    const id = `glass:${key}`;
    let m = this.cache.get(id);
    if (m) return m;
    m = new pc.StandardMaterial();
    m.name = id;
    m.useMetalness = true;
    m.diffuse = tint;
    m.metalness = 0.0;
    m.gloss = 0.95;
    m.opacity = 0.28;
    m.blendType = pc.BLEND_NORMAL;
    m.depthWrite = false;
    m.opacityFadesSpecular = false;
    m.update();
    this.cache.set(id, m);
    return m;
  }

  textured(key: string, texture: pc.Texture, opts: { emissive?: boolean; gloss?: number; alpha?: boolean } = {}) {
    const id = `tex:${key}`;
    let m = this.cache.get(id);
    if (m) return m;
    m = new pc.StandardMaterial();
    m.name = id;
    m.useMetalness = true;
    m.gloss = opts.gloss ?? 0.3;
    m.diffuseMap = texture;
    if (opts.emissive) { m.emissiveMap = texture; m.emissive = new pc.Color(1, 1, 1); m.emissiveIntensity = 1.1; }
    if (opts.alpha) { m.opacityMap = texture; m.opacityMapChannel = 'a'; m.alphaTest = 0.5; }
    m.update();
    this.cache.set(id, m);
    return m;
  }
}
