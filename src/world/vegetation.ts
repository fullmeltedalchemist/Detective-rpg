import * as pc from 'playcanvas';
import type { Assets } from '../core/assets';
import type { CollisionWorld } from './collision';
import type { QualityPreset } from '../core/quality';

/**
 * Procedural street trees and hedges built from bark-textured trunks/branches plus
 * alpha-tested foliage cluster cards (composed from ambientCG CC0 leaf scans).
 * Card normals point away from the canopy centre so the crown shades like a volume.
 * Each variant is one mesh per material, shared by every tree of that variant.
 */

interface Geo { pos: number[]; nrm: number[]; uv: number[]; idx: number[] }
const geo = (): Geo => ({ pos: [], nrm: [], uv: [], idx: [] });

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** Tapered cylinder from a to b. */
function branch(g: Geo, a: pc.Vec3, b: pc.Vec3, r0: number, r1: number, sides: number, vScale: number) {
  const dir = new pc.Vec3().sub2(b, a);
  const len = dir.length();
  dir.normalize();
  const up = Math.abs(dir.y) < 0.95 ? pc.Vec3.UP : pc.Vec3.RIGHT;
  const u = new pc.Vec3().cross(dir, up).normalize();
  const v = new pc.Vec3().cross(u, dir).normalize();
  const base = g.pos.length / 3;
  for (let ring = 0; ring <= 1; ring++) {
    const c = ring ? b : a, r = ring ? r1 : r0;
    for (let i = 0; i <= sides; i++) {
      const t = (i / sides) * Math.PI * 2;
      const nx = u.x * Math.cos(t) + v.x * Math.sin(t), ny = u.y * Math.cos(t) + v.y * Math.sin(t), nz = u.z * Math.cos(t) + v.z * Math.sin(t);
      g.pos.push(c.x + nx * r, c.y + ny * r, c.z + nz * r);
      g.nrm.push(nx, ny, nz);
      g.uv.push(i / sides * Math.max(1, r0 * 6), ring * len * vScale);
    }
  }
  for (let i = 0; i < sides; i++) {
    const a0 = base + i, a1 = base + i + 1, b0 = base + sides + 1 + i, b1 = b0 + 1;
    g.idx.push(a0, b0, a1, a1, b0, b1);
  }
}

/** Two crossed foliage quads centred at p with "volume" normals from the canopy centre. */
function cards(g: Geo, p: pc.Vec3, centre: pc.Vec3, size: number, yaw: number, tilt: number, flipU: boolean) {
  const n = new pc.Vec3().sub2(p, centre); n.y *= 0.7; n.y += 0.25; n.normalize();
  for (let k = 0; k < 2; k++) {
    const a = yaw + k * Math.PI / 2;
    const ux = Math.cos(a), uz = Math.sin(a);
    // tilt the card a bit so it isn't perfectly vertical
    const vx = -Math.sin(a) * Math.sin(tilt), vy = Math.cos(tilt), vz = Math.cos(a) * Math.sin(tilt);
    const h = size / 2;
    const base = g.pos.length / 3;
    const corners: [number, number, number, number][] = [[-1, -1, 0, 1], [1, -1, 1, 1], [1, 1, 1, 0], [-1, 1, 0, 0]];
    for (const [cu, cv, tu, tv] of corners) {
      g.pos.push(p.x + (ux * cu + vx * cv) * h, p.y + vy * cv * h, p.z + (uz * cu + vz * cv) * h);
      g.nrm.push(n.x, n.y, n.z);
      g.uv.push(flipU ? 1 - tu : tu, tv);
    }
    g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

function toMesh(device: pc.GraphicsDevice, g: Geo) {
  const m = new pc.Mesh(device);
  m.setPositions(g.pos); m.setNormals(g.nrm); m.setUvs(0, g.uv);
  m.setIndices(g.pos.length / 3 > 65535 ? new Uint32Array(g.idx) : new Uint16Array(g.idx));
  m.update(pc.PRIMITIVE_TRIANGLES);
  return m;
}

export interface TreeVariant { bark: pc.Mesh; leaves: pc.Mesh; leafMat: pc.Material; height: number }

/** Build a deciduous street tree variant. */
function makeTree(device: pc.GraphicsDevice, seed: number, height: number, crown: number, cardsCount: number, leafMat: pc.Material): TreeVariant {
  const r = rng(seed);
  const bark = geo(), leaves = geo();
  const trunkTop = new pc.Vec3((r() - 0.5) * 0.3, height * 0.42, (r() - 0.5) * 0.3);
  branch(bark, new pc.Vec3(0, 0, 0), trunkTop, 0.17, 0.12, 9, 0.6);
  const centre = new pc.Vec3(0, height * 0.66, 0);
  // main limbs fork out of the trunk top
  const tips: pc.Vec3[] = [];
  const limbs = 4 + Math.floor(r() * 2);
  for (let i = 0; i < limbs; i++) {
    const a = (i / limbs) * Math.PI * 2 + r() * 0.6;
    const out = crown * (0.45 + r() * 0.35);
    const tip = new pc.Vec3(Math.cos(a) * out, height * (0.62 + r() * 0.22), Math.sin(a) * out);
    branch(bark, trunkTop, tip, 0.09, 0.035, 6, 0.6);
    // secondary twigs
    for (let j = 0; j < 2; j++) {
      const b2 = new pc.Vec3(tip.x + (r() - 0.5) * crown * 0.6, tip.y + r() * height * 0.15, tip.z + (r() - 0.5) * crown * 0.6);
      branch(bark, tip, b2, 0.035, 0.012, 4, 0.6);
      tips.push(b2);
    }
    tips.push(tip);
  }
  // foliage: cards clustered around branch tips + filling the crown ellipsoid
  for (let i = 0; i < cardsCount; i++) {
    let p: pc.Vec3;
    if (i < tips.length * 3) {
      const t = tips[i % tips.length];
      p = new pc.Vec3(t.x + (r() - 0.5) * 1.2, t.y + (r() - 0.3) * 1.0, t.z + (r() - 0.5) * 1.2);
    } else {
      const u = r() * Math.PI * 2, v = Math.acos(2 * r() - 1), rad = Math.cbrt(r());
      p = new pc.Vec3(Math.sin(v) * Math.cos(u) * crown * rad, centre.y + Math.cos(v) * height * 0.26 * rad, Math.sin(v) * Math.sin(u) * crown * rad);
    }
    cards(leaves, p, centre, 1.5 + r() * 1.1, r() * Math.PI, (r() - 0.5) * 0.9, r() < 0.5);
  }
  return { bark: toMesh(device, bark), leaves: toMesh(device, leaves), leafMat, height };
}

function makeHedge(device: pc.GraphicsDevice, length: number, seed: number) {
  const r = rng(seed);
  const g = geo();
  const centre = new pc.Vec3(0, 0.25, 0);
  const n = Math.floor(length * 9);
  for (let i = 0; i < n; i++) {
    const x = (r() - 0.5) * length;
    const p = new pc.Vec3(x, 0.3 + r() * 0.5, (r() - 0.5) * 0.5);
    centre.x = x;
    cards(g, p, centre, 0.7 + r() * 0.4, r() * Math.PI, (r() - 0.5) * 0.6, r() < 0.5);
  }
  return toMesh(device, g);
}

export class Vegetation {
  private variants: TreeVariant[] = [];
  private barkMat: pc.StandardMaterial;
  private hedgeMat: pc.StandardMaterial;
  private hedgeMeshes = new Map<number, pc.Mesh>();

  constructor(private app: pc.Application, assets: Assets, private q: QualityPreset) {
    const device = app.graphicsDevice;
    const tier = q.textureSize === '1k' ? '' : '_512';
    const leaf = (key: string) => {
      const m = new pc.StandardMaterial();
      const t = assets.tex(`foliage:${key}${tier}`) ?? assets.tex(`foliage:${key}`);
      if (t) { m.diffuseMap = t; m.opacityMap = t; m.opacityMapChannel = 'a'; }
      m.alphaTest = 0.42;
      m.cull = pc.CULLFACE_NONE;
      m.useMetalness = true; m.metalness = 0; m.gloss = 0.25;
      // subtle translucency: lift the shadowed side
      m.emissive = new pc.Color(0.05, 0.075, 0.03);
      m.diffuse = new pc.Color(0.95, 1, 0.9);
      m.update();
      return m;
    };
    const maple = leaf('card_maple'), round = leaf('card_round');
    this.hedgeMat = leaf('card_hedge');
    this.barkMat = new pc.StandardMaterial();
    const bd = assets.tex('bark_platanus_diff'), bn = assets.tex('bark_platanus_nor');
    if (bd) this.barkMat.diffuseMap = bd;
    if (bn) this.barkMat.normalMap = bn;
    this.barkMat.diffuseMapTiling = new pc.Vec2(1, 1);
    this.barkMat.useMetalness = true; this.barkMat.gloss = 0.2;
    this.barkMat.update();
    const dense = q.level === 'high' ? 1 : q.level === 'medium' ? 0.8 : 0.6;
    this.variants = [
      makeTree(device, 11, 7.5, 3.0, Math.round(70 * dense), maple),
      makeTree(device, 23, 8.5, 3.4, Math.round(80 * dense), round),
      makeTree(device, 37, 6.4, 2.6, Math.round(60 * dense), round),
      makeTree(device, 51, 9.0, 3.6, Math.round(90 * dense), maple),
    ];
  }

  /** Place a tree; returns the entity. */
  tree(root: pc.Entity, world: CollisionWorld, x: number, z: number, scale: number, variant: number) {
    const v = this.variants[variant % this.variants.length];
    const e = new pc.Entity('tree');
    const barkMi = new pc.MeshInstance(v.bark, this.barkMat);
    const leafMi = new pc.MeshInstance(v.leaves, v.leafMat);
    e.addComponent('render', { meshInstances: [barkMi, leafMi], castShadows: true, receiveShadows: true });
    root.addChild(e);
    e.setPosition(x, world.groundHeight(x, z), z);
    e.setEulerAngles(0, (x * 37.1 + z * 13.7) % 360, 0);
    e.setLocalScale(scale, scale, scale);
    world.addBox(x, 1.5, z, 0.42 * scale, 3, 0.42 * scale, 'tree').blocksCamera = false;
    return e;
  }

  hedge(root: pc.Entity, x: number, z: number, length: number, yaw: number) {
    const key = Math.round(length * 2);
    let mesh = this.hedgeMeshes.get(key);
    if (!mesh) { mesh = makeHedge(this.app.graphicsDevice, length, key * 7 + 3); this.hedgeMeshes.set(key, mesh); }
    const e = new pc.Entity('hedge');
    e.addComponent('render', { meshInstances: [new pc.MeshInstance(mesh, this.hedgeMat)], castShadows: this.q.level !== 'low' });
    root.addChild(e);
    e.setPosition(x, 0.15, z);
    e.setEulerAngles(0, yaw, 0);
    return e;
  }
}
