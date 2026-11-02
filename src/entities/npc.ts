import * as pc from 'playcanvas';
import { lerpAngle, yawTowards, type Humanoid } from './humanoid';
import type { CollisionWorld } from '../world/collision';
import type { WeaponId } from '../combat/weapons';

export type NpcState =
  | 'idle' | 'wander' | 'talking' | 'flee' | 'cuffed' | 'inCar' | 'jailed' | 'goto' | 'watch'
  | 'combat' | 'surrender' | 'dead' | 'down' | 'cower';

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

  flee(from: pc.Vec3) {
    if (['cuffed', 'inCar', 'jailed', 'talking', 'dead', 'down', 'surrender', 'combat'].includes(this.state)) return;
    this.fleeFrom = from.clone();
    this.setState('flee');
  }

  cower(from: pc.Vec3) {
    if (['cuffed', 'inCar', 'jailed', 'dead', 'down', 'surrender', 'combat'].includes(this.state)) return;
    this.fleeFrom = from.clone();
    this.setState('cower');
  }

  surrender() {
    if (!this.alive || this.state === 'cuffed' || this.state === 'jailed') return;
    this.setState('surrender');
    this.character.pose = 'handsUp';
    this.character.aim = 'none';
    if (this.armed && this.dropWeapon) { this.dropWeapon(); }
    this.armed = null;
  }

  /** Apply damage. Returns 'killed' | 'downed' | 'hurt'. */
  damage(amount: number, kind: 'bullet' | 'melee', by: string, region: 'head' | 'torso' | 'limb' = 'torso'): 'killed' | 'downed' | 'hurt' | 'none' {
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
      this.character.die();
      if (this.armed && this.dropWeapon) this.dropWeapon();
      this.armed = null;
      return 'killed';
    }
    if (this.consciousness <= 0 || (kind === 'melee' && this.state === 'down')) {
      this.knockOut(9 + Math.random() * 4);
      return 'downed';
    }
    if (this.state !== 'cuffed' && this.state !== 'down') this.character.play(region === 'head' ? 'hitHead' : 'hitChest');
    return 'hurt';
  }

  knockOut(seconds: number) {
    if (!this.alive) return;
    this.setState('down');
    this.downTimer = seconds;
    this.character.knockDown();
    if (this.armed && this.dropWeapon) { this.dropWeapon(); this.armed = null; }
  }

  update(dt: number, playerPos: pc.Vec3) {
    this.stateT += dt;
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
        c.speed = 0;
        this.downTimer -= dt;
        if (this.downTimer <= 0) {
          this.consciousness = 60;
          c.getUp();
          if (this.hostile) this.setState('combat');
          else if (this.def.stationary) this.setState('idle');
          else { this.fleeFrom = playerPos.clone(); this.setState('flee'); }
        }
        c.update(dt);
        return;
      case 'surrender': {
        c.yaw = lerpAngle(c.yaw, yawTowards(this.x, this.z, playerPos.x, playerPos.z), Math.min(1, dt * 4));
        c.pose = this.stateT > 2.5 ? 'kneel' : 'handsUp';
        break;
      }
      case 'cower': {
        c.crouch = true;
        if (this.fleeFrom) c.yaw = lerpAngle(c.yaw, yawTowards(this.x, this.z, this.fleeFrom.x, this.fleeFrom.z), Math.min(1, dt * 3));
        if (this.stateT > 6) { c.crouch = false; this.setState(this.def.stationary ? 'idle' : 'wander'); }
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
        if (this.fleeFrom) { mx = this.x - this.fleeFrom.x; mz = this.z - this.fleeFrom.z; speed = 4.4; }
        if (this.stateT > 3.5) this.setState(this.def.stationary ? 'idle' : 'wander');
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

    if (this.state !== 'cower' && c.crouch && this.state !== 'combat') c.crouch = false;
    if (this.state !== 'talking' && this.state !== 'cuffed' && c.pose === 'talk') c.pose = 'normal';
    if (this.state !== 'surrender' && this.state !== 'cuffed' && (c.pose === 'handsUp' || c.pose === 'kneel')) c.pose = 'normal';

    const len = Math.hypot(mx, mz);
    let vx = 0, vz = 0;
    if (len > 1e-3 && speed > 0) {
      vx = (mx / len) * speed; vz = (mz / len) * speed;
      if (this.faceYaw === null || this.state !== 'combat') c.yaw = lerpAngle(c.yaw, Math.atan2(vx, vz) * pc.math.RAD_TO_DEG, Math.min(1, dt * 8));
    }
    if (this.state === 'combat' && this.faceYaw !== null) c.yaw = lerpAngle(c.yaw, this.faceYaw, Math.min(1, dt * 10));
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
