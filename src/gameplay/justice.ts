/**
 * Independent standing variables + an incident log. Every use of force or
 * misconduct is recorded; witnesses determine how much the public and
 * Internal Affairs learn about it (morality always reflects what you did).
 */

export type IncidentType =
  | 'assault_civilian' | 'shot_civilian' | 'killed_civilian'
  | 'shot_surrendered' | 'killed_surrendered'
  | 'justified_shooting' | 'nonlethal_arrest' | 'good_arrest' | 'wrongful_arrest'
  | 'reckless_driving' | 'discharged_weapon_publicly' | 'shot_unarmed_suspect' | 'killed_unarmed_suspect' | 'excessive_force';

interface Delta { trust: number; prof: number; ia: number; morality: number; label: string }

const DELTAS: Record<IncidentType, Delta> = {
  assault_civilian: { trust: -4, prof: -3, ia: 8, morality: -6, label: 'Assaulted a civilian' },
  shot_civilian: { trust: -10, prof: -8, ia: 25, morality: -15, label: 'Shot an innocent civilian' },
  killed_civilian: { trust: -20, prof: -15, ia: 50, morality: -30, label: 'Killed an innocent civilian' },
  shot_surrendered: { trust: -8, prof: -8, ia: 22, morality: -18, label: 'Shot a surrendering suspect' },
  killed_surrendered: { trust: -15, prof: -15, ia: 45, morality: -35, label: 'Killed a surrendering suspect' },
  justified_shooting: { trust: 0, prof: 2, ia: 5, morality: 0, label: 'Officer-involved shooting (justified)' },
  nonlethal_arrest: { trust: 3, prof: 4, ia: 0, morality: 3, label: 'Arrested an armed suspect without lethal force' },
  good_arrest: { trust: 3, prof: 3, ia: 0, morality: 2, label: 'Solid arrest' },
  wrongful_arrest: { trust: -5, prof: -5, ia: 10, morality: -4, label: 'Wrongful arrest' },
  reckless_driving: { trust: -2, prof: -1, ia: 2, morality: -1, label: 'Reckless driving' },
  discharged_weapon_publicly: { trust: -1, prof: -1, ia: 3, morality: 0, label: 'Unjustified weapon discharge' },
  shot_unarmed_suspect: { trust: -7, prof: -6, ia: 18, morality: -12, label: 'Shot an unarmed suspect' },
  killed_unarmed_suspect: { trust: -14, prof: -12, ia: 40, morality: -28, label: 'Killed an unarmed suspect' },
  excessive_force: { trust: -3, prof: -3, ia: 8, morality: -6, label: 'Excessive force on a restrained person' },
};

export interface Incident { type: IncidentType; label: string; witnessed: boolean; subject?: string; at: number }

export class Standing {
  publicTrust = 50;
  professional = 50;
  iaHeat = 0;
  morality = 0;
  criminalInfluence = 0;
  incidents: Incident[] = [];
  suspended = false;

  record(type: IncidentType, witnessed: boolean, subject?: string): { label: string; escalation: string | null } {
    const d = DELTAS[type];
    const k = witnessed ? 1 : 0.35; // unwitnessed acts may still surface through forensics
    this.publicTrust = clamp(this.publicTrust + d.trust * k, 0, 100);
    this.professional = clamp(this.professional + d.prof * k, 0, 100);
    const prevIa = this.iaHeat;
    this.iaHeat = clamp(this.iaHeat + d.ia * k, 0, 100);
    this.morality = clamp(this.morality + d.morality, -100, 100);
    this.incidents.push({ type, label: d.label, witnessed, subject, at: Date.now() });
    let escalation: string | null = null;
    if (prevIa < 40 && this.iaHeat >= 40) escalation = 'Internal Affairs has opened a file on you.';
    if (prevIa < 75 && this.iaHeat >= 75) escalation = 'Internal Affairs investigation: you are under formal review.';
    if (!this.suspended && this.iaHeat >= 100) {
      this.suspended = true;
      escalation = 'SUSPENDED — your firearm has been confiscated pending investigation.';
    }
    return { label: d.label + (witnessed ? ' (witnessed)' : ''), escalation };
  }

  /** Legacy single reputation number used by Case 9-114 dialogue (-10..10). */
  get legacyReputation() { return Math.round((this.publicTrust - 50) / 5); }

  summary() {
    return { trust: Math.round(this.publicTrust), prof: Math.round(this.professional), ia: Math.round(this.iaHeat), morality: Math.round(this.morality), influence: Math.round(this.criminalInfluence) };
  }
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
