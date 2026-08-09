// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: main engine
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import {
  clamp, clamp01, damp, lerp, RNG, TAU, smoothstep, smootherstep, fbm1,
} from './core';
import { Track, Obstacle, ZONES } from './track';
import {
  createRider, RiderRig, RIDER_PALETTES,
  BB_POS, SHOCK_UPPER, SHOCK_LOWER, SHOCK_BASE_LEN, FORK_AXIS,
} from './models';
import {
  ParticlePool, makeSoftTexture, makeChunkTexture, makeSkyTexture, makeCloudTexture,
} from './fx';
import { audio } from './audio';
import {
  type Perf, type Loadout, computePerf, getBike, loadoutColors,
} from './garage';
import { getMountain } from './mountains';
import { SHALEBACK_SECTIONS, SHALEBACK_SETPIECES } from './shaleback';
import {
  PROPS, PROP_SCORE, PROP_BOOST, PROP_CALL, patchSurface,
  type PropDef, type PropKind,
} from './env';
import {
  CrashCause, CRASH_PROFILES, startRagdoll, stepRagdoll, crashCall,
  type Ragdoll,
} from './crash';
import {
  BonkType, resolveBonk, bonkFlavour, canBeBonked, riderMass,
  type BonkBody, type BonkResult,
} from './bonk';
import {
  BikeState, TransitionLog, STATE_RULES, STATE_TUNING,
  resolveState, pedalForce, roostFactor, isAirborne, canBonk,
  type StateSnapshot,
} from './bikeState';
import {
  type Difficulty, type Ghost, DIFF_TUNING, GHOST_DT, encodeGhost,
  SKILL_MIN, SKILL_MAX,
} from './save';

export const GRAV = 30;
export const SOFT_CAP = 47;
/** Axle offsets from the bike's origin, in metres along the track. */
export const AXLE_F = 0.60;
export const AXLE_R = -0.62;
export const WHEELBASE = AXLE_F - AXLE_R;
/** quadratic air drag; tucking multiplies this by TUCK_DRAG */
export const DRAG_K = 0.0040;
export const TUCK_DRAG = 0.58;

export type Phase = 'menu' | 'intro' | 'countdown' | 'race' | 'finish' | 'paused';

/**
 * Cold-open beat sheet. Times are cumulative seconds.
 * The whole thing runs ~8.5s and ends the instant the racers launch, so the
 * player is riding before they've finished reading anything.
 */
const INTRO = {
  /** low wide shot, rider silhouetted against the drop */
  wide: 0,
  /** camera swings around behind the rider, revealing the mountain */
  swing: 2.6,
  /** rival rolls up alongside */
  rival: 4.4,
  /** the look */
  glance: 5.6,
  /** rival stands up and goes */
  jump: 6.9,
  /** reaction window opens — ~1s to answer */
  react: 6.9,
  /** 3 - 2 - 1 */
  count: 7.9,
  /** SEND IT */
  send: 10.9,
  end: 11.6,
};

export interface Popup {
  el: HTMLDivElement;
  world: THREE.Vector3 | null;
  life: number; maxLife: number;
  vy: number;
  sx: number; sy: number;
}

export interface RivalHud { name: string; color: string; progress: number; place: number; }

export interface HudState {
  phase: Phase;
  countdown: number;
  countLabel: string;
  speed: number;
  place: number;
  total: number;
  progress: number;
  time: number;
  boost: number;
  style: number;
  combo: number;
  comboTime: number;
  score: number;
  bonks: number;
  tricks: number;
  topSpeed: number;
  airTime: number;
  bigAir: number;
  zone: string;
  zoneSub: string;
  zoneFlash: number;
  rivals: RivalHud[];
  crashed: number;
  boosting: boolean;
  drafting: boolean;
  offTrack: boolean;
  hitFlash: number;
  hazard: number;        // 0..1 urgency of an unavoidable solid ahead
  hazardSide: number;    // -1 screen-left, +1 screen-right, 0 dead ahead
  recover: number;       // 0..1 crash-recovery mash progress
  recoverPulse: number;  // flashes on each successful mash
  finalStretch: boolean; // in the run to the line
  photoFinish: boolean;  // decided by inches
  // --- cold open
  introT: number;
  introLine: string;     // big centre text
  introSub: string;      // small line under it
  introFade: number;     // 0..1 letterbox / fade-in
  reactWindow: number;   // 0..1 remaining reaction time
  holeshot: boolean;     // nailed the launch
  // --- state machine readout
  state: string;
  stateLabel: string;
  stateT: number;
  pumpArmed: number;   // 0..1 stored pump energy
  lastBonk: string;    // headline type of the most recent bonk
  lastBonkT: number;   // display timer
  crashCause: string;  // why the player is currently on the floor
  transitions: { from: string; to: string; t: number }[];
  splitDelta: number;    // seconds vs personal best at last zone
  splitShow: number;     // display timer
  splitHasPb: boolean;
  ghostActive: boolean;
  ghostGap: number;      // metres ahead (+) or behind (-) your best line
  reducedMotion: boolean;
  trickText: string;
  trickHold: number;
  finishData: null | {
    time: number; place: number; score: number; bonks: number; tricks: number;
    topSpeed: number; bestTrick: string; bestTrickScore: number; airTotal: number;
    gap: number; splits: number[]; shortcuts: number;
  };
}

interface Racer {
  isPlayer: boolean;
  name: string;
  colorHex: string;
  rig: RiderRig;
  s: number; x: number; y: number;
  v: number; vx: number; vy: number;
  grounded: boolean;
  airTime: number;
  lean: number; leanV: number;
  yaw: number;
  steerVis: number;
  wheelSpin: number;
  crash: number;
  crashSpin: number;
  suspension: number;
  suspV: number;
  bonkCd: number;
  bonkSwing: number;   // -1..1 animation
  bonkDir: number;
  stun: number;
  grace: number;       // post-crash invulnerability
  lastObs: number;     // debounce: obstacle already resolved
  obsCd: number;
  // --- physics state machine
  state: BikeState;
  prevState: BikeState;
  stateT: number;      // seconds in the current state
  landTimer: number;   // >0 for a beat after touchdown
  log: TransitionLog;
  crashMax: number;    // full duration of the current tumble
  recover: number;     // 0..1 mash progress toward getting up early
  ragdoll: Ragdoll | null;
  crankAngle: number;  // drivetrain phase (freewheels when not pedalling)
  pedalling: number;   // 0..1 smoothed, drives the leg cycle vs attack stance
  // --- two-wheel contact
  chassisPitch: number;  // radians, from the front/rear height difference
  pitchV: number;
  contactF: boolean;
  contactR: boolean;
  // --- pumping
  pump: number;          // -1 fully unweighted .. +1 fully compressed
  pumpArmed: number;     // stored energy released on extension
  // --- bonk
  mass: number;          // kg, rider + bike
  swingT: number;        // time since the last swing started (for DOUBLE)
  bonkCooldownPair: number;
  headYaw: number;     // look-into-the-corner
  weight: number;      // -1 hung off the back .. +1 forward over the bars
  // --- per-rider animation identity (seeded once, never changes)
  stCadence: number;   // spins fast vs mashes a big gear
  stLean: number;      // how far they throw the bike into a turn
  stWeight: number;    // baseline stance: forward attacker vs seated cruiser
  stHead: number;      // how much they look through corners
  stTwitch: number;    // idle restlessness
  place: number;
  finished: boolean;
  finishTime: number;
  // ai
  skill: number;
  aiOffset: number;
  aiSeed: number;
  aiHopCd: number;
  aiCap: number;
  corner: number;      // 0..1 how well they hold the apex
  aggression: number;
}

const RIVAL_NAMES = ['BRICK', 'VOLTA', 'MAGPIE', 'SPUD', 'NOODLE', 'TANKA', 'HUSK', 'PIP'];

export class Game {
  container: HTMLElement;
  renderer!: THREE.WebGLRenderer;
  scene!: THREE.Scene;
  camera!: THREE.PerspectiveCamera;
  clock = new THREE.Clock();
  track!: Track;
  player!: Racer;
  racers: Racer[] = [];
  hud: HudState;
  overlay!: HTMLDivElement;
  popups: Popup[] = [];
  rivalTags = new Map<Racer, HTMLDivElement>();
  keys: Record<string, boolean> = {};
  private pressed: Record<string, boolean> = {};
  running = false;
  raf = 0;
  time = 0;
  raceTime = 0;
  timeScale = 1;
  hitStop = 0;
  shake = 0;
  shakeDir = new THREE.Vector3();
  camPos = new THREE.Vector3();
  camLook = new THREE.Vector3();
  camRoll = 0;
  fov = 68;
  boost = 0;
  boosting = false;
  boostTime = 0;
  style = 0;
  combo = 0;
  comboTime = 0;
  score = 0;
  bonks = 0;
  tricksLanded = 0;
  topSpeed = 0;
  airTotal = 0;
  bestTrick = '';
  bestTrickScore = 0;
  finishGap = Infinity;
  drafting = false;
  difficulty: Difficulty = 'pro';
  /** cumulative race time on entering each zone, this run */
  splits: number[] = [];
  /** personal-best splits to race against (empty = no PB yet) */
  pbSplits: number[] = [];
  // ---- ghost
  ghostData: Ghost | null = null;
  showGhost = true;
  reducedMotion = false;
  private ghostRig: RiderRig | null = null;
  private ghostSamples: { s: number; x: number; y: number; lean: number }[] = [];
  private ghostAccum = 0;
  // ---- results-screen replay
  private replayData: Ghost | null = null;
  private replayT = 0;
  private replayShot = -1;
  private camSnap = false;
  // trick state
  airSpin = 0; airFlip = 0; airPose = 0; airPeak = 0; airStartY = 0;
  trickBuffer: string[] = [];
  trickStepAudio = 0;
  frozen = false;
  goFlash = 0;
  menuTime = 0;
  lastDt = 1 / 60;
  slowmo = 0;

  /** Ballistic estimate of how long until this racer touches down. */
  private timeToGround(r: Racer): number {
    if (r.grounded) return 0;
    const trk = this.track;
    // sample the ground where we'll actually be, not where we are
    let t = 0;
    let y = r.y, vy = r.vy;
    const stepT = 0.06;
    for (let i = 0; i < 34; i++) {
      const s = r.s + r.v * t;
      const x = r.x + r.vx * t;
      if (y <= trk.heightAt(s, x)) return t;
      vy -= GRAV * stepT;
      y += vy * stepT;
      t += stepT;
    }
    return t;
  }

  /** Ease a rotation toward the nearest whole revolution (landing assist). */
  private levelOut(angle: number, rate: number): number {
    const target = Math.round(angle / TAU) * TAU;
    const d = target - angle;
    return Math.abs(d) <= rate ? target : angle + Math.sign(d) * rate;
  }
  private dirtPool!: ParticlePool;
  private sparkPool!: ParticlePool;
  private smokePool!: ParticlePool;
  private sky!: THREE.Mesh;
  private ridge!: THREE.Mesh;
  private clouds!: THREE.Group;
  private sun!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private fog!: THREE.FogExp2;
  private rng = new RNG(4242);
  private lastZone = -1;
  private countTimer = 0;
  private countStep = -1;
  private finishHold = 0;
  private roostAccum = 0;
  private moteAccum = 0;
  private nearMissCd = 0;
  onPhaseChange?: (p: Phase) => void;
  quality: 'high' | 'low' = 'high';
  mobile = false;
  /** pause the render loop entirely while the garage owns the screen */
  suspended = false;
  mountainId = 'shalebeck';
  shortcutsHit = 0;
  /** ?states in the URL shows the live state machine readout */
  debugStates = typeof window !== 'undefined'
    && window.location.search.includes('states');
  // --- cold open state
  private introT = 0;
  private introFired = false;
  private introReacted = false;
  private introSent = false;
  private introCount = -1;
  private scActive: { sc: import('./track').Shortcut; entered: number } | null = null;
  /** garage loadout effects; identity by default */
  perf: Perf = {
    topCap: 0, accel: 1, grip: 1, airRate: 1, landTol: 0, bonk: 1,
  };
  /** analog steer from touch, screen space; null = use the keyboard */
  steerAxis: number | null = null;
  /** hold throttle automatically (touch default — one less thing to reach) */
  autoPedal = false;
  private resizeTimer = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    this.hud = {
      phase: 'menu', countdown: 0, countLabel: '', speed: 0, place: 1, total: 6,
      progress: 0, time: 0, boost: 0, style: 0, combo: 0, comboTime: 0, score: 0,
      bonks: 0, tricks: 0, topSpeed: 0, airTime: 0, bigAir: 0, zone: '', zoneSub: '',
      zoneFlash: 0, rivals: [], crashed: 0, boosting: false, drafting: false,
      offTrack: false, hitFlash: 0, hazard: 0, hazardSide: 0, recover: 0, recoverPulse: 0,
      finalStretch: false, photoFinish: false,
      introT: 0, introLine: '', introSub: '', introFade: 0,
      reactWindow: 0, holeshot: false,
      state: 'GROUNDED', stateLabel: 'ROLLING', stateT: 0, transitions: [],
      pumpArmed: 0, lastBonk: '', lastBonkT: 0, crashCause: '',
      splitDelta: 0, splitShow: 0, splitHasPb: false,
      ghostActive: false, ghostGap: 0, reducedMotion: false,
      trickText: '', trickHold: 0, finishData: null,
    };
    this.init();
  }

  // =========================================================================
  private init() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;

    // Phones report DPR 3 and choke on MSAA at that resolution. Coarse
    // pointer is a good proxy for "mobile GPU" and costs nothing to check.
    const coarse = typeof window.matchMedia === 'function'
      && window.matchMedia('(pointer: coarse)').matches;
    this.mobile = coarse;
    this.renderer = new THREE.WebGLRenderer({
      antialias: !coarse,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.5 : 2));
    this.renderer.setSize(w, h);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.domElement.style.display = 'block';
    this.container.appendChild(this.renderer.domElement);

    this.overlay = document.createElement('div');
    this.overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:5';
    this.container.appendChild(this.overlay);

    this.scene = new THREE.Scene();
    this.fog = new THREE.FogExp2(0xbcd4e6, 0.0022);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(this.fov, w / h, 0.4, 6000);
    this.scene.add(this.camera);

    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x6a5535, 1.15);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d0, 1.75);
    this.sun.position.set(-0.5, 1, 0.35);
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    const rim = new THREE.DirectionalLight(0x9ec8ff, 0.45);
    rim.position.set(0.6, 0.3, -1);
    this.scene.add(rim);

    // sky
    const skyGeo = new THREE.SphereGeometry(3200, 24, 16);
    const skyMat = new THREE.MeshBasicMaterial({ map: makeSkyTexture(), side: THREE.BackSide, fog: false, depthWrite: false });
    this.sky = new THREE.Mesh(skyGeo, skyMat);
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);

    this.clouds = new THREE.Group();
    const cloudTex = makeCloudTexture();
    const cloudMat = new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, opacity: 0.85 });
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), cloudMat);
      const a = this.rng.range(0, TAU);
      const r = this.rng.range(900, 2400);
      const sc = this.rng.range(320, 900);
      m.position.set(Math.cos(a) * r, this.rng.range(120, 520), Math.sin(a) * r);
      m.scale.set(sc, sc * this.rng.range(0.32, 0.55), 1);
      this.clouds.add(m);
    }
    this.clouds.renderOrder = -9;
    this.scene.add(this.clouds);

    // distant ridges
    this.ridge = this.buildRidges();
    this.scene.add(this.ridge);

    // track — the default mountain is the authored vertical slice
    this.track = new Track(20260114, 4600, SHALEBACK_SECTIONS, SHALEBACK_SETPIECES);
    this.scene.add(this.track.build());

    // particles
    const soft = makeSoftTexture();
    const chunk = makeChunkTexture();
    this.dirtPool = new ParticlePool(1400, chunk, THREE.NormalBlending);
    this.smokePool = new ParticlePool(700, soft, THREE.NormalBlending);
    this.sparkPool = new ParticlePool(500, soft, THREE.AdditiveBlending);
    this.scene.add(this.smokePool.points, this.dirtPool.points, this.sparkPool.points);

    // racers
    this.buildRacers();
    this.initRivalTags();
    this.resetRace();

    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  private buildRidges(): THREE.Mesh {
    const seg = 140;
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const R = 2600;
    const c = new THREE.Color();
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * TAU;
      const hgt = 180 + fbm1(i * 0.14, 4) * 240 + Math.max(0, fbm1(i * 0.045 + 20, 2)) * 420;
      const x = Math.cos(a) * R, z = Math.sin(a) * R;
      pos.push(x, -300, z);
      pos.push(x, -300 + hgt, z);
      c.setRGB(0.42, 0.52, 0.66).lerp(new THREE.Color(0.72, 0.80, 0.88), 0.25);
      col.push(0.36, 0.45, 0.58);
      col.push(c.r, c.g, c.b);
    }
    for (let i = 0; i < seg; i++) {
      const a = i * 2, b = a + 1, d = a + 2, e = a + 3;
      idx.push(a, d, b, b, d, e);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false, depthWrite: false }));
    m.renderOrder = -8;
    return m;
  }

  private mkRacer(isPlayer: boolean, i: number): Racer {
    const pal = RIDER_PALETTES[i % RIDER_PALETTES.length];
    const rig = createRider(pal);
    this.scene.add(rig.root);
    this.scene.add(rig.shadow, rig.contactF, rig.contactR);
    return {
      isPlayer, name: isPlayer ? 'YOU' : RIVAL_NAMES[(i - 1 + RIVAL_NAMES.length) % RIVAL_NAMES.length],
      colorHex: '#' + pal.jersey.toString(16).padStart(6, '0'),
      rig, s: 0, x: 0, y: 0, v: 0, vx: 0, vy: 0, grounded: true, airTime: 0,
      lean: 0, leanV: 0, yaw: 0, steerVis: 0, wheelSpin: 0, crash: 0, crashSpin: 0,
      suspension: 0, suspV: 0, bonkCd: 0, bonkSwing: 0, bonkDir: 1, stun: 0,
      grace: 0, lastObs: -1, obsCd: 0, crashMax: 1, recover: 0,
      state: BikeState.GROUNDED, prevState: BikeState.GROUNDED,
      stateT: 0, landTimer: 0, log: new TransitionLog(),
      crankAngle: 0, pedalling: 0, headYaw: 0, weight: 0,
      chassisPitch: 0, pitchV: 0, contactF: true, contactR: true,
      pump: 0, pumpArmed: 0,
      mass: 86, swingT: 99, bonkCooldownPair: 0, ragdoll: null,
      // the player rides "neutral"; rivals get personality below
      stCadence: 1, stLean: 1, stWeight: 0, stHead: 1, stTwitch: 1,
      place: i + 1, finished: false, finishTime: 0,
      skill: 0, aiOffset: 0, aiSeed: this.rng.range(0, 100), aiHopCd: 0, aiCap: 30,
      corner: 1, aggression: 0,
    };
  }

  private buildRacers() {
    this.player = this.mkRacer(true, 0);
    this.racers = [this.player];
    for (let i = 1; i <= 5; i++) {
      const r = this.mkRacer(false, i);
      this.racers.push(r);
    }
    this.applyDifficulty();
  }

  /**
   * Retune the field. Keeps a wide intra-pack spread at every level so there's
   * always a frontrunner to hunt and backmarkers to carve through.
   */
  applyDifficulty(d: Difficulty = this.difficulty) {
    this.difficulty = d;
    const T = DIFF_TUNING[d];
    let i = 0;
    for (const r of this.racers) {
      if (r.isPlayer) continue;
      i++;
      r.skill = T.skill + i * T.step + this.rng.range(-0.03, 0.03);
      r.corner = 0.62 + this.rng.range(0, 0.38);          // apex discipline
      r.aggression = clamp01(this.rng.range(0.3, 1.0) * T.aggro);
      // Animation identity is tied to how they ride: a disciplined cornerer
      // leans hard and looks through the turn; an aggressive one sits
      // forward and fidgets. Stable across restarts via the racer's seed.
      const sr = new RNG(Math.floor(r.aiSeed * 1000) + 17);
      r.stCadence = sr.range(0.82, 1.24);
      r.stLean = 0.78 + r.corner * sr.range(0.35, 0.62);
      r.stWeight = sr.range(-0.22, 0.20) + r.aggression * 0.18;
      r.stHead = 0.55 + r.corner * sr.range(0.5, 0.85);
      r.stTwitch = sr.range(0.6, 1.5);
    }
  }

  resetRace() {
    this.stopReplay();
    const grid = [0, -1, 1, -2, 2, -3];
    this.racers.forEach((r, i) => {
      r.s = 10 - Math.abs(grid[i]) * 3.4;
      r.x = grid[i] * 2.5;
      r.y = this.track.heightAt(r.s, r.x);
      r.v = 0; r.vx = 0; r.vy = 0; r.grounded = true; r.airTime = 0;
      r.lean = 0; r.leanV = 0; r.yaw = 0; r.crash = 0; r.stun = 0;
      r.grace = 0; r.lastObs = -1; r.obsCd = 0; r.recover = 0; r.crashMax = 1;
      r.ragdoll = null;
      r.rig.bike.position.set(0, 0, 0);
      r.rig.bike.rotation.set(0, 0, 0);
      r.state = BikeState.GROUNDED; r.prevState = BikeState.GROUNDED;
      r.stateT = 0; r.landTimer = 0; r.log.clear();
      r.chassisPitch = 0; r.pitchV = 0; r.contactF = true; r.contactR = true;
      r.pump = 0; r.pumpArmed = 0;
      r.swingT = 99; r.bonkCooldownPair = 0;
      r.finished = false; r.finishTime = 0; r.place = i + 1;
      r.aiOffset = this.rng.range(-0.3, 0.3);
    });
    this.track.obstacles.forEach(o => {
      o.hit = 0; o.ox = o.oy = o.os = 0; o.vx = o.vy = o.vs = 0;
      o.gone = false; o.roll = undefined;
    });
    this.track.resetSpectators();
    this.track.refreshProps();
    this.raceTime = 0; this.boost = 0; this.style = 0; this.combo = 0; this.comboTime = 0;
    this.score = 0; this.bonks = 0; this.tricksLanded = 0; this.topSpeed = 0;
    this.airTotal = 0; this.bestTrick = ''; this.bestTrickScore = 0;
    this.airSpin = this.airFlip = this.airPose = 0;
    this.shake = 0; this.hitStop = 0; this.timeScale = 1; this.slowmo = 0;
    this.dirtPool.clear(); this.sparkPool.clear(); this.smokePool.clear();
    this.clearPopups();
    this.hud.finishData = null;
    this.hud.crashed = 0;
    this.hud.finalStretch = false;
    this.hud.photoFinish = false;
    this.hud.splitShow = 0;
    this.hud.splitDelta = 0;
    // dense, not sparse: JSON.stringify turns array holes into `null`, which
    // then slips past `!== undefined` guards and yields garbage deltas
    this.shortcutsHit = 0;
    this.scActive = null;
    this.splits = new Array(this.track.zones.length).fill(0);
    this.ghostSamples = [];
    this.ghostAccum = 0;
    this.hud.ghostGap = 0;
    this.hud.ghostActive = false;
    this.lastZone = -1;
    this.updateCamera(0.016, true);
  }

  // =========================================================================
  setPhase(p: Phase) {
    this.hud.phase = p;
    this.onPhaseChange?.(p);
  }

  /** Full cold open. Used for a fresh drop-in. */
  startRace() {
    this.resetRace();
    this.introT = 0;
    this.introFired = false;
    this.introReacted = false;
    this.introSent = false;
    this.introCount = -1;
    this.frozen = true;
    this.hud.holeshot = false;
    this.setPhase('intro');
    audio.resume();
  }

  /** Skip the cinematic — used by RUN IT BACK, where you've already seen it. */
  quickRestart() {
    this.resetRace();
    this.setPhase('countdown');
    this.countTimer = 0;
    this.countStep = -1;
    audio.resume();
  }

  /** Let the player punch through the opening. */
  skipIntro() {
    if (this.hud.phase !== 'intro') return;
    this.introT = Math.max(this.introT, INTRO.count - 0.05);
  }

  togglePause() {
    if (this.hud.phase === 'race') this.setPhase('paused');
    else if (this.hud.phase === 'paused') this.setPhase('race');
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.frame();
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.ghostRig) {
      this.scene.remove(this.ghostRig.root, this.ghostRig.shadow);
      this.ghostRig = null;
    }
    this.rivalTags.forEach(el => el.remove());
    this.rivalTags.clear();
    this.clearPopups();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    if (this.overlay.parentElement) this.overlay.parentElement.removeChild(this.overlay);
  }

  private onResize = () => {
    const apply = () => {
      const w = this.container.clientWidth || window.innerWidth;
      const h = this.container.clientHeight || window.innerHeight;
      if (w < 2 || h < 2) return;
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    };
    apply();
    // iOS reports the old viewport during orientationchange; re-read once
    // the rotation has settled.
    clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(apply, 250);
  };

  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.code;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(k)) e.preventDefault();
    if (!this.keys[k]) this.pressed[k] = true;
    this.keys[k] = true;
    // during the cold open Escape means "skip", not "pause"
    if (k === 'Escape') {
      if (this.hud.phase === 'intro') this.skipIntro();
      else this.togglePause();
    }
  };
  private onKeyUp = (e: KeyboardEvent) => { this.keys[e.code] = false; };

  /** Losing focus with a key held would otherwise leave it stuck down. */
  private onBlur = () => { this.keys = {}; this.pressed = {}; };

  /** Backgrounded tabs shouldn't keep racing (and rAF stalls anyway). */
  private onVisibility = () => {
    if (document.hidden) {
      this.keys = {}; this.pressed = {};
      if (this.hud.phase === 'race') this.setPhase('paused');
    }
  };

  /**
   * Analog steer from a slide strip, in SCREEN space (-1 left .. +1 right).
   * Pass null to hand control back to the keyboard.
   */
  setSteerAxis(v: number | null) {
    this.steerAxis = v === null ? null : clamp(v, -1, 1);
  }

  /** Touch/on-screen controls feed the same input path as the keyboard. */
  setVirtualKey(code: string, down: boolean) {
    if (down) {
      if (!this.keys[code]) this.pressed[code] = true;
      this.keys[code] = true;
    } else {
      this.keys[code] = false;
    }
  }

  private key(...codes: string[]) { return codes.some(c => this.keys[c]); }
  private tap(...codes: string[]) {
    let hit = false;
    codes.forEach(c => { if (this.pressed[c]) { hit = true; } });
    return hit;
  }

  // =========================================================================
  private frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.lastDt = dt;
    // the garage owns the screen (and its own GL context) while open
    if (this.suspended) return;
    const phase = this.hud.phase;

    // time scaling
    if (this.hitStop > 0) { this.hitStop -= dt; this.timeScale = 0.14; }
    else if (this.slowmo > 0) { this.slowmo -= dt; this.timeScale = damp(this.timeScale, 0.55, 12, dt); }
    else this.timeScale = damp(this.timeScale, 1, 9, dt);

    const sdt = dt * this.timeScale;
    this.time += dt;

    if (phase === 'intro') {
      this.introT += dt;
      if (this.tap('Enter')) this.skipIntro();
      this.simulate(sdt, false);
      this.updateIntro(dt);
      this.updateWorldFx(dt);
      this.dirtPool.update(sdt);
      this.smokePool.update(sdt);
      this.sparkPool.update(sdt);
      this.updatePopups(dt);
      this.syncHud();
      this.renderer.render(this.scene, this.camera);
      this.pressed = {};
      return;
    }
    if (phase === 'countdown') {
      this.countTimer += dt;
      const step = Math.floor(this.countTimer);
      if (step !== this.countStep && step <= 3) {
        this.countStep = step;
        if (step < 3) audio.countBeep(false);
        else { audio.countBeep(true); audio.cheer(1); }
      }
      this.hud.countdown = 3 - Math.floor(this.countTimer);
      this.hud.countLabel = String(3 - Math.floor(this.countTimer));
      this.frozen = true;
      if (this.countTimer >= 3) {
        this.frozen = false;
        this.goFlash = 0.9;
        this.setPhase('race');
      }
      this.simulate(sdt, false);
    } else if (phase === 'race') {
      this.frozen = false;
      if (this.goFlash > 0) {
        this.goFlash -= dt;
        this.hud.countLabel = this.goFlash > 0 ? 'GO!' : '';
      }
      this.raceTime += sdt;
      this.simulate(sdt, true);
      if (!this.player.finished) this.recordGhost(sdt);
      if (this.player.finished) {
        this.finishHold += dt;
        if (this.finishHold > 2.2) this.enterFinish();
      }
    } else if (phase === 'finish') {
      if (this.replayData) this.updateReplay(dt);
      else this.simulate(sdt * 0.6, false);
    } else {
      this.simulate(0, false);
    }

    this.updateCamera(dt, false);
    this.updateWorldFx(dt);
    this.dirtPool.update(sdt);
    this.smokePool.update(sdt);
    this.sparkPool.update(sdt);
    this.updateGhost();
    this.updatePopups(dt);
    this.updateRivalTags();
    this.syncHud();
    this.renderer.render(this.scene, this.camera);
    this.pressed = {};
  }

  private enterFinish() {
    if (this.hud.finishData) return;
    const me = this.player;
    // resolve the margin now that the pack has had time to cross the line;
    // for anyone still out on course, project their arrival from position
    let gap = Infinity;
    for (const o of this.racers) {
      if (o === me) continue;
      const t = o.finished
        ? o.finishTime
        : this.raceTime + (this.track.length - 20 - o.s) / Math.max(6, o.v);
      gap = Math.min(gap, Math.abs(t - me.finishTime));
    }
    this.finishGap = gap;
    this.hud.finishData = {
      time: this.player.finishTime, place: this.player.place, score: Math.round(this.score),
      bonks: this.bonks, tricks: this.tricksLanded, topSpeed: this.topSpeed,
      bestTrick: this.bestTrick || '—', bestTrickScore: Math.round(this.bestTrickScore),
      airTotal: this.airTotal,
      gap: this.finishGap,
      splits: this.splits.slice(),
      shortcuts: this.shortcutsHit,
    };
    this.setPhase('finish');
    this.startReplay();
    audio.cheer(1.3);
    for (let i = 0; i < 6; i++) setTimeout(() => audio.chime(i * 2), i * 130);
  }

  // =========================================================================
  private simulate(dt: number, live: boolean) {
    if (dt <= 0) return;
    const trk = this.track;

    // ---- player input
    const p = this.player;
    const canControl = live && p.crash <= 0 && !p.finished;
    // input gating now reads the state machine rather than re-deriving it
    const airborne = isAirborne(p.state) && p.airTime > 0.06;
    let steer = 0, pedal = false, brake = false, tuck = false;
    if (canControl) {
      // NOTE: track-space +x points to SCREEN-LEFT (screen-right = forward x up = -x).
      // All physics below is derived in track-space, so map the keys once, here.
      if (this.steerAxis !== null) {
        steer = -this.steerAxis;                       // screen -> track space
      } else {
        if (this.key('KeyA', 'ArrowLeft')) steer += 1;   // A = screen left
        if (this.key('KeyD', 'ArrowRight')) steer -= 1;  // D = screen right
      }
      brake = this.key('KeyS', 'ArrowDown') && p.grounded;
      pedal = (this.key('KeyW', 'ArrowUp') || (this.autoPedal && !brake)) && p.grounded;
      tuck = this.key('ShiftLeft', 'ShiftRight') && !brake;
    }
    // boost (ground / just-left-the-lip only)
    const boostOk = p.grounded || p.airTime < 0.3;
    if (canControl && this.key('Space') && this.boost > 2 && boostOk) {
      if (!this.boosting) { audio.boost(); this.shakeAdd(0.5); }
      this.boosting = true;
    } else if (!this.key('Space') || this.boost <= 0 || !boostOk) this.boosting = false;
    if (this.boosting) {
      this.boost = Math.max(0, this.boost - 34 * dt);
      if (this.boost <= 0) this.boosting = false;
    }

    // bonk (ground only — in the air Q/E become whips)
    if (canControl && p.bonkCd <= 0 && canBonk(p.state)) {
      if (this.tap('KeyQ')) this.doBonk(1);        // Q = swing screen-left (+x)
      else if (this.tap('KeyE')) this.doBonk(-1);  // E = swing screen-right (-x)
    }

    // hop
    let hop = false;
    if (canControl && this.tap('KeyJ', 'ControlLeft') && p.grounded) hop = true;

    // ---- air tricks on dedicated keys so steering never spins you out
    if (canControl && airborne) {
      // +rotation.y swings the nose toward +x (screen-left), so Q = left whip
      const spinDir = (this.key('KeyQ') ? 1 : 0) + (this.key('KeyE') ? -1 : 0);
      const flipDir = (this.key('KeyJ', 'ControlLeft') ? -1 : 0) + (this.key('KeyK') ? 1 : 0);
      // Landing assist: the nearer the ground, the harder we snap toward a
      // whole revolution. Held input always wins, so you can still commit to
      // an over-rotation and deservedly eat it.
      const ttg = this.timeToGround(p);
      const assist = 1 + (1 - clamp01(ttg / 0.9)) * 7;
      const ar = this.perf.airRate;
      if (spinDir !== 0) this.airSpin += spinDir * 7.8 * ar * dt;
      else this.airSpin = this.levelOut(this.airSpin, 11 * assist * dt);
      if (flipDir !== 0) this.airFlip += flipDir * 6.4 * ar * dt;
      else this.airFlip = this.levelOut(this.airFlip, 9 * assist * dt);
      if (this.key('Space')) this.airPose += dt;
      const rot = Math.abs(this.airSpin) + Math.abs(this.airFlip);
      const step = Math.floor(rot / (TAU * 0.5));
      if (step > this.trickStepAudio) { audio.trick(step); this.trickStepAudio = step; }
    } else if (p.grounded) {
      this.trickStepAudio = 0;
    }

    this.stepRacer(p, dt, { steer, pedal, brake, tuck, hop, boost: this.boosting, live });

    // ---- rivals
    for (const r of this.racers) {
      if (r.isPlayer) continue;
      this.stepAI(r, dt, live);
    }

    // ---- interactions
    if (live) {
      this.collideRacers(dt);
      this.collideObstacles(p, dt);
      for (const r of this.racers) if (!r.isPlayer) this.collideObstacles(r, dt);
      this.checkNearMiss(dt);
      this.updateShortcuts();
      this.scanHazards();
      this.updateDraft(dt);
    }
    if (live) this.updateRockfall(dt);
    this.updateProps(dt);

    // ---- combo decay
    if (this.comboTime > 0) {
      this.comboTime -= dt;
      if (this.comboTime <= 0 && this.combo > 0) {
        if (this.combo >= 3) this.popup(`${this.combo}x CHAIN BANKED`, 'sub', null, '#ffd400');
        this.combo = 0;
      }
    }
    this.style = damp(this.style, 0, 0.35, dt);

    // ---- placings
    const order = [...this.racers].sort((a, b) => (b.finished ? 1e9 - b.finishTime : b.s) - (a.finished ? 1e9 - a.finishTime : a.s));
    order.forEach((r, i) => (r.place = i + 1));

    // ---- endgame drama
    if (live) this.updateEndgame(dt);

    // ---- zone announce
    const zi = trk.zoneIndexAt(clamp01(p.s / trk.length));
    if (zi !== this.lastZone && live) {
      const first = this.lastZone < 0;
      this.lastZone = zi;
      this.hud.zoneFlash = 1;
      if (zi > 0) audio.chime(4);
      // ---- split timing: stamp the clock entering each new zone
      if (!first && zi > 0) {
        this.splits[zi] = this.raceTime;
        const pb = this.pbSplits[zi];
        if (pb !== undefined && pb > 0) {
          const delta = this.raceTime - pb;
          this.hud.splitDelta = delta;
          this.hud.splitHasPb = true;
          this.hud.splitShow = 3;
          audio.chime(delta < 0 ? 7 : 0);
        } else {
          this.hud.splitHasPb = false;
          this.hud.splitShow = 0;
        }
      }
    }
    if (this.hud.splitShow > 0) this.hud.splitShow -= dt;
    this.hud.zoneFlash = Math.max(0, this.hud.zoneFlash - dt * 0.5);

    if (this.boost > 0 && !this.boosting) this.boost = Math.min(100, this.boost);
    this.topSpeed = Math.max(this.topSpeed, p.v * 3.6);
  }

  // -------------------------------------------------------------------------
  private stepRacer(r: Racer, dt: number, inp: {
    steer: number; pedal: boolean; brake: boolean; tuck: boolean; hop: boolean; boost: boolean; live: boolean;
  }) {
    const trk = this.track;

    // ===== STATE RESOLUTION ================================================
    // Runs before any early return, so CRASHING / FINISHED are genuinely
    // entered rather than being states the machine can never reach.
    if (r.landTimer > 0) r.landTimer -= dt;
    this.applyState(r, dt, inp);

    if (r.finished) {
      // roll out
      r.v = damp(r.v, 3, 0.8, dt);
      r.s += r.v * dt;
      r.y = trk.heightAt(r.s, r.x);
      this.poseRacer(r, dt, 0);
      return;
    }

    if (this.frozen) {
      // gate hold: riders sit on the line, twitching, ready to send it
      r.v = 0; r.vx = 0; r.vy = 0;
      r.y = trk.heightAt(r.s, r.x);
      r.grounded = true;
      r.suspension = Math.sin(this.time * 9 * r.stTwitch + r.aiSeed) * 0.02;
      this.poseRacer(r, dt,
        Math.sin(this.time * 2.2 * r.stTwitch + r.aiSeed) * 0.3 * r.stTwitch);
      return;
    }

    const surf = trk.surfaceAt(r.s, r.x);
    const pitch = trk.pitchAt(r.s);
    const curv = trk.curvatureAt(r.s);
    const bank = trk.bankAt(r.s);
    const hw = trk.halfWidth(r.s);

    // ---- crash
    if (r.crash > 0) {
      // Mashing during a tumble claws back up to ~55% of the downtime and
      // buys back exit speed, so a wreck is something you fight, not watch.
      if (r.isPlayer && inp.live) {
        if (this.tap('KeyW', 'ArrowUp', 'Space', 'KeyJ')) {
          r.recover = clamp01(r.recover + 0.16);
          audio.uiMove();
          this.hud.recoverPulse = 1;
        }
        r.crash -= dt * (1 + r.recover * 1.25);
      } else {
        r.crash -= dt;
      }
      // ---- RAGDOLL: cause-specific tumble
      const rd = r.ragdoll;
      const prof = rd ? CRASH_PROFILES[rd.cause] : null;
      // sliding friction — a yard sale keeps going, a dead stop doesn't
      const slideK = prof ? lerp(3.4, 0.7, clamp01(prof.slide / 2.6)) : 2.4;
      r.v = damp(r.v, prof && prof.slide > 1.5 ? 4 : 1.2, slideK, dt);
      r.crashSpin += dt * 9;
      r.s += r.v * dt;
      r.vx = damp(r.vx, 0, 3, dt);
      r.x += r.vx * dt;
      const gh = trk.heightAt(r.s, r.x);
      r.vy -= GRAV * dt; r.y += r.vy * dt;
      if (r.y < gh) {
        r.y = gh;
        // bounce, losing energy each time — riders skip before they settle
        const b = rd && rd.bounces < 2 ? 0.42 : 0.15;
        r.vy = Math.abs(r.vy) * b;
        if (rd && Math.abs(r.vy) > 2 && Math.abs(r.s - this.player.s) < 90) {
          this.spawnLandingBurst(r, 0.4);
          if (r.isPlayer) audio.land(0.5);
        }
      }
      if (rd) stepRagdoll(rd, dt, r.y, gh);
      if (r.crash <= 0) {
        // ---- REMOUNT
        r.crash = 0; r.crashSpin = 0; r.stun = 0.5;
        r.ragdoll = null;
        r.chassisPitch = 0; r.pitchV = 0;
        r.grace = 1.4;              // don't get re-hit while remounting
        r.x = clamp(r.x, -hw * 0.8, hw * 0.8);
        r.y = trk.heightAt(r.s, r.x);
        r.vy = 0;
        // nudge clear of whatever we just hit
        r.s += 2.5;
        // fighting out of it gets you rolling again with real momentum
        r.v = Math.max(r.v, 9 + r.recover * 9);
        if (r.isPlayer) {
          this.hud.crashed = 0;
          this.hud.crashCause = '';
          audio.hop();
          if (r.recover > 0.55) {
            this.popup('QUICK RECOVERY!', 'sub', null, '#7ef7c8');
            this.boost = Math.min(100, this.boost + 12);
            audio.chime(5);
          }
          r.recover = 0;
        }
      }
      if (r.isPlayer) this.hud.crashed = clamp01(r.crash);
      this.poseRacer(r, dt, 0);
      return;
    }
    if (r.stun > 0) r.stun -= dt;
    r.swingT += dt;
    if (r.bonkCooldownPair > 0) r.bonkCooldownPair -= dt;

    // physics reads the rules for whatever state was resolved above
    const RULES = STATE_RULES[r.state];

    // ---- longitudinal
    // garage upgrades only touch the player; rivals stay on the tuned baseline
    const P = r.isPlayer ? this.perf : IDENTITY_PERF;
    let a = GRAV * Math.sin(pitch);
    const speed01 = clamp01(r.v / 40);
    // throttle comes from the state, not the raw key
    if (RULES.throttle) a += pedalForce(speed01) * P.accel;
    a += RULES.thrust;
    a -= RULES.retard * surf.grip;
    const dragK = DRAG_K * (inp.tuck ? TUCK_DRAG : 1);
    a -= dragK * r.v * r.v;
    a -= surf.drag * (r.v * 0.055 + 0.5);
    a -= RULES.scrub * Math.abs(r.vx) * 0.35;   // sliding costs momentum
    const cap = SOFT_CAP + P.topCap;
    if (r.v > cap) a -= (r.v - cap) * 5;
    if (!r.isPlayer && r.v > r.aiCap) a -= (r.v - r.aiCap) * 4;
    r.v = Math.max(0, r.v + a * dt);

    // ---- lateral
    // Committing to a bonk takes a hand off the bars: you briefly lose
    // steering authority, so swinging mid-corner at speed is a real gamble.
    const swingCost = r.bonkSwing > 0 ? 1 - clamp01(r.bonkSwing) * 0.45 : 1;
    const gripK = surf.grip * swingCost * P.grip * RULES.gripMul;
    const maxLatSpeed = lerp(15.5, 9.5, speed01) * gripK;
    const maxLatAccel = (r.grounded ? 34 : 11) * gripK;
    const desired = inp.steer * maxLatSpeed;
    let latA = clamp((desired - r.vx) * 7.5, -maxLatAccel, maxLatAccel);
    latA -= curv * r.v * r.v;                 // centrifugal
    latA += -GRAV * Math.sin(bank) * (r.grounded ? 1 : 0.15);  // bank support
    r.vx += latA * dt;
    r.vx *= Math.exp(-(r.grounded ? 1.1 : 0.35) * RULES.slipDamp * dt);
    r.x += r.vx * dt;

    // ---- vertical: TWO-WHEEL CONTACT ------------------------------------
    // A bicycle touches the ground in two places, ~1.2m apart. Sampling one
    // point makes the rider a floating dot; sampling both means a rock under
    // the front wheel pitches you back, a lip under the rear kicks you up,
    // and cresting a roller unweights the front before the rear. This is the
    // single biggest contributor to "that reads as a bike".
    const hF = trk.heightAt(r.s + AXLE_F, r.x);
    const hR = trk.heightAt(r.s + AXLE_R, r.x);
    // the chassis rests on whichever contact is higher
    const gh = Math.max(hF, hR);
    // ...and tilts to match the line between the two patches
    const terrainPitch = Math.atan2(hF - hR, WHEELBASE);

    r.vy -= GRAV * dt;
    r.y += r.vy * dt;
    const wasAir = !r.grounded;

    if (r.y <= gh + 0.001) {
      const impact = -r.vy;
      r.y = gh;
      // which wheels are actually touching? (used by FX + landing quality)
      r.contactF = hF >= hR - 0.05;
      r.contactR = hR >= hF - 0.05;

      // launch off lips, measured across the real wheelbase
      const ahead = trk.heightAt(r.s + AXLE_F + 1.8, r.x);
      const slopeF = (ahead - hR) / (AXLE_F + 1.8 - AXLE_R);
      const up = slopeF > 0.06 ? r.v * slopeF * 1.15 : 0;
      r.vy = up;

      // ---- PUMPING: the core downhill momentum skill.
      // Compress into a compression, extend over a crest. Timed right it
      // adds real speed; timed wrong it scrubs. Reads brake (weight down)
      // and hop (weight up) as the pump input.
      const wantDown = inp.brake || (r.isPlayer && this.key('ShiftLeft', 'ShiftRight'));
      const pumpTarget = wantDown ? 1 : inp.hop ? -1 : 0;
      r.pump = damp(r.pump, pumpTarget, 9, dt);
      // terrain curvature: >0 in a compression (valley), <0 over a crest
      const curveT = (hF + hR) * 0.5 - trk.heightAt(r.s, r.x);
      if (curveT > 0.012 && r.pump > 0.35) {
        // loading the bike through a compression stores energy
        r.pumpArmed = Math.min(1, r.pumpArmed + r.pump * curveT * 22 * dt);
      } else if (curveT < -0.008 && r.pumpArmed > 0.05 && r.pump < 0.1) {
        // releasing it over the crest converts to drive
        const gain = r.pumpArmed * 9;
        r.v += gain * dt * 8;
        r.pumpArmed = Math.max(0, r.pumpArmed - dt * 2.4);
        if (r.isPlayer && r.pumpArmed > 0.4 && Math.random() < dt * 6) {
          this.style = Math.min(1, this.style + 0.1);
        }
      } else {
        r.pumpArmed = Math.max(0, r.pumpArmed - dt * 0.7);
      }

      if (inp.hop) {
        // a bunny hop loads the rear then springs: preloading pays off
        r.vy += 7.6 + r.pumpArmed * 3.4;
        r.pumpArmed = 0;
        if (r.isPlayer) audio.hop();
      }
      r.grounded = true;
      if (wasAir) {
        r.landTimer = STATE_TUNING.landWindow;
        this.onLand(r, impact, slopeF);
      }
      r.airTime = 0;
      // suspension compression, biased by which end took the hit
      if (impact > 1) { r.suspV -= Math.min(impact * 0.55, 9); }
    } else {
      r.contactF = false;
      r.contactR = false;
      if (r.grounded && r.y > gh + 0.08) r.grounded = false;
      if (!r.grounded) {
        r.airTime += dt;
        if (r.isPlayer) {
          this.airPeak = Math.max(this.airPeak, r.y - gh);
          this.airTotal += dt;
        }
      }
    }

    // ---- chassis pitch follows the contact line, sprung so it has weight
    // rather than snapping. In the air it eases back toward level.
    const pitchTargetT = r.grounded ? terrainPitch : 0;
    r.pitchV += (-(r.chassisPitch - pitchTargetT) * 150 - r.pitchV * 17) * dt;
    r.chassisPitch += r.pitchV * dt;
    r.chassisPitch = clamp(r.chassisPitch, -0.55, 0.55);

    // ---- track bounds. Falling off the mountain is its own crash: a long
    // quiet drop, then a respawn. Triggered early on authored drop-offs so
    // you don't tumble silently into the void for two seconds.
    const zoneNow = trk.zoneAt(r.s);
    const voidDrop = zoneNow.dropDepth !== undefined
      && Math.abs(r.x) > hw + 3.5
      && (zoneNow.dropSide === 0 || zoneNow.dropSide === Math.sign(r.x));
    if (voidDrop && r.crash <= 0) {
      if (r.isPlayer) this.crashPlayer(CrashCause.OFF_TRACK, Math.sign(r.x) || 1);
      else this.crashRacer(r, CrashCause.OFF_TRACK, Math.sign(r.x) || 1);
    }
    if (Math.abs(r.x) > hw + 20 || r.y < trk.heightAt(r.s, clamp(r.x, -hw, hw)) - 26) {
      this.respawn(r);
    }

    r.s += r.v * dt;
    if (r.s >= this.track.length - 20 && !r.finished) {
      r.finished = true;
      r.finishTime = this.raceTime;
      if (r.isPlayer) {
        this.finishHold = 0;
        audio.cheer(1.2);
        this.slowmo = Math.max(this.slowmo, 1.1);
        // if someone just beat us across, call it immediately; the winning
        // margin is resolved later once the chasers have landed too
        for (const o of this.racers) {
          if (o === r || !o.finished) continue;
          if (Math.abs(o.finishTime - r.finishTime) < 0.75) {
            this.popup('BY A TYRE!', 'trick', null, '#ffd400');
            break;
          }
        }
      }
    }

    // ---- drivetrain: a DH bike freewheels, so the cranks only turn while
    // the rider is actually putting power down.
    r.pedalling = damp(r.pedalling, inp.pedal && r.grounded ? 1 : 0, 9, dt);

    // ---- fore/aft weight shift. Riders get back over the rear wheel on
    // steeps and under braking, and move forward to drive on the flat.
    let wTarget = 0;
    wTarget -= clamp01((pitch - 0.14) / 0.20) * 0.85;      // steepness
    if (inp.brake) wTarget -= 0.7;
    if (inp.tuck) wTarget += 0.35;
    if (inp.pedal && r.v < 22) wTarget += 0.45;
    if (!r.grounded) wTarget = wTarget * 0.3 - 0.15;
    if (r.stun > 0) wTarget -= 0.3;
    wTarget += r.stWeight;                                  // personal stance
    r.weight = damp(r.weight, clamp(wTarget, -1, 1), 4.5 * r.stTwitch, dt);
    if (inp.pedal && r.grounded) {
      // cadence rises with speed but tops out; riders spin out in tall gears
      const cadence = lerp(4.2, 11.5, clamp01(r.v / 26)) * r.stCadence;
      r.crankAngle += cadence * dt;
    }

    // ---- visuals
    this.poseRacer(r, dt, inp.steer);
    if (r.isPlayer) this.playerFx(r, dt, inp, surf);
    else this.aiFx(r, dt, surf);
  }

  /**
   * Build the snapshot, resolve the state, and fire enter/exit hooks.
   * The resolve itself is pure — everything impure lives in the hooks.
   */
  private applyState(r: Racer, dt: number, inp: {
    pedal: boolean; brake: boolean; boost: boolean;
  }) {
    const rotation = r.isPlayer
      ? Math.abs(this.airSpin) + Math.abs(this.airFlip)
      : 0;
    const trickInput = r.isPlayer
      ? this.key('KeyQ', 'KeyE', 'KeyJ', 'KeyK', 'ControlLeft')
      : false;

    const snap: StateSnapshot = {
      finished: r.finished,
      crashTimer: r.crash,
      recoverTimer: r.grace > 0 && r.crash <= 0 && r.stun > 0 ? r.stun : 0,
      stunTimer: r.stun,
      grounded: r.grounded,
      airTime: r.airTime,
      landTimer: r.landTimer,
      speed: r.v,
      lateralSpeed: r.vx,
      pedal: inp.pedal,
      brake: inp.brake,
      boost: inp.boost,
      trickInput,
      trickRotation: rotation,
    };

    const next = resolveState(snap);
    if (next !== r.state) {
      this.onStateExit(r, r.state);
      r.prevState = r.state;
      r.state = next;
      r.stateT = 0;
      r.log.push(r.prevState, next, this.raceTime);
      this.onStateEnter(r, next);
    } else {
      r.stateT += dt;
    }
  }

  /** One-shot effects when a state begins. */
  private onStateEnter(r: Racer, st: BikeState) {
    switch (st) {
      case BikeState.DRIFTING:
        if (r.isPlayer && r.v > 14) {
          audio.scrape(0.5);
          this.style = Math.min(1, this.style + 0.12);
        }
        break;
      case BikeState.BOOSTING:
        if (r.isPlayer) { audio.boost(); this.shakeAdd(0.5); }
        break;
      case BikeState.TRICKING:
        if (r.isPlayer) this.style = Math.min(1, this.style + 0.1);
        break;
      case BikeState.LANDING:
        // suspension bite is applied by onLand(); nothing extra here
        break;
    }
  }

  /** One-shot effects when a state ends. */
  private onStateExit(r: Racer, st: BikeState) {
    if (st === BikeState.DRIFTING && r.isPlayer) {
      // reward a long committed slide
      if (r.stateT > 0.8) {
        const pts = 60 * r.stateT * this.comboMult();
        this.addScore(pts);
        this.boost = Math.min(100, this.boost + r.stateT * 6);
        this.popup(`DRIFT +${Math.round(pts)}`, 'sub', null, '#7ef7ff');
      }
    }
  }

  private respawn(r: Racer) {
    const trk = this.track;
    const hw = trk.halfWidth(r.s);
    r.x = clamp(r.x, -hw * 0.6, hw * 0.6);
    r.y = trk.heightAt(r.s, r.x) + 0.6;
    r.vy = 0; r.vx = 0;
    r.v *= 0.42;
    r.crash = 0;
    r.grace = 1.2;
    if (r.isPlayer) {
      this.breakCombo();
      this.popup('BACK ON COURSE', 'sub', null, '#9fd0ff');
      this.shakeAdd(0.4);
    }
  }

  private onLand(r: Racer, impact: number, slopeF: number) {
    const trk = this.track;
    const surf = trk.surfaceAt(r.s, r.x);
    // downslope landings preserve speed, flat landings hurt
    const landQual = clamp01(1 - clamp01((impact - 6) / 22) * clamp01(1 + slopeF * 3.2));
    if (r.isPlayer) {
      const air = r.airTime;
      let crashed = false;
      // rotation alignment — how far from square are we at touchdown?
      const spinErr = Math.abs(((this.airSpin % TAU) + TAU + Math.PI) % TAU - Math.PI);
      const flipErr = Math.abs(((this.airFlip % TAU) + TAU + Math.PI) % TAU - Math.PI);
      // Small hops get a wide window (you had no time to correct); long,
      // committed airs are judged tightly. ~75deg down to ~50deg.
      const tol = lerp(1.32, 0.88, clamp01((air - 0.35) / 1.4)) + this.perf.landTol;
      const misaligned = spinErr > tol || flipErr > tol;
      if (air > 0.45 && misaligned) {
        // still rotating when the wheels arrived
        this.crashPlayer(CrashCause.FAILED_TRICK, Math.sign(this.airSpin) || 1);
        crashed = true;
      } else if (impact > 30 && landQual < 0.18) {
        this.crashPlayer(r.v > 30 ? CrashCause.HIGH_SPEED : CrashCause.BAD_LANDING);
        crashed = true;
      } else if (r.chassisPitch > 0.34 && impact > 17) {
        // came down on the front wheel with the nose buried
        this.crashPlayer(CrashCause.OBSTACLE);
        crashed = true;
      } else if (misaligned) {
        // survived it, but it was ugly — scrub speed and wobble
        r.v *= 0.72;
        r.leanV += (spinErr > flipErr ? 1 : -1) * 9;
        r.stun = 0.25;
        this.shakeAdd(0.5);
        audio.hitTaken(0.6);
        this.popup('SKETCHY!', 'sub', null, '#ff9500');
      }
      if (!crashed) {
        if (air > 0.32) this.scoreTrick(air, impact);
        const dust = clamp01(impact / 18);
        if (impact > 3) {
          audio.land(clamp01(impact / 20));
          if (impact > 12) audio.duck(clamp01(impact / 30) * 0.5, 0.4);
          this.spawnLandingBurst(r, dust);
          this.shakeAdd(clamp01(impact / 26) * 0.85);
          r.suspV -= Math.min(impact * 0.5, 10);
        }
        // speed physics: reward smooth landings
        r.v -= impact * 0.11 * (1 - landQual) * 2.2;
        if (slopeF < -0.05) r.v += Math.min(4.5, impact * 0.10);
        // rear-wheel-first is the clean way down: keeps drive, stays settled
        if (r.chassisPitch < -0.08 && r.chassisPitch > -0.42) {
          r.v += Math.min(2.6, impact * 0.06);
          if (r.isPlayer && impact > 9) {
            this.style = Math.min(1, this.style + 0.2);
            this.boost = Math.min(100, this.boost + 5);
          }
        }
        r.v = Math.max(0, r.v);
      }
      this.airSpin = this.airFlip = this.airPose = 0;
      this.airPeak = 0;
      this.slowmo = 0;
    } else {
      r.v -= impact * 0.10 * (1 - landQual) * 1.6;
      r.v = Math.max(0, r.v);
      if (impact > 26 && Math.random() < 0.25) this.crashRacer(r);
    }
    void surf;
  }

  /**
   * IMPACT. Kicks off a cause-specific ragdoll so the crash reads as an
   * explanation of what went wrong, not a generic tumble.
   */
  private crashPlayer(cause: CrashCause, dir = 1) {
    const p = this.player;
    if (p.crash > 0) return;
    const P = CRASH_PROFILES[cause];
    p.crash = P.duration;
    p.crashMax = P.duration;
    p.recover = 0;
    p.crashSpin = 0;
    p.ragdoll = startRagdoll(cause, dir);
    // off-track keeps its momentum (you're falling, not stopping)
    p.v *= cause === CrashCause.OFF_TRACK ? 0.72 : 0.22;
    p.vy = P.pop;

    audio.crash();
    audio.duck(0.8, 1.1);
    this.shakeAdd(P.shake);
    this.hitStop = P.hitStop;
    if (P.slowmo > 0) this.slowmo = Math.max(this.slowmo, P.slowmo);
    this.breakCombo();
    this.popup(crashCall(cause, Math.random()), 'bad', null, P.colour);
    this.spawnCrashDebris(p, P.debris);
    this.hud.hitFlash = 1;
    this.hud.crashCause = cause;
  }

  private crashRacer(r: Racer, cause = CrashCause.ATTACKED, dir = 1) {
    if (r.crash > 0) return;
    const P = CRASH_PROFILES[cause];
    r.crash = P.duration * 1.1;
    r.crashMax = r.crash;
    r.ragdoll = startRagdoll(cause, dir);
    r.v *= 0.25;
    r.vy = P.pop * 0.8;
    if (Math.abs(r.s - this.player.s) < 120) this.spawnCrashDebris(r, P.debris * 0.6);
  }

  // -------------------------------------------------------------------------
  private stepAI(r: Racer, dt: number, live: boolean) {
    const trk = this.track;
    if (!live && this.hud.phase !== 'countdown') { this.poseRacer(r, dt, 0); return; }
    if (this.hud.phase === 'countdown') { this.poseRacer(r, dt, 0); return; }

    const hw = trk.halfWidth(r.s);
    const look = r.s + 22 + r.v * 0.55;
    const curvAhead = trk.curvatureAt(look);
    // aim for the inside of the coming corner, plus personality offset
    // the path curves toward +x when curvature is positive, so that side is the apex
    let targetX = Math.sign(curvAhead) * Math.min(hw * 0.55, Math.abs(curvAhead) * 2200) * r.corner;
    targetX += r.aiOffset * hw * 0.55;
    // sloppier riders wander more
    targetX += Math.sin(this.time * 0.7 + r.aiSeed) * hw * 0.12 * (1.6 - r.corner);
    // avoid obstacles ahead
    const obs = trk.obstacles;
    for (let i = trk.firstObstacleAfter(r.s + 2); i < obs.length; i++) {
      const o = obs[i];
      if (o.s - r.s > 34) break;
      if (o.hit > 0 || o.gone) continue;
      // water, snow and ramps aren't things to steer around
      const rx = PROPS[o.type].reaction;
      if (rx === 'surface' || rx === 'launch') continue;
      if (Math.abs(o.x - targetX) < o.r + 1.4) targetX += (targetX > o.x ? 1 : -1) * (o.r + 2.2);
    }
    // ---- combat sections: rivals stop racing the clock and come for you
    const zoneHere = trk.zoneAt(r.s);
    if (zoneHere.combat) {
      const dp = this.player.s - r.s;
      if (Math.abs(dp) < 26) {
        // converge on the player's line rather than the racing line
        targetX = lerp(targetX, this.player.x, 0.55 * r.aggression);
      }
    }

    targetX = clamp(targetX, -hw * 0.86, hw * 0.86);
    const steer = clamp((targetX - r.x) * 0.42 - r.vx * 0.18, -1, 1);

    // rubber-band: keeps the pack breathing around the player without cheating.
    // bandK is per-difficulty so the band can't erase the difficulty choice.
    const rel = this.player.s - r.s;
    const bk = DIFF_TUNING[this.difficulty].bandK;
    const band = clamp(rel * 0.0024 * bk, -0.10 * bk, 0.15 * bk);
    const skill = clamp(r.skill + band, SKILL_MIN, SKILL_MAX);
    r.aiCap = 24.5 + skill * 15;
    const wantSpeed = r.aiCap;
    // weaker riders bleed more speed through corners, so gaps open naturally
    const grip = 15 + r.corner * 9;
    const cornerLimit = Math.abs(curvAhead) > 0.0002 ? Math.sqrt(grip / Math.abs(curvAhead)) : 999;
    const pedal = r.v < wantSpeed;
    const brake = r.v > Math.min(wantSpeed * 1.1, cornerLimit) && Math.abs(curvAhead) > 0.008;
    const tuck = !brake && Math.abs(curvAhead) < 0.005 && r.v > 18;

    // hop off lips
    r.aiHopCd -= dt;
    let hop = false;
    if (r.grounded && r.aiHopCd <= 0) {
      const h0 = trk.heightAt(r.s, r.x);
      const h1 = trk.heightAt(r.s + 6, r.x);
      if (h1 - h0 > 0.9 && Math.random() < 0.5) { hop = true; r.aiHopCd = 0.8; }
    }
    // ---- rivals swing at WHOEVER is next to them, player or not.
    // This is what makes the pack feel like a brawl instead of a convoy.
    r.bonkCd -= dt;
    if (r.bonkCd <= 0 && r.crash <= 0 && r.stun <= 0) {
      for (const other of this.racers) {
        if (other === r || other.crash > 0 || other.finished) continue;
        const ds = other.s - r.s, dx = other.x - r.x;
        if (Math.abs(ds) > 3.4 || Math.abs(dx) > 3.6) continue;
        if (Math.abs(other.y - r.y) > 2.4) continue;
        // more likely to swing at someone who's beating them
        const spite = other.s > r.s ? 1.5 : 0.7;
        // combat sections crank everyone up
        const arena = this.track.zoneAt(r.s).combat ? 2.3 : 1;
        if (Math.random() < r.aggression * spite * arena * dt * 2.4) {
          r.bonkCd = 1.6;
          r.bonkSwing = 1;
          r.bonkDir = Math.sign(dx) || 1;
          r.swingT = 0;
          this.resolveContact(r, other, true);
        }
        break;
      }
    }
    this.stepRacer(r, dt, { steer, pedal, brake, tuck, hop, boost: false, live });
  }

  // -------------------------------------------------------------------------
  private doBonk(dir: number) {
    const p = this.player;
    p.bonkCd = 0.36;
    p.bonkSwing = 1;
    p.bonkDir = dir;
    p.swingT = 0;
    audio.whoosh(0.5);
    let hitSomething = false;

    // rivals — every rider-on-rider hit goes through the bonk resolver
    for (const r of this.racers) {
      if (r.isPlayer || !canBeBonked(r.state)) continue;
      const ds = r.s - p.s, dx = r.x - p.x;
      if (ds > -2.6 && ds < 4.4 && dx * dir > 0 && Math.abs(dx) < 4.2 && Math.abs(r.y - p.y) < 2.6) {
        hitSomething = true;
        this.resolveContact(p, r, true);
        break;
      }
    }
    // spectators
    if (!hitSomething) {
      const trk = this.track;
      const list = trk.spectators;
      for (let i = 0; i < list.length; i++) {
        const sp = list[i];
        if (sp.s < p.s - 3 || sp.s > p.s + 6) continue;
        if (sp.state === 1) continue;
        const dx = sp.x - p.x;
        if (dx * dir <= 0 || Math.abs(dx) > 3.6) continue;
        hitSomething = true;
        sp.state = 1;
        sp.vx = dir * this.rng.range(7, 13);
        sp.vy = this.rng.range(6, 11);
        sp.vs = this.rng.range(-3, 6);
        sp.spin = this.rng.range(-11, 11);
        const wp = trk.worldPos(sp.s, sp.x, trk.heightAt(sp.s, sp.x) + 1, new THREE.Vector3());
        this.bonkImpact(wp, 0.9, dir, 'CROWD BONK', 250);
        break;
      }
    }
    // props
    if (!hitSomething) {
      for (const o of this.track.obstacles) {
        if (o.hit > 0 || o.mass > 100) continue;
        const ds = o.s - p.s, dx = o.x - p.x;
        if (ds > -2 && ds < 5 && dx * dir > 0 && Math.abs(dx) < 3.8) {
          hitSomething = true;
          this.knockProp(o, dir * 12, 8, 3);
          const wp = this.track.worldPos(o.s, o.x, this.track.heightAt(o.s, o.x) + 0.6, new THREE.Vector3());
          this.bonkImpact(wp, 0.8, dir, 'SMASH', 180);
          break;
        }
      }
    }
    if (!hitSomething) {
      // whiff: costs real momentum and a longer recovery, so mashing Q/E
      // down a straight is strictly worse than riding clean
      p.v *= 0.975;
      p.bonkCd = 0.5;
    }
  }

  /** Snapshot a racer as a bonk body. */
  private toBody(r: Racer): BonkBody {
    return {
      s: r.s, x: r.x, y: r.y, v: r.v, vx: r.vx,
      mass: r.mass, state: r.state, swinging: r.swingT < 0.28,
    };
  }

  /**
   * THE single entry point for rider-on-rider contact. Classifies the hit,
   * computes knockback from the impulse model, and applies every consequence
   * (physics, score, audio, FX, crash roll) in one place.
   */
  private resolveContact(a: Racer, b: Racer, deliberate: boolean) {
    if (!canBeBonked(a.state) || !canBeBonked(b.state)) return;
    if (a.bonkCooldownPair > 0 || b.bonkCooldownPair > 0) return;

    const trk = this.track;
    const surf = trk.surfaceAt(b.s, b.x);
    const res = resolveBonk(this.toBody(a), this.toBody(b), {
      surfaceGrip: surf.grip,
      halfWidth: trk.halfWidth(b.s),
      // both riders swung at once -> DOUBLE BONK
      simultaneous: a.swingT < 0.3 && b.swingT < 0.3,
    });

    // upgrades from the garage make the player hit harder
    const gain = a.isPlayer ? this.perf.bonk : 1;

    // ---- apply to the victim
    b.vx += res.knockX * gain;
    b.v = Math.max(0, b.v * res.victimSpeedMul - res.knockS * 0.1);
    if (res.knockY > 0.4 && b.grounded) { b.vy += res.knockY * gain; b.grounded = false; }
    b.stun = Math.max(b.stun, 0.4 + res.power * 0.5);
    b.leanV += Math.sign(res.knockX) * (8 + res.power * 10);
    b.suspV -= res.power * 5;

    // ---- reaction on the aggressor (Newton's third)
    a.vx += res.reactX * 0.7;
    a.v *= res.aggressorSpeedMul;
    if (res.type === BonkType.DOUBLE) {
      a.stun = Math.max(a.stun, 0.35);
      a.leanV -= Math.sign(res.knockX) * 7;
    }

    a.bonkCooldownPair = 0.35;
    b.bonkCooldownPair = 0.35;

    // WALL BONK: drive them off the course properly, and make the terrain
    // finish the job rather than just relabelling a side hit
    if (res.type === BonkType.WALL) {
      b.vx += Math.sign(res.knockX) * 6;
      b.v *= 0.82;
      b.stun = Math.max(b.stun, 0.8);
    }

    const crashed = Math.random() < res.crashChance;
    if (crashed) this.crashRacer(b);
    if (res.type === BonkType.DOUBLE && Math.random() < res.crashChance * 0.6) {
      if (a.isPlayer) this.crashPlayer(CrashCause.ATTACKED, -Math.sign(res.knockX) || 1);
      else this.crashRacer(a, CrashCause.ATTACKED, -Math.sign(res.knockX) || 1);
    }

    // ---- presentation
    const world = b.rig.root.position.clone();
    const flavour = bonkFlavour(res.type, Math.random());
    if (a.isPlayer) {
      this.onPlayerBonk(res, world, flavour, crashed, deliberate);
    } else if (b.isPlayer) {
      this.onPlayerBonked(res, a, world);
    } else {
      this.onRivalBonk(res, b, world, flavour, crashed);
    }
  }

  /** Player landed a bonk. */
  private onPlayerBonk(
    res: BonkResult, world: THREE.Vector3, flavour: string,
    crashed: boolean, deliberate: boolean,
  ) {
    const mega = res.type === BonkType.MEGA || res.type === BonkType.WALL;
    audio.bonk(clamp(0.6 + res.power, 0.5, 1.5), clamp(-Math.sign(res.knockX) * 0.5, -1, 1));
    audio.duck(mega ? 0.6 : 0.42, mega ? 0.55 : 0.38);
    this.hitStop = (mega ? 0.11 : 0.07) + res.power * 0.04;
    this.shakeAdd((mega ? 0.9 : 0.55) + res.power * 0.4);
    this.bonks++;
    this.addCombo();

    const pts = res.score * this.comboMult() * (deliberate ? 1 : 0.6);
    this.addScore(pts);
    this.boost = Math.min(100, this.boost + res.boost);
    this.style = Math.min(1, this.style + (mega ? 0.5 : 0.3));

    this.popupAt(world, `${flavour}  +${Math.round(pts)}`, res.colour, mega ? 34 : 28);
    this.spawnImpactBurst(world, Math.sign(res.knockX), 0.6 + res.power);
    audio.cheer(0.4 + res.power * 0.5);
    this.hud.hitFlash = Math.max(this.hud.hitFlash, mega ? 0.75 : 0.5);
    this.hud.lastBonk = res.type;
    this.hud.lastBonkT = 1.6;
    if (mega) this.slowmo = Math.max(this.slowmo, 0.5);
    if (crashed) {
      this.popupAt(world.clone().add(_v3.set(0, 1.4, 0)), 'WIPEOUT!', '#ff6a00', 24);
    }
  }

  /** Player took a bonk. */
  private onPlayerBonked(res: BonkResult, from: Racer, world: THREE.Vector3) {
    audio.hitTaken(0.6 + res.power);
    audio.duck(0.55, 0.5);
    this.shakeAdd(0.7 + res.power * 0.5);
    this.hitStop = 0.06;
    this.breakCombo();
    this.hud.hitFlash = 1;
    this.popup(`${from.name}: ${res.label}`, 'bad', null, '#ff4d4d');
    this.spawnImpactBurst(world, Math.sign(res.knockX), 0.8);
  }

  /** Two rivals collided — sell it only if the player can see it. */
  private onRivalBonk(
    res: BonkResult, victim: Racer, world: THREE.Vector3,
    flavour: string, crashed: boolean,
  ) {
    const dist = Math.abs(victim.s - this.player.s);
    if (dist > 110) return;
    const near = 1 - clamp01(dist / 110);
    audio.bonk(0.7 * (0.5 + res.power), clamp((victim.x - this.player.x) * 0.2, -1, 1));
    this.spawnImpactBurst(world, Math.sign(res.knockX), 0.6 * res.power);
    this.shakeAdd(0.12 * near);
    if (dist < 70 && (crashed || res.type === BonkType.MEGA)) {
      this.popupAt(world, flavour, res.colour, 20);
      audio.cheer(0.4 * near);
    }
  }

  private bonkImpact(world: THREE.Vector3, power: number, dir: number, label: string, base: number) {
    // dir is track-space (+x = screen-left), stereo pan is -1=left, so negate
    audio.bonk(clamp(power, 0.5, 1.4), clamp(-dir * 0.5, -1, 1));
    audio.duck(0.42, 0.38);
    this.hitStop = 0.075 + power * 0.03;
    this.shakeAdd(0.55 + power * 0.35);
    this.bonks++;
    this.addCombo();
    const pts = base * this.comboMult();
    this.addScore(pts);
    this.boost = Math.min(100, this.boost + 13);
    this.style = Math.min(1, this.style + 0.3);
    this.popupAt(world.clone(), `${label}  +${Math.round(pts)}`, '#ffd400', 30);
    this.spawnImpactBurst(world, dir, power);
    audio.cheer(0.5 + power * 0.3);
    this.hud.hitFlash = Math.max(this.hud.hitFlash, 0.5);
  }



  // -------------------------------------------------------------------------
  /**
   * Natural (unintentional) contact. Gentle overlaps just push apart with a
   * scrape; genuine impacts escalate into a real bonk through the same
   * resolver the deliberate swings use, so ramming someone at speed is a
   * FRONT BONK whether or not you pressed a button.
   */
  private collideRacers(dt: number) {
    for (let i = 0; i < this.racers.length; i++) {
      for (let j = i + 1; j < this.racers.length; j++) {
        const a = this.racers[i], b = this.racers[j];
        if (!canBeBonked(a.state) || !canBeBonked(b.state)) continue;
        if (a.bonkCooldownPair > 0 || b.bonkCooldownPair > 0) continue;
        const ds = Math.abs(a.s - b.s), dx = a.x - b.x;
        if (ds > 2.2 || Math.abs(dx) > 1.7 || Math.abs(a.y - b.y) > 2.2) continue;

        // closing hard enough to count as an impact?
        const closing = Math.hypot(a.v - b.v, a.vx - b.vx);
        if (closing > 7) {
          // whoever is arriving faster is the aggressor
          const aFaster = (a.v - b.v) * (b.s - a.s) > 0 || Math.abs(a.vx) > Math.abs(b.vx);
          if (aFaster) this.resolveContact(a, b, false);
          else this.resolveContact(b, a, false);
          continue;
        }

        // soft overlap: separate and scrape
        const push = (1.7 - Math.abs(dx)) * 9;
        const dir = Math.sign(dx) || 1;
        a.vx += dir * push * dt * 6;
        b.vx -= dir * push * dt * 6;
        const rel = Math.abs(a.v - b.v);
        if (rel > 4) { a.v -= 0.4 * dt * rel; b.v -= 0.4 * dt * rel; }
        if ((a.isPlayer || b.isPlayer) && Math.random() < dt * 3) {
          audio.scrape(0.6); this.shakeAdd(0.12);
        }
      }
    }
  }

  private collideObstacles(r: Racer, dt: number) {
    if (r.crash > 0) return;
    if (r.obsCd > 0) r.obsCd -= dt;
    if (r.grace > 0) r.grace -= dt;
    const trk = this.track;
    const list = trk.obstacles;
    for (let i = trk.firstObstacleAfter(r.s - 2.0); i < list.length; i++) {
      const o = list[i];
      // a rolling boulder's real position includes its drift
      const ds = (o.s + (o.roll !== undefined ? o.os : 0)) - r.s;
      if (ds > 2.4) break;
      if (o.gone) continue;
      if (o.hit > 0 && o.roll === undefined) continue;
      const dx = (o.x + (o.roll !== undefined ? o.ox : 0)) - r.x;
      const reach = o.r + 0.7;
      if (Math.abs(dx) > reach) continue;
      const oh = trk.heightAt(o.s, o.x);
      const objTop = oh + (o.type === 'cone' ? 0.75 : o.type === 'log' ? 0.95 : o.type === 'rock' ? o.r * 1.2 : 1.4);
      if (r.y > objTop - 0.15) continue;                      // cleared it in the air
      if (o.idx === r.lastObs && r.obsCd > 0) continue;        // already resolved
      // a log lies across the track, so you can never "edge past" it
      const spannning = o.type === 'log';

      // how squarely did we hit? 0 = clipped the very edge, 1 = dead centre
      const pen = spannning ? 1 : clamp01(1 - Math.abs(dx) / reach);
      // closing angle: drifting sideways into a rock is worse than brushing it
      const closing = clamp01(Math.abs(r.vx) / 9);
      const dir = -Math.sign(dx) || 1;
      r.lastObs = o.idx;
      r.obsCd = 0.45;

      const def = PROPS[o.type];

      // ---- surface patches: water, puddles, snow. No collision, but they
      // change grip and throw spray, so riding through one is felt.
      if (def.reaction === 'surface') {
        if (r.isPlayer) this.splash(r, o.type);
        continue;
      }

      // ---- wooden ramps: ride up, get launched
      if (def.reaction === 'launch') {
        if (r.grounded && r.v > 6) {
          r.vy = Math.max(r.vy, (def.launch ?? 9) * clamp01(r.v / 26) + 3);
          r.grounded = false;
          if (r.isPlayer) {
            audio.hop();
            this.style = Math.min(1, this.style + 0.2);
            this.popup('RAMP!', 'sub', null, '#ffd400');
          }
        }
        continue;
      }

      // ---- breakables: fences, signs, barriers
      if (def.reaction === 'shatter' || def.reaction === 'topple') {
        const fast = r.v > (def.breakSpeed ?? 6);
        if (fast) {
          o.gone = def.reaction === 'shatter';
          o.hit = 1;
          this.knockProp(o, -dir * (4 + r.v * 0.3), 5 + r.v * 0.14, r.v * 0.4);
          r.v -= def.mass * 1.1;
          r.v = Math.max(0, r.v);
          const oh2 = trk.heightAt(o.s, o.x);
          const wp = trk.worldPos(o.s, o.x, oh2 + def.height * 0.5, _v1).clone();
          this.shatter(wp, def, dir);
          if (r.isPlayer) {
            audio.bonk(0.55, clamp(dir * 0.4, -1, 1));
            this.shakeAdd(0.26);
            this.addCombo();
            const pts = (PROP_SCORE[o.type] ?? 100) * this.comboMult();
            this.addScore(pts);
            this.boost = Math.min(100, this.boost + (PROP_BOOST[o.type] ?? 5));
            this.popupAt(wp, `${PROP_CALL[o.type] ?? 'SMASH'}  +${Math.round(pts)}`,
              '#ffd400', 22);
          }
        } else {
          // too slow to break it: it just stops you
          r.v *= 0.6; r.vx += dir * 3;
          if (r.isPlayer) { audio.scrape(0.7); this.shakeAdd(0.2); }
        }
        continue;
      }

      if (o.mass > 100) {
        // ---- solid: rock / log -------------------------------------------
        // Only a square, fast hit ends the run. Clipping the shoulder of a
        // rock deflects you — punishing, readable, and recoverable.
        const severity = pen * (0.55 + closing * 0.45) * clamp01(r.v / 26);
        if (r.isPlayer) {
          if (r.grace > 0) continue;
          if (severity > 0.42) {
            this.crashPlayer(
              r.v > 26 ? CrashCause.HIGH_SPEED : CrashCause.OBSTACLE, dir);
          } else {
            // glancing blow — deflect, scrub speed, keep racing
            const bite = 0.30 + severity * 0.55;
            r.v *= 1 - bite * 0.45;
            r.vx += dir * (5 + severity * 9);
            r.leanV += dir * 7;
            r.stun = 0.18 + severity * 0.3;
            r.suspV -= 5;
            audio.hitTaken(0.5 + severity);
            audio.scrape(0.8);
            this.shakeAdd(0.35 + severity * 0.5);
            this.hitStop = 0.035;
            this.hud.hitFlash = 0.5 + severity * 0.4;
            this.breakCombo();
            const wp = trk.worldPos(o.s, o.x, oh + 0.8, _v1).clone();
            this.popupAt(wp, severity > 0.25 ? 'GLANCED IT!' : 'SCRAPE', '#ff9500', 22);
            this.spawnImpactBurst(wp, dir, 0.5 + severity);
          }
        } else {
          if (severity > 0.5 && Math.random() < 0.55) this.crashRacer(r);
          else { r.v *= 1 - 0.22 * pen; r.vx += dir * 5; r.stun = 0.2; }
        }
      } else {
        // ---- scatterable: bale / cone / barrel ---------------------------
        this.knockProp(o, -dir * (5 + r.v * 0.35), 6 + r.v * 0.18, r.v * 0.5);
        r.v -= o.mass * 1.5 * (0.5 + pen * 0.5);
        r.v = Math.max(0, r.v);
        r.vx += dir * o.mass * 0.9 * pen;
        if (r.isPlayer) {
          audio.bonk(0.7, clamp(dir * 0.4, -1, 1));
          this.shakeAdd(0.3);
          this.addCombo();
          const pts = 120 * this.comboMult();
          this.addScore(pts);
          this.boost = Math.min(100, this.boost + 6);
          const wp = trk.worldPos(o.s, o.x, oh + 0.7, _v1).clone();
          this.popupAt(wp, `PLOW  +${Math.round(pts)}`, '#ffb020', 22);
          this.spawnImpactBurst(wp, dir, 0.7);
        }
      }
    }
  }

  /** Burst a breakable into its constituent debris. */
  private shatter(world: THREE.Vector3, def: PropDef, dir: number) {
    const c1 = _c1.setHex(def.colour);
    const c2 = _c2.setHex(def.colour2 ?? def.colour);
    for (let i = 0; i < def.shards; i++) {
      const a = this.rng.range(0, TAU);
      const sp = this.rng.range(3, 11);
      this.dirtPool.spawn({
        pos: world.clone().add(new THREE.Vector3(
          this.rng.range(-0.6, 0.6), this.rng.range(0, 0.9), this.rng.range(-0.6, 0.6))),
        vel: new THREE.Vector3(
          Math.cos(a) * sp + dir * 6, this.rng.range(3, 9), Math.sin(a) * sp),
        life: this.rng.range(0.7, 1.6),
        size: this.rng.range(0.18, 0.42), endSize: this.rng.range(0.10, 0.22),
        color: (this.rng.chance(0.5) ? c1 : c2).clone(),
        alpha: 1, gravity: 26, drag: 0.55, spin: this.rng.range(-14, 14),
        bounce: 0.32,
      });
    }
    // dust puff at the break point
    for (let i = 0; i < 6; i++) {
      this.smokePool.spawn({
        pos: world.clone(),
        vel: new THREE.Vector3(this.rng.range(-3, 3) + dir * 2,
          this.rng.range(0.5, 3), this.rng.range(-3, 3)),
        life: this.rng.range(0.4, 0.9), size: 0.6, endSize: 2.8,
        color: c1.clone().lerp(_c2.setRGB(1, 1, 1), 0.5),
        alpha: 0.45, gravity: -1, drag: 2.2,
      });
    }
    audio.bonk(0.5, clamp(dir * 0.3, -1, 1));
  }

  /** Spray thrown up by riding through water, a puddle or a snow drift. */
  private splash(r: Racer, kind: PropKind) {
    if (r.v < 4) return;
    const info = patchSurface(kind);
    if (!info) return;
    const trk = this.track;
    // slow and destabilise while in it
    r.v -= info.drag * 0.55 * this.lastDt * 6;
    r.vx *= 1 - (1 - info.grip) * 0.4 * this.lastDt * 6;

    const snow = info.spray === 'snow';
    const rate = clamp01(r.v / 26) * (snow ? 42 : 60);
    if (Math.random() > this.lastDt * rate) return;
    trk.frameAt(r.s, _f1, _f2, _f3);
    const base = trk.worldPos(r.s - 0.3, r.x, r.y + 0.1, _v1);
    for (let i = 0; i < (snow ? 2 : 3); i++) {
      this.smokePool.spawn({
        pos: base.clone().addScaledVector(_f2, this.rng.range(-0.7, 0.7)),
        vel: _f2.clone().multiplyScalar(this.rng.range(-5, 5))
          .addScaledVector(_f3, this.rng.range(2.5, 7))
          .addScaledVector(_f1, -r.v * 0.12),
        life: this.rng.range(0.4, 0.95),
        size: this.rng.range(0.3, 0.7), endSize: this.rng.range(1.4, 3.0),
        color: snow ? _c1.setRGB(0.95, 0.98, 1) : _c1.setRGB(0.72, 0.86, 0.95),
        alpha: snow ? 0.75 : 0.6, gravity: snow ? 2 : 9, drag: 1.6,
      });
    }
    if (Math.random() < this.lastDt * 5) {
      audio.scrape(snow ? 0.3 : 0.55);
    }
  }

  private knockProp(o: Obstacle, vx: number, vy: number, vs: number) {
    o.hit = 1;
    o.vx = vx; o.vy = vy; o.vs = vs;
    o.spin = (Math.random() * 2 - 1) * 9;
  }

  /**
   * Rockfall. Boulders sit dormant above the track and release when you get
   * close, rolling across your line. They telegraph with dust and a rumble
   * so it reads as a hazard to dodge rather than an ambush.
   */
  private updateRockfall(dt: number) {
    const p = this.player;
    const trk = this.track;
    const list = trk.obstacles;
    for (let i = trk.firstObstacleAfter(p.s - 20); i < list.length; i++) {
      const o = list[i];
      if (o.s > p.s + 150) break;
      if (o.type !== 'boulder' || o.gone) continue;

      // arm it when the player is closing
      if (o.roll === undefined) {
        const ds = o.s - p.s;
        if (ds > 26 && ds < 90 && Math.random() < dt * 0.9) {
          o.roll = Math.sign(o.x) === 0 ? 1 : -Math.sign(o.x);
          if (Math.abs(p.s - o.s) < 120) {
            audio.hitTaken(0.35);
            const wp = trk.worldPos(o.s, o.x, trk.heightAt(o.s, o.x) + 2, _v1).clone();
            this.popupAt(wp, 'ROCKFALL!', '#ff6a00', 22);
          }
        }
        continue;
      }

      // rolling: cross the track, gathering speed downhill
      o.ox += o.roll * 7.5 * dt;
      o.os += 5.5 * dt;
      o.rot += 4.5 * dt;
      const hw = trk.halfWidth(o.s + o.os);
      if (Math.abs(o.x + o.ox) > hw + 8) { o.gone = true; continue; }

      // dust trail
      if (Math.random() < dt * 26) {
        const wp = trk.worldPos(o.s + o.os, o.x + o.ox,
          trk.heightAt(o.s + o.os, o.x + o.ox) + 0.4, _v1);
        this.smokePool.spawn({
          pos: wp.clone(),
          vel: new THREE.Vector3(this.rng.range(-2, 2), this.rng.range(0.5, 2.5), this.rng.range(-2, 2)),
          life: this.rng.range(0.6, 1.3), size: 0.8, endSize: 3.4,
          color: _c1.setRGB(0.62, 0.56, 0.48), alpha: 0.5, gravity: -1, drag: 1.5,
        });
      }
    }
  }

  private updateProps(dt: number) {
    const p = this.player;
    let dirty = false;
    const list = this.track.obstacles;
    for (let i = this.track.firstObstacleAfter(p.s - 340); i < list.length; i++) {
      const o = list[i];
      if (o.s > p.s + 340) break;
      if (o.type === 'boulder' && o.roll !== undefined) { dirty = true; continue; }
      if (o.hit <= 0) continue;
      o.hit += dt;
      o.vy -= 26 * dt;
      o.ox += o.vx * dt; o.oy += o.vy * dt; o.os += o.vs * dt;
      o.vx *= Math.exp(-1.2 * dt); o.vs *= Math.exp(-1.2 * dt);
      if (o.oy < 0) { o.oy = 0; o.vy *= -0.3; o.vx *= 0.6; o.vs *= 0.6; if (Math.abs(o.vy) < 1) o.vy = 0; }
      dirty = true;
    }
    if (dirty) this.track.refreshProps(p.s - 340, p.s + 340);
  }

  /**
   * Look up the track for a solid hazard sitting in the player's projected
   * path and rate how urgent it is, so the HUD can warn before it's too late.
   */
  private scanHazards() {
    const p = this.player;
    const trk = this.track;
    // where will we be in ~1s if we hold this line?
    const reactDist = clamp(p.v * 1.35, 12, 55);
    let worst = 0, side = 0;
    const list = trk.obstacles;
    for (let i = trk.firstObstacleAfter(p.s + 1); i < list.length; i++) {
      const o = list[i];
      const ds = (o.s + (o.roll !== undefined ? o.os : 0)) - p.s;
      if (ds > reactDist) break;
      if (o.gone || o.mass < 100) continue;
      if (o.hit > 0 && o.roll === undefined) continue;
      const tHit = ds / Math.max(6, p.v);
      const futureX = p.x + p.vx * tHit;
      const dx = o.x - futureX;
      const reach = o.r + 0.7;
      if (Math.abs(dx) > reach + 2.2) continue;
      // if we're sailing over it, it isn't a threat
      if (!p.grounded && p.y - trk.heightAt(p.s, p.x) > 1.6) continue;
      const closeness = 1 - clamp01(ds / reactDist);
      const aim = 1 - clamp01((Math.abs(dx) - reach) / 2.2);
      const urgency = closeness * aim;
      if (urgency > worst) {
        worst = urgency;
        side = dx > 0 ? 1 : -1;   // track +x is screen-left
      }
    }
    this.hud.hazard = worst;
    // report in SCREEN space for the HUD
    this.hud.hazardSide = -side;
  }

  private checkNearMiss(dt: number) {
    this.nearMissCd -= dt;
    if (this.nearMissCd > 0) return;
    const p = this.player;
    if (p.v < 16) return;
    const list = this.track.obstacles;
    for (let i = this.track.firstObstacleAfter(p.s - 2.5); i < list.length; i++) {
      const o = list[i];
      const ds = o.s - p.s;
      if (ds > 0.5) break;
      if (o.hit > 0 || o.mass < 100) continue;
      const dx = Math.abs(o.x - p.x);
      if (dx < o.r + 2.0 && dx > o.r + 0.55) {
        this.nearMissCd = 0.6;
        this.addScore(90 * this.comboMult());
        this.boost = Math.min(100, this.boost + 7);
        this.style = Math.min(1, this.style + 0.18);
        this.popup('CLOSE SHAVE +' + Math.round(90 * this.comboMult()), 'sub', null, '#7ef7c8');
        audio.whoosh(0.7);
        this.addCombo();
        return;
      }
    }
  }

  private updateDraft(dt: number) {
    const p = this.player;
    this.drafting = false;
    for (const r of this.racers) {
      if (r.isPlayer || r.crash > 0) continue;
      const ds = r.s - p.s;
      if (ds > 2 && ds < 15 && Math.abs(r.x - p.x) < 3.0) {
        this.drafting = true;
        p.v += 4.5 * dt;
        this.boost = Math.min(100, this.boost + 7 * dt);
        this.style = Math.min(1, this.style + 0.12 * dt);
        break;
      }
    }
  }

  // -------------------------------------------------------------------------
  private scoreTrick(air: number, impact: number) {
    const spins = Math.abs(this.airSpin) / TAU;
    const flips = Math.abs(this.airFlip) / TAU;
    const nSpin = Math.floor(spins + 0.32);
    const nFlip = Math.floor(flips + 0.32);
    const pose = this.airPose;
    if (nSpin === 0 && nFlip === 0 && pose < 0.35 && air < 0.85) return;

    const parts: string[] = [];
    let pts = 0;
    if (nFlip >= 1) {
      const back = this.airFlip < 0;
      const names = back
        ? ['', 'BONKFLIP', 'DOUBLE BONKFLIP', 'TRIPLE BONKFLIP']
        : ['', 'FRONT ROLL', 'DOUBLE FRONT ROLL', 'TRIPLE FRONT ROLL'];
      parts.push(names[Math.min(nFlip, 3)]);
      pts += nFlip * nFlip * 420;
    }
    if (nSpin >= 1) {
      parts.push(`${nSpin * 360} WHIP`);
      pts += nSpin * nSpin * 300;
    }
    if (pose > 0.35) { parts.push('SUPERBONK'); pts += Math.min(pose, 2.2) * 260; }
    if (parts.length === 0 && air >= 0.85) { parts.push('BIG AIR'); pts += air * 180; }
    if (parts.length > 1) pts *= 1.6;

    const airMult = 1 + clamp01((air - 0.5) / 2.2) * 1.4;
    pts *= airMult;
    // clean landing bonus
    const clean = clamp01(1 - impact / 34);
    pts *= 0.75 + clean * 0.5;
    pts *= this.comboMult();

    const name = parts.join(' + ');
    this.tricksLanded++;
    this.addCombo();
    this.addScore(pts);
    this.boost = Math.min(100, this.boost + clamp(14 + pts / 42, 10, 42));
    this.style = 1;
    if (pts > this.bestTrickScore) { this.bestTrickScore = pts; this.bestTrick = name; }
    this.popup(`${name}  +${Math.round(pts)}`, 'trick', null, '#7ef7ff');
    audio.chime(Math.min(10, nSpin * 3 + nFlip * 4));
    audio.cheer(clamp01(pts / 1400));
  }

  /**
   * Final-stretch tension: call the run to the line, and if it's close
   * enough to be decided by inches, drop into slow motion for it.
   */
  private updateEndgame(dt: number) {
    const p = this.player;
    if (p.finished) return;
    const toGo = this.track.length - 20 - p.s;

    // announce the run home once
    const inStretch = toGo < 340 && toGo > 0;
    if (inStretch && !this.hud.finalStretch) {
      this.hud.finalStretch = true;
      this.popup('FINAL STRETCH!', 'trick', null, '#ffd400');
      audio.cheer(1.0);
      audio.chime(7);
    }
    if (!inStretch) return;

    // who else is in the fight?
    let closest: Racer | null = null, bestGap = 1e9;
    for (const r of this.racers) {
      if (r.isPlayer || r.finished || r.crash > 0) continue;
      const gap = Math.abs(r.s - p.s);
      if (gap < bestGap) { bestGap = gap; closest = r; }
    }

    // inside the last 90m with someone on your wheel -> photo finish
    if (closest && toGo < 90 && bestGap < 9 && !this.hud.photoFinish) {
      this.hud.photoFinish = true;
      this.slowmo = Math.max(this.slowmo, toGo / Math.max(8, p.v) + 0.6);
      this.popup('PHOTO FINISH!', 'trick', null, '#ff2e88');
      audio.duck(0.6, 1.4);
      audio.cheer(1.4);
      this.shakeAdd(0.4);
    }
    void dt;
  }

  /**
   * Commit-or-bail shortcut logic. You bank the saving only by riding the
   * channel from the mouth to the exit; bailing back onto the tape early
   * gives nothing, which is what makes taking one a decision.
   */
  private updateShortcuts() {
    const p = this.player;
    const trk = this.track;
    const here = trk.shortcutAt(p.s, p.x);

    if (!this.scActive) {
      if (here && p.s < here.s0 + 40) {
        this.scActive = { sc: here, entered: p.s };
        this.popup(`${here.name}!`, 'sub', null, '#c0f000');
        audio.whoosh(0.9);
        this.style = Math.min(1, this.style + 0.25);
      }
      return;
    }

    const sc = this.scActive.sc;
    // made it through
    if (p.s >= sc.s1 - 2) {
      const saved = sc.saving;
      p.s += saved;
      this.shortcutsHit++;
      this.addCombo();
      const pts = 340 * this.comboMult();
      this.addScore(pts);
      this.boost = Math.min(100, this.boost + 26);
      this.style = 1;
      this.popup(`SHORTCUT!  −${saved.toFixed(0)}m  +${Math.round(pts)}`, 'trick', null, '#c0f000');
      audio.chime(9);
      audio.cheer(0.8);
      this.scActive = null;
      return;
    }
    // bailed back onto the racing line, or crashed out of it
    const bailed = p.crash > 0
      || Math.abs(p.x) < trk.halfWidth(p.s) - 1.5
      || Math.sign(p.x) !== sc.side;
    if (bailed) {
      this.popup('BAILED OUT', 'sub', null, '#ff9500');
      this.scActive = null;
    }
  }

  private comboMult() { return 1 + this.combo * 0.35; }
  private addCombo() {
    this.combo++;
    this.comboTime = 3.4;
  }
  private breakCombo() { this.combo = 0; this.comboTime = 0; }
  private addScore(v: number) { this.score += v; }

  // -------------------------------------------------------------------------
  private poseRacer(r: Racer, dt: number, steerInput: number) {
    const trk = this.track;
    const rig = r.rig;
    const fwd = _f1, right = _f2, up = _f3;
    trk.frameAt(r.s, fwd, right, up);
    // suspension spring
    r.suspV += (-r.suspension * 210 - r.suspV * 19) * dt;
    r.suspension += r.suspV * dt;
    r.suspension = clamp(r.suspension, -0.42, 0.28);

    const pos = trk.worldPos(r.s, r.x, r.y + 0.02 + r.suspension * 0.5, _v1);
    rig.root.position.copy(pos);

    // orientation: track frame + yaw drift
    const driftYaw = Math.atan2(r.vx, Math.max(6, r.v));
    r.yaw = damp(r.yaw, clamp(driftYaw * (r.grounded ? 1.25 : 0.7), -0.85, 0.85), 9, dt);
    const m = _m1.makeBasis(right, up, fwd);
    _q1.setFromRotationMatrix(m);
    _q2.setFromAxisAngle(_yAxis, -r.yaw);
    _q1.multiply(_q2);
    rig.root.quaternion.copy(_q1);

    // lean
    const curv = trk.curvatureAt(r.s);
    const targetLean = clamp(
      (curv * r.v * r.v * 0.021 + steerInput * 0.16 + r.vx * 0.028) * r.stLean,
      -0.62, 0.62);
    r.leanV += (targetLean - r.lean) * 46 * dt - r.leanV * 9 * dt;
    r.lean += r.leanV * dt;
    r.lean = clamp(r.lean, -0.95, 0.95);
    rig.lean.rotation.z = -r.lean;

    // Body pitch: the chassis rides the line between the two contact patches,
    // plus a small vertical-velocity lean. This is what makes the bike look
    // like it's rolling over terrain instead of sliding along a curve.
    const pitchTarget = (r.grounded ? clamp(-r.vy * 0.012, -0.16, 0.16) : clamp(-r.vy * 0.016, -0.3, 0.3))
      - r.chassisPitch;
    rig.body.rotation.x = damp(rig.body.rotation.x, pitchTarget, 14, dt);
    rig.body.position.y = r.suspension * 0.35;

    // ---- suspension travel ---------------------------------------------
    // The frame drops with `suspension`; the fork lowers and swingarm move
    // the opposite way by the same amount, so the wheels stay planted while
    // the bike visibly squats into hits.
    // Differential travel: the end carrying the load compresses more, so a
    // nose-down attitude dives the fork and a nose-up squats the shock.
    const comp = -r.suspension;                        // >0 when compressed
    const bias = clamp(r.chassisPitch * 1.5, -0.5, 0.5);
    const travel = clamp((comp + Math.max(0, -bias) * 0.16) * 0.5, -0.035, 0.13);
    rig.forkLower.position.copy(FORK_AXIS).multiplyScalar(-travel);
    const swing = clamp((comp + Math.max(0, bias) * 0.16) * 0.38, -0.03, 0.15);
    rig.swingarm.rotation.x = swing;
    // re-aim the coil shock between its frame and swingarm mounts
    _v3.copy(SHOCK_LOWER).applyAxisAngle(_xAxis, swing).add(BB_POS);
    _v4.subVectors(_v3, SHOCK_UPPER);
    const shockLen = _v4.length() || SHOCK_BASE_LEN;
    rig.shock.position.copy(SHOCK_UPPER).addScaledVector(_v4, 0.5);
    rig.shock.quaternion.setFromUnitVectors(_yAxis, _v4.divideScalar(shockLen));
    rig.shock.scale.y = shockLen / SHOCK_BASE_LEN;

    // trick rotations for the player
    if (r.isPlayer) {
      rig.spin.rotation.y = damp(rig.spin.rotation.y, this.airSpin, 30, dt);
      rig.flip.rotation.x = damp(rig.flip.rotation.x, this.airFlip, 26, dt);
      // superman pose stacks on top of the weight shift
      const poseAmt = clamp01(this.airPose * 3);
      rig.rider.position.z = damp(rig.rider.position.z,
        -poseAmt * 0.62 + r.weight * 0.17, 12, dt);
      rig.rider.position.y = damp(rig.rider.position.y,
        poseAmt * 0.26 - clamp01(-r.weight) * 0.07, 12, dt);
      rig.legL.rotation.x = damp(rig.legL.rotation.x, poseAmt * 1.35, 12, dt);
      rig.legR.rotation.x = damp(rig.legR.rotation.x, poseAmt * 1.35, 12, dt);
      // torso pitch is resolved below, together with the weight shift
    } else if (!r.grounded && r.airTime > 0.35) {
      // rivals throw a little style too
      rig.flip.rotation.x = damp(rig.flip.rotation.x, -Math.min(r.airTime, 0.9) * 0.55, 8, dt);
    } else {
      rig.flip.rotation.x = damp(rig.flip.rotation.x, 0, 9, dt);
      rig.spin.rotation.y = damp(rig.spin.rotation.y, 0, 9, dt);
    }
    if (!r.isPlayer) {
      rig.rider.position.z = damp(rig.rider.position.z, r.weight * 0.17, 10, dt);
      rig.rider.position.y = damp(rig.rider.position.y,
        -clamp01(-r.weight) * 0.07, 10, dt);
    }
    // hips drop and the chest comes up as the rider gets behind the saddle
    if (r.crash <= 0) {
      rig.torso.rotation.x = damp(rig.torso.rotation.x,
        clamp01(-r.weight) * 0.26 - clamp01(r.weight) * 0.20
        + (r.isPlayer ? clamp01(this.airPose * 3) * 0.5 : 0), 7, dt);
    }

    // crash tumble
    if (r.crash > 0) {
      const rd = r.ragdoll;
      if (rd) {
        // each axis is driven independently, so the cause is legible from
        // the silhouette: pitch = over the bars, roll = bonked sideways
        rig.flip.rotation.x = rd.pitch;
        rig.spin.rotation.y = rd.yaw;
        rig.lean.rotation.z = rd.roll;
        rig.body.rotation.x = 0;
        // limbs flail, damping out as the rider comes to rest
        const flail = (1 - clamp01(rd.t / rd.duration)) * 1.5;
        const w = this.time * 17;
        rig.armL.rotation.z = Math.sin(w) * flail;
        rig.armR.rotation.z = Math.sin(w + 2.1) * -flail;
        rig.armL.rotation.x = Math.cos(w * 0.8) * flail * 0.7;
        rig.armR.rotation.x = Math.cos(w * 0.8 + 1.4) * flail * 0.7;
        rig.legL.rotation.x = Math.sin(w * 0.7 + 1) * flail * 0.9;
        rig.legR.rotation.x = Math.sin(w * 0.7 + 3) * flail * 0.9;
        rig.head.rotation.x = Math.sin(w * 0.6) * flail * 0.5;
        // the bike leaves without you
        if (rd.bike.active) {
          rig.bike.position.set(rd.bike.ox, rd.bike.oy, rd.bike.os);
          rig.bike.rotation.set(rd.bike.spin, rd.bike.spin * 0.6, rd.bike.spin * 0.9);
        }
      } else {
        rig.flip.rotation.x = r.crashSpin * 1.3;
        rig.spin.rotation.y = r.crashSpin * 0.55;
        rig.lean.rotation.z = Math.sin(r.crashSpin) * 0.95;
        rig.body.rotation.x = 0;
      }
    } else if (rig.bike.position.lengthSq() > 0.0001) {
      // remounted: bring the bike back under the rider
      rig.bike.position.set(0, 0, 0);
      rig.bike.rotation.set(0, 0, 0);
    }

    // steering + wheels
    r.steerVis = damp(r.steerVis, clamp(steerInput * 0.42 + r.yaw * 0.5, -0.6, 0.6), 12, dt);
    rig.fork.rotation.y = r.steerVis;
    r.wheelSpin += r.v * dt / 0.36;
    rig.frontWheel.rotation.x = r.wheelSpin;
    rig.rearWheel.rotation.x = r.wheelSpin;
    // ---- drivetrain + legs -------------------------------------------
    // Coasting settles the cranks level (feet balanced on the pedals, the
    // downhill attack stance); pedalling cycles the legs against them.
    if (r.pedalling > 0.02) {
      rig.cranks.rotation.x = r.crankAngle;
    } else {
      const level = Math.round(r.crankAngle / Math.PI) * Math.PI;
      r.crankAngle = damp(r.crankAngle, level, 7, dt);
      rig.cranks.rotation.x = r.crankAngle;
    }
    if (r.crash <= 0) {
      // left crank sits half a revolution behind the right
      const cyc = r.pedalling;
      const phL = r.crankAngle + Math.PI;
      const phR = r.crankAngle;
      // suspension compression pulls the knees up a touch
      const absorb = -r.suspension * 0.55;
      const poseAmt = r.isPlayer ? clamp01(this.airPose * 3) : 0;
      if (poseAmt < 0.05) {
        const thigh = 0.30, knee = 0.55;
        rig.legL.rotation.x = Math.cos(phL) * thigh * cyc + absorb;
        rig.legR.rotation.x = Math.cos(phR) * thigh * cyc + absorb;
        rig.shinL.rotation.x = -(Math.cos(phL - 1.2) * 0.5 + 0.5) * knee * cyc - absorb * 0.8;
        rig.shinR.rotation.x = -(Math.cos(phR - 1.2) * 0.5 + 0.5) * knee * cyc - absorb * 0.8;
      }
    }

    // bonk swing animation
    if (r.bonkSwing > 0) {
      r.bonkSwing -= dt * 4.2;
      const t = clamp01(r.bonkSwing);
      const swing = Math.sin(t * Math.PI) * 1.55 * r.bonkDir;
      const arm = r.bonkDir < 0 ? rig.armL : rig.armR;
      arm.rotation.z = -swing;
      arm.rotation.y = swing * 0.6;
      rig.torso.rotation.y = swing * 0.32;
    } else {
      // Hands stay on the grips: as the fork turns, the inside arm pulls back
      // and the outside arm pushes out. Without this the bars rotate away
      // from the hands and the whole rig reads as detached.
      const st = r.steerVis;
      rig.armL.rotation.y = damp(rig.armL.rotation.y, -st * 0.34, 12, dt);
      rig.armR.rotation.y = damp(rig.armR.rotation.y, -st * 0.34, 12, dt);
      rig.armL.rotation.z = damp(rig.armL.rotation.z, st * 0.20, 12, dt);
      rig.armR.rotation.z = damp(rig.armR.rotation.z, st * 0.20, 12, dt);
      // shoulders counter-rotate slightly into the turn
      rig.torso.rotation.y = damp(rig.torso.rotation.y, -st * 0.16, 9, dt);
    }

    // ---- head: look where you're going, not where the bike points -----
    const lookTarget = r.crash > 0
      ? 0
      : clamp((-trk.curvatureAt(r.s + 20 + r.v * 0.5) * 34 - r.yaw * 0.5) * r.stHead,
        -0.75, 0.75);
    r.headYaw = damp(r.headYaw, lookTarget, 5 * r.stTwitch, dt);
    rig.head.rotation.y = r.headYaw;
    // and tip the chin up over jumps
    rig.head.rotation.x = damp(rig.head.rotation.x,
      r.grounded ? 0 : clamp(-r.vy * 0.012, -0.22, 0.22), 6, dt);

    // shadow
    const gh = trk.heightAt(r.s, r.x);
    const sPos = trk.worldPos(r.s, r.x, gh + 0.05, _v2);
    rig.shadow.position.copy(sPos);
    rig.shadow.quaternion.setFromRotationMatrix(_m1.makeBasis(right, up, fwd));
    rig.shadow.rotateX(-Math.PI / 2);
    const airH = clamp01((r.y - gh) / 8);
    const sc = 1 + airH * 1.7;
    rig.shadow.scale.set(sc, sc, 1);
    (rig.shadow.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - airH * 0.72);

    // ---- per-wheel contact patches -------------------------------------
    // These sit at the real axle offsets and conform to the ground, so the
    // bike reads as planted rather than floating over a single blob.
    const lift = clamp01((r.y - gh) / 1.1);          // tight fade with height
    const contactOn = r.crash <= 0 && lift < 1;
    const place = (m: THREE.Mesh, ds: number, spread: number) => {
      m.visible = contactOn;
      if (!contactOn) return;
      const cs = r.s + ds;
      const cx = r.x;
      const cy = trk.heightAt(cs, cx);
      m.position.copy(trk.worldPos(cs, cx, cy + 0.04, _v3));
      trk.frameAt(cs, _f1, _f2, _f3);
      m.quaternion.setFromRotationMatrix(_m1.makeBasis(_f2, _f3, _f1));
      m.rotateX(-Math.PI / 2);
      // smears out and softens as the wheel unweights
      const s2 = spread * (1 + lift * 1.6);
      m.scale.set(s2, s2 * (1 + Math.abs(r.vx) * 0.02), 1);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - lift) * (1 - lift);
    };
    place(rig.contactF, 0.60, 1);
    place(rig.contactR, -0.62, 1.1);
  }

  // -------------------------------------------------------------------------
  private playerFx(r: Racer, dt: number, inp: { steer: number; brake: boolean; boost: boolean }, surf: { roost: number; kind: string }) {
    const trk = this.track;
    const zone = trk.zoneAt(r.s);
    const dirtColor = _c1.setHex(zone.dirt);

    // roost from rear wheel — volume is a property of the state
    const stRoost = roostFactor(r.state);
    if (stRoost > 0 && r.v > 4) {
      const slip = Math.abs(r.vx) + Math.abs(inp.steer) * r.v * 0.14;
      const rate = (2 + slip * 2.4 + r.v * 0.5) * surf.roost * stRoost;
      this.roostAccum += rate * dt;
      const rear = trk.worldPos(r.s - 0.7, r.x, r.y + 0.15, _v1);
      trk.frameAt(r.s, _f1, _f2, _f3);
      while (this.roostAccum > 1) {
        this.roostAccum -= 1;
        const spread = 0.5 + slip * 0.06;
        const vel = _v2.copy(_f1).multiplyScalar(-r.v * this.rng.range(0.14, 0.42))
          .addScaledVector(_f2, this.rng.range(-spread, spread) * 3 - Math.sign(r.vx) * Math.abs(r.vx) * 0.34)
          .addScaledVector(_f3, this.rng.range(1.6, 5.4));
        this.dirtPool.spawn({
          pos: rear.clone().addScaledVector(_f2, this.rng.range(-0.3, 0.3)),
          vel: vel.clone(), life: this.rng.range(0.45, 1.05),
          size: this.rng.range(0.12, 0.4), endSize: this.rng.range(0.05, 0.16),
          color: dirtColor.clone().multiplyScalar(this.rng.range(0.6, 1.15)),
          alpha: 1, gravity: 22, drag: 0.9, spin: this.rng.range(-8, 8),
        });
      }
      // dust cloud
      if (r.v > 12 && Math.random() < dt * (10 + r.v * 0.9) * surf.roost) {
        this.smokePool.spawn({
          pos: rear.clone().addScaledVector(_f2, this.rng.range(-0.8, 0.8)),
          vel: _v2.copy(_f1).multiplyScalar(-r.v * 0.10).addScaledVector(_f3, this.rng.range(0.4, 1.6)).clone(),
          life: this.rng.range(0.6, 1.4), size: this.rng.range(0.9, 1.8), endSize: this.rng.range(3.2, 6),
          color: dirtColor.clone().lerp(_c2.setRGB(1, 0.96, 0.86), 0.45),
          endColor: dirtColor.clone().lerp(_c2.setRGB(1, 1, 1), 0.7),
          alpha: 0.34, gravity: -1.2, drag: 1.5,
        });
      }
    }

    // mud splatter
    if (surf.kind === 'mud' && r.grounded && r.v > 8 && Math.random() < dt * 24) {
      const rear = trk.worldPos(r.s - 0.6, r.x, r.y + 0.1, _v1);
      trk.frameAt(r.s, _f1, _f2, _f3);
      this.dirtPool.spawn({
        pos: rear.clone(), vel: _f3.clone().multiplyScalar(this.rng.range(3, 8)).addScaledVector(_f2, this.rng.range(-3, 3)),
        life: 0.8, size: 0.34, endSize: 0.1, color: _c2.setHex(0x3a3021), alpha: 1, gravity: 24, drag: 0.7,
      });
    }

    // boost fire
    if (inp.boost) {
      trk.frameAt(r.s, _f1, _f2, _f3);
      const back = trk.worldPos(r.s - 1.0, r.x, r.y + 0.4, _v1);
      for (let i = 0; i < 2; i++) {
        this.sparkPool.spawn({
          pos: back.clone().addScaledVector(_f2, this.rng.range(-0.4, 0.4)).addScaledVector(_f3, this.rng.range(0, 0.5)),
          vel: _f1.clone().multiplyScalar(-this.rng.range(4, 14)).addScaledVector(_f3, this.rng.range(0.5, 2.4)),
          life: this.rng.range(0.18, 0.42), size: this.rng.range(0.5, 1.3), endSize: 0.05,
          color: _c2.setRGB(1, this.rng.range(0.5, 0.9), 0.15),
          endColor: _c1.setRGB(1, 0.15, 0.0),
          alpha: 0.95, gravity: -4, drag: 2.2,
        });
      }
    }

    // wind motes rushing past camera
    this.moteAccum += dt * clamp01(r.v / 20) * 34;
    while (this.moteAccum > 1) {
      this.moteAccum -= 1;
      const ahead = trk.worldPos(r.s + this.rng.range(14, 40), r.x + this.rng.range(-14, 14),
        this.track.heightAt(r.s + 20, r.x) + this.rng.range(0.5, 9), new THREE.Vector3());
      trk.frameAt(r.s, _f1, _f2, _f3);
      this.smokePool.spawn({
        pos: ahead, vel: _f1.clone().multiplyScalar(-this.rng.range(1, 5)),
        life: this.rng.range(0.7, 1.5), size: 0.05, endSize: 0.02,
        color: _c2.setRGB(1, 0.98, 0.9), alpha: 0.5, gravity: 0.4, drag: 0.2,
      });
    }
    void dt;
  }

  private aiFx(r: Racer, dt: number, surf: { roost: number }) {
    if (!r.grounded || r.v < 8) return;
    const dist = Math.abs(r.s - this.player.s);
    if (dist > 90) return;
    if (Math.random() > dt * (7 + r.v * 0.5) * surf.roost) return;
    const trk = this.track;
    const zone = trk.zoneAt(r.s);
    trk.frameAt(r.s, _f1, _f2, _f3);
    const rear = trk.worldPos(r.s - 0.7, r.x, r.y + 0.15, _v1);
    this.dirtPool.spawn({
      pos: rear.clone(),
      vel: _f1.clone().multiplyScalar(-r.v * 0.2).addScaledVector(_f3, this.rng.range(1.5, 4)).addScaledVector(_f2, this.rng.range(-1.5, 1.5)),
      life: this.rng.range(0.4, 0.9), size: this.rng.range(0.12, 0.3), endSize: 0.06,
      color: _c1.setHex(zone.dirt).multiplyScalar(this.rng.range(0.7, 1.1)),
      alpha: 1, gravity: 22, drag: 0.9, spin: this.rng.range(-6, 6),
    });
  }

  private spawnLandingBurst(r: Racer, amount: number) {
    const trk = this.track;
    trk.frameAt(r.s, _f1, _f2, _f3);
    const zone = trk.zoneAt(r.s);
    const base = trk.worldPos(r.s, r.x, r.y + 0.1, _v1);
    const n = Math.floor(10 + amount * 40);
    for (let i = 0; i < n; i++) {
      const a = this.rng.range(0, TAU);
      const sp = this.rng.range(2, 9) * (0.5 + amount);
      this.dirtPool.spawn({
        pos: base.clone(),
        vel: _f2.clone().multiplyScalar(Math.cos(a) * sp).addScaledVector(_f1, Math.sin(a) * sp * 0.7).addScaledVector(_f3, this.rng.range(1, 6)),
        life: this.rng.range(0.4, 1.1), size: this.rng.range(0.12, 0.36), endSize: 0.05,
        color: _c1.setHex(zone.dirt).multiplyScalar(this.rng.range(0.7, 1.2)),
        alpha: 1, gravity: 24, drag: 0.8, spin: this.rng.range(-9, 9),
      });
    }
    for (let i = 0; i < 8 + amount * 14; i++) {
      const a = this.rng.range(0, TAU);
      this.smokePool.spawn({
        pos: base.clone().addScaledVector(_f2, Math.cos(a) * this.rng.range(0, 1.4)),
        vel: _f2.clone().multiplyScalar(Math.cos(a) * this.rng.range(1, 5)).addScaledVector(_f1, Math.sin(a) * 2).addScaledVector(_f3, this.rng.range(0.2, 1.6)),
        life: this.rng.range(0.7, 1.6), size: this.rng.range(0.8, 1.6), endSize: this.rng.range(3.5, 7),
        color: _c1.setHex(zone.dirt).lerp(_c2.setRGB(1, 0.97, 0.88), 0.5),
        alpha: 0.4 * (0.4 + amount), gravity: -1, drag: 1.6,
      });
    }
  }

  private spawnImpactBurst(world: THREE.Vector3, dir: number, power: number) {
    for (let i = 0; i < 22; i++) {
      const a = this.rng.range(0, TAU), b = this.rng.range(-0.4, 1);
      this.sparkPool.spawn({
        pos: world.clone(),
        vel: new THREE.Vector3(Math.cos(a) * 6 * power + dir * 5, b * 8 + 3, Math.sin(a) * 6 * power),
        life: this.rng.range(0.16, 0.42), size: this.rng.range(0.25, 0.9), endSize: 0.02,
        color: _c1.setRGB(1, this.rng.range(0.8, 1), this.rng.range(0.3, 0.7)),
        endColor: _c2.setRGB(1, 0.35, 0.05),
        alpha: 1, gravity: 12, drag: 1.6,
      });
    }
    for (let i = 0; i < 10; i++) {
      this.smokePool.spawn({
        pos: world.clone(),
        vel: new THREE.Vector3(this.rng.range(-4, 4) + dir * 3, this.rng.range(0, 5), this.rng.range(-4, 4)),
        life: this.rng.range(0.3, 0.7), size: 0.5, endSize: 2.6,
        color: _c1.setRGB(1, 0.95, 0.85), alpha: 0.5, gravity: -1, drag: 2.4,
      });
    }
  }

  private spawnCrashDebris(r: Racer, count = 34) {
    const trk = this.track;
    const base = trk.worldPos(r.s, r.x, r.y + 0.5, _v1);
    const zone = trk.zoneAt(r.s);
    for (let i = 0; i < count; i++) {
      const a = this.rng.range(0, TAU);
      this.dirtPool.spawn({
        pos: base.clone(),
        vel: new THREE.Vector3(Math.cos(a) * this.rng.range(2, 11), this.rng.range(2, 11), Math.sin(a) * this.rng.range(2, 11)),
        life: this.rng.range(0.5, 1.3), size: this.rng.range(0.15, 0.45), endSize: 0.06,
        color: _c1.setHex(zone.dirt).multiplyScalar(this.rng.range(0.6, 1.2)),
        alpha: 1, gravity: 25, drag: 0.7, spin: this.rng.range(-12, 12),
      });
    }
  }

  // -------------------------------------------------------------------------
  /** Tear down the current course and generate a different mountain. */
  loadMountain(id: string) {
    const m = getMountain(id);
    if (this.mountainId === id && this.track) return;
    this.mountainId = id;

    this.scene.remove(this.track.group);
    this.track.group.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach(x => x.dispose());
      else mat?.dispose();
    });

    this.track = m.authored
      ? new Track(m.seed, m.length, SHALEBACK_SECTIONS, SHALEBACK_SETPIECES)
      : new Track(m.seed, m.length);
    this.scene.add(this.track.build());
    this.lastZone = -1;
    this.menuTime = 0;
    this.resetRace();
    this.updateCamera(0.016, true);
  }

  /**
   * Apply a garage loadout: swap the player's rig for one wearing the chosen
   * cosmetics, and install the derived performance multipliers.
   */
  applyLoadout(l: Loadout) {
    this.perf = computePerf(l);
    const p = this.player;
    if (!p) return;
    const bike = getBike(l.bike);
    // heft drives collision mass: a SLAB HEAVY under GRUD genuinely
    // out-muscles a WISP CARBON in a shoulder-check
    p.mass = riderMass(bike.base.land + bike.base.bonk, bike.base.bonk);
    const old = p.rig;
    this.scene.remove(old.root, old.shadow, old.contactF, old.contactR);
    old.root.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach(x => x.dispose());
      else mat?.dispose();
    });
    const rig = createRider(loadoutColors(l));
    rig.frontWheel.scale.setScalar(bike.wheelScale);
    rig.rearWheel.scale.setScalar(bike.wheelScale);
    rig.bike.scale.set(bike.tubeScale * 0.5 + 0.5, 1, 1);
    this.scene.add(rig.root, rig.shadow, rig.contactF, rig.contactR);
    p.rig = rig;
  }

  /**
   * The cold open. Riders are frozen on the gate while the camera does the
   * talking; a rival rolls up, they trade a look, he goes, and you get about
   * a second to answer before the count. Nailing that window is the first
   * mechanic the game teaches, and it teaches it by making you do it.
   */
  private updateIntro(dt: number) {
    const t = this.introT;
    const p = this.player;
    const h = this.hud;
    h.introT = t;
    h.introFade = clamp01(t / 1.1);

    // --- the rival who challenges you is whoever starts nearest
    const foe = this.racers.find(r => !r.isPlayer)!;

    // ---------- staging ----------
    if (t < INTRO.jump) {
      // everyone held on the line
      for (const r of this.racers) { r.v = 0; r.vx = 0; r.vy = 0; }
      // rival slides up beside the player
      if (t > INTRO.rival) {
        const k = clamp01((t - INTRO.rival) / 1.5);
        foe.s = lerp(p.s - 7, p.s + 0.35, smootherstep(k));
        foe.x = lerp(p.x + 6.5, p.x + 2.5, smootherstep(k));
        foe.y = this.track.heightAt(foe.s, foe.x);
        foe.wheelSpin += (1 - k) * 7 * dt;
      }
      // the look: both heads turn toward each other
      if (t > INTRO.glance) {
        const k = clamp01((t - INTRO.glance) / 0.5);
        p.headYaw = damp(p.headYaw, -0.85 * k, 7, dt);
        foe.headYaw = damp(foe.headYaw, 0.85 * k, 7, dt);
      }
    }

    // ---------- rival launches ----------
    if (t >= INTRO.jump && t < INTRO.count) {
      if (!this.introFired) {
        this.introFired = true;
        audio.hop();
        audio.whoosh(1.2);
        foe.pedalling = 1;
      }
      // he actually rides away, so the threat is real
      foe.v = Math.min(16, foe.v + 17 * dt);
      foe.s += foe.v * dt;
      foe.y = this.track.heightAt(foe.s, foe.x);
      foe.crankAngle += 11 * dt;
      foe.wheelSpin += foe.v * dt / 0.36;
      p.headYaw = damp(p.headYaw, -0.5, 6, dt);
    }

    // ---------- reaction window ----------
    const inWindow = t >= INTRO.react && t < INTRO.react + 1.0;
    h.reactWindow = inWindow ? 1 - (t - INTRO.react) / 1.0 : 0;
    if (inWindow && !this.introReacted) {
      if (this.tap('KeyW', 'ArrowUp', 'Space')) {
        this.introReacted = true;
        h.holeshot = true;
        audio.chime(8);
        audio.cheer(0.7);
        this.shakeAdd(0.35);
      }
    }

    // ---------- text beats ----------
    if (t < INTRO.rival) {
      h.introLine = '';
      h.introSub = getMountain(this.mountainId).name;
    } else if (t < INTRO.jump) {
      h.introLine = '';
      h.introSub = `${foe.name} SIZES YOU UP`;
    } else if (t < INTRO.count) {
      h.introLine = h.holeshot ? 'GO!' : 'READY…';
      h.introSub = h.holeshot ? 'HOLESHOT' : 'HIT THROTTLE';
    } else if (t < INTRO.send) {
      const n = 3 - Math.floor(t - INTRO.count);
      h.introLine = String(Math.max(1, n));
      h.introSub = '';
      if (n !== this.introCount && n >= 1 && n <= 3) {
        this.introCount = n;
        audio.countBeep(false);
      }
    } else {
      h.introLine = 'SEND IT.';
      h.introSub = '';
      if (!this.introSent) {
        this.introSent = true;
        audio.countBeep(true);
        audio.cheer(1.4);
        audio.duck(0.7, 1.2);
        this.shakeAdd(0.9);
        // holeshot reward: a real head start you earned
        if (h.holeshot) {
          this.boost = Math.min(100, this.boost + 45);
          this.player.v = 9;
          this.popup('HOLESHOT!', 'trick', null, '#c0f000');
          this.addScore(250);
        }
      }
    }

    // ---------- camera ----------
    this.introCamera(t, dt);

    if (t >= INTRO.end) {
      h.introLine = ''; h.introSub = ''; h.reactWindow = 0;
      this.frozen = false;
      this.goFlash = 0.5;
      this.setPhase('race');
    }
  }

  private introCamera(t: number, dt: number) {
    const trk = this.track;
    const p = this.player;
    const first = t < dt * 2;
    const rate = first ? 999 : 3.2;
    let cs: number, cx: number, ch: number, ls: number, lx: number, lh: number, fov: number;

    if (t < INTRO.swing) {
      // low and in front, looking back up at the rider against the sky
      const k = clamp01(t / INTRO.swing);
      cs = p.s + lerp(9, 5.5, k);
      cx = p.x + lerp(3.4, 1.6, k);
      ch = lerp(0.6, 1.5, k);
      ls = p.s; lx = p.x; lh = 1.5;
      fov = lerp(42, 50, k);
    } else if (t < INTRO.rival) {
      // swing around behind, revealing the drop
      const k = smootherstep(clamp01((t - INTRO.swing) / (INTRO.rival - INTRO.swing)));
      const a = lerp(0, Math.PI, k);
      cs = p.s + Math.cos(a) * 6.5;
      cx = p.x + Math.sin(a) * 5.0;
      ch = lerp(1.5, 3.1, k);
      ls = p.s + 14; lx = p.x; lh = 0.4;
      fov = lerp(50, 62, k);
    } else if (t < INTRO.jump) {
      // two-shot: both riders in frame
      cs = p.s - 5.4; cx = p.x - 1.4; ch = 2.5;
      ls = p.s + 3; lx = p.x + 1.6; lh = 1.5;
      fov = 52;
    } else if (t < INTRO.send) {
      // settle into the race chase
      const k = smootherstep(clamp01((t - INTRO.jump) / (INTRO.send - INTRO.jump)));
      cs = lerp(p.s - 5.4, p.s - 7.6, k);
      cx = lerp(p.x - 1.4, p.x * 0.62, k);
      ch = lerp(2.5, 2.9, k);
      ls = lerp(p.s + 3, p.s + 12, k); lx = p.x * 0.55; lh = lerp(1.5, 1.9, k);
      fov = lerp(52, 66, k);
    } else {
      // punch in on the launch
      cs = p.s - 7.0; cx = p.x * 0.62; ch = 2.8;
      ls = p.s + 13; lx = p.x * 0.55; lh = 1.9;
      fov = 72;
    }

    const want = trk.worldPos(cs, cx, trk.heightAt(cs, cx) + ch, _v1);
    this.camPos.x = damp(this.camPos.x, want.x, rate, dt);
    this.camPos.y = damp(this.camPos.y, want.y, rate, dt);
    this.camPos.z = damp(this.camPos.z, want.z, rate, dt);
    const look = trk.worldPos(ls, lx, trk.heightAt(ls, lx) + lh, _v2);
    this.camLook.x = damp(this.camLook.x, look.x, first ? 999 : 4.5, dt);
    this.camLook.y = damp(this.camLook.y, look.y, first ? 999 : 4.5, dt);
    this.camLook.z = damp(this.camLook.z, look.z, first ? 999 : 4.5, dt);

    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.6);
      const m = this.shake * this.shake * 0.9;
      this.camera.position.x += (Math.random() * 2 - 1) * m;
      this.camera.position.y += (Math.random() * 2 - 1) * m;
    }
    this.camera.lookAt(this.camLook);
    this.camRoll = damp(this.camRoll, t < INTRO.swing ? 0.05 : 0, 3, dt);
    this.camera.rotateZ(this.camRoll);
    this.fov = damp(this.fov, fov, 4, dt);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
  }

  /** Slow cinematic sweep down the mountain behind the main menu. */
  private cinematicCamera(dt: number) {
    const trk = this.track;
    this.menuTime += dt;
    const loop = 74;
    const t = (this.menuTime % loop) / loop;
    const s = 40 + t * (this.track.length - 260);
    const wob = Math.sin(this.menuTime * 0.42);
    const hw = trk.halfWidth(s);
    const x = wob * hw * 0.75;
    const h = trk.heightAt(s, x) + 5.4 + Math.sin(this.menuTime * 0.31) * 2.2;
    const want = trk.worldPos(s, x, h, _v1);
    const first = this.menuTime < dt * 2;
    const rate = first ? 999 : 1.6;
    this.camPos.x = damp(this.camPos.x, want.x, rate, dt);
    this.camPos.y = damp(this.camPos.y, want.y, rate, dt);
    this.camPos.z = damp(this.camPos.z, want.z, rate, dt);
    const lookS = s + 40;
    const lookWant = trk.worldPos(lookS, x * 0.3, trk.heightAt(lookS, 0) + 2, _v2);
    this.camLook.x = damp(this.camLook.x, lookWant.x, first ? 999 : 1.8, dt);
    this.camLook.y = damp(this.camLook.y, lookWant.y, first ? 999 : 1.8, dt);
    this.camLook.z = damp(this.camLook.z, lookWant.z, first ? 999 : 1.8, dt);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.camRoll = damp(this.camRoll, wob * 0.04, 2, dt);
    this.camera.rotateZ(this.camRoll);
    this.fov = damp(this.fov, 58, 2, dt);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
  }

  private updateCamera(dt: number, snap: boolean) {
    if (this.hud.phase === 'menu') { this.cinematicCamera(dt); return; }
    if (this.hud.phase === 'intro') return;   // the cold open drives it
    if (this.replayData && this.hud.phase === 'finish') return;  // replay drives it
    const trk = this.track;
    const p = this.player;
    const speed01 = clamp01(p.v / 42);
    const air = clamp01(p.airTime / 1.4);
    const gh = trk.heightAt(p.s, p.x);
    const aboveGround = clamp(p.y - gh, 0, 22);

    // a crash is worth watching: pull back and up so the tumble is in frame
    const crashK = p.crash > 0 ? clamp01(p.crash / Math.max(0.4, p.crashMax)) : 0;
    const back = 7.6 + speed01 * 3.6 + air * 2.6 + (this.boosting ? -0.8 : 0)
      + crashK * 3.4;
    const height = 2.75 + speed01 * 0.5 + air * 1.5 + aboveGround * 0.55
      + crashK * 2.2;
    const camS = p.s - back;
    const camX = p.x * 0.62;
    const camH = trk.heightAt(camS, camX) + height;

    const want = trk.worldPos(camS, camX, camH, _v1);
    if (snap) this.camPos.copy(want);
    else {
      const rate = this.hud.phase === 'race' ? 11 : 6;
      this.camPos.x = damp(this.camPos.x, want.x, rate, dt);
      this.camPos.y = damp(this.camPos.y, want.y, rate * 0.85, dt);
      this.camPos.z = damp(this.camPos.z, want.z, rate, dt);
    }

    // look target
    const lookS = p.s + 9 + p.v * 0.28;
    const lookX = p.x * 0.55;
    const lookH = trk.heightAt(lookS, lookX) + 1.9 + aboveGround * 0.45;
    const lookWant = trk.worldPos(lookS, lookX, lookH, _v2);
    if (snap) this.camLook.copy(lookWant);
    else {
      this.camLook.x = damp(this.camLook.x, lookWant.x, 8, dt);
      this.camLook.y = damp(this.camLook.y, lookWant.y, 7, dt);
      this.camLook.z = damp(this.camLook.z, lookWant.z, 8, dt);
    }

    this.camera.position.copy(this.camPos);
    // shake
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.6);
      const m = this.shake * this.shake * 0.9;
      this.camera.position.x += (Math.random() * 2 - 1) * m;
      this.camera.position.y += (Math.random() * 2 - 1) * m;
      this.camera.position.z += (Math.random() * 2 - 1) * m;
    }
    this.camera.lookAt(this.camLook);

    // roll with lean + drift
    const rollScale = this.reducedMotion ? 0.4 : 1;
    const targetRoll = (-p.lean * 0.22 - p.yaw * 0.10) * rollScale
      + (this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.06 : 0);
    this.camRoll = damp(this.camRoll, targetRoll, 7, dt);
    this.camera.rotateZ(this.camRoll);

    // fov punch — the surge is a big motion trigger, so scale it back too
    const fovK = this.reducedMotion ? 0.35 : 1;
    const targetFov = 66 + (speed01 * 16 + (this.boosting ? 9 : 0)
      + (p.crash > 0 ? -6 : 0) + air * 3) * fovK;
    this.fov = damp(this.fov, targetFov, 5, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** All shake funnels through here so accessibility can scale it globally. */
  private shakeAdd(v: number) {
    const scale = this.reducedMotion ? 0.22 : 1;
    this.shake = Math.min(2.2, this.shake + v * scale);
  }

  private updateWorldFx(dt: number) {
    const p = this.player;
    this.sky.position.copy(this.camera.position);
    this.clouds.position.set(this.camera.position.x, 0, this.camera.position.z);
    this.clouds.children.forEach(c => c.lookAt(this.camera.position.x, c.position.y, this.camera.position.z));
    this.ridge.position.set(this.camera.position.x, this.camera.position.y - 210, this.camera.position.z);

    // fog / light per zone
    const zone = this.track.zoneAt(p.s);
    const fogTarget = 0.0016 * zone.fog;
    this.fog.density = damp(this.fog.density, fogTarget, 1.2, dt);
    _c1.setHex(zone.far).lerp(_c2.setHex(0xcfe0ee), 0.62);
    this.fog.color.lerp(_c1, 1 - Math.exp(-1.2 * dt));
    this.sun.position.copy(this.camera.position).add(_v1.set(-260, 420, 120));
    this.sun.target.position.copy(this.camera.position);

    // spectators
    this.track.updateSpectators(p.s, this.time, dt);

    // crowd reaction near player
    this.hud.offTrack = Math.abs(p.x) > this.track.halfWidth(p.s) + 0.5;
    this.hud.hitFlash = Math.max(0, this.hud.hitFlash - dt * 2.6);
  }

  // -------------------------------------------------------------------------
  popup(text: string, kind: 'main' | 'sub' | 'trick' | 'bad', world: THREE.Vector3 | null, color: string) {
    const el = document.createElement('div');
    const size = kind === 'trick' ? 30 : kind === 'bad' ? 26 : 20;
    el.textContent = text;
    el.style.cssText = `
      position:absolute;left:50%;top:${kind === 'trick' ? 30 : kind === 'bad' ? 24 : 62}%;
      transform:translate(-50%,-50%) rotate(${(Math.random() * 4 - 2).toFixed(2)}deg);
      font:900 ${size}px/1 Impact,'Arial Black',system-ui,sans-serif;
      letter-spacing:0.02em;color:${color};
      text-shadow:0 3px 0 #000,0 0 18px ${color}88, 2px 2px 0 #00000099;
      white-space:nowrap;pointer-events:none;`;
    this.overlay.appendChild(el);
    this.popups.push({ el, world, life: kind === 'trick' ? 1.9 : 1.4, maxLife: kind === 'trick' ? 1.9 : 1.4, vy: 0, sx: 0, sy: 0 });
  }

  popupAt(world: THREE.Vector3, text: string, color: string, size = 24) {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = `
      position:absolute;transform:translate(-50%,-50%) rotate(${(Math.random() * 8 - 4).toFixed(2)}deg);
      font:900 ${size}px/1 Impact,'Arial Black',system-ui,sans-serif;color:${color};
      text-shadow:0 3px 0 #000, 0 0 16px ${color}99;white-space:nowrap;pointer-events:none;`;
    this.overlay.appendChild(el);
    this.popups.push({ el, world, life: 1.25, maxLife: 1.25, vy: 0, sx: 0, sy: 0 });
  }

  private updatePopups(dt: number) {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const pu = this.popups[i];
      pu.life -= dt;
      const t = 1 - pu.life / pu.maxLife;
      if (pu.life <= 0) { pu.el.remove(); this.popups.splice(i, 1); continue; }
      if (pu.world) {
        pu.world.y += 2.6 * dt;
        _v1.copy(pu.world).project(this.camera);
        const x = (_v1.x * 0.5 + 0.5) * w, y = (-_v1.y * 0.5 + 0.5) * h;
        const behind = _v1.z > 1;
        pu.el.style.left = x + 'px';
        pu.el.style.top = y + 'px';
        pu.el.style.display = behind ? 'none' : 'block';
      }
      const pop = t < 0.13 ? 1 + (0.13 - t) * 3.4 : 1;
      const fade = t > 0.65 ? 1 - (t - 0.65) / 0.35 : 1;
      pu.el.style.opacity = String(fade);
      const base = pu.el.style.transform.match(/rotate\([^)]+\)/)?.[0] ?? '';
      pu.el.style.transform = `translate(-50%,-50%) scale(${pop.toFixed(3)}) ${base}`;
      if (!pu.world) pu.el.style.marginTop = `${-t * 44}px`;
    }
  }

  // -------------------------------------------------------------------------
  // Ghost: a translucent replay of your best line, to chase or hold off.
  // -------------------------------------------------------------------------
  private ensureGhostRig(): RiderRig {
    if (this.ghostRig) return this.ghostRig;
    const rig = createRider({
      jersey: 0x7ef7ff, pants: 0x2a3f4a, helmet: 0xbfefff,
      frame: 0x7ef7ff, accent: 0xffffff, skin: 0x9fd0e0,
    });
    rig.root.traverse(o => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (!m) return;
      const mat = (m as THREE.MeshLambertMaterial).clone();
      mat.transparent = true;
      mat.opacity = 0.34;
      mat.depthWrite = false;
      (o as THREE.Mesh).material = mat;
    });
    rig.root.renderOrder = 3;
    (rig.shadow.material as THREE.MeshBasicMaterial).opacity = 0.22;
    // the ghost is translucent and never runs the pose pass, so it gets the
    // soft blob only — contact patches would read as solid smudges
    rig.contactF.visible = false;
    rig.contactR.visible = false;
    this.scene.add(rig.root);
    this.scene.add(rig.shadow);
    this.ghostRig = rig;
    return rig;
  }

  private recordGhost(dt: number) {
    const p = this.player;
    // frames[0] must be the state at t=0, or playback (which indexes from 0)
    // reads every sample one tick early and the ghost runs constantly fast
    if (this.ghostSamples.length === 0) {
      this.ghostSamples.push({ s: p.s, x: p.x, y: p.y, lean: p.lean });
      return;
    }
    this.ghostAccum += dt;
    if (this.ghostAccum < GHOST_DT) return;
    this.ghostAccum -= GHOST_DT;
    // cap at ~10 minutes of samples so a stuck run can't bloat storage
    if (this.ghostSamples.length > 6000) return;
    this.ghostSamples.push({ s: p.s, x: p.x, y: p.y, lean: p.lean });
  }

  private updateGhost() {
    const g = this.ghostData;
    const active = !!g && this.showGhost &&
      (this.hud.phase === 'race' || this.hud.phase === 'countdown');
    if (!active) {
      if (this.ghostRig) {
        this.ghostRig.root.visible = false;
        this.ghostRig.shadow.visible = false;
      }
      this.hud.ghostGap = 0;
      this.hud.ghostActive = false;
      return;
    }
    const rig = this.ensureGhostRig();
    const frames = g!.frames;
    const n = frames.length / 4;
    if (n < 2) return;

    const raw = this.raceTime / g!.dt;
    const i = clamp(Math.floor(raw), 0, n - 2);
    const t = clamp01(raw - i);
    const a = i * 4, b = a + 4;
    const s = lerp(frames[a], frames[b], t);
    const x = lerp(frames[a + 1], frames[b + 1], t);
    const y = lerp(frames[a + 2], frames[b + 2], t);
    const lean = lerp(frames[a + 3], frames[b + 3], t);
    const done = this.raceTime >= g!.time;

    rig.root.visible = !done;
    rig.shadow.visible = !done;
    if (done) { this.hud.ghostActive = false; return; }

    const trk = this.track;
    trk.frameAt(s, _f1, _f2, _f3);
    rig.root.position.copy(trk.worldPos(s, x, y + 0.02, _v1));
    _m1.makeBasis(_f2, _f3, _f1);
    rig.root.quaternion.setFromRotationMatrix(_m1);
    rig.lean.rotation.z = -lean;
    rig.frontWheel.rotation.x = rig.rearWheel.rotation.x = this.time * 9;
    // ground shadow
    const gh = trk.heightAt(s, x);
    rig.shadow.position.copy(trk.worldPos(s, x, gh + 0.05, _v2));
    rig.shadow.quaternion.setFromRotationMatrix(_m1.makeBasis(_f2, _f3, _f1));
    rig.shadow.rotateX(-Math.PI / 2);

    this.hud.ghostActive = true;
    // metres of track between you and your best line: + means you're ahead
    this.hud.ghostGap = this.player.s - s;
  }

  /**
   * Results-screen replay: fly a cinematic camera along the run we just
   * recorded, cutting between angles so it reads like a highlight reel.
   */
  private updateReplay(dt: number) {
    const g = this.replayData;
    if (!g || g.frames.length < 8) return;
    const n = g.frames.length / 4;
    this.replayT += dt;
    const dur = g.time;
    if (this.replayT > dur) this.replayT = 0;

    // pick a shot; each lasts a few seconds then cuts
    const SHOT = 4.2;
    const shot = Math.floor(this.replayT / SHOT) % 4;
    if (shot !== this.replayShot) {
      this.replayShot = shot;
      this.camSnap = true;
    }

    const raw = this.replayT / g.dt;
    const i = clamp(Math.floor(raw), 0, n - 2);
    const t = clamp01(raw - i);
    const a = i * 4, b = a + 4;
    const s = lerp(g.frames[a], g.frames[b], t);
    const x = lerp(g.frames[a + 1], g.frames[b + 1], t);
    const y = lerp(g.frames[a + 2], g.frames[b + 2], t);

    const trk = this.track;
    // put the rider where the replay says, so the camera has a subject
    const p = this.player;
    p.s = s; p.x = x; p.y = y;
    this.poseRacer(p, dt, 0);

    let cs = s, cx = x, ch = 3;
    switch (shot) {
      case 0: cs = s - 8.5; cx = x * 0.6; ch = 3.0; break;   // chase
      case 1: cs = s + 11; cx = x * 0.4; ch = 2.4; break;    // look back
      case 2: cs = s - 2; cx = x + 9; ch = 4.5; break;       // side pan
      case 3: cs = s - 5; cx = x * 0.5; ch = 9.0; break;     // high crane
    }
    const want = trk.worldPos(cs, cx, trk.heightAt(cs, cx) + ch, _v1);
    const rate = this.camSnap ? 999 : 3.4;
    this.camPos.x = damp(this.camPos.x, want.x, rate, dt);
    this.camPos.y = damp(this.camPos.y, want.y, rate, dt);
    this.camPos.z = damp(this.camPos.z, want.z, rate, dt);

    const look = trk.worldPos(s, x, trk.heightAt(s, x) + 1.4, _v2);
    this.camLook.x = damp(this.camLook.x, look.x, this.camSnap ? 999 : 5, dt);
    this.camLook.y = damp(this.camLook.y, look.y, this.camSnap ? 999 : 5, dt);
    this.camLook.z = damp(this.camLook.z, look.z, this.camSnap ? 999 : 5, dt);
    this.camSnap = false;

    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.camera.rotateZ(shot === 2 ? 0.06 : 0);
    this.fov = damp(this.fov, shot === 3 ? 52 : 64, 3, dt);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
  }

  /** Begin replaying the run that just finished. */
  startReplay() {
    this.replayData = this.takeGhost();
    this.replayT = 0;
    this.replayShot = -1;
    this.camSnap = true;
  }

  stopReplay() { this.replayData = null; }

  /** Package this run's samples if it's worth keeping. */
  takeGhost(): Ghost | null {
    if (this.ghostSamples.length < 8) return null;
    return encodeGhost(this.ghostSamples, this.player.finishTime || this.raceTime);
  }

  /** Floating name tags so the pack reads as named characters, not blockers. */
  private initRivalTags() {
    this.racers.forEach(r => {
      if (r.isPlayer) return;
      const el = document.createElement('div');
      el.style.cssText = `
        position:absolute;transform:translate(-50%,-50%);
        font:900 15px/1 Impact,'Arial Black',system-ui,sans-serif;
        letter-spacing:.04em;white-space:nowrap;pointer-events:none;
        opacity:0;transition:opacity .18s;`;
      this.overlay.appendChild(el);
      this.rivalTags.set(r, el);
    });
  }

  private updateRivalTags() {
    const p = this.player;
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const racing = this.hud.phase === 'race' || this.hud.phase === 'countdown';
    for (const [r, el] of this.rivalTags) {
      const ds = r.s - p.s;
      const near = Math.abs(ds) < 62;
      if (!racing || !near || r.finished) { el.style.opacity = '0'; continue; }
      _v1.copy(r.rig.root.position);
      _v1.y += 2.35;
      _v1.project(this.camera);
      if (_v1.z > 1) { el.style.opacity = '0'; continue; }
      const x = (_v1.x * 0.5 + 0.5) * w, y = (-_v1.y * 0.5 + 0.5) * h;
      if (x < -80 || x > w + 80) { el.style.opacity = '0'; continue; }
      // charging = closing on you fast from behind
      const closing = ds < 0 && r.v > p.v + 3.5;
      const fade = 1 - clamp01((Math.abs(ds) - 26) / 36);
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.style.opacity = String(fade * (r.crash > 0 ? 0.45 : 1));
      const col = closing ? '#ff2e88' : r.colorHex;
      const tail = r.crash > 0 ? ' DOWN' : closing ? ' ▲' : '';
      const label = `${r.name}${tail}`;
      if (el.textContent !== label) el.textContent = label;
      el.style.color = col;
      el.style.textShadow = `0 2px 0 #000, 0 0 12px ${col}aa`;
      el.style.fontSize = `${(13 + fade * 5).toFixed(1)}px`;
    }
  }

  private clearPopups() {
    this.popups.forEach(p => p.el.remove());
    this.popups = [];
  }

  // -------------------------------------------------------------------------
  private syncHud() {
    const p = this.player;
    const h = this.hud;
    h.speed = p.v * 3.6;
    h.place = p.place;
    h.total = this.racers.length;
    h.progress = clamp01(p.s / this.track.length);
    h.time = this.raceTime;
    h.boost = this.boost;
    h.style = this.style;
    h.combo = this.combo;
    h.comboTime = clamp01(this.comboTime / 3.4);
    h.score = this.score;
    h.bonks = this.bonks;
    h.tricks = this.tricksLanded;
    h.topSpeed = this.topSpeed;
    h.airTime = p.airTime;
    h.bigAir = clamp01(p.airTime / 1.6);
    h.boosting = this.boosting;
    h.drafting = this.drafting;
    h.reducedMotion = this.reducedMotion;
    h.state = p.state;
    h.stateLabel = STATE_RULES[p.state].label;
    h.stateT = p.stateT;
    h.pumpArmed = p.pumpArmed;
    if (h.lastBonkT > 0) h.lastBonkT -= this.lastDt;
    if (this.debugStates) h.transitions = p.log.recent(8);
    h.recover = p.recover;
    h.recoverPulse = Math.max(0, h.recoverPulse - this.lastDt * 5);
    const z = this.track.zoneAt(p.s);
    h.zone = z.name; h.zoneSub = z.sub;
    h.rivals = this.racers.map(r => ({
      name: r.name, color: r.isPlayer ? '#ffffff' : r.colorHex,
      progress: clamp01(r.s / this.track.length), place: r.place,
    }));
    // trick readout
    if (!p.grounded && p.airTime > 0.15) {
      const sp = Math.round(Math.abs(this.airSpin) / TAU * 360 / 90) * 90;
      const fl = Math.floor(Math.abs(this.airFlip) / TAU + 0.15);
      const bits: string[] = [];
      if (fl >= 1) bits.push(fl > 1 ? `${fl}x FLIP` : 'FLIP');
      if (sp >= 180) bits.push(`${sp}`);
      if (this.airPose > 0.3) bits.push('SUPERBONK');
      h.trickText = bits.join(' + ');
      h.trickHold = clamp01(p.airTime / 2);
    } else { h.trickText = ''; h.trickHold = 0; }

    // nearest rival, for positional tyre roll
    let rvNear = 0, rvPan = 0, rvSpeed = 0;
    for (const r of this.racers) {
      if (r.isPlayer || r.finished || r.crash > 0 || !r.grounded) continue;
      const ds = Math.abs(r.s - p.s);
      if (ds > 26) continue;
      const near = 1 - ds / 26;
      if (near > rvNear) {
        rvNear = near;
        // track +x is screen-left, so negate for stereo
        rvPan = clamp(-(r.x - p.x) * 0.28, -1, 1);
        rvSpeed = clamp01(r.v / 40);
      }
    }

    // the summit is exposed: wind swells through the opening, then the
    // descent takes over and it becomes the rush of speed instead
    const gale = h.phase === 'intro'
      ? clamp01(this.introT / 2.2) * (1 - clamp01((this.introT - INTRO.jump) / 3))
      : 0;

    audio.update(this.lastDt, {
      gale,
      rivalNear: rvNear * rvNear,
      rivalPan: rvPan,
      rivalSpeed: rvSpeed,
      speed01: clamp01(p.v / 42),
      grounded: p.grounded,
      offTrack: h.offTrack,
      airborne: !p.grounded,
      braking: this.key('KeyS', 'ArrowDown'),
      crowdNear: this.track.zoneAt(p.s).crowd / 3,
      // music lifts with speed, style, and the pressure of the run home
      intensity: clamp01(clamp01(p.v / 40) * 0.5 + this.style * 0.28
        + (h.finalStretch ? 0.3 : 0) + (h.photoFinish ? 0.2 : 0)),
      paused: this.hud.phase === 'menu' || this.hud.phase === 'paused',
    });
  }
}

// scratch objects
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _f1 = new THREE.Vector3();
const _f2 = new THREE.Vector3();
const _f3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m1 = new THREE.Matrix4();
const _c1 = new THREE.Color();
const _c2 = new THREE.Color();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _xAxis = new THREE.Vector3(1, 0, 0);
const IDENTITY_PERF: Perf = {
  topCap: 0, accel: 1, grip: 1, airRate: 1, landTol: 0, bonk: 1,
};
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
void smoothstep; void lerp; void ZONES;
