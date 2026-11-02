export type FireMode = 'semi' | 'burst' | 'auto' | 'bolt';
export type WeaponId = 'fists' | 'pistol' | 'rifle';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  model?: string;
  modes: FireMode[];
  /** Rounds per minute (for bolt: cycle time is boltTime) */
  rpm: number;
  boltTime?: number;
  damage: number;
  headMult: number;
  limbMult: number;
  /** Muzzle velocity m/s */
  velocity: number;
  /** Max effective range (damage falls off beyond) */
  range: number;
  magSize: number;
  reserveStart: number;
  reloadTime: number;
  /** Cone half-angle in degrees */
  spreadHip: number;
  spreadAds: number;
  movePenalty: number; // extra degrees at full run
  recoilV: number; // degrees per shot
  recoilH: number;
  adsFov: number;
  /** Visual: model-space grip point (placed in the hand); barrel points along model +X. */
  visual: { keep?: string[]; grip: [number, number, number]; muzzleFwd: number; muzzleUp: number };
  holster: 'thigh' | 'back';
  sound: { boom: number; crack: number; tail: number };
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  fists: {
    id: 'fists', name: 'Fists', modes: ['semi'], rpm: 120, damage: 12, headMult: 1.2, limbMult: 1, velocity: 0, range: 1.4,
    magSize: 0, reserveStart: 0, reloadTime: 0, spreadHip: 0, spreadAds: 0, movePenalty: 0, recoilV: 0, recoilH: 0, adsFov: 58,
    visual: { grip: [0, 0, 0], muzzleFwd: 0, muzzleUp: 0 }, holster: 'thigh',
    sound: { boom: 0, crack: 0, tail: 0 },
  },
  pistol: {
    id: 'pistol', name: 'Service Pistol', model: 'service_pistol', modes: ['semi'], rpm: 380, damage: 34, headMult: 2.4, limbMult: 0.7,
    velocity: 360, range: 45, magSize: 15, reserveStart: 45, reloadTime: 1.7, spreadHip: 2.6, spreadAds: 0.55, movePenalty: 2.2,
    recoilV: 2.2, recoilH: 0.7, adsFov: 44,
    visual: { keep: ['service_pistol_pistol_a', 'service_pistol_slide_a', 'service_pistol_magazine_loaded', 'service_pistol_hammer_a', 'service_pistol_trigger_a'], grip: [-0.025, 0.0, 0], muzzleFwd: 0.2, muzzleUp: 0.065 },
    holster: 'thigh',
    sound: { boom: 0.8, crack: 0.9, tail: 0.35 },
  },
  rifle: {
    id: 'rifle', name: 'Bolt-Action Rifle 7.62', model: 'bolt_action_rifle_7_62', modes: ['bolt'], rpm: 50, boltTime: 1.15, damage: 92, headMult: 2.0,
    limbMult: 0.75, velocity: 820, range: 220, magSize: 5, reserveStart: 20, reloadTime: 2.8, spreadHip: 4.5, spreadAds: 0.12, movePenalty: 3.5,
    recoilV: 6.5, recoilH: 1.4, adsFov: 30,
    visual: { grip: [-0.31, -0.03, 0], muzzleFwd: 0.9, muzzleUp: 0.05 },
    holster: 'back',
    sound: { boom: 1.0, crack: 1.0, tail: 0.6 },
  },
};

export interface WeaponState { id: WeaponId; mag: number; reserve: number; mode: FireMode; lastShot: number; reloadingUntil: number; boltUntil: number }

export function newWeaponState(id: WeaponId): WeaponState {
  const d = WEAPONS[id];
  return { id, mag: d.magSize, reserve: d.reserveStart, mode: d.modes[0], lastShot: -99, reloadingUntil: 0, boltUntil: 0 };
}
