import * as pc from 'playcanvas';
import { Character, lerpAngle } from './character';
import type { CollisionWorld } from '../world/collision';

const tmpF = new pc.Vec3();
const tmpR = new pc.Vec3();
const res = { x: 0, z: 0, hit: false, nx: 0, nz: 0 };

/** On-foot detective controller (camera-relative movement). */
export class Player {
  x = 0; z = 0; y = 0;
  vx = 0; vz = 0;
  readonly radius = 0.3;
  walkSpeed = 2.3;
  runSpeed = 5.2;
  inVehicle = false;

  constructor(readonly character: Character, private world: CollisionWorld) {}

  place(x: number, z: number, yaw = 0) {
    this.x = x; this.z = z; this.vx = 0; this.vz = 0;
    this.y = this.world.groundHeight(x, z);
    this.character.yaw = yaw;
    this.character.setPosition(x, this.y, z);
  }

  update(dt: number, moveX: number, moveY: number, sprint: boolean, cam: { forward(o: pc.Vec3): pc.Vec3; right(o: pc.Vec3): pc.Vec3 }) {
    cam.forward(tmpF); cam.right(tmpR);
    let dx = tmpF.x * moveY + tmpR.x * moveX;
    let dz = tmpF.z * moveY + tmpR.z * moveX;
    const mag = Math.min(1, Math.hypot(moveX, moveY));
    const len = Math.hypot(dx, dz);
    if (len > 1e-4) { dx /= len; dz /= len; }
    const speed = mag < 0.01 ? 0 : sprint ? this.runSpeed : this.walkSpeed * Math.max(0.35, mag);
    const tx = dx * speed, tz = dz * speed;
    const accel = speed > Math.hypot(this.vx, this.vz) ? 14 : 18;
    const k = 1 - Math.exp(-accel * dt);
    this.vx += (tx - this.vx) * k;
    this.vz += (tz - this.vz) * k;

    let nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    const gy = this.world.groundHeight(nx, nz);
    this.world.resolveCircle(nx, nz, this.radius, gy + 0.2, gy + 1.75, res);
    nx = res.x; nz = res.z;
    // remove velocity into walls
    if (res.hit) {
      const vn = this.vx * res.nx + this.vz * res.nz;
      if (vn < 0) { this.vx -= vn * res.nx; this.vz -= vn * res.nz; }
    }
    this.x = nx; this.z = nz;
    const targetY = this.world.groundHeight(nx, nz);
    this.y += (targetY - this.y) * Math.min(1, dt * 18);

    const sp = Math.hypot(this.vx, this.vz);
    if (sp > 0.2) {
      const want = Math.atan2(this.vx, this.vz) * pc.math.RAD_TO_DEG;
      this.character.yaw = lerpAngle(this.character.yaw, want, Math.min(1, dt * 12));
    }
    this.character.speed = sp;
    this.character.setPosition(this.x, this.y, this.z);
    this.character.update(dt);
  }

  get pos() { return new pc.Vec3(this.x, this.y, this.z); }
}
