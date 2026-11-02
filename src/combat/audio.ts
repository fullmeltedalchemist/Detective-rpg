/**
 * Procedural sound effects via WebAudio (no sample files, no licensing issues).
 * Must be unlocked by a user gesture on iOS — call unlock() from the Start button.
 */
export class Sfx {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  volume = 0.8;

  unlock() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx!.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx!.destination);
    const len = this.ctx!.sampleRate * 1.5;
    this.noise = this.ctx!.createBuffer(1, len, this.ctx!.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // play a silent blip to fully unlock iOS
    const o = this.ctx!.createOscillator(); const g = this.ctx!.createGain(); g.gain.value = 0;
    o.connect(g); g.connect(this.master); o.start(); o.stop(this.ctx!.currentTime + 0.01);
  }

  /** Distance attenuation helper (0..1). */
  private att(dist: number) { return Math.max(0, Math.min(1, 1 / (1 + dist * 0.06))); }

  gunshot(kind: { boom: number; crack: number; tail: number }, dist = 0) {
    const c = this.ctx; if (!c || !this.master || !this.noise) return;
    const t = c.currentTime, a = this.att(dist);
    // crack: bright noise burst
    const n = c.createBufferSource(); n.buffer = this.noise;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900 + 1800 * kind.crack;
    const g = c.createGain();
    g.gain.setValueAtTime(0.9 * kind.crack * a, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.08 + 0.1 * kind.tail);
    n.connect(hp); hp.connect(g); g.connect(this.master);
    n.start(t, Math.random()); n.stop(t + 0.5);
    // boom: low thump
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    const og = c.createGain(); og.gain.setValueAtTime(0.9 * kind.boom * a, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.3);
    // tail: filtered reverb-ish noise
    const n2 = c.createBufferSource(); n2.buffer = this.noise;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const g2 = c.createGain(); g2.gain.setValueAtTime(0.25 * kind.tail * a, t + 0.02); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.5 + kind.tail);
    n2.connect(lp); lp.connect(g2); g2.connect(this.master); n2.start(t, Math.random()); n2.stop(t + 1.4);
  }

  click(freq = 1800, vol = 0.25) {
    const c = this.ctx; if (!c || !this.master) return;
    const t = c.currentTime;
    const o = c.createOscillator(); o.type = 'square'; o.frequency.value = freq;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.05);
  }

  reload() { this.click(1200, 0.2); setTimeout(() => this.click(800, 0.25), 450); setTimeout(() => this.click(1500, 0.3), 1100); }
  dryFire() { this.click(2400, 0.15); }
  /** Handcuffs ratcheting shut: two quick metallic clicks, one per wrist. */
  cuffs() { this.click(3200, 0.22); setTimeout(() => this.click(2600, 0.2), 70); setTimeout(() => this.click(3400, 0.24), 420); setTimeout(() => this.click(2700, 0.2), 490); }
  /** Pat-down: soft cloth rustle. */
  rustle() { this.whoosh(); setTimeout(() => this.whoosh(), 380); setTimeout(() => this.whoosh(), 820); }

  thud(vol = 0.6) {
    const c = this.ctx; if (!c || !this.master || !this.noise) return;
    const t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.12);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.2);
    const n = c.createBufferSource(); n.buffer = this.noise;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200;
    const g2 = c.createGain(); g2.gain.setValueAtTime(vol * 0.4, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    n.connect(lp); lp.connect(g2); g2.connect(this.master); n.start(t, Math.random()); n.stop(t + 0.1);
  }

  whoosh() {
    const c = this.ctx; if (!c || !this.master || !this.noise) return;
    const t = c.currentTime;
    const n = c.createBufferSource(); n.buffer = this.noise;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(400, t); bp.frequency.linearRampToValueAtTime(1400, t + 0.15);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.18, t + 0.06); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    n.connect(bp); bp.connect(g); g.connect(this.master); n.start(t, Math.random()); n.stop(t + 0.25);
  }

  impact(dist = 0) {
    const c = this.ctx; if (!c || !this.master || !this.noise) return;
    const t = c.currentTime, a = this.att(dist) * 0.5;
    const n = c.createBufferSource(); n.buffer = this.noise;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2500;
    const g = c.createGain(); g.gain.setValueAtTime(a, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    n.connect(bp); bp.connect(g); g.connect(this.master); n.start(t, Math.random()); n.stop(t + 0.08);
  }
}
