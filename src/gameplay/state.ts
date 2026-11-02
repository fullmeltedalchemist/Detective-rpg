/** Persistent-ish case + world state. Pure data, no rendering. */

export type EvidenceId = 'slip' | 'cigpack' | 'lighter' | 'footage' | 'statementRosa' | 'statementNina' | 'statementVictor' | 'bag';

export interface EvidenceDef {
  id: EvidenceId;
  name: string;
  icon: string;
  kind: 'physical' | 'testimony' | 'record';
  desc: string;
}

export const EVIDENCE: Record<EvidenceId, EvidenceDef> = {
  slip: { id: 'slip', name: 'Deposit slip', icon: '🧾', kind: 'physical', desc: 'Café Luna deposit slip for $3,200, dropped in the alley. Confirms where the robbery happened.' },
  cigpack: { id: 'cigpack', name: 'Red Harbor cigarettes', icon: '🚬', kind: 'physical', desc: 'Half-empty pack of Red Harbor menthols, fresh — not rained on. Someone stood here recently.' },
  lighter: { id: 'lighter', name: 'Engraved lighter', icon: '🔥', kind: 'physical', desc: 'Brass flip lighter by the dumpster, engraved "D.M." Likely dropped in a hurry.' },
  footage: { id: 'footage', name: 'Bank alley footage', icon: '📼', kind: 'record', desc: '5:41 PM: a man in a red T-shirt shoves Rosa, grabs the bag and runs toward Main St (west). Earlier, 5:20 PM: a man in a grey T-shirt leaves the alley — not present at 5:41.' },
  statementRosa: { id: 'statementRosa', name: "Rosa's statement", icon: '🗣️', kind: 'testimony', desc: 'Robbed ~5:40 PM in the alley while walking the deposit bag to the bank night drop. Shoved from behind; smelled cigarettes. Saw a man in a grey shirt by the dumpster earlier.' },
  statementNina: { id: 'statementNina', name: "Nina's statement", icon: '🗣️', kind: 'testimony', desc: 'Bank teller. A smoker in a red T-shirt — "Dale, from the bus stop" — asked her yesterday what time the café makes its night deposit.' },
  statementVictor: { id: 'statementVictor', name: "Victor's statement", icon: '🗣️', kind: 'testimony', desc: 'Collecting cans in the alley until ~5:20 PM. Later saw a man in red sprint past the park toward the bus stop.' },
  bag: { id: 'bag', name: 'Stolen deposit bag', icon: '💼', kind: 'physical', desc: "Café Luna's deposit bag, recovered from the park trash can. Cash inside." },
};

export type Flag =
  | 'briefed' | 'metRosa' | 'metNina' | 'footageAllowed' | 'metDale' | 'metVictor'
  | 'daleConfessed' | 'daleBagLocation' | 'bagReturned' | 'caseClosed';

export interface Arrest { npcId: string; outcome: 'charged' | 'weak' | 'released' | 'wrongful' | 'noGrounds'; at: number }

export class GameState {
  evidence = new Set<EvidenceId>();
  flags = new Set<Flag>();
  reputation = 0; // -10..10, affects NPC reactions
  arrests: Arrest[] = [];
  /** NPC ids that refuse to talk after being wrongly arrested, etc. */
  hostile = new Set<string>();
  /** NPCs currently booked into the cell. */
  jailed = new Set<string>();
  log: string[] = [];

  has(e: EvidenceId) { return this.evidence.has(e); }
  flag(f: Flag) { return this.flags.has(f); }
  set(f: Flag) { this.flags.add(f); }
  add(e: EvidenceId) {
    if (this.evidence.has(e)) return false;
    this.evidence.add(e);
    this.log.push(`Evidence: ${EVIDENCE[e].name}`);
    return true;
  }

  /** How strongly the collected evidence ties Dale to the robbery (0..). */
  daleCaseStrength() {
    let s = 0;
    if (this.has('footage')) s += 2; // red shirt, matches Dale
    if (this.has('lighter')) s += 2; // D.M.
    if (this.has('cigpack')) s += 1; // his brand
    if (this.has('statementNina')) s += 1; // asked about deposit time
    if (this.has('statementVictor')) s += 1;
    if (this.flag('daleConfessed')) s += 4;
    if (this.has('bag')) s += 2;
    return s;
  }
}
