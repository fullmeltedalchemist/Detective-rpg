import * as pc from 'playcanvas';
import type { Assets } from '../core/assets';
import type { FollowCamera } from '../core/camera';
import type { Input } from '../input/input';
import type { Humanoid } from '../entities/humanoid';
import type { CollisionWorld } from '../world/collision';
import { Ballistics, raycastBodies, type Target } from './ballistics';
import type { Effects } from './effects';
import type { Sfx } from './audio';
import { WEAPONS, newWeaponState, type WeaponId, type WeaponState } from './weapons';
import { WeaponVisual } from './weaponVisual';
import type { Npc } from '../entities/npc';

export interface CombatHooks {
  targets(): Target[];
  npcs(): Npc[];
  onShot(origin: pc.Vec3, weapon: WeaponId): void;
  onMeleeHit(n: Npc, damage: number, strong: boolean): void;
  toast(msg: string): void;
}

const tmp = new pc.Vec3();

/** Player weapons, aiming, firing, recoil, reloading, punching, blocking and health. */
export class PlayerCombat {
  owned: WeaponId[] = ['fists', 'pistol'];
  equipped: WeaponId = 'fists';
  private states = new Map<WeaponId, WeaponState>();
  private visuals = new Map<WeaponId, WeaponVisual>();
  aiming = false;
  private aimToggle = false;
  /** seconds remaining of hip-fire "snap" aim pose */
  private snapAim = 0;
  private spreadBloom = 0;
  private recoilPitch = 0;
  private recoilYaw = 0;
  hp = 100;
  readonly maxHp = 100;
  stamina = 100;
  private lastHurt = -99;
  private t = 0;
  private combo = 0;
  private comboWindow = 0;
  private punchCooldown = 0;
  private pendingHit: { at: number; step: number } | null = null;
  blocking = false;
  aimPoint = new pc.Vec3();
  aimTarget: Target | null = null;
  shoulder = 1;
  /** Aim assist strength for touch (0 = off) */
  aimAssist = 1;
  disabledFirearms = false;
  hitMarker = 0;
  private lastFireHeld = false;

  constructor(
    assets: Assets, root: pc.Entity, readonly human: Humanoid, private cam: FollowCamera, private input: Input,
    private ballistics: Ballistics, private fx: Effects, private sfx: Sfx, private world: CollisionWorld, private hooks: CombatHooks,
  ) {
    for (const id of ['pistol', 'rifle'] as WeaponId[]) {
      this.states.set(id, newWeaponState(id));
      const v = new WeaponVisual(assets, root, id);
      v.visible = false;
      this.visuals.set(id, v);
    }
    this.states.set('fists', newWeaponState('fists'));
  }

  get weapon() { return WEAPONS[this.equipped]; }
  get ws() { return this.states.get(this.equipped)!; }
  get armed() { return this.equipped !== 'fists'; }
  get reloading() { return this.t < this.ws.reloadingUntil; }
  get alive() { return this.hp > 0; }

  giveWeapon(id: WeaponId) {
    if (!this.owned.includes(id)) this.owned.push(id);
  }

  equip(id: WeaponId) {
    if (!this.owned.includes(id)) return;
    if (id !== 'fists' && this.disabledFirearms) { this.hooks.toast('Your firearm was confiscated'); return; }
    this.equipped = id;
    this.aimToggle = false;
    this.sfx.click(900, 0.15);
  }

  cycleWeapon() {
    const list = this.owned.filter((w) => w === 'fists' || !this.disabledFirearms);
    const i = list.indexOf(this.equipped);
    this.equip(list[(i + 1) % list.length]);
  }

  hurt(amount: number, from?: pc.Vec3, region: import('../entities/humanoid').HitRegion = 'torso') {
    if (!this.alive) return;
    if (this.blocking && !from) amount *= 0.3;
    this.hp = Math.max(0, this.hp - amount);
    this.lastHurt = this.t;
    if (this.hp > 0) this.human.hit(region, Math.min(1, amount / 40), from ?? null);
  }

  heal() { this.hp = this.maxHp; this.stamina = 100; }

  /** Spread in degrees right now (for the crosshair and shots). */
  currentSpread(moveSpeed: number) {
    const w = this.weapon;
    const base = this.aiming ? w.spreadAds : w.spreadHip;
    const move = Math.min(1, moveSpeed / 5) * w.movePenalty * (this.aiming ? 0.5 : 1);
    return base + move + this.spreadBloom;
  }

  update(dt: number, opts: { modal: boolean; driving: boolean; moveSpeed: number }) {
    this.t += dt;
    const inp = this.input;
    const h = this.human;
    this.hitMarker = Math.max(0, this.hitMarker - dt);
    this.punchCooldown -= dt;
    this.comboWindow -= dt;
    this.snapAim = Math.max(0, this.snapAim - dt);
    this.spreadBloom = Math.max(0, this.spreadBloom - dt * 6);
    // health regen after 6s without damage
    if (this.alive && this.t - this.lastHurt > 6) this.hp = Math.min(this.maxHp, this.hp + dt * 8);
    this.stamina = Math.min(100, this.stamina + dt * (this.blocking ? 4 : 18));

    if (opts.driving || !this.alive) {
      this.aiming = false; this.blocking = false; h.aim = 'none'; h.block = false;
      for (const v of this.visuals.values()) v.visible = false;
      this.cam.setCombat(false, false, 1, 58);
      return;
    }
    if (this.disabledFirearms && this.armed) this.equipped = 'fists';

    if (!opts.modal) {
      if (inp.pressed('weapon')) this.cycleWeapon();
      if (inp.pressed('weapon1')) this.equip('fists');
      if (inp.pressed('weapon2')) this.equip('pistol');
      if (inp.pressed('weapon3')) this.equip('rifle');
      if (inp.pressed('shoulder')) this.shoulder = -this.shoulder;
      if (inp.pressed('aimToggle')) this.aimToggle = !this.aimToggle;
      if (inp.pressed('reload')) this.reload();
    }

    const aimWanted = !opts.modal && (inp.aimHeld || this.aimToggle);
    if (this.armed) {
      this.aiming = aimWanted && !this.reloading;
      this.blocking = false;
    } else {
      this.aiming = false;
      this.blocking = aimWanted && this.stamina > 5;
    }

    // ---- recoil recovery (partial; player compensates the rest) ----
    const rec = Math.min(1, dt * 7);
    const pr = this.recoilPitch * rec, yr = this.recoilYaw * rec;
    this.recoilPitch -= pr; this.recoilYaw -= yr;
    this.cam.pitch -= pr * 0.55; this.cam.yaw += yr * 0.55;

    // ---- camera & character orientation ----
    const combatCam = this.armed || this.blocking;
    this.cam.setCombat(combatCam, this.aiming, this.shoulder, this.aiming ? this.weapon.adsFov : 58);
    const faceAim = this.aiming || this.snapAim > 0 || this.blocking || (this.armed && opts.moveSpeed < 0.2 && inp.fireHeld);
    if (faceAim || (this.armed && !opts.modal)) {
      if (faceAim) h.yaw = this.cam.yaw + 180;
    }
    h.aim = this.armed && (this.aiming || this.snapAim > 0) ? (this.equipped === 'rifle' ? 'rifle' : 'pistol') : 'none';
    h.block = this.blocking;
    h.aimPitch = this.armed ? (this.cam.pitch + 8) * 0.9 : 0;

    // ---- compute aim point (camera ray) ----
    const cp = this.cam.entity.getPosition();
    const fwd = this.cam.entity.forward;
    const wt = this.world.raycast(cp.x, cp.y, cp.z, fwd.x, fwd.y, fwd.z, 300, false);
    const body = raycastBodies(cp, fwd, wt, this.hooks.targets(), 'player');
    const dist = body ? body.distance : wt;
    this.aimTarget = body?.target ?? null;
    this.aimPoint.set(cp.x + fwd.x * dist, cp.y + fwd.y * dist, cp.z + fwd.z * dist);

    // ---- aim assist on touch: slow-down near targets ----
    // (applied by the game via assistFactor)

    // ---- firing / punching ----
    const fireHeld = !opts.modal && inp.fireHeld;
    const firePressed = fireHeld && !this.lastFireHeld;
    this.lastFireHeld = fireHeld;
    if (this.armed) {
      if (firePressed) this.tryFire(opts.moveSpeed);
    } else if (firePressed && !this.blocking) {
      this.punch();
    }
    if (this.pendingHit && this.t >= this.pendingHit.at) {
      this.resolvePunch(this.pendingHit.step);
      this.pendingHit = null;
    }

    // ---- weapon visuals ----
    for (const [id, v] of this.visuals) {
      if (!this.owned.includes(id) || (this.disabledFirearms)) { v.visible = false; continue; }
      v.visible = true;
      if (id === this.equipped) v.inHand(h, this.aimPoint, !(this.aiming || this.snapAim > 0));
      else v.holstered(h);
    }
  }

  /** Called after animation so the gun sits in the animated hand. */
  postAnimate() {
    const v = this.visuals.get(this.equipped);
    if (v && this.armed) v.inHand(this.human, this.aimPoint, !(this.aiming || this.snapAim > 0));
    for (const [id, vv] of this.visuals) if (id !== this.equipped && this.owned.includes(id)) vv.holstered(this.human);
  }

  reload() {
    if (!this.armed) return;
    const ws = this.ws, w = this.weapon;
    if (this.reloading || ws.mag >= w.magSize || ws.reserve <= 0) return;
    ws.reloadingUntil = this.t + w.reloadTime;
    this.human.play('reload');
    this.sfx.reload();
    setTimeout(() => {
      const need = w.magSize - ws.mag;
      const take = Math.min(need, ws.reserve);
      ws.mag += take; ws.reserve -= take;
    }, w.reloadTime * 1000);
  }

  private tryFire(moveSpeed: number) {
    const ws = this.ws, w = this.weapon;
    if (this.reloading) return;
    if (this.t < ws.boltUntil) return;
    if (this.t - ws.lastShot < 60 / w.rpm) return;
    if (ws.mag <= 0) { this.sfx.dryFire(); if (ws.reserve > 0) this.reload(); return; }
    ws.mag--;
    ws.lastShot = this.t;
    if (w.boltTime) ws.boltUntil = this.t + w.boltTime;
    if (!this.aiming) this.snapAim = 0.6;
    this.human.yaw = this.cam.yaw + 180;

    const v = this.visuals.get(this.equipped)!;
    v.inHand(this.human, this.aimPoint, false);
    const muzzle = v.muzzle(new pc.Vec3());
    // Shoot from the muzzle toward the camera aim point (converged), with spread
    const dir = tmp.copy(this.aimPoint).sub(muzzle);
    // If the aim point is behind the muzzle (camera clipping), shoot along camera forward
    if (dir.dot(this.cam.entity.forward) <= 0.05) dir.copy(this.cam.entity.forward);
    dir.normalize();
    const spread = this.currentSpread(moveSpeed) * pc.math.DEG_TO_RAD;
    const r = Math.sqrt(Math.random()) * spread, a = Math.random() * Math.PI * 2;
    const right = new pc.Vec3().cross(dir, pc.Vec3.UP).normalize();
    const up = new pc.Vec3().cross(right, dir).normalize();
    dir.add(right.mulScalar(Math.cos(a) * r)).add(up.mulScalar(Math.sin(a) * r)).normalize();
    this.ballistics.fire(muzzle, dir, w.velocity, 'player', w.damage, w.headMult, w.limbMult, w.range, w.id);
    this.fx.muzzleFlash(muzzle, dir);
    this.fx.tracer(muzzle, new pc.Vec3(muzzle.x + dir.x * 30, muzzle.y + dir.y * 30, muzzle.z + dir.z * 30));
    this.sfx.gunshot(w.sound);
    this.human.play('shoot');
    // recoil
    const kv = w.recoilV * (this.aiming ? 0.8 : 1);
    this.cam.pitch += kv;
    this.recoilPitch += kv;
    const kh = (Math.random() - 0.4) * w.recoilH;
    this.cam.yaw -= kh;
    this.recoilYaw += kh;
    this.spreadBloom = Math.min(4, this.spreadBloom + w.recoilV * 0.25);
    this.hooks.onShot(muzzle, w.id);
  }

  private punch() {
    if (this.punchCooldown > 0 || this.stamina < 8) return;
    const step = this.comboWindow > 0 ? (this.combo + 1) % 3 : 0;
    this.combo = step;
    const anim = step === 0 ? 'punchJab' : step === 1 ? 'punchCross' : 'hook';
    const dur = this.human.play(anim);
    this.sfx.whoosh();
    this.stamina -= 8 + step * 4;
    this.punchCooldown = dur * 0.55;
    this.comboWindow = dur + 0.35;
    this.pendingHit = { at: this.t + dur * 0.38, step };
    // face what we're punching
    const n = this.nearestInFront(1.8, 70);
    if (n) this.human.yaw = Math.atan2(n.x - this.human.position.x, n.z - this.human.position.z) * pc.math.RAD_TO_DEG;
  }

  private nearestInFront(range: number, coneDeg: number): Npc | null {
    const p = this.human.position;
    const yr = this.human.yaw * pc.math.DEG_TO_RAD;
    const fx = Math.sin(yr), fz = Math.cos(yr);
    let best: Npc | null = null, bd = Infinity;
    for (const n of this.hooks.npcs()) {
      if (!n.alive || n.state === 'inCar' || n.state === 'jailed') continue;
      const dx = n.x - p.x, dz = n.z - p.z, d = Math.hypot(dx, dz);
      if (d > range || d < 0.01) continue;
      const cos = (dx * fx + dz * fz) / d;
      if (cos < Math.cos(coneDeg * pc.math.DEG_TO_RAD)) continue;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  private resolvePunch(step: number) {
    const n = this.nearestInFront(1.45, 50);
    if (!n) return;
    const dmg = [9, 11, 17][step];
    this.sfx.thud(0.5 + step * 0.15);
    this.hitMarker = 0.15;
    this.hooks.onMeleeHit(n, dmg, step === 2);
  }

  /** Damage dealt by touch aim assist: returns look sensitivity multiplier (slower near targets). */
  assistFactor(touch: boolean): number {
    if (!touch || !this.aimAssist || !(this.aiming || this.armed)) return 1;
    return this.aimTarget ? 0.55 : 1;
  }

  /** Gentle pull toward the nearest hostile's chest when aiming on touch. */
  applyAimPull(dt: number, touch: boolean, hostiles: Npc[]) {
    if (!touch || !this.aimAssist || !this.aiming) return;
    const cp = this.cam.entity.getPosition();
    const fwd = this.cam.entity.forward;
    let best: { yaw: number; pitch: number; ang: number } | null = null;
    for (const n of hostiles) {
      if (!n.alive || n.incapacitated || n.state === 'surrender' || n.state === 'cuffed') continue;
      const tx = n.x - cp.x, ty = n.y + 1.25 - cp.y, tz = n.z - cp.z;
      const d = Math.hypot(tx, ty, tz);
      if (d > 60) continue;
      const cos = (tx * fwd.x + ty * fwd.y + tz * fwd.z) / d;
      const ang = Math.acos(Math.min(1, cos)) * pc.math.RAD_TO_DEG;
      if (ang > 7) continue;
      const yaw = Math.atan2(-tx, -tz) * pc.math.RAD_TO_DEG;
      const pitch = Math.asin(ty / d) * pc.math.RAD_TO_DEG;
      if (!best || ang < best.ang) best = { yaw, pitch, ang };
    }
    if (!best) return;
    const k = Math.min(1, dt * 2.5);
    const dyaw = ((best.yaw - this.cam.yaw + 540) % 360) - 180;
    this.cam.yaw += dyaw * k * 0.6;
    this.cam.pitch += (best.pitch - this.cam.pitch) * k * 0.4;
  }
}
