import type * as pc from 'playcanvas';
import type { Npc } from '../entities/npc';
import { leave, type Choice, type DialogueNode } from './dialogue';
import type { EvidenceId, GameState, Arrest } from './state';
import type { IncidentType } from './justice';

/**
 * CASE 9-201 — "Corner Business"
 * Cody Brooks sells pressed fentanyl pills on the Harbor Flats corner. Kara Pike is
 * his lookout; Andre Mills from Harbor Flats is a regular. Cody keeps his re-up in the
 * van parked out front and pays weekly to a supplier he calls "M".
 *
 * Procedure matters: watching a sale (or making a controlled buy) gives probable
 * cause. Search without it and the DA throws the evidence out. Cody will offer you his
 * cash to walk — taking it ends the case the corrupt way, with consequences.
 */

export interface DrugCtx {
  state: GameState;
  dealer: Npc;
  toast(m: string, ms?: number): void;
  collect(id: EvidenceId): void;
  confront(): 'comply' | 'run';
  hasProbableCause(): boolean;
  buyerJustBought(id: string): boolean;
  buyerDealSeen(id: string): boolean;
  takeEnvelope(): number;
  witnessesAt(p: pc.Vec3): boolean;
  arrest(n: Npc): void;
  releaseDealer(): void;
  incident(type: IncidentType, at: pc.Vec3, subject?: Npc, witnessed?: boolean): void;
  recentlyWarned: boolean;
}

const CODY_ROLE = 'Harbor Flats corner';

// ------------------------------------------------------------------ dialogue
export function drugDialogue(n: Npc, ctx: DrugCtx): DialogueNode | null {
  switch (n.id) {
    case 'officer1': return delgado(n, ctx);
    case 'dealer': return cody(n, ctx);
    case 'kara': return kara(n, ctx);
    case 'andre': return andre(n, ctx);
    default: return null;
  }
}

function delgado(n: Npc, ctx: DrugCtx): DialogueNode {
  const s = ctx.state;
  const name = n.name, role = 'Patrol officer';
  const advice: Choice = {
    label: 'How do I make it stick?', next: () => ({ speaker: name, role,
      text: 'Watch him first — from far enough that his lookout doesn\'t make you. You see a hand-to-hand, you\'ve got cause to stop and search him. Or make a buy yourself with the marked money. Search him on a hunch and the DA tosses the whole thing.',
      choices: [
        { label: 'Lookout?', next: () => ({ speaker: name, role, text: 'Somebody always yells "five-oh" when my car turns onto Main. Leave the cruiser around the corner and walk up.', choices: [leave('Got it.')] }) },
        leave('Got it.'),
      ] }),
  };
  if (!s.flag('drugCaseOpen')) {
    return {
      speaker: name, role,
      text: 'Detective — got a minute? I keep getting calls from Harbor Flats, east end of Main. Somebody\'s dealing on the corner outside the building. I roll by, it stops. I leave, it starts again.',
      choices: [
        { label: 'I\'ll take it.', next: () => {
          s.set('drugCaseOpen');
          s.buyMoney += 100;
          ctx.collect('tipDelgado');
          ctx.toast('📁  New case: 9-201 "Corner Business"  ·  $100 marked buy money', 3500);
          return { speaker: name, role, text: 'Appreciate it. Here — a hundred in marked buy money, serials are logged. Plainclothes might get further than I can.', choices: [advice, leave('On it.')] };
        } },
        leave('Not now.'),
      ],
    };
  }
  if (s.flag('drugCaseClosed')) return { speaker: name, role, text: 'Residents at the Flats say the corner\'s quiet. Nice work. That ledger\'s got the lab guys excited — "M" is somebody.', choices: [leave()] };
  if (s.flag('dealerBribed')) return { speaker: name, role, text: 'Funny — I drove past the Flats and your guy\'s back out there like nothing happened. You get anything on him?', choices: [leave('Still working on it.')] };
  return { speaker: name, role, text: 'Any luck on the corner?', choices: [advice, leave()] };
}

function cody(n: Npc, ctx: DrugCtx): DialogueNode {
  const s = ctx.state;
  const name = n.name;
  const stopped = n.state === 'surrender' || n.state === 'cuffed';

  // ---- after a stop: the bribe ----
  if (stopped) {
    if (s.flag('dealerSearched') && s.has('dealerCash') && !s.flag('bribeRefused') && !s.flag('dealerBribed')) {
      return {
        speaker: name, role: CODY_ROLE,
        text: 'Look, look — nobody has to know about this. That six-forty? Keep it. Lose the bags in a drain, take these off, and I was never here. Every week there\'s more where that came from.',
        choices: [
          { label: 'Take the money. Get out of here.', kind: 'danger', next: () => {
            takeBribe(n, ctx);
            return { speaker: name, role: CODY_ROLE, text: 'Smart man. Pleasure doing business, detective.', choices: [leave()] };
          } },
          { label: 'Put it away. You\'re under arrest.', next: () => {
            s.set('bribeRefused');
            ctx.incident('refused_bribe', n.pos, n);
            if (n.state !== 'cuffed') ctx.arrest(n);
            return { speaker: name, role: CODY_ROLE, text: 'Your loss, man. You know how many of you take it?', choices: [leave()] };
          } },
        ],
      };
    }
    const arrestNow: Choice[] = n.state === 'surrender' ? [{ label: 'You\'re under arrest.', kind: 'danger', next: () => { ctx.arrest(n); return null; } }] : [];
    return {
      speaker: name, role: CODY_ROLE,
      text: s.flag('dealerSearched') ? 'I want a lawyer.' : 'What is this? I\'m just standing here.',
      choices: [
        ...(s.flag('dealerSearched') ? [] : [{ label: 'Turn around. I\'m going to pat you down.', next: () => ({ speaker: name, role: CODY_ROLE, text: '…Whatever, man.', choices: [leave()] }) } as Choice]),
        ...arrestNow,
        leave(),
      ],
    };
  }

  // ---- bribed: the corrupt branch keeps paying ----
  if (s.flag('dealerBribed')) {
    const env = (): DialogueNode => {
      const amount = ctx.takeEnvelope();
      if (!amount) return { speaker: name, role: CODY_ROLE, text: 'Already took care of you this week, detective. Don\'t get greedy.', choices: [leave()] };
      s.money += amount;
      ctx.incident('took_bribe', n.pos, n, ctx.witnessesAt(n.pos));
      return { speaker: name, role: CODY_ROLE, text: `Two hundred. Same time next week. Keep patrol off my corner and we stay friends.`, choices: [leave()] };
    };
    return {
      speaker: name, role: CODY_ROLE, text: 'My guy. We good?',
      choices: [
        { label: 'Where\'s my envelope?', kind: 'danger', next: env },
        { label: 'Who\'s "M"?', next: () => ({ speaker: name, role: CODY_ROLE, text: 'Ha. You don\'t want that kind of problem. M don\'t do bribes. M does funerals.', choices: [leave()] }) },
        { label: 'It\'s over. You\'re under arrest.', kind: 'danger', next: () => { ctx.arrest(n); return { speaker: name, role: CODY_ROLE, text: 'Oh, you\'re gonna regret this. Everybody\'s gonna hear who took my money.', choices: [leave()] }; } },
        leave(),
      ],
    };
  }

  // ---- on the corner ----
  const knows = s.flag('dealerKnowsYou');
  const buy: Choice[] = (!s.has('controlledBuy') && s.buyMoney >= 40 && s.flag('drugCaseOpen')) ? [{
    label: 'You good? I\'m looking for something.', next: () => {
      if (knows || ctx.recentlyWarned) return { speaker: name, role: CODY_ROLE, text: knows ? 'I know you. You\'re a cop. Walk.' : 'Corner\'s hot right now. I don\'t know you. Beat it.', choices: [leave()] };
      return {
        speaker: name, role: CODY_ROLE,
        text: '(He looks you over, then down the block toward his lookout.) …Forty a bag. Cash first. Don\'t make it weird.',
        choices: [
          { label: 'Pay $40 (marked buy money)', kind: 'ev', next: () => {
            s.buyMoney -= 40;
            ctx.collect('controlledBuy');
            ctx.toast('💵  Controlled buy made. You have probable cause — and a sale charge.', 3500);
            return { speaker: name, role: CODY_ROLE, text: '(A baggie is pressed into your palm in a handshake.) Don\'t come back too soon.', choices: [leave()] };
          } },
          leave('Never mind.'),
        ],
      };
    },
  }] : [];
  return {
    speaker: name, role: CODY_ROLE,
    text: knows ? 'You again. I ain\'t doing nothing, officer.' : '(He gives you a slow look.) Help you?',
    choices: [
      ...buy,
      { label: 'Police. Hands where I can see them.', kind: 'danger', next: () => {
        const r = ctx.confront();
        if (r === 'run') return null;
        return { speaker: name, role: CODY_ROLE, text: 'Okay! Okay. What\'s this about? I\'m just standing here.', choices: [leave('(Search him)')] };
      } },
      { label: 'Nice day for standing around.', next: () => ({ speaker: name, role: CODY_ROLE, text: 'Free country. Last I checked.', choices: [leave()] }) },
      leave(),
    ],
  };
}

function takeBribe(n: Npc, ctx: DrugCtx) {
  const s = ctx.state;
  s.set('dealerBribed');
  s.money += 640;
  // the evidence "goes away"
  for (const e of ['baggies', 'dealerCash', 'burner'] as EvidenceId[]) s.remove(e);
  // he restocks; if you ever stop him again, a new search finds a new supply
  for (const f of ['dealerSearched', 'drugSearchLawful', 'drugSearchUnlawful'] as const) s.flags.delete(f);
  const seen = ctx.witnessesAt(n.pos);
  ctx.incident('took_bribe', n.pos, n, seen);
  ctx.toast(`💸  You pocketed $640 and let Cody walk.${seen ? ' Someone on the street saw it.' : ''}`, 3800);
  ctx.releaseDealer();
}

function kara(n: Npc, ctx: DrugCtx): DialogueNode {
  const s = ctx.state, name = n.name, role = 'On her phone';
  const watched = s.has('obsLookout');
  return {
    speaker: name, role,
    text: watched ? '(She lowers the phone.) Can I help you, officer?' : 'Hm? Sorry, on a call.',
    choices: [
      { label: 'Who are you calling?', next: () => ({ speaker: name, role, text: 'My mom. Is that illegal now?', choices: [leave()] }) },
      ...(watched ? [{ label: 'I heard you warn him. You\'re his lookout.', next: () => ({ speaker: name, role, text: 'I yell at a lot of people. Prove it.', choices: [leave()] }) } as Choice] : []),
      ...(n.state !== 'cuffed' ? [{ label: 'You\'re under arrest.', kind: 'danger' as const, next: () => { ctx.arrest(n); return null; } }] : []),
      leave(),
    ],
  };
}

function andre(n: Npc, ctx: DrugCtx): DialogueNode {
  const s = ctx.state, name = n.name, role = 'Harbor Flats resident';
  const fresh = ctx.buyerJustBought(n.id);
  const sawIt = ctx.buyerDealSeen(n.id);
  if (s.flag('andreFlipped')) return { speaker: name, role, text: 'I told you what I know. Please — people talk around here.', choices: [leave()] };
  if (!fresh) {
    return { speaker: name, role, text: 'Evening. Something wrong, officer?', choices: [
      { label: 'You know the guy on the corner?', next: () => ({ speaker: name, role, text: 'I mind my own business. You should try it.', choices: [leave()] }) },
      leave(),
    ] };
  }
  const flip: Choice = {
    label: 'Tell me who sold it to you and I\'ll let this go.', next: () => {
      s.set('andreFlipped');
      ctx.collect('statementAndre');
      return { speaker: name, role, text: '…Cody. Cody Brooks. He\'s out there every afternoon. Keeps the rest in his van so he\'s never holding much. You didn\'t hear it from me.', choices: [leave()] };
    },
  };
  return {
    speaker: name, role, text: '(He keeps his hand in his pocket.) I\'m just walking home, man.',
    choices: [
      { label: sawIt ? 'I watched you buy. Empty your pockets.' : 'Empty your pockets.', next: () => {
        if (!sawIt) {
          ctx.incident('illegal_search', n.pos, n);
          ctx.toast('⚠  You hadn\'t seen him buy anything — no grounds to search him.', 3200);
        }
        ctx.collect('buyerBaggie');
        return { speaker: name, role, text: '(One knotted baggie of blue pills.) It\'s for my back, man. I\'m not a dealer.', choices: [flip,
          { label: 'You\'re under arrest for possession.', kind: 'danger', next: () => { ctx.arrest(n); return null; } }, leave('Get out of here.')] };
      } },
      flip,
      leave(),
    ],
  };
}

// ------------------------------------------------------------------ the van
export function vanSearchNode(ctx: DrugCtx): DialogueNode {
  const s = ctx.state;
  const tainted = s.flag('drugSearchUnlawful');
  const seize = (skim: boolean): DialogueNode => {
    s.set('vanSearched');
    ctx.collect('vanStash');
    ctx.collect('ledger');
    if (skim) {
      s.set('stashSkimmed');
      s.money += 1000;
      ctx.incident('skimmed_seized_cash', ctx.dealer.pos, undefined, ctx.witnessesAt(ctx.dealer.pos));
      return { speaker: 'Van — back seat', text: 'You fold $1,000 into your jacket and log the rest. Nobody saw the count. Probably.', choices: [leave()] };
    }
    return { speaker: 'Van — back seat', text: 'Everything is bagged, counted and logged: pills, scale, ledger and $3,100.', choices: [leave()] };
  };
  return {
    speaker: 'Van — back seat',
    text: 'Cody\'s key turns the lock. Behind the back seat, a shoebox: about two hundred more pills, a digital scale, a roll of baggies, <b>$3,100</b> in rubber-banded cash, and a pocket ledger full of initials and weekly payments to "M".' +
      (tainted ? '<br><br><span style="color:var(--red)">This search follows from an unlawful pat-down. It will likely be suppressed too.</span>' : ''),
    choices: [
      { label: 'Seize everything', kind: 'ev', next: () => seize(false) },
      { label: 'Seize it — and pocket $1,000', kind: 'danger', next: () => seize(true) },
      leave('Not yet'),
    ],
  };
}

// ------------------------------------------------------------------ booking
export interface DrugBooking { outcome: Arrest['outcome']; title: string; text: string; rep: number; jail: boolean; incidents: IncidentType[] }

export function evaluateDrugBooking(id: string, name: string, s: GameState): DrugBooking | null {
  if (id === 'dealer') {
    const lawful = !s.flag('drugSearchUnlawful');
    const charges: string[] = [];
    const notes: string[] = [];
    const incidents: IncidentType[] = [];
    const physical = lawful && s.has('baggies');
    if (physical) charges.push('Possession with intent to distribute (14 bags, packaged for sale, $640 in small bills)');
    if (s.has('controlledBuy')) charges.push('Sale of a controlled substance — controlled buy with marked money');
    else if (s.has('obsDeal') && (physical || s.has('buyerBaggie'))) charges.push('Sale of a controlled substance — observed by a detective');
    if (lawful && s.has('vanStash')) charges.push('Trafficking quantity — about 200 pills and $3,100 seized from his van');
    if (!lawful && s.has('baggies')) notes.push('<b>Suppressed:</b> you searched him without probable cause. The pills, the cash, the phone — and everything found in the van because of them — are inadmissible.');
    if (s.flag('stashSkimmed') && s.has('ledger')) {
      notes.push('<b>Discrepancy:</b> the ledger says $3,100 on hand. You logged $2,100. Sgt. Okafor writes it up and sends it to Internal Affairs.');
      incidents.push('skimmed_seized_cash');
    }
    if (s.flag('dealerBribed')) {
      notes.push('<b>In the interview room</b>, Brooks tells Okafor you took $640 from him to let him walk last time. Internal Affairs is notified.');
      incidents.push('took_bribe');
    }
    if (s.has('ledger') && lawful) notes.push('The ledger records weekly payments to a supplier called "M" — a lead for a future case.');
    if (!charges.length) {
      incidents.push(s.flag('drugSearchUnlawful') ? 'case_dismissed' : 'wrongful_arrest');
      return { outcome: s.flag('drugSearchUnlawful') ? 'released' : 'noGrounds', title: s.flag('drugSearchUnlawful') ? 'Dismissed — illegal search' : 'Released — no evidence', rep: -1, jail: false, incidents,
        text: `${name} is released.${s.flag('drugSearchUnlawful') ? '' : ' Okafor: "You can\'t lock a man up for standing on a corner. Watch him. Make a buy. Then bring him in."'}${notes.length ? '<br><br>' + notes.join('<br><br>') : ''}` };
    }
    const strong = charges.length >= 2 || s.has('controlledBuy');
    incidents.unshift('drug_bust');
    return {
      outcome: strong ? 'charged' : 'weak', title: strong ? 'Charged: Narcotics distribution' : 'Held — thin narcotics case', rep: strong ? 3 : 1, jail: true, incidents,
      text: `${name} is booked on:<br>${charges.map((c) => '• ' + c).join('<br>')}${notes.length ? '<br><br>' + notes.join('<br><br>') : ''}`,
    };
  }
  if (id === 'kara') {
    if (s.has('obsLookout') || s.has('karaPhone')) return { outcome: 'weak', title: 'Held — acting as a lookout', rep: 0, jail: true, incidents: [], text: `${name} is booked as an accessory for warning a dealer about police. Okafor: "Misdemeanour. She\'ll be out by morning — but now she knows we know."` };
    return { outcome: 'noGrounds', title: 'No grounds', rep: -2, jail: false, incidents: ['wrongful_arrest'], text: `"On what grounds? Talking on her phone?" ${name} is released.` };
  }
  if (id === 'andre') {
    if (s.has('buyerBaggie')) return { outcome: 'charged', title: 'Charged: Simple possession', rep: 0, jail: true, incidents: [], text: `${name} is booked for one baggie. Okafor: "He\'ll get a diversion programme. The dealer is the one we want."` };
    return { outcome: 'noGrounds', title: 'No grounds', rep: -2, jail: false, incidents: ['wrongful_arrest'], text: `There\'s nothing on ${name}. He\'s released, shaken.` };
  }
  return null;
}

// ------------------------------------------------------------------ objective
export function drugObjective(s: GameState): { title: string; text: string; where?: string } | null {
  if (!s.flag('drugCaseOpen')) return { title: 'New case waiting', text: 'Ofc. Delgado, outside Precinct 9, has something for you.', where: 'Precinct 9 — front steps' };
  if (s.flag('drugCaseClosed')) return { title: 'Case 9-201 closed', text: 'The ledger points to a supplier called "M" — a lead for a future case. Free roam.' };
  if (s.flag('dealerBribed')) return { title: 'Case 9-201: compromised', text: 'You let Cody walk. The corner is open for business — and he owes you. (You can still arrest him… if you dare.)', where: 'Harbor Flats corner' };
  const pc = s.has('obsDeal') || s.has('controlledBuy') || s.has('statementAndre');
  if (!pc) return { title: 'Case 9-201: Corner Business', text: 'Watch the Harbor Flats corner from a distance until you see a sale — or make a controlled buy. Don\'t let the lookout make you. Park the cruiser out of sight.', where: 'East end of Main St' };
  if (!s.flag('dealerSearched')) return { title: 'Stop the dealer', text: 'You have probable cause. Stop Cody Brooks and search him. He may run.', where: 'Harbor Flats corner' };
  if (!s.flag('vanSearched') && s.has('burner')) return { title: 'Search the van', text: 'His phone says the re-up is in the van. You have his key.', where: 'Grey van, Main St by Harbor Flats' };
  return { title: 'Book the dealer', text: 'Cuff Cody Brooks and book him at Precinct 9.', where: 'Precinct 9 front desk' };
}
