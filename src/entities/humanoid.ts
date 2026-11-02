import * as pc from 'playcanvas';
import type { Assets } from '../core/assets';

/**
 * Human character.
 *
 * A hidden "driver" skeleton (the Quaternius UAL mannequin rig) is animated by the
 * PlayCanvas anim system — base locomotion layer + masked upper-body layer — and then
 * procedural layers are applied on top (aim pitch, hit flinch, limp, clutching a wound,
 * cuffed / hands-up poses). If a visual skin with a different skeleton is supplied
 * (e.g. Microsoft Rocketbox avatars), the driver pose is retargeted onto it each frame.
 *
 * Hit reactions are designed never to restart on every bullet:
 *  - every hit adds energy to a damped spring "flinch" (smooth, additive);
 *  - only heavy hits play a reaction clip, at most once per 1.1 s, never over another one-shot;
 *  - a fall plays exactly once, cross-faded from the current pose, then holds still.
 */

export type Pose = 'normal' | 'cuffed' | 'talk' | 'handsUp' | 'kneel';
export type AimStyle = 'none' | 'pistol' | 'rifle';
export type HitRegion = 'head' | 'torso' | 'limb' | 'leg' | 'arm';
export type OneShot =
  | 'punchJab' | 'punchCross' | 'hook' | 'hitChest' | 'hitHead' | 'knockback' | 'death' | 'getUp'
  | 'reload' | 'shoot' | 'interact' | 'pickup' | 'roll';

export interface HumanLook {
  body: 'm' | 'f';
  outfit: string;
  hair?: string[];
  hairTint?: [number, number, number];
  scale?: number;
  /** Rocketbox avatar key (assets/humans/rb/<key>.glb). Overrides body/outfit/hair visuals. */
  avatar?: string;
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
  hitChest: { clip: CLIPS.hitChest, layer: 'upper', speed: 1.1 },
  hitHead: { clip: CLIPS.hitHead, layer: 'upper', speed: 1.1 },
  knockback: { clip: CLIPS.knockback, layer: 'base' },
  death: { clip: CLIPS.death, layer: 'base' },
  getUp: { clip: CLIPS.getUp, layer: 'base' },
  reload: { clip: CLIPS.reload, layer: 'upper' },
  shoot: { clip: CLIPS.shoot, layer: 'upper', speed: 1.6 },
  interact: { clip: CLIPS.interact, layer: 'upper' },
  pickup: { clip: CLIPS.pickup, layer: 'base' },
  roll: { clip: CLIPS.roll, layer: 'base', speed: 1.1 },
};

/**
 * Which way (model-space yaw, degrees) each fall clip moves the body.
 * Measured from the clips by tests/hits.py; 0 = forward (+Z), 180 = backward.
 */
export const FALL_YAW: Record<'death', number> = { death: 180 };

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

/** UAL mannequin bone -> Rocketbox (3ds Max Biped) bone, parents before children. */
const RB_MAP: [string, string][] = [
  ['pelvis', 'Bip01_Pelvis'], ['spine_01', 'Bip01_Spine'],
  ['thigh_l', 'Bip01_L_Thigh'], ['calf_l', 'Bip01_L_Calf'], ['foot_l', 'Bip01_L_Foot'], ['ball_l', 'Bip01_L_Toe0'],
  ['thigh_r', 'Bip01_R_Thigh'], ['calf_r', 'Bip01_R_Calf'], ['foot_r', 'Bip01_R_Foot'], ['ball_r', 'Bip01_R_Toe0'],
  ['spine_02', 'Bip01_Spine1'], ['spine_03', 'Bip01_Spine2'], ['neck_01', 'Bip01_Neck'], ['Head', 'Bip01_Head'],
  ...(['l', 'r'] as const).flatMap((s): [string, string][] => {
    const S = s.toUpperCase();
    return [
      [`clavicle_${s}`, `Bip01_${S}_Clavicle`], [`upperarm_${s}`, `Bip01_${S}_UpperArm`], [`lowerarm_${s}`, `Bip01_${S}_Forearm`], [`hand_${s}`, `Bip01_${S}_Hand`],
      [`thumb_01_${s}`, `Bip01_${S}_Finger0`], [`thumb_02_${s}`, `Bip01_${S}_Finger01`], [`thumb_03_${s}`, `Bip01_${S}_Finger02`],
      [`index_01_${s}`, `Bip01_${S}_Finger1`], [`index_02_${s}`, `Bip01_${S}_Finger11`], [`index_03_${s}`, `Bip01_${S}_Finger12`],
      [`middle_01_${s}`, `Bip01_${S}_Finger2`], [`middle_02_${s}`, `Bip01_${S}_Finger21`], [`middle_03_${s}`, `Bip01_${S}_Finger22`],
      [`ring_01_${s}`, `Bip01_${S}_Finger3`], [`ring_02_${s}`, `Bip01_${S}_Finger31`], [`ring_03_${s}`, `Bip01_${S}_Finger32`],
      [`pinky_01_${s}`, `Bip01_${S}_Finger4`], [`pinky_02_${s}`, `Bip01_${S}_Finger41`], [`pinky_03_${s}`, `Bip01_${S}_Finger42`],
    ];
  }),
];

interface RetargetPair { src: pc.Entity; dst: pc.Entity; offset: pc.Quat }

/** Material gloss per Rocketbox part. */
const RB_GLOSS: Record<string, number> = { head: 0.42, body: 0.28, opacity: 0.35, equipment: 0.45, equpiment: 0.45, pistol: 0.6, hat: 0.3 };

const tmpQ = new pc.Quat();
const tmpQ2 = new pc.Quat();
/** Arm bones whose direction is aligned between the two rigs (bone -> the child it points at). */
const ARM_CHILD: Record<string, string> = Object.fromEntries((['l', 'r'] as const).flatMap((s) => [
  [`clavicle_${s}`, `upperarm_${s}`], [`upperarm_${s}`, `lowerarm_${s}`], [`lowerarm_${s}`, `hand_${s}`], [`hand_${s}`, `middle_01_${s}`],
]));
const tmpV = new pc.Vec3();

export class Humanoid {
  readonly entity: pc.Entity;
  /** Driver skeleton (animated). Visible itself unless a retarget skin is used. */
  readonly model: pc.Entity;
  private anim!: pc.AnimComponent;
  private base!: pc.AnimComponentLayer;
  private upper!: pc.AnimComponentLayer;
  ok = false;
  speed = 0;
  yaw = 0;
  pose: Pose = 'normal';
  aim: AimStyle = 'none';
  aimPitch = 0;
  block = false;
  crouch = false;
  driving = false;
  life: 'alive' | 'down' | 'dead' = 'alive';
  readonly height: number;
  private baseState = '';
  private upperState = '';
  private oneShot: { name: OneShot; t: number; dur: number; layer: 'base' | 'upper' } | null = null;
  private upperWeight = 0;
  private bones = new Map<string, BoneRef>();
  private poseBlend = 0;
  // ---- hit reactions ----
  private flinch = { amt: 0, vel: 0, dx: 0, dz: 1, region: 'torso' as HitRegion, side: 1 };
  private lastHitClip = -99;
  private clock = 0;
  readonly injury = { torso: 0, leg: 0, legSide: 1, arm: 0, armSide: 1, head: 0 };
  private clutchBlend = 0;
  /** Horizontal push (stagger) the owner applies to the root, m/s. */
  readonly stagger = new pc.Vec3();
  /** Diagnostics for tests: how many times each clip was started. */
  readonly clipStarts: Record<string, number> = {};
  private holding = false;
  /** What this character does when standing around (loitering, on the phone). */
  idleStyle: 'plain' | 'foldArms' | 'phone' = 'plain';
  /** Lying still: the skeleton pose captured when the fall finished, re-applied every frame
   * with the AnimComponent switched off (no re-evaluation, no flicker, no animation cost). */
  private frozen: { n: pc.GraphNode; p: pc.Vec3; r: pc.Quat }[] | null = null;
  private wantFreeze = false;
  private gait = 0;
  /** Optional retarget target (set by the avatar system). */
  retarget: ((driver: Humanoid) => void) | null = null;

  /** Rocketbox skin (when look.avatar is set). */
  skin: pc.Entity | null = null;
  private pairs: RetargetPair[] = [];
  private tgtPelvis: pc.Entity | null = null;
  private srcPelvis: pc.Entity | null = null;
  /** Avatar bones by animation-skeleton name (visible arms for weapons and hit volumes). */
  private tgtByName = new Map<string, pc.Entity>();

  constructor(assets: Assets, private lib: AnimLibrary, look: HumanLook, name: string, opts: { lod?: boolean; texTier?: string } = {}) {
    this.entity = new pc.Entity(name);
    // Rocketbox avatars are driven by the bare UAL skeleton; otherwise the Quaternius body is its own driver.
    const driverKey = look.avatar ? 'ual1' : (look.body === 'm' ? 'hero_m' : 'hero_f');
    this.model = assets.instance(driverKey);
    this.entity.addChild(this.model);
    this.height = look.body === 'm' ? 1.81 : 1.77;
    this.ok = !this.model.name.startsWith('missing:') && lib.ok;
    if (this.model.name.startsWith('missing:')) return;
    const s = look.scale ?? (look.body === 'm' ? 0.99 : 0.97);
    this.model.setLocalScale(s, s, s);
    if (look.avatar) this.setupAvatar(assets, look.avatar, opts);

    if (!look.avatar) {
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
            mm.gloss = 0.32; mm.metalness = 0; mm.useMetalness = true;
            mm.update();
            mi.material = mm;
          }
        }
      }
    }
    this.captureBones();
    if (!look.avatar) {
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
    }
    if (lib.ok) this.setupAnim();
  }

  /**
   * Attach a Rocketbox avatar and prepare retargeting from the driver skeleton.
   * Both rigs are compared in T-pose: the driver's rest pose and the skin's bind pose
   * (from the inverse bind matrices — the avatar's node rest pose is an A-pose).
   */
  private setupAvatar(assets: Assets, key: string, opts: { lod?: boolean; texTier?: string }) {
    const skin = assets.instance(`rb:${key}${opts.lod ? '_lod' : ''}`);
    if (skin.name.startsWith('missing:')) return;
    skin.setLocalScale(0.01, 0.01, 0.01);
    this.entity.addChild(skin);
    this.skin = skin;
    const tier = opts.texTier ?? '512';
    const renders = skin.findComponents('render') as pc.RenderComponent[];
    let skinInfo: pc.Skin | null = null;
    let meshNode: pc.Entity | null = null;
    for (const r of renders) {
      r.castShadows = true; r.receiveShadows = true;
      for (const mi of r.meshInstances) {
        if (mi.skinInstance && !skinInfo) { skinInfo = (mi.skinInstance as any).skin as pc.Skin; meshNode = r.entity; }
        const src = mi.material as pc.StandardMaterial;
        const matName = src.name; // e.g. m020_body, m020_opacity
        const part = matName.split('_').slice(1).join('_');
        const m = new pc.StandardMaterial();
        m.name = matName;
        m.useMetalness = true; m.metalness = part === 'pistol' ? 0.6 : 0;
        m.gloss = RB_GLOSS[part] ?? 0.3;
        const col = assets.tex(`rbt:${tier}/${matName}_color`) ?? assets.tex(`rbt:512/${matName}_color`);
        const nor = assets.tex(`rbt:512/${matName}_normal`);
        if (col) m.diffuseMap = col;
        if (nor) { m.normalMap = nor; m.bumpiness = 0.9; }
        if (part === 'opacity') {
          if (col) { m.opacityMap = col; m.opacityMapChannel = 'a'; }
          m.alphaTest = 0.45; m.cull = pc.CULLFACE_NONE; m.alphaToCoverage = false;
        }
        m.update();
        mi.material = m;
      }
    }
    // driver bind (T-pose) rotations, captured before animation starts
    const restRot = (e: pc.Entity) => e.getRotation().clone();
    // Bind-pose world transforms: the inverse bind matrices are expressed in the mesh's own
    // (Z-up, centimetre) frame, so bring them into the scene frame with the mesh node's rotation.
    const meshRot = new pc.Mat4();
    if (meshNode) meshRot.setTRS(pc.Vec3.ZERO, meshNode.getLocalRotation(), pc.Vec3.ONE);
    const ibm = new Map<string, pc.Mat4>();
    if (skinInfo) {
      const names: string[] = (skinInfo as any).boneNames;
      const mats: pc.Mat4[] = (skinInfo as any).inverseBindPose;
      names.forEach((n, i) => ibm.set(n, new pc.Mat4().mul2(meshRot, mats[i].clone().invert())));
    }
    const srcPel = this.model.findByName('pelvis') as pc.Entity | null;
    const dstPel = skin.findByName('Bip01_Pelvis') as pc.Entity | null;
    // scale the driver so hip heights match
    const pelIbm = ibm.get('Bip01_Pelvis');
    if (srcPel && pelIbm) {
      const bindY = pelIbm.getTranslation().y * 0.01;
      const srcY = srcPel.getPosition().y - this.entity.getPosition().y;
      const k = (bindY / Math.max(0.1, srcY)) * this.model.getLocalScale().x;
      this.model.setLocalScale(k, k, k);
    }
    const toTgt = new Map(RB_MAP);
    for (const [a, b] of RB_MAP) {
      const src = this.model.findByName(a) as pc.Entity | null;
      const dst = skin.findByName(b) as pc.Entity | null;
      const m = ibm.get(b);
      if (!src || !dst || !m) continue;
      const bind = new pc.Quat().setFromMat4(m);
      // The two reference poses differ in the arms (~30-40 deg per joint; legs agree): turn each
      // avatar arm bone so that in the reference pose it points where the animation bone points.
      const child = ARM_CHILD[a];
      const cm = child ? ibm.get(toTgt.get(child) ?? '') : undefined;
      const srcChild = child ? (this.model.findByName(child) as pc.Entity | null) : null;
      if (cm && srcChild) {
        const sd = srcChild.getPosition().clone().sub(src.getPosition()).normalize();
        const td = cm.getTranslation().sub(m.getTranslation()).normalize();
        const axis = new pc.Vec3().cross(td, sd);
        const ang = Math.acos(Math.max(-1, Math.min(1, td.dot(sd)))) * pc.math.RAD_TO_DEG;
        if (axis.lengthSq() > 1e-10 && ang > 0.5) bind.copy(new pc.Quat().setFromAxisAngle(axis.normalize(), ang).mul(bind));
      }
      const offset = restRot(src).invert().mul(bind);
      this.pairs.push({ src, dst, offset });
    }
    this.srcPelvis = srcPel; this.tgtPelvis = dstPel;
    for (const pr of this.pairs) this.tgtByName.set(pr.src.name, pr.dst);
    this.retarget = () => this.applyRetarget();
  }

  private applyRetarget() {
    if (this.srcPelvis && this.tgtPelvis) this.tgtPelvis.setPosition(this.srcPelvis.getPosition());
    for (const p of this.pairs) {
      tmpQ.copy(p.src.getRotation()).mul(p.offset);
      p.dst.setRotation(tmpQ);
    }
  }


  private captureBones() {
    for (const n of ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head', 'clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r',
      'lowerarm_l', 'lowerarm_r', 'hand_l', 'hand_r', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r']) {
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
    for (const n of [...loops, ...baseOnce]) { const t = this.lib.tracks.get(n); if (t) this.anim.assignAnimation(n, t, 'base'); }
    for (const n of [...upperLoops, ...upperOnce]) { const t = this.lib.tracks.get(n); if (t) this.anim.assignAnimation(n, t, 'upper'); }
    this.base = this.anim.findAnimationLayer('base')!;
    this.upper = this.anim.findAnimationLayer('upper')!;
    this.upper.mask = { 'Armature/root/pelvis/spine_01': { children: true } };
    this.upper.weight = 0;
    this.toBase(CLIPS.idle, 0);
  }

  private count(state: string) { this.clipStarts[state] = (this.clipStarts[state] ?? 0) + 1; }

  private toBase(state: string, t = 0.22) {
    if (!this.base || this.baseState === state) return;
    this.baseState = state;
    this.count(state);
    if (t <= 0) this.base.play(state); else this.base.transition(state, t);
  }

  private toUpper(state: string, t = 0.15) {
    if (!this.upper || this.upperState === state) return;
    this.upperState = state;
    this.count(state);
    if (t <= 0) this.upper.play(state); else this.upper.transition(state, t);
  }

  /**
   * Play a one-shot clip, cross-fading from the current pose. Returns its duration (s).
   * Once dead nothing else plays; while down only getting up (or dying) can play.
   */
  play(name: OneShot, blend = 0.12): number {
    if (!this.anim) return 0.4;
    if (this.life === 'dead' && name !== 'death' && name !== 'knockback') return 0;
    if (this.life === 'down' && !['getUp', 'death', 'knockback'].includes(name)) return 0;
    const def = ONESHOT_CLIP[name];
    const track = this.lib.tracks.get(def.clip);
    const speed = def.speed ?? 1;
    const dur = (track?.duration ?? 0.6) / speed;
    if (def.layer === 'base' && this.oneShot?.layer === 'upper') this.upperState = '';
    this.oneShot = { name, t: 0, dur, layer: def.layer };
    const layer = def.layer === 'base' ? this.base : this.upper;
    if (def.layer === 'base') this.baseState = def.clip; else this.upperState = def.clip;
    this.count(def.clip);
    layer.transition(def.clip, blend);
    this.anim.speed = speed;
    return dur;
  }

  get busy() { return !!this.oneShot && this.oneShot.dur !== Infinity; }
  get busyWith() { return this.oneShot?.name ?? null; }
  /** Lying still at the end of a fall. */
  get lyingStill() { return this.holding; }

  /**
   * React to a hit coming from `from` (world position). Small hits only flinch;
   * heavy hits add a stagger and (rate-limited) one reaction clip.
   */
  hit(region: HitRegion, severity: number, from: pc.Vec3 | null) {
    if (this.life === 'dead') return;
    const p = this.entity.getPosition();
    let dx = 0, dz = 1;
    if (from) { dx = p.x - from.x; dz = p.z - from.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; }
    const f = this.flinch;
    f.dx = dx; f.dz = dz; f.region = region; f.side = Math.random() < 0.5 ? -1 : 1;
    f.vel += 9 * Math.min(1, 0.35 + severity);
    const k = Math.min(1, severity);
    if (region === 'torso') this.injury.torso = Math.min(1, this.injury.torso + k * 0.6);
    else if (region === 'head') this.injury.head = Math.min(1, this.injury.head + k);
    else if (region === 'leg' || region === 'limb') { this.injury.leg = Math.min(1, this.injury.leg + k * 0.8); this.injury.legSide = f.side; }
    else if (region === 'arm') { this.injury.arm = Math.min(1, this.injury.arm + k * 0.8); this.injury.armSide = f.side; }
    if (this.life !== 'alive') return; // lying down: flinch only — stay down
    const push = (0.5 + severity * 1.5) * (region === 'leg' || region === 'limb' ? 1.3 : 1);
    this.stagger.x += dx * push; this.stagger.z += dz * push;
    if (severity >= 0.45 && this.clock - this.lastHitClip > 1.1 && !this.oneShot && this.pose === 'normal' && !this.crouch) {
      this.lastHitClip = this.clock;
      // very heavy hits (rifle) stagger the whole body; others are an upper-body reaction
      if (severity >= 0.95 && region !== 'head') this.play('knockback', 0.1);
      else this.play(region === 'head' ? 'hitHead' : 'hitChest', 0.08);
    }
  }

  /** Yaw for which `clip` falls away from `from`. */
  fallYawAwayFrom(from: pc.Vec3 | null, clip: 'death') {
    if (!from) return this.yaw;
    const p = this.entity.getPosition();
    const away = Math.atan2(p.x - from.x, p.z - from.z) * pc.math.RAD_TO_DEG;
    return away - FALL_YAW[clip];
  }

  /** World-space socket entity attached to a driver bone. */
  socket(bone: 'hand_r' | 'hand_l' | 'spine_03' | 'thigh_r' | 'Head'): pc.Entity {
    const s = new pc.Entity(`socket:${bone}`);
    const b = this.model.findByName(bone) as pc.Entity | null;
    (b ?? this.model).addChild(s);
    return s;
  }

  bonePos(name: string, out = new pc.Vec3()): pc.Vec3 {
    // arms: the visible avatar arm (it is adjusted after retargeting); everything else: the animation skeleton
    const vis = name.startsWith('upperarm') || name.startsWith('lowerarm') || name.startsWith('hand') ? this.tgtByName.get(name) : undefined;
    const b = vis ?? this.bones.get(name)?.e ?? (this.model.findByName(name) as pc.Entity | null);
    return b ? out.copy(b.getPosition()) : out.copy(this.entity.getPosition());
  }

  update(dt: number) {
    this.clock += dt;
    this.entity.setLocalEulerAngles(0, this.yaw, 0);
    // flinch spring
    const f = this.flinch;
    f.vel += (-f.amt * 70 - f.vel * 13) * dt;
    f.amt = pc.math.clamp(f.amt + f.vel * dt, -0.3, 1.4);
    this.injury.head = Math.max(0, this.injury.head - dt * 0.2);
    this.stagger.mulScalar(Math.max(0, 1 - dt * 6));
    if (!this.anim) return;
    let animSpeed = 1;

    if (this.oneShot && this.oneShot.dur !== Infinity) {
      this.oneShot.t += dt;
      const o = this.oneShot;
      if (o.layer === 'base' && o.name === 'death' && this.life !== 'alive') {
        // Freeze shortly BEFORE the fall clip ends: the frame on which a non-looping state
        // finishes evaluates the bind (standing) pose. Use the animation's own clock (it runs
        // on real frame time, not our capped dt) with a margin larger than one frame step.
        const animT = this.base && this.base.activeState === CLIPS.death ? this.base.activeStateCurrentTime : 0;
        if (Math.max(o.t, animT) >= o.dur - 0.15) o.t = o.dur;
      }
      if (this.oneShot.t >= this.oneShot.dur) {
        const done = this.oneShot;
        this.oneShot = null;
        this.anim.speed = 1;
        if (done.layer === 'base' && done.name === 'death' && this.life !== 'alive') {
          // lie still on the last frame until recovery explicitly starts
          this.oneShot = { ...done, t: done.dur, dur: Infinity };
          this.holding = true;
          this.wantFreeze = true;
        } else if (done.layer === 'base') this.baseState = '';
        else this.upperState = '';
      }
    }

    const baseLocked = this.oneShot?.layer === 'base';
    if (!baseLocked && this.life === 'alive') {
      const sp = this.speed;
      if (this.driving) this.toBase(CLIPS.drive);
      else if (this.pose === 'kneel') this.toBase(CLIPS.kneel, 0.45);
      else if (this.crouch) this.toBase(sp > 0.3 ? CLIPS.crouchWalk : CLIPS.crouch, 0.4);
      else {
        // gait with hysteresis so speeds near a threshold don't flicker between clips
        const up = [0.25, 2.6, 4.9], down = [0.1, 2.1, 4.2];
        let g = this.gait;
        while (g < 3 && sp > up[g]) g++;
        while (g > 0 && sp < down[g - 1]) g--;
        this.gait = g;
        if (g === 0) {
          if (this.pose === 'talk') this.toBase(CLIPS.talk, 0.35);
          else if (this.aim !== 'none') this.toBase(CLIPS.pistolIdle, 0.3);
          else if (this.idleStyle === 'foldArms' && this.pose === 'normal' && this.injury.torso < 0.25 && this.injury.arm < 0.25) this.toBase(CLIPS.foldArms, 0.4);
          else if (this.idleStyle === 'phone' && this.pose === 'normal' && this.injury.torso < 0.25 && this.injury.arm < 0.25) this.toBase(CLIPS.phone, 0.4);
          else this.toBase(CLIPS.idle, 0.3);
        } else if (g === 1) { this.toBase(CLIPS.walk, 0.3); animSpeed = pc.math.clamp(sp / 1.45, 0.6, 1.5); }
        else if (g === 2) { this.toBase(CLIPS.jog, 0.3); animSpeed = pc.math.clamp(sp / 3.4, 0.75, 1.35); }
        else { this.toBase(CLIPS.sprint, 0.3); animSpeed = pc.math.clamp(sp / 5.6, 0.8, 1.3); }
      }
      if (this.injury.leg > 0.2) animSpeed *= 1 - this.injury.leg * 0.25;
      if (!this.oneShot) this.anim.speed = animSpeed;
    }

    const upperLocked = this.oneShot?.layer === 'upper';
    let wantUpper = 0;
    if (upperLocked) wantUpper = 1;
    else if (this.life !== 'alive' || this.driving || this.pose === 'kneel' || this.crouch) wantUpper = 0;
    else if (this.block) { this.toUpper(CLIPS.block, 0.1); wantUpper = 1; }
    else if (this.aim !== 'none') { this.toUpper(CLIPS.aim, 0.12); wantUpper = 1; }
    if (this.life !== 'alive') wantUpper = 0;
    this.upperWeight += (wantUpper - this.upperWeight) * Math.min(1, dt * (wantUpper > this.upperWeight ? 16 : 7));
    this.upper.weight = this.upperWeight;

    // kneeling only happens when surrendering: keep the hands up while on the knees
    const target = this.pose === 'cuffed' || this.pose === 'handsUp' || this.pose === 'kneel' ? 1 : 0;
    this.poseBlend += (target - this.poseBlend) * Math.min(1, dt * 6);
    const wound = Math.max(this.injury.torso, this.injury.arm);
    const clutch = this.life === 'alive' && wound > 0.25 && this.aim === 'none' && !this.block && this.poseBlend < 0.1 && !this.driving && !upperLocked ? Math.min(1, wound * 1.3) : 0;
    this.clutchBlend += (clutch - this.clutchBlend) * Math.min(1, dt * 3);
  }

  /** Called after the animation system has evaluated (from the game's update handler). */
  postAnimate() {
    if (!this.anim) return;
    if (this.wantFreeze) this.freeze();
    else if (this.frozen) for (const f of this.frozen) { f.n.setLocalPosition(f.p); f.n.setLocalRotation(f.r); }
    this.applyFlinch();
    if (this.life === 'alive') {
      this.applyAimPitch();
      this.applyInjuries();
      this.applyPoses();
    }
    this.retarget?.(this);
  }

  private applyAimPitch() {
    if (this.aim === 'none' || this.upperWeight < 0.2 || Math.abs(this.aimPitch) < 0.5) return;
    const yr = this.yaw * pc.math.DEG_TO_RAD;
    const right = tmpV.set(-Math.cos(yr), 0, Math.sin(yr));
    this.bend('spine_02', right, this.aimPitch * 0.5 * this.upperWeight);
    this.bend('spine_03', right, this.aimPitch * 0.5 * this.upperWeight);
  }

  /**
   * Hands up / cuffed: point each arm bone in a direction relative to the body (outward, up,
   * forward, back). Direction-based, so it is independent of any rig's bind-pose frames.
   */
  private applyPoses() {
    if (this.poseBlend < 0.01) return;
    const p = this.poseBlend;
    const chest = this.bones.get('spine_03')?.e;
    if (!chest) return;
    const c = chest.getPosition();
    const yr = this.yaw * pc.math.DEG_TO_RAD;
    const fwd = new pc.Vec3(Math.sin(yr), 0, Math.cos(yr));
    const up = pc.Vec3.UP;
    const up2 = this.pose === 'handsUp' || this.pose === 'kneel';
    if (this.pose === 'kneel') {
      // the kneeling clip leans forward over its work: sit the torso up straight
      const s1 = this.bones.get('spine_01')?.e, neck = this.bones.get('neck_01')?.e;
      if (s1 && neck) this.pointBone(s1, neck, up.clone().add(fwd.clone().mulScalar(0.08)).normalize(), 0.85 * p);
    }
    for (const sd of ['l', 'r']) {
      const ua = this.bones.get(`upperarm_${sd}`)?.e, la = this.bones.get(`lowerarm_${sd}`)?.e, hand = this.bones.get(`hand_${sd}`)?.e;
      if (!ua || !la || !hand) continue;
      const sp = ua.getPosition();
      const side = new pc.Vec3(sp.x - c.x, 0, sp.z - c.z);
      // keep "side" perpendicular to forward so a twisted torso doesn't flip it
      side.sub(fwd.clone().mulScalar(side.dot(fwd)));
      if (side.lengthSq() < 1e-6) continue;
      side.normalize();
      let upperDir: pc.Vec3, foreDir: pc.Vec3;
      if (up2) {
        // "don't shoot": elbows out at shoulder height, forearms straight up, palms forward
        upperDir = side.clone().mulScalar(0.9).add(up.clone().mulScalar(0.25)).add(fwd.clone().mulScalar(0.12)).normalize();
        foreDir = up.clone().mulScalar(1).add(side.clone().mulScalar(0.12)).add(fwd.clone().mulScalar(0.06)).normalize();
      } else {
        // cuffed behind the back: upper arms down and back, forearms across the lower back
        upperDir = up.clone().mulScalar(-0.95).add(fwd.clone().mulScalar(-0.3)).add(side.clone().mulScalar(0.1)).normalize();
        foreDir = side.clone().mulScalar(-0.9).add(fwd.clone().mulScalar(-0.22)).add(up.clone().mulScalar(-0.28)).normalize();
      }
      this.pointBone(ua, la, upperDir, p);
      this.pointBone(la, hand, foreDir, p);
    }
  }

  /** Turn a bone (in world space) so the direction to its child moves toward `dir`, by weight w. */
  private pointBone(bone: pc.GraphNode, child: pc.GraphNode, dir: pc.Vec3, w: number) {
    const cur = child.getPosition().clone().sub(bone.getPosition()).normalize();
    const d = Math.max(-1, Math.min(1, cur.dot(dir)));
    const ang = Math.acos(d) * pc.math.RAD_TO_DEG * w;
    if (ang < 0.2) return;
    const axis = new pc.Vec3().cross(cur, dir);
    if (axis.lengthSq() < 1e-9) return;
    tmpQ.setFromAxisAngle(axis.normalize(), ang);
    tmpQ2.copy(bone.getRotation());
    bone.setRotation(tmpQ.mul(tmpQ2));
  }

  /** Rotate a bone in world space about an axis (additive, on top of the animation). */
  private bend(name: string, axis: pc.Vec3, deg: number) {
    const b = this.bones.get(name);
    if (!b || Math.abs(deg) < 0.01) return;
    tmpQ.setFromAxisAngle(axis, deg);
    tmpQ2.copy(b.e.getRotation());
    b.e.setRotation(tmpQ.mul(tmpQ2));
  }

  private applyFlinch() {
    const f = this.flinch;
    if (Math.abs(f.amt) < 0.01) return;
    // Bend the upper body away from the impact: rotate "up" toward the push direction.
    const axis = new pc.Vec3(f.dz, 0, -f.dx);
    if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0);
    axis.normalize();
    const a = f.amt * (this.life === 'alive' ? 1 : 0.35);
    switch (f.region) {
      case 'head':
        this.bend('spine_03', axis, 5 * a); this.bend('neck_01', axis, 12 * a); this.bend('Head', axis, 14 * a); break;
      case 'leg': case 'limb':
        this.bend('pelvis', axis, 4 * a); this.bend('spine_02', axis, 6 * a);
        this.bend(f.side > 0 ? 'thigh_l' : 'thigh_r', axis, 10 * a); break;
      case 'arm':
        this.bend('spine_03', axis, 5 * a); this.bend(f.side > 0 ? 'upperarm_l' : 'upperarm_r', axis, 20 * a); break;
      default:
        this.bend('spine_01', axis, 5 * a); this.bend('spine_02', axis, 8 * a); this.bend('spine_03', axis, 8 * a); this.bend('neck_01', axis, -5 * a);
    }
  }

  private applyInjuries() {
    const yr = this.yaw * pc.math.DEG_TO_RAD;
    if (this.injury.leg > 0.2 && this.speed > 0.3) {
      const fwd = tmpV.set(Math.sin(yr), 0, Math.cos(yr));
      const lean = Math.sin(this.clock * 6.5) * this.injury.leg;
      this.bend('pelvis', fwd, 6 * lean * this.injury.legSide);
      this.bend('spine_02', fwd, -4 * lean * this.injury.legSide);
    }
    const c = this.clutchBlend;
    if (c > 0.01) {
      const right = new pc.Vec3(-Math.cos(yr), 0, Math.sin(yr));
      this.bend('spine_02', right, 7 * c); this.bend('spine_03', right, 6 * c);
      // left hand pressed to the wound: elbow down and forward, forearm across the stomach
      const ua = this.bones.get('upperarm_l')?.e, la = this.bones.get('lowerarm_l')?.e, hand = this.bones.get('hand_l')?.e, chest = this.bones.get('spine_03')?.e;
      if (ua && la && hand && chest) {
        const fwd = new pc.Vec3(Math.sin(yr), 0, Math.cos(yr));
        const sp = ua.getPosition(), cp = chest.getPosition();
        const side = new pc.Vec3(sp.x - cp.x, 0, sp.z - cp.z);
        side.sub(fwd.clone().mulScalar(side.dot(fwd)));
        if (side.lengthSq() > 1e-6) {
          side.normalize();
          this.pointBone(ua, la, pc.Vec3.UP.clone().mulScalar(-0.82).add(fwd.clone().mulScalar(0.42)).add(side.clone().mulScalar(0.12)).normalize(), c);
          this.pointBone(la, hand, side.clone().mulScalar(-0.85).add(fwd.clone().mulScalar(0.32)).add(pc.Vec3.UP.clone().mulScalar(0.3)).normalize(), c);
        }
      }
    }
  }

  setPosition(x: number, y: number, z: number) { this.entity.setPosition(x, y, z); }
  get position() { return this.entity.getPosition(); }
  set visible(v: boolean) { this.entity.enabled = v; }
  get visible() { return this.entity.enabled; }

  /**
   * Fatal injury: exactly one fall, cross-faded from the current pose and directed away
   * from the attacker. If already lying down, stay down (no second fall).
   */
  die(from: pc.Vec3 | null = null, region: HitRegion = 'torso') {
    if (this.life === 'dead') return;
    const wasDown = this.life === 'down';
    this.life = 'dead';
    this.aim = 'none'; this.block = false; this.crouch = false;
    this.upperWeight = 0;
    if (this.upper) this.upper.weight = 0;
    if (wasDown) return;
    void region;
    this.yaw = this.fallYawAwayFrom(from, 'death');
    this.entity.setLocalEulerAngles(0, this.yaw, 0);
    this.oneShot = null;
    this.holding = false;
    this.unfreeze();
    this.play('death', 0.1);
  }

  /** Knocked out: one fall (away from the attacker), then lie still until getUp(). */
  knockDown(from: pc.Vec3 | null = null) {
    if (this.life !== 'alive') return;
    this.life = 'down';
    this.aim = 'none'; this.crouch = false;
    this.upperWeight = 0;
    if (this.upper) this.upper.weight = 0;
    this.yaw = this.fallYawAwayFrom(from, 'death');
    this.entity.setLocalEulerAngles(0, this.yaw, 0);
    this.oneShot = null;
    this.holding = false;
    this.unfreeze();
    this.play('death', 0.1);
  }

  private freeze() {
    this.wantFreeze = false;
    const out: { n: pc.GraphNode; p: pc.Vec3; r: pc.Quat }[] = [];
    this.model.forEach((n: pc.GraphNode) => { if (n !== this.model) out.push({ n, p: n.getLocalPosition().clone(), r: n.getLocalRotation().clone() }); });
    this.frozen = out;
    if (this.anim) this.anim.enabled = false;
  }

  private unfreeze() {
    this.wantFreeze = false;
    if (!this.frozen) return;
    this.frozen = null;
    if (this.anim) this.anim.enabled = true;
  }

  /** Reset after the player respawns. */
  revive() {
    this.life = 'alive';
    this.oneShot = null;
    this.holding = false;
    this.unfreeze();
    this.baseState = '';
    this.upperState = '';
    this.injury.torso = this.injury.leg = this.injury.arm = this.injury.head = 0;
    if (this.anim) this.anim.speed = 1;
  }

  /** Start getting up from a knockdown. Returns the clip duration. */
  getUp(): number {
    if (this.life !== 'down') return 0;
    this.holding = false;
    this.unfreeze();
    const d = this.play('getUp', 0.25);
    this.life = 'alive';
    return d;
  }
}

export function yawTowards(fromX: number, fromZ: number, toX: number, toZ: number) {
  return Math.atan2(toX - fromX, toZ - fromZ) * pc.math.RAD_TO_DEG;
}

export function lerpAngle(a: number, b: number, t: number) {
  const d = ((b - a + 540) % 360) - 180;
  return a + d * t;
}
