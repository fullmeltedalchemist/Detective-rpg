import * as pc from 'playcanvas';
import type { Assets } from '../core/assets';

/**
 * Human character: Quaternius CC0 base body + painted outfit, hair, and real
 * motion clips from the Universal Animation Library (UAL1/UAL2), driven by the
 * PlayCanvas anim system with a masked upper-body layer for aiming/punching.
 * Procedural overrides (aim pitch, cuffed arms, hands up) are applied after
 * the animation pass each frame.
 */

export type Pose = 'normal' | 'cuffed' | 'talk' | 'handsUp' | 'kneel';
export type AimStyle = 'none' | 'pistol' | 'rifle';
export type OneShot =
  | 'punchJab' | 'punchCross' | 'hook' | 'hitChest' | 'hitHead' | 'knockback' | 'death' | 'getUp'
  | 'reload' | 'shoot' | 'interact' | 'pickup' | 'roll';

export interface HumanLook {
  body: 'm' | 'f';
  outfit: string;
  hair?: string[]; // e.g. ['hair_simpleparted','eyebrows_regular']
  hairTint?: [number, number, number];
  scale?: number;
}

const CLIPS = {
  idle: 'Idle_Loop', walk: 'Walk_Loop', jog: 'Jog_Fwd_Loop', sprint: 'Sprint_Loop', crouch: 'Crouch_Idle_Loop', crouchWalk: 'Crouch_Fwd_Loop',
  talk: 'Idle_Talking_Loop', drive: 'Driving_Loop', kneel: 'Fixing_Kneeling', foldArms: 'Idle_FoldArms_Loop', phone: 'Idle_TalkingPhone_Loop',
  pistolIdle: 'Pistol_Idle_Loop', aim: 'Pistol_Aim_Neutral', aimUp: 'Pistol_Aim_Up', aimDown: 'Pistol_Aim_Down',
  shoot: 'Pistol_Shoot', reload: 'Pistol_Reload', jab: 'Punch_Jab', cross: 'Punch_Cross', hook: 'Melee_Hook', block: 'Sword_Block',
  hitChest: 'Hit_Chest', hitHead: 'Hit_Head', knockback: 'Hit_Knockback', death: 'Death01', getUp: 'LayToIdle', roll: 'Roll',
  interact: 'Interact', pickup: 'PickUp_Table', shield: 'Idle_Shield_Loop',
} as const;

const ONESHOT_CLIP: Record<OneShot, { clip: string; layer: 'base' | 'upper'; speed?: number }> = {
  punchJab: { clip: CLIPS.jab, layer: 'upper', speed: 1.25 },
  punchCross: { clip: CLIPS.cross, layer: 'upper', speed: 1.2 },
  hook: { clip: CLIPS.hook, layer: 'upper', speed: 1.1 },
  hitChest: { clip: CLIPS.hitChest, layer: 'upper', speed: 1.2 },
  hitHead: { clip: CLIPS.hitHead, layer: 'upper', speed: 1.2 },
  knockback: { clip: CLIPS.knockback, layer: 'base' },
  death: { clip: CLIPS.death, layer: 'base' },
  getUp: { clip: CLIPS.getUp, layer: 'base' },
  reload: { clip: CLIPS.reload, layer: 'upper' },
  shoot: { clip: CLIPS.shoot, layer: 'upper', speed: 1.6 },
  interact: { clip: CLIPS.interact, layer: 'upper' },
  pickup: { clip: CLIPS.pickup, layer: 'base' },
  roll: { clip: CLIPS.roll, layer: 'base', speed: 1.1 },
};

/** Shared animation registry (tracks loaded once). */
export class AnimLibrary {
  readonly tracks = new Map<string, pc.AnimTrack>();
  constructor(assets: Assets) {
    for (const key of ['ual1', 'ual2']) {
      const c = assets.container(key);
      if (!c) continue;
      for (const a of c.animations) {
        const t = a.resource as pc.AnimTrack;
        this.tracks.set(t.name || a.name, t);
      }
    }
  }
  get ok() { return this.tracks.size > 0; }
}

interface BoneRef { e: pc.Entity; bindLocal: pc.Quat; parentBind: pc.Quat; parentBindInv: pc.Quat }

const tmpQ = new pc.Quat();
const tmpQ2 = new pc.Quat();
const AX = new pc.Vec3(1, 0, 0), AY = new pc.Vec3(0, 1, 0), AZ = new pc.Vec3(0, 0, 1);

export class Humanoid {
  readonly entity: pc.Entity;
  readonly model: pc.Entity;
  private anim!: pc.AnimComponent;
  private base!: pc.AnimComponentLayer;
  private upper!: pc.AnimComponentLayer;
  ok = false;
  speed = 0;
  yaw = 0;
  pose: Pose = 'normal';
  aim: AimStyle = 'none';
  aimPitch = 0; // degrees, + up
  block = false;
  crouch = false;
  driving = false;
  /** 'alive' | 'down' (knocked down, can get up) | 'dead' */
  life: 'alive' | 'down' | 'dead' = 'alive';
  readonly height: number;
  private baseState = '';
  private upperState = '';
  private oneShot: { name: OneShot; t: number; dur: number; layer: 'base' | 'upper' } | null = null;
  private upperWeight = 0;
  private bones = new Map<string, BoneRef>();
  private poseBlend = 0;
  private sockets = new Map<string, pc.Entity>();

  constructor(assets: Assets, private lib: AnimLibrary, look: HumanLook, name: string) {
    this.entity = new pc.Entity(name);
    this.model = assets.instance(look.body === 'm' ? 'hero_m' : 'hero_f');
    this.entity.addChild(this.model);
    this.height = look.body === 'm' ? 1.81 : 1.77;
    this.ok = !this.model.name.startsWith('missing:') && lib.ok;
    if (this.model.name.startsWith('missing:')) return;
    const s = look.scale ?? (look.body === 'm' ? 0.99 : 0.97);
    this.model.setLocalScale(s, s, s);

    // Outfit material
    const renders = this.model.findComponents('render') as pc.RenderComponent[];
    for (const r of renders) {
      r.castShadows = true;
      for (const mi of r.meshInstances) {
        const m = mi.material as pc.StandardMaterial;
        if (/Superhero/i.test(m.name)) {
          const mm = m.clone() as pc.StandardMaterial;
          const diff = assets.tex(`outfit:${look.outfit}_diff`);
          const nor = assets.tex(`outfit:${look.outfit}_nor`);
          if (diff) mm.diffuseMap = diff;
          if (nor) mm.normalMap = nor;
          mm.metalnessMap = null as any;
          mm.glossMap = null as any;
          mm.gloss = 0.32;
          mm.metalness = 0;
          mm.useMetalness = true;
          mm.update();
          mi.material = mm;
        }
      }
    }
    // Capture body bones before anything else is attached (hair files carry their own armature)
    this.captureBones();
    // Hair: move the skinned hair meshes onto this character and bind them to the body skeleton
    for (const h of look.hair ?? []) {
      const he = assets.instance(h);
      if (he.name.startsWith('missing:')) continue;
      const renders = he.findComponents('render') as pc.RenderComponent[];
      for (const r of renders) {
        const re = r.entity;
        re.parent?.removeChild(re);
        this.model.addChild(re);
        re.setLocalPosition(0, 0, 0); re.setLocalEulerAngles(0, 0, 0); re.setLocalScale(1, 1, 1);
        if (look.hairTint) {
          for (const mi of r.meshInstances) {
            const mm = (mi.material as pc.StandardMaterial).clone() as pc.StandardMaterial;
            mm.diffuse = new pc.Color(...look.hairTint);
            mm.update();
            mi.material = mm;
          }
        }
      }
      he.destroy();
      for (const r of renders) { r.castShadows = true; r.rootBone = this.model; }
    }
    if (lib.ok) this.setupAnim();
  }

  private captureBones() {
    for (const n of ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head', 'clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r', 'hand_l', 'hand_r', 'thigh_l', 'thigh_r']) {
      const e = this.model.findByName(n) as pc.Entity | null;
      if (!e) continue;
      const parent = e.parent as pc.Entity;
      const pb = parent.getRotation().clone();
      this.bones.set(n, { e, bindLocal: e.getLocalRotation().clone(), parentBind: pb, parentBindInv: pb.clone().invert() });
    }
  }

  private setupAnim() {
    this.model.addComponent('anim', { activate: true, speed: 1 });
    this.anim = this.model.anim!;
    const states = (loop: boolean, names: string[]) => names.map((n) => ({ name: n, speed: 1, loop }));
    const loops = [CLIPS.idle, CLIPS.walk, CLIPS.jog, CLIPS.sprint, CLIPS.crouch, CLIPS.crouchWalk, CLIPS.talk, CLIPS.drive, CLIPS.foldArms, CLIPS.phone, CLIPS.pistolIdle, CLIPS.shield];
    const baseOnce = [CLIPS.kneel, CLIPS.knockback, CLIPS.death, CLIPS.getUp, CLIPS.pickup, CLIPS.roll];
    const upperLoops = [CLIPS.pistolIdle, CLIPS.aim, CLIPS.aimUp, CLIPS.aimDown, CLIPS.block];
    const upperOnce = [CLIPS.shoot, CLIPS.reload, CLIPS.jab, CLIPS.cross, CLIPS.hook, CLIPS.hitChest, CLIPS.hitHead, CLIPS.interact];
    this.anim.loadStateGraph({
      layers: [
        { name: 'base', states: [{ name: 'START' }, ...states(true, loops), ...states(false, baseOnce)], transitions: [] },
        { name: 'upper', states: [{ name: 'START' }, ...states(true, upperLoops), ...states(false, upperOnce)], transitions: [] },
      ],
      parameters: {},
    } as any);
    for (const n of [...loops, ...baseOnce]) {
      const t = this.lib.tracks.get(n);
      if (t) this.anim.assignAnimation(n, t, 'base');
    }
    for (const n of [...upperLoops, ...upperOnce]) {
      const t = this.lib.tracks.get(n);
      if (t) this.anim.assignAnimation(n, t, 'upper');
    }
    this.base = this.anim.findAnimationLayer('base')!;
    this.upper = this.anim.findAnimationLayer('upper')!;
    // Upper layer only drives spine_01 and above (arms, head)
    this.upper.mask = { 'Armature/root/pelvis/spine_01': { children: true } };
    this.upper.weight = 0;
    this.toBase(CLIPS.idle, 0);
  }

  private toBase(state: string, t = 0.22) {
    if (!this.base || this.baseState === state) return;
    this.baseState = state;
    if (t <= 0) this.base.play(state); else this.base.transition(state, t);
  }

  private toUpper(state: string, t = 0.15) {
    if (!this.upper || this.upperState === state) return;
    this.upperState = state;
    if (t <= 0) this.upper.play(state); else this.upper.transition(state, t);
  }

  /** Play a one-shot clip. Returns its duration in seconds. */
  play(name: OneShot): number {
    if (!this.anim) return 0.4;
    const def = ONESHOT_CLIP[name];
    const track = this.lib.tracks.get(def.clip);
    const dur = (track?.duration ?? 0.6) / (def.speed ?? 1);
    this.oneShot = { name, t: 0, dur, layer: def.layer };
    const layer = def.layer === 'base' ? this.base : this.upper;
    const st = def.clip;
    if (def.layer === 'base') this.baseState = st; else this.upperState = st;
    layer.play(st);
    if (def.layer === 'upper') this.upperWeight = 1;
    this.anim.speed = def.speed ?? 1;
    return dur;
  }

  get busy() { return !!this.oneShot; }
  get busyWith() { return this.oneShot?.name ?? null; }

  /** World-space socket entity attached to a bone (created on demand). */
  socket(bone: 'hand_r' | 'hand_l' | 'spine_03' | 'thigh_r' | 'Head'): pc.Entity {
    let s = this.sockets.get(bone);
    if (s) return s;
    s = new pc.Entity(`socket:${bone}`);
    const b = this.model.findByName(bone) as pc.Entity | null;
    (b ?? this.model).addChild(s);
    // counter the model scale so sockets are in metres
    this.sockets.set(bone, s);
    return s;
  }

  bonePos(name: string, out = new pc.Vec3()): pc.Vec3 {
    const b = this.bones.get(name)?.e ?? (this.model.findByName(name) as pc.Entity | null);
    return b ? out.copy(b.getPosition()) : out.copy(this.entity.getPosition());
  }

  update(dt: number) {
    this.entity.setLocalEulerAngles(0, this.yaw, 0);
    if (!this.anim) return;
    let animSpeed = 1;

    // One-shot bookkeeping
    if (this.oneShot) {
      this.oneShot.t += dt;
      const done = this.oneShot.t >= this.oneShot.dur;
      if (done) {
        const finished = this.oneShot;
        this.oneShot = null;
        this.anim.speed = 1;
        if (finished.layer === 'base' && finished.name === 'death') {
          // stay on the last frame
          this.oneShot = { ...finished, t: finished.dur, dur: Infinity };
        } else if (finished.layer === 'base') {
          this.baseState = '';
        } else {
          this.upperState = '';
        }
      } else {
        animSpeed = this.anim.speed;
      }
    }

    // ---- Base layer selection ----
    const baseLocked = this.oneShot?.layer === 'base';
    if (!baseLocked) {
      const sp = this.speed;
      if (this.life === 'dead') { /* handled by death one-shot */ }
      else if (this.life === 'down') this.toBase(CLIPS.death, 0.15);
      else if (this.driving) this.toBase(CLIPS.drive);
      else if (this.pose === 'kneel') this.toBase(CLIPS.kneel, 0.3);
      else if (this.crouch) this.toBase(sp > 0.3 ? CLIPS.crouchWalk : CLIPS.crouch);
      else if (sp < 0.15) {
        if (this.pose === 'talk') this.toBase(CLIPS.talk, 0.35);
        else if (this.aim !== 'none') this.toBase(CLIPS.pistolIdle, 0.3);
        else this.toBase(CLIPS.idle, 0.3);
      } else if (sp < 2.4) { this.toBase(CLIPS.walk); animSpeed = pc.math.clamp(sp / 1.45, 0.6, 1.5); }
      else if (sp < 4.6) { this.toBase(CLIPS.jog); animSpeed = pc.math.clamp(sp / 3.4, 0.75, 1.35); }
      else { this.toBase(CLIPS.sprint); animSpeed = pc.math.clamp(sp / 5.6, 0.8, 1.3); }
      if (!this.oneShot) this.anim.speed = animSpeed;
    }

    // ---- Upper layer ----
    const upperLocked = this.oneShot?.layer === 'upper';
    let wantUpper = 0;
    if (upperLocked) wantUpper = 1;
    else if (this.life !== 'alive' || this.driving || this.pose === 'kneel') wantUpper = 0;
    else if (this.block) { this.toUpper(CLIPS.block, 0.1); wantUpper = 1; }
    else if (this.aim !== 'none') { this.toUpper(CLIPS.aim, 0.12); wantUpper = 1; }
    this.upperWeight += (wantUpper - this.upperWeight) * Math.min(1, dt * 12);
    this.upper.weight = this.upperWeight;

    // Procedural pose blend (cuffed / hands up)
    const target = this.pose === 'cuffed' || this.pose === 'handsUp' ? 1 : 0;
    this.poseBlend += (target - this.poseBlend) * Math.min(1, dt * 6);
  }

  /** Called after the animation system has evaluated (from the game's update handler). */
  postAnimate() {
    if (!this.anim || this.life === 'dead') return;
    // Aim pitch: bend the spine so the gun follows the camera
    if (this.aim !== 'none' && this.upperWeight > 0.2 && Math.abs(this.aimPitch) > 0.5) {
      const yawRad = this.yaw * pc.math.DEG_TO_RAD;
      const right = new pc.Vec3(-Math.cos(yawRad), 0, Math.sin(yawRad));
      for (const n of ['spine_02', 'spine_03']) {
        const b = this.bones.get(n);
        if (!b) continue;
        tmpQ.setFromAxisAngle(right, this.aimPitch * 0.5 * this.upperWeight);
        tmpQ2.copy(b.e.getRotation());
        b.e.setRotation(tmpQ.mul(tmpQ2));
      }
    }
    if (this.poseBlend < 0.01) return;
    const p = this.poseBlend;
    if (this.pose === 'cuffed' || (this.pose !== 'handsUp' && p > 0.01)) {
      // arms behind the back
      this.override('upperarm_l', [[AZ, 65], [AX, 35]], p);
      this.override('upperarm_r', [[AZ, -65], [AX, 35]], p);
      this.override('lowerarm_l', [[AY, -75]], p);
      this.override('lowerarm_r', [[AY, 75]], p);
    } else {
      this.override('upperarm_l', [[AZ, -60], [AX, -15]], p);
      this.override('upperarm_r', [[AZ, 60], [AX, -15]], p);
      this.override('lowerarm_l', [[AY, -85]], p);
      this.override('lowerarm_r', [[AY, 85]], p);
    }
  }

  /** Blend a bone toward a bind-relative pose given as model-space rotations. */
  private override(name: string, rots: [pc.Vec3, number][], w: number) {
    const b = this.bones.get(name);
    if (!b) return;
    const R = tmpQ.set(0, 0, 0, 1);
    for (const [axis, deg] of rots) { tmpQ2.setFromAxisAngle(axis, deg); R.mul2(tmpQ2, R); }
    const target = new pc.Quat().mul2(b.parentBindInv, R).mul(b.parentBind).mul(b.bindLocal);
    const cur = b.e.getLocalRotation().clone();
    const out = new pc.Quat().slerp(cur, target, w);
    b.e.setLocalRotation(out);
  }

  setPosition(x: number, y: number, z: number) { this.entity.setPosition(x, y, z); }
  get position() { return this.entity.getPosition(); }
  set visible(v: boolean) { this.entity.enabled = v; }
  get visible() { return this.entity.enabled; }

  die() {
    if (this.life === 'dead') return;
    this.life = 'dead';
    this.aim = 'none';
    this.block = false;
    this.upper && (this.upper.weight = 0);
    this.upperWeight = 0;
    this.play('death');
  }

  knockDown() {
    if (this.life !== 'alive') return;
    this.life = 'down';
    this.aim = 'none';
    this.play('knockback');
  }

  /** Reset after death (respawn). */
  revive() {
    this.life = 'alive';
    this.oneShot = null;
    this.baseState = '';
    this.upperState = '';
    if (this.anim) this.anim.speed = 1;
  }

  getUp(): number {
    if (this.life !== 'down') return 0;
    this.life = 'alive';
    return this.play('getUp');
  }
}

export { yawTowards, lerpAngle } from './character';
