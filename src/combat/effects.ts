import * as pc from 'playcanvas';

interface Fx { e: pc.Entity; t: number; life: number; kind: 'flash' | 'tracer' | 'puff' | 'hole'; vel?: pc.Vec3; mat?: pc.StandardMaterial }

/** Pooled lightweight combat effects: muzzle flash, tracers, impact puffs, bullet holes. */
export class Effects {
  private fx: Fx[] = [];
  private holes: pc.Entity[] = [];
  private holeIdx = 0;
  private flashMat: pc.StandardMaterial;
  private tracerMat: pc.StandardMaterial;
  private dustMat: pc.StandardMaterial;
  private bloodMat: pc.StandardMaterial;
  private sparkMat: pc.StandardMaterial;
  private holeMat: pc.StandardMaterial;
  private flashLight: pc.Entity;

  constructor(private root: pc.Entity) {
    const emissive = (c: pc.Color, i: number, opacity = 1) => {
      const m = new pc.StandardMaterial();
      m.diffuse = new pc.Color(0, 0, 0);
      m.emissive = c; m.emissiveIntensity = i;
      m.useLighting = false;
      if (opacity < 1) { m.opacity = opacity; m.blendType = pc.BLEND_ADDITIVE; m.depthWrite = false; }
      m.update();
      return m;
    };
    this.flashMat = emissive(new pc.Color(1, 0.75, 0.35), 6, 0.95);
    this.tracerMat = emissive(new pc.Color(1, 0.85, 0.55), 3, 0.7);
    this.sparkMat = emissive(new pc.Color(1, 0.7, 0.3), 5, 0.9);
    const flat = (c: pc.Color, opacity: number) => {
      const m = new pc.StandardMaterial();
      m.diffuse = c; m.opacity = opacity; m.blendType = pc.BLEND_NORMAL; m.depthWrite = false; m.gloss = 0.1; m.update();
      return m;
    };
    this.dustMat = flat(new pc.Color(0.62, 0.58, 0.52), 0.55);
    this.bloodMat = flat(new pc.Color(0.35, 0.03, 0.03), 0.75);
    this.holeMat = flat(new pc.Color(0.05, 0.05, 0.05), 0.85);
    this.flashLight = new pc.Entity('muzzle-light');
    this.flashLight.addComponent('light', { type: 'omni', color: new pc.Color(1, 0.7, 0.35), range: 6, intensity: 0, castShadows: false });
    root.addChild(this.flashLight);
  }

  private spawn(kind: Fx['kind'], mat: pc.Material, pos: pc.Vec3, scale: pc.Vec3, life: number, shape: 'box' | 'sphere' | 'plane' = 'box') {
    const e = new pc.Entity(kind);
    e.addComponent('render', { type: shape, material: mat, castShadows: false, receiveShadows: false });
    e.setPosition(pos);
    e.setLocalScale(scale);
    this.root.addChild(e);
    const f: Fx = { e, t: 0, life, kind };
    this.fx.push(f);
    return f;
  }

  muzzleFlash(pos: pc.Vec3, dir: pc.Vec3) {
    const f = this.spawn('flash', this.flashMat, pos, new pc.Vec3(0.14, 0.14, 0.32), 0.05, 'sphere');
    f.e.lookAt(pos.x + dir.x, pos.y + dir.y, pos.z + dir.z);
    this.flashLight.setPosition(pos);
    this.flashLight.light!.intensity = 3;
  }

  tracer(from: pc.Vec3, to: pc.Vec3) {
    const len = from.distance(to);
    if (len < 0.5) return;
    const mid = new pc.Vec3().lerp(from, to, 0.5);
    const f = this.spawn('tracer', this.tracerMat, mid, new pc.Vec3(0.012, 0.012, Math.min(len, 18)), 0.06);
    f.e.lookAt(to);
  }

  impact(point: pc.Vec3, normal: pc.Vec3 | undefined, body: boolean) {
    const n = normal ?? new pc.Vec3(0, 1, 0);
    const count = body ? 4 : 6;
    for (let i = 0; i < count; i++) {
      const f = this.spawn('puff', body ? this.bloodMat : this.dustMat, point, new pc.Vec3(0.05, 0.05, 0.05), body ? 0.35 : 0.6, 'sphere');
      f.vel = new pc.Vec3(n.x + (Math.random() - 0.5) * 1.2, n.y + Math.random() * 0.8, n.z + (Math.random() - 0.5) * 1.2).mulScalar(body ? 1.4 : 2.2);
    }
    if (!body) {
      const sp = this.spawn('puff', this.sparkMat, point, new pc.Vec3(0.03, 0.03, 0.03), 0.08, 'sphere');
      sp.vel = new pc.Vec3();
      this.bulletHole(point, n);
    }
  }

  private bulletHole(point: pc.Vec3, n: pc.Vec3) {
    let e = this.holes[this.holeIdx];
    if (!e) {
      e = new pc.Entity('hole');
      e.addComponent('render', { type: 'plane', material: this.holeMat, castShadows: false });
      this.root.addChild(e);
      this.holes[this.holeIdx] = e;
    }
    this.holeIdx = (this.holeIdx + 1) % 40;
    e.setPosition(point.x + n.x * 0.01, point.y + n.y * 0.01, point.z + n.z * 0.01);
    // orient plane (Y up) to the surface normal
    const up = new pc.Vec3(0, 1, 0);
    const q = new pc.Quat();
    const axis = new pc.Vec3().cross(up, n);
    const ang = Math.acos(pc.math.clamp(up.dot(n), -1, 1)) * pc.math.RAD_TO_DEG;
    if (axis.length() < 1e-4) q.setFromAxisAngle(new pc.Vec3(1, 0, 0), n.y < 0 ? 180 : 0);
    else q.setFromAxisAngle(axis.normalize(), ang);
    e.setRotation(q);
    const s = 0.05 + Math.random() * 0.02;
    e.setLocalScale(s, 1, s);
  }

  update(dt: number) {
    const L = this.flashLight.light!;
    if (L.intensity > 0) L.intensity = Math.max(0, L.intensity - dt * 60);
    for (const f of this.fx) {
      f.t += dt;
      if (f.vel) {
        f.vel.y -= 6 * dt;
        const p = f.e.getPosition();
        f.e.setPosition(p.x + f.vel.x * dt, p.y + f.vel.y * dt, p.z + f.vel.z * dt);
        const s = 0.05 + f.t * 0.25;
        f.e.setLocalScale(s, s, s);
      }
    }
    for (let i = this.fx.length - 1; i >= 0; i--) {
      if (this.fx[i].t >= this.fx[i].life) { this.fx[i].e.destroy(); this.fx.splice(i, 1); }
    }
  }
}
