import * as pc from 'playcanvas';
import type { Assets } from '../core/assets';
import type { CollisionWorld } from './collision';

export interface PropOpts {
  /** Uniform scale, or computed from targetHeight. */
  scale?: number;
  targetHeight?: number;
  /** Keep only child nodes whose names start with one of these (for multi-variant files). */
  keep?: string[];
  /** Drop child nodes containing any of these substrings. */
  drop?: string[];
  yaw?: number;
  y?: number;
  /** Add a collision box matching the footprint. */
  collide?: boolean;
  /** Shrink collision footprint (metres per side). */
  collideInset?: number;
  castShadows?: boolean;
  batch?: number;
}

/** Place GLB props with variant filtering, auto-scaling and optional collision. */
export class Props {
  constructor(private assets: Assets, private world: CollisionWorld, private root: pc.Entity) {}

  place(key: string, x: number, z: number, o: PropOpts = {}): pc.Entity {
    const e = this.assets.instance(key);
    // Variant filtering
    if (o.keep || o.drop) {
      const renders = e.findComponents('render') as pc.RenderComponent[];
      for (const r of renders) {
        const n = r.entity.name;
        const keepIt = o.keep ? o.keep.some((k) => n === k || n.startsWith(k)) : true;
        const dropIt = o.drop ? o.drop.some((d) => n.includes(d)) : false;
        if (!keepIt || dropIt) r.entity.enabled = false;
      }
    }
    // Measure at identity to compute scale + recentre
    const aabb = measure(e);
    let s = o.scale ?? 1;
    if (o.targetHeight && aabb) s = o.targetHeight / Math.max(0.001, aabb.halfExtents.y * 2);
    const holder = new pc.Entity(`prop:${key}`);
    holder.addChild(e);
    e.setLocalScale(s, s, s);
    if (aabb) {
      // centre on X/Z, sit on the ground
      e.setLocalPosition(-aabb.center.x * s, -(aabb.center.y - aabb.halfExtents.y) * s, -aabb.center.z * s);
    }
    this.root.addChild(holder);
    const y = o.y ?? this.world.groundHeight(x, z);
    holder.setPosition(x, y, z);
    holder.setEulerAngles(0, o.yaw ?? 0, 0);
    const renders = e.findComponents('render') as pc.RenderComponent[];
    for (const r of renders) {
      r.castShadows = o.castShadows !== false;
      r.receiveShadows = true;
      if (o.batch !== undefined) r.batchGroupId = o.batch;
    }
    if (o.collide && aabb) {
      const yaw = ((o.yaw ?? 0) % 360 + 360) % 360;
      const swap = Math.abs(((yaw + 45) % 180) - 45) > 45; // ~90° or 270°
      const inset = o.collideInset ?? 0.05;
      const hx = Math.max(0.05, aabb.halfExtents.x * s - inset), hz = Math.max(0.05, aabb.halfExtents.z * s - inset);
      const sx = (swap ? hz : hx) * 2, sz = (swap ? hx : hz) * 2;
      const h = aabb.halfExtents.y * 2 * s;
      this.world.addBox(x, y + h / 2, z, sx, h, sz, `prop:${key}`).blocksCamera = false;
    }
    return holder;
  }
}

function measure(e: pc.Entity): pc.BoundingBox | null {
  const renders = e.findComponents('render') as pc.RenderComponent[];
  let box: pc.BoundingBox | null = null;
  for (const r of renders) {
    if (!r.entity.enabled) continue;
    for (const mi of r.meshInstances) {
      if (!box) box = mi.aabb.clone();
      else box.add(mi.aabb);
    }
  }
  return box;
}
