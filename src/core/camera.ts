import * as pc from 'playcanvas';
import type { CollisionWorld } from '../world/collision';

/** Orbit-follow camera with obstacle avoidance (walls pull the camera in). */
export class FollowCamera {
  yaw = 180; // degrees; 0 = camera looking toward +Z... we look along -forward
  pitch = -14;
  distance = 4.2;
  targetDistance = 4.2;
  height = 1.55;
  private pivot = new pc.Vec3();
  private currentDist = 4.2;
  private sinceManual = 99;
  /** When set, camera eases its yaw toward this heading (degrees) after manual input stops. */
  autoYaw: number | null = null;
  autoYawDelay = 1.2;

  constructor(readonly entity: pc.Entity, private world: CollisionWorld) {}

  applyLook(dx: number, dy: number) {
    if (dx || dy) this.sinceManual = 0;
    this.yaw -= dx;
    this.pitch = pc.math.clamp(this.pitch - dy, -62, 28);
  }

  /** Forward direction on the ground plane the camera is facing (for movement). */
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

  update(dt: number, target: pc.Vec3) {
    this.sinceManual += dt;
    if (this.autoYaw !== null && this.sinceManual > this.autoYawDelay) {
      let d = ((this.autoYaw - this.yaw + 540) % 360) - 180;
      this.yaw += d * Math.min(1, dt * 2.2);
      this.pitch += (-12 - this.pitch) * Math.min(1, dt * 1.2);
    }
    this.distance += (this.targetDistance - this.distance) * Math.min(1, dt * 3);
    const k = 1 - Math.exp(-dt * 14);
    this.pivot.x += (target.x - this.pivot.x) * k;
    this.pivot.y += (target.y + this.height - this.pivot.y) * k;
    this.pivot.z += (target.z - this.pivot.z) * k;

    const yr = this.yaw * pc.math.DEG_TO_RAD, pr = this.pitch * pc.math.DEG_TO_RAD;
    // Offset from pivot toward the camera (opposite of view direction)
    const dx = Math.sin(yr) * Math.cos(pr);
    const dy = -Math.sin(pr);
    const dz = Math.cos(yr) * Math.cos(pr);
    const hit = this.world.raycast(this.pivot.x, this.pivot.y, this.pivot.z, dx, dy, dz, this.distance + 0.3);
    const wanted = Math.max(0.6, hit - 0.3);
    // Pull in instantly, ease back out.
    if (wanted < this.currentDist) this.currentDist = wanted;
    else this.currentDist += (wanted - this.currentDist) * Math.min(1, dt * 4);

    let cy = this.pivot.y + dy * this.currentDist;
    cy = Math.max(cy, 0.35);
    this.entity.setPosition(this.pivot.x + dx * this.currentDist, cy, this.pivot.z + dz * this.currentDist);
    this.entity.setEulerAngles(this.pitch, this.yaw, 0);
  }
}
