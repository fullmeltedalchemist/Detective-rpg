import * as pc from 'playcanvas';
import type { GeometryBuilder } from './builder';
import type { CollisionWorld, Solid } from './collision';

export const FLOOR_Y = 0.15;
export const CEIL_Y = 4.0;
const T = 0.3; // wall thickness

export interface Opening { at: number; width: number; kind: 'door' | 'window' }

export interface BuildingSpec {
  name: string;
  x0: number; x1: number; z0: number; z1: number;
  /** Which side faces the street. */
  front: 'n' | 's';
  height: number;
  ext: pc.Material;
  /** Material for the trim/cornice and window frames. */
  trim: pc.Material;
  /** Ground-floor openings on the front wall (positions along X, world coords). */
  openings: Opening[];
  /** Optional side door on east/west wall at world Z. */
  sideDoor?: { wall: 'e' | 'w'; at: number; width: number };
  interior?: { floor: pc.Material; wall: pc.Material; ceiling: pc.Material };
  upperWindow?: pc.Material;
  glass: pc.Material;
  /** Upper-floor window spacing in metres (0 = none). */
  windowSpacing?: number;
}

export interface DoorSlot { x: number; z: number; width: number; axis: 'x' | 'z'; building: string }

/**
 * Builds a building shell: exterior skin, optional real interior (floor, inner walls,
 * ceiling), storefront glazing, upper-floor windows, cornice and roof.
 * Returns door slots so sliding doors can be attached.
 */
export function buildBuilding(b: GeometryBuilder, s: BuildingSpec, world: CollisionWorld): DoorSlot[] {
  const { x0, x1, z0, z1, height: H } = s;
  const w = x1 - x0, d = z1 - z0;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const frontZ = s.front === 's' ? z1 : z0;
  const backZ = s.front === 's' ? z0 : z1;
  const outward = s.front === 's' ? 1 : -1;
  const doors: DoorSlot[] = [];
  const hasInt = !!s.interior;
  const groundTop = hasInt ? CEIL_Y + 0.25 : 0;

  // ---- Front wall (ground floor with openings) ----
  const fz = frontZ - outward * T / 2;
  const sorted = [...s.openings].sort((a, b) => a.at - b.at);
  let cursor = x0;
  const sill = 0.85, winTop = 3.1, doorTop = 2.7;
  const pier = (from: number, to: number) => {
    if (to - from < 0.01) return;
    b.box(s.ext, (from + to) / 2, (FLOOR_Y + CEIL_Y + 0.25) / 2, fz, to - from, CEIL_Y + 0.25 - FLOOR_Y, T, { texScale: 3 });
  };
  if (hasInt) {
    for (const o of sorted) {
      const a = o.at - o.width / 2, c = o.at + o.width / 2;
      pier(cursor, a);
      const top = o.kind === 'door' ? doorTop : winTop;
      // header above opening
      b.box(s.ext, o.at, (top + CEIL_Y + 0.25) / 2, fz, o.width, CEIL_Y + 0.25 - top, T, { texScale: 3 });
      if (o.kind === 'window') {
        b.box(s.trim, o.at, (FLOOR_Y + sill) / 2, fz, o.width, sill - FLOOR_Y, T + 0.06, { texScale: 2 });
        // glass pane + frame
        b.box(s.glass, o.at, (sill + top) / 2, fz, o.width, top - sill, 0.04, { blocksCamera: false, castShadows: false, tag: 'glass' });
        b.box(s.trim, o.at, sill + 0.03, fz + outward * 0.08, o.width + 0.1, 0.06, 0.18, { collide: false });
        b.box(s.trim, o.at, top - 0.03, fz, o.width, 0.08, T + 0.04, { collide: false });
        for (const mx of [a + 0.04, c - 0.04, o.at]) b.box(s.trim, mx, (sill + top) / 2, fz, 0.07, top - sill, 0.1, { collide: false });
      } else {
        // door frame
        for (const mx of [a + 0.05, c - 0.05]) b.box(s.trim, mx, (FLOOR_Y + doorTop) / 2, fz, 0.1, doorTop - FLOOR_Y, T + 0.08, { collide: false });
        b.box(s.trim, o.at, doorTop + 0.06, fz, o.width + 0.1, 0.12, T + 0.08, { collide: false });
        doors.push({ x: o.at, z: fz, width: o.width, axis: 'x', building: s.name });
      }
      cursor = c;
    }
    pier(cursor, x1);
  } else {
    // Facade-only building: solid ground floor with shop windows rendered as glass over dark backing.
    b.box(s.ext, cx, (CEIL_Y + 0.25) / 2, fz, w, CEIL_Y + 0.25, T, { texScale: 3 });
    for (const o of sorted) {
      const top = o.kind === 'door' ? doorTop : winTop;
      const bot = o.kind === 'door' ? FLOOR_Y : sill;
      const dz = frontZ + outward * 0.02;
      if (s.upperWindow) b.quad(s.upperWindow, new pc.Vec3(o.at, (bot + top) / 2, dz), outward > 0 ? 'pz' : 'nz', o.width, top - bot);
      else b.box(s.glass, o.at, (bot + top) / 2, dz, o.width, top - bot, 0.03, { collide: false, castShadows: false });
      b.box(s.trim, o.at, top + 0.05, dz + outward * 0.02, o.width + 0.2, 0.1, 0.06, { collide: false });
      if (o.kind === 'window') b.box(s.trim, o.at, bot - 0.04, dz + outward * 0.04, o.width + 0.2, 0.08, 0.14, { collide: false });
    }
  }

  // ---- Back + side walls (ground floor) ----
  const gH = hasInt ? CEIL_Y + 0.25 : CEIL_Y + 0.25;
  const by = gH / 2;
  b.box(s.ext, cx, by, backZ + outward * T / 2, w, gH, T);
  const sideWall = (wallX: number, isEast: boolean) => {
    const sd = s.sideDoor && (s.sideDoor.wall === 'e') === isEast ? s.sideDoor : null;
    const wx = wallX + (isEast ? -T / 2 : T / 2);
    if (!sd) { b.box(s.ext, wx, by, cz, T, gH, d); return; }
    const a = sd.at - sd.width / 2, c = sd.at + sd.width / 2;
    if (a > z0) b.box(s.ext, wx, by, (z0 + a) / 2, T, gH, a - z0);
    if (z1 > c) b.box(s.ext, wx, by, (c + z1) / 2, T, gH, z1 - c);
    b.box(s.ext, wx, (doorTop + gH) / 2, sd.at, T, gH - doorTop, sd.width);
    for (const mz of [a + 0.05, c - 0.05]) b.box(s.trim, wx, doorTop / 2, mz, T + 0.08, doorTop, 0.1, { collide: false });
    doors.push({ x: wx, z: sd.at, width: sd.width, axis: 'z', building: s.name });
  };
  sideWall(x0, false);
  sideWall(x1, true);

  // ---- Upper floors (solid shell + windows) ----
  if (H > gH) {
    const uh = H - gH;
    b.box(s.ext, cx, gH + uh / 2, cz, w, uh, d, { texScale: 3 });
    // floor band
    b.box(s.trim, cx, gH + 0.1, frontZ + outward * 0.05, w + 0.1, 0.25, 0.25, { collide: false });
    const spacing = s.windowSpacing ?? 3.2;
    if (spacing > 0 && s.upperWindow) {
      const floors = Math.floor(uh / 3.3);
      const n = Math.max(1, Math.floor((w - 1) / spacing));
      const start = cx - ((n - 1) * spacing) / 2;
      for (let f = 0; f < floors; f++) {
        const wy = gH + 0.9 + f * 3.3 + 0.9;
        for (let i = 0; i < n; i++) {
          const wx = start + i * spacing;
          const wz = frontZ + outward * 0.012;
          b.quad(s.upperWindow, new pc.Vec3(wx, wy, wz), outward > 0 ? 'pz' : 'nz', 1.2, 1.75);
          b.box(s.trim, wx, wy - 0.95, wz + outward * 0.06, 1.45, 0.1, 0.16, { collide: false });
          b.box(s.trim, wx, wy + 0.95, wz + outward * 0.03, 1.4, 0.12, 0.08, { collide: false });
        }
      }
    }
  }
  // Cornice + roof
  b.box(s.trim, cx, H + 0.15, cz, w + 0.5, 0.3, d + 0.5, { collide: false });
  b.box(s.trim, cx, H + 0.5, frontZ - outward * 0.1, w + 0.3, 0.5, 0.2, { collide: false });

  // ---- Interior ----
  if (s.interior) {
    const I = s.interior;
    b.box(I.floor, cx, FLOOR_Y - 0.04, cz, w - T * 2, 0.1, d - T * 2, { collide: false, texScale: 2.5, castShadows: false });
    world.addFloor(x0 + T, x1 - T, z0 + T, z1 - T, FLOOR_Y);
    // ceiling (visible from below)
    b.box(I.ceiling, cx, CEIL_Y + 0.1, cz, w - T * 2, 0.2, d - T * 2, { texScale: 3 });
    // inner skins (thin, no collision) so interiors use interior materials
    const ih = CEIL_Y - FLOOR_Y, iy = (CEIL_Y + FLOOR_Y) / 2, sk = 0.02;
    const inner = (x: number, z: number, sx: number, sz: number, holes: { a: number; c: number; top: number; bot?: number }[], alongX: boolean) => {
      // split skin around holes
      const start = alongX ? x - sx / 2 : z - sz / 2;
      const end = alongX ? x + sx / 2 : z + sz / 2;
      let cur = start;
      const hs = [...holes].sort((p, q) => p.a - q.a);
      const seg = (p: number, q: number, y0: number, y1: number) => {
        if (q - p < 0.01 || y1 - y0 < 0.01) return;
        if (alongX) b.box(I.wall, (p + q) / 2, (y0 + y1) / 2, z, q - p, y1 - y0, sk, { collide: false, castShadows: false });
        else b.box(I.wall, x, (y0 + y1) / 2, (p + q) / 2, sk, y1 - y0, q - p, { collide: false, castShadows: false });
      };
      for (const h of hs) {
        seg(cur, h.a, FLOOR_Y, CEIL_Y);
        seg(h.a, h.c, h.top, CEIL_Y);
        if (h.bot) seg(h.a, h.c, FLOOR_Y, h.bot);
        cur = h.c;
      }
      seg(cur, end, FLOOR_Y, CEIL_Y);
      void ih; void iy;
    };
    const fHoles = sorted.map((o) => ({ a: o.at - o.width / 2, c: o.at + o.width / 2, top: o.kind === 'door' ? doorTop : winTop, bot: o.kind === 'window' ? sill : undefined }));
    inner(cx, frontZ - outward * (T + 0.01), w - T * 2, 0, fHoles, true);
    inner(cx, backZ + outward * (T + 0.01), w - T * 2, 0, [], true);
    const sdH = (isEast: boolean) => (s.sideDoor && (s.sideDoor.wall === 'e') === isEast ? [{ a: s.sideDoor.at - s.sideDoor.width / 2, c: s.sideDoor.at + s.sideDoor.width / 2, top: doorTop }] : []);
    inner(x0 + T + 0.01, cz, 0, d - T * 2, sdH(false), false);
    inner(x1 - T - 0.01, cz, 0, d - T * 2, sdH(true), false);
    // baseboard
    b.box(s.trim, cx, FLOOR_Y + 0.06, backZ + outward * (T + 0.03), w - T * 2, 0.12, 0.03, { collide: false, castShadows: false });
  }
  void groundTop;
  return doors;
}

/** Automatic sliding glass double door. */
export class SlidingDoor {
  readonly left: pc.Entity;
  readonly right: pc.Entity;
  private open = 0;
  readonly solid: Solid;
  constructor(parent: pc.Entity, readonly slot: DoorSlot, glass: pc.Material, frame: pc.Material, world: CollisionWorld) {
    const mk = (n: string) => {
      const e = new pc.Entity(n);
      const pane = new pc.Entity('pane');
      pane.addComponent('render', { type: 'box', material: glass, castShadows: false });
      const fr = new pc.Entity('frame');
      fr.addComponent('render', { type: 'box', material: frame, castShadows: false });
      e.addChild(pane); e.addChild(fr);
      parent.addChild(e);
      return e;
    };
    this.left = mk('doorL');
    this.right = mk('doorR');
    const h = 2.55, half = slot.width / 2;
    for (const e of [this.left, this.right]) {
      const pane = e.findByName('pane') as pc.Entity, fr = e.findByName('frame') as pc.Entity;
      if (slot.axis === 'x') {
        pane.setLocalScale(half, h, 0.03); fr.setLocalScale(half, 0.08, 0.06); fr.setLocalPosition(0, -h / 2 + 0.04, 0);
      } else {
        pane.setLocalScale(0.03, h, half); fr.setLocalScale(0.06, 0.08, half); fr.setLocalPosition(0, -h / 2 + 0.04, 0);
      }
    }
    const t = 0.12;
    this.solid = slot.axis === 'x'
      ? world.addBox(slot.x, FLOOR_Y + h / 2, slot.z, slot.width, h, t, 'door')
      : world.addBox(slot.x, FLOOR_Y + h / 2, slot.z, t, h, slot.width, 'door');
    this.solid.blocksCamera = false;
    this.apply();
  }

  update(dt: number, nearDist: number) {
    const target = nearDist < 2.6 ? 1 : 0;
    this.open += (target - this.open) * Math.min(1, dt * 7);
    this.solid.enabled = this.open < 0.6;
    this.apply();
  }

  private apply() {
    const s = this.slot, half = s.width / 2, h = 2.55, y = FLOOR_Y + h / 2;
    const off = half / 2 + this.open * half * 0.95;
    if (s.axis === 'x') {
      this.left.setPosition(s.x - off, y, s.z);
      this.right.setPosition(s.x + off, y, s.z);
    } else {
      this.left.setPosition(s.x, y, s.z - off);
      this.right.setPosition(s.x, y, s.z + off);
    }
  }
}
