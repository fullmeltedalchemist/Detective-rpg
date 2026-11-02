/**
 * Lightweight collision world. Everything solid is an axis-aligned box.
 * Characters are vertical circles in XZ, cars are a set of circles.
 * Avoids a full physics engine (keeps the phone build light).
 */
export interface Solid {
  minX: number; maxX: number;
  minY: number; maxY: number;
  minZ: number; maxZ: number;
  /** Optional tag for debugging / gameplay (e.g. 'glass', 'door'). */
  tag?: string;
  /** Disabled solids are ignored (used for doors). */
  enabled?: boolean;
  /** Does it block the camera ray? Default true. */
  blocksCamera?: boolean;
}

export interface FloorRect { minX: number; maxX: number; minZ: number; maxZ: number; y: number }

const CELL = 8;

export class CollisionWorld {
  readonly solids: Solid[] = [];
  readonly floors: FloorRect[] = [];
  private grid = new Map<string, Solid[]>();

  addBox(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, tag?: string): Solid {
    const s: Solid = {
      minX: cx - sx / 2, maxX: cx + sx / 2,
      minY: cy - sy / 2, maxY: cy + sy / 2,
      minZ: cz - sz / 2, maxZ: cz + sz / 2,
      tag, enabled: true,
    };
    this.add(s);
    return s;
  }

  add(s: Solid) {
    this.solids.push(s);
    for (let gx = Math.floor(s.minX / CELL); gx <= Math.floor(s.maxX / CELL); gx++) {
      for (let gz = Math.floor(s.minZ / CELL); gz <= Math.floor(s.maxZ / CELL); gz++) {
        const k = gx + ',' + gz;
        let list = this.grid.get(k);
        if (!list) this.grid.set(k, (list = []));
        list.push(s);
      }
    }
  }

  addFloor(minX: number, maxX: number, minZ: number, maxZ: number, y: number) {
    this.floors.push({ minX, maxX, minZ, maxZ, y });
  }

  groundHeight(x: number, z: number): number {
    let h = 0;
    for (const f of this.floors) {
      if (x >= f.minX && x <= f.maxX && z >= f.minZ && z <= f.maxZ && f.y > h) h = f.y;
    }
    return h;
  }

  private nearby(x: number, z: number, r: number, out: Set<Solid>) {
    out.clear();
    for (let gx = Math.floor((x - r) / CELL); gx <= Math.floor((x + r) / CELL); gx++) {
      for (let gz = Math.floor((z - r) / CELL); gz <= Math.floor((z + r) / CELL); gz++) {
        const list = this.grid.get(gx + ',' + gz);
        if (list) for (const s of list) out.add(s);
      }
    }
    return out;
  }

  private tmp = new Set<Solid>();

  /**
   * Push a circle (x,z,r) occupying vertical span [y0,y1] out of solids.
   * Returns corrected position and whether a collision happened.
   */
  resolveCircle(x: number, z: number, r: number, y0: number, y1: number, out: { x: number; z: number; hit: boolean; nx: number; nz: number }) {
    out.hit = false; out.nx = 0; out.nz = 0;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const s of this.nearby(x, z, r, this.tmp)) {
        if (s.enabled === false) continue;
        if (y1 <= s.minY || y0 >= s.maxY) continue;
        const px = Math.max(s.minX, Math.min(x, s.maxX));
        const pz = Math.max(s.minZ, Math.min(z, s.maxZ));
        let dx = x - px, dz = z - pz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-5) {
          // Centre inside the box: push out along the shallowest axis.
          const l = x - s.minX, rr = s.maxX - x, b = z - s.minZ, t = s.maxZ - z;
          const m = Math.min(l, rr, b, t);
          if (m === l) { dx = -1; dz = 0; d = -l; }
          else if (m === rr) { dx = 1; dz = 0; d = -rr; }
          else if (m === b) { dx = 0; dz = -1; d = -b; }
          else { dx = 0; dz = 1; d = -t; }
          const push = r - d;
          x += dx * push; z += dz * push;
          out.nx += dx; out.nz += dz;
        } else {
          const push = r - d;
          dx /= d; dz /= d;
          x += dx * push; z += dz * push;
          out.nx += dx; out.nz += dz;
        }
        out.hit = true; moved = true;
      }
      if (!moved) break;
    }
    out.x = x; out.z = z;
    const n = Math.hypot(out.nx, out.nz);
    if (n > 0) { out.nx /= n; out.nz /= n; }
    return out;
  }

  /** Ray (origin + dir * t, t in [0,maxT]) vs. solids. Returns nearest hit t or maxT. */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, cameraOnly = true): number {
    let best = maxT;
    const ex = ox + dx * maxT, ez = oz + dz * maxT;
    const minX = Math.min(ox, ex), maxX = Math.max(ox, ex), minZ = Math.min(oz, ez), maxZ = Math.max(oz, ez);
    const r = Math.max(maxX - minX, maxZ - minZ) / 2 + 1;
    for (const s of this.nearby((minX + maxX) / 2, (minZ + maxZ) / 2, r, this.tmp)) {
      if (s.enabled === false) continue;
      if (cameraOnly && s.blocksCamera === false) continue;
      const t = rayBox(ox, oy, oz, dx, dy, dz, s);
      if (t >= 0 && t < best) best = t;
    }
    return best;
  }
}

function rayBox(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, s: Solid): number {
  let tmin = -Infinity, tmax = Infinity;
  const axes: [number, number, number, number][] = [[ox, dx, s.minX, s.maxX], [oy, dy, s.minY, s.maxY], [oz, dz, s.minZ, s.maxZ]];
  for (const [o, d, mn, mx] of axes) {
    if (Math.abs(d) < 1e-8) {
      if (o < mn || o > mx) return -1;
    } else {
      let t1 = (mn - o) / d, t2 = (mx - o) / d;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
  }
  if (tmax < 0) return -1;
  return tmin >= 0 ? tmin : 0;
}
