export interface Choice {
  label: string;
  kind?: 'ev' | 'danger' | 'leave' | 'normal';
  /** Return the next node, or null to close the conversation. */
  next: () => DialogueNode | null;
}

export interface DialogueNode {
  speaker: string;
  role?: string;
  text: string;
  choices: Choice[];
}

export const leave = (label = 'Leave'): Choice => ({ label, kind: 'leave', next: () => null });
