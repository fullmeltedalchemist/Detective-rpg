import * as pc from 'playcanvas';
import { lerpAngle, yawTowards, type Humanoid, type HitRegion } from './humanoid';
import type { CollisionWorld } from '../world/collision';
import type { WeaponId } from '../combat/weapons';

export type NpcState =
  | 'idle' | 'wander' | 'talking' | 'flee' | 'cuffed' | 'inCar' | 'jailed' | 'goto' | 'watch'
  | 'combat' | 'surrender' | 'dead' | 'down' | 'cower' | 'recover' | 'hide'
  /** scripted: stand still facing lookAt until released (hand-offs, frisks) */
  | 'hold'
  /** running from the police along an escape route */
  | 'evade';

const res = { x: 0, z: 0, hit: false, nx: 0, nz: 0 };

export interface NpcDef {
  id: string;
  name: string;
  role: string;
  look: import('./humanoid').HumanLook;
  home: [number, number, number]; // x, z, yaw
  route?: [number, number][];
  stationary?: boolean;
  /** Combat profile */
  kind?: 'civilian' | 'staff' | 'suspect' | 'hostile';
  armed?: WeaponId;
  courage?: number; // 0..1
  accuracy?: number; // 0..1
}

export class Npc {
  readonly character: Humanoid;
  x: number; z: number; y = 0;
  state: NpcState = 'idle';
  private stateT = 0;
  private routeIdx = 0;
  private target: [number, number] | null = null;
  private walkSpeed = 1.25 + Math.random() * 0.35;
  disposition = 0;
  lookAt: pc.Vec3 | null = null;
  readonly radius = 0.3;
  followTarget: (() => pc.Vec3) | null = null;
  private fleeFrom: pc.Vec3 | null = null;
  private onArrive: (() => void) | null = null;
  private downTimer = 0;
  /** Panic: civilians keep reacting until this game-time passes with no new threats. */
  private panicUntil = -1;
  private clock = 0;
  private threat: pc.Vec3 | null = null;
  private afterRecover: NpcState = 'idle';
  /** Escape route for the 'evade' state, and how fast they run it. */
  private escape: [number, number][] = [];
  private escapeIdx = 0;
  evadeSpeed = 4.6;
  /** Set when an evading NPC reaches the end of the route (the director decides what happens). */
  escaped = false;

  // ---- combat ----
  hp = 100;
  maxHp = 100;
  consciousness = 100;
  hostile: boolean;
  armed: WeaponId | null;
  /** Set by the combat brain while in 'combat' state */
  moveTarget: [number, number] | null = null;
  moveSpeed = 0;
  faceYaw: number | null = null;
  lastHurtBy: string | null = null;
  lastHitAt = -99;
  /** Has this NPC fired at or threatened the player? (justification for lethal force) */
  threatened = false;
  dropWeapon: (() => void) | null = null;

  constructor(readonly def: NpcDef, character: Humanoid, private world: CollisionWorld) {
    this.character = character;
    this.x = def.home[0]; this.z = def.home[1];
    this.character.yaw = def.home[2];
    this.state = def.stationary ? 'idle' : 'wander';
    this.stateT = Math.random() * 4;
    this.hostile = def.kind === 'hostile';
    this.armed = def.armed ?? null;
  }

  get id() { return this.def.id; }
  get name() { return this.def.name; }
  get pos() { return new pc.Vec3(this.x, this.y, this.z); }
  get alive() { return this.state !== 'dead'; }
  get incapacitated() { return this.state === 'dead' || this.state === 'down'; }
  get stateTime() { return this.stateT; }
  get isCivilian() { return (this.def.kind ?? 'civilian') === 'civilian' || this.def.kind === 'staff'; }

  setState(s: NpcState) { this.state = s; this.stateT = 0; }

  goTo(x: number, z: number, then?: () => void) {
    this.target = [x, z];
    this.onArrive = then ?? null;
    this.setState('goto');
  }

  teleport(x: number, z: number, yaw?: number) {
    this.x = x; this.z = z;
    if (yaw !== undefined) this.character.yaw = yaw;
    this.y = this.world.groundHeight(x, z);
    this.character.setPosition(x, this.y, z);
  }

  private get unavailable() {
    return ['cuffed', 'inCar', 'jailed', 'dead', 'down', 'recover', 'surrender', 'combat'].includes(this.state);
  }

  /**
   * Civilian reaction to danger. Each panic episode picks ONE response and then only
   * extends it on further gunshots — no crouch/stand/crouch cycling:
   *  - staff (behind counters) duck and stay down;
   *  - pedestrians run away, then take cover (crouch) once they are clear;
   *  - anyone with nowhere to go (very close to the danger) drops and covers.
   */
  alarm(from: pc.Vec3, mode: 'flee' | 'duck' = 'flee') {
    if (this.unavailable) return;
    this.threat = from.clone();
    this.fleeFrom = from.clone();
    const was = this.panicUntil > this.clock;
    this.panicUntil = this.clock + 7;
    if (was && (this.state === 'flee' || this.state === 'cower' || this.state === 'hide')) return; // keep current response
    if (this.state === 'talking') this.character.pose = 'normal';
    if (this.def.stationary || mode === 'duck') this.setState('cower');
    else this.setState('flee');
  }

  flee(from: pc.Vec3) { this.alarm(from, 'flee'); }

  /** Run from the police along a route (slower than a sprinting player, so a chase can be won). */
  evade(route: [number, number][]) {
    if (!this.alive || this.unavailable) return;
    this.escape = route; this.escapeIdx = 0; this.escaped = false;
    this.character.pose = 'normal';
    this.setState('evade');
  }

  /** Stand still facing a point until released with release(). */
  hold(face: pc.Vec3 | null) {
    if (!this.alive || this.unavailable) return;
    this.lookAt = face ? face.clone() : null;
    this.setState('hold');
  }

  release(next: NpcState = this.def.stationary ? 'idle' : 'wander') {
    if (this.state === 'hold' || this.state === 'evade') this.setState(next);
  }
  cower(from: pc.Vec3) { this.alarm(from, this.def.stationary ? 'duck' : 'flee'); }
  get panicking() { return this.panicUntil > this.clock; }

  surrender() {
    if (!this.alive || this.state === 'cuffed' || this.state === 'jailed') return;
    this.setState('surrender');
    this.character.pose = 'handsUp';
    this.character.aim = 'none';
    if (this.armed && this.dropWeapon) { this.dropWeapon(); }
    this.armed = null;
  }

  /** Apply damage. Returns 'killed' | 'downed' | 'hurt'. */
  damage(amount: number, kind: 'bullet' | 'melee', by: string, region: HitRegion = 'torso', from: pc.Vec3 | null = null): 'killed' | 'downed' | 'hurt' | 'none' {
    if (!this.alive) return 'none';
    this.lastHurtBy = by;
    this.lastHitAt = performance.now() / 1000;
    if (kind === 'melee') {
      this.consciousness -= amount * 2.4;
      this.hp -= amount * 0.35;
    } else {
      this.hp -= amount;
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.setState('dead');
      this.character.die(from, region);
      if (this.armed && this.dropWeapon) this.dropWeapon();
      this.armed = null;
      return 'killed';
    }
    // Already on the ground: stay down (extend), only a small flinch
    if (this.state === 'down') {
      this.downTimer = Math.max(this.downTimer, 4);
      this.character.hit(region, 0.2, from);
      return 'downed';
    }
    if (this.consciousness <= 0) { this.knockOut(9 + Math.random() * 4, from); return 'downed'; }
    // Severe leg wound or heavy blood loss can drop someone (wounded, not dead)
    const severity = Math.min(1, amount / 40);
    if (kind === 'bullet' && this.hp < 25 && Math.random() < 0.35) { this.knockOut(14 + Math.random() * 8, from); return 'downed'; }
    this.character.hit(region, kind === 'melee' ? Math.min(1, amount / 25) : severity, from);
    // wounded leg: slower
    if (region === 'leg' || region === 'limb') this.walkSpeed = Math.max(0.7, this.walkSpeed * 0.8);
    return 'hurt';
  }

  knockOut(seconds: number, from: pc.Vec3 | null = null) {
    if (!this.alive || this.state === 'down') return;
    this.setState('down');
    this.downTimer = seconds;
    this.character.knockDown(from);
    if (this.armed && this.dropWeapon) { this.dropWeapon(); this.armed = null; }
  }

  update(dt: number, playerPos: pc.Vec3) {
    this.stateT += dt;
    this.clock += dt;
    let mx = 0, mz = 0, speed = 0;
    const c = this.character;

    switch (this.state) {
      case 'inCar':
      case 'jailed':
      case 'dead':
        c.speed = 0;
        if (this.state !== 'inCar') c.update(dt);
        return;
      case 'down':
        // Stay down until the knock-out actually ends (and the fall has finished).
        c.speed = 0;
        this.downTimer -= dt;
        if (this.downTimer <= 0 && c.lyingStill) {
          this.consciousness = 60;
          c.getUp();
          this.afterRecover = this.hostile ? 'combat' : this.def.stationary ? 'idle' : 'flee';
          if (!this.hostile) this.fleeFrom = playerPos.clone();
          this.setState('recover');
        }
        c.update(dt);
        return;
      case 'recover':
        // Getting up: don't move until the clip finishes
        c.speed = 0;
        if (!c.busy && this.stateT > 0.3) this.setState(this.afterRecover);
        c.update(dt);
        return;
      case 'surrender': {
        c.yaw = lerpAngle(c.yaw, yawTowards(this.x, this.z, playerPos.x, playerPos.z), Math.min(1, dt * 4));
        c.pose = this.stateT > 2.5 ? 'kneel' : 'handsUp';
        break;
      }
      case 'cower':
      case 'hide': {
        // Duck once and stay down while danger continues; stand up only after it's quiet.
        c.crouch = true;
        if (this.fleeFrom) c.yaw = lerpAngle(c.yaw, yawTowards(this.x, this.z, this.fleeFrom.x, this.fleeFrom.z), Math.min(1, dt * 2));
        if (!this.panicking && this.stateT > 2.5) { c.crouch = false; this.setState(this.def.stationary ? 'idle' : 'watch'); this.lookAt = this.threat; }
        break;
      }
      case 'combat': {
        if (this.moveTarget) {
          mx = this.moveTarget[0] - this.x; mz = this.moveTarget[1] - this.z;
          if (Math.hypot(mx, mz) < 0.3) { mx = 0; mz = 0; }
          speed = this.moveSpeed;
        }
        break;
      }
      case 'talking': {
        const yaw = yawTowards(this.x, this.z, playerPos.x, playerPos.z);
        c.yaw = lerpAngle(c.yaw, yaw, Math.min(1, dt * 6));
        if (c.pose === 'normal') c.pose = 'talk';
        break;
      }
      case 'hold': {
        if (this.lookAt) c.yaw = lerpAngle(c.yaw, yawTowards(this.x, this.z, this.lookAt.x, this.lookAt.z), Math.min(1, dt * 5));
        break;
      }
      case 'evade': {
        const wp = this.escape[this.escapeIdx];
        if (!wp) { this.escaped = true; break; }
        mx = wp[0] - this.x; mz = wp[1] - this.z;
        speed = this.hp < 60 ? this.evadeSpeed * 0.7 : this.evadeSpeed;
        if (Math.hypot(mx, mz) < 0.8) this.escapeIdx++;
        break;
      }
      case 'watch': {
        if (this.lookAt) c.yaw = lerpAngle(c.yaw, yawTowards(this.x, this.z, this.lookAt.x, this.lookAt.z), Math.min(1, dt * 4));
        if (this.stateT > 6) this.setState(this.def.stationary ? 'idle' : 'wander');
        break;
      }
      case 'idle': {
        const [hx, hz, hy] = this.def.home;
        const d = Math.hypot(hx - this.x, hz - this.z);
        if (d > 0.4) { mx = hx - this.x; mz = hz - this.z; speed = this.walkSpeed; }
        else {
          const pd = Math.hypot(playerPos.x - this.x, playerPos.z - this.z);
          const want = pd < 4 ? yawTowards(this.x, this.z, playerPos.x, playerPos.z) : hy;
          c.yaw = lerpAngle(c.yaw, want, Math.min(1, dt * 3));
        }
        if (!this.def.stationary && this.stateT > 3 + Math.random() * 3) this.setState('wander');
        break;
      }
      case 'wander': {
        const route = this.def.route;
        if (!route || !route.length) { this.setState('idle'); break; }
        const [tx, tz] = route[this.routeIdx % route.length];
        const d = Math.hypot(tx - this.x, tz - this.z);
        if (d < 0.6) {
          this.routeIdx++;
          if (Math.random() < 0.35) this.setState('idle');
        } else { mx = tx - this.x; mz = tz - this.z; speed = this.walkSpeed; }
        break;
      }
      case 'goto': {
        if (!this.target) { this.setState('idle'); break; }
        const [tx, tz] = this.target;
        const d = Math.hypot(tx - this.x, tz - this.z);
        if (d < 0.5) {
          this.target = null;
          const cb = this.onArrive; this.onArrive = null;
          this.setState('idle');
          cb?.();
        } else { mx = tx - this.x; mz = tz - this.z; speed = this.walkSpeed * 1.2; }
        break;
      }
      case 'flee': {
        // Run until well clear, then take cover if danger continues
        const from = this.fleeFrom;
        const dist = from ? Math.hypot(this.x - from.x, this.z - from.z) : 99;
        if (from) { mx = this.x - from.x; mz = this.z - from.z; speed = this.hp < 60 ? 3.3 : 5.6; }
        const blocked = this.stateT > 1 && c.speed < 0.6;
        if (dist > 28 || this.stateT > 8 || blocked) {
          if (this.panicking) this.setState('hide');
          else this.setState(this.def.stationary ? 'idle' : 'wander');
        }
        break;
      }
      case 'cuffed': {
        c.pose = 'cuffed';
        const t = this.followTarget?.();
        if (t) {
          const d = Math.hypot(t.x - this.x, t.z - this.z);
          if (d > 1.6) { mx = t.x - this.x; mz = t.z - this.z; speed = Math.min(5, 1.2 + (d - 1.6) * 2.2); }
          else c.yaw = lerpAngle(c.yaw, yawTowards(this.x, this.z, t.x, t.z), Math.min(1, dt * 4));
          if (d > 25) this.teleport(t.x + 1, t.z + 1);
        }
        break;
      }
    }

    if (this.state !== 'cower' && this.state !== 'hide' && c.crouch && this.state !== 'combat') c.crouch = false;
    if (this.state !== 'talking' && this.state !== 'cuffed' && c.pose === 'talk') c.pose = 'normal';
    if (this.state !== 'surrender' && this.state !== 'cuffed' && (c.pose === 'handsUp' || c.pose === 'kneel')) c.pose = 'normal';

    const len = Math.hypot(mx, mz);
    let vx = 0, vz = 0;
    if (len > 1e-3 && speed > 0) {
      vx = (mx / len) * speed; vz = (mz / len) * speed;
      if (this.faceYaw === null || this.state !== 'combat') c.yaw = lerpAngle(c.yaw, Math.atan2(vx, vz) * pc.math.RAD_TO_DEG, Math.min(1, dt * 8));
    }
    if (this.state === 'combat' && this.faceYaw !== null) c.yaw = lerpAngle(c.yaw, this.faceYaw, Math.min(1, dt * 10));
    // stagger from hits pushes the body back a little
    vx += c.stagger.x; vz += c.stagger.z;
    let nx = this.x + vx * dt, nz = this.z + vz * dt;
    const gy = this.world.groundHeight(nx, nz);
    this.world.resolveCircle(nx, nz, this.radius, gy + 0.2, gy + 1.7, res);
    if (res.hit && this.state === 'wander' && this.stateT > 1) { this.routeIdx++; this.stateT = 0; }
    const moved = Math.hypot(res.x - this.x, res.z - this.z) / Math.max(dt, 1e-4);
    this.x = res.x; this.z = res.z;
    this.y += (this.world.groundHeight(this.x, this.z) - this.y) * Math.min(1, dt * 15);
    c.speed = moved;
    c.setPosition(this.x, this.y, this.z);
    c.update(dt);
  }
}
