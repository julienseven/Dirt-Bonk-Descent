// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: fully procedural audio (no assets)
//
// Continuous beds (roll, wind, forest, water, rumble) + a step sequencer
// for the punk-surf bed. Mountain theme retargets filters, bed gains, bird
// rates, BPM and finale lift so each course sounds like its world.
// ---------------------------------------------------------------------------
import { clamp, clamp01, lerp } from './core';
import type { TrackTheme } from './trackDef';

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
  private brake!: Loop;     // pad-on-rotor hiss
  private forest!: Loop;    // leaf rustle bed
  private water!: Loop;     // running water near the mud pit
  private rumble!: Loop;    // low mountain body (volcano / high wind / canyon)
  private chainOsc: OscillatorNode | null = null;
  private chainGain: GainNode | null = null;
  private chainFilter: BiquadFilterNode | null = null;
  /** cumulative crank angle, so chain clicks land on real link passes */
  private chainPhase = 0;
  private lastLink = 0;
  private birdTimer = 0;
  private creakTimer = 0;
  private ready = false;
  private musicTimer = 0;
  private step = 0;
  private bpm = 158;
  private baseBpm = 158;
  private musicOn = true;
  private sfxOn = true;
  private intensity = 0;    // 0..1 drives music layers
  private homeStretch = 0;  // 0..1 approach to the finish
  /** Active mountain world identity. */
  private theme: TrackTheme = 'alpine';
  /** Theme multipliers applied every update. */
  private themeProf = themeProfile('alpine');

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
    // brakes: narrow high-Q band, so it reads as pad-on-rotor, not noise
    this.brake = this.makeLoop('bandpass', 3100, 0, 9);
    // forest: soft broadband rustle
    this.forest = this.makeLoop('bandpass', 2400, 0, 0.7);
    // water: lower, wetter band
    this.water = this.makeLoop('bandpass', 900, 0, 0.9);
    // mountain body: volcanic ash / thin high wind / canyon heat
    this.rumble = this.makeLoop('lowpass', 90, 0, 0.55);
    this.rival = this.makeLoop('bandpass', 300, 0, 1.3);
    if (ctx.createStereoPanner) {
      this.rivalPan = ctx.createStereoPanner();
      this.rival.gain.disconnect();
      this.rival.gain.connect(this.rivalPan);
      this.rivalPan.connect(this.sfxBus);
    }
    // drivetrain: a faint sawtooth whose pitch tracks cadence, sitting under
    // the discrete link clicks. On its own it reads as "geared machine".
    const co = ctx.createOscillator();
    co.type = 'sawtooth';
    co.frequency.value = 60;
    const cf = ctx.createBiquadFilter();
    cf.type = 'bandpass'; cf.frequency.value = 1500; cf.Q.value = 3.5;
    const cg = ctx.createGain(); cg.gain.value = 0;
    co.connect(cf); cf.connect(cg); cg.connect(this.sfxBus);
    co.start(0);
    this.chainOsc = co; this.chainGain = cg; this.chainFilter = cf;

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

  /**
   * Retarget continuous beds + music character for a mountain.
   * Call when loadMountain() swaps the world.
   */
  setTheme(theme: TrackTheme) {
    this.theme = theme;
    this.themeProf = themeProfile(theme);
    this.baseBpm = this.themeProf.bpm;
    this.bpm = this.baseBpm;
    if (!this.ready) return;
    // retarget static filter centres so the first frame after a swap is correct
    this.forest.filter.frequency.value = this.themeProf.forestHz;
    this.wind.filter.frequency.value = this.themeProf.windHz;
    this.rumble.filter.frequency.value = this.themeProf.rumbleHz;
    this.water.filter.frequency.value = this.themeProf.waterHz;
  }

  get currentTheme() { return this.theme; }

  /** Continuous state update from the sim. */
  update(dt: number, o: {
    speed01: number; grounded: boolean; offTrack: boolean; airborne: boolean;
    braking: boolean; crowdNear: number; intensity: number; paused: boolean;
    rivalNear?: number; rivalPan?: number; rivalSpeed?: number;
    /** 0..1 exposed-summit gale, used by the cold open */
    gale?: number;
    // ---- bike
    /** crank revolutions per second; drives chain clicks + drivetrain hum */
    cadence?: number;
    /** 0..1 how hard the brakes are on */
    braking01?: number;
    /** 0..1 suspension compression rate, for damper creak */
    suspRate?: number;
    // ---- environment
    /** 0..1 density of trees around the player */
    forest?: number;
    /** 0..1 nearby running water */
    water?: number;
    /** 0..1 how much of the mountain is quiet enough for birdsong */
    calm?: number;
    /** 0..1 approach to the finish line, lifts the music */
    homeStretch?: number;
  }) {
    if (!this.ready || !this.ctx) return;
    const t = this.ctx.currentTime;
    const sp = clamp01(o.speed01);
    const P = this.themeProf;

    const rollTarget = o.paused ? 0 : (o.grounded ? lerp(0.02, o.offTrack ? 0.4 : 0.24, sp) : 0.0);
    this.roll.gain.gain.setTargetAtTime(rollTarget * P.rollMul, t, 0.06);
    this.roll.filter.frequency.setTargetAtTime(
      lerp(150, o.offTrack ? 520 : 900, sp) * P.rollTone, t, 0.1);
    this.roll.filter.Q.value = o.offTrack ? 0.6 : 1.6;

    const gale = clamp01(o.gale ?? 0);
    const windTarget = o.paused
      ? 0
      : (lerp(0.0, 0.30, Math.pow(sp, 1.7)) + (o.airborne ? 0.06 : 0) + gale * 0.26)
        * P.windMul + P.windBed;
    this.wind.gain.gain.setTargetAtTime(windTarget, t, gale > 0 ? 0.5 : 0.12);
    // a summit gale is broader and lower than the rush of speed
    this.wind.filter.frequency.setTargetAtTime(
      lerp(lerp(P.windHz * 0.5, P.windHz * 3.5, sp), P.windHz * 0.75, gale), t, 0.3);

    this.crowd.gain.gain.setTargetAtTime(
      o.paused ? 0 : clamp01(o.crowdNear) * 0.16 * P.crowdMul, t, 0.35);

    // a rival alongside you should be audible before you see them
    const rn = clamp01(o.rivalNear ?? 0);
    this.rival.gain.gain.setTargetAtTime(o.paused ? 0 : rn * 0.17, t, 0.12);
    this.rival.filter.frequency.setTargetAtTime(
      lerp(190, 780, clamp01(o.rivalSpeed ?? 0)), t, 0.15);
    if (this.rivalPan) {
      this.rivalPan.pan.setTargetAtTime(clamp(o.rivalPan ?? 0, -1, 1), t, 0.1);
    }

    // ---- BRAKES: pad hiss that rises in pitch as you slow
    const br = o.paused ? 0 : clamp01(o.braking01 ?? 0) * (o.grounded ? 1 : 0);
    this.brake.gain.gain.setTargetAtTime(br * 0.15 * (0.3 + sp), t, 0.05);
    this.brake.filter.frequency.setTargetAtTime(lerp(4200, 2400, sp), t, 0.08);

    // ---- CHAIN: discrete link clicks tied to real crank rotation, so the
    // drivetrain sounds mechanical rather than like a looped sample.
    const cad = o.paused ? 0 : (o.cadence ?? 0);
    if (this.chainGain && this.chainOsc && this.chainFilter) {
      this.chainGain.gain.setTargetAtTime(cad > 0.05 ? 0.020 : 0, t, 0.09);
      this.chainOsc.frequency.setTargetAtTime(40 + cad * 26, t, 0.08);
      this.chainFilter.frequency.setTargetAtTime(1100 + cad * 260, t, 0.1);
    }
    this.chainPhase += cad * dt;
    // ~7 audible link passes per crank revolution
    const link = Math.floor(this.chainPhase * 7);
    if (link !== this.lastLink && cad > 0.4 && this.sfxOn) {
      this.lastLink = link;
      this.tick(1900 + Math.random() * 900, 0.014 + cad * 0.006);
    }

    // ---- SUSPENSION: damper creak when travel changes fast
    this.creakTimer -= dt;
    const sr = clamp01(o.suspRate ?? 0);
    if (sr > 0.45 && this.creakTimer <= 0 && !o.paused) {
      this.creakTimer = 0.16 + Math.random() * 0.2;
      this.creak(sr);
    }

    // ---- FOREST / WATER / RUMBLE beds (theme-weighted)
    const forestIn = clamp01(o.forest ?? 0) * P.forestMul;
    this.forest.gain.gain.setTargetAtTime(
      o.paused ? 0 : forestIn * 0.085, t, 0.6);
    this.forest.filter.frequency.setTargetAtTime(P.forestHz, t, 0.8);

    const waterIn = clamp01(o.water ?? 0) * P.waterMul;
    this.water.gain.gain.setTargetAtTime(
      o.paused ? 0 : waterIn * 0.11, t, 0.5);
    this.water.filter.frequency.setTargetAtTime(P.waterHz, t, 0.6);

    // volcanic ash / limestone body / canyon heat — always-on mountain voice
    const rumbleTarget = o.paused ? 0
      : (P.rumbleBed + sp * P.rumbleSpeed + gale * 0.08);
    this.rumble.gain.gain.setTargetAtTime(rumbleTarget, t, 0.7);
    this.rumble.filter.frequency.setTargetAtTime(P.rumbleHz, t, 0.5);

    // ---- BIRDS: only where it's quiet and you're not flat out
    this.birdTimer -= dt;
    const calm = clamp01(o.calm ?? 0) * (1 - sp * 0.7) * P.birdMul;
    if (!o.paused && calm > 0.25 && this.birdTimer <= 0 && P.birdMul > 0.05) {
      this.birdTimer = (1.6 + Math.random() * 5.5) / Math.max(0.3, P.birdMul);
      this.birdCall(calm);
    }

    // Music tracks the run: speed and style raise it, but the approach to
    // the line dominates, so the last stretch always feels like a finale.
    // Lastlight / ironjaw push the finale harder.
    const home = clamp01(o.homeStretch ?? 0) * P.finaleMul;
    this.intensity = clamp01(o.intensity * (1 - home * 0.45) + home);
    this.homeStretch = home;
    this.bpm = this.baseBpm + this.intensity * P.bpmLift;
    if (this.musicOn && !o.paused) this.tickMusic(dt);
  }

  // -- music sequencer ------------------------------------------------------
  private tickMusic(dt: number) {
    const spb = 60 / (this.bpm + this.intensity * 12);
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

    // ---- FINALE LAYERS: only on the run to the line.
    const H = this.homeStretch;
    if (H > 0.15) {
      // driving eighth-note ride
      if (s % 2 === 0) this.hat(t, 0.05 * H);
      // tom fill rolling into each bar
      if (s % 16 === 14 || s % 16 === 15) {
        this.tom(t, 150 - (s % 16 - 14) * 30, 0.20 * H);
      }
      // octave-up lead doubling, so the melody lifts
      if (H > 0.45 && s % 4 === 0) {
        const OCT = [24, 27, 31, 27];
        this.stab(t, 110 * Math.pow(2, OCT[(s / 4) % 4] / 12), 0.05 * H);
      }
      // four-on-the-floor kick under the last stretch
      if (H > 0.6 && s % 2 === 0 && s % 4 !== 0) this.kick(t, 0.35 * H);
      // Lastlight / epic themes: extra octave sparkle near the line
      if (H > 0.7 && this.themeProf.finaleMul > 1.15 && s % 8 === 4) {
        this.stab(t, 220 * Math.pow(2, 12 / 12), 0.04 * H);
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
  private tom(t: number, freq: number, v: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.55, t + 0.16);
    const g = ctx.createGain();
    this.env(g, t, v, 0.003, 0.16);
    o.connect(g); g.connect(this.musicBus);
    o.start(t); o.stop(t + 0.22);
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

  /** Single chain-link click. Tiny, dry, and cheap enough to fire often. */
  private tick(freq: number, vol: number) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
    const f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 1200;
    o.connect(f); f.connect(g); g.connect(this.sfxBus);
    o.start(t); o.stop(t + 0.03);
  }

  /** Damper creak — a short pitch-bent groan under load. */
  private creak(power: number) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const base = 120 + Math.random() * 70;
    o.frequency.setValueAtTime(base, t);
    o.frequency.exponentialRampToValueAtTime(base * 0.62, t + 0.16);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 620; f.Q.value = 7;
    const g = ctx.createGain();
    this.env(g, t, 0.032 * power, 0.02, 0.15);
    o.connect(f); f.connect(g); g.connect(this.sfxBus);
    o.start(t); o.stop(t + 0.22);
  }

  /** Two- or three-note bird call, pitched high and panned wide. */
  private birdCall(vol: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const pan = Math.random() * 1.6 - 0.8;
    const notes = 2 + Math.floor(Math.random() * 2);
    const root = 2100 + Math.random() * 1400;
    for (let i = 0; i < notes; i++) {
      const at = ctx.currentTime + i * (0.09 + Math.random() * 0.05);
      const o = ctx.createOscillator();
      o.type = 'sine';
      const f0 = root * (1 + i * 0.14);
      o.frequency.setValueAtTime(f0, at);
      o.frequency.exponentialRampToValueAtTime(f0 * 1.35, at + 0.05);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(0.05 * vol, at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
      let last: AudioNode = g;
      if (ctx.createStereoPanner) {
        const p = ctx.createStereoPanner(); p.pan.value = pan;
        g.connect(p); last = p;
      }
      o.connect(g); last.connect(this.sfxBus);
      o.start(at); o.stop(at + 0.12);
    }
  }

  bonk(power = 1, pan = 0) {
    // meaty cartoon impact: low thump + wood crack + tail
    this.tone({ freq: 220 * (1 + power * 0.2), freq2: 48, dur: 0.20, peak: 0.55 * power, type: 'sine', pan });
    this.burst({ dur: 0.13, peak: 0.45 * power, f0: 1800, f1: 260, q: 0.8, rate: 1.1, pan });
    this.tone({ freq: 880, freq2: 300, dur: 0.07, peak: 0.18 * power, type: 'square', pan });
  }

  /**
   * MEGA BONK. Deliberately over the top: a sub-bass drop, a metallic clang
   * with a long ring, a comedic descending whistle, and a delayed debris
   * scatter. Four layered events so it lands as an *event*, not a louder hit.
   */
  megaBonk(power = 1, pan = 0) {
    if (!this.ready || !this.ctx || !this.sfxOn) return;
    // 1. sub-bass drop you feel more than hear
    this.tone({ freq: 150, freq2: 26, dur: 0.55, peak: 0.72 * power, type: 'sine', pan });
    // 2. the crack
    this.burst({ dur: 0.20, peak: 0.60 * power, f0: 2600, f1: 180, q: 0.6, rate: 1.2, pan });
    // 3. metallic clang with a long tail — two detuned partials ringing
    const ctx = this.ctx, t = ctx.currentTime;
    [523, 787, 1174].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(f * (1 + power * 0.05), t);
      o.frequency.exponentialRampToValueAtTime(f * 0.88, t + 0.7);
      const g = ctx.createGain();
      this.env(g, t, (0.13 / (i + 1)) * power, 0.002, 0.75);
      let last: AudioNode = g;
      if (ctx.createStereoPanner) {
        const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
        g.connect(p); last = p;
      }
      o.connect(g); last.connect(this.sfxBus);
      o.start(t); o.stop(t + 0.85);
    });
    // 4. cartoon descending whistle, slightly late so it reads as aftermath
    this.tone({ freq: 1500, freq2: 240, dur: 0.42, peak: 0.11 * power, type: 'sine', pan: -pan });
    // 5. debris scatter
    for (let i = 0; i < 5; i++) {
      setTimeout(() => this.burst({
        dur: 0.09, peak: 0.10 * power, f0: 3000 - i * 380, f1: 900,
        q: 4, rate: 1.5, pan: pan + (Math.random() - 0.5),
      }), 90 + i * 70);
    }
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

  /** Full pack leaves the gate — low thump + air rush (not a generic whoosh). */
  gateDrop(v = 1) {
    this.burst({
      dur: 0.42, peak: 0.30 * v, f0: 160, f1: 55, q: 0.75, type: 'lowpass', rate: 0.65,
    });
    this.burst({
      dur: 0.32, peak: 0.17 * v, f0: 2100, f1: 380, q: 1.05, rate: 1.35,
    });
    this.tone({ freq: 68, freq2: 36, dur: 0.38, peak: 0.24 * v, type: 'sine' });
  }

  /** Shoulder-check jersey scrape at the start line. */
  packBump(v = 1) {
    this.burst({
      dur: 0.11, peak: 0.15 * v, f0: 950, f1: 220, q: 1.3, rate: 1.15,
    });
    this.tone({ freq: 190, freq2: 95, dur: 0.07, peak: 0.09 * v, type: 'triangle' });
    this.scrape(0.45 * v);
  }

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

/** Continuous-bed + music character per mountain theme. */
interface ThemeAudioProfile {
  forestMul: number; forestHz: number;
  waterMul: number; waterHz: number;
  windMul: number; windBed: number; windHz: number;
  rumbleBed: number; rumbleSpeed: number; rumbleHz: number;
  birdMul: number;
  rollMul: number; rollTone: number;
  crowdMul: number;
  bpm: number; bpmLift: number; finaleMul: number;
}

function themeProfile(theme: TrackTheme): ThemeAudioProfile {
  switch (theme) {
    case 'volcanic':
      // ash, low rumble, no birds, dry grit under the tyres
      return {
        forestMul: 0, forestHz: 1800,
        waterMul: 0.35, waterHz: 700,
        windMul: 0.85, windBed: 0.04, windHz: 480,
        rumbleBed: 0.07, rumbleSpeed: 0.05, rumbleHz: 70,
        birdMul: 0,
        rollMul: 1.15, rollTone: 0.85,
        crowdMul: 0.4,
        bpm: 168, bpmLift: 22, finaleMul: 1.1,
      };
    case 'forest':
      // wet canopy, close wind, lots of birds in calm stretches
      return {
        forestMul: 1.45, forestHz: 2100,
        waterMul: 1.25, waterHz: 850,
        windMul: 0.7, windBed: 0.02, windHz: 900,
        rumbleBed: 0.01, rumbleSpeed: 0.01, rumbleHz: 110,
        birdMul: 1.6,
        rollMul: 0.95, rollTone: 0.9,
        crowdMul: 0.7,
        bpm: 148, bpmLift: 14, finaleMul: 1.0,
      };
    case 'limestone':
      // thin high air, sparse birds, long wind
      return {
        forestMul: 0.45, forestHz: 2600,
        waterMul: 0.4, waterHz: 950,
        windMul: 1.35, windBed: 0.06, windHz: 1400,
        rumbleBed: 0.03, rumbleSpeed: 0.02, rumbleHz: 95,
        birdMul: 0.35,
        rollMul: 1.05, rollTone: 1.1,
        crowdMul: 0.85,
        bpm: 152, bpmLift: 18, finaleMul: 1.2,
      };
    case 'sunset':
      // warmer bed, bigger finale — trailer mountain
      return {
        forestMul: 0.55, forestHz: 2300,
        waterMul: 0.5, waterHz: 900,
        windMul: 1.1, windBed: 0.03, windHz: 1100,
        rumbleBed: 0.02, rumbleSpeed: 0.015, rumbleHz: 100,
        birdMul: 0.7,
        rollMul: 1.0, rollTone: 1.0,
        crowdMul: 1.1,
        bpm: 156, bpmLift: 24, finaleMul: 1.45,
      };
    case 'canyon':
      // dry heat, light wind, grit
      return {
        forestMul: 0.15, forestHz: 2000,
        waterMul: 0.15, waterHz: 750,
        windMul: 0.9, windBed: 0.03, windHz: 700,
        rumbleBed: 0.04, rumbleSpeed: 0.03, rumbleHz: 85,
        birdMul: 0.2,
        rollMul: 1.1, rollTone: 0.95,
        crowdMul: 0.9,
        bpm: 162, bpmLift: 18, finaleMul: 1.05,
      };
    default: // alpine — classic Shaleback
      return {
        forestMul: 1.0, forestHz: 2400,
        waterMul: 1.0, waterHz: 900,
        windMul: 1.0, windBed: 0.0, windHz: 700,
        rumbleBed: 0.0, rumbleSpeed: 0.0, rumbleHz: 90,
        birdMul: 1.0,
        rollMul: 1.0, rollTone: 1.0,
        crowdMul: 1.0,
        bpm: 158, bpmLift: 18, finaleMul: 1.0,
      };
  }
}

export const audio = new GameAudio();
