import type { Input } from '../input/input';
import type { DialogueNode } from '../gameplay/dialogue';
import { EVIDENCE, type EvidenceId, type GameState } from '../gameplay/state';
import type { Objective } from '../gameplay/caseScript';
import type { QualityLevel } from '../core/quality';

const icons = {
  hand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11.5V4a1.5 1.5 0 0 1 3 0v8M14 11.5V6a1.5 1.5 0 0 1 3 0v7.5c0 4-2.5 7-6.5 7S5 18 4 15l-1-3a1.5 1.5 0 0 1 2.7-1.2L8 14"/></svg>',
  car: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 16h14M6 16l1.5-5.5A2 2 0 0 1 9.4 9h5.2a2 2 0 0 1 1.9 1.5L18 16M4 16v3M20 16v3"/><circle cx="7.5" cy="16.5" r="1.2"/><circle cx="16.5" cy="16.5" r="1.2"/></svg>',
  siren: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 18v-5a5 5 0 0 1 10 0v5M5 18h14M12 3v2M4.5 6.5l1.4 1.4M19.5 6.5l-1.4 1.4"/></svg>',
  brake: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><path d="M9 9h6v6H9z"/></svg>',
};

export class Hud {
  private root: HTMLElement;
  private loading!: HTMLDivElement;
  private objective!: HTMLDivElement;
  private prompt!: HTMLDivElement;
  private toastEl!: HTMLDivElement;
  private diag!: HTMLDivElement;
  private btnInteract!: HTMLButtonElement;
  private btnVehicle!: HTMLButtonElement;
  private btnSiren!: HTMLButtonElement;
  private btnBrake!: HTMLButtonElement;
  private dialogue!: HTMLDivElement;
  private examine!: HTMLDivElement;
  private notebook!: HTMLDivElement;
  private menu!: HTMLDivElement;
  private report!: HTMLDivElement;
  private toastTimer = 0;
  private lastObjective = '';
  /** True while any modal is open (gameplay input is suspended). */
  modalOpen = false;
  onQuality: (q: QualityLevel) => void = () => {};
  onDiag: (on: boolean) => void = () => {};
  onSensitivity: (v: number) => void = () => {};
  diagOn = false;

  constructor(private input: Input) {
    this.root = document.getElementById('ui')!;
    this.build();
  }

  private el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, html = '', parent: HTMLElement = this.root) {
    const e = document.createElement(tag);
    e.className = cls;
    if (html) e.innerHTML = html;
    parent.appendChild(e);
    return e;
  }

  private build() {
    this.loading = this.el('div', 'loading', `
      <div class="card">
        <h1>CASE <span>FILES</span></h1>
        <p>Harbor Street · Precinct 9</p>
        <div class="bar"><i></i></div>
        <div class="status">Starting engine…</div>
        <button class="start">Start shift</button>
        <div class="err"></div>
      </div>`);
    this.el('div', 'rotate', '<div><b>Rotate your phone</b><span>Case Files plays in landscape.</span></div>');
    this.objective = this.el('div', 'objective');
    this.prompt = this.el('div', 'prompt');
    this.toastEl = this.el('div', 'toast');
    this.diag = this.el('div', 'diag');

    const top = this.el('div', 'topbar interactive');
    const nb = this.el('button', 'chip', 'Notebook', top);
    nb.addEventListener('click', () => this.input.press('notebook'));
    const mn = this.el('button', 'chip', '☰', top);
    mn.addEventListener('click', () => this.input.press('menu'));

    const actions = this.el('div', 'actions interactive');
    this.btnSiren = this.el('button', 'btn small hidden', `${icons.siren}Siren`, actions) as HTMLButtonElement;
    this.btnVehicle = this.el('button', 'btn hidden', `${icons.car}Enter`, actions) as HTMLButtonElement;
    this.btnBrake = this.el('button', 'btn small hidden', `${icons.brake}Brake`, actions) as HTMLButtonElement;
    this.btnInteract = this.el('button', 'btn primary disabled', `${icons.hand}<span>Interact</span>`, actions) as HTMLButtonElement;
    const bindTap = (btn: HTMLElement, fn: () => void) => {
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); btn.classList.add('pressed'); fn(); });
      const up = () => btn.classList.remove('pressed');
      btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up); btn.addEventListener('pointerleave', up);
    };
    bindTap(this.btnInteract, () => this.input.press('interact'));
    bindTap(this.btnVehicle, () => this.input.press('vehicle'));
    bindTap(this.btnSiren, () => this.input.press('siren'));
    this.btnBrake.addEventListener('pointerdown', (e) => { e.preventDefault(); this.input.brakeHeld = true; this.btnBrake.classList.add('pressed'); });
    const relBrake = () => { this.input.brakeHeld = false; this.btnBrake.classList.remove('pressed'); };
    this.btnBrake.addEventListener('pointerup', relBrake); this.btnBrake.addEventListener('pointercancel', relBrake); this.btnBrake.addEventListener('pointerleave', relBrake);

    this.dialogue = this.el('div', 'modal dialogue interactive', '<div class="sheet"><div class="who"></div><div class="line"></div><div class="choices"></div></div>');
    this.examine = this.el('div', 'modal examine interactive', '<div class="sheet"></div>');
    this.notebook = this.el('div', 'modal notebook interactive', '<div class="sheet"><header><h2>Notebook</h2><button>Close</button></header><div class="body"></div></div>');
    this.notebook.querySelector('header button')!.addEventListener('click', () => this.closeNotebook());
    this.menu = this.el('div', 'modal menu interactive', '<div class="sheet"><header><h2>Settings</h2><button>Resume</button></header><div class="body"></div></div>');
    this.menu.querySelector('header button')!.addEventListener('click', () => this.closeMenu());
    this.report = this.el('div', 'modal report interactive', '<div class="sheet"></div>');
  }

  // ---------- Loading ----------
  setLoading(p: number, label: string) {
    (this.loading.querySelector('.bar i') as HTMLElement).style.width = `${Math.round(p * 100)}%`;
    this.loading.querySelector('.status')!.textContent = label;
  }
  loadError(msg: string) { this.loading.querySelector('.err')!.textContent = msg; }
  ready(onStart: () => void) {
    this.loading.classList.add('ready');
    this.loading.querySelector('.status')!.textContent = 'Ready.';
    const btn = this.loading.querySelector('.start') as HTMLButtonElement;
    btn.addEventListener('click', () => { this.loading.classList.add('done'); onStart(); }, { once: true });
  }

  // ---------- HUD ----------
  setObjective(o: Objective) {
    const key = o.title + o.text;
    if (key === this.lastObjective) return;
    this.lastObjective = key;
    this.objective.innerHTML = `<small>${o.title}</small><div>${o.text}</div>${o.where ? `<div class="loc">📍 ${o.where}</div>` : ''}`;
  }

  setPrompt(label: string | null, desktopKey = 'E') {
    if (!label) {
      this.prompt.classList.remove('show');
      this.btnInteract.classList.add('disabled');
      this.btnInteract.querySelector('span')!.textContent = 'Interact';
      return;
    }
    this.prompt.innerHTML = `${this.input.touchMode ? '' : `<kbd>${desktopKey}</kbd>`}${label}`;
    this.prompt.classList.toggle('show', !this.input.touchMode);
    this.btnInteract.classList.remove('disabled');
    this.btnInteract.querySelector('span')!.textContent = label.length > 14 ? label.split(' ')[0] : label;
  }

  setVehicleButton(mode: 'enter' | 'exit' | null) {
    this.btnVehicle.classList.toggle('hidden', !mode);
    if (mode) this.btnVehicle.innerHTML = `${icons.car}${mode === 'enter' ? 'Drive' : 'Exit'}`;
    this.btnSiren.classList.toggle('hidden', mode !== 'exit');
    this.btnBrake.classList.toggle('hidden', mode !== 'exit');
  }

  toast(msg: string, ms = 2800) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  setDiag(text: string, bad: boolean) {
    this.diag.textContent = text;
    this.diag.classList.toggle('show', this.diagOn);
    this.diag.classList.toggle('bad', bad);
  }

  // ---------- Dialogue ----------
  showDialogue(node: DialogueNode | null, onClose: () => void) {
    if (!node) { this.dialogue.classList.remove('show'); this.modalOpen = false; onClose(); return; }
    this.modalOpen = true;
    this.dialogue.classList.add('show');
    this.dialogue.querySelector('.who')!.innerHTML = `${node.speaker}${node.role ? `<span>${node.role}</span>` : ''}`;
    this.dialogue.querySelector('.line')!.textContent = node.text;
    const box = this.dialogue.querySelector('.choices')!;
    box.innerHTML = '';
    for (const c of node.choices) {
      const b = document.createElement('button');
      b.className = `choice ${c.kind ?? ''}`;
      b.textContent = c.label;
      b.addEventListener('click', () => this.showDialogue(c.next(), onClose));
      box.appendChild(b);
    }
  }

  // ---------- Examine ----------
  showExamine(title: string, text: string, actionLabel: string | null, onAction: () => void) {
    this.modalOpen = true;
    const sheet = this.examine.querySelector('.sheet')!;
    sheet.innerHTML = `<h2>${title}</h2><p>${text}</p><div class="row"><button class="back">Back</button>${actionLabel ? `<button class="go">${actionLabel}</button>` : ''}</div>`;
    this.examine.classList.add('show');
    const close = () => { this.examine.classList.remove('show'); this.modalOpen = false; };
    sheet.querySelector('.back')!.addEventListener('click', close);
    sheet.querySelector('.go')?.addEventListener('click', () => { close(); onAction(); });
  }

  showConfirm(title: string, text: string, yes: string, onYes: () => void) { this.showExamine(title, text, yes, onYes); }

  // ---------- Report ----------
  showReport(stamp: string, stampKind: '' | 'bad' | 'warn', title: string, body: string) {
    this.modalOpen = true;
    const sheet = this.report.querySelector('.sheet')!;
    sheet.innerHTML = `<div class="stamp ${stampKind}">${stamp}</div><h2 style="font:400 22px 'Special Elite',serif;margin:6px 0">${title}</h2><div class="case-paper">${body}</div><div style="text-align:right;margin-top:12px"><button class="chip" style="pointer-events:auto">Continue</button></div>`;
    this.report.classList.add('show');
    sheet.querySelector('button')!.addEventListener('click', () => { this.report.classList.remove('show'); this.modalOpen = false; });
  }

  // ---------- Notebook ----------
  get notebookOpen() { return this.notebook.classList.contains('show'); }
  openNotebook(s: GameState, obj: Objective) {
    this.modalOpen = true;
    const body = this.notebook.querySelector('.body')!;
    const ev = (Object.keys(EVIDENCE) as EvidenceId[]).map((id) => {
      const d = EVIDENCE[id];
      const has = s.has(id);
      if (!has && id === 'bag') return '';
      return `<div class="ev-item ${has ? '' : 'missing'}"><span class="tag">${has ? d.icon : '·'}</span><div><b>${has ? d.name : 'Unknown'}</b>${has ? d.desc : '<i>Not yet found.</i>'}</div></div>`;
    }).join('');
    const arrests = s.arrests.map((a) => `<div class="task">${a.npcId} — ${a.outcome}</div>`).join('') || '<div class="task" style="color:var(--muted)">None yet.</div>';
    body.innerHTML = `
      <h3>Current lead</h3><div class="case-paper"><b>${obj.title}</b><br>${obj.text}${obj.where ? `<br><i>${obj.where}</i>` : ''}</div>
      <h3>Case 9-114 — The Night Drop</h3>
      <div class="task">Victim: Rosa Alvarez, owner of Café Luna. $3,200 deposit bag taken ~5:40 PM in the alley by the bank.</div>
      <h3>Evidence & statements (${s.evidence.size})</h3>${ev}
      <h3>Arrests</h3>${arrests}
      <h3>Standing</h3><div class="task">Reputation: ${s.reputation >= 0 ? '+' : ''}${s.reputation}</div>`;
    this.notebook.classList.add('show');
  }
  closeNotebook() { this.notebook.classList.remove('show'); this.modalOpen = false; }

  // ---------- Menu ----------
  get menuOpen() { return this.menu.classList.contains('show'); }
  openMenu(level: QualityLevel, info: string, sensitivity: number) {
    this.modalOpen = true;
    const body = this.menu.querySelector('.body')!;
    body.innerHTML = `
      <div class="opt"><span>Graphics quality</span><div class="seg" data-k="q">
        ${(['low', 'medium', 'high'] as QualityLevel[]).map((l) => `<button data-v="${l}" class="${l === level ? 'on' : ''}">${l[0].toUpperCase() + l.slice(1)}</button>`).join('')}
      </div></div>
      <div class="opt"><span>Performance overlay</span><div class="seg" data-k="d">
        <button data-v="off" class="${this.diagOn ? '' : 'on'}">Off</button><button data-v="on" class="${this.diagOn ? 'on' : ''}">On</button>
      </div></div>
      <div class="opt"><span>Camera sensitivity</span><div class="seg" data-k="s">
        ${[0.7, 1, 1.4].map((v, i) => `<button data-v="${v}" class="${Math.abs(v - sensitivity) < 0.01 ? 'on' : ''}">${['Low', 'Normal', 'High'][i]}</button>`).join('')}
      </div></div>
      <p>Changing quality reloads the page (your case progress in this build is not saved yet).</p>
      <h3>Controls</h3>
      <p><b>Touch:</b> left side = move (push to the edge to run) · drag right side = look · big button = interact · Drive/Exit near the cruiser.<br>
      <b>Keyboard:</b> WASD move · Shift run · mouse drag or double-click to lock the mouse · E interact · F enter/exit car · Space brake · H siren · Tab notebook · \` overlay.</p>
      <h3>Build</h3><p>${info}</p>
      <h3>Credits</h3><p>Engine: PlayCanvas (MIT). Textures, HDRI and props: Poly Haven (CC0). Characters and vehicles: Kenney (CC0), placeholder art.</p>`;
    body.querySelectorAll('.seg').forEach((seg) => {
      seg.querySelectorAll('button').forEach((btn) => btn.addEventListener('click', () => {
        const k = (seg as HTMLElement).dataset.k, v = (btn as HTMLElement).dataset.v!;
        seg.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
        btn.classList.add('on');
        if (k === 'q') this.onQuality(v as QualityLevel);
        if (k === 'd') { this.diagOn = v === 'on'; this.onDiag(this.diagOn); }
        if (k === 's') this.onSensitivity(parseFloat(v));
      }));
    });
    this.menu.classList.add('show');
  }
  closeMenu() { this.menu.classList.remove('show'); this.modalOpen = false; }
}
