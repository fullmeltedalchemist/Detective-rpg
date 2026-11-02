import * as pc from 'playcanvas';
import type { Assets } from '../core/assets';
import type { CollisionWorld } from '../world/collision';

const res = { x: 0, z: 0, hit: false, nx: 0, nz: 0 };

interface Wheel { pivot: pc.Entity; front: boolean; radius: number }

/**
 * Arcade car: throttle/brake/steer, collisions against world boxes,
 * spinning/steering wheels, siren light bar.
 */
export class Car {
  readonly entity: pc.Entity;
  x = 0; z = 0; heading = 0; // degrees, 0 = +Z
  speed = 0; // m/s along heading
  steer = 0; // -1..1 (positive = right)
  readonly scale = 1.5;
  readonly maxSpeed = 21;
  readonly maxReverse = 6;
  private wheels: Wheel[] = [];
  private wheelSpin = 0;
  sirenOn = false;
  private sirenT = 0;
  private redMat?: pc.StandardMaterial;
  private blueMat?: pc.StandardMaterial;
  readonly isPolice: boolean;
  /** Last impact speed (for camera shake / consequences). */
  impact = 0;
  /** Entities riding along (e.g. a cuffed suspect). */
  passengers: string[] = [];

  constructor(assets: Assets, private world: CollisionWorld, modelKey: string, name: string) {
    this.isPolice = modelKey === 'police-car';
    this.entity = new pc.Entity(name);
    const model = assets.instance(modelKey);
    this.setupWheels(model); // measure wheels at identity scale
    model.setLocalScale(this.scale, this.scale, this.scale);
    this.entity.addChild(model);
    if (this.isPolice) this.setupSiren();
  }

  private setupWheels(model: pc.Entity) {
    for (const n of ['wheel_frontLeft', 'wheel_frontRight', 'wheel_backLeft', 'wheel_backRight']) {
      const w = model.findByName(n) as pc.Entity | null;
      if (!w?.render) continue;
      const aabb = w.render.meshInstances[0].aabb; // in model space at identity transform
      const c = aabb.center.clone();
      const pivot = new pc.Entity(`${n}_pivot`);
      const parent = w.parent as pc.Entity;
      parent.addChild(pivot);
      pivot.setLocalPosition(c.x, c.y, c.z);
      parent.removeChild(w);
      pivot.addChild(w);
      w.setLocalPosition(-c.x, -c.y, -c.z);
      this.wheels.push({ pivot, front: n.includes('front'), radius: aabb.halfExtents.y * this.scale });
    }
  }

  private setupSiren() {
    const mk = (color: pc.Color) => {
      const m = new pc.StandardMaterial();
      m.diffuse = new pc.Color(0.05, 0.05, 0.05);
      m.emissive = color;
      m.emissiveIntensity = 0;
      m.update();
      return m;
    };
    this.redMat = mk(new pc.Color(1, 0.12, 0.08));
    this.blueMat = mk(new pc.Color(0.15, 0.35, 1));
    const top = 1.3 * this.scale;
    const mkLight = (x: number, mat: pc.StandardMaterial) => {
      const e = new pc.Entity('siren');
      e.addComponent('render', { type: 'box', material: mat, castShadows: false });
      e.setLocalPosition(x, top + 0.06, -0.15);
      e.setLocalScale(0.42, 0.12, 0.22);
      this.entity.addChild(e);
      return e;
    };
    mkLight(0.26, this.redMat);
    mkLight(-0.26, this.blueMat);
  }

  place(x: number, z: number, heading: number) {
    this.x = x; this.z = z; this.heading = heading; this.speed = 0;
    this.sync();
  }

  /** Circles approximating the car footprint. */
  private circles(): [number, number][] {
    const r = this.heading * pc.math.DEG_TO_RAD;
    const fx = Math.sin(r), fz = Math.cos(r);
    return [[this.x + fx * 1.35, this.z + fz * 1.35], [this.x, this.z], [this.x - fx * 1.35, this.z - fz * 1.35]];
  }
  readonly radius = 1.05;

  update(dt: number, throttle: number, steerIn: number, brake: boolean, driven: boolean) {
    this.impact = 0;
    if (driven) {
      // Steering eases in; reduced lock at speed.
      const target = steerIn;
      this.steer += (target - this.steer) * Math.min(1, dt * 6);
      const fwd = this.speed >= 0;
      if (brake) {
        this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 18 * dt);
      } else if (throttle > 0.05) {
        if (this.speed < -0.3) this.speed += 16 * throttle * dt; // braking from reverse
        else this.speed += (7.5 - this.speed * 0.18) * throttle * dt;
      } else if (throttle < -0.05) {
        if (this.speed > 0.3) this.speed += 16 * throttle * dt; // brake
        else this.speed += 4.5 * throttle * dt; // reverse
      }
      void fwd;
    } else {
      this.steer *= Math.max(0, 1 - dt * 4);
    }
    // Rolling resistance + drag
    const drag = (Math.abs(throttle) < 0.05 || !driven ? 2.2 : 0.4) + Math.abs(this.speed) * 0.02;
    const dv = Math.min(Math.abs(this.speed), drag * dt);
    this.speed -= Math.sign(this.speed) * dv;
    this.speed = pc.math.clamp(this.speed, -this.maxReverse, this.maxSpeed);

    const sp = Math.abs(this.speed);
    const lock = 1 - Math.min(0.55, sp / 40);
    const turnRate = 75 * lock * Math.min(1, sp / 4) * Math.sign(this.speed);
    this.heading -= this.steer * turnRate * dt;

    const r = this.heading * pc.math.DEG_TO_RAD;
    this.x += Math.sin(r) * this.speed * dt;
    this.z += Math.cos(r) * this.speed * dt;

    // Collisions: resolve each footprint circle and move the body by the correction.
    let hit = false;
    for (let iter = 0; iter < 2; iter++) {
      for (const [cx, cz] of this.circles()) {
        this.world.resolveCircle(cx, cz, this.radius, 0.3, 1.6, res);
        if (res.hit) {
          this.x += res.x - cx; this.z += res.z - cz;
          if (!hit) {
            const fdot = Math.sin(r) * res.nx + Math.cos(r) * res.nz;
            const into = -fdot * Math.sign(this.speed);
            if (into > 0.25) {
              this.impact = Math.abs(this.speed);
              this.speed *= -0.25;
            } else {
              this.speed *= 0.96; // scrape along walls
            }
          }
          hit = true;
        }
      }
    }
    this.sync();
    this.animate(dt);
  }

  private sync() {
    const y = this.world.groundHeight(this.x, this.z);
    this.entity.setPosition(this.x, y, this.z);
    this.entity.setEulerAngles(0, this.heading, 0);
  }

  private animate(dt: number) {
    if (this.wheels.length) {
      const rad = this.wheels[0].radius || 0.45;
      this.wheelSpin += (this.speed * dt) / rad * pc.math.RAD_TO_DEG;
      for (const w of this.wheels) w.pivot.setLocalEulerAngles(this.wheelSpin, w.front ? -this.steer * 28 : 0, 0);
    }
    if (this.redMat && this.blueMat) {
      this.sirenT += dt;
      const on = this.sirenOn;
      const phase = Math.floor(this.sirenT * 6) % 4;
      this.redMat.emissiveIntensity = on ? (phase < 2 ? 6 : 0.2) : 0.15;
      this.blueMat.emissiveIntensity = on ? (phase >= 2 ? 6 : 0.2) : 0.15;
      this.redMat.update(); this.blueMat.update();
    }
  }

  /** Point beside the driver door for exiting. */
  exitPoint(): [number, number] {
    const r = this.heading * pc.math.DEG_TO_RAD;
    // left side of the car (car right is -X when heading 0)
    const lx = Math.cos(r), lz = -Math.sin(r);
    return [this.x + lx * 1.9, this.z + lz * 1.9];
  }

  distanceTo(x: number, z: number) {
    let best = Infinity;
    for (const [cx, cz] of this.circles()) best = Math.min(best, Math.hypot(x - cx, z - cz) - this.radius);
    return best;
  }

  get kmh() { return Math.abs(this.speed) * 3.6; }
}
