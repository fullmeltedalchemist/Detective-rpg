import * as pc from 'playcanvas';
import type { Game } from '../core/game';
import { Ballistics, type Hit, type Projectile, type Target } from '../combat/ballistics';
import { Effects } from '../combat/effects';
import { Sfx } from '../combat/audio';
import { CombatAI } from '../combat/ai';
import { PlayerCombat } from '../combat/playerCombat';
import { WeaponVisual } from '../combat/weaponVisual';
import { WEAPONS, type WeaponId } from '../combat/weapons';
import type { Npc } from '../entities/npc';
import { Standing, type IncidentType } from './justice';
import { ENCOUNTER_NPCS, buildEncounterSet, inZone } from './encounter';
import { Props } from '../world/props';

/**
 * Glue between combat systems and the rest of the game: projectile hits,
 * damage, witnesses and consequences, NPC weapons, civilian reactions,
 * the back-lot test encounter, and player injury/respawn.
 */
export class CombatDirector {
  readonly sfx = new Sfx();
  fx!: Effects;
  ballistics!: Ballistics;
  ai!: CombatAI;
  player!: PlayerCombat;
  readonly standing = new Standing();
  private npcWeapons = new Map<string, WeaponVisual>();
  private dropped: { v: WeaponVisual; pos: pc.Vec3; owner: string; weapon: WeaponId; taken: boolean }[] = [];
  private incidentCooldown = new Map<string, number>();
  private t = 0;
  private hurtFlash = 0;
  private lastPlayerHitFrom: pc.Vec3 | null = null;
  private playerDownAt = -1;
  encounterState: 'dormant' | 'active' | 'resolved' = 'dormant';
  private publicDischargeCd = 0;
  coverPoints: pc.Vec3[] = [];
  /** Counters for automated tests / diagnostics */
  stats = { npcShots: 0, playerShots: 0, bodyHits: 0, worldHits: 0 };

  constructor(private g: Game) {}

  init(root: pc.Entity) {
    const g = this.g;
    this.fx = new Effects(root);
    const props = new Props(g.assets, g.world, root);
    this.coverPoints = buildEncounterSet(props, g.world);
    this.ballistics = new Ballistics(g.world, () => this.targets());
    this.ballistics.onHit = (p, h) => this.onHit(p, h);
    this.ai = new CombatAI({
      world: g.world,
      playerPos: () => (g.driving ? g.car.entity.getPosition() : g.player.pos),
      playerAlive: () => this.player.alive && !g.driving,
      playerAimingAt: (n) => this.player.armed && (this.player.aiming || this.player.aimTarget?.id === n.id) && this.isAimedAt(n),
      playerMovingFast: () => Math.hypot(g.player.vx, g.player.vz) > 3,
      npcFire: (n, o, d) => this.npcFire(n, o, d),
      allies: (n) => g.npcs.filter((o) => o !== n && o.hostile),
      coverPoints: this.coverPoints,
    });
    this.player = new PlayerCombat(g.assets, root, g.player.character, g.cam, g.input, this.ballistics, this.fx, this.sfx, g.world, {
      targets: () => this.targets(),
      npcs: () => g.npcs,
      onShot: (o, w) => this.onPlayerShot(o, w),
      onMeleeHit: (n, d, strong) => this.onMelee(n, d, strong),
      toast: (m) => g.hud.toast(m),
    });
    // NPC weapons
    for (const n of g.npcs) this.armNpc(n, root);
  }

  armNpc(n: Npc, root: pc.Entity) {
    if (!n.armed) return;
    const v = new WeaponVisual(this.g.assets, root, n.armed);
    this.npcWeapons.set(n.id, v);
    n.dropWeapon = () => {
      const p = n.pos;
      this.dropped.push({ v, pos: new pc.Vec3(p.x + 0.4, p.y + 0.05, p.z + 0.3), owner: n.name, weapon: n.armed ?? 'pistol', taken: false });
      this.npcWeapons.delete(n.id);
      v.holder.setPosition(p.x + 0.4, p.y + 0.06, p.z + 0.3);
      v.holder.setEulerAngles(0, Math.random() * 360, 90);
    };
  }

  private isAimedAt(n: Npc): boolean {
    const cam = this.g.cameraEntity;
    const cp = cam.getPosition(), f = cam.forward;
    const tx = n.x - cp.x, ty = n.y + 1.2 - cp.y, tz = n.z - cp.z;
    const d = Math.hypot(tx, ty, tz);
    return (tx * f.x + ty * f.y + tz * f.z) / d > Math.cos(9 * pc.math.DEG_TO_RAD);
  }

  targets(): Target[] {
    const g = this.g;
    const list: Target[] = g.npcs.map((n) => ({ id: n.id, human: n.character, hittable: () => n.state !== 'inCar' && n.state !== 'jailed' && n.alive }));
    list.push({ id: 'player', human: g.player.character, hittable: () => !g.driving && this.player.alive });
    return list;
  }

  // ------------------------------------------------------------------
  private witnesses(at: pc.Vec3, exclude?: Npc): Npc[] {
    return this.g.npcs.filter((n) => n !== exclude && n.alive && !n.hostile && n.state !== 'jailed' && n.state !== 'inCar' && n.state !== 'down'
      && Math.hypot(n.x - at.x, n.z - at.z) < 30
      && this.ai.lineOfSight(new pc.Vec3(n.x, n.y + 1.6, n.z), new pc.Vec3(at.x, at.y + 1.2, at.z)));
  }

  incident(type: IncidentType, at: pc.Vec3, subject?: Npc, cooldownKey?: string) {
    const key = cooldownKey ?? `${type}:${subject?.id ?? ''}`;
    if ((this.incidentCooldown.get(key) ?? -99) > this.t) return;
    this.incidentCooldown.set(key, this.t + 8);
    const witnessed = this.witnesses(at, subject).length > 0;
    const { label, escalation } = this.standing.record(type, witnessed, subject?.name);
    // keep the case-dialogue reputation roughly in step with public trust
    const s = this.g.state;
    if (['killed_civilian', 'shot_civilian', 'killed_surrendered', 'killed_unarmed_suspect'].includes(type)) s.reputation = Math.max(-10, s.reputation - 3);
    else if (['assault_civilian', 'shot_surrendered', 'shot_unarmed_suspect', 'excessive_force'].includes(type)) s.reputation = Math.max(-10, s.reputation - 1);
    else if (type === 'nonlethal_arrest') s.reputation = Math.min(10, s.reputation + 1);
    this.g.hud.toast(escalation ? `⚠ ${escalation}` : `${type === 'justified_shooting' || type === 'nonlethal_arrest' || type === 'good_arrest' ? '📋' : '⚠'} ${label}`, escalation ? 4200 : 3000);
    if (this.standing.suspended) this.player.disabledFirearms = true;
  }

  // ------------------------------------------------------------------
  private onPlayerShot(origin: pc.Vec3, _w: WeaponId) {
    this.stats.playerShots++;
    this.ai.noise(origin, 70, this.g.npcs);
    this.civilianReact(origin, 35);
    // firing in public with no threat around
    const threat = this.g.npcs.some((n) => n.hostile && n.alive && (n.state === 'combat') && Math.hypot(n.x - origin.x, n.z - origin.z) < 60);
    if (!threat && this.publicDischargeCd <= this.t) {
      const w = this.witnesses(origin);
      if (w.length) { this.publicDischargeCd = this.t + 20; this.incident('discharged_weapon_publicly', origin, undefined, 'discharge'); }
    }
    if (inZone(origin.x, origin.z) || Math.hypot(origin.x + 25, origin.z - 28) < 30) this.activateEncounter();
  }

  private civilianReact(at: pc.Vec3, radius: number) {
    for (const n of this.g.npcs) {
      if (n.hostile || !n.alive || n.def.stationary) continue;
      const d = Math.hypot(n.x - at.x, n.z - at.z);
      if (d > radius) continue;
      n.alarm(at, 'flee');
    }
    // staff behind counters duck
    for (const n of this.g.npcs) {
      if (!n.def.stationary || n.hostile || !n.alive || n.state === 'talking') continue;
      if (Math.hypot(n.x - at.x, n.z - at.z) < 20) n.alarm(at, 'duck');
    }
  }

  private npcFire(n: Npc, origin: pc.Vec3, dir: pc.Vec3) {
    this.stats.npcShots++;
    const id = n.armed ?? 'pistol';
    const w = WEAPONS[id];
    const v = this.npcWeapons.get(n.id);
    const muzzle = v ? v.muzzle(new pc.Vec3()) : origin;
    // re-aim from the actual muzzle
    this.ballistics.fire(muzzle, dir, w.velocity, n.id, w.damage * 0.55, w.headMult, w.limbMult, w.range, id);
    this.fx.muzzleFlash(muzzle, dir);
    this.fx.tracer(muzzle, new pc.Vec3(muzzle.x + dir.x * 25, muzzle.y + dir.y * 25, muzzle.z + dir.z * 25));
    const pd = this.g.player.pos.distance(muzzle);
    this.sfx.gunshot(w.sound, pd);
    n.character.play('shoot');
    this.ai.noise(muzzle, 70, this.g.npcs);
    this.civilianReact(muzzle, 40);
    this.activateEncounter();
  }

  private onHit(p: Projectile, hit: Hit) {
    const g = this.g;
    this.fx.impact(hit.point, hit.normal, hit.kind === 'body');
    if (hit.kind === 'world') this.stats.worldHits++; else this.stats.bodyHits++;
    if (hit.kind === 'world') { this.sfx.impact(g.player.pos.distance(hit.point)); return; }
    const dmg = Ballistics.damageFor(p, hit);
    const tgt = hit.target!;
    // where the shot came from (a few metres back along the bullet's path)
    const sp = p.vel.length() || 1;
    const from = new pc.Vec3(hit.point.x - (p.vel.x / sp) * 6, hit.point.y, hit.point.z - (p.vel.z / sp) * 6);
    if (tgt.id === 'player') {
      this.lastPlayerHitFrom = from;
      this.player.hurt(dmg, from, hit.region);
      this.hurtFlash = 1;
      return;
    }
    const n = g.npc(tgt.id);
    if (!n) return;
    const wasSurrendered = n.state === 'surrender' || n.state === 'cuffed';
    const wasArmed = !!n.armed;
    const outcome = n.damage(dmg, 'bullet', p.owner, hit.region, from);
    if (p.owner === 'player') {
      this.player.hitMarker = 0.18;
      this.ai.alert(n);
      const at = n.pos;
      if (n.hostile) {
        if (wasSurrendered) this.incident(outcome === 'killed' ? 'killed_surrendered' : 'shot_surrendered', at, n);
        else if (!wasArmed && !n.threatened) this.incident(outcome === 'killed' ? 'killed_unarmed_suspect' : 'shot_unarmed_suspect', at, n);
        else if (outcome === 'killed') this.incident('justified_shooting', at, n);
      } else {
        this.incident(outcome === 'killed' ? 'killed_civilian' : 'shot_civilian', at, n);
        if (outcome !== 'killed') n.flee(g.player.pos);
        g.state.hostile.add(n.id);
      }
    } else if (!n.hostile && outcome !== 'none') {
      n.flee(new pc.Vec3(hit.point.x, 0, hit.point.z));
    }
    if (outcome === 'killed' && g.prisoner === n) g.prisoner = null;
  }

  private onMelee(n: Npc, dmg: number, strong: boolean) {
    const g = this.g;
    const restrained = n.state === 'cuffed' || n.state === 'surrender' || n.state === 'down';
    const pp = g.player.pos;
    const outcome = n.damage(dmg * (strong ? 1.3 : 1), 'melee', 'player', strong ? 'head' : 'torso', pp);
    if (strong && outcome === 'hurt' && n.consciousness < 45) n.knockOut(8, pp);
    if (restrained) this.incident('excessive_force', n.pos, n);
    else if (!n.hostile) {
      this.incident('assault_civilian', n.pos, n);
      if (n.state !== 'down') n.flee(g.player.pos);
    } else this.ai.alert(n);
  }

  private lastOrder = -99;
  /** Hostiles that can hear a verbal order right now. */
  orderTargets(): Npc[] {
    const g = this.g;
    if (g.driving || !this.player.alive) return [];
    return g.npcs.filter((n) => n.hostile && n.alive && n.state === 'combat' && Math.hypot(n.x - g.player.x, n.z - g.player.z) < 26
      && this.ai.lineOfSight(new pc.Vec3(n.x, n.y + 1.5, n.z), new pc.Vec3(g.player.x, g.player.y + 1.5, g.player.z)));
  }

  canOrder() { return this.t - this.lastOrder > 3.5 && this.orderTargets().length > 0; }

  orderSurrender() {
    const ts = this.orderTargets();
    if (!ts.length) return;
    this.lastOrder = this.t;
    this.g.player.character.play('interact');
    const g = this.g;
    const down = ENCOUNTER_NPCS.map((d) => g.npc(d.id)).filter((n) => n && (!n.alive || n.state === 'cuffed' || n.state === 'surrender')).length;
    const results = ts.map((n) => ({ n, r: this.ai.order(n, this.player.armed && this.isAimedAt(n), down) }));
    const gave = results.filter((r) => r.r === 'surrender').map((r) => r.n.name.split(' ')[0]);
    const fought = results.filter((r) => r.r === 'fight').length;
    this.activateEncounter();
    g.hud.toast(`"Police! Drop your weapons — hands where I can see them!"  ${gave.length ? `${gave.join(', ')} gave up.` : ''}${fought ? ` ${fought} refused.` : ''}`, 3500);
  }

  /** Takedown on a staggered/surrendered/fleeing suspect: non-lethal, ends on the ground. */
  takedown(n: Npc) {
    this.player.human.play('punchCross');
    this.sfx.thud(0.8);
    const surrendered = n.state === 'surrender';
    n.knockOut(10, this.g.player.pos);
    if (surrendered) this.incident('excessive_force', n.pos, n);
  }

  canTakedown(n: Npc): boolean {
    if (!n.alive || n.state === 'down' || n.state === 'cuffed' || n.state === 'jailed' || n.state === 'inCar') return false;
    const recentlyHit = performance.now() / 1000 - n.lastHitAt < 1.6;
    return n.hostile && (recentlyHit || n.state === 'surrender' || n.consciousness < 60 || (!n.armed && n.state === 'combat'));
  }

  /** Mark the encounter as live. Gunfire also puts everyone in fight mode (via noise). */
  activateEncounter() {
    if (this.encounterState !== 'dormant') return;
    this.encounterState = 'active';
  }

  // ------------------------------------------------------------------
  update(dt: number) {
    this.t += dt;
    const g = this.g;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.5);
    // Approaching the lot alerts the gang when they can see you (handled by AI perception);
    // entering the lot always starts the encounter.
    if (this.encounterState === 'dormant' && !g.driving && inZone(g.player.x, g.player.z)) {
      // the lookout spots you first
      const lookout = g.npc('lookout');
      if (lookout && this.ai.lineOfSight(new pc.Vec3(lookout.x, 1.6, lookout.z), new pc.Vec3(g.player.x, 1.5, g.player.z))) this.activateEncounter();
    }
    if (this.encounterState === 'dormant' && ENCOUNTER_NPCS.some((d) => { const n = g.npc(d.id); return n && n.state === 'combat'; })) {
      this.activateEncounter();
    }
    // Civilians react to being aimed at
    if (this.player.armed && this.player.aiming) {
      const t = this.player.aimTarget;
      if (t && t.id !== 'player') {
        const n = g.npc(t.id);
        if (n && !n.hostile && n.alive && Math.hypot(n.x - g.player.x, n.z - g.player.z) < 20) n.alarm(g.player.pos, n.def.stationary ? 'duck' : 'flee');
      }
    }
    this.ai.update(dt, g.npcs);
    this.ballistics.update(dt);
    this.fx.update(dt);
    if (this.player.disabledFirearms === false && this.standing.suspended) this.player.disabledFirearms = true;

    // Encounter resolution report
    if (this.encounterState === 'active') {
      const ns = ENCOUNTER_NPCS.map((d) => g.npc(d.id)).filter(Boolean) as Npc[];
      const done = ns.every((n) => ['dead', 'cuffed', 'jailed', 'inCar'].includes(n.state));
      if (done) {
        this.encounterState = 'resolved';
        const lines = ns.map((n) => `• ${n.name} — ${n.state === 'dead' ? 'killed' : 'in custody'}`).join('<br>');
        const st = this.standing.summary();
        const dead = ns.filter((n) => n.state === 'dead').length;
        g.hud.showReport(dead === 0 ? 'SCENE SECURED' : dead === ns.length ? 'LETHAL FORCE' : 'SCENE SECURED', dead === 0 ? '' : 'warn', 'Back Lot, Oak Ave — incident report',
          `${lines}<br><br>Book surviving suspects at Precinct 9.<br><br>Public trust ${st.trust} · Professional ${st.prof} · IA attention ${st.ia} · Morality ${st.morality}`);
      }
    }

    // Player down → respawn
    if (!this.player.alive && this.playerDownAt < 0) {
      this.playerDownAt = this.t;
      g.player.character.die(this.lastPlayerHitFrom, 'torso');
      g.player.frozen = true;
      g.hud.toast('You are down. Officer needs assistance…', 3000);
    }
    if (this.playerDownAt >= 0 && this.t - this.playerDownAt > 3.5) this.respawn();
  }

  /** After animation: weapon positions, aim pitch etc. */
  postAnimate() {
    const g = this.g;
    this.player.postAnimate();
    for (const n of g.npcs) {
      const v = this.npcWeapons.get(n.id);
      if (!v) continue;
      v.visible = n.alive && n.state !== 'inCar' && n.state !== 'jailed';
      if (!n.alive) continue;
      if (n.character.aim !== 'none') {
        const p = g.driving ? g.car.entity.getPosition() : g.player.pos;
        v.inHand(n.character, new pc.Vec3(p.x, p.y + 1.2, p.z), false);
      } else if (n.state === 'combat') v.inHand(n.character, null, true);
      else v.holstered(n.character);
    }
  }

  private respawn() {
    const g = this.g;
    this.playerDownAt = -1;
    const A = g.refs.anchors;
    g.player.character.revive();
    g.player.character.speed = 0;
    g.player.frozen = false;
    g.player.place(A.stationSpawn.x, A.stationSpawn.z, 180);
    this.player.heal();
    this.standing.professional = Math.max(0, this.standing.professional - 3);
    g.hud.showReport('INJURED', 'bad', 'Officer down', 'You were hit and taken to Harbor General. After treatment you were cleared for duty and dropped back at Precinct 9.<br><br>Professional standing −3.');
  }

  /** Pick up a dropped weapon (evidence + ammo). */
  pickupNear(x: number, z: number): { label: string; act: () => void } | null {
    const d = this.dropped.find((w) => !w.taken && Math.hypot(w.pos.x - x, w.pos.z - z) < 1.4);
    if (!d) return null;
    return {
      label: 'Seize weapon',
      act: () => {
        d.taken = true;
        d.v.visible = false;
        const ws = (this.player as any).states.get(d.weapon);
        if (ws) ws.reserve += 15;
        this.g.state.log.push(`Seized ${WEAPONS[d.weapon].name} from ${d.owner}`);
        this.g.hud.toast(`🔫 Seized ${d.owner.split(' ')[0]}'s ${WEAPONS[d.weapon].name} (+15 rounds)`);
      },
    };
  }

  get hurtAmount() { return Math.max(this.hurtFlash, (1 - this.player.hp / this.player.maxHp) * 0.7); }
}
