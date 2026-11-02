import * as pc from 'playcanvas';
import type { CollisionWorld } from '../world/collision';

/**
 * Orbit-follow camera with obstacle avoidance (walls pull the camera in),
 * plus an over-the-shoulder combat mode with aim-down-sights zoom.
 */
export class FollowCamera {
  yaw = 180;
  pitch = -14;
  distance = 4.2;
  targetDistance = 4.2;
  height = 1.55;
  private baseDistance = 4.2;
  private baseHeight = 1.55;
  private pivot = new pc.Vec3();
  private currentDist = 4.2;
  private sinceManual = 99;
  autoYaw: number | null = null;
  autoYawDelay = 1.2;
  // combat
  private lateral = 0;
  private lateralTarget = 0;
  private fov = 58;
  private fovTarget = 58;
  private combat = false;
  private combatHeight = 1.55;

  constructor(readonly entity: pc.Entity, private world: CollisionWorld) {}

  applyLook(dx: number, dy: number) {
    if (dx || dy) this.sinceManual = 0;
    this.yaw -= dx;
    this.pitch = pc.math.clamp(this.pitch - dy, -62, 40);
  }

  forward(out: pc.Vec3) {
    const r = this.yaw * pc.math.DEG_TO_RAD;
    return out.set(-Math.sin(r), 0, -Math.cos(r));
  }

  right(out: pc.Vec3) {
    const r = this.yaw * pc.math.DEG_TO_RAD;
    return out.set(Math.cos(r), 0, -Math.sin(r));
  }

  snapTo(target: pc.Vec3) {
    this.pivot.set(target.x, target.y + this.height, target.z);
  }

  /** Set walking/driving framing (distance + height). */
  setFraming(distance: number, height: number) {
    this.baseDistance = distance; this.baseHeight = height;
  }

  /** Combat framing: over-the-shoulder; ADS zooms in with a narrower FOV. */
  setCombat(on: boolean, ads: boolean, shoulder: number, fov: number) {
    this.combat = on;
    this.lateralTarget = on ? (ads ? 0.48 : 0.62) * shoulder : 0;
    this.targetDistance = on ? (ads ? 1.55 : 2.6) : this.baseDistance;
    this.combatHeight = on ? (ads ? 1.58 : 1.62) : this.baseHeight;
    this.fovTarget = fov;
  }

  get isCombat() { return this.combat; }

  update(dt: number, target: pc.Vec3) {
    this.sinceManual += dt;
    if (this.autoYaw !== null && this.sinceManual > this.autoYawDelay) {
      const d = ((this.autoYaw - this.yaw + 540) % 360) - 180;
      this.yaw += d * Math.min(1, dt * 2.2);
      this.pitch += (-12 - this.pitch) * Math.min(1, dt * 1.2);
    }
    if (!this.combat) { this.targetDistance = this.baseDistance; this.combatHeight = this.baseHeight; }
    this.distance += (this.targetDistance - this.distance) * Math.min(1, dt * 8);
    this.height += (this.combatHeight - this.height) * Math.min(1, dt * 8);
    this.lateral += (this.lateralTarget - this.lateral) * Math.min(1, dt * 10);
    this.fov += (this.fovTarget - this.fov) * Math.min(1, dt * 12);
    if (this.entity.camera && Math.abs(this.entity.camera.fov - this.fov) > 0.05) this.entity.camera.fov = this.fov;

    const k = 1 - Math.exp(-dt * (this.combat ? 30 : 14));
    // lateral shoulder offset is applied to the pivot so the crosshair stays centred
    const yr = this.yaw * pc.math.DEG_TO_RAD, pr = this.pitch * pc.math.DEG_TO_RAD;
    const rx = Math.cos(yr), rz = -Math.sin(yr);
    const tx = target.x + rx * this.lateral, tz = target.z + rz * this.lateral;
    this.pivot.x += (tx - this.pivot.x) * k;
    this.pivot.y += (target.y + this.height - this.pivot.y) * k;
    this.pivot.z += (tz - this.pivot.z) * k;

    // Make sure the shoulder pivot itself isn't inside a wall
    const lat = this.lateral;
    if (Math.abs(lat) > 0.01) {
      const ox = target.x, oy = target.y + this.height, oz = target.z;
      const dirx = rx * Math.sign(lat), dirz = rz * Math.sign(lat);
      const hit = this.world.raycast(ox, oy, oz, dirx, 0, dirz, Math.abs(lat) + 0.2);
      if (hit < Math.abs(lat) + 0.2) {
        const allowed = Math.max(0, hit - 0.2);
        this.pivot.x = ox + dirx * allowed; this.pivot.z = oz + dirz * allowed;
      }
    }

    const dx = Math.sin(yr) * Math.cos(pr);
    const dy = -Math.sin(pr);
    const dz = Math.cos(yr) * Math.cos(pr);
    const hit = this.world.raycast(this.pivot.x, this.pivot.y, this.pivot.z, dx, dy, dz, this.distance + 0.3);
    const wanted = Math.max(0.5, hit - 0.3);
    if (wanted < this.currentDist) this.currentDist = wanted;
    else this.currentDist += (wanted - this.currentDist) * Math.min(1, dt * 4);
    if (this.currentDist > this.distance) this.currentDist += (this.distance - this.currentDist) * Math.min(1, dt * 10);

    let cy = this.pivot.y + dy * this.currentDist;
    cy = Math.max(cy, 0.35);
    this.entity.setPosition(this.pivot.x + dx * this.currentDist, cy, this.pivot.z + dz * this.currentDist);
    this.entity.setEulerAngles(this.pitch, this.yaw, 0);
  }
}
