import * as pc from 'playcanvas';
import type { Assets } from '../core/assets';
import type { Humanoid } from '../entities/humanoid';
import { WEAPONS, type WeaponId } from './weapons';

/**
 * Places a weapon model in a character's right hand (pointing along the aim
 * direction) or in its holster. Driven per-frame from bone positions so it
 * doesn't depend on per-rig bone axis conventions.
 */
export class WeaponVisual {
  readonly holder: pc.Entity;
  readonly id: WeaponId;
  private tmp = new pc.Vec3();
  private tmp2 = new pc.Vec3();

  constructor(assets: Assets, root: pc.Entity, id: WeaponId) {
    this.id = id;
    this.holder = new pc.Entity(`weapon:${id}`);
    root.addChild(this.holder);
    const def = WEAPONS[id];
    if (!def.model) return;
    const m = assets.instance(def.model);
    if (def.visual.keep) {
      for (const r of m.findComponents('render') as pc.RenderComponent[]) {
        if (!def.visual.keep.some((k) => r.entity.name === k)) r.entity.enabled = false;
      }
    }
    for (const r of m.findComponents('render') as pc.RenderComponent[]) { r.castShadows = true; }
    const inner = new pc.Entity('inner');
    inner.addChild(m);
    // barrel (+X) -> -Z (PlayCanvas forward)
    inner.setLocalEulerAngles(0, 90, 0);
    const [gx, gy, gz] = def.visual.grip;
    m.setLocalPosition(-gx, -gy, -gz);
    this.holder.addChild(inner);
  }

  set visible(v: boolean) { this.holder.enabled = v; }

  /** In hand, aimed at a world point. */
  inHand(h: Humanoid, aimPoint: pc.Vec3 | null, relaxed: boolean) {
    const hand = h.bonePos('hand_r', this.tmp);
    // nudge from the wrist bone into the palm
    const yawRad = h.yaw * pc.math.DEG_TO_RAD;
    const fx = Math.sin(yawRad), fz = Math.cos(yawRad);
    hand.x += fx * 0.06; hand.z += fz * 0.06; hand.y -= 0.02;
    this.holder.setPosition(hand);
    if (aimPoint && !relaxed) {
      this.holder.lookAt(aimPoint);
    } else {
      // low-ready: point forward and down
      this.tmp2.set(hand.x + fx * 2, hand.y - 1.1, hand.z + fz * 2);
      this.holder.lookAt(this.tmp2);
    }
  }

  holstered(h: Humanoid) {
    const yawRad = h.yaw * pc.math.DEG_TO_RAD;
    const fx = Math.sin(yawRad), fz = Math.cos(yawRad);
    const rx = -Math.cos(yawRad), rz = Math.sin(yawRad);
    const def = WEAPONS[this.id];
    if (def.holster === 'thigh') {
      const p = h.bonePos('thigh_r', this.tmp);
      this.holder.setPosition(p.x + rx * 0.13 - fx * 0.02, p.y - 0.08, p.z + rz * 0.13 - fz * 0.02);
      this.tmp2.set(p.x + rx * 0.13 + fx * 0.3, p.y - 0.9, p.z + rz * 0.13 + fz * 0.3);
      this.holder.lookAt(this.tmp2);
    } else {
      const p = h.bonePos('spine_03', this.tmp);
      this.holder.setPosition(p.x - fx * 0.2, p.y - 0.05, p.z - fz * 0.2);
      this.tmp2.set(p.x - fx * 0.2 + rx * 0.6, p.y + 0.8, p.z - fz * 0.2 + rz * 0.6);
      this.holder.lookAt(this.tmp2);
    }
  }

  /** Muzzle world position for the current transform. */
  muzzle(out = new pc.Vec3()): pc.Vec3 {
    const def = WEAPONS[this.id];
    const fwd = this.holder.forward, up = this.holder.up;
    const p = this.holder.getPosition();
    return out.set(
      p.x + fwd.x * def.visual.muzzleFwd + up.x * def.visual.muzzleUp,
      p.y + fwd.y * def.visual.muzzleFwd + up.y * def.visual.muzzleUp,
      p.z + fwd.z * def.visual.muzzleFwd + up.z * def.visual.muzzleUp,
    );
  }
}
