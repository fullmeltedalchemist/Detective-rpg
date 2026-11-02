import * as pc from 'playcanvas';
import type { Npc } from '../entities/npc';
import type { CollisionWorld } from '../world/collision';
import { yawTowards } from '../entities/humanoid';
import { WEAPONS } from './weapons';

export interface CombatWorld {
  world: CollisionWorld;
  playerPos(): pc.Vec3;
  playerAlive(): boolean;
  /** Is the player aiming a gun roughly at this NPC? */
  playerAimingAt(n: Npc): boolean;
  playerMovingFast(): boolean;
  npcFire(n: Npc, origin: pc.Vec3, dir: pc.Vec3): void;
  allies(n: Npc): Npc[];
  coverPoints: pc.Vec3[];
}

interface Mind {
  alerted: boolean;
  cover: pc.Vec3 | null;
  phase: 'move' | 'peek' | 'duck' | 'retreat' | 'flank';
  phaseT: number;
  phaseDur: number;
  nextShot: number;
  burstLeft: number;
  lastSeen: pc.Vec3 | null;
  heardAt: number;
  standoffUntil: number;
  fighting: boolean;
}

/**
 * Tactical brain for hostile NPCs: perceive → take cover → peek & fire in bursts →
 * reposition/flank → retreat or surrender depending on health, allies and courage.
 */
export class CombatAI {
  private minds = new Map<string, Mind>();
  private claimed = new Set<pc.Vec3>();
  t = 0;

  constructor(private cw: CombatWorld) {}

  private mind(n: Npc): Mind {
    let m = this.minds.get(n.id);
    if (!m) this.minds.set(n.id, (m = { alerted: false, cover: null, phase: 'move', phaseT: 0, phaseDur: 0, nextShot: 0, burstLeft: 0, lastSeen: null, heardAt: -99, standoffUntil: -1, fighting: false }));
    return m;
  }

  /** Gunshot / commotion heard at a position. */
  noise(at: pc.Vec3, loudness: number, npcs: Npc[]) {
    for (const n of npcs) {
      if (!n.alive) continue;
      const d = Math.hypot(n.x - at.x, n.z - at.z);
      if (d > loudness) continue;
      if (n.hostile) { const m = this.mind(n); m.alerted = true; m.fighting = true; m.heardAt = this.t; if (!m.lastSeen) m.lastSeen = at.clone(); }
    }
  }

  isAlerted(n: Npc) { return this.mind(n).alerted; }
  alert(n: Npc) { const m = this.mind(n); m.alerted = true; m.fighting = true; }
  inStandoff(n: Npc) { const m = this.minds.get(n.id); return !!m && m.alerted && !m.fighting; }
  /** Player orders surrender. Returns 'surrender' | 'fight' | 'ignore'. */
  order(n: Npc, aimedAt: boolean, alliesDown: number): 'surrender' | 'fight' {
    const m = this.mind(n);
    const d = Math.hypot(this.cw.playerPos().x - n.x, this.cw.playerPos().z - n.z);
    const roll = (n.def.courage ?? 0.5) - (aimedAt ? 0.25 : 0) - (d < 9 ? 0.1 : 0) - alliesDown * 0.25 - (1 - n.hp / n.maxHp) * 0.4 + Math.random() * 0.35;
    if (roll < 0.5) { n.surrender(); return 'surrender'; }
    m.alerted = true; m.fighting = true; m.standoffUntil = -1;
    return 'fight';
  }

  lineOfSight(a: pc.Vec3, b: pc.Vec3): boolean {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 0.01) return true;
    const hit = this.cw.world.raycast(a.x, a.y, a.z, dx / d, dy / d, dz / d, d, false);
    return hit >= d - 0.05;
  }

  private sees(n: Npc, p: pc.Vec3): boolean {
    const d = Math.hypot(p.x - n.x, p.z - n.z);
    if (d > 45) return false;
    const yawTo = yawTowards(n.x, n.z, p.x, p.z);
    const diff = Math.abs(((yawTo - n.character.yaw + 540) % 360) - 180);
    if (diff > 70 && d > 7) return false;
    return this.lineOfSight(new pc.Vec3(n.x, n.y + 1.55, n.z), new pc.Vec3(p.x, p.y + 1.5, p.z));
  }

  private coverIsGood(c: pc.Vec3, threat: pc.Vec3): boolean {
    // blocked at crouch height, open when standing (so we can peek)
    const low = !this.lineOfSight(new pc.Vec3(c.x, c.y + 0.75, c.z), new pc.Vec3(threat.x, threat.y + 1.2, threat.z));
    return low;
  }

  private pickCover(n: Npc, threat: pc.Vec3): pc.Vec3 | null {
    let best: pc.Vec3 | null = null, bestScore = Infinity;
    for (const c of this.cw.coverPoints) {
      if (this.claimed.has(c)) continue;
      const dSelf = Math.hypot(c.x - n.x, c.z - n.z);
      if (dSelf > 16) continue;
      const dThreat = Math.hypot(c.x - threat.x, c.z - threat.z);
      if (dThreat < 5) continue;
      if (!this.coverIsGood(c, threat)) continue;
      const score = dSelf + Math.abs(dThreat - 14) * 0.4;
      if (score < bestScore) { bestScore = score; best = c; }
    }
    return best;
  }

  update(dt: number, npcs: Npc[]) {
    this.t += dt;
    const p = this.cw.playerPos();
    for (const n of npcs) {
      if (!n.hostile || !n.alive || n.state === 'down' || n.state === 'cuffed' || n.state === 'inCar' || n.state === 'jailed' || n.state === 'surrender') {
        const m = this.minds.get(n.id);
        if (m?.cover) { this.claimed.delete(m.cover); m.cover = null; }
        if (n.state !== 'combat') { n.character.aim = 'none'; }
        continue;
      }
      const m = this.mind(n);
      const canSee = this.cw.playerAlive() && this.sees(n, p);
      if (canSee) {
        if (!m.alerted) { m.alerted = true; m.standoffUntil = this.t + 6; }
        m.lastSeen = p.clone();
      }
      if (!m.alerted) continue;
      if (n.state !== 'combat') n.setState('combat');
      // ---- standoff: they've seen a cop, weapons not yet up ----
      if (!m.fighting) {
        const dd = Math.hypot(p.x - n.x, p.z - n.z);
        const aimed = this.cw.playerAimingAt(n);
        if (this.t > m.standoffUntil || dd < 4.5 || (aimed && Math.random() < dt * 0.8)) {
          const alliesDown = this.cw.allies(n).filter((a) => !a.alive || a.state === 'cuffed' || a.state === 'surrender').length;
          if (n.armed) this.order(n, aimed, alliesDown); else if (aimed || dd < 6) n.surrender(); else { m.fighting = true; }
          continue;
        }
        n.moveTarget = null; n.faceYaw = yawTowards(n.x, n.z, p.x, p.z);
        n.character.aim = 'none'; n.character.crouch = false;
        continue;
      }
      const threat = m.lastSeen ?? p;
      const dist = Math.hypot(threat.x - n.x, threat.z - n.z);
      const allies = this.cw.allies(n).filter((a) => a.alive && a.state === 'combat');
      const courage = (n.def.courage ?? 0.5) + allies.length * 0.12;
      const hpFrac = n.hp / n.maxHp;

      // ---- surrender / retreat decisions ----
      const aimedAt = this.cw.playerAimingAt(n);
      if (!n.armed) {
        // unarmed hostiles flee, or give up when cornered/aimed at up close
        if (aimedAt && dist < 16) { n.surrender(); continue; }
        n.moveTarget = [n.x + (n.x - p.x), n.z + (n.z - p.z)];
        n.moveSpeed = 4.5; n.faceYaw = null; n.character.aim = 'none';
        continue;
      }
      if ((hpFrac < 0.35 && courage < 0.75 && aimedAt && dist < 18) || (allies.length === 0 && hpFrac < 0.6 && courage < 0.45 && aimedAt)) {
        n.surrender();
        continue;
      }
      if (hpFrac < 0.3 && courage < 0.8 && m.phase !== 'retreat') { this.setPhase(m, 'retreat', 4); }

      // ---- phase machine ----
      m.phaseT += dt;
      n.faceYaw = yawTowards(n.x, n.z, threat.x, threat.z);
      const weapon = WEAPONS[n.armed];
      switch (m.phase) {
        case 'move': {
          if (!m.cover || !this.coverIsGood(m.cover, threat)) {
            if (m.cover) this.claimed.delete(m.cover);
            m.cover = this.pickCover(n, threat);
            if (m.cover) this.claimed.add(m.cover);
          }
          if (m.cover) {
            n.moveTarget = [m.cover.x, m.cover.z];
            n.moveSpeed = 4.6;
            n.character.crouch = false;
            n.character.aim = canSee && dist < 25 ? 'pistol' : 'none';
            if (Math.hypot(m.cover.x - n.x, m.cover.z - n.z) < 0.4) this.setPhase(m, 'duck', 0.8 + Math.random());
          } else {
            // no cover: strafe while shooting
            const side = Math.sin(this.t * 0.7 + n.x) > 0 ? 1 : -1;
            const r = n.faceYaw * pc.math.DEG_TO_RAD;
            n.moveTarget = [n.x + Math.cos(r) * side * 2, n.z - Math.sin(r) * side * 2];
            n.moveSpeed = 1.8;
            this.trySHoot(n, m, canSee, dist, weapon.rpm);
          }
          break;
        }
        case 'duck':
          n.moveTarget = null; n.character.crouch = true; n.character.aim = 'none';
          if (m.phaseT > m.phaseDur) this.setPhase(m, 'peek', 1.4 + Math.random() * 1.4);
          break;
        case 'peek':
          n.moveTarget = null; n.character.crouch = false; n.character.aim = 'pistol';
          this.trySHoot(n, m, canSee, dist, weapon.rpm);
          if (m.phaseT > m.phaseDur) {
            // occasionally relocate/flank instead of ducking again
            if (Math.random() < 0.25 && allies.length > 0) { if (m.cover) this.claimed.delete(m.cover); m.cover = null; this.setPhase(m, 'move', 0); }
            else this.setPhase(m, 'duck', 1.2 + Math.random() * 1.6);
          }
          break;
        case 'retreat': {
          n.character.crouch = false;
          n.character.aim = 'none';
          const ax = n.x - threat.x, az = n.z - threat.z, l = Math.max(0.1, Math.hypot(ax, az));
          n.moveTarget = [n.x + (ax / l) * 4, n.z + (az / l) * 4];
          n.moveSpeed = 4.8;
          n.faceYaw = null;
          if (m.phaseT > m.phaseDur) { if (m.cover) this.claimed.delete(m.cover); m.cover = null; this.setPhase(m, 'move', 0); }
          break;
        }
        default:
          this.setPhase(m, 'move', 0);
      }
      n.character.aimPitch = 0;
    }
  }

  private setPhase(m: Mind, phase: Mind['phase'], dur: number) { m.phase = phase; m.phaseT = 0; m.phaseDur = dur; if (phase === 'peek') m.burstLeft = 1 + Math.floor(Math.random() * 3); }

  private trySHoot(n: Npc, m: Mind, canSee: boolean, dist: number, rpm: number) {
    if (!canSee || !this.cw.playerAlive() || !n.armed) return;
    if (this.t < m.nextShot) return;
    if (m.burstLeft <= 0) { m.nextShot = this.t + 0.8 + Math.random() * 0.8; m.burstLeft = 1 + Math.floor(Math.random() * 3); return; }
    m.burstLeft--;
    m.nextShot = this.t + 60 / rpm + 0.12 + Math.random() * 0.25;
    const p = this.cw.playerPos();
    // inaccuracy grows with distance and target movement
    const acc = n.def.accuracy ?? 0.5;
    const spreadDeg = (1.2 + dist * 0.12) * (1.6 - acc) * (this.cw.playerMovingFast() ? 1.6 : 1);
    const origin = new pc.Vec3(n.x, n.y + 1.45, n.z);
    const tgt = new pc.Vec3(p.x, p.y + 1.1 + Math.random() * 0.5, p.z);
    const dir = tgt.sub(origin).normalize();
    const s = spreadDeg * pc.math.DEG_TO_RAD;
    dir.x += (Math.random() - 0.5) * 2 * s; dir.y += (Math.random() - 0.5) * 2 * s; dir.z += (Math.random() - 0.5) * 2 * s;
    dir.normalize();
    n.threatened = true;
    this.cw.npcFire(n, origin, dir);
  }
}
