/**
 * Unified input: keyboard + mouse on desktop, virtual joystick + drag-to-look on touch.
 * Gameplay code reads `move`, `look`, and edge-triggered `pressed(action)`.
 */
export type Action = 'interact' | 'vehicle' | 'notebook' | 'menu' | 'siren' | 'diag' | 'brake';

export class Input {
  /** Movement: x = right, y = forward, magnitude 0..1 */
  readonly move = { x: 0, y: 0 };
  /** Accumulated look delta in pixels since last frame. */
  readonly look = { x: 0, y: 0 };
  sprint = false;
  brake = false;
  enabled = true;
  /** Set when the player has used touch at all (affects UI). */
  touchMode = false;

  private keys = new Set<string>();
  private edge = new Set<Action>();
  private joyId: number | null = null;
  private joyOrigin = { x: 0, y: 0 };
  private joyVec = { x: 0, y: 0 };
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  private mouseDown = false;
  private joyEl: HTMLDivElement;
  private knobEl: HTMLElement;
  private zoneEl: HTMLDivElement;
  readonly lookSensitivity = { touch: 0.28, mouse: 0.18 };

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement) {
    this.zoneEl = document.createElement('div');
    this.zoneEl.className = 'joy-zone interactive';
    this.joyEl = document.createElement('div');
    this.joyEl.className = 'joy';
    this.joyEl.innerHTML = '<i></i>';
    this.knobEl = this.joyEl.querySelector('i')!;
    ui.append(this.zoneEl, this.joyEl);
    this.resetJoyVisual();

    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => { this.keys.clear(); this.releaseJoy(); this.lookId = null; });

    // Joystick
    this.zoneEl.addEventListener('pointerdown', (e) => {
      this.setTouch(e);
      if (this.joyId !== null) return;
      this.joyId = e.pointerId;
      this.zoneEl.setPointerCapture(e.pointerId);
      this.joyOrigin = { x: e.clientX, y: e.clientY };
      this.joyVec = { x: 0, y: 0 };
      this.joyEl.style.left = e.clientX + 'px';
      this.joyEl.style.top = e.clientY + 'px';
      this.joyEl.classList.add('active');
      e.preventDefault();
    });
    this.zoneEl.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.joyId) return;
      const R = 52;
      let dx = e.clientX - this.joyOrigin.x, dy = e.clientY - this.joyOrigin.y;
      const d = Math.hypot(dx, dy);
      if (d > R) {
        // Drag the base along so the stick never "runs out".
        const over = d - R;
        this.joyOrigin.x += (dx / d) * over; this.joyOrigin.y += (dy / d) * over;
        dx = e.clientX - this.joyOrigin.x; dy = e.clientY - this.joyOrigin.y;
        this.joyEl.style.left = this.joyOrigin.x + 'px';
        this.joyEl.style.top = this.joyOrigin.y + 'px';
      }
      this.joyVec = { x: dx / R, y: -dy / R };
      this.knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
      e.preventDefault();
    });
    const endJoy = (e: PointerEvent) => { if (e.pointerId === this.joyId) this.releaseJoy(); };
    this.zoneEl.addEventListener('pointerup', endJoy);
    this.zoneEl.addEventListener('pointercancel', endJoy);

    // Look: touch drag anywhere on canvas, mouse drag or pointer lock on desktop
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') {
        this.mouseDown = true;
        this.lookLast = { x: e.clientX, y: e.clientY };
        return;
      }
      this.setTouch(e);
      if (this.lookId !== null) return;
      this.lookId = e.pointerId;
      this.lookLast = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') {
        if (document.pointerLockElement === canvas) {
          this.look.x += e.movementX * this.lookSensitivity.mouse;
          this.look.y += e.movementY * this.lookSensitivity.mouse;
        } else if (this.mouseDown) {
          this.look.x += (e.clientX - this.lookLast.x) * this.lookSensitivity.mouse * 1.6;
          this.look.y += (e.clientY - this.lookLast.y) * this.lookSensitivity.mouse * 1.6;
          this.lookLast = { x: e.clientX, y: e.clientY };
        }
        return;
      }
      if (e.pointerId !== this.lookId) return;
      this.look.x += (e.clientX - this.lookLast.x) * this.lookSensitivity.touch;
      this.look.y += (e.clientY - this.lookLast.y) * this.lookSensitivity.touch;
      this.lookLast = { x: e.clientX, y: e.clientY };
    });
    const endLook = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') { this.mouseDown = false; return; }
      if (e.pointerId === this.lookId) this.lookId = null;
    };
    canvas.addEventListener('pointerup', endLook);
    canvas.addEventListener('pointercancel', endLook);
    canvas.addEventListener('dblclick', () => { if (!this.touchMode) canvas.requestPointerLock?.(); });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // iOS: block pinch-zoom / double-tap zoom gestures.
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
  }

  private setTouch(e: PointerEvent) {
    if (e.pointerType === 'touch' && !this.touchMode) {
      this.touchMode = true;
      document.body.classList.add('touch');
    }
  }

  private releaseJoy() {
    this.joyId = null;
    this.joyVec = { x: 0, y: 0 };
    this.joyEl.classList.remove('active');
    this.resetJoyVisual();
  }

  private resetJoyVisual() {
    this.knobEl.style.transform = 'translate(0,0)';
    this.joyEl.style.left = `calc(110px + env(safe-area-inset-left, 0px))`;
    this.joyEl.style.top = `calc(100% - 120px)`;
  }

  private onKey(e: KeyboardEvent, down: boolean) {
    const k = e.code;
    if (down && !this.keys.has(k)) {
      const map: Record<string, Action> = {
        KeyE: 'interact', Enter: 'interact', KeyF: 'vehicle', Tab: 'notebook', KeyN: 'notebook', KeyJ: 'notebook',
        Escape: 'menu', KeyH: 'siren', Backquote: 'diag', F3: 'diag',
      };
      const a = map[k];
      if (a) { this.edge.add(a); if (k === 'Tab' || k === 'F3') e.preventDefault(); }
    }
    if (down) this.keys.add(k); else this.keys.delete(k);
    if (k.startsWith('Arrow') || k === 'Space') e.preventDefault();
  }

  /** Trigger an action from UI (touch buttons). */
  press(a: Action) { this.edge.add(a); }

  pressed(a: Action): boolean {
    if (this.edge.has(a)) { this.edge.delete(a); return true; }
    return false;
  }

  /** Called once per frame before gameplay reads input. */
  poll() {
    let x = 0, y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    const kl = Math.hypot(x, y);
    if (kl > 0) { x /= kl; y /= kl; }
    // Joystick has priority if active
    if (this.joyId !== null) {
      let jx = this.joyVec.x, jy = this.joyVec.y;
      const m = Math.hypot(jx, jy);
      const dead = 0.12;
      if (m < dead) { jx = 0; jy = 0; }
      else { const s = Math.min(1, (m - dead) / (1 - dead)) / m; jx *= s; jy *= s; }
      x = jx; y = jy;
      this.sprint = Math.hypot(jx, jy) > 0.92;
    } else {
      this.sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    }
    this.brake = this.keys.has('Space') || this.brakeHeld;
    if (!this.enabled) { x = 0; y = 0; }
    this.move.x = x; this.move.y = y;
  }

  brakeHeld = false;

  consumeLook() {
    const l = { x: this.look.x, y: this.look.y };
    this.look.x = 0; this.look.y = 0;
    return this.enabled ? l : { x: 0, y: 0 };
  }

  clearEdges() { this.edge.clear(); }
}
