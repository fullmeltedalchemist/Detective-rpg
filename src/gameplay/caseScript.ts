import type { DialogueNode, Choice } from './dialogue';
import { leave } from './dialogue';
import { EVIDENCE, type EvidenceId, type GameState, type Arrest } from './state';

/**
 * CASE 9-114 — "The Night Drop"
 * Rosa Alvarez (Café Luna) was robbed of the café's $3,200 deposit bag in the alley
 * beside First Civic Bank at ~5:40 PM. The thief is Dale Mercer (red T-shirt, smokes
 * Red Harbors, engraved lighter "D.M."). Victor Lane (grey T-shirt) is a red herring
 * who was in the alley earlier. Bank footage exonerates Victor and points to Dale.
 */

export interface CaseCtx {
  state: GameState;
  toast(msg: string): void;
  addEvidence(id: EvidenceId): void;
  startArrest(npcId: string): void;
  isCuffed(npcId: string): boolean;
  hasPrisoner(): boolean;
  revealBag(): void;
}

export interface Objective { title: string; text: string; where?: string }

export function currentObjective(s: GameState, ctx: { prisonerName: string | null }): Objective {
  if (!s.flag('briefed')) return { title: 'Report for duty', text: 'Talk to Sgt. Okafor at the front desk of Precinct 9.', where: 'Precinct 9 — south side of Main St' };
  if (ctx.prisonerName) return { title: 'Book the suspect', text: `Bring ${ctx.prisonerName} to Sgt. Okafor's desk and book them.`, where: 'Precinct 9 front desk' };
  if (s.flag('caseClosed')) {
    if (s.flag('daleBagLocation') && !s.has('bag')) return { title: 'Recover the money', text: 'Dale said he dumped the bag in the park trash can by Oak Ave.', where: 'Pocket park, north-west corner' };
    if (s.has('bag') && !s.flag('bagReturned')) return { title: 'Return the money', text: 'Bring the deposit bag back to Rosa at Café Luna.', where: 'Café Luna' };
    return { title: 'Case closed', text: 'Free roam. Explore Harbor Street — more cases are coming in future builds.' };
  }
  if (!s.flag('metRosa')) return { title: 'Case 9-114: The Night Drop', text: 'Interview the victim, Rosa Alvarez, at Café Luna.', where: 'Café Luna — north side of Main St' };
  const physical = ['slip', 'cigpack', 'lighter'].filter((e) => s.has(e as EvidenceId)).length;
  if (physical < 3) return { title: 'Search the crime scene', text: `Examine the alley beside the bank for evidence (${physical}/3 found).`, where: 'Alley between Café Luna and the bank' };
  if (!s.flag('metNina')) return { title: 'Canvass witnesses', text: 'The bank has a camera on the alley. Talk to the teller, Nina.', where: 'First Civic Bank' };
  if (!s.has('footage')) return { title: 'Review the footage', text: 'Check the security monitor behind the bank counter.', where: 'First Civic Bank — back office desk' };
  if (!s.flag('metDale') || !s.flag('metVictor')) return { title: 'Question suspects', text: 'Find and question Dale Mercer (bus stop) and Victor Lane (the park).', where: 'Bus stop / pocket park' };
  return { title: 'Make an arrest', text: 'Arrest the person the evidence supports, then book them at Precinct 9.', where: 'Your call, detective' };
}

function evidenceChoices(s: GameState, react: (id: EvidenceId) => DialogueNode, ids: EvidenceId[]): Choice[] {
  return ids.filter((id) => s.has(id)).map((id) => ({ label: `Show: ${EVIDENCE[id].name}`, kind: 'ev' as const, next: () => react(id) }));
}

function arrestChoice(ctx: CaseCtx, npcId: string, name: string): Choice[] {
  if (ctx.isCuffed(npcId) || ctx.state.jailed.has(npcId)) return [];
  if (ctx.hasPrisoner()) return [];
  return [{
    label: `Arrest ${name.split(' ')[0]}`, kind: 'danger', next: () => {
      ctx.startArrest(npcId);
      return null;
    },
  }];
}

// ---------------- Dialogue trees ----------------

export function dialogueFor(npcId: string, name: string, ctx: CaseCtx): DialogueNode {
  const s = ctx.state;
  if (s.hostile.has(npcId)) {
    return { speaker: name, text: 'I have nothing to say to you. Talk to my lawyer.', choices: [leave()] };
  }
  switch (npcId) {
    case 'okafor': return okafor(name, ctx);
    case 'rosa': return rosa(name, ctx);
    case 'nina': return nina(name, ctx);
    case 'dale': return dale(name, ctx);
    case 'victor': return victor(name, ctx);
    default: return civilian(npcId, name, ctx);
  }
}

function okafor(name: string, ctx: CaseCtx): DialogueNode {
  const s = ctx.state;
  const role = 'Desk Sergeant';
  if (!s.flag('briefed')) {
    const brief = (): DialogueNode => {
      s.set('briefed');
      return {
        speaker: name, role,
        text: 'Robbery, twenty minutes ago. Rosa Alvarez from Café Luna was walking her deposit bag to the bank night drop — someone jumped her in the alley. Three grand. Start with Rosa, then work the scene. Bring me a suspect and enough to hold them.',
        choices: [
          { label: 'How do I book someone?', next: () => ({ speaker: name, role, text: 'Cuff them, walk them in — or drive them, your cruiser\'s out back in the lot — and bring them to this desk. I review the evidence before anyone goes in the cell. Weak case, they walk. Wrong person, it\'s on your record.', choices: [leave('On it.')] }) },
          leave('On it.'),
        ],
      };
    };
    return { speaker: name, role, text: 'Detective. Good, you\'re here. We\'ve got a fresh one on your desk.', choices: [{ label: 'What happened?', next: brief }] };
  }
  const hints: string[] = [];
  if (s.flag('caseClosed')) {
    if (!s.flag('drugCaseOpen')) hints.push('Good work on Rosa\'s case. Delgado\'s out front — he\'s got a corner problem at Harbor Flats that needs a detective.');
    else if (s.flag('drugCaseClosed')) hints.push('Brooks is in a cell and the ledger\'s with the lab. Quiet week, for once.');
    else if (s.flag('dealerBribed')) hints.push('Residents are still calling about the Flats corner. Strange — I thought you were on that.');
    else hints.push('How\'s the Flats corner? Remember: see it, then search it. Not the other way round.');
  } else if (!s.flag('metRosa')) hints.push('Rosa\'s at the café, across Main.');
  else if (!s.has('footage')) hints.push('The bank has a camera covering that alley. Get the footage.');
  else hints.push('You\'ve got footage. Match it to someone and bring them in.');
  return {
    speaker: name, role,
    text: ctx.hasPrisoner() ? 'Bring them up to the desk and I\'ll process the booking.' : `${hints[0]} Reputation on the street: ${repWord(s.reputation)}.`,
    choices: [leave('Thanks, Sarge.')],
  };
}

function repWord(r: number) {
  if (r >= 4) return 'respected';
  if (r >= 1) return 'decent';
  if (r > -2) return 'neutral';
  if (r > -5) return 'shaky';
  return 'bad';
}

function rosa(name: string, ctx: CaseCtx): DialogueNode {
  const s = ctx.state;
  const role = 'Owner, Café Luna — victim';
  if (s.has('bag') && !s.flag('bagReturned')) {
    return {
      speaker: name, role, text: 'Is that… my deposit bag?',
      choices: [{ label: 'Return the bag', kind: 'ev', next: () => {
        s.set('bagReturned'); s.reputation += 2; ctx.toast('Money returned to Rosa  ·  Reputation +2');
        return { speaker: name, role, text: 'It\'s all here. I… thank you, detective. Coffee\'s on the house. Forever.', choices: [leave()] };
      } }],
    };
  }
  if (s.flag('caseClosed')) return { speaker: name, role, text: s.flag('bagReturned') ? 'Your usual? Flat white, extra hot.' : 'I heard you made an arrest. Any word on the money?', choices: [leave()] };
  const ask = (): DialogueNode => {
    s.set('metRosa');
    ctx.addEvidence('statementRosa');
    return {
      speaker: name, role,
      text: 'I close the till at 5:30 and walk the bag to the night drop — out the side door, through the alley. Every day. Today someone shoved me from behind, ripped the bag away and ran toward Main. I never saw his face. Just… cigarette smoke, strong.',
      choices: [
        { label: 'Anyone suspicious around today?', next: () => ({ speaker: name, role, text: 'A man in a grey shirt was digging around the dumpster earlier. Victor, I think — he collects cans. He\'s usually in the park.', choices: [
          { label: 'Anything else?', next: () => ({ speaker: name, role, text: 'The bank has a camera on that wall. Nina at the counter might help you.', choices: [leave('I\'ll find who did this.')] }) },
          leave('I\'ll find who did this.'),
        ] }) },
        leave('I\'ll find who did this.'),
      ],
    };
  };
  if (!s.flag('metRosa')) return { speaker: name, role, text: 'Detective? Thank God. Please — that was the whole week.', choices: [{ label: 'Tell me what happened.', next: ask }, ...arrestChoice(ctx, 'rosa', name)] };
  return {
    speaker: name, role, text: 'Did you find anything?',
    choices: [
      ...evidenceChoices(s, (id) => ({ speaker: name, role, text: id === 'slip' ? 'That\'s my slip. It was in the bag.' : id === 'lighter' ? '"D.M."? I don\'t know anyone… wait. There\'s a Dale who buys coffee sometimes. Smokes like a chimney.' : id === 'footage' ? 'Red shirt… I didn\'t see him. I\'m sorry.' : 'I don\'t know.', choices: [leave('Thanks.')] }), ['slip', 'lighter', 'footage']),
      ...arrestChoice(ctx, 'rosa', name),
      leave(),
    ],
  };
}

function nina(name: string, ctx: CaseCtx): DialogueNode {
  const s = ctx.state;
  const role = 'Teller, First Civic Bank';
  const footage: Choice = {
    label: 'I need your alley camera footage.', next: () => {
      s.set('footageAllowed');
      return { speaker: name, role, text: 'Of course. The monitor\'s on the desk behind the counter — go through the gate at the end. It records the whole alley.', choices: [leave('Thanks.')] };
    },
  };
  if (!s.flag('metNina')) {
    return {
      speaker: name, role, text: 'Welcome to First Civic. Oh — you\'re police. Is this about Rosa? Everyone heard.',
      choices: [{ label: 'Did you see anything?', next: () => {
        s.set('metNina'); ctx.addEvidence('statementNina');
        return { speaker: name, role, text: 'Not today. But yesterday a guy in a red T-shirt — Dale, the smoker from the bus stop — asked me what time the café does its night deposit. I thought it was weird.', choices: [footage, leave()] };
      } }, ...arrestChoice(ctx, 'nina', name)],
    };
  }
  return { speaker: name, role, text: 'Anything else, detective?', choices: [...(s.flag('footageAllowed') ? [] : [footage]), ...arrestChoice(ctx, 'nina', name), leave()] };
}

function dale(name: string, ctx: CaseCtx): DialogueNode {
  const s = ctx.state;
  const role = 'Bus stop regular';
  s.set('metDale');
  const pressure = { lighter: false, footage: false };
  const root = (text: string): DialogueNode => ({
    speaker: name, role, text,
    choices: [
      { label: 'Where were you around 5:40?', next: () => root('Here. Waiting for the 14. All afternoon. Ask anyone.') },
      { label: 'You smoke Red Harbors?', next: () => root('What, is that a crime now? Yeah. Half the city does.') },
      ...evidenceChoices(s, (id) => react(id), ['lighter', 'footage', 'cigpack', 'statementNina', 'statementVictor']),
      ...arrestChoice(ctx, 'dale', name),
      leave(),
    ],
  });
  const react = (id: EvidenceId): DialogueNode => {
    if (id === 'lighter') pressure.lighter = true;
    if (id === 'footage') pressure.footage = true;
    if ((pressure.lighter || s.has('lighter')) && pressure.footage && !s.flag('daleConfessed')) {
      s.set('daleConfessed'); s.set('daleBagLocation');
      ctx.toast('Dale confessed — and told you where the bag is');
      ctx.revealBag();
      return {
        speaker: name, role,
        text: '…Okay. OKAY. I\'m behind on rent, alright? I didn\'t hurt her. I panicked and dumped the bag in the trash can by the park entrance. Most of it\'s still there.',
        choices: [...arrestChoice(ctx, 'dale', name), leave()],
      };
    }
    const lines: Partial<Record<EvidenceId, string>> = {
      lighter: '"D.M."? Lots of people have those initials. Lots of people lose lighters.',
      footage: 'A guy in a red shirt. So? Could be anybody.',
      cigpack: 'You found cigarettes in an alley. Congratulations.',
      statementNina: 'I was just making conversation. She\'s cute. That\'s all.',
      statementVictor: 'Victor? He\'d say anything for a sandwich.',
    };
    return root(lines[id] ?? 'Whatever.');
  };
  if (s.flag('daleConfessed')) return { speaker: name, role, text: 'I told you everything already.', choices: [...arrestChoice(ctx, 'dale', name), leave()] };
  return root('Officer. Something I can help you with?');
}

function victor(name: string, ctx: CaseCtx): DialogueNode {
  const s = ctx.state;
  const role = 'Can collector';
  s.set('metVictor');
  const statement: Choice = {
    label: 'Were you in the alley today?', next: () => {
      ctx.addEvidence('statementVictor');
      return { speaker: name, role, text: 'Sure, collecting cans. Left around 5:20 — the bank guy shoos me off. Later I saw a fella in a red shirt tear past the park toward the bus stop like his pants were on fire.', choices: [leave()] };
    },
  };
  return {
    speaker: name, role, text: 'Evening, officer. I didn\'t do nothing.',
    choices: [
      ...(s.has('statementVictor') ? [] : [statement]),
      ...evidenceChoices(s, (id) => ({
        speaker: name, role,
        text: id === 'footage' ? 'See? That\'s me leaving at 5:20. Grey shirt. I was long gone.' : id === 'cigpack' ? 'Don\'t smoke. Can\'t afford it.' : id === 'lighter' ? 'Nice lighter. Not mine. I\'m Victor Lane — V.L.' : 'Don\'t know nothing about that.',
        choices: [leave()],
      }), ['footage', 'cigpack', 'lighter']),
      ...arrestChoice(ctx, 'victor', name),
      leave(),
    ],
  };
}

const CIV_LINES = [
  'Heard Rosa got robbed. In broad daylight! What\'s this neighbourhood coming to?',
  'That guy at the bus stop smokes a pack an hour. Gives me a headache.',
  'You\'re the new detective? Huh. Good luck.',
  'The bank camera\'s pointed right at that alley, you know.',
  'Saw someone running down Main earlier. Red shirt, I think. Didn\'t see where.',
];

function civilian(npcId: string, name: string, ctx: CaseCtx): DialogueNode {
  const s = ctx.state;
  const idx = (npcId.charCodeAt(npcId.length - 1) + s.evidence.size) % CIV_LINES.length;
  let text = CIV_LINES[idx];
  if (s.flag('dealerBribed') && idx % 2 === 0) text = 'Dealing\'s back on the Flats corner. Cops drive right past. Makes you wonder.';
  else if (s.flag('drugCaseClosed') && idx % 2 === 0) text = 'The corner by the Flats is finally quiet. My kids can walk home that way again.';
  if (s.reputation <= -3) text = 'Keep your distance. I saw what you did to that innocent guy.';
  else if (s.reputation >= 4 && s.flag('caseClosed')) text = 'Thanks for catching that thief, detective. Feels safer already.';
  return { speaker: name, role: 'Resident', text, choices: [...arrestChoice(ctx, npcId, name), leave()] };
}

// ---------------- Booking ----------------

export interface BookingResult { outcome: Arrest['outcome']; title: string; text: string; rep: number; jail: boolean }

export function evaluateBooking(npcId: string, name: string, s: GameState): BookingResult {
  if (npcId === 'dale') {
    const str = s.daleCaseStrength();
    if (s.flag('daleConfessed') || str >= 5) {
      return { outcome: 'charged', title: 'Charged: Robbery', rep: 3, jail: true, text: `${name} is booked and charged. ${s.flag('daleConfessed') ? 'His confession, ' : ''}the footage and the engraved lighter make a solid case. The DA will be pleased.` };
    }
    if (str >= 2) {
      return { outcome: 'weak', title: 'Held — weak case', rep: 0, jail: true, text: `${name} is booked, but Okafor isn't impressed: "This is thin. Defense will shred it without the footage or something that physically ties him to the scene." The case may not survive trial.` };
    }
    return { outcome: 'released', title: 'Released — insufficient evidence', rep: -1, jail: false, text: `Okafor shakes her head. "On what grounds? A hunch?" ${name} is released. Go find real evidence.` };
  }
  if (npcId === 'victor') {
    return {
      outcome: 'wrongful', title: 'Wrongful arrest', rep: -3, jail: false,
      text: s.has('footage') ? `"Detective, your own footage shows ${name} leaving at 5:20." He's released with an apology. A complaint is filed against you.` : `Okafor pulls the bank footage herself: ${name} left the alley twenty minutes before the robbery. He's released. A complaint is filed against you.`,
    };
  }
  return { outcome: 'noGrounds', title: 'No grounds', rep: -2, jail: false, text: `"Why is ${name} in cuffs?" There's nothing connecting them to any crime. They're released — and they'll remember this.` };
}
