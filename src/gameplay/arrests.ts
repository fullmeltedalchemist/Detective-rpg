import * as pc from 'playcanvas';
import type { Game } from '../core/game';
import type { Npc } from '../entities/npc';
import { yawTowards } from '../entities/humanoid';

/**
 * Physical arrest actions on their own buttons (Cuff = G, Search = V), like the weapon
 * controls: no confirmation boxes. Cuffing and pat-downs are short timed actions — the
 * detective steps in and works, the suspect turns their back or lies still — and what a
 * search turns up appears on a small card while you keep playing.
 */

type Kind = 'cuff' | 'search';
interface Job { kind: Kind; npc: Npc; t: number; dur: number; onGround: boolean; done: boolean; clicked: boolean }

/** People the detective never cuffs (fellow officers). */
const NO_CUFF = new Set(['okafor', 'officer1']);
const REACH = 2.0;

export class ArrestActions {
  private job: Job | null = null;
  /** Non-dealer people already patted down. */
  private searched = new Set<string>();

  constructor(private g: Game) {}

  get busy() { return !!this.job; }

  /** Nearest person in reach, roughly in front of the detective (or right beside him). */
  private nearest(pred: (n: Npc) => boolean): Npc | null {
    const g = this.g, p = g.player;
    const yr = p.character.yaw * pc.math.DEG_TO_RAD;
    const fx = Math.sin(yr), fz = Math.cos(yr);
    let best: Npc | null = null, bd = Infinity;
    for (const n of g.npcs) {
      if (!n.alive || !n.character.visible || !pred(n)) continue;
      const dx = n.x - p.x, dz = n.z - p.z, d = Math.hypot(dx, dz);
      if (d > REACH || Math.abs(n.y - p.y) > 1.2) continue;
      if (d > 1.0 && (dx * fx + dz * fz) / d < -0.2) continue; // behind you
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  cuffTarget(): Npc | null {
    const g = this.g;
    if (g.driving || g.prisoner || this.job || g.hud.modalOpen || !g.combat.player.alive) return null;
    return this.nearest((n) => {
      if (NO_CUFF.has(n.id) || n === g.prisoner) return false;
      if (['cuffed', 'jailed', 'inCar', 'evade', 'flee', 'combat', 'recover'].includes(n.state)) return false;
      if (n.state === 'surrender' || n.state === 'down') return true;
      // standing people: anyone who isn't an active armed threat (consequences come at booking)
      return !n.hostile;
    });
  }

  searchTarget(): Npc | null {
    const g = this.g;
    if (g.driving || this.job || g.hud.modalOpen || !g.combat.player.alive) return null;
    return this.nearest((n) => {
      const stopped = n.state === 'surrender' || n.state === 'down' || (n.state === 'cuffed' && g.prisoner === n);
      if (!stopped) return false;
      if (n.id === 'dealer') return !g.state.flag('dealerSearched');
      return !this.searched.has(n.id);
    });
  }

  private first(n: Npc) { return n.name.split(' ')[0] === 'Sgt.' || n.name.split(' ')[0] === 'Ofc.' ? n.name.split(' ')[1] : n.name.split(' ')[0]; }

  update(dt: number) {
    const g = this.g, inp = g.input;
    if (this.job) {
      this.step(dt);
      inp.pressed('cuff'); inp.pressed('search'); // ignore presses while busy
      g.hud.setArrestActions(null, null);
      return;
    }
    const c = this.cuffTarget(), s = this.searchTarget();
    g.hud.setArrestActions(c ? `Cuff ${this.first(c)}` : null, s ? `Search ${this.first(s)}` : null);
    if (inp.pressed('cuff') && c) this.begin('cuff', c);
    if (inp.pressed('search') && s) this.begin('search', s);
  }

  /** Start cuffing or searching. Also used by dialogue choices ("You're under arrest"). */
  begin(kind: Kind, n: Npc) {
    const g = this.g, p = g.player;
    if (this.job) return;
    if (kind === 'cuff') {
      if (g.prisoner) { g.hud.toast('You already have someone in custody — book them first.'); return; }
      // a standing street suspect may not go quietly
      if (n.def.kind === 'suspect' && n.state !== 'surrender' && n.state !== 'down') {
        if (n.id === 'dealer') { if (g.street.confront() === 'run') return; }
        else n.surrender();
      }
    }
    const onGround = n.state === 'down';
    p.character.yaw = yawTowards(p.x, p.z, n.x, n.z);
    p.frozen = true;
    g.combat.player.aiming = false;
    if (onGround) p.character.play('pickup', 0.2);
    else p.character.play('interact', 0.15);
    if (kind === 'cuff' && !onGround && n.state !== 'surrender') {
      // turn them around: face away from the detective, hands up for the cuffs
      const away = new pc.Vec3(n.x + (n.x - p.x), 0, n.z + (n.z - p.z));
      n.hold(away);
      n.character.pose = 'handsUp';
    }
    if (kind === 'search') g.combat.sfx.rustle();
    this.job = { kind, npc: n, t: 0, dur: kind === 'cuff' ? (onGround ? 1.5 : 1.2) : (onGround ? 2.0 : 1.8), onGround, done: false, clicked: false };
  }

  private cancel(msg?: string) {
    const j = this.job; if (!j) return;
    this.job = null;
    this.g.player.frozen = false;
    this.g.hud.setProgress(null);
    if (j.npc.state === 'hold') { j.npc.character.pose = 'normal'; j.npc.release(); }
    if (msg) this.g.hud.toast(msg);
  }

  private step(dt: number) {
    const j = this.job!, g = this.g, n = j.npc;
    j.t += dt;
    // interrupted: they died, ran, got shot at…
    if (!n.alive || n.state === 'evade' || n.state === 'flee' || n.state === 'combat' || !g.combat.player.alive) { this.cancel(); return; }
    const k = j.t / j.dur;
    g.hud.setProgress(j.kind === 'cuff' ? `Cuffing ${this.first(n)}…` : `Searching ${this.first(n)}…`, k);
    if (j.kind === 'cuff' && !j.clicked && k > 0.55) {
      j.clicked = true;
      g.combat.sfx.cuffs();
      if (!j.onGround) n.character.pose = 'cuffed';
    }
    if (j.kind === 'search' && !j.onGround && !j.clicked && k > 0.5) { j.clicked = true; g.player.character.play('interact', 0.15); }
    if (j.t < j.dur) return;
    // ---- finished ----
    this.job = null;
    g.player.frozen = false;
    g.hud.setProgress(null);
    if (j.kind === 'cuff') {
      if (n.state === 'hold') n.release('idle');
      g.cuffNow(n);
    } else this.finishSearch(n);
  }

  private finishSearch(n: Npc) {
    const g = this.g;
    if (n.id !== 'dealer') this.searched.add(n.id);
    const r = g.street.searchPerson(n) ?? genericSearch(n, g);
    g.hud.showFound(`Pat-down — ${n.name}`, r.items, r.warn);
  }
}

/** What ordinary people (and the Back Lot crew) carry. */
function genericSearch(n: Npc, g: Game): { items: { icon: string; name: string }[]; warn?: string } {
  const id = n.id;
  if (n.hostile) return { items: [{ icon: '🔫', name: 'Spare pistol magazine' }, { icon: '📱', name: 'Prepaid phone' }, { icon: '💵', name: '$220 in folded bills' }] };
  if (id === 'dale') {
    return { items: [{ icon: '🚬', name: 'Red Harbor menthols — the same brand as in the alley' }, { icon: '🎫', name: 'Bus pass, wallet' }, ...(g.state.has('lighter') ? [] : [{ icon: '❔', name: 'No lighter on him' }])] };
  }
  if (id === 'victor') return { items: [{ icon: '🥫', name: 'A bag of crushed cans' }, { icon: '🪙', name: '$3.40 in change' }] };
  return { items: [{ icon: '👛', name: 'Wallet, keys and a phone — nothing illegal' }] };
}
