import * as pc from 'playcanvas';
import { Character, lerpAngle, yawTowards } from './character';
import type { CollisionWorld } from '../world/collision';

export type NpcState = 'idle' | 'wander' | 'talking' | 'flee' | 'cuffed' | 'inCar' | 'jailed' | 'goto' | 'watch';

const res = { x: 0, z: 0, hit: false, nx: 0, nz: 0 };

export interface NpcDef {
  id: string;
  name: string;
  role: string;
  model: string;
  home: [number, number, number]; // x, z, yaw
  /** Wander waypoints; if empty the NPC stays near home. */
  route?: [number, number][];
  /** Stand still (shopkeepers etc). */
  stationary?: boolean;
}

export class Npc {
  readonly character: Character;
  x: number; z: number; y = 0;
  state: NpcState = 'idle';
  private stateT = 0;
  private routeIdx = 0;
  private target: [number, number] | null = null;
  private walkSpeed = 1.25 + Math.random() * 0.35;
  /** World reaction memory */
  disposition = 0; // <0 hostile
  lookAt: pc.Vec3 | null = null;
  readonly radius = 0.3;
  followTarget: (() => pc.Vec3) | null = null;
  private fleeFrom: pc.Vec3 | null = null;
  private onArrive: (() => void) | null = null;

  constructor(readonly def: NpcDef, character: Character, private world: CollisionWorld) {
    this.character = character;
    this.x = def.home[0]; this.z = def.home[1];
    this.character.yaw = def.home[2];
    this.state = def.stationary ? 'idle' : 'wander';
    this.stateT = Math.random() * 4;
  }

  get id() { return this.def.id; }
  get name() { return this.def.name; }
  get pos() { return new pc.Vec3(this.x, this.y, this.z); }

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
    if (this.state === 'cuffed' || this.state === 'inCar' || this.state === 'jailed' || this.state === 'talking') return;
    this.fleeFrom = from.clone();
    this.setState('flee');
  }

  update(dt: number, playerPos: pc.Vec3) {
    this.stateT += dt;
    let mx = 0, mz = 0, speed = 0;
    const c = this.character;

    switch (this.state) {
      case 'inCar':
      case 'jailed':
        c.speed = 0;
        if (this.state === 'jailed') c.update(dt);
        return;
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
        // Stationary NPCs drift back home and glance at a nearby player.
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
        if (this.fleeFrom) { mx = this.x - this.fleeFrom.x; mz = this.z - this.fleeFrom.z; speed = 4.2; }
        if (this.stateT > 2.5) this.setState(this.def.stationary ? 'idle' : 'wander');
        break;
      }
      case 'cuffed': {
        c.pose = 'cuffed';
        const t = this.followTarget?.();
        if (t) {
          const d = Math.hypot(t.x - this.x, t.z - this.z);
          if (d > 1.6) { mx = t.x - this.x; mz = t.z - this.z; speed = Math.min(5, 1.2 + (d - 1.6) * 2.2); }
          else c.yaw = lerpAngle(c.yaw, yawTowards(this.x, this.z, t.x, t.z), Math.min(1, dt * 4));
          if (d > 25) this.teleport(t.x + 1, t.z + 1); // never lose the prisoner behind geometry
        }
        break;
      }
    }

    if (this.state !== 'talking' && this.state !== 'cuffed' && c.pose === 'talk') c.pose = 'normal';

    const len = Math.hypot(mx, mz);
    let vx = 0, vz = 0;
    if (len > 1e-3 && speed > 0) {
      vx = (mx / len) * speed; vz = (mz / len) * speed;
      c.yaw = lerpAngle(c.yaw, Math.atan2(vx, vz) * pc.math.RAD_TO_DEG, Math.min(1, dt * 8));
    }
    let nx = this.x + vx * dt, nz = this.z + vz * dt;
    const gy = this.world.groundHeight(nx, nz);
    this.world.resolveCircle(nx, nz, this.radius, gy + 0.2, gy + 1.7, res);
    // If wandering into a wall, skip to the next waypoint.
    if (res.hit && this.state === 'wander' && this.stateT > 1) { this.routeIdx++; this.stateT = 0; }
    const moved = Math.hypot(res.x - this.x, res.z - this.z) / Math.max(dt, 1e-4);
    this.x = res.x; this.z = res.z;
    this.y += (this.world.groundHeight(this.x, this.z) - this.y) * Math.min(1, dt * 15);
    c.speed = moved;
    c.setPosition(this.x, this.y, this.z);
    c.update(dt);
  }
}
