/** Persistent-ish case + world state. Pure data, no rendering. */

export type EvidenceId = 'slip' | 'cigpack' | 'lighter' | 'footage' | 'statementRosa' | 'statementNina' | 'statementVictor' | 'bag'
  // Case 9-201 — Corner Business
  | 'tipDelgado' | 'obsDeal' | 'obsVan' | 'obsLookout' | 'controlledBuy' | 'baggies' | 'dealerCash' | 'burner'
  | 'buyerBaggie' | 'statementAndre' | 'vanStash' | 'ledger';

export type CaseId = '9-114' | '9-201';

export interface EvidenceDef {
  id: EvidenceId;
  name: string;
  icon: string;
  kind: 'physical' | 'testimony' | 'record' | 'observation';
  desc: string;
  case?: CaseId;
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
  // ---- Case 9-201 ----
  tipDelgado: { id: 'tipDelgado', case: '9-201', name: 'Resident complaints', icon: '📞', kind: 'record', desc: 'Harbor Flats residents report hand-to-hand dealing on the corner outside the building, east end of Main St. It stops when a patrol car rolls by.' },
  obsDeal: { id: 'obsDeal', case: '9-201', name: 'Observed hand-to-hand sale', icon: '👁️', kind: 'observation', desc: 'You watched the man on the Harbor Flats corner take cash and pass a small item to a buyer. Probable cause to detain and search him.' },
  obsVan: { id: 'obsVan', case: '9-201', name: 'Observed re-up at the van', icon: '🚐', kind: 'observation', desc: 'Between sales the dealer walks to the grey van parked on Main St, reaches inside and comes back. He is keeping his supply there.' },
  obsLookout: { id: 'obsLookout', case: '9-201', name: 'Lookout warning', icon: '📣', kind: 'observation', desc: 'A woman down the block shouted a warning to the dealer when police came near. She is working as his lookout.' },
  controlledBuy: { id: 'controlledBuy', case: '9-201', name: 'Controlled buy', icon: '💵', kind: 'record', desc: 'You bought one baggie from the dealer with $40 of marked department buy money. The serial numbers are on file.' },
  baggies: { id: 'baggies', case: '9-201', name: '14 baggies of pressed pills', icon: '💊', kind: 'physical', desc: 'Fourteen knotted baggies of pressed blue pills from the dealer\'s jacket. Field test: positive for fentanyl. Packaged for sale.' },
  dealerCash: { id: 'dealerCash', case: '9-201', name: 'Cash in small bills', icon: '💰', kind: 'physical', desc: '$640 in tens and twenties, folded separately from his own wallet.' },
  burner: { id: 'burner', case: '9-201', name: 'Burner phone', icon: '📱', kind: 'physical', desc: 'Prepaid phone. Texts: "re-up is in the van, back seat box" and, from a contact saved as "M": "6 more by fri. dont be short again."' },
  buyerBaggie: { id: 'buyerBaggie', case: '9-201', name: "Buyer's baggie", icon: '💊', kind: 'physical', desc: 'One baggie of the same blue pills, taken from a buyer minutes after the exchange.' },
  statementAndre: { id: 'statementAndre', case: '9-201', name: "Andre's statement", icon: '🗣️', kind: 'testimony', desc: 'Andre Mills, a regular buyer: "Cody. Cody Brooks. He\'s out there every afternoon. Keeps the rest in his van so he\'s never holding much."' },
  vanStash: { id: 'vanStash', case: '9-201', name: 'Stash from the van', icon: '📦', kind: 'physical', desc: 'Shoebox behind the van\'s back seat: about 200 more pills, a digital scale and baggies, and $3,100 in cash.' },
  ledger: { id: 'ledger', case: '9-201', name: 'Ledger', icon: '📒', kind: 'record', desc: 'A pocket notebook of dates, initials and amounts — and weekly payments to "M". Lists $3,100 on hand. A lead to the supplier.' },
};

export type Flag =
  | 'briefed' | 'metRosa' | 'metNina' | 'footageAllowed' | 'metDale' | 'metVictor'
  | 'daleConfessed' | 'daleBagLocation' | 'bagReturned' | 'caseClosed'
  // Case 9-201
  | 'drugCaseOpen' | 'drugSearchLawful' | 'drugSearchUnlawful' | 'dealerSearched' | 'dealerBribed' | 'bribeRefused'
  | 'vanSearched' | 'stashSkimmed' | 'drugCaseClosed' | 'andreFlipped' | 'dealerKnowsYou';

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
  /** The player's own cash (bribes and skimmed money end up here). */
  money = 0;
  /** Marked department buy money for controlled buys. */
  buyMoney = 0;

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

  /** Evidence ids belonging to a case (Case 9-114 items have no case tag). */
  caseEvidence(c: CaseId) { return (Object.keys(EVIDENCE) as EvidenceId[]).filter((id) => (EVIDENCE[id].case ?? '9-114') === c); }

  remove(e: EvidenceId) { this.evidence.delete(e); }
}
