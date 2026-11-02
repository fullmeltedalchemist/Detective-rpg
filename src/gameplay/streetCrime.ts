import * as pc from 'playcanvas';
import type { Game } from '../core/game';
import type { Npc, NpcDef } from '../entities/npc';
import type { EvidenceId } from './state';
import { drugDialogue, vanSearchNode, type DrugCtx } from './drugCase';

/**
 * Street-level drug dealing on the Harbor Flats corner (east end of Main St).
 *
 * Runs whether or not the player is investigating: buyers come and go, the dealer
 * hands over baggies and re-ups from the van, a lookout watches for police. What the
 * player actually SEES becomes evidence (and probable cause); spooking the lookout
 * shuts the corner down for a while and makes the dealer more likely to run.
 */

export const CORNER = { x: 59.5, z: -7.9, yaw: 0 };
const LOOKOUT = { x: 49.2, z: -7.1, yaw: 270 };
export const VAN_SIDE = { x: 56, z: -5.65 };
const FLATS_DOOR = { x: 55, z: -8.4 };
const ANDRE_WAIT = { x: 35.5, z: -7.3 };
/** Where the dealer lays low after a warning. */
const LAYLOW = { x: 67.5, z: -7.6 };
/** Escape route: west along Main St and into the alley beside the bank. */
const ESCAPE: [number, number][] = [[53, -7.5], [42, -7.4], [31, -7.4], [27.6, -10.8], [27.6, -19], [27.6, -27.5]];

export const STREET_NPCS: NpcDef[] = [
  { id: 'dealer', name: 'Cody Brooks', role: 'Hangs around the Harbor Flats corner', look: { body: 'm', outfit: 'civ', avatar: 'Male_Adult_01' },
    home: [CORNER.x, CORNER.z, CORNER.yaw], stationary: true, kind: 'suspect', courage: 0.4 },
  { id: 'kara', name: 'Kara Pike', role: 'Always on her phone down the block', look: { body: 'f', outfit: 'civ', avatar: 'Female_Adult_13' },
    home: [LOOKOUT.x, LOOKOUT.z, LOOKOUT.yaw], stationary: true, kind: 'suspect' },
  { id: 'andre', name: 'Andre Mills', role: 'Harbor Flats resident', look: { body: 'm', outfit: 'civ', avatar: 'Male_Adult_12' },
    home: [FLATS_DOOR.x, FLATS_DOOR.z, 180], stationary: true, kind: 'civilian' },
];

type DealPhase = 'waiting' | 'approach' | 'exchange' | 'leaving' | 'reup' | 'laylow' | 'off';

interface Buyer { npc: Npc; kind: 'andre' | 'marcus' }

export class StreetCrime implements DrugCtx {
  t = 0;
  enabled = true;
  phase: DealPhase = 'waiting';
  private phaseT = 0;
  private nextDealAt = 10;
  private buyer: Buyer | null = null;
  private dealsSinceReup = 0;
  /** Deals the player watched (count) and when a buyer last bought (for stopping them). */
  dealsSeen = 0;
  dealsTotal = 0;
  buyerHolding = new Map<string, number>();
  /** Last time the lookout warned the corner. */
  warnedAt = -999;
  /** Andre between trips is indoors (hidden). */
  private andreIndoorsUntil = 0;
  private andreTrip: 'indoors' | 'toDealer' | 'buying' | 'away' | 'home' = 'indoors';
  private lastEnvelope = -999;
  private marcusLastBuy = -999;
  /** Tests can force the dealer's reaction to a stop. */
  forceStop: 'comply' | 'run' | null = null;
  private seenThisDeal = false;
  private seenThisReup = false;
  private handed = { buyer: false, dealer: false, van: false };
  private andreAwayUntil = 0;
  /** After escaping, the dealer is out of sight until this time. */
  private dealerHiddenUntil = -1;

  constructor(private g: Game) {}

  get dealer() { return this.g.npc('dealer'); }
  get kara() { return this.g.npc('kara'); }
  get andre() { return this.g.npc('andre'); }
  get state() { return this.g.state; }

  init() {
    this.dealer.character.idleStyle = 'foldArms';
    this.kara.character.idleStyle = 'phone';
    this.hideAndre(20);
  }

  // ------------------------------------------------------------------ utilities
  toast(m: string, ms?: number) { this.g.hud.toast(m, ms); }

  collect(id: EvidenceId) { this.g.collectEvidence(id); }

  private dealerFree() {
    const d = this.dealer;
    return d.alive && !this.state.jailed.has('dealer') && ['idle', 'goto', 'hold', 'watch'].includes(d.state) && this.g.prisoner !== d;
  }

  /** Can the player see this spot right now (on foot or from a slow car, looking roughly that way)? */
  playerSees(p: pc.Vec3, range = 34): boolean {
    const g = this.g;
    if (g.driving && Math.abs(g.car.speed) > 6) return false;
    const eye = g.driving ? g.car.entity.getPosition().clone().add(new pc.Vec3(0, 1.3, 0)) : new pc.Vec3(g.player.x, g.player.y + 1.6, g.player.z);
    const d = Math.hypot(p.x - eye.x, p.z - eye.z);
    if (d > range) return false;
    const cam = g.cameraEntity.forward;
    const dx = p.x - eye.x, dz = p.z - eye.z;
    const facing = (dx * cam.x + dz * cam.z) / Math.max(1e-3, Math.hypot(dx, dz) * Math.hypot(cam.x, cam.z));
    if (d > 4 && facing < Math.cos(60 * pc.math.DEG_TO_RAD)) return false;
    return g.combat.ai.lineOfSight(eye, new pc.Vec3(p.x, p.y + 1.2, p.z));
  }

  private hideAndre(seconds: number) {
    const a = this.andre;
    a.teleport(FLATS_DOOR.x, FLATS_DOOR.z - 1.6, 180); // inside the lobby
    a.character.visible = false;
    a.setState('hold');
    this.andreTrip = 'indoors';
    this.andreIndoorsUntil = this.t + seconds;
  }

  private andreOut() {
    const a = this.andre;
    a.teleport(FLATS_DOOR.x, FLATS_DOOR.z, 180);
    a.character.visible = true;
    a.setState('idle');
  }

  // ------------------------------------------------------------------ simulation
  update(dt: number) {
    this.t += dt;
    if (!this.enabled) return;
    this.phaseT += dt;
    this.updateLookout();
    this.updateAndre();
    this.updateDeal();
    this.updateEscape();
  }

  private setPhase(p: DealPhase) { this.phase = p; this.phaseT = 0; }

  private updateDeal() {
    const d = this.dealer;
    if (this.dealerHiddenUntil > 0) {
      if (this.t < this.dealerHiddenUntil) return;
      this.dealerHiddenUntil = -1;
      d.character.visible = true;
      d.teleport(LAYLOW.x, LAYLOW.z, 270);
      d.hold(null);
      this.setPhase('laylow');
      return;
    }
    const gone = !d.alive || this.state.jailed.has('dealer') || d.state === 'cuffed' || d.state === 'inCar';
    const busy = ['surrender', 'down', 'recover', 'evade', 'flee', 'hide', 'cower'].includes(d.state);
    if (gone || busy) {
      if (this.buyer) this.dismissBuyer();
      if (gone) this.phase = 'off';
      return;
    }
    if (this.phase === 'off') { this.setPhase('waiting'); this.nextDealAt = this.t + 20; }
    switch (this.phase) {
      case 'waiting': {
        if (d.state === 'talking') return;
        if (this.t < this.nextDealAt) return;
        if (this.dealsSinceReup >= 2) { this.startReup(); return; }
        const b = this.pickBuyer();
        if (!b) { this.nextDealAt = this.t + 4; return; }
        this.buyer = b;
        b.npc.goTo(CORNER.x - 0.9, CORNER.z + 0.35, () => this.beginExchange());
        if (b.kind === 'andre') this.andreTrip = 'toDealer';
        this.setPhase('approach');
        break;
      }
      case 'approach': {
        const b = this.buyer;
        if (!b || !b.npc.alive || b.npc.state === 'flee' || b.npc.state === 'hide' || b.npc.state === 'cower' || this.phaseT > 30) { this.dismissBuyer(); this.setPhase('waiting'); this.nextDealAt = this.t + 15; }
        break;
      }
      case 'exchange': {
        const b = this.buyer;
        if (!b) { this.setPhase('waiting'); break; }
        // interrupted (the detective walked up and started talking, a gunshot, …): deal is off
        if (b.npc.state !== 'hold' || d.state !== 'hold') {
          this.buyer = null;
          if (d.state === 'hold') d.release('idle');
          if (b.npc.state === 'hold') { if (b.kind === 'andre') this.andreHome(); else b.npc.release('wander'); }
          else if (b.kind === 'andre') { this.andreTrip = 'away'; this.andreAwayUntil = this.t + 2; }
          this.setPhase('waiting'); this.nextDealAt = this.t + 25;
          break;
        }
        if (!this.handed.buyer && this.phaseT > 0.35) { this.handed.buyer = true; b.npc.character.play('interact'); }
        if (!this.handed.dealer && this.phaseT > 1.1) { this.handed.dealer = true; d.character.play('interact'); }
        // what the player saw during the hand-off
        // it only counts once the baggie actually changes hands (dealer's hand-off at 1.1 s)
        if (!this.seenThisDeal && this.handed.dealer && this.phaseT < 2.4 && this.playerSees(d.pos)) {
          this.seenThisDeal = true;
          this.dealsSeen++;
          this.toast('👁  You saw a hand-to-hand: cash for a small baggie.', 3200);
          this.collect('obsDeal');
        }
        if (this.phaseT > 2.5) {
          this.dealsTotal++; this.dealsSinceReup++;
          this.buyerHolding.set(b.npc.id, this.t + (this.seenThisDeal ? 90 : 0));
          if (this.seenThisDeal) this.buyerHolding.set(`seen:${b.npc.id}`, this.t + 90);
          d.release('idle'); // idle walks him back to his spot
          this.sendBuyerAway(b);
          this.buyer = null;
          this.setPhase('waiting');
          this.nextDealAt = this.t + 16 + Math.random() * 14;
        }
        break;
      }
      case 'reup': {
        if (d.state === 'hold' && this.phaseT > 0.4) {
          if (!this.handed.van) { this.handed.van = true; this.phaseT = 0.45; d.character.play('interact'); }
          if (!this.seenThisReup && this.playerSees(new pc.Vec3(VAN_SIDE.x, 0, VAN_SIDE.z))) {
            this.seenThisReup = true;
            this.toast('👁  He reached into the van and came back — his supply is in there.', 3200);
            this.collect('obsVan');
          }
          if (this.phaseT > 2.6) { d.release('idle'); d.goTo(CORNER.x, CORNER.z, () => d.setState('idle')); this.dealsSinceReup = 0; this.setPhase('waiting'); this.nextDealAt = this.t + 12; }
        } else if (this.phaseT > 25) { this.setPhase('waiting'); this.dealsSinceReup = 0; }
        break;
      }
      case 'laylow': {
        if (this.phaseT > 60 && d.state !== 'talking') {
          d.release('idle');
          d.goTo(CORNER.x, CORNER.z, () => d.setState('idle'));
          const k = this.kara;
          if (k.alive && k.state === 'hold') { k.release('idle'); k.goTo(LOOKOUT.x, LOOKOUT.z, () => k.setState('idle')); }
          this.setPhase('waiting');
          this.nextDealAt = this.t + 15;
        }
        break;
      }
    }
  }

  private beginExchange() {
    const b = this.buyer, d = this.dealer;
    if (!b || this.phase !== 'approach' || !this.dealerFree()) { this.dismissBuyer(); this.setPhase('waiting'); return; }
    b.npc.hold(d.pos);
    d.hold(b.npc.pos);
    this.seenThisDeal = false;
    this.handed.buyer = this.handed.dealer = false;
    this.setPhase('exchange');
  }

  private startReup() {
    const d = this.dealer;
    this.seenThisReup = false;
    this.handed.van = false;
    d.goTo(VAN_SIDE.x, VAN_SIDE.z, () => d.hold(new pc.Vec3(VAN_SIDE.x, 0, VAN_SIDE.z + 2)));
    this.setPhase('reup');
  }

  private pickBuyer(): Buyer | null {
    if (this.andreTrip === 'indoors' && this.t > this.andreIndoorsUntil) {
      this.andreOut();
      return { npc: this.andre, kind: 'andre' };
    }
    // a neighbour who happens to walk past now and then
    const m = this.g.npc('civ3');
    if (m && m.state === 'wander' && !m.def.stationary && this.t - this.marcusLastBuy > 150 && Math.hypot(m.x - CORNER.x, m.z - CORNER.z) < 14) {
      this.marcusLastBuy = this.t;
      return { npc: m, kind: 'marcus' };
    }
    return null;
  }

  private sendBuyerAway(b: Buyer) {
    if (b.kind === 'andre') {
      this.andreTrip = 'away';
      b.npc.release('idle');
      b.npc.goTo(ANDRE_WAIT.x, ANDRE_WAIT.z, () => {
        if (this.andreTrip !== 'away') return;
        b.npc.character.idleStyle = 'phone';
        b.npc.hold(null);
        this.andreAwayUntil = this.t + 9;
      });
    } else {
      b.npc.release('wander');
    }
  }

  private andreHome() {
    const a = this.andre;
    a.character.idleStyle = 'plain';
    a.release('idle');
    this.andreTrip = 'home';
    a.goTo(FLATS_DOOR.x, FLATS_DOOR.z, () => { if (this.andreTrip === 'home') this.hideAndre(35 + Math.random() * 30); });
  }

  private dismissBuyer() {
    const b = this.buyer;
    this.buyer = null;
    if (!b) return;
    if (b.npc.state === 'hold' || b.npc.state === 'goto') {
      if (b.kind === 'andre') this.andreHome(); else b.npc.release('wander');
    }
  }

  private updateAndre() {
    const a = this.andre;
    if (this.andreTrip === 'indoors') {
      // indoors he is hidden; if something knocked him out of 'hold' (gunfire panic), put him back
      if (a.state !== 'hold' && a.alive) { a.teleport(FLATS_DOOR.x, FLATS_DOOR.z - 1.6, 180); a.setState('hold'); }
      a.character.visible = false;
      return;
    }
    if (!a.character.visible) a.character.visible = true;
    if (['cuffed', 'inCar', 'jailed', 'dead'].includes(a.state)) { this.andreTrip = 'away'; this.andreAwayUntil = Infinity; return; }
    if (this.andreTrip === 'away' && a.state === 'hold' && this.t > this.andreAwayUntil) this.andreHome();
    // back on his feet after being stopped and let go: head home
    if (this.andreTrip === 'away' && (a.state === 'idle' || a.state === 'watch') && this.t > this.andreAwayUntil + 1) this.andreHome();
  }

  // ------------------------------------------------------------------ lookout
  private updateLookout() {
    const k = this.kara, d = this.dealer, g = this.g;
    if (!k.alive || this.state.jailed.has('kara') || ['cuffed', 'inCar', 'surrender', 'down', 'evade', 'flee'].includes(k.state)) return;
    if (this.t - this.warnedAt < 75) return;
    let reason: string | null = null;
    const near = (p: pc.Vec3, r: number) => Math.hypot(p.x - k.x, p.z - k.z) < r || Math.hypot(p.x - d.x, p.z - d.z) < r;
    if (g.driving && near(g.car.entity.getPosition(), 32)) reason = 'cruiser';
    else if (!g.driving && g.combat.player.armed && g.combat.player.aiming && near(g.player.pos, 30)) reason = 'gun';
    else if (g.prisoner && near(g.prisoner.pos, 26)) reason = 'arrest';
    if (reason) this.warn();
  }

  /** The lookout shouts a warning; the corner shuts down for a while. */
  warn() {
    const k = this.kara, d = this.dealer, g = this.g;
    this.warnedAt = this.t;
    k.character.play('interact');
    const heard = Math.hypot(g.player.x - k.x, g.player.z - k.z) < 40;
    if (heard) this.toast('📣  Kara Pike shouts down the block: "Yo — five-oh!"', 3200);
    if (heard && this.playerSees(k.pos, 40)) this.collect('obsLookout');
    if (this.dealerFree() && d.state !== 'talking' && this.phase !== 'laylow') {
      this.dismissBuyer();
      d.release('idle');
      d.goTo(LAYLOW.x, LAYLOW.z, () => d.hold(null));
      this.setPhase('laylow');
    }
  }

  get recentlyWarned() { return this.t - this.warnedAt < 90; }

  /** Test/screenshot hook: put the corner back to a calm state with a sale about to start. */
  debugResetCorner() {
    const d = this.dealer, k = this.kara;
    this.dismissBuyer();
    if (d.alive && !this.state.jailed.has('dealer')) { d.release('idle'); d.setState('idle'); d.character.visible = true; d.teleport(CORNER.x, CORNER.z, CORNER.yaw); }
    if (k.alive && !this.state.jailed.has('kara')) { k.release('idle'); k.setState('idle'); k.teleport(LOOKOUT.x, LOOKOUT.z, LOOKOUT.yaw); }
    this.dealerHiddenUntil = -1;
    this.warnedAt = -999;
    this.hideAndre(0);
    this.dealsSinceReup = 0;
    this.setPhase('waiting');
    this.nextDealAt = this.t + 0.5;
  }

  // ------------------------------------------------------------------ confrontation
  /** Police stop: does he comply or run? */
  confront(): 'comply' | 'run' {
    const g = this.g, d = this.dealer;
    let p = 0.42;
    if (this.recentlyWarned) p += 0.3;
    if (this.state.flag('dealerKnowsYou')) p += 0.15;
    if (g.combat.player.armed) p -= 0.3;
    if (Math.hypot(g.player.x - d.x, g.player.z - d.z) < 1.4) p -= 0.1;
    p = pc.math.clamp(p, 0.05, 0.9);
    const r = this.forceStop ?? (Math.random() < p ? 'run' : 'comply');
    this.state.set('dealerKnowsYou');
    if (r === 'run') this.run();
    else {
      d.surrender();
      this.dismissBuyer();
      this.toast('Cody puts his hands up. "Alright, alright. I ain\'t done nothing."', 3000);
    }
    return r;
  }

  run() {
    const d = this.dealer;
    this.dismissBuyer();
    d.evadeSpeed = 4.6;
    d.evade(ESCAPE);
    this.toast('🏃  Cody bolts west down Main St! Sprint after him and tackle him.', 3500);
    // the lookout drifts away too
    const k = this.kara;
    if (k.alive && (k.state === 'idle' || k.state === 'hold')) k.goTo(LOOKOUT.x - 14, LOOKOUT.z - 0.2, () => k.hold(null));
  }

  private updateEscape() {
    const d = this.dealer;
    if (d.state !== 'evade') return;
    const g = this.g;
    const gap = Math.hypot(g.player.x - d.x, g.player.z - d.z);
    if (d.escaped || (gap > 45 && d.stateTime > 4)) {
      // got away: out of sight for a couple of minutes, then back near the corner — and he knows your face
      d.escaped = false;
      d.release('idle');
      d.hold(null);
      d.character.visible = false;
      d.teleport(LAYLOW.x + 4, LAYLOW.z, 270);
      this.dealerHiddenUntil = this.t + 120;
      this.state.set('dealerKnowsYou');
      this.toast('He got away. He\'ll turn up again — but now he knows your face.', 3500);
    }
  }

  // ------------------------------------------------------------------ searches (DrugCtx)
  hasProbableCause() {
    const s = this.state;
    return s.has('obsDeal') || s.has('controlledBuy') || s.has('statementAndre');
  }

  /** Frisk the dealer (he is surrendered, down or cuffed). */
  friskDealer() {
    const s = this.state, d = this.dealer;
    if (s.flag('dealerSearched')) return;
    s.set('dealerSearched');
    const lawful = this.hasProbableCause();
    s.set(lawful ? 'drugSearchLawful' : 'drugSearchUnlawful');
    if (!lawful) this.g.combat.incident('illegal_search', d.pos, d);
    const bought = s.has('controlledBuy');
    this.g.hud.showExamine('Pat-down — Cody Brooks',
      `Jacket, left pocket: <b>14 knotted baggies of blue pills</b>.<br>Front pocket: <b>$640</b> in tens and twenties${bought ? ' — including <b>your two marked twenties</b>' : ''}.<br>Back pocket: a <b>prepaid phone</b> and a single <b>van key</b>.` +
      (lawful ? '' : '<br><br><span style="color:var(--red)">You had no probable cause to search him. A judge may throw this evidence out.</span>'),
      'Bag it all', () => { this.collect('baggies'); this.collect('dealerCash'); this.collect('burner'); });
  }

  canSearchVan() { return this.state.flag('dealerSearched') && !this.state.flag('vanSearched'); }

  searchVan() {
    this.g.hud.showDialogue(vanSearchNode(this), () => {});
  }

  /** Stop a buyer who just bought (within ~90 s). */
  buyerJustBought(id: string) { return (this.buyerHolding.get(id) ?? -99) > this.t; }
  buyerDealSeen(id: string) { return (this.buyerHolding.get(`seen:${id}`) ?? -99) > this.t; }

  takeEnvelope(): number {
    if (this.t - this.lastEnvelope < 180) return 0;
    this.lastEnvelope = this.t;
    return 200;
  }

  witnessesAt(p: pc.Vec3) { return this.g.combat.civilianWitnesses(p).length > 0; }

  arrest(n: Npc) { this.g.arrest(n); }

  releaseDealer() {
    const d = this.dealer, g = this.g;
    if (g.prisoner === d) { g.prisoner = null; d.followTarget = null; }
    d.character.pose = 'normal';
    d.setState('idle'); // walks back to his corner
    this.setPhase('waiting');
    this.nextDealAt = this.t + 40;
  }

  incident(type: Parameters<Game['combat']['incident']>[0], at: pc.Vec3, subject?: Npc, witnessed?: boolean) {
    this.g.combat.incident(type, at, subject, undefined, witnessed);
  }

  dialogue(n: Npc) { return drugDialogue(n, this); }

  // ------------------------------------------------------------------ interactions
  registerInteractions(push: (it: { id: string; pos: pc.Vec3; radius: number; priority?: number; label: () => string | null; act: () => void; follow?: () => { x: number; y: number; z: number } }) => void) {
    const d = this.dealer, s = this.state;
    // pat-down when he is stopped / on the ground / cuffed
    push({
      id: 'frisk:dealer', pos: d.pos, radius: 1.9, priority: 7, follow: () => d,
      label: () => (!s.flag('dealerSearched') && d.alive && (d.state === 'surrender' || d.state === 'down' || (d.state === 'cuffed' && this.g.prisoner === d)) ? 'Search Cody' : null),
      act: () => this.friskDealer(),
    });
    // talk to a stopped / cuffed dealer (the normal Talk prompt is hidden in these states)
    push({
      id: 'talkStopped:dealer', pos: d.pos, radius: 2.2, priority: 6, follow: () => d,
      label: () => (d.alive && (d.state === 'surrender' || (d.state === 'cuffed' && this.g.prisoner === d)) ? 'Talk to Cody' : null),
      act: () => this.g.talkTo(d),
    });
    push({
      id: 'van', pos: new pc.Vec3(VAN_SIDE.x, 0, VAN_SIDE.z), radius: 2.0, priority: 4,
      label: () => (this.canSearchVan() && !this.g.driving ? 'Search the van' : s.flag('vanSearched') || this.g.driving || !s.flag('drugCaseOpen') ? null : 'Van (locked)'),
      act: () => { if (this.canSearchVan()) this.searchVan(); else this.toast('Locked. Whoever has the key has the van.'); },
    });
  }
}
