import * as pc from 'playcanvas';
import type { NpcDef } from '../entities/npc';
import type { Props } from '../world/props';
import type { CollisionWorld } from '../world/collision';
import { FLOOR_Y } from '../world/building';

/**
 * Test encounter — "Back Lot on Oak Ave".
 * Two armed men and an unarmed lookout are fencing stolen goods in the lot behind
 * Marlowe Hardware. The player can approach carefully and force a surrender,
 * fight them, or make a mess of it. Every outcome is tracked.
 */
export const ENCOUNTER_ZONE = { x0: -48, x1: -9, z0: 22.5, z1: 33.5 };

export const ENCOUNTER_NPCS: NpcDef[] = [
  { id: 'thug1', name: 'Ray Kessler', role: 'Armed suspect', look: { body: 'm', outfit: 'thug1', avatar: 'Male_Adult_09' },
    home: [-22.5, 27.8, 90], stationary: true, kind: 'hostile', armed: 'pistol', courage: 0.55, accuracy: 0.45 },
  { id: 'thug2', name: 'Andre Voss', role: 'Armed suspect', look: { body: 'm', outfit: 'thug2', avatar: 'Male_Adult_20' },
    home: [-27, 30.6, 110], stationary: true, kind: 'hostile', armed: 'pistol', courage: 0.75, accuracy: 0.55 },
  { id: 'lookout', name: 'Tommy Reyes', role: 'Lookout', look: { body: 'm', outfit: 'lookout', avatar: 'Male_Adult_16' },
    home: [-14.5, 25.2, 90], stationary: true, kind: 'hostile', courage: 0.2, accuracy: 0.3 },
];

export function buildEncounterSet(props: Props, world: CollisionWorld): pc.Vec3[] {
  // Cover objects (all collide and block bullets/LOS)
  const crates: [number, number, number][] = [[-19.5, 26.4, 0], [-19.5, 30.6, 90], [-31.5, 26.2, 20], [-24.5, 24.4, 0], [-36, 30.8, 90]];
  for (const [x, z, yaw] of crates) props.place('wooden_military_crate', x, z, { yaw, collide: true, collideInset: 0.02, scale: 1.05 });
  for (const [x, z] of [[-24.6, 24.4], [-19.4, 26.4]] as const) props.place('wooden_military_crate', x, z, { y: FLOOR_Y + 0.48, collide: false, scale: 1.0 });
  const barriers: [number, number, number][] = [[-28.5, 25.2, 0], [-15.8, 29.2, 90], [-40.5, 26.5, 90], [-33.5, 32.6, 0]];
  for (const [x, z, yaw] of barriers) props.place('concrete_road_barrier_02', x, z, { yaw, collide: true, collideInset: 0.05 });
  props.place('metal_jerrycan', -23.1, 31.5, { collide: true });
  props.place('metal_jerrycan', -22.6, 31.7, { yaw: 40, collide: true });
  props.place('old_tyre', -34.2, 24.4, { yaw: 0, collide: false });
  props.place('plastic_crate_01', -29.3, 31.9, { collide: true, scale: 1.3 });
  props.place('plastic_crate_01', -29.3, 31.9, { y: FLOOR_Y + 0.35, scale: 1.3 });
  void world;
  // Cover points around each obstacle (AI picks the side hidden from the player)
  const pts: pc.Vec3[] = [];
  const add = (x: number, z: number) => pts.push(new pc.Vec3(x, FLOOR_Y, z));
  for (const [x, z] of [...crates.map(([a, b]) => [a, b]), ...barriers.map(([a, b]) => [a, b]), [-23, 31.6], [-29.3, 31.9]] as [number, number][]) {
    add(x - 1.1, z); add(x + 1.1, z); add(x, z - 0.9); add(x, z + 0.9);
  }
  return pts;
}

export function inZone(x: number, z: number) {
  const Z = ENCOUNTER_ZONE;
  return x > Z.x0 && x < Z.x1 && z > Z.z0 && z < Z.z1;
}
