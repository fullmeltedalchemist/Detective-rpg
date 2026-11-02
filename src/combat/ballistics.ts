import * as pc from 'playcanvas';
import type { CollisionWorld } from '../world/collision';
import type { Humanoid } from '../entities/humanoid';

/** Body regions for damage multipliers. */
export type Region = 'head' | 'torso' | 'limb';

export interface Target {
  id: string;
  human: Humanoid;
  /** Return false to skip (e.g. already dead and not to be hit again, or in a car). */
  hittable(): boolean;
}

export interface Hit {
  kind: 'world' | 'body';
  point: pc.Vec3;
  normal?: pc.Vec3;
  target?: Target;
  region?: Region;
  distance: number;
}

interface Sphere { bone: string; r: number; region: Region; mid?: string }
// Hit volumes built from live bone positions each shot (cheap: ~12 spheres per character).
const VOLUMES: Sphere[] = [
  { bone: 'Head', r: 0.13, region: 'head' },
  { bone: 'neck_01', r: 0.09, region: 'head' },
  { bone: 'spine_03', r: 0.21, region: 'torso' },
  { bone: 'spine_01', r: 0.19, region: 'torso' },
  { bone: 'pelvis', r: 0.18, region: 'torso' },
  { bone: 'upperarm_l', mid: 'lowerarm_l', r: 0.08, region: 'limb' },
  { bone: 'upperarm_r', mid: 'lowerarm_r', r: 0.08, region: 'limb' },
  { bone: 'lowerarm_l', mid: 'hand_l', r: 0.07, region: 'limb' },
  { bone: 'lowerarm_r', mid: 'hand_r', r: 0.07, region: 'limb' },
  { bone: 'thigh_l', mid: 'calf_l', r: 0.11, region: 'limb' },
  { bone: 'thigh_r', mid: 'calf_r', r: 0.11, region: 'limb' },
  { bone: 'calf_l', mid: 'foot_l', r: 0.08, region: 'limb' },
  { bone: 'calf_r', mid: 'foot_r', r: 0.08, region: 'limb' },
];

const v1 = new pc.Vec3(), v2 = new pc.Vec3(), c = new pc.Vec3();

function raySphere(o: pc.Vec3, d: pc.Vec3, center: pc.Vec3, r: number): number {
  const ox = o.x - center.x, oy = o.y - center.y, oz = o.z - center.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const h = b * b - cc;
  if (h < 0) return -1;
  const t = -b - Math.sqrt(h);
  return t >= 0 ? t : (-b + Math.sqrt(h) >= 0 ? 0 : -1);
}

/** Segment test against characters; returns nearest hit within maxT. */
export function raycastBodies(o: pc.Vec3, d: pc.Vec3, maxT: number, targets: Target[], ignore?: string): Hit | null {
  let best: Hit | null = null;
  for (const t of targets) {
    if (t.id === ignore || !t.hittable()) continue;
    const root = t.human.entity.getPosition();
    // broad phase: distance from ray to character root column
    const rx = root.x - o.x, rz = root.z - o.z;
    const along = rx * d.x + rz * d.z;
    if (along < -1 || along > maxT + 1) continue;
    const px = o.x + d.x * along - root.x, pz = o.z + d.z * along - root.z;
    if (px * px + pz * pz > 1.2 * 1.2 && t.human.life === 'alive') continue;
    for (const s of VOLUMES) {
      t.human.bonePos(s.bone, v1);
      if (s.mid) { t.human.bonePos(s.mid, v2); c.lerp(v1, v2, 0.5); } else c.copy(v1);
      const hitT = raySphere(o, d, c, s.r);
      if (hitT >= 0 && hitT <= maxT && (!best || hitT < best.distance)) {
        best = { kind: 'body', point: new pc.Vec3(o.x + d.x * hitT, o.y + d.y * hitT, o.z + d.z * hitT), target: t, region: s.region, distance: hitT };
      }
    }
  }
  return best;
}

export interface Projectile {
  pos: pc.Vec3; vel: pc.Vec3; owner: string; damage: number; headMult: number; limbMult: number;
  range: number; travelled: number; alive: boolean; weapon: string;
}

/**
 * Simulated bullets: real travel time and drop, tested as swept segments each frame
 * against world boxes and character hit volumes.
 */
export class Ballistics {
  readonly projectiles: Projectile[] = [];
  onHit: (p: Projectile, hit: Hit) => void = () => {};
  readonly gravity = 9.81;

  constructor(private world: CollisionWorld, private targets: () => Target[]) {}

  fire(origin: pc.Vec3, dir: pc.Vec3, speed: number, owner: string, damage: number, headMult: number, limbMult: number, range: number, weapon: string) {
    this.projectiles.push({
      pos: origin.clone(), vel: dir.clone().mulScalar(speed), owner, damage, headMult, limbMult, range, travelled: 0, alive: true, weapon,
    });
  }

  update(dt: number) {
    const targets = this.targets();
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      // sub-step for accuracy
      let remaining = dt;
      while (remaining > 0 && p.alive) {
        const step = Math.min(remaining, 1 / 120);
        remaining -= step;
        p.vel.y -= this.gravity * step;
        const sp = p.vel.length();
        const segLen = sp * step;
        const d = new pc.Vec3(p.vel.x / sp, p.vel.y / sp, p.vel.z / sp);
        const wt = this.world.raycast(p.pos.x, p.pos.y, p.pos.z, d.x, d.y, d.z, segLen, false);
        const body = raycastBodies(p.pos, d, Math.min(segLen, wt), targets, p.owner);
        if (body) {
          p.alive = false;
          body.distance += p.travelled;
          this.onHit(p, body);
        } else if (wt < segLen) {
          p.alive = false;
          const pt = new pc.Vec3(p.pos.x + d.x * wt, p.pos.y + d.y * wt, p.pos.z + d.z * wt);
          this.onHit(p, { kind: 'world', point: pt, distance: p.travelled + wt, normal: d.clone().mulScalar(-1) });
        } else {
          p.pos.x += d.x * segLen; p.pos.y += d.y * segLen; p.pos.z += d.z * segLen;
          p.travelled += segLen;
          if (p.travelled > p.range * 3 || p.pos.y < -2) p.alive = false;
        }
      }
    }
    // compact
    for (let i = this.projectiles.length - 1; i >= 0; i--) if (!this.projectiles[i].alive) this.projectiles.splice(i, 1);
  }

  /** Damage after range falloff. */
  static damageFor(p: Projectile, hit: Hit) {
    const mult = hit.region === 'head' ? p.headMult : hit.region === 'limb' ? p.limbMult : 1;
    const falloff = hit.distance > p.range ? Math.max(0.4, 1 - (hit.distance - p.range) / (p.range * 2)) : 1;
    return p.damage * mult * falloff;
  }
}
