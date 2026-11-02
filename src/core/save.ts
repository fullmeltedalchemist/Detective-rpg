import type { Game } from './game';
import type { EvidenceId, Flag, Arrest } from '../gameplay/state';
import type { Incident } from '../gameplay/justice';
import type { WeaponId } from '../combat/weapons';

/**
 * Save games. Everything that makes a playthrough yours: case progress and evidence,
 * arrests and who is in a cell, who is dead, standing (trust, IA, morality, criminal
 * ties), money, weapons and ammo, where you are and where the cruiser is.
 *
 * Stored in localStorage: three manual slots plus an autosave (every minute, after
 * bookings and when the page is hidden — iPhone Safari can discard a background tab).
 * Saves carry a format version and are migrated forward on load; they can also be
 * exported to a file and imported again as a backup.
 */

export const SAVE_VERSION = 1;
const KEY = (slot: SlotId) => `casefiles.save.${slot}`;
export type SlotId = 'auto' | '1' | '2' | '3';
export const SLOTS: SlotId[] = ['auto', '1', '2', '3'];

export interface NpcSave { id: string; fate: 'free' | 'jailed' | 'dead' | 'prisoner'; hp: number }

export interface SaveData {
  version: number;
  savedAt: string;
  build: string;
  playTime: number;
  summary: string;
  state: {
    evidence: EvidenceId[]; flags: Flag[]; reputation: number; arrests: Arrest[]; hostile: string[]; jailed: string[];
    log: string[]; money: number; buyMoney: number;
  };
  standing: { publicTrust: number; professional: number; iaHeat: number; morality: number; criminalInfluence: number; incidents: Incident[]; suspended: boolean };
  player: { x: number; z: number; yaw: number; hp: number; owned: WeaponId[]; equipped: WeaponId; ammo: Record<string, { mag: number; reserve: number }>; disabledFirearms: boolean };
  car: { x: number; z: number; heading: number };
  npcs: NpcSave[];
  encounter: 'dormant' | 'active' | 'resolved';
}

// ------------------------------------------------------------------ storage
function storage(): Storage | null {
  try { const s = window.localStorage; s.setItem('casefiles.probe', '1'); s.removeItem('casefiles.probe'); return s; } catch { return null; }
}

export function readSlot(slot: SlotId): SaveData | null {
  const st = storage(); if (!st) return null;
  try {
    const raw = st.getItem(KEY(slot));
    return raw ? parseSave(raw) : null;
  } catch { return null; }
}

export function writeSlot(slot: SlotId, data: SaveData): boolean {
  const st = storage(); if (!st) return false;
  try { st.setItem(KEY(slot), JSON.stringify(data)); return true; } catch { return false; }
}

export function deleteSlot(slot: SlotId) { try { storage()?.removeItem(KEY(slot)); } catch { /* */ } }

/** Parse + validate + migrate. Throws on anything that isn't a Case Files save. */
export function parseSave(raw: string): SaveData {
  const d = JSON.parse(raw);
  if (!d || typeof d !== 'object' || typeof d.version !== 'number' || !d.state || !d.player) throw new Error('Not a Case Files save');
  if (d.version > SAVE_VERSION) throw new Error(`This save is from a newer version of the game (format ${d.version})`);
  return migrate(d);
}

/** Bring older formats up to date (keeps old saves loadable as the game grows). */
function migrate(d: any): SaveData {
  // v1 is the first format. Future: if (d.version === 1) { …add new fields with defaults…; d.version = 2; }
  d.state.money ??= 0; d.state.buyMoney ??= 0; d.state.log ??= [];
  d.npcs ??= []; d.encounter ??= 'dormant';
  d.standing ??= { publicTrust: 50, professional: 50, iaHeat: 0, morality: 0, criminalInfluence: 0, incidents: [], suspended: false };
  return d as SaveData;
}

// ------------------------------------------------------------------ capture / apply
export function captureSave(g: Game): SaveData {
  const s = g.state, st = g.combat.standing, pcm = g.combat.player;
  const npcs: NpcSave[] = g.npcs.map((n) => ({
    id: n.id, hp: n.hp,
    fate: !n.alive ? 'dead' : s.jailed.has(n.id) || n.state === 'jailed' ? 'jailed' : g.prisoner === n ? 'prisoner' : 'free',
  }));
  const carPos = g.car.entity.getPosition();
  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    build: (import.meta.env.VITE_BUILD_COMMIT ?? 'dev').slice(0, 7),
    playTime: Math.round(g.time),
    summary: summarize(g),
    state: {
      evidence: [...s.evidence], flags: [...s.flags], reputation: s.reputation, arrests: s.arrests, hostile: [...s.hostile], jailed: [...s.jailed],
      log: s.log.slice(-200), money: s.money, buyMoney: s.buyMoney,
    },
    standing: { publicTrust: st.publicTrust, professional: st.professional, iaHeat: st.iaHeat, morality: st.morality, criminalInfluence: st.criminalInfluence, incidents: st.incidents.slice(-100), suspended: st.suspended },
    player: {
      x: g.driving ? carPos.x : g.player.x, z: g.driving ? carPos.z + 2.5 : g.player.z, yaw: g.player.character.yaw,
      hp: Math.max(30, pcm.hp), owned: [...pcm.owned], equipped: pcm.equipped, ammo: pcm.ammoSnapshot(), disabledFirearms: pcm.disabledFirearms,
    },
    car: { x: carPos.x, z: carPos.z, heading: g.car.heading },
    npcs,
    encounter: g.combat.encounterState,
  };
}

function summarize(g: Game): string {
  const s = g.state;
  const c1 = s.flag('caseClosed') ? '9-114 closed' : s.flag('briefed') ? '9-114 open' : 'First day';
  const c2 = s.flag('drugCaseClosed') ? ' · 9-201 closed' : s.flag('dealerBribed') ? ' · 9-201 compromised' : s.flag('drugCaseOpen') ? ' · 9-201 open' : '';
  return `${c1}${c2} · $${s.money}`;
}

/** Apply a save to a freshly built world (before or right after the shift starts). */
export function applySave(g: Game, d: SaveData) {
  const s = g.state, st = g.combat.standing, pcm = g.combat.player;
  s.evidence = new Set(d.state.evidence);
  s.flags = new Set(d.state.flags);
  s.reputation = d.state.reputation;
  s.arrests = d.state.arrests ?? [];
  s.hostile = new Set(d.state.hostile);
  s.jailed = new Set(d.state.jailed);
  s.log = d.state.log ?? [];
  s.money = d.state.money; s.buyMoney = d.state.buyMoney;

  st.publicTrust = d.standing.publicTrust; st.professional = d.standing.professional; st.iaHeat = d.standing.iaHeat;
  st.morality = d.standing.morality; st.criminalInfluence = d.standing.criminalInfluence;
  st.incidents = d.standing.incidents ?? []; st.suspended = !!d.standing.suspended;

  pcm.owned = [...d.player.owned];
  pcm.restoreAmmo(d.player.ammo ?? {});
  pcm.disabledFirearms = d.player.disabledFirearms || st.suspended;
  pcm.hp = d.player.hp;
  pcm.equip(pcm.disabledFirearms ? 'fists' : d.player.equipped);
  g.player.place(d.player.x, d.player.z, d.player.yaw);
  g.cam.snapTo(g.player.pos);
  g.car.place(d.car.x, d.car.z, d.car.heading);
  g.combat.encounterState = d.encounter;

  const A = g.refs.anchors;
  let prisoner: string | null = null;
  for (const ns of d.npcs) {
    const n = g.npcs.find((x) => x.id === ns.id);
    if (!n) continue; // an NPC that no longer exists in this build
    if (ns.fate === 'dead') {
      // the coroner has been: the body is gone
      n.hp = 0; n.setState('dead'); n.character.visible = false; n.armed = null;
    } else if (ns.fate === 'jailed') {
      n.teleport(A.cellInside.x, A.cellInside.z, 180); n.setState('jailed'); n.armed = null;
      s.jailed.add(n.id);
    } else {
      n.hp = Math.max(40, ns.hp);
      if (ns.fate === 'prisoner') prisoner = n.id;
    }
  }
  // street crime follows from the case flags and NPC fates (a jailed dealer is off the corner,
  // a bribed one keeps dealing) — nothing else to restore there
  if (prisoner) {
    const n = g.npc(prisoner);
    n.teleport(g.player.x + 1.1, g.player.z - 0.8);
    g.cuffNow(n);
  }
}

/** Download a save as a JSON file (backup / move between devices). */
export function exportSave(d: SaveData) {
  const blob = new Blob([JSON.stringify(d, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `casefiles-save-${d.savedAt.slice(0, 16).replace(/[:T]/g, '-')}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
