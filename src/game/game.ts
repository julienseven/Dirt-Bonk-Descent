// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: main engine
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import {
  clamp, clamp01, damp, lerp, RNG, TAU, smoothstep, smootherstep, fbm1,
} from './core';
import { Track, Obstacle, ZONES } from './track';
import {
  createRider, RiderRig, RIDER_PALETTES, getBuild, shapeForBike,
  solveRiderIK, applyRiderStance,
  CHEST_ATTACK, BB_POS, SHOCK_UPPER, SHOCK_LOWER, SHOCK_BASE_LEN, FORK_AXIS,
  WHEEL_R, FRONT_AXLE_POS, REAR_AXLE_POS,
} from './models';
import {
  ParticlePool, makeSoftTexture, makeChunkTexture, makeSkyTexture, makeCloudTexture,
} from './fx';
import { audio } from './audio';
import {
  type Perf, type Loadout, computePerf, getBike, loadoutColors, RIDER_BUILD_OF,
} from './garage';
import { getMountain } from './mountains';
import { SHALEBACK_SECTIONS, SHALEBACK_SETPIECES } from './shaleback';
import { CINDER_SECTIONS, CINDER_SETPIECES } from './cinderChute';
import { THORNWOOD_SECTIONS, THORNWOOD_SETPIECES } from './thornwoodDeep';
import { LASTLIGHT_SECTIONS, LASTLIGHT_SETPIECES } from './lastlightSpine';
import {
  PROPS, PROP_SCORE, PROP_BOOST, PROP_CALL, patchSurface,
  type PropDef, type PropKind,
} from './env';
import {
  CrashCause, CRASH_PROFILES, startRagdoll, stepRagdoll, crashCall,
  sampleRagdollLimbs, type Ragdoll,
} from './crash';
import {
  StyleTrick, STYLE_TRICKS, spinSteps, scoreTrick, previewName,
  type TrickTally,
} from './tricks';
import { getMode, type ModeId } from './modes';
import { PerfGovernor, FixedStep, aiThinkInterval, LOD_BANDS } from './perf';
import {
  AI_TIERS, buildField, chaosRoll, tierFromLegacy,
  type AiBrain, type AiTier,
} from './ai';
import { bus } from './events';
import {
  BonkType, resolveBonk, bonkFlavour, canBeBonked,
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
import { BoostSystem } from './boostSystem';
import { CheckpointSystem } from './checkpoints';
import { GamepadInput } from './input';
import { CameraRig, INTRO } from './camera';

export const GRAV = 30;
export const SOFT_CAP = 47;
/**
 * Chest pitch on top of pelvis/spine attack lean.
 * Full DH lean lives in models.ts (PELVIS_ATTACK + SPINE_ATTACK + CHEST_ATTACK).
 */
export const ATTACK_PITCH = CHEST_ATTACK;
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

export interface Popup {
  el: HTMLDivElement;
  world: THREE.Vector3 | null;
  life: number; maxLife: number;
  vy: number;
  sx: number; sy: number;
}

/** Expanding gold/white impact ring for BONK hits (pooled). */
interface ImpactRing {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
  peakAlpha: number;
  active: boolean;
}

const IMPACT_RING_POOL = 8;

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
  fps: number;
  perfTier: number;
  particles: number;
  draws: number;
  tris: number;
  splitDelta: number;    // seconds vs personal best at last zone
  splitShow: number;     // display timer
  splitHasPb: boolean;
  ghostActive: boolean;
  ghostGap: number;      // metres ahead (+) or behind (-) your best line
  reducedMotion: boolean;
  trickText: string;
  trickHold: number;
  /** mode-specific objective (e.g. time-attack clock) */
  modeObjective: string;
  modeDetail: string;
  modeUrgent: boolean;
  /** debug overlay extras */
  debugVel: number;
  debugAir: number;
  debugCp: string;
  debugInv: boolean;
  finishData: null | {
    time: number; place: number; score: number; bonks: number; tricks: number;
    topSpeed: number; bestTrick: string; bestTrickScore: number; airTotal: number;
    gap: number; splits: number[]; shortcuts: number; nearMisses: number;
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
  /** seconds since crossing the line */
  finishRoll: number;
  /** which way they carve as they scrub off speed */
  finishCarve: number;
  /** 0..1 blend into the victory pose */
  finishPose: number;
  // ai
  skill: number;
  aiOffset: number;
  aiSeed: number;
  aiHopCd: number;
  aiCap: number;
  /** seconds until this rival re-plans; distance-throttled */
  thinkCd: number;
  /** cached steering target between thinks */
  aiSteer: number;
  aiPedal: boolean;
  aiBrake: boolean;
  aiTuck: boolean;
  corner: number;      // 0..1 how well they hold the apex
  aggression: number;
  /** resolved personality x difficulty */
  brain: AiBrain | null;
  /** chaos-agent mood, re-rolled periodically */
  mood: { line: number; swing: number; send: number };
  moodCd: number;
  /** delayed-reaction buffer: what they *will* steer toward */
  wantSteer: number;
  /** committed to a shortcut this section? */
  scCommit: number;
  /** rad/s of trick rotation this rival is throwing, 0 = none */
  trickSpin: number;
  trickAngle: number;
  /** LOD state: are the silhouette shells currently drawn? */
  lodNear: boolean;
  /** 0..1 accumulated grime, and the colour it's picking up */
  dirt: number;
  dirtTint: THREE.Color;
  /** 0..1 how recently this rider went through water */
  wet: number;
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
  rig!: CameraRig;
  /** single source of truth for the boost meter */
  boostSys = new BoostSystem();
  get boost() { return this.boostSys.charge; }
  set boost(v: number) { this.boostSys.charge = Math.max(0, Math.min(100, v)); }
  get boosting() { return this.boostSys.active; }
  set boosting(v: boolean) { this.boostSys.active = v; }
  boostTime = 0;
  /** section checkpoints + respawn anchors */
  checkpoints = new CheckpointSystem();
  /** fixed physics tick (120 Hz), decoupled from frame rate */
  private fixed = new FixedStep(120, 6);
  /** gamepad poller — OR'd into keyboard intent each frame */
  private pad = new GamepadInput();
  /** ?debug: invincibility, cheats, expanded overlay */
  debugMode = typeof window !== 'undefined'
    && (window.location.search.includes('debug') || window.location.search.includes('states'));
  invincible = false;
  /** mode clock remaining (Infinity = untimed) */
  modeClock = Infinity;
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
  aiTier: AiTier = 'pro';
  /** cumulative race time on entering each zone, this run */
  splits: number[] = [];
  /** personal-best splits to race against (empty = no PB yet) */
  pbSplits: number[] = [];
  // ---- ghost
  ghostData: Ghost | null = null;
  showGhost = true;
  /**
   * Accessibility. The rig scales shake / roll / FOV surge off the same
   * flag, so it is mirrored there on write rather than read across.
   */
  private _reducedMotion = false;
  get reducedMotion() { return this._reducedMotion; }
  set reducedMotion(v: boolean) {
    this._reducedMotion = v;
    if (this.rig) this.rig.reducedMotion = v;
  }
  private ghostRig: RiderRig | null = null;
  private ghostSamples: { s: number; x: number; y: number; lean: number }[] = [];
  private ghostAccum = 0;
  // ---- results-screen replay
  private replayData: Ghost | null = null;
  private replayT = 0;
  private replayShot = -1;
  // trick state
  airSpin = 0; airFlip = 0; airPose = 0; airPeak = 0; airStartY = 0;
  /** seconds each style trick has been held this air */
  styleHeld = new Map<StyleTrick, number>();
  /** currently-held style tricks, for the pose blender */
  styleActive = new Set<StyleTrick>();
  /** tailwhip / barspin rotation accumulators */
  whipAngle = 0;
  barAngle = 0;
  trickBuffer: string[] = [];
  trickStepAudio = 0;
  frozen = false;
  goFlash = 0;
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
  private impactRings: ImpactRing[] = [];
  private sky!: THREE.Mesh;
  private ridge!: THREE.Group;
  private clouds!: THREE.Group;
  private sun!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private fog!: THREE.FogExp2;
  private rng = new RNG(4242);
  private lastZone = -1;
  private countTimer = 0;
  private countStep = -1;
  private finishHold = 0;
  /** one-shot guard for the dust blast at the line */
  private finishBlast = false;
  private roostAccum = 0;
  private moteAccum = 0;
  private streakAccum = 0;
  private nearMissCd = 0;
  onPhaseChange?: (p: Phase) => void;
  quality: 'high' | 'low' = 'high';
  mobile = false;
  /** pause the render loop entirely while the garage owns the screen */
  suspended = false;
  /** F10: hide the HUD for clean captures */
  hudHidden = false;
  mountainId = 'shaleback';
  shortcutsHit = 0;
  nearMisses = 0;
  mode: ModeId = 'descent';
  /** adaptive quality governor */
  perfGov = new PerfGovernor();
  /** ?states / ?debug in the URL shows the live state machine readout */
  get debugStates() { return this.debugMode; }
  set debugStates(v: boolean) { this.debugMode = v; }
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
    knockResist: 0, boostBurn: 1, boostPush: 1, mass: 86,
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
      fps: 60, perfTier: 0, particles: 0, draws: 0, tris: 0,
      pumpArmed: 0, lastBonk: '', lastBonkT: 0, crashCause: '',
      splitDelta: 0, splitShow: 0, splitHasPb: false,
      ghostActive: false, ghostGap: 0, reducedMotion: false,
      trickText: '', trickHold: 0, finishData: null,
      modeObjective: '', modeDetail: '', modeUrgent: false,
      debugVel: 0, debugAir: 0, debugCp: '', debugInv: false,
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
    // Cineon over ACES: ACES is a film-emulation curve that desaturates
    // highlights toward photoreal. Cineon holds colour harder, which is what
    // "stylised extreme sports" wants — bright, readable, poster-like.
    this.renderer.toneMapping = THREE.CineonToneMapping;
    this.renderer.toneMappingExposure = 1.24;
    this.renderer.domElement.style.display = 'block';
    this.container.appendChild(this.renderer.domElement);

    this.overlay = document.createElement('div');
    this.overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:5';
    this.container.appendChild(this.overlay);

    this.scene = new THREE.Scene();
    this.fog = new THREE.FogExp2(0xbcd4e6, 0.0022);
    this.scene.fog = this.fog;

    this.rig = new CameraRig(w / h);
    this.camera = this.rig.camera;
    this.scene.add(this.camera);

    // ---- LATE AFTERNOON / GOLDEN MOUNTAIN -----------------------------
    // One polished setup rather than several half-tuned ones.
    //
    // KEY: low and warm. Elevation 0.42 is roughly 23 degrees above the
    // horizon — golden hour, not midday — which is what produces the long
    // raking shadows and strong terrain silhouettes the look depends on.
    // Raised intensity compensates for the shallow angle.
    this.sun = new THREE.DirectionalLight(0xffd9a0, 2.6);
    this.sun.position.set(-0.62, 0.42, 0.28);
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // SKY/ENVIRONMENT: cool blue from above, warm bounce from the dirt
    // below. The vertical colour split is what creates depth between
    // foreground and background without any post-processing.
    this.hemi = new THREE.HemisphereLight(0xa8ccff, 0x8a6438, 1.15);
    this.scene.add(this.hemi);

    // RIM: cool and from behind, so riders separate from the hillside even
    // when they're between the camera and a dark treeline.
    const rim = new THREE.DirectionalLight(0x9ec4ff, 0.85);
    rim.position.set(0.55, 0.30, -1);
    this.scene.add(rim);

    // FILL: a soft frontal light with no direction of its own. This is the
    // "never lose the rider in a forest" guarantee — it lifts shadowed
    // faces without flattening the key.
    //
    // NOTE: now that the world uses Standard materials it has a specular
    // response, so this fill contributes highlights as well as diffuse.
    // Kept low deliberately: the world is authored matte (roughness 0.88+)
    // so the rider and bike stay the most visually active things on screen.
    const fill = new THREE.DirectionalLight(0xfff0dc, 0.42);
    fill.position.set(-0.15, 0.55, 1);
    this.scene.add(fill);

    // BOUNCE: warm light coming back up off the dirt. Keeps undersides and
    // the rider's legs from going to flat black in the trees.
    const bounce = new THREE.DirectionalLight(0xffb878, 0.40);
    bounce.position.set(0.2, -1, 0.1);
    this.scene.add(bounce);

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
    this.track.updateSceneryLod(0, 1, true);
    this.checkpoints.build(this.track);

    // particles
    const soft = makeSoftTexture();
    const chunk = makeChunkTexture();
    this.dirtPool = new ParticlePool(1400, chunk, THREE.NormalBlending);
    this.smokePool = new ParticlePool(700, soft, THREE.NormalBlending);
    this.sparkPool = new ParticlePool(500, soft, THREE.AdditiveBlending);
    this.scene.add(this.smokePool.points, this.dirtPool.points, this.sparkPool.points);

    // BONK impact rings — small pool, expand + fade, no per-hit alloc
    const ringGeo = new THREE.RingGeometry(0.72, 1.0, 40);
    for (let i = 0; i < IMPACT_RING_POOL; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffe090,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 6;
      this.scene.add(mesh);
      this.impactRings.push({
        mesh, mat, life: 0, maxLife: 0.32,
        startScale: 0.4, endScale: 3.2, peakAlpha: 0.9, active: false,
      });
    }

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

  /**
   * Layered mountain vistas. Three concentric rings at different distances,
   * each paler and bluer than the one in front — cheap aerial perspective
   * that gives the horizon real depth instead of one flat cut-out band.
   */
  private buildRidges(): THREE.Group {
    const group = new THREE.Group();
    const LAYERS = [
      { R: 1750, base: -340, amp: 210, tall: 300, seed: 0.0, tint: 0.18, sharp: 1.5 },
      { R: 2500, base: -320, amp: 300, tall: 520, seed: 51.3, tint: 0.46, sharp: 1.1 },
      { R: 3300, base: -300, amp: 380, tall: 760, seed: 97.7, tint: 0.72, sharp: 0.85 },
    ];
    const HAZE = new THREE.Color(0.78, 0.86, 0.95);

    // ---- MOUNTAIN SCALE. A hazy valley floor far below the course, so the
    // drop reads as "thousands of metres down a mountain" rather than "a
    // hillside with a skybox". Sits under everything and never occludes.
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(3400, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0.60, 0.70, 0.80),
        fog: false, depthWrite: false, transparent: true, opacity: 0.92,
      }),
    );
    floor.position.y = -560;
    floor.renderOrder = -9;
    group.add(floor);

    for (const L of LAYERS) {
      const seg = 190;
      const pos: number[] = [], col: number[] = [], idx: number[] = [];
      const c = new THREE.Color();
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * TAU;
        // sharpened noise gives angular peaks rather than rolling lumps,
        // which is what reads as "mountain silhouette"
        const n1 = fbm1(i * 0.11 + L.seed, 4);
        const n2 = Math.max(0, fbm1(i * 0.037 + L.seed + 20, 2));
        const peak = Math.pow(Math.abs(n1), 1 / L.sharp) * Math.sign(n1);
        const hgt = L.amp + peak * L.amp * 0.9 + n2 * L.tall;
        const x = Math.cos(a) * L.R, z = Math.sin(a) * L.R;
        pos.push(x, L.base, z);
        pos.push(x, L.base + hgt, z);
        // rock at the base, snow-lit toward the peaks, all pushed to haze
        c.setRGB(0.30, 0.36, 0.48).lerp(HAZE, L.tint);
        col.push(c.r, c.g, c.b);
        const snow = clamp01((hgt - L.amp * 1.1) / (L.tall * 0.7));
        c.setRGB(0.52, 0.60, 0.72).lerp(new THREE.Color(1, 1, 1), snow * 0.65)
          .lerp(HAZE, L.tint);
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
      // Unlit is correct here and only here: these are atmospheric backdrop
      // layers whose colour IS the aerial perspective. Lighting them would
      // fight the haze gradient that sells the distance.
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
        vertexColors: true, side: THREE.DoubleSide, fog: false, depthWrite: false,
      }));
      m.renderOrder = -8;
      group.add(m);
    }
    return group;
  }

  private mkRacer(isPlayer: boolean, i: number): Racer {
    const pal = RIDER_PALETTES[i % RIDER_PALETTES.length];
    // rivals get the silhouette matching their personality slot; the player
    // gets a clean neutral build until the garage overrides it
    const buildId = isPlayer ? 'allround'
      : ['bonker', 'speedfreak', 'showoff', 'coward', 'chaos', 'allround'][(i - 1) % 6];
    // …and the frame class their personality would actually buy, so the pack
    // is four different machines rather than six paint jobs. The player's is
    // replaced by applyLoadout the moment the garage has an opinion.
    const bikeId = isPlayer ? 'hornet'
      : ['slab', 'bolt', 'wisp', 'hornet', 'wisp', 'hornet'][(i - 1) % 6];
    const rb = getBike(bikeId);
    const rig = createRider(pal, getBuild(buildId), shapeForBike(rb.id, rb.tubeScale));
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
      crankAngle: Math.PI * 0.5, pedalling: 0, headYaw: 0, weight: 0,
      chassisPitch: 0, pitchV: 0, contactF: true, contactR: true,
      pump: 0, pumpArmed: 0,
      mass: 86, swingT: 99, bonkCooldownPair: 0, ragdoll: null,
      // the player rides "neutral"; rivals get personality below
      stCadence: 1, stLean: 1, stWeight: 0, stHead: 1, stTwitch: 1,
      place: i + 1, finished: false, finishTime: 0,
      finishRoll: 0, finishCarve: 0, finishPose: 0,
      skill: 0, aiOffset: 0, aiSeed: this.rng.range(0, 100), aiHopCd: 0, aiCap: 30,
      thinkCd: 0, aiSteer: 0, aiPedal: true, aiBrake: false, aiTuck: false,
      corner: 1, aggression: 0,
      brain: null, mood: { line: 1, swing: 1, send: 1 }, moodCd: 0,
      wantSteer: 0, scCommit: 0, trickSpin: 0, trickAngle: 0, lodNear: true,
      dirt: 0, dirtTint: new THREE.Color(0x6b5942), wet: 0,
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
    this.aiTier = tierFromLegacy(d);
    const tier = AI_TIERS[this.aiTier];
    // one contrasting personality per grid slot
    const field = buildField(this.racers.length - 1, tier, 4242);
    let i = 0;
    for (const r of this.racers) {
      if (r.isPlayer) continue;
      const brain = field[i];
      i++;
      r.brain = brain;
      r.name = brain.p.name;
      r.colorHex = brain.p.colour;
      r.aiCap = brain.cap;
      r.skill = T.skill + i * T.step + this.rng.range(-0.03, 0.03);
      r.corner = brain.line;
      r.aggression = brain.p.aggression;
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
      r.scCommit = 0; r.moodCd = 0; r.trickSpin = 0; r.trickAngle = 0;
      r.thinkCd = 0; r.aiSteer = 0; r.wantSteer = 0;
      // fresh bike at the gate
      r.dirt = 0; r.wet = 0;
      r.dirtTint.setHex(0x6b5942);
      r.rig.dirt.set(0, r.dirtTint);
      r.finished = false; r.finishTime = 0; r.place = i + 1;
      r.finishRoll = 0; r.finishCarve = 0; r.finishPose = 0;
      r.aiOffset = this.rng.range(-0.3, 0.3);
    });
    this.track.obstacles.forEach(o => {
      o.hit = 0; o.ox = o.oy = o.os = 0; o.vx = o.vy = o.vs = 0;
      o.gone = false; o.roll = undefined;
    });
    this.track.resetSpectators();
    this.track.refreshProps();
    this.raceTime = 0; this.boostSys.reset(); this.style = 0; this.combo = 0; this.comboTime = 0;
    this.score = 0; this.bonks = 0; this.tricksLanded = 0; this.topSpeed = 0;
    this.airTotal = 0; this.bestTrick = ''; this.bestTrickScore = 0;
    this.airSpin = this.airFlip = this.airPose = 0;
    this.rig.reset(); this.hitStop = 0; this.timeScale = 1; this.slowmo = 0;
    this.dirtPool.clear(); this.sparkPool.clear(); this.smokePool.clear();
    this.clearImpactRings();
    this.clearPopups();
    this.hud.finishData = null;
    this.hud.crashed = 0;
    this.hud.finalStretch = false;
    this.hud.photoFinish = false;
    this.finishBlast = false;
    this.finishHold = 0;
    this.hud.splitShow = 0;
    this.hud.splitDelta = 0;
    // dense, not sparse: JSON.stringify turns array holes into `null`, which
    // then slips past `!== undefined` guards and yields garbage deltas
    this.shortcutsHit = 0;
    this.nearMisses = 0;
    this.scActive = null;
    this.splits = new Array(this.track.zones.length).fill(0);
    this.checkpoints.reset();
    this.checkpoints.pb = this.pbSplits.slice();
    this.fixed.reset();
    {
      const m = getMode(this.mode);
      const est = (this.track.length - 20) / 28;
      this.modeClock = m.timeLimit(this.difficulty, est);
    }
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

  /** Switch race rules (Descent / Time Attack / …). Applied on next reset. */
  setMode(id: ModeId) {
    this.mode = id;
    const m = getMode(id);
    const est = (this.track.length - 20) / 28;
    this.modeClock = m.timeLimit(this.difficulty, est);
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
    bus.emit('race:start', { mountain: this.mountainId, mode: this.mode });
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
      this.rig.resize(w / h);
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
    // F9 grabs a 2x PNG of the current frame, for docs and bug reports
    if (k === 'F9') { e.preventDefault(); this.screenshot(); return; }
    // F10 hides the HUD first, for clean captures
    if (k === 'F10') { e.preventDefault(); this.hudHidden = !this.hudHidden; return; }
    // ---- debug cheats (?debug or ?states)
    if (this.debugMode && this.hud.phase === 'race') {
      if (k === 'F1') { e.preventDefault(); this.debugTeleport(1); return; }   // next CP
      if (k === 'F2') { e.preventDefault(); this.debugTeleport(-1); return; }  // prev CP
      if (k === 'F3') { e.preventDefault(); this.boostSys.gain(50); this.popup('+50 BOOST', 'sub', null, '#ffd400'); return; }
      if (k === 'F4') { e.preventDefault(); this.player.v = Math.max(this.player.v, 48); this.popup('MAX SPEED', 'sub', null, '#7ef7ff'); return; }
      if (k === 'F5') { e.preventDefault(); this.invincible = !this.invincible; this.popup(this.invincible ? 'INVINCIBLE' : 'VULNERABLE', 'sub', null, '#c0f000'); return; }
      if (k === 'F6') { e.preventDefault(); this.slowmo = this.slowmo > 0 ? 0 : 8; this.popup(this.slowmo > 0 ? 'SLOW-MO' : 'REAL TIME', 'sub', null, '#9fd0ff'); return; }
      if (k === 'F7') { e.preventDefault(); this.quickRestart(); return; }
    }
    // during the cold open Escape means "skip", not "pause"
    if (k === 'Escape') {
      if (this.hud.phase === 'intro') this.skipIntro();
      else this.togglePause();
    }
  };

  /** Dev: snap the player to a checkpoint index offset from current. */
  private debugTeleport(dir: number) {
    const list = this.checkpoints.list;
    if (!list.length) return;
    const cur = this.checkpoints.reached;
    const idx = clamp(cur + dir, 0, list.length - 1);
    const cp = list[idx];
    const p = this.player;
    p.s = cp.s + 4;
    p.x = cp.x;
    p.y = this.track.heightAt(p.s, p.x) + 0.6;
    p.v = Math.max(p.v, 18);
    p.vx = 0; p.vy = 0; p.crash = 0; p.grace = 0.8;
    p.grounded = true;
    this.checkpoints.reached = Math.max(this.checkpoints.reached, idx);
    this.popup(`TP → ${cp.name}`, 'sub', null, '#7ef7c8');
  }
  private onKeyUp = (e: KeyboardEvent) => { this.keys[e.code] = false; };

  /**
   * Capture the current frame to a PNG download.
   *
   * Renders immediately before reading the buffer: without that the canvas
   * is typically already cleared by the time toDataURL runs, and you get a
   * transparent image. This avoids needing `preserveDrawingBuffer`, which
   * costs performance on every frame for a feature used occasionally.
   */
  screenshot(scale = 2) {
    const canvas = this.renderer.domElement;
    const w = canvas.width, h = canvas.height;
    const prevRatio = this.renderer.getPixelRatio();
    try {
      // temporarily render at higher resolution for a crisp capture
      this.renderer.setPixelRatio(Math.min(prevRatio * scale, 4));
      this.onResize();
      this.renderer.render(this.scene, this.camera);
      const url = this.renderer.domElement.toDataURL('image/png');
      const a = document.createElement('a');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.href = url;
      a.download = `dirt-bonk-descent-${stamp}.png`;
      a.click();
    } catch (err) {
      console.error('[DirtBonkDescent] screenshot failed:', err);
    } finally {
      this.renderer.setPixelRatio(prevRatio);
      this.onResize();
    }
    void w; void h;
  }

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
    this.perfGov.sample(dt);
    bus.time = this.time;
    // last-resort visual shed: drop resolution only after particles, LOD and
    // crowd have already been cut back
    const wantPR = Math.min(
      window.devicePixelRatio,
      this.mobile ? 1.5 : this.perfGov.pixelRatio);
    if (Math.abs(this.renderer.getPixelRatio() - wantPR) > 0.05) {
      this.renderer.setPixelRatio(wantPR);
    }
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
      this.stepPhysics(sdt, false);
      this.updateIntro(dt);
      this.updateWorldFx(dt);
      this.dirtPool.update(sdt);
      this.smokePool.update(sdt);
      this.sparkPool.update(sdt);
      this.updateImpactRings(sdt);
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
      this.stepPhysics(sdt, false);
    } else if (phase === 'race') {
      this.frozen = false;
      if (this.goFlash > 0) {
        this.goFlash -= dt;
        this.hud.countLabel = this.goFlash > 0 ? 'GO!' : '';
      }
      this.stepPhysics(sdt, true);
      if (!this.player.finished) this.recordGhost(sdt);
      if (this.player.finished) {
        // let the roll-out, carve and pose play before the results card
        this.finishHold += dt;
        if (this.finishHold > 4.4) this.enterFinish();
      }
      // mode clock uses wall time so hit-stop / slow-mo don't steal seconds
      if (Number.isFinite(this.modeClock) && !this.player.finished) {
        this.modeClock = Math.max(0, this.modeClock - dt);
        const end = getMode(this.mode).checkEnd({
          raceTime: this.raceTime, progress: clamp01(this.player.s / this.track.length),
          place: this.player.place, fieldSize: this.racers.length,
          score: this.score, tricks: this.tricksLanded, bonks: this.bonks,
          shortcuts: this.shortcutsHit, nearMisses: this.nearMisses,
          finished: this.player.finished, clock: this.modeClock,
        });
        if (end === 'timeup') {
          this.player.finished = true;
          this.player.finishTime = this.raceTime;
          this.popup('TIME UP', 'trick', null, '#ff6a00');
        }
      }
    } else if (phase === 'finish') {
      if (this.replayData) this.updateReplay(dt);
      else this.stepPhysics(sdt * 0.6, false);
    } else {
      // menu / paused — still latch pad so Start can unpause
      this.latchInput(false);
      this.simulate(0, false);
    }

    this.updateCamera(dt, false);
    this.updateWorldFx(dt);
    this.dirtPool.update(sdt);
    this.smokePool.update(sdt);
    this.sparkPool.update(sdt);
    this.updateImpactRings(sdt);
    this.updateRiderLod();
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
      nearMisses: this.nearMisses,
    };
    this.setPhase('finish');
    this.startReplay();
    audio.cheer(1.3);
    for (let i = 0; i < 6; i++) setTimeout(() => audio.chime(i * 2), i * 130);
  }

  /**
   * Run 0..N fixed physics ticks for this frame. Keeps landings, hops and
   * bonks snappy when the frame rate dips.
   */
  /** edge-triggered actions latched once per rendered frame */
  private frameTap = {
    hop: false, bonkL: false, bonkR: false, mash: false, react: false,
    padBoost: false, padSteer: 0, padPedal: false, padBrake: false,
    padTuck: false, padConnected: false,
  };

  /**
   * Latch keyboard + pad edges every frame, even when FixedStep yields 0
   * ticks (high refresh rates). Edges survive until the next physics
   * tick consumes them — so hops/bonks never silently drop.
   */
  private latchInput(live: boolean) {
    const pad = this.pad.poll();
    // pause works from any phase (resume from pause included)
    if (pad.pauseTap) this.togglePause();
    const hop = this.tap('KeyJ', 'ControlLeft') || pad.hopTap;
    const bonkL = this.tap('KeyQ') || pad.bonkLTap;
    const bonkR = this.tap('KeyE') || pad.bonkRTap;
    const mash = this.tap('KeyW', 'ArrowUp', 'Space', 'KeyJ')
      || pad.hopTap || pad.pedal;
    const react = this.tap('KeyW', 'ArrowUp', 'Space')
      || pad.hopTap || pad.pedal || pad.boost;
    // OR into existing latches so a zero-tick frame keeps a prior edge
    this.frameTap.hop = this.frameTap.hop || hop;
    this.frameTap.bonkL = this.frameTap.bonkL || bonkL;
    this.frameTap.bonkR = this.frameTap.bonkR || bonkR;
    this.frameTap.mash = this.frameTap.mash || mash;
    this.frameTap.react = this.frameTap.react || react;
    this.frameTap.padBoost = pad.boost;
    this.frameTap.padSteer = pad.steer;
    this.frameTap.padPedal = pad.pedal;
    this.frameTap.padBrake = pad.brake;
    this.frameTap.padTuck = pad.tuck;
    this.frameTap.padConnected = pad.connected;
    void live;
  }

  private stepPhysics(dt: number, live: boolean) {
    this.latchInput(live);
    if (dt <= 0) { this.simulate(0, live); return; }
    const n = this.fixed.count(dt);
    if (n === 0) return;
    const step = this.fixed.step;
    for (let i = 0; i < n; i++) {
      if (live) this.raceTime += step;
      // only the first tick of the frame consumes edge-triggered actions
      this.simulate(step, live, i === 0);
      if (i === 0) {
        this.frameTap.hop = false;
        this.frameTap.bonkL = false;
        this.frameTap.bonkR = false;
        this.frameTap.mash = false;
        this.frameTap.react = false;
      }
    }
  }

  // =========================================================================
  private simulate(dt: number, live: boolean, firstTick = true) {
    if (dt <= 0) return;
    const trk = this.track;
    const ft = this.frameTap;

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
      } else if (ft.padConnected && Math.abs(ft.padSteer) > 0.02) {
        steer = -ft.padSteer;                          // screen -> track space
      } else {
        if (this.key('KeyA', 'ArrowLeft')) steer += 1;   // A = screen left
        if (this.key('KeyD', 'ArrowRight')) steer -= 1;  // D = screen right
      }
      brake = (this.key('KeyS', 'ArrowDown') || ft.padBrake) && p.grounded;
      pedal = (this.key('KeyW', 'ArrowUp') || ft.padPedal || (this.autoPedal && !brake)) && p.grounded;
      tuck = (this.key('ShiftLeft', 'ShiftRight') || ft.padTuck) && !brake;
    }
    // boost — ground only (Space is also Superman in the air; don't drain both)
    const boostOk = p.grounded;
    const wantBoost = canControl && (this.key('Space') || ft.padBoost) && boostOk;
    this.boostSys.update(dt, wantBoost, canControl && boostOk, this.perf.boostBurn);

    // bonk (ground only — in the air Q/E become whips)
    if (canControl && firstTick && p.bonkCd <= 0 && canBonk(p.state)) {
      if (ft.bonkL) this.doBonk(1);        // Q = swing screen-left (+x)
      else if (ft.bonkR) this.doBonk(-1);  // E = swing screen-right (-x)
    }

    // hop
    let hop = false;
    if (canControl && firstTick && ft.hop && p.grounded) hop = true;

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
      // ---- STYLE TRICKS: held poses on their own keys, so they stack
      // freely with spins and flips instead of competing for input.
      this.styleActive.clear();
      let controlCost = 0;
      for (const st of STYLE_TRICKS) {
        if (!this.key(st.key)) continue;
        this.styleActive.add(st.id);
        this.styleHeld.set(st.id, (this.styleHeld.get(st.id) ?? 0) + dt);
        controlCost += st.controlCost;
        if (st.id === StyleTrick.SUPERMAN) this.airPose += dt;
      }
      // holding a big trick costs rotation authority — a real trade-off
      if (controlCost > 0) {
        const k = 1 - clamp01(controlCost) * 0.55;
        this.airSpin += spinDir * 7.8 * ar * dt * (k - 1);
        this.airFlip += flipDir * 6.4 * ar * dt * (k - 1);
      }

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

    // ---- checkpoints + zone announce (same section boundaries)
    if (live) {
      const hit = this.checkpoints.update(p.s, this.raceTime, dt);
      if (hit && hit.index > 0) {
        this.splits[hit.index] = this.raceTime;
        this.hud.zoneFlash = 1;
        audio.chime(4);
        if (this.checkpoints.lastDelta !== null) {
          this.hud.splitDelta = this.checkpoints.lastDelta;
          this.hud.splitHasPb = true;
          this.hud.splitShow = 3;
          audio.chime(this.checkpoints.lastDelta < 0 ? 7 : 0);
        } else {
          this.hud.splitHasPb = false;
          this.hud.splitShow = 0;
        }
      }
    }
    const zi = trk.zoneIndexAt(clamp01(p.s / trk.length));
    if (zi !== this.lastZone && live) {
      this.lastZone = zi;
      if (this.hud.zoneFlash <= 0) this.hud.zoneFlash = 1;
    }
    if (this.hud.splitShow > 0) this.hud.splitShow -= dt;
    this.hud.zoneFlash = Math.max(0, this.hud.zoneFlash - dt * 0.5);

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
      // ---- ROLL-OUT ---------------------------------------------------
      // Momentum carries you well past the line before anything slows you,
      // then the rider brakes and carves to a stop. Never an instant freeze.
      const t = r.finishRoll;
      r.finishRoll += dt;
      // phase 1 (0-0.9s): coast, barely losing speed — you're still flying
      // phase 2 (0.9s+):  brake progressively into a carve
      const braking = t > 0.9;
      const decel = braking ? lerp(0.9, 3.4, clamp01((t - 0.9) / 1.6)) : 0.22;
      r.v = damp(r.v, braking ? 0 : r.v * 0.995, decel, dt);

      // carve: lean the bike across the track as they scrub off speed
      if (braking && r.isPlayer) {
        const carve = Math.sin(clamp01((t - 0.9) / 2.2) * Math.PI) * r.finishCarve;
        r.vx = damp(r.vx, carve * 5.5, 2.2, dt);
      } else {
        r.vx = damp(r.vx, 0, 1.5, dt);
      }
      r.x += r.vx * dt;
      r.s += r.v * dt;

      // stay on the ground properly — the old roll-out ignored terrain, so
      // riders sank into or floated over the run-off
      const gh = trk.heightAt(r.s, r.x);
      r.vy -= GRAV * dt;
      r.y += r.vy * dt;
      if (r.y <= gh) { r.y = gh; r.vy = 0; }

      r.wheelSpin += r.v * dt / WHEEL_R;
      // hands off the bars, one arm up, once they're nearly stopped
      if (r.isPlayer && r.v < 6) r.finishPose = Math.min(1, r.finishPose + dt * 2.2);

      this.poseRacer(r, dt, braking ? r.finishCarve * 0.5 : 0);
      if (r.isPlayer) this.playerFinishFx(r, dt, t);
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
        // once-per-frame mash (keyboard or gamepad A / RT)
        if (this.frameTap.mash) {
          r.recover = clamp01(r.recover + 0.2);
          this.frameTap.mash = false;
          audio.uiMove();
          this.hud.recoverPulse = 1;
        }
        // mashing can cut the tumble to well under a second — downtime is
        // the least fun part of a crash, so reward fighting out of it hard
        r.crash -= dt * (1 + r.recover * 1.9);
      } else {
        // RECOVERY skill: a resilient rider on a high tier is back up in
        // roughly half the time a rookie coward takes
        r.crash -= dt * (r.brain ? r.brain.recovery : 1);
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
            this.boostSys.add('quickRecovery');
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
    // boost thrust scales with efficiency too
    a += RULES.thrust * (r.state === BikeState.BOOSTING ? P.boostPush : 1);
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
      r.finishRoll = 0;
      r.finishPose = 0;
      // carve toward the middle of the track if we're off to one side,
      // otherwise pick the side we were already drifting
      const hwF = trk.halfWidth(r.s);
      r.finishCarve = Math.abs(r.x) > hwF * 0.3
        ? -Math.sign(r.x)
        : (Math.sign(r.vx) || (Math.random() < 0.5 ? -1 : 1));
      if (r.isPlayer) {
        this.finishHold = 0;
        this.finishBlast = false;
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

    // ---- PROGRESSIVE DIRT. Per-surface rates + events. Never fully clears.
    {
      const zone = this.track.zoneAt(r.s);
      // surface pickup rates: mud cakes, gravel dusts, rock barely sticks
      const surfRate =
        surf.kind === 'mud' ? 4.2 :
        surf.kind === 'gravel' ? 2.4 :
        surf.kind === 'grass' ? 1.6 :
        surf.kind === 'rock' ? 0.55 :
        1.15; // dirt
      if (r.grounded && r.v > 3) {
        const slide = 1 + Math.abs(r.vx) * 0.11 + (r.state === BikeState.DRIFTING ? 0.9 : 0);
        const speedK = 0.35 + clamp01(r.v / 28) * 0.9;
        r.dirt = Math.min(1, r.dirt + dt * 0.028 * surfRate * slide * speedK);
        // tint toward local trail colour (mud brown, rock grey, etc.)
        _c1.setHex(zone.dirt);
        if (surf.kind === 'mud') _c1.lerp(_c2.setRGB(0.28, 0.20, 0.12), 0.55);
        else if (surf.kind === 'rock') _c1.lerp(_c2.setRGB(0.45, 0.44, 0.42), 0.4);
        else if (surf.kind === 'gravel') _c1.lerp(_c2.setRGB(0.5, 0.46, 0.38), 0.35);
        else _c1.lerp(_c2.setRGB(0.42, 0.36, 0.27), 0.4);
        r.dirtTint.lerp(_c1, dt * 0.75);
      } else if (!r.grounded) {
        // air: light flaking only
        r.dirt = Math.max(0, r.dirt - dt * 0.01);
      }
      // braking roost cakes the rear
      if (r.grounded && inp.brake && r.v > 8) {
        r.dirt = Math.min(1, r.dirt + dt * 0.04 * surfRate);
      }
      // wet fades; while wet grime reads darker / soaked
      if (r.wet > 0) r.wet = Math.max(0, r.wet - dt * 0.28);
      if (r.wet > 0.02) {
        _c1.copy(r.dirtTint).multiplyScalar(1 - r.wet * 0.5);
        r.rig.dirt.set(Math.max(r.dirt, r.wet * 0.6), _c1);
      } else {
        r.rig.dirt.set(r.dirt, r.dirtTint);
      }
    }

    // ---- fore/aft weight shift. Riders get back over the rear wheel on
    // steeps and under braking, and move forward to drive on the flat.
    // This is the body language layer: readable from chase cam at speed.
    let wTarget = 0;
    wTarget -= clamp01((pitch - 0.14) / 0.20) * 0.85;      // steepness
    if (inp.brake) wTarget -= 0.85;                         // hard hang-back
    if (inp.tuck) wTarget += 0.40;
    if (inp.pedal && r.v < 22) wTarget += 0.50;             // drive forward
    if (inp.boost && r.grounded) wTarget += 0.55;           // attack lean
    // landing: squat over the bike for a beat (absorb impact)
    if (r.landTimer > 0) wTarget -= 0.35 * clamp01(r.landTimer * 4);
    if (!r.grounded) wTarget = wTarget * 0.3 - 0.15;
    if (r.stun > 0) wTarget -= 0.3;
    wTarget += r.stWeight;                                  // personal stance
    r.weight = damp(r.weight, clamp(wTarget, -1, 1), 5.2 * r.stTwitch, dt);
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
        this.boostSys.gain(r.stateT * 6);
        this.popup(`DRIFT +${Math.round(pts)}`, 'sub', null, '#7ef7ff');
      }
    }
  }

  private respawn(r: Racer) {
    const trk = this.track;
    // snap to last checkpoint so a cliff fall doesn't re-spawn mid-void
    if (r.isPlayer) {
      const cp = this.checkpoints.lastBefore(r.s);
      if (cp && r.s - cp.s > 18) {
        r.s = cp.s + 6;
        r.x = cp.x;
      }
    }
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
          // heavy landings pack dirt onto the bike
          r.dirt = Math.min(1, r.dirt + dust * 0.08);
          _c1.setHex(this.track.zoneAt(r.s).dirt);
          r.dirtTint.lerp(_c1, dust * 0.35);
        }
        // speed physics: reward smooth landings
        r.v -= impact * 0.11 * (1 - landQual) * 2.2;
        if (slopeF < -0.05) r.v += Math.min(4.5, impact * 0.10);
        // rear-wheel-first is the clean way down: keeps drive, stays settled
        const cleanRear = r.chassisPitch < -0.08 && r.chassisPitch > -0.42;
        if (cleanRear) {
          r.v += Math.min(2.6, impact * 0.06);
          if (r.isPlayer && impact > 9) {
            this.style = Math.min(1, this.style + 0.2);
            this.boostSys.add('cleanLanding');
          }
        }
        // sell big clean airs: FOV punch + STOMPED callout + brief slow-mo
        if (r.isPlayer && air > 0.9 && landQual > 0.55 && !misaligned) {
          this.rig.punchFov(6, 92);
          this.shakeAdd(0.35);
          this.boostSys.add('cleanLanding', 1.4);
          this.popup(landQual > 0.78 ? 'STOMPED!' : 'CLEAN', 'sub', null,
            landQual > 0.78 ? '#c0f000' : '#7ef7c8');
          if (air > 1.35 && landQual > 0.7) this.slowmo = Math.max(this.slowmo, 0.28);
        }
        r.v = Math.max(0, r.v);
      }
      this.airSpin = this.airFlip = this.airPose = 0;
      this.airPeak = 0;
      this.styleHeld.clear();
      this.styleActive.clear();
      this.whipAngle = 0;
      this.barAngle = 0;
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
    if (this.invincible && cause !== CrashCause.OFF_TRACK) {
      // still shove and flash so the hit reads, but stay upright
      p.v *= 0.85;
      p.stun = 0.15;
      this.shakeAdd(0.3);
      this.hud.hitFlash = 0.4;
      return;
    }
    const P = CRASH_PROFILES[cause];
    p.crash = P.duration;
    p.crashMax = P.duration;
    p.recover = 0;
    p.crashSpin = 0;
    p.ragdoll = startRagdoll(cause, dir);
    // off-track keeps its momentum (you're falling, not stopping)
    p.v *= cause === CrashCause.OFF_TRACK ? 0.72 : 0.22;
    p.vy = P.pop;
    // crash cakes the bike — impact dust sticks
    p.dirt = Math.min(1, p.dirt + 0.18 + P.debris * 0.004);
    _c1.setHex(this.track.zoneAt(p.s).dirt).lerp(_c2.setRGB(0.35, 0.28, 0.2), 0.4);
    p.dirtTint.lerp(_c1, 0.7);

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
    r.dirt = Math.min(1, r.dirt + 0.14);
    if (Math.abs(r.s - this.player.s) < 120) this.spawnCrashDebris(r, P.debris * 0.6);
  }

  // -------------------------------------------------------------------------
  private stepAI(r: Racer, dt: number, live: boolean) {
    const trk = this.track;
    if (!live && this.hud.phase !== 'countdown') { this.poseRacer(r, dt, 0); return; }
    if (this.hud.phase === 'countdown') { this.poseRacer(r, dt, 0); return; }

    // ---- THINK THROTTLE. Planning is the expensive half of the AI (two
    // curvature samples, an obstacle sweep and a corner-limit solve). A
    // rival 300m back doesn't need that at 60Hz — nobody can see them do it.
    // Movement still integrates every frame, so nothing stutters.
    r.thinkCd -= dt;
    if (r.thinkCd > 0) {
      this.stepRacer(r, dt, {
        steer: r.aiSteer, pedal: r.aiPedal, brake: r.aiBrake,
        tuck: r.aiTuck, hop: false, boost: false, live,
      });
      return;
    }
    const dist = Math.abs(r.s - this.player.s);
    r.thinkCd = aiThinkInterval(dist) * this.perfGov.aiScale;

    const hw = trk.halfWidth(r.s);
    const look = r.s + 22 + r.v * 0.55;
    const curvAhead = trk.curvatureAt(look);
    // aim for the inside of the coming corner, plus personality offset
    const B = r.brain;

    // ---- CHAOS AGENT: re-roll intent every few seconds
    r.moodCd -= dt;
    if (B && B.p.id === 'chaos' && r.moodCd <= 0) {
      r.moodCd = 1.6 + Math.random() * 2.8;
      r.mood = chaosRoll(this.rng);
    }
    const moodLine = B?.p.id === 'chaos' ? r.mood.line : 1;
    const moodSwing = B?.p.id === 'chaos' ? r.mood.swing : 1;

    // ---- LINE SELECTION. Competence decides how close to the true apex
    // they get; personality decides whether they care.
    const apex = Math.sign(curvAhead) * Math.min(hw * 0.55, Math.abs(curvAhead) * 2200);
    const quality = clamp01((B ? B.line : r.corner) * moodLine);
    let targetX = apex * quality;
    targetX += r.aiOffset * hw * 0.55 * (1 - quality * 0.6);
    // erratic riders wander; disciplined ones hold their line
    const wander = B ? B.wander : (1.6 - r.corner);
    targetX += Math.sin(this.time * 0.7 + r.aiSeed) * hw * 0.12 * wander;

    // ---- SHORTCUTS. Nerve x skill decides whether they commit, and they
    // stay committed until the exit rather than dithering at the mouth.
    if (B) {
      if (r.scCommit > 0) {
        r.scCommit -= dt;
        const sc = trk.shortcutAt(r.s, r.x) ?? this.nearestShortcut(r.s);
        if (sc) targetX = sc.side * (hw + sc.width * 0.5);
      } else {
        const sc = this.nearestShortcut(r.s);
        if (sc && sc.s0 - r.s > 4 && sc.s0 - r.s < 26 && Math.random() < B.shortcut * dt * 3) {
          r.scCommit = (sc.s1 - r.s) / Math.max(8, r.v) + 0.5;
        }
      }
    }
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

    targetX = clamp(targetX, r.scCommit > 0 ? -hw * 2 : -hw * 0.86,
      r.scCommit > 0 ? hw * 2 : hw * 0.86);
    const rawSteer = clamp((targetX - r.x) * 0.42 - r.vx * 0.18, -1, 1);
    // ---- REACTION DELAY. The honest way to make lower tiers beatable:
    // they want the same thing, they just get there later.
    r.wantSteer = rawSteer;
    const react = B ? B.reaction : 0.2;
    const steer = react > 0.01
      ? damp(r.aiSteer, r.wantSteer, 1 / Math.max(0.02, react), dt)
      : rawSteer;

    // rubber-band: keeps the pack breathing around the player without cheating.
    // bandK is per-difficulty so the band can't erase the difficulty choice.
    const rel = this.player.s - r.s;
    const bk = B ? B.bandK : DIFF_TUNING[this.difficulty].bandK;
    const band2 = clamp(rel * 0.0024 * bk, -0.10 * bk, 0.15 * bk);
    const skill = clamp(r.skill + band2, SKILL_MIN, SKILL_MAX);
    // personality sets the ceiling; the band nudges it
    r.aiCap = B ? B.cap * (1 + band2 * 0.5) : 24.5 + skill * 15;
    // first 30s: pack stays bunched so the holeshot is a real fight, not a parade
    const early = this.raceTime < 28
      ? 1 - clamp01(this.raceTime / 28) * 0.35
      : 1;
    const wantSpeed = r.aiCap * (0.88 + early * 0.12);
    // ---- CORNERING. Higher tiers believe in more grip, so they carry more
    // speed through the same corner rather than simply having a higher cap.
    const grip = B ? B.cornerGrip : 15 + r.corner * 9;
    const cornerLimit = Math.abs(curvAhead) > 0.0002
      ? Math.sqrt(grip / Math.abs(curvAhead)) : 999;
    // ---- RISK MANAGEMENT. Cautious riders brake earlier for real hazards.
    const caution = B ? B.caution : 0.5;
    const hazardAhead = this.aiHazardAhead(r, 12 + r.v * 0.9);
    const brakeFor = hazardAhead ? caution * 0.35 : 0;
    const pedal = r.v < wantSpeed * (1 - brakeFor);
    const brake = (r.v > Math.min(wantSpeed * 1.1, cornerLimit * (1 - caution * 0.12))
      && Math.abs(curvAhead) > 0.008) || (hazardAhead && caution > 0.6);
    const tuck = !brake && Math.abs(curvAhead) < 0.005 && r.v > 18;

    // hop off lips
    // ---- JUMPING. Sendy personalities hop lips; cautious ones roll them.
    r.aiHopCd -= dt;
    let hop = false;
    if (r.grounded && r.aiHopCd <= 0) {
      const h0 = trk.heightAt(r.s, r.x);
      const h1 = trk.heightAt(r.s + 6, r.x);
      const send = B ? B.p.sendiness * (0.5 + B.tier.trickSkill * 0.7) : 0.5;
      if (h1 - h0 > 0.9 && Math.random() < send) { hop = true; r.aiHopCd = 0.8; }
    }
    // ---- TRICKS. Airborne rivals throw rotations if the brain wants to.
    if (!r.grounded && r.airTime > 0.22 && B && r.trickSpin === 0) {
      if (Math.random() < B.trick) {
        // ambition scales with skill: rookies quarter-spin, absurd do flips
        r.trickSpin = (Math.random() < 0.5 ? -1 : 1)
          * (2 + B.tier.trickSkill * 7);
      }
    }
    if (r.grounded) r.trickSpin = 0;
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
        // combat sections crank everyone up; so does the mode;
        // early race also turns up the heat so the pack is a brawl from the gate
        const earlyFight = this.raceTime < 35 ? 1.45 : 1;
        const arena = (this.track.zoneAt(r.s).combat ? 2.3 : 1) * earlyFight;
        const modeK = getMode(this.mode).aggressionScale;
        const Bc = r.brain;
        // THE BONKER hunts the player specifically; others take what's near
        const focus = other.isPlayer ? 1 + (Bc ? Bc.playerFocus * 2.2 : 0) : 1;
        // higher tiers pick their moment: a rider mid-corner or mid-air is
        // far easier to put down, and good AI knows it
        const vulnerable = (!other.grounded || Math.abs(other.vx) > 5) ? 1.8 : 1;
        const timing = Bc ? 1 + (vulnerable - 1) * Bc.tier.combatSkill : 1;
        const rate = (Bc ? Bc.swingRate : r.aggression)
          * spite * arena * modeK * focus * timing * moodSwing;
        if (Math.random() < rate * dt * 1.6) {
          r.bonkCd = 1.6;
          r.bonkSwing = 1;
          r.bonkDir = Math.sign(dx) || 1;
          r.swingT = 0;
          this.resolveContact(r, other, true);
        }
        break;
      }
    }
    // cache the plan so throttled frames can replay it
    r.aiSteer = steer; r.aiPedal = pedal; r.aiBrake = brake; r.aiTuck = tuck;
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

  /**
   * Rider LOD. Outline shells double the mesh count per rig, which is fine
   * for the player and a nearby duel but wasteful for a rival 200m back who
   * is a few pixels tall. Toggling visibility keeps the silhouette where it
   * matters and drops the cost where it doesn't.
   */
  private updateRiderLod() {
    const p = this.player;
    const cut = LOD_BANDS[2] * this.perfGov.lodScale;
    for (const r of this.racers) {
      // Far-off rivals still need to exist for placings, but there is no
      // point submitting a 25-mesh articulated rig for something a few
      // pixels tall. The blob shadow keeps them locatable on the descent bar.
      const near = r.isPlayer || Math.abs(r.s - p.s) < cut;
      if (r.lodNear === near) continue;
      r.lodNear = near;
      r.rig.root.visible = near;
    }
  }

  /** Is there a solid hazard in this rival's path within `reach` metres? */
  private aiHazardAhead(r: Racer, reach: number): boolean {
    const list = this.track.obstacles;
    for (let i = this.track.firstObstacleAfter(r.s); i < list.length; i++) {
      const o = list[i];
      if (o.s - r.s > reach) break;
      if (o.gone || o.mass < 100) continue;
      if (Math.abs(o.x - r.x) < o.r + 1.2) return true;
    }
    return false;
  }

  /** Next shortcut mouth at or ahead of `s`. */
  private nearestShortcut(s: number) {
    let best: import('./track').Shortcut | null = null;
    for (const sc of this.track.shortcuts) {
      if (sc.s1 < s) continue;
      if (!best || sc.s0 < best.s0) best = sc;
      if (sc.s0 > s + 60) break;
    }
    return best;
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

    // ---- apply to the victim. STABILITY resists being thrown around.
    const resist = b.isPlayer ? 1 - this.perf.knockResist : 1;
    b.vx += res.knockX * gain * resist;
    b.v = Math.max(0, b.v * res.victimSpeedMul - res.knockS * 0.1);
    if (res.knockY > 0.4 && b.grounded) { b.vy += res.knockY * gain * resist; b.grounded = false; }
    b.stun = Math.max(b.stun, (0.4 + res.power * 0.5) * resist);
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

    // contact dirt: both bikes pick up a bit of trail colour on impact
    const dirtHit = 0.04 + res.power * 0.06;
    a.dirt = Math.min(1, a.dirt + dirtHit * 0.6);
    b.dirt = Math.min(1, b.dirt + dirtHit);
    _c1.setHex(trk.zoneAt(b.s).dirt);
    a.dirtTint.lerp(_c1, 0.25);
    b.dirtTint.lerp(_c1, 0.4);

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
    const pan = clamp(-Math.sign(res.knockX) * 0.5, -1, 1);
    if (res.type === BonkType.MEGA) audio.megaBonk(clamp(0.7 + res.power, 0.6, 1.5), pan);
    else audio.bonk(clamp(0.6 + res.power, 0.5, 1.5), pan);
    audio.duck(mega ? 0.6 : 0.42, mega ? 0.55 : 0.38);
    this.hitStop = (mega ? 0.11 : 0.07) + res.power * 0.04;
    this.shakeAdd((mega ? 0.9 : 0.55) + res.power * 0.4);
    this.bonks++;
    this.addCombo();

    const pts = res.score * this.comboMult() * (deliberate ? 1 : 0.6);
    this.addScore(pts);
    if (mega) this.boostSys.add('megaBonk', res.boost / 34);
    else this.boostSys.add('bonk', res.boost / 13);
    this.style = Math.min(1, this.style + (mega ? 0.5 : 0.3));

    this.popupAt(world, `${flavour}  +${Math.round(pts)}`, res.colour, mega ? 34 : 28);
    // MEGA/WALL power floor so the impact ring always reads larger/brighter
    this.spawnImpactBurst(world, Math.sign(res.knockX), (mega ? 1.25 : 0.6) + res.power);
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
    this.boostSys.add('bonk');
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
            this.boostSys.add('prop', (PROP_BOOST[o.type] ?? 5) / 6);
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
          this.boostSys.add('prop');
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
    // wet tyres: water darkens the bike for a few seconds after exit
    if (info.spray === 'water') {
      r.wet = 1;
      r.dirt = Math.min(1, r.dirt + 0.04);
    } else if (info.spray === 'snow') {
      // powder brightens / lightens the tint briefly
      r.dirtTint.lerp(_c2.setRGB(0.85, 0.88, 0.92), 0.25);
      r.dirt = Math.min(1, r.dirt + 0.03);
    }
    const trk = this.track;
    // slow and destabilise while in it
    r.v -= info.drag * 0.55 * this.lastDt * 6;
    r.vx *= 1 - (1 - info.grip) * 0.4 * this.lastDt * 6;

    const snow = info.spray === 'snow';
    const rate = clamp01(r.v / 26) * (snow ? 42 : 60) * this.perfGov.particleScale;
    // heavy droplets thrown clear of the wheel — reads as water weight,
    // where the soft sheet alone reads as fog
    if (!snow && Math.random() < this.lastDt * rate * 0.5) {
      this.track.frameAt(r.s, _f1, _f2, _f3);
      const w = this.track.worldPos(r.s - 0.4, r.x, r.y + 0.1, _v1);
      for (let i = 0; i < 3; i++) {
        this.sparkPool.spawn({
          pos: w.clone(),
          vel: _f2.clone().multiplyScalar(this.rng.range(-7, 7))
            .addScaledVector(_f3, this.rng.range(4, 10))
            .addScaledVector(_f1, -r.v * 0.18),
          life: this.rng.range(0.3, 0.7),
          size: this.rng.range(0.08, 0.2), endSize: 0.03,
          color: _c1.setRGB(0.80, 0.92, 1.0),
          alpha: 0.9, gravity: 22, drag: 0.5,
        });
      }
    }
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
        this.nearMisses++;
        this.addScore(90 * this.comboMult());
        this.boostSys.add('nearMiss');
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
        this.boostSys.add('draft', dt);
        this.style = Math.min(1, this.style + 0.12 * dt);
        break;
      }
    }
  }

  // -------------------------------------------------------------------------
  /** Build the tally of everything the rider did this air. */
  private currentTally(air: number): TrickTally {
    return {
      spinSteps: spinSteps(this.airSpin),
      flipCount: Math.floor(Math.abs(this.airFlip) / TAU + 0.18),
      flipBack: this.airFlip < 0,
      styles: this.styleHeld,
      airTime: air,
    };
  }

  private scoreTrick(air: number, impact: number) {
    const res = scoreTrick(this.currentTally(air));
    if (!res) return;

    let pts = res.score;
    // clean landing bonus
    pts *= 0.75 + clamp01(1 - impact / 34) * 0.5;
    pts *= this.comboMult();

    this.tricksLanded++;
    this.addCombo();
    this.addScore(pts * getMode(this.mode).trickScale);
    this.boostSys.add('trick', clamp((14 + pts / 42) / 14, 0.7, 3.2));
    this.style = 1;
    if (pts > this.bestTrickScore) { this.bestTrickScore = pts; this.bestTrick = res.name; }

    const label = res.bonusLabel
      ? `${res.name}\n${res.bonusLabel}  +${Math.round(pts)}`
      : `${res.name}  +${Math.round(pts)}`;
    this.popup(label, 'trick', null, res.channels >= 3 ? '#c0f000' : '#7ef7ff');
    audio.chime(Math.min(10, res.channels * 3 + Math.floor(pts / 500)));
    audio.cheer(clamp01(pts / 1600));
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
      this.boostSys.add('shortcut');
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
    // Landing squat + brake hang-back + accel attack are layered on top so
    // the rider never reads as a rigid mannequin bolted to the frame.
    const landCrouch = r.landTimer > 0 ? clamp01(r.landTimer * 3.2) * 0.14 : 0;
    const pitchTarget = (r.grounded ? clamp(-r.vy * 0.012, -0.16, 0.16) : clamp(-r.vy * 0.016, -0.3, 0.3))
      - r.chassisPitch
      + landCrouch
      + clamp01(-r.weight) * 0.06
      - clamp01(r.weight) * 0.05;
    rig.body.rotation.x = damp(rig.body.rotation.x, pitchTarget, 14, dt);
    rig.body.position.y = r.suspension * 0.35 - landCrouch * 0.55;

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

    // style weights for IK / trick layers (player only)
    let styleSuperman = 0, styleNoHand = 0, styleOneFoot = 0;
    // trick rotations for the player
    if (r.isPlayer) {
      rig.spin.rotation.y = damp(rig.spin.rotation.y, this.airSpin, 30, dt);
      rig.flip.rotation.x = damp(rig.flip.rotation.x, this.airFlip, 26, dt);
      const A = this.styleActive;
      const on = (s: StyleTrick) => (A.has(s) ? 1 : 0);
      styleSuperman = clamp01(this.airPose * 3) * on(StyleTrick.SUPERMAN);
      styleNoHand = on(StyleTrick.NO_HANDER);
      styleOneFoot = on(StyleTrick.ONE_FOOTER);
      const table = on(StyleTrick.TABLETOP);
      const whip = on(StyleTrick.TAILWHIP);
      const bars = on(StyleTrick.BARSPIN);
      const D = 11;

      // tabletop: whole bike laid flat sideways under the rider
      rig.bike.rotation.z = damp(rig.bike.rotation.z, table * 1.15, D, dt);
      rig.bike.rotation.y = damp(rig.bike.rotation.y, table * 0.25, D, dt);

      // tailwhip: the frame rotates around the steerer
      this.whipAngle += whip * 13 * dt;
      if (!whip) this.whipAngle = damp(this.whipAngle,
        Math.round(this.whipAngle / TAU) * TAU, 9, dt);
      rig.swingarm.rotation.y = this.whipAngle;

      // barspin: bars spin; fork yaw applied later with steer for IK
      this.barAngle += bars * 15 * dt;
      if (!bars) this.barAngle = damp(this.barAngle,
        Math.round(this.barAngle / TAU) * TAU, 11, dt);
    }
    if (!r.isPlayer && !r.grounded && r.trickSpin !== 0) {
      // rival is committed to a trick: spin it, then unwind on touchdown
      r.trickAngle += r.trickSpin * dt;
      const flipper = Math.abs(r.trickSpin) > 6;
      if (flipper) rig.flip.rotation.x = r.trickAngle;
      else rig.spin.rotation.y = r.trickAngle;
    } else if (!r.isPlayer && !r.grounded && r.airTime > 0.35) {
      rig.flip.rotation.x = damp(rig.flip.rotation.x, -Math.min(r.airTime, 0.9) * 0.55, 8, dt);
    } else if (!r.isPlayer) {
      r.trickAngle = damp(r.trickAngle, 0, 12, dt);
      rig.flip.rotation.x = damp(rig.flip.rotation.x, 0, 9, dt);
      rig.spin.rotation.y = damp(rig.spin.rotation.y, 0, 9, dt);
    }
    // Chest pitch base: CHEST_ATTACK + weight/superman deltas (pelvis carries main lean).
    // Positive pitch = forward lean; brake opens up, accel tucks, superman flattens.
    _poseTorsoBase = r.crash <= 0
      ? ATTACK_PITCH
        - clamp01(-r.weight) * 0.10 + clamp01(r.weight) * 0.08
        - styleSuperman * 0.22
      : rig.torso.rotation.x;

    // crash tumble — cause-specific body + secondary limb motion
    if (r.crash > 0) {
      const rd = r.ragdoll;
      if (rd) {
        rig.flip.rotation.x = rd.pitch;
        rig.spin.rotation.y = rd.yaw;
        rig.lean.rotation.z = rd.roll;
        rig.body.rotation.x = 0;
        const lim = sampleRagdollLimbs(rd, this.time);
        rig.armL.rotation.set(lim.armL[0], lim.armL[1], lim.armL[2]);
        rig.armR.rotation.set(lim.armR[0], lim.armR[1], lim.armR[2]);
        rig.foreL.rotation.set(lim.foreL, 0, 0);
        rig.foreR.rotation.set(lim.foreR, 0, 0);
        rig.legL.rotation.set(lim.legL[0], lim.legL[1], lim.legL[2]);
        rig.legR.rotation.set(lim.legR[0], lim.legR[1], lim.legR[2]);
        rig.shinL.rotation.set(lim.shinL, 0, 0);
        rig.shinR.rotation.set(lim.shinR, 0, 0);
        rig.head.rotation.set(lim.headX, lim.headY, 0);
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
    const barSpin = r.isPlayer ? this.barAngle : 0;
    rig.fork.rotation.y = r.steerVis + barSpin;
    r.wheelSpin += r.v * dt / WHEEL_R;
    rig.frontWheel.rotation.x = r.wheelSpin;
    rig.rearWheel.rotation.x = r.wheelSpin;
    // ---- drivetrain ---------------------------------------------------
    if (r.pedalling > 0.02) {
      rig.cranks.rotation.x = r.crankAngle;
    } else {
      // Freewheel to horizontal pedals (π/2 + nπ) so rest stance isn't one-foot-up.
      const level = Math.round((r.crankAngle - Math.PI * 0.5) / Math.PI) * Math.PI + Math.PI * 0.5;
      r.crankAngle = damp(r.crankAngle, level, 7, dt);
      rig.cranks.rotation.x = r.crankAngle;
    }

    // A ragdoll owns every limb outright.
    if (r.crash > 0 && r.ragdoll) {
      r.steerVis = damp(r.steerVis, 0, 6, dt);
      rig.fork.rotation.y = r.steerVis;
      const cgh = trk.heightAt(r.s, r.x);
      rig.shadow.position.copy(trk.worldPos(r.s, r.x, cgh + 0.05, _v2));
      rig.shadow.quaternion.setFromRotationMatrix(_m1.makeBasis(right, up, fwd));
      rig.shadow.rotateX(-Math.PI / 2);
      const cAir = clamp01((r.y - cgh) / 8);
      const csc = 1 + cAir * 1.7;
      rig.shadow.scale.set(csc, csc, 1);
      (rig.shadow.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - cAir * 0.7);
      rig.contactF.visible = false;
      rig.contactR.visible = false;
      return;
    }

    // ---- body stance + bonk (before IK so shoulders move with the spine) ---
    const st = r.steerVis;
    let bonkArm = 0;
    const vp = r.finishPose;
    // Suspension fold + landing pulse + brake crouch + air crouch → knees/elbows.
    // Absorb only drops the pelvis chain; hands/feet stay locked to anchors.
    const landPulse = r.landTimer > 0 ? clamp01(r.landTimer * 3.5) * 0.42 : 0;
    const brakeFold = r.grounded && r.weight < -0.35 ? clamp01(-r.weight) * 0.14 : 0;
    const airCrouch = !r.grounded && r.airTime > 0.08
      ? clamp01(r.airTime * 2.2) * 0.22 + clamp01(-r.vy * 0.04) * 0.15
      : 0;
    // High speed: slightly more loaded athletic posture
    const speedLoad = r.grounded ? clamp01((r.v - 18) / 40) * 0.08 : 0;
    const absorb = r.crash <= 0
      ? clamp(-r.suspension * 1.45 + landPulse + brakeFold + airCrouch + speedLoad, 0, 0.88)
      : 0;

    let chestYawTarget = -st * 0.18 - r.lean * 0.06;
    let bonkWeightBias = 0;
    if (r.bonkSwing > 0) {
      r.bonkSwing -= dt * 4.2;
      const t = clamp01(r.bonkSwing);
      const swing = Math.sin(t * Math.PI) * 1.55 * r.bonkDir;
      bonkArm = r.bonkDir < 0 ? -1 : 1;
      // Directional body reaction: bike + torso + hips, not a teleport
      rig.bike.rotation.y = -swing * 0.28;
      rig.bike.rotation.z = swing * 0.18;
      rig.fork.rotation.y = st - swing * 0.35;
      // thrown slightly open (less attack) on impact, recovers with the swing
      _poseTorsoX = -0.12 * Math.sin(t * Math.PI);
      _poseHeadX = -0.18 * Math.sin(t * Math.PI);
      chestYawTarget = swing * 0.42;
      bonkWeightBias = -0.35 * Math.sin(t * Math.PI);
    } else {
      _poseTorsoX = vp > 0.01 ? -0.3 * vp : 0;
      _poseHeadX = vp > 0.01 ? -0.35 * vp : 0;
      // airborne: slight forward attack so the rider doesn't sit upright in the air
      if (!r.grounded && r.airTime > 0.1 && styleSuperman < 0.2) {
        _poseTorsoX += 0.06 * clamp01(r.airTime);
      }
      rig.bike.rotation.y = damp(rig.bike.rotation.y, 0, 10, dt);
      if (r.grounded) rig.bike.rotation.z = damp(rig.bike.rotation.z, 0, 10, dt);
    }

    if (r.crash <= 0) {
      // Single damp pass into the skeletal stance driver — no position hacks.
      const pitch = damp(rig.torso.rotation.x, _poseTorsoBase + _poseTorsoX, 7.5, dt);
      const yaw = damp(rig.torso.rotation.y, chestYawTarget, 9, dt);
      applyRiderStance(rig, {
        chestPitch: pitch,
        chestYaw: yaw,
        weight: clamp(r.weight + bonkWeightBias, -1, 1),
        absorb,
        superman: styleSuperman,
        lean: r.lean,
      });
    }

    // ---- two-bone IK: hands→grips, feet→pedals (anchor matrix space) ---
    if (r.crash <= 0) {
      solveRiderIK(rig, {
        handOffL: styleNoHand,
        handOffR: Math.max(styleNoHand, vp),
        footOffR: styleOneFoot,
        superman: styleSuperman,
        bonkArm: bonkArm || undefined,
        lockLegs: styleSuperman > 0.85,
        absorb,
        lean: r.lean,
      });

      // bonk: swinging arm overrides IK after solve; opposite arm stays on bars
      if (bonkArm !== 0) {
        const swing = Math.sin(clamp01(r.bonkSwing) * Math.PI) * 1.55 * r.bonkDir;
        const swingA = bonkArm < 0 ? rig.armL : rig.armR;
        const swingF = bonkArm < 0 ? rig.foreL : rig.foreR;
        swingA.rotation.set(-0.35, swing * 0.7, -swing * 1.05);
        swingF.rotation.set(0.45, 0, 0);
      }

      // victory arm raise
      if (vp > 0.01) {
        rig.armR.rotation.set(-0.5 * vp, 0, -2.15 * vp);
        rig.foreR.rotation.set(0, 0, 0);
      }

      // superman / one-footer when fully released from pedals
      if (styleSuperman > 0.85) {
        rig.legL.rotation.set(styleSuperman * 1.2, 0, 0);
        rig.legR.rotation.set(styleSuperman * 1.2, 0, 0);
        rig.shinL.rotation.set(-styleSuperman * 0.15, 0, 0);
        rig.shinR.rotation.set(-styleSuperman * 0.15, 0, 0);
      } else if (styleOneFoot > 0.85) {
        rig.legR.rotation.set(styleOneFoot * 1.1, 0, styleOneFoot * 0.85);
        rig.shinR.rotation.set(-0.2, 0, 0);
      }
    }

    // ---- head: look where you're going --------------------------------
    const lookTarget = r.crash > 0
      ? 0
      : clamp((-trk.curvatureAt(r.s + 20 + r.v * 0.5) * 34 - r.yaw * 0.5) * r.stHead,
        -0.75, 0.75);
    r.headYaw = damp(r.headYaw, lookTarget, 5 * r.stTwitch, dt);
    rig.head.rotation.y = r.headYaw;
    const chinAir = r.grounded ? 0 : clamp(-r.vy * 0.012, -0.22, 0.22);
    rig.head.rotation.x = damp(rig.head.rotation.x, chinAir + _poseHeadX, 6, dt);

    // Soft contact shadow — offset slightly down-sun (golden-hour raking)
    // so the blob reads as a real cast shadow, not a sticker under the bike.
    const gh = trk.heightAt(r.s, r.x);
    const sunOffS = -0.35; // along-track, opposite the key light
    const sunOffX = 0.28;
    const sPos = trk.worldPos(r.s + sunOffS, r.x + sunOffX, gh + 0.04, _v2);
    rig.shadow.position.copy(sPos);
    rig.shadow.quaternion.setFromRotationMatrix(_m1.makeBasis(right, up, fwd));
    rig.shadow.rotateX(-Math.PI / 2);
    const airH = clamp01((r.y - gh) / 8);
    const sc = 1 + airH * 1.9;
    // stretch with lean so banked turns still plant a readable footprint
    rig.shadow.scale.set(sc * (1 + Math.abs(r.lean) * 0.15), sc * (1.05 + Math.abs(r.yaw) * 0.2), 1);
    (rig.shadow.material as THREE.MeshBasicMaterial).opacity =
      0.82 * (1 - airH * 0.75) * (r.grounded ? 1 : 0.55 + (1 - airH) * 0.45);

    // ---- per-wheel contact patches -------------------------------------
    // These sit at the real axle offsets and conform to the ground, so the
    // bike reads as planted rather than floating over a single blob.
    const lift = clamp01((r.y - gh) / 1.1);          // tight fade with height
    const contactOn = r.crash <= 0 && lift < 1;
    const place = (m: THREE.Mesh, ds: number, spread: number, load: number) => {
      m.visible = contactOn;
      if (!contactOn) return;
      const cs = r.s + ds + sunOffS * 0.4;
      const cx = r.x + sunOffX * 0.35;
      const cy = trk.heightAt(cs, cx);
      m.position.copy(trk.worldPos(cs, cx, cy + 0.035, _v3));
      trk.frameAt(cs, _f1, _f2, _f3);
      m.quaternion.setFromRotationMatrix(_m1.makeBasis(_f2, _f3, _f1));
      m.rotateX(-Math.PI / 2);
      // smears out and softens as the wheel unweights; darkens under load
      const s2 = spread * (1 + lift * 1.6) * (0.85 + load * 0.35);
      m.scale.set(s2 * (1 + Math.abs(r.vx) * 0.018), s2 * (1.1 + Math.abs(r.vx) * 0.03), 1);
      (m.material as THREE.MeshBasicMaterial).opacity =
        (0.55 + load * 0.35) * (1 - lift) * (1 - lift);
    };
    // weight bias: braking loads rear, accel/boost loads front
    const frontLoad = clamp01(0.55 + r.weight * 0.45 + (r.chassisPitch > 0 ? 0.2 : 0));
    const rearLoad = clamp01(0.55 - r.weight * 0.45 + (r.chassisPitch < 0 ? 0.25 : 0));
    place(rig.contactF, FRONT_AXLE_POS.z, 1, frontLoad);
    place(rig.contactR, REAR_AXLE_POS.z, 1.15, rearLoad);
  }

  // -------------------------------------------------------------------------
  private playerFx(r: Racer, dt: number, inp: { steer: number; brake: boolean; boost: boolean }, surf: { roost: number; kind: string }) {
    const trk = this.track;
    const zone = trk.zoneAt(r.s);
    const dirtColor = _c1.setHex(zone.dirt);

    // roost from rear wheel — volume is a property of the state
    const stRoost = roostFactor(r.state);
    const pScale = this.perfGov.particleScale;
    if (stRoost > 0 && r.v > 4) {
      const slip = Math.abs(r.vx) + Math.abs(inp.steer) * r.v * 0.14;
      const rate = (2 + slip * 2.4 + r.v * 0.5) * surf.roost * stRoost * pScale;
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
      if (r.v > 12 && Math.random() < dt * (10 + r.v * 0.9) * surf.roost * pScale) {
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
    // ---- MUD. Heavy, dark clods that arc and land, distinct from dust.
    // Rate scales with how hard the tyre is working, so cruising through
    // mud throws less than powering or sliding through it.
    if (surf.kind === 'mud' && stRoost > 0 && r.v > 8) {
      const work = clamp01((Math.abs(r.vx) * 0.1) + (r.pedalling * 0.5) + 0.25);
      if (Math.random() < dt * 20 * work * pScale) {
        const rear = trk.worldPos(r.s - 0.6, r.x, r.y + 0.1, _v1);
        trk.frameAt(r.s, _f1, _f2, _f3);
        this.dirtPool.spawn({
          pos: rear.clone(),
          vel: _f3.clone().multiplyScalar(this.rng.range(3, 8))
            .addScaledVector(_f2, this.rng.range(-3, 3))
            .addScaledVector(_f1, -r.v * 0.15),
          life: this.rng.range(0.7, 1.1),
          size: this.rng.range(0.26, 0.42), endSize: 0.12,
          color: _c2.setHex(0x3a3021), alpha: 1,
          gravity: 24, drag: 0.7, spin: this.rng.range(-8, 8),
          bounce: 0.2,
        });
      }
    }

    // ---- BOOST TRAIL --------------------------------------------------
    // Brand speed language: elongated gold/orange ribbon + cooler embers,
    // not a fire hose. Sparse enough that the rider stays readable.
    if (inp.boost) {
      trk.frameAt(r.s, _f1, _f2, _f3);
      const back = trk.worldPos(r.s - 1.05, r.x, r.y + 0.38, _v1);
      const n = Math.max(1, Math.round(2 * pScale));
      for (let i = 0; i < n; i++) {
        const side = this.rng.range(-0.35, 0.35);
        this.sparkPool.spawn({
          pos: back.clone()
            .addScaledVector(_f2, side)
            .addScaledVector(_f3, this.rng.range(0.05, 0.45)),
          // stretch opposite travel so the trail reads as a streak
          vel: _f1.clone().multiplyScalar(-this.rng.range(10, 22) - r.v * 0.18)
            .addScaledVector(_f3, this.rng.range(0.2, 1.6))
            .addScaledVector(_f2, side * 1.4),
          life: this.rng.range(0.16, 0.38),
          size: this.rng.range(0.55, 1.45), endSize: 0.04,
          color: _c2.setRGB(1, this.rng.range(0.55, 0.95), 0.12),
          endColor: _c1.setRGB(1, 0.12, 0.02),
          alpha: 0.92, gravity: -3.5, drag: 1.8,
        });
      }
      // soft heat haze ribbon (smoke pool, additive-ish warm colour)
      if (Math.random() < dt * 28 * pScale) {
        this.smokePool.spawn({
          pos: back.clone().addScaledVector(_f2, this.rng.range(-0.25, 0.25)),
          vel: _f1.clone().multiplyScalar(-r.v * 0.22 - 4)
            .addScaledVector(_f3, this.rng.range(0.3, 1.2)),
          life: this.rng.range(0.22, 0.48),
          size: this.rng.range(0.45, 0.9), endSize: this.rng.range(1.6, 3.2),
          color: _c1.setRGB(1, 0.72, 0.28),
          endColor: _c2.setRGB(1, 0.35, 0.05),
          alpha: 0.38, gravity: -2, drag: 2.4,
        });
      }
    }

    // ---- WET TIRE SPRAY -----------------------------------------------
    // After water/puddles, tyres keep flinging dark spray until wet fades.
    // Distinct from roost dust: cooler, wetter, smaller droplets.
    if (r.wet > 0.08 && r.grounded && r.v > 5) {
      const wk = clamp01(r.wet) * clamp01(r.v / 24);
      if (Math.random() < dt * (18 + r.v * 0.8) * wk * pScale) {
        trk.frameAt(r.s, _f1, _f2, _f3);
        const rear = trk.worldPos(r.s - 0.55, r.x, r.y + 0.12, _v1);
        for (let i = 0; i < 2; i++) {
          this.sparkPool.spawn({
            pos: rear.clone().addScaledVector(_f2, this.rng.range(-0.25, 0.25)),
            vel: _f1.clone().multiplyScalar(-r.v * this.rng.range(0.12, 0.28))
              .addScaledVector(_f2, this.rng.range(-5, 5))
              .addScaledVector(_f3, this.rng.range(2.5, 7)),
            life: this.rng.range(0.22, 0.5),
            size: this.rng.range(0.06, 0.16), endSize: 0.02,
            color: _c1.setRGB(0.55, 0.62, 0.68).multiplyScalar(0.7 + r.wet * 0.3),
            alpha: 0.75, gravity: 20, drag: 0.7,
          });
        }
        if (Math.random() < 0.45) {
          this.smokePool.spawn({
            pos: rear.clone(),
            vel: _f1.clone().multiplyScalar(-r.v * 0.1)
              .addScaledVector(_f3, this.rng.range(0.8, 2.2)),
            life: this.rng.range(0.3, 0.65),
            size: this.rng.range(0.35, 0.7), endSize: this.rng.range(1.2, 2.4),
            color: _c1.setRGB(0.62, 0.68, 0.72),
            alpha: 0.28 * r.wet, gravity: 4, drag: 1.8,
          });
        }
      }
    }

    // Wind motes — speed cue only above a real threshold.
    const windK = clamp01((r.v - 20) / 22) * (this.boosting ? 1.55 : 1);
    if (windK > 0.05) {
      this.moteAccum += dt * windK * 14 * pScale;
      while (this.moteAccum > 1) {
        this.moteAccum -= 1;
        const ahead = trk.worldPos(
          r.s + this.rng.range(14, 40), r.x + this.rng.range(-14, 14),
          trk.heightAt(r.s + 22, r.x) + this.rng.range(0.5, 8), _v1);
        trk.frameAt(r.s, _f1, _f2, _f3);
        this.smokePool.spawn({
          pos: ahead.clone(),
          vel: _f1.clone().multiplyScalar(-this.rng.range(2, 8) - r.v * 0.08)
            .addScaledVector(_f2, this.rng.range(-1.5, 1.5)),
          life: this.rng.range(0.4, 0.9), size: 0.06, endSize: 0.015,
          color: _c2.setRGB(1, 0.98, 0.92), alpha: 0.4 + windK * 0.2,
          gravity: 0.3, drag: 0.15,
        });
      }
    }

    // Speed streaks — short additive dashes past the camera path, only at
    // high speed / boost. Readability first: sparse, brief, no screen wash.
    if (r.v > 28 && !this.reducedMotion) {
      const sk = clamp01((r.v - 28) / 18) * (this.boosting ? 1.8 : 1);
      this.streakAccum += dt * sk * 22 * pScale;
      trk.frameAt(r.s, _f1, _f2, _f3);
      while (this.streakAccum > 1) {
        this.streakAccum -= 1;
        const side = this.rng.range(-6, 6);
        const up = this.rng.range(0.3, 4.5);
        const along = this.rng.range(2, 14);
        const pos = trk.worldPos(r.s + along, r.x + side, r.y + up, _v1);
        this.sparkPool.spawn({
          pos: pos.clone(),
          // streak opposite travel so they whip past
          vel: _f1.clone().multiplyScalar(-r.v * this.rng.range(0.55, 1.1))
            .addScaledVector(_f2, this.rng.range(-2, 2)),
          life: this.rng.range(0.08, 0.18),
          size: this.rng.range(0.35, 1.1), endSize: 0.02,
          color: _c1.setRGB(1, 0.97, 0.9),
          endColor: _c2.setRGB(0.85, 0.9, 1),
          alpha: 0.35 + sk * 0.35, gravity: 0, drag: 0.4,
        });
      }
    }
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
    const pk = Math.max(0.5, this.perfGov.particleScale);
    const n = Math.floor((10 + amount * 40) * pk);
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
    for (let i = 0; i < (8 + amount * 14) * pk; i++) {
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
    const mega = power >= 1.15;
    const megaK = mega ? 1 : 0;
    const pk = Math.max(0.55, this.perfGov.particleScale);
    const nSpark = Math.floor((mega ? 32 : 22) * pk);
    for (let i = 0; i < nSpark; i++) {
      const a = this.rng.range(0, TAU), b = this.rng.range(-0.4, 1);
      this.sparkPool.spawn({
        pos: world.clone(),
        vel: new THREE.Vector3(
          Math.cos(a) * (6 + megaK * 4) * power + dir * (5 + megaK * 3),
          b * (8 + megaK * 4) + 3,
          Math.sin(a) * (6 + megaK * 4) * power),
        life: this.rng.range(0.16, mega ? 0.55 : 0.42),
        size: this.rng.range(0.25, mega ? 1.2 : 0.9), endSize: 0.02,
        color: mega
          ? _c1.setRGB(1, this.rng.range(0.55, 0.95), this.rng.range(0.55, 0.95))
          : _c1.setRGB(1, this.rng.range(0.8, 1), this.rng.range(0.3, 0.7)),
        endColor: mega ? _c2.setRGB(1, 0.18, 0.55) : _c2.setRGB(1, 0.35, 0.05),
        alpha: 1, gravity: 12, drag: 1.6,
      });
    }
    const nSmoke = Math.floor((mega ? 16 : 10) * pk);
    for (let i = 0; i < nSmoke; i++) {
      this.smokePool.spawn({
        pos: world.clone(),
        vel: new THREE.Vector3(this.rng.range(-4, 4) + dir * 3, this.rng.range(0, 5), this.rng.range(-4, 4)),
        life: this.rng.range(0.3, mega ? 0.95 : 0.7), size: mega ? 0.7 : 0.5, endSize: mega ? 3.8 : 2.6,
        color: mega ? _c1.setRGB(1, 0.85, 0.95) : _c1.setRGB(1, 0.95, 0.85),
        alpha: mega ? 0.58 : 0.5, gravity: -1, drag: 2.4,
      });
    }
    // dirt clods on heavy hits — physical comedy, not gore
    if (power > 0.7) {
      const zone = this.track.zoneAt(this.player.s);
      for (let i = 0; i < Math.floor(8 * pk * power); i++) {
        const a = this.rng.range(0, TAU);
        const sp = this.rng.range(3, 10) * power;
        this.dirtPool.spawn({
          pos: world.clone().add(new THREE.Vector3(0, 0.2, 0)),
          vel: new THREE.Vector3(Math.cos(a) * sp + dir * 4, this.rng.range(2, 8), Math.sin(a) * sp),
          life: this.rng.range(0.4, 1.0),
          size: this.rng.range(0.12, 0.32), endSize: 0.06,
          color: _c1.setHex(zone.dirt).multiplyScalar(this.rng.range(0.7, 1.15)),
          alpha: 1, gravity: 24, drag: 0.75, spin: this.rng.range(-12, 12),
          bounce: 0.25,
        });
      }
    }
    // expanding gold/white ring — the brand "IMPACT" glyph for a BONK
    this.spawnImpactRing(world, power, 0xffd060);
    // MEGA: second hot-pink ring (brand punch) — offset slightly so it
    // reads as a double-hit rather than a thicker single ring
    if (mega) {
      this.spawnImpactRing(world, power * 0.85, 0xff2e88, 0.12);
    }
  }

  /**
   * Grab a pooled ring and fire it from `world`. Higher `power` (MEGA / wall)
   * expands farther, lasts a beat longer, and burns brighter white-gold.
   * Optional `colorHex` + `yLift` for dual-ring MEGA brand language.
   */
  private spawnImpactRing(world: THREE.Vector3, power: number, colorHex = 0xffd060, yLift = 0) {
    let ring: ImpactRing | null = null;
    for (const r of this.impactRings) {
      if (!r.active) { ring = r; break; }
    }
    // pool full: recycle the oldest (lowest remaining life)
    if (!ring) {
      ring = this.impactRings[0];
      for (let i = 1; i < this.impactRings.length; i++) {
        if (this.impactRings[i].life < ring.life) ring = this.impactRings[i];
      }
    }

    const mega = power >= 1.15;
    const p = clamp(power, 0.35, 2.0);
    ring.active = true;
    ring.maxLife = mega ? 0.45 : 0.28 + p * 0.04;
    ring.life = ring.maxLife;
    ring.startScale = mega ? 0.55 : 0.45;
    ring.endScale = (mega ? 5.8 : 2.6) + p * 1.4;
    ring.peakAlpha = mega ? 1.0 : 0.72 + p * 0.12;
    ring.mat.color.setHex(colorHex);
    ring.mat.opacity = ring.peakAlpha;
    ring.mesh.position.copy(world);
    ring.mesh.position.y += 0.55 + yLift;
    // face the camera so the ring reads as a flat brand hit mark
    ring.mesh.quaternion.copy(this.camera.quaternion);
    ring.mesh.scale.setScalar(ring.startScale);
    ring.mesh.visible = true;
  }

  private updateImpactRings(dt: number) {
    for (const r of this.impactRings) {
      if (!r.active) continue;
      r.life -= dt;
      if (r.life <= 0) {
        r.active = false;
        r.mesh.visible = false;
        r.mat.opacity = 0;
        continue;
      }
      const t = 1 - r.life / r.maxLife; // 0 → 1
      // ease-out expand; fade after the first third so the hit pops then softens
      const ease = 1 - (1 - t) * (1 - t);
      const sc = r.startScale + (r.endScale - r.startScale) * ease;
      r.mesh.scale.setScalar(sc);
      // billboard each frame so chase-cam rolls don't turn the ring into a line
      r.mesh.quaternion.copy(this.camera.quaternion);
      const fade = t < 0.25 ? 1 : 1 - (t - 0.25) / 0.75;
      r.mat.opacity = r.peakAlpha * fade * fade;
    }
  }

  private clearImpactRings() {
    for (const r of this.impactRings) {
      r.active = false;
      r.life = 0;
      r.mesh.visible = false;
      r.mat.opacity = 0;
    }
  }

  /**
   * Finish-line FX. A hard dust blast the moment the wheel crosses, then a
   * continuous scrub plume off the rear tyre while the rider carves down.
   */
  private playerFinishFx(r: Racer, dt: number, t: number) {
    const trk = this.track;
    const zone = trk.zoneAt(r.s);
    trk.frameAt(r.s, _f1, _f2, _f3);
    const pk = Math.max(0.5, this.perfGov.particleScale);

    // ---- the crossing blast, fired once
    if (!this.finishBlast) {
      this.finishBlast = true;
      const base = trk.worldPos(r.s, r.x, r.y + 0.2, _v1);
      const n = Math.floor(70 * pk);
      for (let i = 0; i < n; i++) {
        const a = this.rng.range(0, TAU);
        const sp = this.rng.range(4, 16);
        this.dirtPool.spawn({
          pos: base.clone(),
          vel: _f2.clone().multiplyScalar(Math.cos(a) * sp)
            .addScaledVector(_f1, Math.sin(a) * sp * 0.8 - r.v * 0.2)
            .addScaledVector(_f3, this.rng.range(2, 11)),
          life: this.rng.range(0.7, 1.7),
          size: this.rng.range(0.14, 0.44), endSize: 0.06,
          color: _c1.setHex(zone.dirt).multiplyScalar(this.rng.range(0.7, 1.25)),
          alpha: 1, gravity: 22, drag: 0.75,
          spin: this.rng.range(-12, 12), bounce: 0.25,
        });
      }
      // billowing cloud on top of the grit
      for (let i = 0; i < Math.floor(34 * pk); i++) {
        const a = this.rng.range(0, TAU);
        this.smokePool.spawn({
          pos: base.clone().addScaledVector(_f2, Math.cos(a) * this.rng.range(0, 2.5)),
          vel: _f2.clone().multiplyScalar(Math.cos(a) * this.rng.range(2, 8))
            .addScaledVector(_f1, Math.sin(a) * 3 - r.v * 0.12)
            .addScaledVector(_f3, this.rng.range(0.5, 3.5)),
          life: this.rng.range(1.0, 2.2),
          size: this.rng.range(1.2, 2.4), endSize: this.rng.range(5, 9),
          color: _c1.setHex(zone.dirt).lerp(_c2.setRGB(1, 0.97, 0.9), 0.55),
          endColor: _c2.setRGB(1, 1, 1),
          alpha: 0.45, gravity: -1.2, drag: 1.4,
        });
      }
      audio.land(1);
      audio.cheer(1.4);
      this.shakeAdd(0.7);
    }

    // ---- scrub plume while braking and carving
    if (t > 0.9 && r.v > 4 && Math.random() < dt * 55 * pk) {
      const rear = trk.worldPos(r.s - 0.7, r.x, r.y + 0.12, _v1);
      for (let i = 0; i < 2; i++) {
        this.dirtPool.spawn({
          pos: rear.clone().addScaledVector(_f2, this.rng.range(-0.4, 0.4)),
          vel: _f2.clone().multiplyScalar(-r.finishCarve * this.rng.range(3, 9))
            .addScaledVector(_f1, -r.v * this.rng.range(0.15, 0.4))
            .addScaledVector(_f3, this.rng.range(1.5, 5)),
          life: this.rng.range(0.5, 1.1),
          size: this.rng.range(0.12, 0.34), endSize: 0.05,
          color: _c1.setHex(zone.dirt).multiplyScalar(this.rng.range(0.65, 1.15)),
          alpha: 1, gravity: 23, drag: 0.85, spin: this.rng.range(-9, 9),
        });
      }
      this.smokePool.spawn({
        pos: rear.clone(),
        vel: _f3.clone().multiplyScalar(this.rng.range(0.6, 2.2))
          .addScaledVector(_f2, -r.finishCarve * 2),
        life: this.rng.range(0.7, 1.4),
        size: this.rng.range(0.9, 1.7), endSize: this.rng.range(3.5, 6),
        color: _c1.setHex(zone.dirt).lerp(_c2.setRGB(1, 0.97, 0.88), 0.5),
        alpha: 0.34, gravity: -1, drag: 1.5,
      });
    }
  }

  private spawnCrashDebris(r: Racer, count = 34) {
    const trk = this.track;
    const base = trk.worldPos(r.s, r.x, r.y + 0.5, _v1);
    const zone = trk.zoneAt(r.s);
    // a crash is a one-off burst, so it gets a generous share of the budget
    // but still respects the governor rather than spiking a struggling frame
    count = Math.round(count * Math.max(0.5, this.perfGov.particleScale));
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
    const seenTex = new Set<THREE.Texture>();
    this.track.group.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      const list = Array.isArray(mat) ? mat : mat ? [mat] : [];
      for (const mm of list) {
        // textures are shared between materials, so dedupe before disposing
        const tex = (mm as THREE.MeshStandardMaterial).map;
        if (tex && !seenTex.has(tex)) { seenTex.add(tex); tex.dispose(); }
        mm.dispose();
      }
    });
    this.track.dispose();

    this.track = m.id === 'cinder'
      ? new Track(m.seed, m.length, CINDER_SECTIONS, CINDER_SETPIECES)
      : m.id === 'thornwood'
      ? new Track(m.seed, m.length, THORNWOOD_SECTIONS, THORNWOOD_SETPIECES)
      : m.id === 'lastlight'
      ? new Track(m.seed, m.length, LASTLIGHT_SECTIONS, LASTLIGHT_SETPIECES)
      : m.authored
      ? new Track(m.seed, m.length, SHALEBACK_SECTIONS, SHALEBACK_SETPIECES)
      : new Track(m.seed, m.length);
    this.scene.add(this.track.build());
    this.track.updateSceneryLod(0, 1, true);
    this.checkpoints.build(this.track);
    this.lastZone = -1;
    this.rig.resetMenuClock();
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
    p.mass = this.perf.mass;
    const old = p.rig;
    this.scene.remove(old.root, old.shadow, old.contactF, old.contactR);
    // Dispose geometry only. Materials from RIDER_MAT reference SHARED,
    // cached roughness textures — disposing them here would tear down the
    // maps every other rider is still using, leaving the whole field
    // untextured after a single garage change.
    old.root.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });

    // rider choice drives the silhouette, bike choice drives the frame shape
    const rig = createRider(
      loadoutColors(l),
      getBuild(RIDER_BUILD_OF[l.rider] ?? 'allround'),
      shapeForBike(bike.id, bike.tubeScale));
    // Wheel size is capped tight: the physics ground plane assumes WHEEL_R
    // radius, so a large deviation floats the bike or sinks it into the
    // dirt. Keep the visual difference subtle enough to stay grounded.
    const ws = clamp(bike.wheelScale, 0.96, 1.06);
    rig.frontWheel.scale.setScalar(ws);
    rig.rearWheel.scale.setScalar(ws);
    // NOTE: the frame shape is built into the geometry, NOT applied as a
    // scale on rig.bike — scaling that group would move the wheels, cranks
    // and bar away from where the rider's hands and feet are placed.
    this.scene.add(rig.root, rig.shadow, rig.contactF, rig.contactR);
    p.rig = rig;
    // new bike, clean — and the handle belongs to the new rig
    p.dirt = 0;
    rig.dirt.set(0, p.dirtTint);
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
      foe.wheelSpin += foe.v * dt / WHEEL_R;
      p.headYaw = damp(p.headYaw, -0.5, 6, dt);
    }

    // ---------- reaction window ----------
    const inWindow = t >= INTRO.react && t < INTRO.react + 1.0;
    h.reactWindow = inWindow ? 1 - (t - INTRO.react) / 1.0 : 0;
    if (inWindow && !this.introReacted) {
      // poll pad here — intro path doesn't run stepPhysics edge latches fully
      this.latchInput(false);
      if (this.frameTap.react || this.tap('KeyW', 'ArrowUp', 'Space')) {
        this.introReacted = true;
        this.frameTap.react = false;
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
          this.boostSys.gain(45);
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
    this.rig.intro(this.track, this.player, t, dt);
  }

  private updateCamera(dt: number, snap: boolean) {
    const phase = this.hud.phase;
    if (phase === 'menu') {
      // the flyby ranges far from the grid, so scenery must band around the
      // camera rather than the parked player
      const s = this.rig.cinematic(this.track, dt);
      this.track.updateSceneryLod(s, this.perfGov.lodScale);
      return;
    }
    if (phase === 'intro') return;                          // the cold open drives it
    if (this.player.finished && phase === 'race') {         // the finish sequence owns it
      this.rig.finish(this.track, this.player, dt);
      return;
    }
    if (this.replayData && phase === 'finish') return;      // replay drives it
    this.rig.chase(this.track, this.player, dt, this.boosting, phase === 'race', snap);
  }

  private shakeAdd(v: number) {
    this.rig.addShake(v);
  }

  private updateWorldFx(dt: number) {
    const p = this.player;
    this.sky.position.copy(this.camera.position);
    this.clouds.position.set(this.camera.position.x, 0, this.camera.position.z);
    this.clouds.children.forEach(c => c.lookAt(this.camera.position.x, c.position.y, this.camera.position.z));
    // Ridges follow in XZ so they never run out, but only partially in Y —
    // holding some world anchoring means the horizon visibly rises as you
    // descend, which is what sells the height of the mountain.
    this.ridge.position.set(
      this.camera.position.x,
      this.camera.position.y * 0.45 - 210,
      this.camera.position.z,
    );

    // fog / light per zone
    const zone = this.track.zoneAt(p.s);
    // ---- ATMOSPHERIC PERSPECTIVE --------------------------------------
    // Honest depth cue, not a geometry hider. Density is deliberately set
    // so the fog is still LIGHT at the LOD cutoff (~460m canopy reach):
    // at 0.0011, transmittance there is ~60%, so distant trees fade rather
    // than vanish into a wall. If fog were doing the culling's job you
    // would see a hard grey curtain at a fixed radius, which is the failure
    // mode the brief calls out.
    //
    // The real scale cue is the three ridge layers, which are tinted toward
    // haze at build time (0.18 / 0.46 / 0.72) — contrast falls off with
    // distance independently of fog, so the mountain reads as enormous even
    // where the fog is thin.
    const fogTarget = 0.0011 * zone.fog;
    this.fog.density = damp(this.fog.density, fogTarget, 1.2, dt);

    // ---- FOREST READABILITY GUARANTEE ---------------------------------
    // Dense sections use dark verges and heavy fog, which is atmospheric
    // but risks losing the rider against the treeline. Lift the ambient
    // and the fill inside those zones so the character stays readable —
    // this is a legibility floor, not a look.
    const dense = clamp01((zone.treeDensity - 0.6) / 1.0);
    this.hemi.intensity = damp(this.hemi.intensity, 1.15 + dense * 0.55, 1.5, dt);
    this.sun.intensity = damp(this.sun.intensity, 2.6 - dense * 0.35, 1.5, dt);
    // Fog picks up the warm afternoon haze rather than a neutral grey, so
    // distance reads as atmosphere instead of a wash.
    _c1.setHex(zone.far).lerp(_c2.setHex(0xdcd2c0), 0.66);
    this.fog.color.lerp(_c1, 1 - Math.exp(-1.2 * dt));
    // Hold the golden-hour angle relative to the camera. The offset ratio
    // matches the light's authored elevation (~23 degrees), so shadows stay
    // long and raking for the whole descent instead of standing up as the
    // player drops thousands of metres.
    this.sun.position.copy(this.camera.position).add(_v1.set(-360, 250, 165));
    this.sun.target.position.copy(this.camera.position);

    // spectators
    this.track.updateSpectators(p.s, this.time, dt, this.perfGov.crowdScale);
    this.track.updateSceneryLod(p.s, this.perfGov.lodScale);
    this.track.animateWater(this.time);
    // foliage sway: ambient + speed + boost (shader uniforms only)
    const windK = this.reducedMotion ? 0.25 : 1;
    const windStr =
      (0.35 + clamp01(p.v / 40) * 1.15 + (this.boosting ? 0.55 : 0)) * windK;
    this.track.animateWind(this.time, windStr);

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
    // the ghost is translucent, so the silhouette shells would read as murky
    // dark blobs rather than an outline — strip them before tinting
    const shells: THREE.Object3D[] = [];
    rig.root.traverse(o => {
      const m = o as THREE.Mesh;
      const mm = m.material as THREE.Material | undefined;
      if (mm && (mm as THREE.MeshBasicMaterial).side === THREE.BackSide) shells.push(o);
    });
    for (const s of shells) s.parent?.remove(s);

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
      this.rig.cut();
    }

    const raw = this.replayT / g.dt;
    const i = clamp(Math.floor(raw), 0, n - 2);
    const t = clamp01(raw - i);
    const a = i * 4, b = a + 4;
    const s = lerp(g.frames[a], g.frames[b], t);
    const x = lerp(g.frames[a + 1], g.frames[b + 1], t);
    const y = lerp(g.frames[a + 2], g.frames[b + 2], t);

    // put the rider where the replay says, so the camera has a subject
    const p = this.player;
    p.s = s; p.x = x; p.y = y;
    this.poseRacer(p, dt, 0);

    this.rig.replay(this.track, s, x, shot, dt);
  }

  /** Begin replaying the run that just finished. */
  startReplay() {
    this.replayData = this.takeGhost();
    this.replayT = 0;
    this.replayShot = -1;
    this.rig.cut();
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
    if (this.debugStates) {
      h.transitions = p.log.recent(8);
      h.fps = this.perfGov.fps;
      h.perfTier = this.perfGov.tier;
      h.particles = this.dirtPool.live + this.smokePool.live + this.sparkPool.live;
      const info = this.renderer.info.render;
      h.draws = info.calls;
      h.tris = info.triangles;
      h.debugVel = p.v;
      h.debugAir = p.airTime;
      const cp = this.checkpoints.lastBefore(p.s);
      h.debugCp = cp ? `${cp.index}:${cp.name}` : '—';
      h.debugInv = this.invincible;
    }
    // mode objective strip
    {
      const rules = getMode(this.mode);
      const mh = rules.hud({
        raceTime: this.raceTime,
        progress: clamp01(p.s / this.track.length),
        place: p.place, fieldSize: this.racers.length,
        score: this.score, tricks: this.tricksLanded, bonks: this.bonks,
        shortcuts: this.shortcutsHit, nearMisses: this.nearMisses,
        finished: p.finished, clock: this.modeClock,
      });
      h.modeObjective = mh.objective;
      h.modeDetail = mh.detail;
      h.modeUrgent = mh.urgent;
    }
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
      h.trickText = previewName(this.currentTally(p.airTime));
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

    const zoneNow = this.track.zoneAt(p.s);
    const toLine = this.track.length - 20 - p.s;

    audio.update(this.lastDt, {
      gale,
      rivalNear: rvNear * rvNear,
      rivalPan: rvPan,
      rivalSpeed: rvSpeed,
      // ---- bike
      cadence: p.pedalling > 0.05
        ? lerp(4.2, 11.5, clamp01(p.v / 26)) * p.stCadence / TAU : 0,
      braking01: this.key('KeyS', 'ArrowDown') && p.grounded ? 1 : 0,
      suspRate: clamp01(Math.abs(p.suspV) / 7),
      // ---- environment, read from the section you're actually in
      forest: clamp01(zoneNow.treeDensity / 1.6),
      water: zoneNow.surface === 'mud' ? 0.85 : 0,
      calm: clamp01(1 - zoneNow.crowd / 2.2) * (p.grounded ? 1 : 0.4),
      // ---- the finale builds over the last 500m
      homeStretch: h.phase === 'race'
        ? clamp01(1 - toLine / 500) : 0,
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

/** carried out of the arm block so the head/torso resolves can sum them */
let _poseTorsoX = 0;
let _poseHeadX = 0;
let _poseTorsoBase = 0;
const _xAxis = new THREE.Vector3(1, 0, 0);
const IDENTITY_PERF: Perf = {
  topCap: 0, accel: 1, grip: 1, airRate: 1, landTol: 0, bonk: 1,
  knockResist: 0, boostBurn: 1, boostPush: 1, mass: 86,
};
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
void smoothstep; void lerp; void ZONES;
