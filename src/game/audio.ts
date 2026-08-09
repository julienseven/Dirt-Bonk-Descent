// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: fully procedural audio (no assets)
// ---------------------------------------------------------------------------
import { clamp, clamp01, lerp } from './core';

function makeNoiseBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.03 * w) / 1.03; // slight brown tint for body
    d[i] = w * 0.7 + last * 2.2;
  }
  return buf;
}

type Loop = { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode };

export class GameAudio {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfxBus!: GainNode;
  musicBus!: GainNode;
  comp!: DynamicsCompressorNode;
  noiseBuf!: AudioBuffer;

  private roll!: Loop;      // dirt / tire rumble
  private wind!: Loop;      // air rush
  private crowd!: Loop;     // ambient crowd bed
  private rival!: Loop;     // nearest rival's tyres
  private rivalPan: StereoPannerNode | null = null;
  private ready = false;
  private musicTimer = 0;
  private step = 0;
  private bpm = 158;
  private musicOn = true;
  private sfxOn = true;
  private intensity = 0;    // 0..1 drives music layers

  init() {
    if (this.ctx) return;
    const Ctor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;

    // Glue bus: fast enough to catch a bonk transient, but with a slow
    // release so stacked hits don't pump the whole mix.
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.knee.value = 26;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.002;
    this.comp.release.value = 0.34;

    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 1;
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.5;

    this.sfxBus.connect(this.comp);
    this.musicBus.connect(this.comp);
    this.comp.connect(this.master);
    this.master.connect(ctx.destination);

    this.noiseBuf = makeNoiseBuffer(ctx, 3);

    this.roll = this.makeLoop('bandpass', 320, 0, 1.1);
    this.wind = this.makeLoop('lowpass', 700, 0, 0.7);
    this.crowd = this.makeLoop('bandpass', 900, 0, 3.4);
    // nearest-rival tyre roll, panned to their side of you
    this.rival = this.makeLoop('bandpass', 300, 0, 1.3);
    if (ctx.createStereoPanner) {
      this.rivalPan = ctx.createStereoPanner();
      this.rival.gain.disconnect();
      this.rival.gain.connect(this.rivalPan);
      this.rivalPan.connect(this.sfxBus);
    }
    this.ready = true;
  }

  resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  private makeLoop(type: BiquadFilterType, freq: number, gain: number, q: number): Loop {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter); filter.connect(g); g.connect(this.sfxBus);
    src.start(0);
    return { src, gain: g, filter };
  }

  /**
   * Duck the music bus so an impact reads clearly, then swell back.
   * `amount` 0..1 = how far down, `time` = seconds to recover.
   */
  duck(amount = 0.5, time = 0.45) {
    if (!this.ready || !this.ctx || !this.musicOn) return;
    const t = this.ctx.currentTime;
    const g = this.musicBus.gain;
    const full = 0.5;
    const floor = full * (1 - clamp01(amount));
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.min(g.value, full), t);
    g.linearRampToValueAtTime(floor, t + 0.02);
    g.setTargetAtTime(full, t + 0.02, time * 0.4);
  }

  setMusicEnabled(v: boolean) { this.musicOn = v; if (this.musicBus) this.musicBus.gain.value = v ? 0.5 : 0; }
  setSfxEnabled(v: boolean) { this.sfxOn = v; if (this.sfxBus) this.sfxBus.gain.value = v ? 1 : 0; }
  get musicEnabled() { return this.musicOn; }
  get sfxEnabled() { return this.sfxOn; }

  /** Continuous state update from the sim. */
  update(dt: number, o: {
    speed01: number; grounded: boolean; offTrack: boolean; airborne: boolean;
    braking: boolean; crowdNear: number; intensity: number; paused: boolean;
    rivalNear?: number; rivalPan?: number; rivalSpeed?: number;
  }) {
    if (!this.ready || !this.ctx) return;
    const t = this.ctx.currentTime;
    const sp = clamp01(o.speed01);

    const rollTarget = o.paused ? 0 : (o.grounded ? lerp(0.02, o.offTrack ? 0.4 : 0.24, sp) : 0.0);
    this.roll.gain.gain.setTargetAtTime(rollTarget, t, 0.06);
    this.roll.filter.frequency.setTargetAtTime(lerp(150, o.offTrack ? 520 : 900, sp), t, 0.1);
    this.roll.filter.Q.value = o.offTrack ? 0.6 : 1.6;

    const windTarget = o.paused ? 0 : lerp(0.0, 0.30, Math.pow(sp, 1.7)) + (o.airborne ? 0.06 : 0);
    this.wind.gain.gain.setTargetAtTime(windTarget, t, 0.12);
    this.wind.filter.frequency.setTargetAtTime(lerp(320, 2600, sp), t, 0.15);

    this.crowd.gain.gain.setTargetAtTime(o.paused ? 0 : clamp01(o.crowdNear) * 0.16, t, 0.35);

    // a rival alongside you should be audible before you see them
    const rn = clamp01(o.rivalNear ?? 0);
    this.rival.gain.gain.setTargetAtTime(o.paused ? 0 : rn * 0.17, t, 0.12);
    this.rival.filter.frequency.setTargetAtTime(
      lerp(190, 780, clamp01(o.rivalSpeed ?? 0)), t, 0.15);
    if (this.rivalPan) {
      this.rivalPan.pan.setTargetAtTime(clamp(o.rivalPan ?? 0, -1, 1), t, 0.1);
    }

    this.intensity = o.intensity;
    if (this.musicOn && !o.paused) this.tickMusic(dt);
  }

  // -- music sequencer ------------------------------------------------------
  private tickMusic(dt: number) {
    const spb = 60 / (this.bpm + this.intensity * 18);
    const stepDur = spb / 4;
    this.musicTimer += dt;
    let guard = 0;
    while (this.musicTimer >= stepDur && guard++ < 8) {
      this.musicTimer -= stepDur;
      this.playStep(this.step % 32);
      this.step++;
    }
  }

  private playStep(s: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const I = this.intensity;

    // kick
    if (s % 4 === 0 || s === 14 || s === 30) this.kick(t, 0.9);
    // snare
    if (s % 8 === 4) this.snare(t, 0.55 + I * 0.2);
    // hats
    if (s % 2 === 1) this.hat(t, 0.10 + I * 0.10);
    if (I > 0.45 && s % 2 === 0) this.hat(t, 0.045);

    // surfy bass line (minor pentatonic, driving)
    const BASS = [0, 0, 7, 0, 3, 0, 5, 7];
    if (s % 2 === 0) {
      const n = BASS[(s / 2) % 8];
      this.bass(t, 55 * Math.pow(2, n / 12), 0.20 + I * 0.10, s % 8 === 0 ? 0.24 : 0.14);
    }
    // lead stabs kick in with intensity
    if (I > 0.3) {
      const LEAD = [12, 15, 19, 15, 17, 15, 12, 10];
      if (s % 4 === 2) {
        const n = LEAD[Math.floor(s / 4) % 8];
        this.stab(t, 110 * Math.pow(2, n / 12), (0.055 + I * 0.075));
      }
    }
  }

  private env(g: GainNode, t: number, peak: number, a: number, d: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private kick(t: number, v: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
    this.env(g, t, v * 0.9, 0.004, 0.20);
    o.connect(g); g.connect(this.musicBus); o.start(t); o.stop(t + 0.30);
  }
  private snare(t: number, v: number) {
    const ctx = this.ctx!;
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf;
    n.playbackRate.value = 1.4;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1500;
    const g = ctx.createGain(); this.env(g, t, v * 0.5, 0.002, 0.13);
    n.connect(f); f.connect(g); g.connect(this.musicBus);
    n.start(t, Math.random() * 2); n.stop(t + 0.2);
    const o = ctx.createOscillator(); const g2 = ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(210, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.08);
    this.env(g2, t, v * 0.22, 0.002, 0.09);
    o.connect(g2); g2.connect(this.musicBus); o.start(t); o.stop(t + 0.14);
  }
  private hat(t: number, v: number) {
    const ctx = this.ctx!;
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf; n.playbackRate.value = 2.6;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6800;
    const g = ctx.createGain(); this.env(g, t, v, 0.001, 0.045);
    n.connect(f); f.connect(g); g.connect(this.musicBus);
    n.start(t, Math.random() * 2); n.stop(t + 0.08);
  }
  private bass(t: number, freq: number, v: number, dur: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(300 + this.intensity * 900, t);
    f.frequency.exponentialRampToValueAtTime(160, t + dur);
    f.Q.value = 6;
    const g = ctx.createGain(); this.env(g, t, v, 0.006, dur);
    o.connect(f); f.connect(g); g.connect(this.musicBus);
    o.start(t); o.stop(t + dur + 0.06);
  }
  private stab(t: number, freq: number, v: number) {
    const ctx = this.ctx!;
    [1, 1.4983, 2].forEach((m, i) => {
      const o = ctx.createOscillator(); o.type = i === 2 ? 'square' : 'sawtooth';
      o.frequency.value = freq * m;
      o.detune.value = (i - 1) * 8;
      const g = ctx.createGain(); this.env(g, t, v / (i + 1.2), 0.004, 0.16);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600;
      o.connect(f); f.connect(g); g.connect(this.musicBus);
      o.start(t); o.stop(t + 0.24);
    });
  }

  // -- one-shots ------------------------------------------------------------
  private burst(o: {
    dur: number; peak: number; attack?: number; type?: BiquadFilterType;
    f0: number; f1: number; q?: number; rate?: number; pan?: number;
  }) {
    if (!this.ready || !this.ctx || !this.sfxOn) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf;
    n.playbackRate.value = o.rate ?? 1;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.frequency.setValueAtTime(o.f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, o.f1), t + o.dur);
    f.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    this.env(g, t, o.peak, o.attack ?? 0.003, o.dur);
    let last: AudioNode = g;
    if (o.pan !== undefined && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = clamp(o.pan, -1, 1);
      g.connect(p); last = p;
    }
    n.connect(f); f.connect(g); last.connect(this.sfxBus);
    n.start(t, Math.random() * 2); n.stop(t + o.dur + 0.1);
  }

  private tone(o: {
    freq: number; freq2?: number; dur: number; peak: number;
    type?: OscillatorType; attack?: number; pan?: number;
  }) {
    if (!this.ready || !this.ctx || !this.sfxOn) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.freq2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.freq2), t + o.dur);
    const g = ctx.createGain();
    this.env(g, t, o.peak, o.attack ?? 0.004, o.dur);
    let last: AudioNode = g;
    if (o.pan !== undefined && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = clamp(o.pan, -1, 1);
      g.connect(p); last = p;
    }
    osc.connect(g); last.connect(this.sfxBus);
    osc.start(t); osc.stop(t + o.dur + 0.08);
  }

  bonk(power = 1, pan = 0) {
    // meaty cartoon impact: low thump + wood crack + tail
    this.tone({ freq: 220 * (1 + power * 0.2), freq2: 48, dur: 0.20, peak: 0.55 * power, type: 'sine', pan });
    this.burst({ dur: 0.13, peak: 0.45 * power, f0: 1800, f1: 260, q: 0.8, rate: 1.1, pan });
    this.tone({ freq: 880, freq2: 300, dur: 0.07, peak: 0.18 * power, type: 'square', pan });
  }
  hitTaken(power = 1) {
    this.tone({ freq: 150, freq2: 40, dur: 0.28, peak: 0.5 * power, type: 'triangle' });
    this.burst({ dur: 0.22, peak: 0.3 * power, f0: 700, f1: 120, q: 0.6 });
  }
  crash() {
    this.burst({ dur: 0.55, peak: 0.5, f0: 1400, f1: 90, q: 0.5, type: 'lowpass' });
    this.tone({ freq: 90, freq2: 34, dur: 0.5, peak: 0.42, type: 'sawtooth' });
    for (let i = 0; i < 4; i++) {
      setTimeout(() => this.burst({ dur: 0.1, peak: 0.16, f0: 2600 - i * 300, f1: 900, q: 3, rate: 1.4 }), 60 + i * 85);
    }
  }
  hop() { this.burst({ dur: 0.10, peak: 0.16, f0: 500, f1: 1500, q: 1.2, rate: 1.3 }); }
  land(power = 1) {
    this.burst({ dur: 0.18, peak: 0.20 + power * 0.28, f0: 420, f1: 90, q: 0.7, type: 'lowpass', rate: 0.8 });
    this.tone({ freq: 110, freq2: 46, dur: 0.16, peak: 0.16 * power, type: 'sine' });
  }
  boost() {
    this.burst({ dur: 0.5, peak: 0.30, f0: 200, f1: 3400, q: 1.4, rate: 1.2 });
    this.tone({ freq: 180, freq2: 700, dur: 0.35, peak: 0.14, type: 'sawtooth' });
  }
  whoosh(v = 1) { this.burst({ dur: 0.30, peak: 0.16 * v, f0: 2400, f1: 500, q: 1.1, rate: 1.5 }); }
  trick(step: number) {
    const scale = [0, 3, 5, 7, 10, 12, 15, 19, 24];
    const f = 523.25 * Math.pow(2, scale[Math.min(step, scale.length - 1)] / 12);
    this.tone({ freq: f, dur: 0.16, peak: 0.13, type: 'triangle' });
    this.tone({ freq: f * 2, dur: 0.10, peak: 0.05, type: 'sine' });
  }
  chime(n = 0) {
    const f = 660 * Math.pow(2, n / 12);
    this.tone({ freq: f, dur: 0.35, peak: 0.14, type: 'sine' });
    this.tone({ freq: f * 1.5, dur: 0.28, peak: 0.07, type: 'triangle' });
  }
  cheer(power = 1) {
    if (!this.ready || !this.ctx || !this.sfxOn) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1200; f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.22 * power, t + 0.12);
    g.gain.setTargetAtTime(0.0001, t + 0.4, 0.5);
    n.connect(f); f.connect(g); g.connect(this.sfxBus);
    n.start(t, Math.random() * 2); n.stop(t + 2.4);
  }
  countBeep(final = false) {
    this.tone({ freq: final ? 880 : 440, dur: final ? 0.5 : 0.16, peak: 0.24, type: 'square' });
    this.tone({ freq: final ? 1320 : 660, dur: final ? 0.4 : 0.12, peak: 0.10, type: 'sine' });
  }
  uiClick() { this.tone({ freq: 720, freq2: 980, dur: 0.06, peak: 0.10, type: 'square' }); }
  uiMove() { this.tone({ freq: 420, dur: 0.05, peak: 0.07, type: 'square' }); }
  scrape(v: number) { this.burst({ dur: 0.12, peak: 0.12 * v, f0: 3000, f1: 1200, q: 4, rate: 1.6 }); }
}

export const audio = new GameAudio();
