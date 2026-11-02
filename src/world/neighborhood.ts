import * as pc from 'playcanvas';
import { GeometryBuilder } from './builder';
import type { CollisionWorld } from './collision';
import type { Materials } from './materials';
import { buildBuilding, SlidingDoor, FLOOR_Y, CEIL_Y } from './building';
import { Props } from './props';
import { signTexture, stripeTexture, tapeTexture, laneTexture, windowTexture, paperTexture } from './signs';
import type { Assets } from '../core/assets';
import type { QualityPreset } from '../core/quality';
import { Vegetation } from './vegetation';

/**
 * "Harbor Street" — a compact, dense neighbourhood:
 *  - Main St (E–W) and Oak Ave (N–S) crossing at the origin
 *  - North side: Café Luna, the alley (crime scene), First Civic Bank, apartments
 *  - South side: Precinct 9 police station + parking lot, closed shopfronts
 *  - North-west: pocket park with the bus stop
 * +X = east, -Z = north. Units are metres.
 */

export interface WorldRefs {
  doors: SlidingDoor[];
  anchors: Record<string, pc.Vec3>;
  evidenceEntities: Record<string, pc.Entity>;
  cellDoor: pc.Entity;
  lights: pc.Entity[];
  interiors: { name: string; x0: number; x1: number; z0: number; z1: number }[];
}

const C = (r: number, g: number, b: number) => new pc.Color(r, g, b);

export function buildNeighborhood(app: pc.Application, root: pc.Entity, world: CollisionWorld, mats: Materials, assets: Assets, q: QualityPreset): WorldRefs {
  const device = app.graphicsDevice;
  const propsBatch = app.batcher.addGroup('props', false, 120).id;
  const props = new Props(assets, world, root);
  const anchors: Record<string, pc.Vec3> = {};
  const lights: pc.Entity[] = [];

  // ---------- Materials ----------
  const asphalt = mats.surface('asphalt', C(0.82, 0.82, 0.84));
  const sidewalk = mats.surface('sidewalk');
  const concrete = mats.surface('concrete', C(0.78, 0.77, 0.75));
  const grass = mats.surface('grass');
  const brickRed = mats.surface('brickRed');
  const brickDark = mats.surface('brickDark');
  const beige = mats.surface('beige');
  const stucco = mats.surface('stucco', C(0.95, 0.93, 0.88));
  const facade = mats.surface('facade');
  const woodFloor = mats.surface('woodFloor');
  const marble = mats.surface('marble');
  const tiles = mats.surface('tiles');
  const plaster = mats.surface('plaster', C(0.93, 0.9, 0.84));
  const plasterBlue = mats.surface('plaster', C(0.72, 0.78, 0.84), 'blue');
  const plasterGreen = mats.surface('plaster', C(0.62, 0.7, 0.62), 'green');
  const trimWhite = mats.flat('trimWhite', C(0.86, 0.84, 0.8), { gloss: 0.35 });
  const trimDark = mats.flat('trimDark', C(0.16, 0.17, 0.18), { gloss: 0.45, metal: 0.3 });
  const trimStone = mats.flat('trimStone', C(0.68, 0.65, 0.6), { gloss: 0.25 });
  const metalDark = mats.flat('metalDark', C(0.12, 0.13, 0.14), { gloss: 0.55, metal: 0.8 });
  const steel = mats.flat('steel', C(0.6, 0.62, 0.64), { gloss: 0.7, metal: 0.9 });
  const woodDark = mats.flat('woodDark', C(0.28, 0.17, 0.1), { gloss: 0.45 });
  const counterTop = mats.flat('counterTop', C(0.18, 0.18, 0.19), { gloss: 0.75 });
  const curbMat = mats.flat('curb', C(0.62, 0.61, 0.58), { gloss: 0.2 });
  const glass = mats.glass();
  const roofMat = mats.flat('roof', C(0.32, 0.32, 0.33), { gloss: 0.15 });
  const plinthMat = mats.surface('concrete', C(0.66, 0.64, 0.6), 'plinth');
  const glassDark = mats.glass('dark', C(0.25, 0.3, 0.34));
  const whitePaint = mats.flat('whitePaint', C(0.92, 0.92, 0.88), { gloss: 0.3 });
  const yellowPaint = mats.flat('yellowPaint', C(0.95, 0.75, 0.15), { gloss: 0.3 });
  const warmLight = mats.flat('warmLight', C(1, 0.9, 0.7), { emissive: C(1, 0.82, 0.55), emissiveIntensity: 3 });
  const coolLight = mats.flat('coolLight', C(0.9, 0.95, 1), { emissive: C(0.9, 0.95, 1), emissiveIntensity: 2.6 });
  const dumpsterGreen = mats.flat('dumpster', C(0.12, 0.3, 0.2), { gloss: 0.35, metal: 0.4 });
  const winTex = windowTexture(device);
  const upperWin = mats.textured('upperWin', winTex, { gloss: 0.9 });

  const b = new GeometryBuilder(device, world);

  // ---------- Ground ----------
  const WX0 = -64, WX1 = 74, WZ0 = -40, WZ1 = 38;
  b.box(concrete, (WX0 + WX1) / 2, -0.25, (WZ0 + WZ1) / 2, WX1 - WX0, 0.5, WZ1 - WZ0, { collide: false, texScale: 4, castShadows: false });
  // Roads (slightly above ground to avoid z-fighting)
  b.box(asphalt, 5, 0.005, 0, 138, 0.01, 10, { collide: false, texScale: 5, castShadows: false, skip: ['bottom'] });
  b.box(asphalt, 0, 0.006, -22.5, 10, 0.01, 35, { collide: false, texScale: 5, castShadows: false, skip: ['bottom'] });
  b.box(asphalt, 0, 0.006, 21.5, 10, 0.01, 33, { collide: false, texScale: 5, castShadows: false, skip: ['bottom'] });
  // Station parking lot
  b.box(asphalt, 48, 0.006, 21, 22, 0.01, 24, { collide: false, texScale: 5, castShadows: false, skip: ['bottom'] });

  // Sidewalks: [x0,x1,z0,z1]
  const walks: [number, number, number, number][] = [
    [WX0, -5, -9, -5], [5, WX1, -9, -5], // north of Main
    [WX0, -5, 5, 9], [5, 37, 5, 9], [59, WX1, 5, 9], // south of Main (gap at lot entrance)
    [-9, -5, WZ0, -9], [5, 9, WZ0, -9], // Oak north
    [-9, -5, 9, WZ1], [5, 9, 9, WZ1], // Oak south
  ];
  for (const [x0, x1, z0, z1] of walks) {
    b.box(sidewalk, (x0 + x1) / 2, FLOOR_Y / 2, (z0 + z1) / 2, x1 - x0, FLOOR_Y, z1 - z0, { collide: false, texScale: 2.5, castShadows: false });
    world.addFloor(x0, x1, z0, z1, FLOOR_Y);
  }
  // Lot entrance apron
  b.box(concrete, 48, 0.07, 7, 22, 0.14, 4, { collide: false, castShadows: false });
  // Curbs along the road edges
  const curb = (x0: number, x1: number, z: number) => b.box(curbMat, (x0 + x1) / 2, FLOOR_Y / 2 + 0.01, z, x1 - x0, FLOOR_Y + 0.02, 0.18, { collide: false, castShadows: false });
  const curbZ = (z0: number, z1: number, x: number) => b.box(curbMat, x, FLOOR_Y / 2 + 0.01, (z0 + z1) / 2, 0.18, FLOOR_Y + 0.02, z1 - z0, { collide: false, castShadows: false });
  curb(WX0, -5, -5); curb(5, WX1, -5); curb(WX0, -5, 5); curb(5, 37, 5); curb(59, WX1, 5);
  curbZ(WZ0, -5, -5); curbZ(WZ0, -5, 5); curbZ(5, WZ1, -5); curbZ(5, WZ1, 5);

  // Everything outside streets behind buildings sits at curb height too (lots/back areas)
  world.addFloor(-60, -9, -36, -9, FLOOR_Y); // park block
  world.addFloor(9, 72, -36, -9, FLOOR_Y); // north-east block (alley etc.)
  world.addFloor(-60, -9, 9, 34, FLOOR_Y);
  world.addFloor(9, 37, 9, 34, FLOOR_Y);
  b.box(concrete, -34.5, FLOOR_Y / 2, -22.5, 51, FLOOR_Y, 27, { collide: false, castShadows: false, skip: ['bottom'] });
  b.box(concrete, 40.5, FLOOR_Y / 2, -22.5, 63, FLOOR_Y, 27, { collide: false, castShadows: false, skip: ['bottom'] });
  b.box(concrete, -34.5, FLOOR_Y / 2, 21.5, 51, FLOOR_Y, 25, { collide: false, castShadows: false, skip: ['bottom'] });
  b.box(concrete, 23, FLOOR_Y / 2, 21.5, 28, FLOOR_Y, 25, { collide: false, castShadows: false, skip: ['bottom'] });

  // Park lawn (raised planter-style)
  b.box(grass, -26, FLOOR_Y + 0.05, -20, 28, 0.1, 16, { collide: false, texScale: 3, castShadows: false });
  world.addFloor(-40, -12, -28, -12, FLOOR_Y + 0.1);
  b.box(trimStone, -26, FLOOR_Y + 0.08, -11.9, 28.4, 0.16, 0.25, { collide: false });
  b.box(trimStone, -26, FLOOR_Y + 0.08, -28.1, 28.4, 0.16, 0.25, { collide: false });
  b.box(trimStone, -40.1, FLOOR_Y + 0.08, -20, 0.25, 0.16, 16.4, { collide: false });
  b.box(trimStone, -11.9, FLOOR_Y + 0.08, -20, 0.25, 0.16, 16.4, { collide: false });
  // park path
  b.box(sidewalk, -26, FLOOR_Y + 0.11, -20, 2.4, 0.02, 16, { collide: false, castShadows: false });

  // ---------- Road markings ----------
  const laneMat = mats.textured('lane', laneTexture(device), { alpha: true, gloss: 0.4 });
  for (let x = WX0 + 2; x < WX1 - 2; x += 6) {
    if (Math.abs(x) < 8) continue;
    b.quad(laneMat, new pc.Vec3(x, 0.012, 0), 'top', 3, 0.16, [0, 0, 1, 1]);
  }
  for (let z = WZ0 + 2; z < WZ1 - 2; z += 6) {
    if (Math.abs(z) < 8) continue;
    b.quad(laneMat, new pc.Vec3(0, 0.013, z), 'top', 0.16, 3, [0, 0, 1, 1]);
  }
  // Crosswalks
  const zebra = (cx: number, cz: number, alongX: boolean) => {
    for (let i = -4; i <= 4; i++) {
      if (alongX) b.box(whitePaint, cx + i * 1.05, 0.014, cz, 0.55, 0.008, 3, { collide: false, castShadows: false, skip: ['bottom'] });
      else b.box(whitePaint, cx, 0.014, cz + i * 1.05, 3, 0.008, 0.55, { collide: false, castShadows: false, skip: ['bottom'] });
    }
  };
  zebra(0, -7, true); zebra(0, 7, true); zebra(-7, 0, false); zebra(7, 0, false);
  // Stop lines
  b.box(whitePaint, -2.5, 0.014, -9.2, 5, 0.008, 0.35, { collide: false, castShadows: false, skip: ['bottom'] });
  b.box(whitePaint, 2.5, 0.014, 9.2, 5, 0.008, 0.35, { collide: false, castShadows: false, skip: ['bottom'] });
  // Parking bays
  for (let i = 0; i < 6; i++) b.box(whitePaint, 39 + i * 3.4, 0.014, 26, 0.12, 0.008, 5.2, { collide: false, castShadows: false, skip: ['bottom'] });
  b.box(yellowPaint, 47.5, 0.014, 14.5, 17, 0.008, 0.12, { collide: false, castShadows: false, skip: ['bottom'] });

  // ---------- Buildings ----------
  const doorSlots: ReturnType<typeof buildBuilding> = [];
  const interiors: WorldRefs['interiors'] = [];

  // Café Luna
  doorSlots.push(...buildBuilding(b, {
    name: 'cafe', x0: 11, x1: 25, z0: -21, z1: -9, front: 's', height: 8.2,
    ext: brickRed, trim: trimWhite, glass, upperWindow: upperWin,
    openings: [{ at: 13.6, width: 3.2, kind: 'window' }, { at: 18, width: 2, kind: 'door' }, { at: 22.2, width: 4, kind: 'window' }],
    sideDoor: { wall: 'e', at: -17, width: 1.6 },
    interior: { floor: woodFloor, wall: plasterGreen, ceiling: plaster },
  }, world, roofMat, plinthMat));
  interiors.push({ name: 'Café Luna', x0: 11, x1: 25, z0: -21, z1: -9 });

  // First Civic Bank
  doorSlots.push(...buildBuilding(b, {
    name: 'bank', x0: 30, x1: 48, z0: -23, z1: -9, front: 's', height: 11.5,
    ext: stucco, trim: trimStone, glass, upperWindow: upperWin, windowSpacing: 3.6,
    openings: [{ at: 33.2, width: 2.6, kind: 'window' }, { at: 39, width: 2.2, kind: 'door' }, { at: 44.8, width: 2.6, kind: 'window' }],
    interior: { floor: marble, wall: beige, ceiling: plaster },
  }, world, roofMat, plinthMat));
  interiors.push({ name: 'First Civic Bank', x0: 30, x1: 48, z0: -23, z1: -9 });
  // Bank columns
  for (const x of [31.2, 36.6, 41.4, 46.8]) {
    b.box(trimStone, x, 2.2, -8.75, 0.7, 4.3, 0.5, { texScale: 2 });
  }
  b.box(trimStone, 39, 4.55, -8.7, 18.4, 0.6, 0.6, { collide: false });

  // Precinct 9 police station
  doorSlots.push(...buildBuilding(b, {
    name: 'station', x0: 11, x1: 37, z0: 9, z1: 25, front: 'n', height: 8.6,
    ext: facade, trim: trimDark, glass, upperWindow: upperWin, windowSpacing: 3.4,
    openings: [{ at: 14.5, width: 3, kind: 'window' }, { at: 19.5, width: 3, kind: 'window' }, { at: 24, width: 2.4, kind: 'door' }, { at: 28.5, width: 3, kind: 'window' }, { at: 33.5, width: 3, kind: 'window' }],
    sideDoor: { wall: 'e', at: 21, width: 1.8 },
    interior: { floor: tiles, wall: plasterBlue, ceiling: plaster },
  }, world, roofMat, plinthMat));
  interiors.push({ name: 'Precinct 9', x0: 11, x1: 37, z0: 9, z1: 25 });
  // Station entrance canopy + steps
  b.box(trimDark, 24, 3.3, 7.9, 6, 0.2, 2.4, { collide: false });
  for (const x of [21.3, 26.7]) b.box(metalDark, x, 1.7, 6.9, 0.16, 3.2, 0.16, { texScale: 2 });

  // Facade-only neighbours (closed; honest "Closed" interactions are added in gameplay)
  buildBuilding(b, { name: 'apt-ne', x0: 48.5, x1: 64, z0: -26, z1: -9, front: 's', height: 13.5, ext: brickDark, trim: trimWhite, glass: glassDark, upperWindow: upperWin,
    openings: [{ at: 51, width: 2.6, kind: 'window' }, { at: 55, width: 1.6, kind: 'door' }, { at: 59.5, width: 3.4, kind: 'window' }] }, world, roofMat, plinthMat);
  buildBuilding(b, { name: 'apt-ne2', x0: 64, x1: 72, z0: -26, z1: -9, front: 's', height: 10, ext: beige, trim: trimStone, glass: glassDark, upperWindow: upperWin,
    openings: [{ at: 68, width: 3, kind: 'window' }] }, world, roofMat, plinthMat);
  buildBuilding(b, { name: 'shops-sw1', x0: -30, x1: -9, z0: 9, z1: 22, front: 'n', height: 9.5, ext: brickRed, trim: trimDark, glass: glassDark, upperWindow: upperWin,
    openings: [{ at: -26, width: 3.4, kind: 'window' }, { at: -22.5, width: 1.8, kind: 'door' }, { at: -17, width: 4, kind: 'window' }, { at: -12, width: 3, kind: 'window' }] }, world, roofMat, plinthMat);
  buildBuilding(b, { name: 'shops-sw2', x0: -48, x1: -30, z0: 9, z1: 24, front: 'n', height: 12, ext: stucco, trim: trimStone, glass: glassDark, upperWindow: upperWin,
    openings: [{ at: -44, width: 4, kind: 'window' }, { at: -39, width: 1.8, kind: 'door' }, { at: -34, width: 4, kind: 'window' }] }, world, roofMat, plinthMat);
  buildBuilding(b, { name: 'apt-sw3', x0: -62, x1: -48, z0: 9, z1: 26, front: 'n', height: 14.5, ext: brickDark, trim: trimWhite, glass: glassDark, upperWindow: upperWin,
    openings: [{ at: -55, width: 3, kind: 'window' }] }, world, roofMat, plinthMat);
  buildBuilding(b, { name: 'apt-nw', x0: -62, x1: -42, z0: -26, z1: -9, front: 's', height: 13, ext: brickRed, trim: trimStone, glass: glassDark, upperWindow: upperWin,
    openings: [{ at: -57, width: 3, kind: 'window' }, { at: -52, width: 1.8, kind: 'door' }, { at: -47, width: 3.2, kind: 'window' }] }, world, roofMat, plinthMat);
  buildBuilding(b, { name: 'apt-se', x0: 59, x1: 72, z0: 9, z1: 26, front: 'n', height: 12.5, ext: beige, trim: trimDark, glass: glassDark, upperWindow: upperWin,
    openings: [{ at: 62.5, width: 3, kind: 'window' }, { at: 68.5, width: 3, kind: 'window' }] }, world, roofMat, plinthMat);

  // Backdrop silhouettes beyond the playable edge so the horizon isn't empty
  const backdrop: [number, number, number, number, number, pc.Material][] = [
    [-30, -48, 30, 6, 16, brickDark], [10, -46, 30, 6, 19, beige], [45, -46, 30, 6, 15, brickRed], [-50, -46, 20, 6, 21, stucco],
    [-30, 46, 30, 6, 15, beige], [10, 46, 30, 6, 13, brickRed], [45, 46, 30, 6, 18, brickDark], [-55, 46, 20, 6, 12, stucco],
    [82, 0, 6, 70, 16, brickRed], [-72, 0, 6, 70, 14, beige],
  ];
  for (const [x, z, w, d, h, m] of backdrop) {
    b.box(m, x, h / 2, z, w, h, d, { collide: false, texScale: 4 });
  }

  // Boundary: walls/fences that close the playable area
  const fenceMat = metalDark;
  const wallAt = (x: number, z: number, w: number, d: number, h = 2.4, m: pc.Material = brickDark) => b.box(m, x, h / 2, z, w, h, d, { texScale: 3 });
  wallAt(40, -36, 64, 0.4, 2.8); wallAt(-35, -36, 54, 0.4, 2.8); // north back fence
  wallAt(22, 34, 30, 0.4, 2.4); wallAt(-35, 34, 54, 0.4, 2.4);
  // road-end barriers (visual + collision)
  const barrier = (x: number, z: number, alongX: boolean) => {
    for (let i = -2; i <= 2; i++) {
      const bx = alongX ? x + i * 2 : x, bz = alongX ? z : z + i * 2;
      b.box(whitePaint, bx, 0.55, bz, alongX ? 1.8 : 0.4, 1.1, alongX ? 0.4 : 1.8, { texScale: 1 });
      b.box(mats.flat('barrierRed', C(0.75, 0.12, 0.08)), bx, 0.85, bz, alongX ? 1.82 : 0.42, 0.18, alongX ? 0.42 : 1.82, { collide: false });
    }
  };
  barrier(WX0 + 1, 0, false); barrier(WX1 - 1, 0, false); barrier(0, WZ0 + 1, true); barrier(0, WZ1 - 1, true);
  world.addBox(WX0 - 1, 3, 0, 2, 6, 200); world.addBox(WX1 + 1, 3, 0, 2, 6, 200);
  world.addBox(0, 3, WZ0 - 1, 200, 6, 2); world.addBox(0, 3, WZ1 + 1, 200, 6, 2);
  // Lot fence (east side)
  b.box(fenceMat, 59, 0.9, 21, 0.08, 1.8, 24, { texScale: 2 });
  b.box(fenceMat, 48, 0.9, 33, 22, 1.8, 0.08, { texScale: 2 });

  // ---------- Café details ----------
  const cafeSign = mats.textured('signCafe', signTexture(device, 'Café Luna', { bg: '#1d2a24', fg: '#f3e6c4', sub: 'COFFEE · PASTRY · SINCE 1987', font: 'Georgia, serif', border: '#c9a45c' }), { emissive: true });
  b.quad(cafeSign, new pc.Vec3(18, 4.9, -8.83), 'pz', 6, 1.5);
  const awning = mats.textured('awning', stripeTexture(device, '#2f5a46', '#efe6cf'), { gloss: 0.15 });
  // awning: sloped slab approximated with a thin box + valance
  b.box(awning, 18, 3.55, -7.9, 13.6, 0.08, 2.2, { collide: false, texScale: 1.7 });
  b.box(awning, 18, 3.32, -6.82, 13.6, 0.42, 0.04, { collide: false, texScale: 1.7 });
  // counter + back bar
  b.box(woodDark, 16.5, FLOOR_Y + 0.52, -18.2, 8, 1.04, 0.8, { texScale: 2 });
  b.box(counterTop, 16.5, FLOOR_Y + 1.06, -18.2, 8.2, 0.06, 0.95, { collide: false });
  b.box(woodDark, 16.5, FLOOR_Y + 1.1, -20.45, 9, 2.2, 0.5, { texScale: 2 });
  b.box(steel, 14.2, FLOOR_Y + 1.45, -18.25, 0.7, 0.75, 0.55, { collide: false }); // espresso machine
  b.box(mats.flat('espressoTrim', C(0.5, 0.1, 0.08), { gloss: 0.7 }), 14.2, FLOOR_Y + 1.85, -18.25, 0.72, 0.08, 0.57, { collide: false });
  b.box(glass, 18.8, FLOOR_Y + 1.32, -18.1, 1.6, 0.5, 0.6, { collide: false, castShadows: false }); // pastry case
  for (const x of [12.6, 15.6, 18.6]) b.box(woodDark, x, FLOOR_Y + 2.6, -20.6, 2.4, 0.06, 0.32, { collide: false }); // shelves
  const menuBoard = mats.textured('cafeMenu', paperTexture(device, ['ESPRESSO ....... 3', 'FLAT WHITE ..... 4', 'CROISSANT ...... 3', 'SOUP OF DAY .... 6']), {});
  b.quad(menuBoard, new pc.Vec3(21.6, FLOOR_Y + 2.5, -20.68), 'pz', 2.2, 1.65);
  // pendant lights
  for (const x of [14, 18, 22]) {
    b.box(metalDark, x, CEIL_Y - 0.45, -15, 0.02, 0.9, 0.02, { collide: false, castShadows: false });
    b.box(warmLight, x, CEIL_Y - 0.95, -15, 0.38, 0.22, 0.38, { collide: false, castShadows: false });
  }
  anchors.cafeCounter = new pc.Vec3(16.5, FLOOR_Y, -17.2);
  anchors.rosa = new pc.Vec3(16.6, FLOOR_Y, -19.4);
  anchors.cafeSideDoor = new pc.Vec3(25.6, FLOOR_Y, -17);
  anchors.cafeDoor = new pc.Vec3(18, FLOOR_Y, -7.5);

  // ---------- Alley (crime scene) ----------
  b.box(dumpsterGreen, 28.2, FLOOR_Y + 0.65, -25.5, 1.9, 1.3, 1.1, { texScale: 2 });
  b.box(mats.flat('dumpsterLid', C(0.08, 0.2, 0.13), { gloss: 0.5 }), 28.2, FLOOR_Y + 1.33, -25.6, 2, 0.08, 1.25, { collide: false });
  // drainage strip & puddle
  b.box(mats.flat('puddle', C(0.08, 0.09, 0.1), { gloss: 0.95, metal: 0.2 }), 27.4, FLOOR_Y + 0.004, -14.5, 1.4, 0.006, 2.6, { collide: false, castShadows: false });
  const tape = mats.textured('tape', tapeTexture(device), { gloss: 0.3 });
  // tape across the alley mouth (walk-under; no collision)
  for (const [y, z] of [[1.05, -9.8]] as const) {
    b.box(tape, 27.5, y, z, 5, 0.12, 0.01, { collide: false, castShadows: false, texScale: 2.5 });
  }
  b.box(metalDark, 25.2, 0.6, -9.8, 0.06, 1.2, 0.06, { collide: false });
  b.box(metalDark, 29.8, 0.6, -9.8, 0.06, 1.2, 0.06, { collide: false });
  anchors.alleyMouth = new pc.Vec3(27.5, FLOOR_Y, -10.5);
  anchors.alleyDeep = new pc.Vec3(27.5, FLOOR_Y, -28);
  anchors.bankCamera = new pc.Vec3(30.05, 3.6, -13);

  // ---------- Bank details ----------
  const bankSign = mats.textured('signBank', signTexture(device, 'FIRST CIVIC BANK', { bg: '#20262c', fg: '#e8dcc0', font: 'Georgia, serif', weight: '600', border: '#b8a26a' }), { emissive: true });
  b.quad(bankSign, new pc.Vec3(39, 5.35, -8.38), 'pz', 9, 1.1);
  // teller counter with glass partition and a gate gap at x 45.4..46.6
  b.box(woodDark, 37.6, FLOOR_Y + 0.55, -17.5, 14.6, 1.1, 0.7, { texScale: 2 });
  b.box(counterTop, 37.6, FLOOR_Y + 1.12, -17.5, 14.8, 0.06, 0.8, { collide: false });
  b.box(glass, 37.6, FLOOR_Y + 1.85, -17.6, 14.6, 1.4, 0.03, { collide: false, castShadows: false });
  b.box(woodDark, 47.2, FLOOR_Y + 0.55, -17.5, 1.0, 1.1, 0.7, { texScale: 2 });
  for (const x of [33, 37.6, 42.2]) b.box(steel, x, FLOOR_Y + 1.85, -17.6, 0.06, 1.4, 0.08, { collide: false });
  // vault door on back wall
  b.box(steel, 39, FLOOR_Y + 1.4, -22.66, 2.4, 2.4, 0.08, { collide: false });
  b.box(metalDark, 39, FLOOR_Y + 1.4, -22.6, 0.9, 0.9, 0.08, { collide: false });
  // ceiling lights
  for (const x of [33, 39, 45]) for (const z of [-12.5, -19.5]) b.box(coolLight, x, CEIL_Y - 0.02, z, 1.6, 0.04, 0.6, { collide: false, castShadows: false });
  // waiting rope posts
  for (const x of [35, 37, 39]) b.box(steel, x, FLOOR_Y + 0.5, -13.5, 0.08, 1, 0.08, { collide: false });
  b.box(mats.flat('rope', C(0.45, 0.05, 0.06), { gloss: 0.3 }), 37, FLOOR_Y + 0.9, -13.5, 4, 0.05, 0.05, { collide: false });
  anchors.nina = new pc.Vec3(40.4, FLOOR_Y, -18.3);
  anchors.bankCounter = new pc.Vec3(40.4, FLOOR_Y, -16.4);
  anchors.footage = new pc.Vec3(46.6, FLOOR_Y, -21.4);

  // ---------- Station details ----------
  const stationSign = mats.textured('signStation', signTexture(device, 'PRECINCT 9', { bg: '#111418', fg: '#f2f2f2', sub: 'HARBOR CITY POLICE DEPARTMENT', font: 'Inter, Helvetica, sans-serif', border: '#2a5bd7' }), { emissive: true });
  b.quad(stationSign, new pc.Vec3(24, 4.85, 8.86), 'nz', 7, 1.4);
  // booking desk (front counter)
  b.box(woodDark, 24, FLOOR_Y + 0.6, 14.2, 8, 1.2, 0.8, { texScale: 2 });
  b.box(counterTop, 24, FLOOR_Y + 1.22, 14.2, 8.2, 0.06, 0.9, { collide: false });
  b.box(mats.flat('stationBlue', C(0.1, 0.22, 0.5), { gloss: 0.4 }), 24, FLOOR_Y + 0.6, 13.78, 8, 0.25, 0.02, { collide: false });
  // half wall separating lobby from offices (gap at x 29..31)
  b.box(plasterBlue, 20.5, FLOOR_Y + 0.6, 17.5, 19, 1.2, 0.2);
  b.box(plasterBlue, 34.5, FLOOR_Y + 0.6, 17.5, 4.4, 1.2, 0.2);
  b.box(counterTop, 20.5, FLOOR_Y + 1.22, 17.5, 19.1, 0.05, 0.28, { collide: false });
  // holding cell (back-right) with bars
  const cellX0 = 30.5, cellX1 = 36.7, cellZ0 = 19.8, cellZ1 = 24.7;
  for (let x = cellX0 + 0.15; x < cellX1; x += 0.22) {
    if (x > 32.6 && x < 34.2) continue; // cell door gap
    b.box(steel, x, FLOOR_Y + 1.5, cellZ0, 0.04, 3, 0.04, { collide: false, castShadows: true });
  }
  world.addBox((cellX0 + 32.6) / 2, 1.6, cellZ0, 32.6 - cellX0, 3.2, 0.12).blocksCamera = false;
  world.addBox((34.2 + cellX1) / 2, 1.6, cellZ0, cellX1 - 34.2, 3.2, 0.12).blocksCamera = false;
  b.box(steel, (cellX0 + cellX1) / 2, FLOOR_Y + 3.05, cellZ0, cellX1 - cellX0, 0.08, 0.08, { collide: false });
  b.box(steel, cellX0, FLOOR_Y + 1.5, (cellZ0 + cellZ1) / 2, 0.08, 3, cellZ1 - cellZ0);
  b.box(woodDark, 35.6, FLOOR_Y + 0.25, 23.2, 1.8, 0.5, 2.4, { texScale: 2 }); // cell bench
  // cell door (dynamic)
  const cellDoor = new pc.Entity('cellDoor');
  for (let i = 0; i < 7; i++) {
    const bar = new pc.Entity('bar');
    bar.addComponent('render', { type: 'box', material: steel });
    bar.setLocalPosition(-0.7 + i * 0.233, 0, 0);
    bar.setLocalScale(0.04, 3, 0.04);
    cellDoor.addChild(bar);
  }
  root.addChild(cellDoor);
  cellDoor.setPosition(33.4, FLOOR_Y + 1.5, cellZ0);
  const cellSolid = world.addBox(33.4, 1.6, cellZ0, 1.6, 3.2, 0.12, 'cellDoor');
  cellSolid.blocksCamera = false;
  (cellDoor as any).__solid = cellSolid;
  // offices
  for (const x of [13.6, 18.4]) b.box(coolLight, x + 1, CEIL_Y - 0.02, 21, 1.6, 0.04, 0.6, { collide: false, castShadows: false });
  for (const x of [16, 24, 32]) b.box(coolLight, x, CEIL_Y - 0.02, 12.5, 1.6, 0.04, 0.6, { collide: false, castShadows: false });
  const board = mats.textured('caseBoard', paperTexture(device, ['CASE 9-114  CAFE LUNA', 'ROBBERY  ~5:40 PM', 'VICTIM: R. ALVAREZ', 'LEADS: ?']), {});
  b.box(woodDark, 12.0, FLOOR_Y + 1.9, 21.8, 0.08, 1.7, 2.4, { collide: false });
  b.quad(board, new pc.Vec3(12.06, FLOOR_Y + 1.9, 21.8), 'px', 2.2, 1.6);
  anchors.sergeant = new pc.Vec3(24, FLOOR_Y, 15.05);
  anchors.booking = new pc.Vec3(24, FLOOR_Y, 12.9);
  anchors.cellInside = new pc.Vec3(34.8, FLOOR_Y, 22.4);
  anchors.cellDoorFront = new pc.Vec3(33.4, FLOOR_Y, 18.6);
  anchors.desk = new pc.Vec3(15.5, FLOOR_Y, 20.0);
  anchors.caseBoard = new pc.Vec3(12.8, FLOOR_Y, 21.8);
  anchors.stationDoor = new pc.Vec3(24, FLOOR_Y, 7.6);
  anchors.stationSpawn = new pc.Vec3(24, FLOOR_Y, 4.0);
  anchors.policeCar = new pc.Vec3(41, 0, 24);

  // Closed shop signage
  const shopSign = (text: string, sub: string, x: number, z: number, n: 'pz' | 'nz', w: number, bg: string) => {
    const m = mats.textured(`sign:${text}`, signTexture(device, text, { bg, fg: '#f4efe4', sub, font: 'Georgia, serif' }), { emissive: true });
    b.quad(m, new pc.Vec3(x, 4.7, z), n, w, w / 4);
  };
  shopSign('Marlowe Hardware', 'TOOLS · KEYS · PAINT', -19.5, 8.84, 'nz', 7, '#3a2a1c');
  shopSign('Suds Laundromat', 'OPEN 24 HOURS', -39, 8.84, 'nz', 6, '#1c3a4a');
  shopSign('Harbor Flats', 'APARTMENTS', 55, -8.84, 'pz', 5, '#2a2a2a');
  shopSign('Pearl Apartments', '', -52, -8.84, 'pz', 5, '#352a3a');
  anchors.hardwareDoor = new pc.Vec3(-22.5, FLOOR_Y, 7.6);
  anchors.laundryDoor = new pc.Vec3(-39, FLOOR_Y, 7.6);
  anchors.flatsDoor = new pc.Vec3(55, FLOOR_Y, -7.6);
  anchors.pearlDoor = new pc.Vec3(-52, FLOOR_Y, -7.6);

  // Bus stop shelter (north sidewalk by the park)
  const bx = -20, bz = -8.2;
  b.box(metalDark, bx - 2, 1.3, bz - 0.6, 0.08, 2.6, 0.08, { collide: false });
  b.box(metalDark, bx + 2, 1.3, bz - 0.6, 0.08, 2.6, 0.08, { collide: false });
  b.box(glass, bx, 1.4, bz - 0.62, 4, 2, 0.03, { castShadows: false, blocksCamera: false });
  b.box(metalDark, bx, 2.65, bz + 0.1, 4.4, 0.1, 1.7, { collide: false });
  const busSign = mats.textured('busSign', signTexture(device, 'BUS 14', { bg: '#1b4d8c', fg: '#ffffff', sub: 'HARBOR LOOP', width: 512, height: 256, font: 'Inter, Helvetica, sans-serif' }), { emissive: true });
  b.box(metalDark, bx + 2.6, 1.5, bz + 0.3, 0.08, 3, 0.08, { collide: false });
  b.quad(busSign, new pc.Vec3(bx + 2.6, 2.7, bz + 0.35), 'pz', 0.9, 0.45);
  anchors.busStop = new pc.Vec3(bx, FLOOR_Y, bz + 0.1);
  anchors.parkBench = new pc.Vec3(-26, FLOOR_Y + 0.1, -24);
  anchors.parkTrash = new pc.Vec3(-13.6, FLOOR_Y + 0.1, -13.2);

  // Street lamps (procedural poles with Poly Haven lamp heads)
  const lampSpots: [number, number, number][] = [
    [-50, -9.6, 180], [-34, -9.6, 180], [-12, -9.6, 180], [12, -9.6, 180], [32, -9.6, 180], [52, -9.6, 180], [66, -9.6, 180],
    [-44, 9.6, 0], [-26, 9.6, 0], [-10, 9.6, 0], [10, 9.6, 0], [38, 9.6, 0], [64, 9.6, 0],
    [-9.6, -22, 90], [9.6, -26, -90], [-9.6, 22, 90], [9.6, 28, -90],
  ];
  for (const [x, z] of lampSpots) {
    b.box(metalDark, x, 2.4, z, 0.14, 4.8, 0.14, { texScale: 2, collide: true, blocksCamera: false });
    b.box(metalDark, x, 0.25, z, 0.3, 0.5, 0.3, { collide: false });
  }

  // ---------- Merge static geometry ----------
  b.build('static-world', root);

  // ---------- GLB props ----------
  for (const [x, z, yaw] of lampSpots) {
    props.place('street_lamp_02', x, z, { yaw: yaw + 180, y: 3.55, targetHeight: 1.25, batch: propsBatch, castShadows: false });
  }
  // café furniture
  const tables: [number, number][] = [[21.6, -12.2], [21.6, -15.4], [13.6, -12.5]];
  for (const [x, z] of tables) {
    props.place('round_wooden_table_02', x, z, { collide: true, batch: propsBatch });
    props.place('bar_chair_round_01', x - 0.9, z, { batch: propsBatch, targetHeight: 0.75 });
    props.place('bar_chair_round_01', x + 0.9, z, { batch: propsBatch, targetHeight: 0.75 });
  }
  props.place('CashRegister_01', 16.6, -18.25, { y: FLOOR_Y + 1.09, yaw: 180, targetHeight: 0.42 });
  props.place('croissant', 18.5, -18.1, { y: FLOOR_Y + 1.13, targetHeight: 0.06, castShadows: false });
  props.place('croissant', 18.9, -18.0, { y: FLOOR_Y + 1.13, yaw: 40, targetHeight: 0.06, castShadows: false });
  props.place('croissant', 19.2, -18.2, { y: FLOOR_Y + 1.13, yaw: 100, targetHeight: 0.06, castShadows: false });
  props.place('potted_plant_04', 11.8, -9.8, { targetHeight: 1.1, batch: propsBatch });
  props.place('potted_plant_04', 24.2, -20.2, { targetHeight: 1.3, batch: propsBatch });
  props.place('standing_chalkboard_01', 15.2, -7.6, { yaw: 160, targetHeight: 1.1, collide: true });
  props.place('hanging_picture_frame_01', 11.32, -15.5, { y: FLOOR_Y + 1.6, yaw: 90, targetHeight: 0.8, castShadows: false });
  props.place('wall_clock', 20.5, -20.73, { y: FLOOR_Y + 3.2, targetHeight: 0.4, castShadows: false });
  // sidewalk café tables
  for (const x of [13, 22.5]) {
    props.place('round_wooden_table_02', x, -7.0, { collide: true, batch: propsBatch });
    props.place('plastic_monobloc_chair_01', x - 0.8, -7.0, { yaw: 90, batch: propsBatch, targetHeight: 0.86 });
    props.place('plastic_monobloc_chair_01', x + 0.8, -7.0, { yaw: -90, batch: propsBatch, targetHeight: 0.86 });
  }
  // alley clutter
  props.place('trashbag', 29.2, -27.4, { batch: propsBatch });
  props.place('trashbag', 26.0, -26.6, { yaw: 60, batch: propsBatch });
  props.place('cardboard_box_01', 26.0, -24.0, { yaw: 20, targetHeight: 0.55, collide: true, batch: propsBatch });
  props.place('cardboard_box_01', 26.2, -23.2, { yaw: -15, targetHeight: 0.45, batch: propsBatch });
  props.place('wooden_crate_01', 29.3, -21.0, { yaw: 90, collide: true, batch: propsBatch });
  props.place('exterior_aircon_unit', 29.6, -18.5, { yaw: -90, y: 2.8, targetHeight: 0.85, keep: ['exterior_aircon_unit'], drop: ['rusted'] });
  props.place('exterior_aircon_unit', 25.4, -13.0, { yaw: 90, y: 3.1, targetHeight: 0.85, keep: ['exterior_aircon_unit'], drop: ['rusted'] });
  props.place('security_camera_01', 30.25, -13, { y: 3.4, yaw: -90, targetHeight: 0.28, castShadows: false });
  props.place('utility_box_01', 25.6, -30.5, { collide: true, targetHeight: 1.2 });
  // bank
  props.place('metal_office_desk', 46.6, -22.1, { collide: true, targetHeight: 0.78 });
  props.place('Television_01', 46.6, -22.15, { y: FLOOR_Y + 0.79, targetHeight: 0.45, castShadows: false });
  props.place('SchoolChair_01', 46.6, -21.2, { yaw: 180, targetHeight: 0.95 });
  props.place('Sofa_01', 33.5, -10.4, { yaw: 180, collide: true, targetHeight: 0.8 });
  props.place('potted_plant_04', 30.9, -9.9, { targetHeight: 1.3, batch: propsBatch });
  props.place('potted_plant_04', 47.1, -9.9, { targetHeight: 1.3, batch: propsBatch });
  props.place('wall_clock', 39, -22.6, { y: FLOOR_Y + 3.3, targetHeight: 0.5, castShadows: false });
  // station
  props.place('metal_office_desk', 15.5, 21.4, { collide: true, targetHeight: 0.78 });
  props.place('metal_office_desk', 21.5, 21.4, { collide: true, targetHeight: 0.78 });
  props.place('SchoolChair_01', 15.5, 20.6, { yaw: 180, targetHeight: 0.95 });
  props.place('SchoolChair_01', 21.5, 20.6, { yaw: 180, targetHeight: 0.95 });
  props.place('office_notepads', 15.3, 21.45, { y: FLOOR_Y + 0.79, targetHeight: 0.02, castShadows: false, scale: 0.6 });
  props.place('clipboard', 21.2, 21.4, { y: FLOOR_Y + 0.79, targetHeight: 0.03, castShadows: false });
  props.place('clipboard', 25, 14.3, { y: FLOOR_Y + 1.25, targetHeight: 0.03, castShadows: false, yaw: 15 });
  props.place('Television_01', 22.6, 14.35, { y: FLOOR_Y + 1.25, targetHeight: 0.42, yaw: 180, castShadows: false });
  props.place('steel_frame_shelves_01', 26.5, 24.3, { collide: true, targetHeight: 2.2, yaw: 180 });
  props.place('cardboard_box_01', 26.0, 24.2, { y: FLOOR_Y + 1.1, targetHeight: 0.35, castShadows: false });
  props.place('WetFloorSign_01', 27.5, 12.0, { targetHeight: 0.62, yaw: 30 });
  props.place('potted_plant_04', 11.8, 9.8, { targetHeight: 1.3, batch: propsBatch });
  props.place('wall_clock', 24, 24.66, { y: FLOOR_Y + 3.1, yaw: 180, targetHeight: 0.45, castShadows: false });
  // ---- environment detail pass (Poly Haven CC0) ----
  for (const [x, z, yaw] of [[-7.4, -13, 90], [36.5, 7.5, 0], [-27, -7.5, 180], [55, 7.5, 0], [7.4, 13, -90]] as [number, number, number][]) {
    props.place('fire_hydrant', x, z, { yaw, keep: ['fire_hydrant'], drop: ['aged'], targetHeight: 0.8, collide: true, batch: propsBatch });
  }
  // fire escapes on the apartment blocks (street side)
  props.place('modular_fire_escape', 57.5, -9.75, { yaw: 0, y: 2.6, scale: 1, castShadows: true });
  props.place('modular_fire_escape', -55, -9.75, { yaw: 0, y: 2.4, scale: 1, castShadows: true });
  props.place('modular_fire_escape', -56, 9.75, { yaw: 180, y: 2.6, scale: 1, castShadows: true });
  // roller shutters pulled down on the closed shopfronts
  props.place('rollershutter_door', -12, 8.85, { yaw: 180, y: FLOOR_Y + 0.85, keep: ['rollershutter_door'], drop: ['graffiti'], scale: 1.0 });
  props.place('rollershutter_door', -34, 8.85, { yaw: 180, y: FLOOR_Y + 0.85, keep: ['rollershutter_door_graffiti'], scale: 1.0 });
  props.place('rollershutter_door', 68, -8.85, { yaw: 0, y: FLOOR_Y + 0.85, keep: ['rollershutter_door'], drop: ['graffiti'], scale: 1.0 });
  // alley lighting + service boxes
  props.place('security_light', 25.2, -16, { yaw: 90, y: 3.2, castShadows: false });
  props.place('security_light', 29.85, -24, { yaw: -90, y: 3.2, castShadows: false });
  props.place('utility_box_02', 29.5, -29.5, { yaw: -90, collide: true });
  props.place('utility_box_02', 36.6, 33, { yaw: 180, collide: true });

  // street furniture
  props.place('modular_street_seating', -20, -8.0, { targetHeight: 0.9, collide: true, keep: ['crossbar', 'legs', 'seat', 'back_support', 'arm_rest'], scale: 0.9 });
  props.place('modular_street_seating', -26, -24.3, { targetHeight: 0.9, collide: true });
  props.place('modular_street_seating', -32, -15.8, { targetHeight: 0.9, collide: true, yaw: 180 });
  props.place('metal_trash_can', -13.6, -13.2, { keep: ['metal_trash_can'], drop: ['rust'], targetHeight: 0.9, collide: true });
  props.place('metal_trash_can', 9.8, -8.4, { keep: ['metal_trash_can'], drop: ['rust'], targetHeight: 0.9, collide: true, batch: propsBatch });
  props.place('metal_trash_can', 30.5, 8.4, { keep: ['metal_trash_can'], drop: ['rust'], targetHeight: 0.9, collide: true, batch: propsBatch });
  props.place('utility_box_01', 8.4, 8.4, { collide: true, targetHeight: 1.2, batch: propsBatch });
  props.place('planter_box_01', 36, -8.0, { scale: 1.8, collide: true, batch: propsBatch });
  props.place('planter_box_01', 42, -8.0, { scale: 1.8, collide: true, batch: propsBatch });
  props.place('water_manhole_cover', 12, 1.8, { y: 0.02, castShadows: false, scale: 1 });
  props.place('water_manhole_cover', -22, -2.5, { y: 0.02, castShadows: false, scale: 1 });
  for (const [x, z] of [[-35, -13.5], [-17, -26.5], [-38, -26]] as const) {
    props.place('shrub_03', x, z, { keep: ['shrub_03_a'], targetHeight: 0.9, batch: propsBatch, scale: 2.4 });
  }

  // ---------- Trees & hedges (bark trunks + CC0 leaf-scan foliage cards) ----------
  const veg = new Vegetation(app, assets, q);
  const treeSpots: [number, number, number][] = [
    [-34, -16, 1.0], [-19, -16, 0.9], [-30, -25, 1.1], [-15, -23, 0.95], [-38, -20, 0.85], [-23, -13.5, 0.8],
    [-45, -7.4, 0.75], [-30, -7.4, 0.8], [50, -7.4, 0.75], [62, -7.4, 0.8], [-50, 7.4, 0.75], [-34, 7.4, 0.8], [62, 7.4, 0.75],
    [7.4, -32, 0.8], [-7.4, 30, 0.75], [-7.4, -30, 0.8], [7.4, 18, 0.72],
  ];
  treeSpots.forEach(([x, z, s], i) => veg.tree(root, world, x, z, s, i));
  // tree pits on the sidewalk
  for (const [x, z] of treeSpots) if (Math.abs(z) < 9 || Math.abs(x) < 9) {
    const pit = new pc.Entity('pit');
    pit.addComponent('render', { type: 'box', material: mats.flat('pitSoil', C(0.17, 0.13, 0.1), { gloss: 0.05 }), castShadows: false });
    pit.setLocalScale(1.3, 0.02, 1.3); pit.setPosition(x, FLOOR_Y + 0.005, z); root.addChild(pit);
  }
  // park hedges around the lawn
  veg.hedge(root, -26, -12.4, 26, 0); veg.hedge(root, -26, -27.6, 26, 0);
  veg.hedge(root, -39.6, -20, 14, 90); veg.hedge(root, -12.4, -16.5, 6, 90); veg.hedge(root, -12.4, -24, 6, 90);

  // ---------- Evidence objects ----------
  const evidenceEntities: Record<string, pc.Entity> = {};
  evidenceEntities.cigpack = props.place('cigarette_pack', 28.7, -19.6, { yaw: 35, targetHeight: 0.09, castShadows: false });
  evidenceEntities.lighter = props.place('vintage_lighter', 26.2, -22.6, { yaw: 120, targetHeight: 0.07, castShadows: false });
  // deposit slip: paper quad
  const slip = new pc.Entity('deposit-slip');
  const slipMat = mats.textured('slip', paperTexture(device, ['DEPOSIT - CAFE LUNA', '$3,200.00', 'ACCT ****4471']), { gloss: 0.1 });
  slip.addComponent('render', { type: 'plane', material: slipMat, castShadows: false });
  slip.setLocalScale(0.22, 1, 0.16);
  slip.setPosition(27.1, FLOOR_Y + 0.006, -15.9);
  slip.setEulerAngles(0, 24, 0);
  root.addChild(slip);
  evidenceEntities.slip = slip;
  // stolen deposit bag (hidden in the park trash can until revealed)
  const bag = new pc.Entity('deposit-bag');
  bag.addComponent('render', { type: 'box', material: mats.flat('bagCanvas', C(0.2, 0.25, 0.32), { gloss: 0.2 }) });
  bag.setLocalScale(0.32, 0.12, 0.22);
  bag.setPosition(-13.6, FLOOR_Y + 1.02, -13.2);
  bag.enabled = false;
  root.addChild(bag);
  evidenceEntities.bag = bag;
  anchors.cigpack = new pc.Vec3(28.7, FLOOR_Y, -19.6);
  anchors.lighter = new pc.Vec3(26.2, FLOOR_Y, -22.6);
  anchors.slip = new pc.Vec3(27.1, FLOOR_Y, -15.9);

  // ---------- Doors ----------
  const frameMat = metalDark;
  const doors = doorSlots.map((s) => new SlidingDoor(root, s, glass, frameMat, world));

  // ---------- Lights ----------
  if (q.interiorLights) {
    const addLight = (x: number, y: number, z: number, color: pc.Color, range: number, intensity: number) => {
      const l = new pc.Entity('light');
      l.addComponent('light', { type: 'omni', color, range, intensity, castShadows: false, falloffMode: pc.LIGHTFALLOFF_INVERSESQUARED });
      l.setPosition(x, y, z);
      root.addChild(l);
      lights.push(l);
    };
    addLight(18, 3.2, -15, C(1, 0.8, 0.58), 11, 3.2);
    addLight(39, 3.4, -13, C(0.95, 0.97, 1), 12, 2.6);
    addLight(39, 3.4, -20, C(0.95, 0.97, 1), 10, 2.2);
    addLight(24, 3.4, 13, C(0.92, 0.96, 1), 13, 2.8);
    addLight(17, 3.4, 21, C(0.92, 0.96, 1), 10, 2.4);
    addLight(33.5, 3.2, 22.2, C(0.9, 0.95, 1), 7, 1.8);
  }

  return { doors, anchors, evidenceEntities, cellDoor, lights, interiors };
}
