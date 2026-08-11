// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: procedural downhill course
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { RNG, clamp, clamp01, fbm1, fbm2, lerp, smoothstep, TAU } from './core';
import {
  makeDirtTexture, makeTapeTexture, makeBannerTexture, makeSectionBannerTexture,
  makeCheckerTexture, makeTuftTexture, makeRippleTexture,
} from './fx';
import {
  pineFoliageGeo, pineTrunkGeo, pineTrunkVariant, broadleafGeo, rockGeo, bushGeo,
  plantGeo, branchGeo, rockFamily,
  spectatorParts, SPECTATOR_COLORS, baleGeo, coneGeo, logGeo, barrelGeo, postGeo,
  fenceGeo, signGeo, barrierGeo, rampGeo, driftGeo, tuftGeo,
} from './models';
import { PROPS, THEME_PROPS, type PropKind } from './env';
import { WORLD_MAT, attachWind, groundRough, type WindUniforms } from './riderMaterials';
import type { TrackTheme, TrackLandmark, ScriptedFeature } from './trackDef';

export const TRACK_LENGTH = 4600;
const STEP = 3;

export type SurfaceKind = 'dirt' | 'grass' | 'rock' | 'mud' | 'gravel';

export interface Zone {
  name: string;
  sub: string;
  t0: number; t1: number;
  dirt: number; verge: number; far: number;
  width: number;
  rough: number;
  steep: number;
  surface: SurfaceKind;
  treeDensity: number;
  treeType: 'pine' | 'broad' | 'mixed' | 'none';
  rockDensity: number;
  crowd: number;
  fog: number;
  features: string[];
  props: string[];
  // ---- authored overrides (used by hand-built mountains) ----
  /** ground falls away past the tape: -1 left, 1 right, 0 both */
  dropSide?: -1 | 0 | 1;
  /** how hard it falls (metres per metre, roughly) */
  dropDepth?: number;
  /** no boundary tape at all (bridges, cliff edges) */
  noTape?: boolean;
  /** timber guard rails instead of tape */
  rails?: boolean;
  /** force a shortcut to spawn inside this section */
  secret?: boolean;
  /** curvature multiplier for this stretch */
  twist?: number;
  /** rivals bunch up here — combat arena */
  combat?: boolean;
  /**
   * Explicit set-piece theme key for buildZoneSetPieces().
   * When set, overrides name-based theme detection so authored mountains
   * can share builders (e.g. volcanic 'CANYON CUT', forest 'PINE PLUNGE').
   */
  setpiece?: string;
}

export const ZONES: Zone[] = [
  { name: 'START GATE', sub: 'GATE OPEN', t0: 0.000, t1: 0.055, dirt: 0x9a7550, verge: 0x6f9440, far: 0x5c7a38, width: 19, rough: 0.35, steep: -0.02, surface: 'dirt', treeDensity: 0.20, treeType: 'pine', rockDensity: 0.10, crowd: 2.6, fog: 0.9, features: ['roller', 'berm'], props: ['cone', 'bale'] },
  { name: 'PINE PLUNGE', sub: 'ROOTS & RUTS', t0: 0.055, t1: 0.195, dirt: 0x6d5236, verge: 0x39662c, far: 0x27461f, width: 13.5, rough: 1.25, steep: 0.055, surface: 'dirt', treeDensity: 1.00, treeType: 'pine', rockDensity: 0.55, crowd: 0.55, fog: 1.25, features: ['whoops', 'roller', 'berm', 'kicker'], props: ['rock', 'bale'] },
  { name: 'KICKER RIDGE', sub: 'SEND IT', t0: 0.195, t1: 0.335, dirt: 0xa8814f, verge: 0x7d9440, far: 0x6a7f38, width: 17, rough: 0.55, steep: 0.01, surface: 'dirt', treeDensity: 0.22, treeType: 'mixed', rockDensity: 0.30, crowd: 1.5, fog: 0.75, features: ['table', 'kicker', 'double', 'berm'], props: ['cone', 'bale', 'barrel'] },
  { name: 'HAYSTACK HOLLOW', sub: 'FARM CHAOS', t0: 0.335, t1: 0.470, dirt: 0x9d7c4d, verge: 0x93b04c, far: 0x7c9640, width: 14.5, rough: 0.7, steep: -0.015, surface: 'grass', treeDensity: 0.30, treeType: 'broad', rockDensity: 0.12, crowd: 2.2, fog: 0.8, features: ['roller', 'berm', 'kicker', 'chicane'], props: ['bale', 'bale', 'cone', 'barrel'] },
  { name: 'CANYON CUT', sub: 'NO BRAKES', t0: 0.470, t1: 0.605, dirt: 0xb2653c, verge: 0x8d5636, far: 0x6f432b, width: 11.5, rough: 1.35, steep: 0.065, surface: 'rock', treeDensity: 0.08, treeType: 'none', rockDensity: 1.30, crowd: 0.5, fog: 1.0, features: ['whoops', 'kicker', 'roller', 'berm'], props: ['rock', 'rock', 'barrel'] },
  { name: 'THE BONKYARD', sub: 'BIG AIR', t0: 0.605, t1: 0.740, dirt: 0x7d746a, verge: 0x616356, far: 0x4c4d44, width: 16.5, rough: 0.8, steep: 0.02, surface: 'gravel', treeDensity: 0.10, treeType: 'none', rockDensity: 0.35, crowd: 1.8, fog: 0.85, features: ['gap', 'table', 'kicker', 'double'], props: ['barrel', 'cone', 'bale'] },
  { name: 'MUDPIT MIRE', sub: 'SLIP CITY', t0: 0.740, t1: 0.860, dirt: 0x4e4132, verge: 0x4a5b33, far: 0x39471f, width: 13, rough: 1.1, steep: -0.045, surface: 'mud', treeDensity: 0.75, treeType: 'broad', rockDensity: 0.25, crowd: 0.9, fog: 1.35, features: ['whoops', 'roller', 'berm'], props: ['bale', 'bale', 'rock'] },
  { name: 'FINISH FURY', sub: 'CROWD RUSH', t0: 0.860, t1: 1.001, dirt: 0x9d7c4f, verge: 0x78993f, far: 0x5f7a34, width: 18, rough: 0.4, steep: 0.0, surface: 'dirt', treeDensity: 0.18, treeType: 'mixed', rockDensity: 0.10, crowd: 3.0, fog: 0.7, features: ['kicker', 'table', 'roller', 'berm'], props: ['cone', 'bale'] },
];

interface Feature {
  kind: string;
  s0: number; len: number;
  h: number; depth: number;
  x0: number; x1: number;
  n: number;
}

export interface Obstacle {
  s: number; x: number; r: number;
  type: PropKind;
  mass: number;
  hit: number;              // 0 = intact
  /** destroyed props are hidden rather than animated */
  gone?: boolean;
  /** boulders roll: live lateral drift down the hill */
  roll?: number;
  vx: number; vy: number; vs: number; spin: number;
  ox: number; oy: number; os: number; rot: number;
  /** stable unique id (collision debounce, diagnostics) */
  idx: number;
  /** instance slot within this type's InstancedMesh (and matching foam mesh) */
  meshIdx: number;
}

export interface Spectator {
  s: number; x: number;
  /** ground height cached at build time — they don't move unless bonked */
  baseH: number;
  color: number;
  phase: number;
  state: 0 | 1;             // 0 idle, 1 bonked
  t: number;
  vx: number; vy: number; vs: number; spin: number;
  ox: number; oy: number; os: number; rot: number;
  scale: number;
}

/**
 * A risky off-piste line that cuts a corner. Riding it end-to-end grants a
 * progress bonus equal to the distance it genuinely saves; bailing out early
 * gives nothing, so it's a commitment.
 */
export interface Shortcut {
  s0: number;         // entry
  s1: number;         // exit
  side: number;       // -1 / +1 in track space
  width: number;      // rideable channel width beyond the tape
  saving: number;     // metres of progress on a clean run
  name: string;
}

const _v = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _sc = new THREE.Vector3(1, 1, 1);
const _up = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _p = new THREE.Vector3();
const _p2 = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _tumbleAxis = new THREE.Vector3(1, 0, 0.3).normalize();
const _tumbleAxis2 = new THREE.Vector3(1, 0, 0.6).normalize();
// surface palette, blended into the trail by material type
const _cMud = new THREE.Color(0x3d3223);
const _cGravel = new THREE.Color(0x8b8478);
const _cRock = new THREE.Color(0x9a8a76);
const _cSnow = new THREE.Color(0xe8eef4);
const _zAxis = new THREE.Vector3(0, 0, 1);
const _fwd2 = new THREE.Vector3();
const _right2 = new THREE.Vector3();
const _up2 = new THREE.Vector3();

export class Track {
  step = STEP;
  count: number;
  length: number;
  // per-node arrays
  px!: Float32Array; py!: Float32Array; pz!: Float32Array;
  fx!: Float32Array; fy!: Float32Array; fz!: Float32Array;
  rx!: Float32Array; ry!: Float32Array; rz!: Float32Array;
  ux!: Float32Array; uy!: Float32Array; uz!: Float32Array;
  hw!: Float32Array;
  curv!: Float32Array;
  pitch!: Float32Array;
  bank!: Float32Array;
  slopeL!: Float32Array;
  slopeR!: Float32Array;
  zoneIdx!: Uint8Array;

  features: Feature[] = [];
  private buckets: Feature[][] = [];
  private bucketSize = 24;

  obstacles: Obstacle[] = [];
  spectators: Spectator[] = [];
  gantries: { s: number }[] = [];
  shortcuts: Shortcut[] = [];
  /** scrolling water textures, advanced by animateWater() */
  waterMaps: THREE.Texture[] = [];
  /** shared wind uniforms for foliage materials (shader injection) */
  private windU: WindUniforms = {
    uTime: { value: 0 },
    uWind: { value: 0.4 },
  };

  group = new THREE.Group();
  private specMeshes: THREE.InstancedMesh[] = [];
  /** scenery sorted into distance bands so we can draw only what's near */
  private sceneryBands: {
    mesh: THREE.InstancedMesh;
    /** track position of each instance, for band sorting */
    s: Float32Array;
    /** full matrix set, kept so we can repack per frame */
    mats: Float32Array;
    colors: Float32Array | null;
    total: number;
    /** how far ahead/behind this band draws */
    reach: number;
  }[] = [];
  private lastBandS = -1e9;
  /**
   * Terrain surface chunks — streamed by track distance so Ironjaw (6.2 km)
   * and Thornwood (dense) don't keep the whole ribbon on the GPU.
   */
  private surfaceChunks: { mesh: THREE.Mesh; s0: number; s1: number }[] = [];
  private lastChunkS = -1e9;
  /** Theme multiplies scenery reach (forest denser → tighter, alpine open → longer). */
  themeLodMul = 1;
  private propMeshes: Record<string, THREE.InstancedMesh> = {};
  private specWindow = { a: 0, b: 0 };
  rng = new RNG(20260114);

  /** section list for THIS mountain (authored or the generic default) */
  zones: Zone[] = ZONES;
  /** guaranteed set-pieces, as fractions of length */
  private scripted: ScriptedFeature[] = [];
  /**
   * Mode-driven density multiplier for props + scenery hazards.
   * 1 = authored density; <1 Time Attack / Trick Jam; >1 Mayhem.
   */
  densityScale = 1;
  /** Visual world identity (drives landmark builders + debug). */
  theme: TrackTheme = 'alpine';
  /** Hand-placed landmarks for this mountain. */
  landmarks: TrackLandmark[] = [];
  /** Summit elevation used when integrating the spline. */
  startElevation = 980;
  /** Stable mountain id for debug / HUD. */
  mountainId = 'shaleback';

  constructor(
    seed = 20260114,
    length = TRACK_LENGTH,
    zones?: Zone[],
    scripted?: ScriptedFeature[],
    densityScale = 1,
    meta?: {
      theme?: TrackTheme;
      landmarks?: TrackLandmark[];
      startElevation?: number;
      mountainId?: string;
    },
  ) {
    this.rng = new RNG(seed);
    this.length = length;
    this.count = Math.floor(length / STEP) + 2;
    if (zones && zones.length) this.zones = zones;
    if (scripted) this.scripted = scripted;
    this.densityScale = Math.max(0.25, densityScale);
    if (meta?.theme) this.theme = meta.theme;
    if (meta?.landmarks) this.landmarks = meta.landmarks;
    if (meta?.startElevation !== undefined) this.startElevation = meta.startElevation;
    if (meta?.mountainId) this.mountainId = meta.mountainId;
    // denser / longer worlds pull scenery in; open vistas keep it far
    this.themeLodMul = themeLodMultiplier(this.theme, this.length);
    this.buildNodes();
    this.buildFeatures();
    this.buildShortcuts();
    this.placeObstacles();
    this.placeSpectators();
  }

  // -- generation -----------------------------------------------------------
  private buildNodes() {
    const n = this.count;
    this.px = new Float32Array(n); this.py = new Float32Array(n); this.pz = new Float32Array(n);
    this.fx = new Float32Array(n); this.fy = new Float32Array(n); this.fz = new Float32Array(n);
    this.rx = new Float32Array(n); this.ry = new Float32Array(n); this.rz = new Float32Array(n);
    this.ux = new Float32Array(n); this.uy = new Float32Array(n); this.uz = new Float32Array(n);
    this.hw = new Float32Array(n); this.curv = new Float32Array(n);
    this.pitch = new Float32Array(n); this.bank = new Float32Array(n);
    this.slopeL = new Float32Array(n); this.slopeR = new Float32Array(n);
    this.zoneIdx = new Uint8Array(n);

    let heading = 0;
    let x = 0, y = this.startElevation, z = 0;

    for (let i = 0; i < n; i++) {
      const s = i * STEP;
      const t = s / this.length;
      const zi = this.zoneIndexAt(t);
      const Z = this.zones[zi];
      this.zoneIdx[i] = zi;

      // --- curvature: layered sweepers + tighter corners, calmed at the start
      const warm = smoothstep(clamp01(s / 260));
      let c = 0.0062 * fbm1(s * 0.00155 + 11.3, 2)
        + 0.0055 * fbm1(s * 0.0049 + 71.9, 2)
        + 0.0030 * fbm1(s * 0.0125 + 5.5, 1);
      // authored sections state their own twist; generic ones use defaults
      if (Z.twist !== undefined) c *= Z.twist;
      else if (zi === 1 || zi === 4 || zi === 6) c *= 1.35;
      else if (zi === 0 || zi === 7) c *= 0.5;
      c *= warm;
      this.curv[i] = c;

      // --- pitch (always downhill)
      let p = 0.150 + 0.070 * fbm1(s * 0.00115 + 3.1, 3) + Z.steep;
      p += 0.045 * Math.max(0, fbm1(s * 0.0032 + 55.0, 2));
      p = clamp(p, 0.045, 0.36);
      this.pitch[i] = p;

      // --- width
      const wn = fbm1(s * 0.0035 + 200, 2);
      this.hw[i] = (Z.width + wn * 2.4) * 0.5;

      // --- bank (berms lean into the corner)
      const targetBank = clamp(-c * 27, -0.40, 0.40);
      this.bank[i] = targetBank;

      // --- side terrain slopes: one side cuts into the hill, other falls away
      const sideMix = fbm1(s * 0.0009 + 400, 2);
      this.slopeL[i] = lerp(-0.55, 0.85, clamp01(sideMix * 0.5 + 0.5));
      this.slopeR[i] = lerp(0.85, -0.55, clamp01(sideMix * 0.5 + 0.5));

      // --- integrate position
      const cp = Math.cos(p), sp = Math.sin(p);
      const fxv = Math.sin(heading) * cp, fyv = -sp, fzv = Math.cos(heading) * cp;
      this.px[i] = x; this.py[i] = y; this.pz[i] = z;
      this.fx[i] = fxv; this.fy[i] = fyv; this.fz[i] = fzv;

      // right = up x forward (world up), then bank-roll
      let rxv = fzv, ryv = 0, rzv = -fxv;
      const rl = Math.hypot(rxv, rzv) || 1;
      rxv /= rl; rzv /= rl;
      // up = forward x right
      let uxv = fyv * rzv - fzv * ryv;
      let uyv = fzv * rxv - fxv * rzv;
      let uzv = fxv * ryv - fyv * rxv;
      const ul = Math.hypot(uxv, uyv, uzv) || 1;
      uxv /= ul; uyv /= ul; uzv /= ul;
      // roll both about forward by bank
      const b = this.bank[i], cb = Math.cos(b), sb = Math.sin(b);
      const nrx = rxv * cb + uxv * sb, nry = ryv * cb + uyv * sb, nrz = rzv * cb + uzv * sb;
      const nux = uxv * cb - rxv * sb, nuy = uyv * cb - ryv * sb, nuz = uzv * cb - rzv * sb;
      this.rx[i] = nrx; this.ry[i] = nry; this.rz[i] = nrz;
      this.ux[i] = nux; this.uy[i] = nuy; this.uz[i] = nuz;

      heading += c * STEP;
      x += fxv * STEP; y += fyv * STEP; z += fzv * STEP;
    }
  }

  zoneIndexAt(t: number): number {
    const Z = this.zones;
    for (let i = 0; i < Z.length; i++) if (t >= Z[i].t0 && t < Z[i].t1) return i;
    return Z.length - 1;
  }
  zoneAt(s: number): Zone { return this.zones[this.zoneIndexAt(s / this.length)]; }

  private addFeature(f: Feature) {
    this.features.push(f);
    const a = Math.floor(f.s0 / this.bucketSize);
    const b = Math.floor((f.s0 + f.len) / this.bucketSize);
    for (let i = a; i <= b; i++) {
      (this.buckets[i] ||= []).push(f);
    }
  }

  private buildFeatures() {
    const rng = this.rng;
    let s = 90;
    while (s < this.length - 140) {
      const Z = this.zoneAt(s);
      // a bridge deck is flat by definition — no procedural terrain on it
      if (Z.rails) { s += 20; continue; }
      const hw = this.halfWidth(s);
      const kind = rng.pick(Z.features);
      let advance = rng.range(48, 96);

      if (kind === 'kicker') {
        const len = rng.range(11, 17);
        const h = rng.range(1.5, 3.0) * (Z.name === 'KICKER RIDGE' ? 1.3 : 1);
        const full = rng.chance(0.45);
        const side = rng.sign();
        this.addFeature({
          kind: 'kicker', s0: s, len, h, depth: 0,
          x0: full ? -999 : (side < 0 ? -999 : hw * 0.02),
          x1: full ? 999 : (side < 0 ? -hw * 0.02 : 999), n: 0,
        });
        advance = len + rng.range(38, 70);
      } else if (kind === 'table') {
        const len = rng.range(34, 52);
        const h = rng.range(2.0, 3.6);
        this.addFeature({ kind: 'table', s0: s, len, h, depth: 0, x0: -999, x1: 999, n: 0 });
        advance = len + rng.range(38, 76);
      } else if (kind === 'double') {
        const len = rng.range(26, 38);
        const h = rng.range(1.8, 2.9);
        this.addFeature({ kind: 'double', s0: s, len, h, depth: rng.range(0.7, 1.5), x0: -999, x1: 999, n: 0 });
        advance = len + rng.range(40, 80);
      } else if (kind === 'gap') {
        const len = rng.range(46, 64);
        const h = rng.range(2.6, 3.8);
        this.addFeature({ kind: 'gap', s0: s, len, h, depth: rng.range(3.0, 5.0), x0: -999, x1: 999, n: 0 });
        advance = len + rng.range(70, 120);
      } else if (kind === 'whoops') {
        const n = rng.int(4, 8);
        const len = n * rng.range(6.5, 9.5);
        this.addFeature({ kind: 'whoops', s0: s, len, h: rng.range(0.35, 0.75), depth: 0, x0: -999, x1: 999, n });
        advance = len + rng.range(26, 54);
      } else if (kind === 'roller') {
        const len = rng.range(16, 30);
        this.addFeature({ kind: 'roller', s0: s, len, h: rng.range(0.6, 1.5), depth: 0, x0: -999, x1: 999, n: 0 });
        advance = len + rng.range(26, 56);
      } else if (kind === 'berm') {
        const len = rng.range(30, 55);
        const cAvg = this.curvatureAt(s + len * 0.5);
        const outSide = cAvg > 0 ? -1 : 1;   // right turn -> outside is left
        this.addFeature({
          kind: 'berm', s0: s, len, h: rng.range(1.0, 2.2), depth: 0,
          x0: outSide < 0 ? -999 : hw * 0.25, x1: outSide < 0 ? -hw * 0.25 : 999, n: 0,
        });
        advance = len + rng.range(24, 50);
      } else if (kind === 'chicane') {
        const len = rng.range(20, 30);
        this.addFeature({ kind: 'roller', s0: s, len, h: rng.range(0.5, 1.0), depth: 0, x0: -999, x1: 999, n: 0 });
        advance = len + rng.range(30, 50);
      }
      s += advance;
    }
    // signature features: guaranteed showpieces
    const L = this.length;
    if (this.scripted.length) {
      // authored mountain: place exactly what the designer asked for
      for (const sp of this.scripted) {
        this.addFeature({
          kind: sp.kind, s0: sp.at * L, len: sp.len, h: sp.h, depth: sp.depth,
          x0: -999, x1: 999, n: sp.kind === 'whoops' ? 6 : 0,
        });
      }
    } else {
      this.addFeature({ kind: 'table', s0: L * 0.245, len: 54, h: 4.1, depth: 0, x0: -999, x1: 999, n: 0 });
      this.addFeature({ kind: 'gap', s0: L * 0.665, len: 72, h: 4.6, depth: 6.0, x0: -999, x1: 999, n: 0 });
      this.addFeature({ kind: 'kicker', s0: L * 0.935, len: 18, h: 3.4, depth: 0, x0: -999, x1: 999, n: 0 });
    }

    for (let g = 320; g < L - 200; g += 520) this.gantries.push({ s: g });
  }

  /**
   * Place shortcuts on the OUTSIDE of sustained corners, where leaving the
   * tape genuinely shortens the path. Kept clear of big air features so you
   * never get launched blind into the woods.
   */
  private buildShortcuts() {
    const rng = this.rng;
    const NAMES = [
      'THE POACH', 'RIDGE CUT', 'BAILEY LINE', 'THE SNEAK', 'ROOT RUN',
      'DEAD DROP', 'MINERS TRACK', 'THE SHAVE',
    ];
    let n = 0;

    // ---- authored SECRET SEND: a guaranteed, generous hidden line
    for (const Z of this.zones) {
      if (!Z.secret) continue;
      const s0 = Z.t0 * this.length + 40;
      const span = (Z.t1 - Z.t0) * this.length * 0.55;
      const avg = this.curvatureAt(s0 + span * 0.5);
      this.shortcuts.push({
        s0, s1: s0 + span,
        side: avg > 0 ? -1 : 1,
        width: 9,
        saving: 46,          // by far the biggest on the mountain
        name: 'SECRET SEND',
      });
      n++;
    }

    for (let s = 260; s < this.length - 360; s += 40) {
      // never cut a shortcut across a bridge or a cliff edge
      const Zs = this.zoneAt(s);
      if (Zs.rails || Zs.dropDepth || Zs.secret) { s += 60; continue; }
      // sustained curvature over the candidate span?
      const span = rng.range(90, 150);
      let sum = 0, samples = 0;
      for (let k = s; k < s + span; k += 10) { sum += this.curvatureAt(k); samples++; }
      const avg = sum / Math.max(1, samples);
      // slightly looser so technical / low-twist mountains still get
      // meaningful off-piste lines (audit: several courses only had the
      // authored SECRET SEND and nothing else)
      if (Math.abs(avg) < 0.0055) continue;

      // don't overlap a gap / table / double
      let blocked = false;
      for (let k = s - 30; k < s + span + 30; k += 12) {
        const bl = this.buckets[Math.floor(k / this.bucketSize)];
        if (bl) for (const f of bl) {
          if (f.kind === 'gap' || f.kind === 'table' || f.kind === 'double') blocked = true;
        }
      }
      if (blocked) continue;
      // keep them apart (check ALL existing, not just the last — authored
      // SECRET SEND lives mid-mountain and used to block every earlier cut)
      let tooClose = false;
      for (const sc of this.shortcuts) {
        if (s < sc.s1 + 200 && s + span > sc.s0 - 200) { tooClose = true; break; }
      }
      if (tooClose) continue;

      // outside of the corner: curvature > 0 bends toward +x, so outside is -x
      const side = avg > 0 ? -1 : 1;
      // the chord across a curved arc is shorter than the arc itself
      const theta = Math.abs(avg) * span;
      const arcSaving = span * (1 - Math.sin(theta / 2) / Math.max(0.05, theta / 2));
      const saving = clamp(arcSaving * 1.5 + span * 0.05, 6, 34);

      this.shortcuts.push({
        s0: s, s1: s + span, side,
        width: rng.range(5.5, 8.5),
        saving,
        name: NAMES[n % NAMES.length],
      });
      n++;
      s += span + 120;
    }
  }

  /** 0..1 how strongly (s,x) sits inside a shortcut channel. */
  channelAt(s: number, x: number): number {
    let best = 0;
    for (const sc of this.shortcuts) {
      if (s < sc.s0 - 14 || s > sc.s1 + 14) continue;
      if (Math.sign(x) !== sc.side) continue;
      const hw = this.halfWidth(s);
      const out = Math.abs(x) - hw;
      if (out < -1.5 || out > sc.width) continue;
      // taper in at the mouth and out at the exit so it blends with terrain
      const along = clamp01(Math.min(s - (sc.s0 - 14), (sc.s1 + 14) - s) / 16);
      const across = clamp01(Math.min(out + 1.5, sc.width - out) / 2.2);
      best = Math.max(best, along * across);
    }
    return best;
  }

  /** Is there an open shortcut mouth at this point on the tape? */
  tapeGapAt(s: number, side: number): boolean {
    for (const sc of this.shortcuts) {
      if (sc.side !== side) continue;
      if (s > sc.s0 - 6 && s < sc.s1 + 6) return true;
    }
    return false;
  }

  shortcutAt(s: number, x: number): Shortcut | null {
    for (const sc of this.shortcuts) {
      if (s < sc.s0 || s > sc.s1) continue;
      if (Math.sign(x) !== sc.side) continue;
      if (Math.abs(x) < this.halfWidth(s) - 0.5) continue;
      return sc;
    }
    return null;
  }

  private featureHeight(f: Feature, s: number, x: number): number {
    const u = (s - f.s0) / f.len;
    if (u < 0 || u > 1) return 0;
    let h = 0;
    switch (f.kind) {
      case 'kicker':
        h = f.h * Math.pow(u, 1.65);
        break;
      case 'table':
        if (u < 0.24) h = f.h * smoothstep(u / 0.24);
        else if (u < 0.60) h = f.h;
        else h = f.h * (1 - smoothstep((u - 0.60) / 0.40));
        break;
      case 'double': {
        if (u < 0.34) h = f.h * Math.pow(u / 0.34, 1.6);
        else if (u < 0.60) h = -f.depth * Math.sin(Math.PI * (u - 0.34) / 0.26) * 0.8;
        else h = f.h * 0.85 * (1 - smoothstep((u - 0.60) / 0.40));
        break;
      }
      case 'gap': {
        if (u < 0.17) h = f.h * Math.pow(u / 0.17, 1.55);
        else if (u < 0.21) h = f.h;
        else if (u < 0.62) h = -f.depth * Math.sin(Math.PI * (u - 0.21) / 0.41);
        else if (u < 0.68) h = lerp(-f.depth * 0.28, f.h * 0.9, (u - 0.62) / 0.06);
        else h = f.h * 0.9 * (1 - smoothstep((u - 0.68) / 0.32));
        break;
      }
      case 'whoops':
        h = f.h * Math.sin(u * f.n * TAU) * Math.sin(Math.PI * u);
        break;
      case 'roller':
        h = f.h * Math.sin(Math.PI * u);
        break;
      case 'berm': {
        const hw = 8;
        const lateral = clamp01((Math.abs(x) - hw * 0.30) / (hw * 0.75));
        h = f.h * lateral * lateral * Math.sin(Math.PI * u);
        break;
      }
    }
    if (f.x0 > -900 || f.x1 < 900) {
      const feather = 2.2;
      const m = clamp01((x - f.x0) / feather) * clamp01((f.x1 - x) / feather);
      h *= m;
    }
    return h;
  }

  // -- queries --------------------------------------------------------------
  halfWidth(s: number): number {
    const f = clamp(s / STEP, 0, this.count - 1.001);
    const i = f | 0, t = f - i;
    return lerp(this.hw[i], this.hw[i + 1], t);
  }
  curvatureAt(s: number): number {
    const f = clamp(s / STEP, 0, this.count - 1.001);
    const i = f | 0, t = f - i;
    return lerp(this.curv[i], this.curv[i + 1], t);
  }
  pitchAt(s: number): number {
    const f = clamp(s / STEP, 0, this.count - 1.001);
    const i = f | 0, t = f - i;
    return lerp(this.pitch[i], this.pitch[i + 1], t);
  }
  bankAt(s: number): number {
    const f = clamp(s / STEP, 0, this.count - 1.001);
    const i = f | 0, t = f - i;
    return lerp(this.bank[i], this.bank[i + 1], t);
  }

  /** Vertical offset of the ground above the (banked) node plane. */
  heightAt(s: number, x: number): number {
    let h = 0;
    const bl = this.buckets[Math.floor(s / this.bucketSize)];
    if (bl) for (let i = 0; i < bl.length; i++) h += this.featureHeight(bl[i], s, x);

    const zi = this.zoneIdx[clamp(Math.round(s / STEP), 0, this.count - 1)];
    const Z = this.zones[zi];
    const hw = this.halfWidth(s);
    const ax = Math.abs(x);

    // micro terrain
    h += fbm2(s * 0.075, x * 0.16, 3) * 0.16 * Z.rough;
    h += fbm2(s * 0.021 + 40, x * 0.05, 2) * 0.34 * Z.rough;

    // braking-bump ruts near the racing surface
    const rut = Math.exp(-Math.pow((ax - hw * 0.34) / (hw * 0.22), 2));
    h -= rut * 0.10 * Z.rough;

    // off-track hillside: steep at the verge, easing out to rolling terrain
    if (ax > hw) {
      const t = ax - hw;
      // ---- authored drop-offs (bridge decks, cliff edges)
      if (Z.dropDepth) {
        const thisSide = x < 0 ? -1 : 1;
        if (Z.dropSide === 0 || Z.dropSide === thisSide) {
          // falls away hard and keeps going: leaving the deck is fatal
          return h - Z.dropDepth * (t * 2.2 + t * t * 0.55);
        }
      }
      const slope = x < 0 ? this.slopeLAt(s) : this.slopeRAt(s);
      let side = slope * 18 * Math.log(1 + t / 18);
      let bump = fbm2(s * 0.05, x * 0.05, 3) * Math.min(4.0, t * 0.42);
      // a shortcut channel is cut into the hillside: flatten it so it's
      // rideable, but leave some chatter so it still feels like off-piste
      const ch = this.channelAt(s, x);
      if (ch > 0) { side *= 1 - ch; bump *= 1 - ch * 0.55; }
      h += side + bump;
    }
    return h;
  }

  slopeLAt(s: number) {
    const f = clamp(s / STEP, 0, this.count - 1.001);
    const i = f | 0, t = f - i;
    return lerp(this.slopeL[i], this.slopeL[i + 1], t);
  }
  slopeRAt(s: number) {
    const f = clamp(s / STEP, 0, this.count - 1.001);
    const i = f | 0, t = f - i;
    return lerp(this.slopeR[i], this.slopeR[i + 1], t);
  }

  /** World position for track coords. */
  worldPos(s: number, x: number, h: number, out = new THREE.Vector3()): THREE.Vector3 {
    const f = clamp(s / STEP, 0, this.count - 1.001);
    const i = f | 0, t = f - i, j = i + 1;
    const pxv = lerp(this.px[i], this.px[j], t);
    const pyv = lerp(this.py[i], this.py[j], t);
    const pzv = lerp(this.pz[i], this.pz[j], t);
    const rxv = lerp(this.rx[i], this.rx[j], t);
    const ryv = lerp(this.ry[i], this.ry[j], t);
    const rzv = lerp(this.rz[i], this.rz[j], t);
    const uxv = lerp(this.ux[i], this.ux[j], t);
    const uyv = lerp(this.uy[i], this.uy[j], t);
    const uzv = lerp(this.uz[i], this.uz[j], t);
    out.set(
      pxv + rxv * x + uxv * h,
      pyv + ryv * x + uyv * h,
      pzv + rzv * x + uzv * h,
    );
    return out;
  }

  frameAt(s: number, fwd: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3) {
    const f = clamp(s / STEP, 0, this.count - 1.001);
    const i = f | 0, t = f - i, j = i + 1;
    fwd.set(lerp(this.fx[i], this.fx[j], t), lerp(this.fy[i], this.fy[j], t), lerp(this.fz[i], this.fz[j], t)).normalize();
    right.set(lerp(this.rx[i], this.rx[j], t), lerp(this.ry[i], this.ry[j], t), lerp(this.rz[i], this.rz[j], t)).normalize();
    up.set(lerp(this.ux[i], this.ux[j], t), lerp(this.uy[i], this.uy[j], t), lerp(this.uz[i], this.uz[j], t)).normalize();
  }

  surfaceAt(s: number, x: number): { grip: number; drag: number; kind: SurfaceKind; roost: number } {
    const Z = this.zoneAt(s);
    const hw = this.halfWidth(s);
    const off = Math.abs(x) > hw + 0.4;
    if (off) {
      const deep = clamp01((Math.abs(x) - hw) / 6);
      const ch = this.channelAt(s, x);
      if (ch > 0.25) {
        // loose but rideable: quicker than the rough, slower than the racing
        // line, so a shortcut is a genuine trade rather than free speed
        return {
          grip: lerp(0.72, 0.94, ch), drag: lerp(1.9, 1.15, ch),
          kind: 'gravel', roost: 1.3,
        };
      }
      return { grip: lerp(0.72, 0.42, deep), drag: lerp(1.9, 5.2, deep), kind: 'grass', roost: 0.7 };
    }
    switch (Z.surface) {
      case 'mud': return { grip: 0.74, drag: 1.35, kind: 'mud', roost: 1.5 };
      case 'rock': return { grip: 1.08, drag: 0.45, kind: 'rock', roost: 0.45 };
      case 'gravel': return { grip: 0.92, drag: 0.72, kind: 'gravel', roost: 1.1 };
      case 'grass': return { grip: 0.95, drag: 0.85, kind: 'grass', roost: 0.85 };
      default: return { grip: 1.0, drag: 0.6, kind: 'dirt', roost: 1.0 };
    }
  }

  // -- props ----------------------------------------------------------------
  private placeObstacles() {
    const rng = this.rng;
    let s = 120;
    while (s < this.length - 90) {
      const Z = this.zoneAt(s);
      const hw = this.halfWidth(s);
      // mix the section's own prop list with the surface theme's, so every
      // stretch gets fences, signs, water and rockfall appropriate to it
      const themed = THEME_PROPS[Z.surface] ?? [];
      const pool: PropKind[] = rng.chance(0.45) && themed.length
        ? themed
        : (Z.props as PropKind[]);
      // Standing logs were removed from the course (read wrong / blocked lines).
      // Filter here so any leftover pool entry never spawns.
      let type = rng.pick(pool);
      if (type === 'log') type = 'rock';
      // avoid landing zones of big features
      let blocked = false;
      const bl = this.buckets[Math.floor(s / this.bucketSize)];
      if (bl) for (const f of bl) if (f.kind === 'gap' || f.kind === 'table' || f.kind === 'double') blocked = true;
      // never put props on a bridge deck
      if (Z.rails) blocked = true;
      if (!blocked) {
        const def = PROPS[type];
        // fences run in lines along the verge; everything else clusters
        const cluster = type === 'fence' ? rng.int(3, 6)
          : type === 'cone' ? rng.int(2, 5)
          : type === 'bale' ? rng.int(1, 3) : 1;
        // some props belong at the edges, not on the racing line
        const edgeBias = type === 'fence' || type === 'sign' || type === 'barrier';
        const side = rng.sign();
        for (let k = 0; k < cluster; k++) {
          const x = edgeBias
            ? side * rng.range(hw * 0.62, hw * 0.94)
            : rng.range(-hw * 0.85, hw * 0.85);
          const r = type === 'rock' ? rng.range(0.7, 1.3) : def.radius;
          this.obstacles.push({
            s: s + k * (type === 'fence' ? 2.9 : rng.range(2.5, 6)),
            x, r, type, mass: def.mass, hit: 0,
            vx: 0, vy: 0, vs: 0, spin: 0, ox: 0, oy: 0, os: 0,
            rot: type === 'fence' || type === 'sign' ? 0 : rng.range(0, TAU),
            idx: 0, meshIdx: 0,
          });
        }
      }
      // hazardScale densifies props: Mayhem packs the trail, Time Attack opens it
      const gap = rng.range(26, 62) / this.densityScale;
      s += Math.max(8, gap);
    }
    this.obstacles.sort((a, b) => a.s - b.s);
    // idx stays unique across the whole course (collision debounce uses it).
    // meshIdx is assigned later per type when the instanced meshes are built.
    this.obstacles.forEach((o, i) => { o.idx = i; o.meshIdx = 0; });
  }

  private placeSpectators() {
    const rng = this.rng;
    let s = 20;
    while (s < this.length - 10) {
      const Z = this.zoneAt(s);
      const hw = this.halfWidth(s);
      const density = Z.crowd;
      const gap = lerp(12, 2.7, clamp01(density / 3));
      const rows = density > 1.6 ? 3 : density > 0.8 ? 2 : 1;
      for (let side = -1; side <= 1; side += 2) {
        if (density < 0.7 && rng.chance(0.45)) continue;
        // nobody stands on thin air beside a bridge or over a cliff edge
        if (Z.dropDepth !== undefined && (Z.dropSide === 0 || Z.dropSide === side)) continue;
        for (let r = 0; r < rows; r++) {
          if (rng.chance(0.22)) continue;
          this.spectators.push({
            s: s + rng.range(-1.6, 1.6),
            x: side * (hw + 1.45 + r * rng.range(1.0, 1.8) + rng.range(0, 0.5)),
            baseH: 0,
            color: SPECTATOR_COLORS[rng.int(0, SPECTATOR_COLORS.length - 1)],
            phase: rng.range(0, TAU), state: 0, t: 0,
            vx: 0, vy: 0, vs: 0, spin: 0, ox: 0, oy: 0, os: 0, rot: 0,
            scale: rng.range(0.88, 1.12),
          });
        }
      }
      s += gap;
    }
    this.spectators.sort((a, b) => a.s - b.s);
    // resolve ground height once; heightAt() is the single most expensive
    // call in the frame and these never move on their own
    for (const sp of this.spectators) sp.baseH = this.heightAt(sp.s, sp.x);
  }

  /**
   * Scenery LOD. Repacks each instanced mesh so it contains only instances
   * within that type's draw reach, then sets `count` to match — the GPU
   * never sees the rest. Combined with frustum culling this takes vegetation
   * from ~10,000 always-submitted instances down to a few hundred.
   *
   * Only repacks when the player has moved a meaningful distance, so the
   * cost is amortised rather than paid every frame.
   */
  updateSceneryLod(playerS: number, lodScale = 1, force = false) {
    if (!force && Math.abs(playerS - this.lastBandS) < 12) return;
    this.lastBandS = playerS;
    // theme pulls reach in on dense forests / long endurance courses
    const scale = lodScale * this.themeLodMul;

    for (const band of this.sceneryBands) {
      const reach = band.reach * scale;
      // a little more behind than in front is wasted; bias forward
      const lo = playerS - reach * 0.35;
      const hi = playerS + reach;
      const dst = band.mesh.instanceMatrix.array as Float32Array;
      const dstC = band.mesh.instanceColor?.array as Float32Array | undefined;
      let n = 0;
      for (let i = 0; i < band.total; i++) {
        const s = band.s[i];
        if (s < lo || s > hi) continue;
        dst.set(band.mats.subarray(i * 16, i * 16 + 16), n * 16);
        if (dstC && band.colors) {
          dstC.set(band.colors.subarray(i * 3, i * 3 + 3), n * 3);
        }
        n++;
      }
      band.mesh.count = n;
      band.mesh.instanceMatrix.needsUpdate = true;
      if (band.mesh.instanceColor) band.mesh.instanceColor.needsUpdate = true;
      // The live set is exactly the [lo, hi] track span, so its bound is
      // known without walking instances. Amortised anyway (repacks every
      // 12m), but free to do properly.
      if (!band.mesh.boundingSphere) band.mesh.boundingSphere = new THREE.Sphere();
      this.worldPos(playerS + reach * 0.3, 0, this.heightAt(playerS, 0), _p);
      band.mesh.boundingSphere.center.copy(_p);
      band.mesh.boundingSphere.radius = reach * 1.2 + 80;
    }

    this.updateSurfaceChunks(playerS, force);
  }

  /**
   * Show only terrain chunks near the player. Keeps draw count proportional
   * to visible mountain rather than full course length.
   */
  updateSurfaceChunks(playerS: number, force = false) {
    if (!this.surfaceChunks.length) return;
    if (!force && Math.abs(playerS - this.lastChunkS) < 40) return;
    this.lastChunkS = playerS;
    // generous window: surface is continuous and popping is more visible
    // than a few extra chunks. ~900 m ahead / 250 m behind covers jump lands.
    const lo = playerS - 250;
    const hi = playerS + 900;
    for (const c of this.surfaceChunks) {
      c.mesh.visible = c.s1 >= lo && c.s0 <= hi;
    }
  }

  /**
   * Release GPU resources owned by this track. Geometry and materials are
   * disposed by the caller walking the scene graph, but canvas-backed
   * textures are referenced by the material and outlive that walk unless
   * dropped explicitly — a real leak when swapping mountains repeatedly.
   */
  dispose() {
    for (const t of this.waterMaps) t.dispose();
    this.waterMaps.length = 0;
    this.sceneryBands.length = 0;
    this.surfaceChunks.length = 0;
    this.specMeshes.length = 0;
    this.propMeshes = {};
  }

  /** Scroll the water textures. One offset write per surface per frame. */
  animateWater(t: number) {
    for (const m of this.waterMaps) {
      m.offset.y = -t * 0.35;
      m.offset.x = Math.sin(t * 0.4) * 0.02;
    }
  }

  /**
   * Drive foliage wind uniforms. `windStrength` ~0.3 ambient, ~1.5–2 at
   * full speed/boost. One write for every canopy / grass material.
   */
  animateWind(t: number, windStrength: number) {
    this.windU.uTime.value = t;
    this.windU.uWind.value = windStrength;
  }

  /** Index of the first obstacle at or beyond `s` (list is sorted by s). */
  firstObstacleAfter(s: number): number {
    const list = this.obstacles;
    let a = 0, b = list.length;
    while (a < b) { const m = (a + b) >> 1; if (list[m].s < s) a = m + 1; else b = m; }
    return a;
  }

  // -- mesh building --------------------------------------------------------
  build(): THREE.Group {
    this.group = new THREE.Group();
    this.buildSurface();
    this.buildTape();
    this.buildGantries();
    this.buildSectionMarkers();
    this.buildScenery();
    this.buildPropMeshes();
    this.buildSpectatorMeshes();
    this.buildZoneSetPieces();
    this.buildLandmarks();
    this.buildBridges();
    this.buildWater();
    this.buildShortcutSigns();
    this.buildStartFinish();
    return this.group;
  }

  /**
   * Dev overlay: centreline spline, half-width ribbons, section boundaries,
   * shortcuts, jump features. Toggle via Track.debugGroup.visible.
   */
  debugGroup: THREE.Group | null = null;

  buildDebugOverlay(): THREE.Group {
    if (this.debugGroup) return this.debugGroup;
    const g = new THREE.Group();
    g.name = 'track-debug';

    // centreline
    const cPts: number[] = [];
    for (let i = 0; i < this.count; i += 2) {
      const s = i * STEP;
      const h = this.heightAt(s, 0) + 0.4;
      this.worldPos(s, 0, h, _v);
      cPts.push(_v.x, _v.y, _v.z);
    }
    const cGeo = new THREE.BufferGeometry();
    cGeo.setAttribute('position', new THREE.Float32BufferAttribute(cPts, 3));
    g.add(new THREE.Line(
      cGeo,
      new THREE.LineBasicMaterial({ color: 0xffd400, depthTest: false }),
    ));

    // width edges
    for (const side of [-1, 1] as const) {
      const pts: number[] = [];
      for (let i = 0; i < this.count; i += 3) {
        const s = i * STEP;
        const hw = this.hw[i];
        const x = side * hw;
        const h = this.heightAt(s, x) + 0.35;
        this.worldPos(s, x, h, _v);
        pts.push(_v.x, _v.y, _v.z);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      g.add(new THREE.Line(
        geo,
        new THREE.LineBasicMaterial({ color: 0x2fe6c8, depthTest: false }),
      ));
    }

    // section boundaries
    for (const Z of this.zones) {
      const s = Z.t0 * this.length;
      const hw = this.halfWidth(s);
      const h = this.heightAt(s, 0) + 0.5;
      const a = this.worldPos(s, -hw - 2, h, new THREE.Vector3());
      const b = this.worldPos(s, hw + 2, h, new THREE.Vector3());
      const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
      g.add(new THREE.Line(
        geo,
        new THREE.LineBasicMaterial({ color: 0xff2e88, depthTest: false }),
      ));
    }

    // shortcuts
    for (const sc of this.shortcuts) {
      const mid = (sc.s0 + sc.s1) * 0.5;
      const hw = this.halfWidth(mid);
      const x = sc.side * (hw + sc.width * 0.5);
      const h = this.heightAt(mid, x) + 1.2;
      this.worldPos(mid, x, h, _v);
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(1.2, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xc0f000, depthTest: false }),
      );
      m.position.copy(_v);
      g.add(m);
    }

    // features (jumps)
    for (const f of this.features) {
      if (f.kind !== 'gap' && f.kind !== 'table' && f.kind !== 'kicker' && f.kind !== 'double') continue;
      const s = f.s0 + f.len * 0.5;
      const h = this.heightAt(s, 0) + f.h + 1.5;
      this.worldPos(s, 0, h, _v);
      const m = new THREE.Mesh(
        new THREE.ConeGeometry(1.0, 2.4, 6),
        new THREE.MeshBasicMaterial({
          color: f.kind === 'gap' ? 0xff6a00 : 0x9fd0ff,
          depthTest: false,
        }),
      );
      m.position.copy(_v);
      g.add(m);
    }

    // landmarks
    for (const lm of this.landmarks) {
      const s = lm.at * this.length;
      const h = this.heightAt(s, 0) + 3;
      this.worldPos(s, 0, h, _v);
      const m = new THREE.Mesh(
        new THREE.OctahedronGeometry(1.6),
        new THREE.MeshBasicMaterial({ color: 0xff2e88, depthTest: false }),
      );
      m.position.copy(_v);
      g.add(m);
    }

    g.visible = false;
    this.debugGroup = g;
    this.group.add(g);
    return g;
  }

  private colOffsets(hw: number): number[] {
    const inner: number[] = [];
    const N = 12;
    for (let i = 0; i <= N; i++) inner.push(-hw + (2 * hw * i) / N);
    const outer = [1.0, 2.6, 5.5, 11, 22, 44, 78];
    const cols = [
      ...outer.map(o => -hw - o).reverse(),
      ...inner,
      ...outer.map(o => hw + o),
    ];
    return cols;
  }

  private buildSurface() {
    this.surfaceChunks.length = 0;
    const tex = makeDirtTexture();
    tex.repeat.set(1, 1);
    // ground shares the rider's lighting model; very high roughness keeps
    // the trail matte so the bike stays the most active surface on screen.
    // groundRough adds grit variation without fighting vertex-colour tints.
    const material = new THREE.MeshStandardMaterial({
      map: tex, vertexColors: true, roughness: 0.95, metalness: 0.0,
      roughnessMap: groundRough(),
    });
    const CHUNK = 96;
    const rngc = new RNG(999);
    const colsN = 13 + 14;

    for (let c0 = 0; c0 < this.count - 1; c0 += CHUNK) {
      const c1 = Math.min(this.count - 1, c0 + CHUNK);
      const rows = c1 - c0 + 1;
      const verts = rows * colsN;
      const pos = new Float32Array(verts * 3);
      const uv = new Float32Array(verts * 2);
      const col = new Float32Array(verts * 3);
      const idx: number[] = [];
      const cTmp = new THREE.Color();
      const cDirt = new THREE.Color(), cVerge = new THREE.Color(), cFar = new THREE.Color();

      for (let r = 0; r < rows; r++) {
        const i = c0 + r;
        const s = i * STEP;
        const hw = this.hw[i];
        const cols = this.colOffsets(hw);
        const Z = this.zones[this.zoneIdx[i]];
        cDirt.setHex(Z.dirt); cVerge.setHex(Z.verge); cFar.setHex(Z.far);
        for (let cIdx = 0; cIdx < colsN; cIdx++) {
          const x = cols[cIdx];
          const h = this.heightAt(s, x);
          this.worldPos(s, x, h, _v);
          const vi = r * colsN + cIdx;
          pos[vi * 3] = _v.x; pos[vi * 3 + 1] = _v.y; pos[vi * 3 + 2] = _v.z;
          uv[vi * 2] = x / 5.5; uv[vi * 2 + 1] = s / 5.5;

          const ax = Math.abs(x);
          const edge = clamp01((ax - hw * 0.94) / 2.4);
          const far = clamp01((ax - hw - 6) / 22);
          cTmp.copy(cDirt).lerp(cVerge, edge).lerp(cFar, far);

          // ---- MATERIAL BLENDING -------------------------------------
          // Surface type tints the trail itself, blended through a noise
          // mask so mud, gravel and snow fade into dirt instead of meeting
          // it at a hard seam.
          const blendN = fbm2(s * 0.02, x * 0.04, 2) * 0.5 + 0.5;
          if (Z.surface === 'mud') {
            const wet = clamp01((1 - edge) * (0.55 + blendN * 0.45));
            cTmp.lerp(_cMud, wet * 0.75);
          } else if (Z.surface === 'gravel') {
            cTmp.lerp(_cGravel, clamp01((1 - edge) * blendN) * 0.5);
          } else if (Z.surface === 'rock') {
            cTmp.lerp(_cRock, clamp01((1 - edge) * blendN) * 0.45);
          }
          // snow clings to the high, exposed, off-camber ground
          const snowMask = clamp01((Z.dropDepth ? 0.7 : 0) + blendN - 0.55)
            * clamp01((ax - hw * 0.7) / 6);
          if (snowMask > 0) cTmp.lerp(_cSnow, snowMask * 0.8);

          // tonal variation
          const n = fbm2(s * 0.035, x * 0.06, 3) * 0.5 + fbm2(s * 0.006, x * 0.012, 2) * 0.5;
          const shade = 1 + n * 0.22;

          // ---- WHERE TO RIDE -----------------------------------------
          // A properly worn racing line: darker, polished, and clearly
          // narrower than the trail. This is the single most important
          // readability cue on the mountain, so it is unmissable.
          const line = Math.exp(-Math.pow(ax / (hw * 0.40), 2)) * (1 - edge);
          const lineShade = 1 - line * 0.42;
          // pale scuffed shoulders either side of the line
          const scuff = Math.exp(-Math.pow((ax - hw * 0.58) / (hw * 0.18), 2)) * 0.20;

          // ---- WHERE TO TURN -----------------------------------------
          // Berms get a bright worn arc on the outside of the corner where
          // tyres actually bite, so a turn reads before you reach it.
          const curv = this.curvatureAt(s);
          const outSide = curv > 0 ? -1 : 1;
          const bermBand = Math.exp(-Math.pow((ax - hw * 0.78) / (hw * 0.22), 2));
          const berm = Math.sign(x) === outSide
            ? bermBand * clamp01(Math.abs(curv) * 90) * 0.30 : 0;

          // ---- WHERE TO JUMP -----------------------------------------
          // Kicker lips are scuffed pale by tyres. Detect a local rise and
          // brighten its leading edge.
          const hHere = this.heightAt(s, x);
          const hBack = this.heightAt(s - 3, x);
          const rise = hHere - hBack;
          const lip = clamp01(rise * 1.6) * (1 - edge) * 0.34;

          // ---- WHERE THE SHORTCUT IS ---------------------------------
          // Channel mouths get a worn, inviting track leading off-piste.
          const ch = this.channelAt(s, x);
          const cut = ch * 0.30;

          // bright dust on the very lip of the trail
          const verge = Math.exp(-Math.pow((ax - hw) / 1.3, 2)) * 0.14;
          cTmp.multiplyScalar(shade * lineShade + verge + scuff + berm + lip + cut);
          cTmp.r = clamp01(cTmp.r); cTmp.g = clamp01(cTmp.g); cTmp.b = clamp01(cTmp.b);
          col[vi * 3] = cTmp.r; col[vi * 3 + 1] = cTmp.g; col[vi * 3 + 2] = cTmp.b;
        }
      }
      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < colsN - 1; c++) {
          const a = r * colsN + c, b = a + 1, d = a + colsN, e = d + 1;
          idx.push(a, d, b, b, d, e);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, material);
      mesh.matrixAutoUpdate = false;
      mesh.frustumCulled = true;
      this.group.add(mesh);
      this.surfaceChunks.push({
        mesh,
        s0: c0 * STEP,
        s1: c1 * STEP,
      });
      rngc.next();
    }
    // start with only the summit window visible — full ribbon would thrash
    // mobile GPUs on 6 km courses before the first frame
    this.updateSurfaceChunks(0, true);
  }

  private buildTape() {
    const tex = makeTapeTexture();
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: true, opacity: 0.96 });
    const rows = this.count;
    for (let side = -1; side <= 1; side += 2) {
      const pos: number[] = [], uv: number[] = [], idx: number[] = [];
      let v = 0;
      for (let i = 0; i < rows; i++) {
        const s = i * STEP;
        const hw = this.hw[i];
        const x = side * (hw + 1.05);
        const base = this.heightAt(s, x);
        const sag = Math.sin(s * 0.35) * 0.05;
        // collapse the ribbon across shortcut mouths, bridges and cliff edges
        const Zt = this.zoneAt(s);
        const cliffSide = Zt.dropDepth !== undefined
          && (Zt.dropSide === 0 || Zt.dropSide === side);
        const open = this.tapeGapAt(s, side) || !!Zt.noTape || cliffSide;
        const loH = base + 0.62 + sag;
        const hiH = open ? loH : base + 1.02 + sag;
        const lo = this.worldPos(s, x, loH, new THREE.Vector3());
        const hi = this.worldPos(s, x, hiH, new THREE.Vector3());
        pos.push(lo.x, lo.y, lo.z, hi.x, hi.y, hi.z);
        uv.push(s / 6, 0, s / 6, 1);
        if (i > 0) {
          const a = v - 2, b = v - 1, c = v, d = v + 1;
          idx.push(a, c, b, b, c, d);
        }
        v += 2;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat);
      m.matrixAutoUpdate = false;
      this.group.add(m);
    }
    // posts
    const postCount = Math.floor(this.length / 7) * 2;
    const posts = new THREE.InstancedMesh(postGeo(), WORLD_MAT.paint(0xdedede), postCount);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
    const up = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3();
    let n = 0;
    for (let s = 0; s < this.length && n < postCount; s += 7) {
      for (let side = -1; side <= 1; side += 2) {
        if (this.tapeGapAt(s, side)) continue;
        const Zp = this.zoneAt(s);
        if (Zp.noTape) continue;
        if (Zp.dropDepth !== undefined && (Zp.dropSide === 0 || Zp.dropSide === side)) continue;
        const hw = this.halfWidth(s);
        const x = side * (hw + 1.05);
        const p = this.worldPos(s, x, this.heightAt(s, x), new THREE.Vector3());
        this.frameAt(s, fwd, right, up);
        q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
        m4.compose(p, q, sc);
        posts.setMatrixAt(n++, m4);
      }
    }
    posts.count = n;
    posts.instanceMatrix.needsUpdate = true;
    this.group.add(posts);
  }

  private buildGantries() {
    const brands = [
      ['BONK', '#ff2e44', '#fff3c4'], ['GRIT CO', '#1b1b22', '#ffd400'],
      ['MUDDOG', '#0a7d5a', '#eafff4'], ['CLONK!', '#ffd400', '#1b1b22'],
      ['SLAM JAM', '#7a2ee6', '#ffffff'], ['DIRTWAVE', '#0e6fd6', '#ffe066'],
      ['YEET FUEL', '#ff6a00', '#151515'], ['ROOST', '#111111', '#ff2e88'],
    ];
    const postMat = WORLD_MAT.metal(0x3a3a42);
    const up = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3();
    this.gantries.forEach((g, gi) => {
      const s = g.s;
      const hw = this.halfWidth(s);
      const grp = new THREE.Group();
      const br = brands[gi % brands.length];
      const tex = makeBannerTexture(br[0], br[1], br[2]);
      const bannerMat = new THREE.MeshStandardMaterial({
        map: tex, side: THREE.DoubleSide, roughness: 0.88, metalness: 0.0,
      });
      for (let side = -1; side <= 1; side += 2) {
        const x = side * (hw + 1.6);
        const p = this.worldPos(s, x, this.heightAt(s, x), new THREE.Vector3());
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.21, 6.4, 6), postMat);
        this.frameAt(s, fwd, right, up);
        pole.position.copy(p).addScaledVector(up, 3.2);
        pole.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
        grp.add(pole);
      }
      const cx = this.worldPos(s, 0, this.heightAt(s, 0), new THREE.Vector3());
      this.frameAt(s, fwd, right, up);
      const banner = new THREE.Mesh(new THREE.PlaneGeometry((hw + 1.6) * 2, 1.9), bannerMat);
      banner.position.copy(cx).addScaledVector(up, 5.4);
      // face the approaching rider, un-mirrored
      const m = new THREE.Matrix4().makeBasis(right.clone().negate(), up, fwd.clone().negate());
      banner.quaternion.setFromRotationMatrix(m);
      grp.add(banner);
      const beam = new THREE.Mesh(new THREE.BoxGeometry((hw + 1.6) * 2, 0.22, 0.22), postMat);
      beam.position.copy(cx).addScaledVector(up, 6.35);
      beam.quaternion.setFromRotationMatrix(m);
      grp.add(beam);
      this.group.add(grp);
    });
  }

  /**
   * Section landmark boards at each zone entry. THE DROP / PINE PANIC /
   * BONK BRIDGE etc. — each stretch gets a readable identity so the player
   * can navigate by landmarks, not just by HUD text.
   */
  private buildSectionMarkers() {
    // Palette cycles: dark board + gold name + mint accent reads at speed
    // against both forest and open rock.
    const palettes: [string, string, string][] = [
      ['#101014', '#ffd400', '#2fe6c8'],
      ['#1a0e14', '#ff2e88', '#ffd400'],
      ['#0e1a14', '#c0f000', '#ffffff'],
      ['#141018', '#9fd0ff', '#ff6a00'],
      ['#1a1208', '#ffb020', '#fff3c4'],
    ];
    const postMat = WORLD_MAT.metal(0x2a2a32);
    const up = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3();
    // skip the absolute start (START arch already owns that moment)
    for (let zi = 0; zi < this.zones.length; zi++) {
      const Z = this.zones[zi];
      const s = Math.max(28, Z.t0 * this.length + 6);
      // don't double-up with finish arch
      if (s > this.length - 80) continue;
      const hw = this.halfWidth(s);
      const pal = palettes[zi % palettes.length];
      // strip leading "01 " numbers for a cleaner board, keep the name punch
      const cleanName = Z.name.replace(/^\d+\s+/, '');
      const tex = makeSectionBannerTexture(cleanName, Z.sub, pal[0], pal[1], pal[2]);
      const bannerMat = new THREE.MeshStandardMaterial({
        map: tex, side: THREE.DoubleSide, roughness: 0.82, metalness: 0.04,
      });
      const grp = new THREE.Group();
      this.frameAt(s, fwd, right, up);

      // dual posts, slightly inset so they frame the racing line
      for (let side = -1; side <= 1; side += 2) {
        const x = side * (hw + 1.35);
        const p = this.worldPos(s, x, this.heightAt(s, x), new THREE.Vector3());
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 5.6, 6), postMat);
        pole.position.copy(p).addScaledVector(up, 2.8);
        pole.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
        grp.add(pole);
        // small flag pennant for silhouette at distance
        const flag = new THREE.Mesh(
          new THREE.PlaneGeometry(0.9, 0.55),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(pal[1]), side: THREE.DoubleSide }),
        );
        flag.position.copy(p).addScaledVector(up, 5.5).addScaledVector(right, side * 0.15);
        const fm = new THREE.Matrix4().makeBasis(
          right.clone().multiplyScalar(side), up, fwd.clone().negate());
        flag.quaternion.setFromRotationMatrix(fm);
        grp.add(flag);
      }

      const cx = this.worldPos(s, 0, this.heightAt(s, 0), new THREE.Vector3());
      const basis = new THREE.Matrix4().makeBasis(
        right.clone().negate(), up, fwd.clone().negate());
      const bannerW = Math.min((hw + 1.35) * 2, 22);
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(bannerW, 2.35), bannerMat);
      banner.position.copy(cx).addScaledVector(up, 4.85);
      banner.quaternion.setFromRotationMatrix(basis);
      grp.add(banner);

      // top crossbar
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(bannerW + 0.4, 0.18, 0.18), postMat);
      beam.position.copy(cx).addScaledVector(up, 5.95);
      beam.quaternion.setFromRotationMatrix(basis);
      grp.add(beam);

      // ground stripe — pale dashed "you are entering" paint on the line
      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.min(hw * 1.6, 14), 1.1),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(pal[1]), transparent: true, opacity: 0.35, depthWrite: false,
        }),
      );
      const sp = this.worldPos(s, 0, this.heightAt(s, 0) + 0.06, new THREE.Vector3());
      stripe.position.copy(sp);
      stripe.quaternion.setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(right, up, fwd));
      stripe.rotateX(-Math.PI / 2);
      stripe.renderOrder = 1;
      grp.add(stripe);

      this.group.add(grp);
    }
  }

  private buildScenery() {
    const rng = new RNG(5150);
    const up = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3();
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    const qTilt = new THREE.Quaternion();
    const MAX = 4200;

    // ---- VEGETATION VARIANTS. Four canopy shapes, each its own instanced
    // mesh, so the treeline never repeats a silhouette in a visible run.
    // Leaf mats get cheap vertex wind; trunks stay rigid (wood mat).
    const leafMat = () => {
      const m = WORLD_MAT.leaf(0xffffff);
      attachWind(m, this.windU);
      return m;
    };
    const PINE_VARIANTS = 4;
    const PER_VARIANT = Math.ceil(MAX / PINE_VARIANTS);
    const pineTops: THREE.InstancedMesh[] = [];
    const pineTrunks: THREE.InstancedMesh[] = [];
    const nPineV = new Array(PINE_VARIANTS).fill(0);
    const sPineV: Float32Array[] = [];
    for (let v = 0; v < PINE_VARIANTS; v++) {
      const top = new THREE.InstancedMesh(
        pineFoliageGeo(v), leafMat(), PER_VARIANT);
      top.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(PER_VARIANT * 3), 3);
      pineTops.push(top);
      pineTrunks.push(new THREE.InstancedMesh(
        pineTrunkVariant(v), WORLD_MAT.wood(0x5a4028), PER_VARIANT));
      sPineV.push(new Float32Array(PER_VARIANT));
    }
    const pineTrunk = pineTrunks[0];
    const pineTop = pineTops[0];
    void pineTrunkGeo;
    const broad = new THREE.InstancedMesh(broadleafGeo(), leafMat(), 1400);
    broad.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(1400 * 3), 3);
    const broadTrunk = new THREE.InstancedMesh(pineTrunkGeo(), WORLD_MAT.wood(0x6b4a2c), 1400);
    // ---- ROCK FAMILIES. Small trailside stones, mid boulders and tall
    // landmark slabs are different shapes, not one shape at three scales.
    const ROCK_KINDS: { fam: 'pebble' | 'boulder' | 'landmark'; cap: number; reach: number }[] = [
      { fam: 'pebble', cap: 1200, reach: 150 },
      { fam: 'boulder', cap: 900, reach: 300 },
      { fam: 'landmark', cap: 500, reach: 480 },
    ];
    const rockMeshes: THREE.InstancedMesh[][] = [];
    const nRockV: number[][] = [];
    const sRockV: Float32Array[][] = [];
    for (const k of ROCK_KINDS) {
      const geos = rockFamily(k.fam, 3);
      const per = Math.ceil(k.cap / 3);
      const set = geos.map(g => {
        const m = new THREE.InstancedMesh(g, WORLD_MAT.rock(0xffffff), per);
        m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(per * 3), 3);
        return m;
      });
      rockMeshes.push(set);
      nRockV.push([0, 0, 0]);
      sRockV.push([new Float32Array(per), new Float32Array(per), new Float32Array(per)]);
    }
    const rocks = new THREE.InstancedMesh(rockGeo(11), WORLD_MAT.rock(0xffffff), 1);
    rocks.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(3), 3);
    const bushes = new THREE.InstancedMesh(bushGeo(), leafMat(), 2200);
    bushes.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(2200 * 3), 3);

    let nPine = 0, nBroad = 0, nRock = 0, nBush = 0;
    const col = new THREE.Color();
    // remember where each instance lives so the LOD pass can band them
    const sPine = new Float32Array(MAX);
    const sBroad = new Float32Array(1400);
    const sRock = new Float32Array(2600);
    const sBush = new Float32Array(2200);

    for (let s = 4; s < this.length; s += 3.2) {
      const Z = this.zoneAt(s);
      const hw = this.halfWidth(s);
      this.frameAt(s, fwd, right, up);
      const attempts = 3;
      for (let a = 0; a < attempts; a++) {
        const side = rng.sign();
        const dist = 2.2 + Math.pow(rng.next(), 0.55) * 75;
        const x = side * (hw + dist);
        const h = this.heightAt(s, x);
        const p = this.worldPos(s, x, h, new THREE.Vector3());
        const near = clamp01(1 - dist / 78);
        q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
        qTilt.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, TAU));
        q.multiply(qTilt);

        const roll = rng.next();
        const treeK = Z.treeDensity * this.densityScale;
        const rockK = Z.rockDensity * this.densityScale;
        if (roll < treeK * 0.34 * (0.4 + near * 0.9) && Z.treeType !== 'none') {
          const isPine = Z.treeType === 'pine' || (Z.treeType === 'mixed' && rng.chance(0.55));
          const scale = rng.range(1.5, 3.6) * (isPine ? 1.5 : 1.0);
          if (isPine && nPine < MAX) {
            // spread across variant buckets so neighbours differ in shape
            const vi = rng.int(0, PINE_VARIANTS - 1);
            const slot = nPineV[vi];
            if (slot < PER_VARIANT) {
              sc.set(scale * rng.range(0.7, 1.0), scale * rng.range(1.5, 2.6), scale * rng.range(0.7, 1.0));
              m4.compose(p, q, sc); pineTrunks[vi].setMatrixAt(slot, m4);
              sc.set(scale * rng.range(0.85, 1.25), scale * rng.range(1.4, 2.4), scale * rng.range(0.85, 1.25));
              m4.compose(p, q, sc); pineTops[vi].setMatrixAt(slot, m4);
              col.setHSL(0.28 + rng.range(-0.035, 0.045), rng.range(0.32, 0.6), rng.range(0.14, 0.28));
              pineTops[vi].instanceColor!.setXYZ(slot, col.r, col.g, col.b);
              sPineV[vi][slot] = s;
              nPineV[vi]++;
              nPine++;
            }
          } else if (!isPine && nBroad < 1400) {
            sc.set(scale * rng.range(0.9, 1.3), scale * rng.range(0.9, 1.4), scale * rng.range(0.9, 1.3));
            m4.compose(p, q, sc); broad.setMatrixAt(nBroad, m4);
            sc.set(scale * 0.55, scale * 1.0, scale * 0.55);
            m4.compose(p, q, sc); broadTrunk.setMatrixAt(nBroad, m4);
            col.setHSL(0.24 + rng.range(-0.05, 0.06), rng.range(0.35, 0.65), rng.range(0.20, 0.36));
            broad.instanceColor!.setXYZ(nBroad, col.r, col.g, col.b);
            sBroad[nBroad] = s;
            nBroad++;
          }
        } else if (roll < treeK * 0.34 + rockK * 0.22) {
          // family by distance: pebbles line the trail, landmarks sit out
          // on the hillside where they read against the sky
          const ki = dist < 9 ? 0 : dist < 30 ? 1 : 2;
          const vi = rng.int(0, 2);
          const slot = nRockV[ki][vi];
          const per = sRockV[ki][vi].length;
          if (slot < per) {
            const base = ki === 0 ? rng.range(0.35, 0.8)
              : ki === 1 ? rng.range(0.9, 2.2) : rng.range(2.4, 5.5);
            sc.set(base * rng.range(0.8, 1.5), base * rng.range(0.5, 1.1),
              base * rng.range(0.8, 1.5));
            m4.compose(p, q, sc);
            rockMeshes[ki][vi].setMatrixAt(slot, m4);
            const g0 = rng.range(0.30, 0.55);
            col.setRGB(g0 * 1.05, g0 * 0.98, g0 * 0.9).lerp(new THREE.Color(Z.far), 0.35);
            rockMeshes[ki][vi].instanceColor!.setXYZ(slot, col.r, col.g, col.b);
            sRockV[ki][vi][slot] = s;
            nRockV[ki][vi]++;
          }
        } else if (rng.chance(0.30) && nBush < 2200) {
          const scale = rng.range(0.5, 1.6);
          sc.set(scale * rng.range(0.9, 1.5), scale * rng.range(0.7, 1.3), scale * rng.range(0.9, 1.5));
          m4.compose(p, q, sc); bushes.setMatrixAt(nBush, m4);
          col.setHex(Z.verge).offsetHSL(rng.range(-0.03, 0.03), rng.range(-0.1, 0.1), rng.range(-0.09, 0.06));
          bushes.instanceColor!.setXYZ(nBush, col.r, col.g, col.b);
          sBush[nBush] = s;
          nBush++;
        }
      }
    }
    broad.count = nBroad; broadTrunk.count = nBroad;
    rocks.count = nRock; bushes.count = nBush;
    void pineTrunk; void pineTop;

    // ---- register LOD bands -------------------------------------------
    // Draw reach is per-type and chosen by silhouette value: tree canopies
    // define the horizon so they persist furthest; bushes are ground clutter
    // that contributes nothing past mid range, so they cut early.
    const reg = (
      mesh: THREE.InstancedMesh, s: Float32Array, n: number, reach: number,
    ) => {
      const mats = new Float32Array(n * 16);
      mats.set(mesh.instanceMatrix.array.subarray(0, n * 16));
      const colors = mesh.instanceColor
        ? new Float32Array(mesh.instanceColor.array.subarray(0, n * 3))
        : null;
      this.sceneryBands.push({
        mesh, s: s.slice(0, n), mats, colors, total: n, reach,
      });
      // real frustum culling now that counts change per frame
      mesh.frustumCulled = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(mesh);
    };
    // canopies hold the horizon, so they persist furthest; trunks are
    // invisible long before the canopy is
    // Canopy reach is set BEYOND where the fog can hide a pop, so the
    // treeline genuinely recedes instead of being culled behind a curtain.
    // Trunks stay short: they're invisible long before the canopy is, and
    // they're the cheaper half to drop.
    for (let v = 0; v < PINE_VARIANTS; v++) {
      pineTops[v].count = nPineV[v];
      pineTrunks[v].count = nPineV[v];
      reg(pineTrunks[v], sPineV[v], nPineV[v], 240);
      reg(pineTops[v], sPineV[v], nPineV[v], 700);
    }
    void sPine;
    reg(broadTrunk, sBroad, nBroad, 240);
    reg(broad, sBroad, nBroad, 420);
    for (let ki = 0; ki < ROCK_KINDS.length; ki++) {
      for (let vi = 0; vi < 3; vi++) {
        const m = rockMeshes[ki][vi];
        m.count = nRockV[ki][vi];
        reg(m, sRockV[ki][vi], nRockV[ki][vi], ROCK_KINDS[ki].reach);
      }
    }
    void rocks; void sRock; void nRock;
    reg(bushes, sBush, nBush, 130);      // ground clutter: near only

    // ---- GRASS. Billboard-cross tufts along the verge, which is where the
    // eye actually reads ground detail. Very short draw reach: grass is a
    // near-band texture, and pushing it further buys nothing but instances.
    const GMAX = 3000;
    const grassTex = makeTuftTexture();
    const grassMat = new THREE.MeshStandardMaterial({
      map: grassTex, transparent: true, alphaTest: 0.35,
      side: THREE.DoubleSide, roughness: 0.97, metalness: 0.0,
    });
    attachWind(grassMat, this.windU);
    const grass = new THREE.InstancedMesh(tuftGeo(), grassMat, GMAX);
    grass.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(GMAX * 3), 3);
    const sGrass = new Float32Array(GMAX);
    let nGrass = 0;
    for (let s = 2; s < this.length && nGrass < GMAX; s += 2.4) {
      const Z = this.zoneAt(s);
      if (Z.rails || Z.surface === 'rock') continue;
      const hw = this.halfWidth(s);
      for (let k = 0; k < 2 && nGrass < GMAX; k++) {
        if (rng.chance(0.45)) continue;
        const side = rng.sign();
        const x = side * (hw + rng.range(0.6, 9));
        const h = this.heightAt(s, x);
        const p = this.worldPos(s, x, h, new THREE.Vector3());
        this.frameAt(s, fwd, right, up);
        q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
        q.multiply(qTilt.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, TAU)));
        const sc2 = rng.range(0.5, 1.15);
        sc.set(sc2, sc2 * rng.range(0.8, 1.5), sc2);
        m4.compose(p, q, sc);
        grass.setMatrixAt(nGrass, m4);
        col.setHex(Z.verge).offsetHSL(rng.range(-0.03, 0.03), rng.range(-0.12, 0.1), rng.range(-0.12, 0.08));
        grass.instanceColor.setXYZ(nGrass, col.r, col.g, col.b);
        sGrass[nGrass] = s;
        nGrass++;
      }
    }
    grass.count = nGrass;
    reg(grass, sGrass, nGrass, 85);

    // ---- SMALL PLANTS + FALLEN BRANCHES. Near-band forest floor detail.
    // Three variants each, only in wooded sections, short draw reach.
    const detailSets: { mesh: THREE.InstancedMesh; s: Float32Array; n: number }[] = [];
    for (let v = 0; v < 3; v++) {
      const cap = 500;
      const plant = new THREE.InstancedMesh(plantGeo(v), leafMat(), cap);
      plant.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      const branch = new THREE.InstancedMesh(
        branchGeo(v), WORLD_MAT.wood(0x6a5238), cap);
      detailSets.push(
        { mesh: plant, s: new Float32Array(cap), n: 0 },
        { mesh: branch, s: new Float32Array(cap), n: 0 });
    }
    for (let s = 3; s < this.length; s += 3.6) {
      const Z = this.zoneAt(s);
      if (Z.treeDensity < 0.3 || Z.rails) continue;
      const hw = this.halfWidth(s);
      for (let k = 0; k < 2; k++) {
        if (rng.chance(0.5)) continue;
        const pick = rng.int(0, detailSets.length - 1);
        const set = detailSets[pick];
        if (set.n >= set.s.length) continue;
        const x = rng.sign() * (hw + rng.range(1.5, 16));
        const h = this.heightAt(s, x);
        const pp = this.worldPos(s, x, h, new THREE.Vector3());
        this.frameAt(s, fwd, right, up);
        q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
        q.multiply(qTilt.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, TAU)));
        const sz = rng.range(0.7, 1.5);
        sc.set(sz, sz * rng.range(0.8, 1.3), sz);
        m4.compose(pp, q, sc);
        set.mesh.setMatrixAt(set.n, m4);
        if (set.mesh.instanceColor) {
          col.setHex(Z.verge).offsetHSL(rng.range(-0.04, 0.04), 0, rng.range(-0.14, 0.05));
          set.mesh.instanceColor.setXYZ(set.n, col.r, col.g, col.b);
        }
        set.s[set.n] = s;
        set.n++;
      }
    }
    for (const d of detailSets) {
      d.mesh.count = d.n;
      reg(d.mesh, d.s, d.n, 95);
    }
  }

  private buildPropMeshes() {
    const defs: Record<string, { geo: THREE.BufferGeometry; color: number }> = {
      bale: { geo: baleGeo(), color: 0xd8b45c },
      cone: { geo: coneGeo(), color: 0xff5a1f },
      barrel: { geo: barrelGeo(), color: 0x2f7bff },
      log: { geo: logGeo(), color: 0x6b4a2c },
      rock: { geo: rockGeo(31), color: 0x7d766c },
      puddle: { geo: new THREE.CircleGeometry(1.4, 12).rotateX(-Math.PI / 2), color: 0x30404a },
      // --- environmental additions
      fence: { geo: fenceGeo(), color: 0xc4a878 },
      sign: { geo: signGeo(), color: 0xe8e2d0 },
      barrier: { geo: barrierGeo(), color: 0xff8a1f },
      ramp: { geo: rampGeo(), color: 0x8a6237 },
      boulder: { geo: rockGeo(77), color: 0x6e675d },
      water: { geo: new THREE.CircleGeometry(3.2, 18).rotateX(-Math.PI / 2), color: 0x6fa3b8 },
      drift: { geo: driftGeo(), color: 0xeaf2f8 },
    };
    const counts: Record<string, number> = {};
    this.obstacles.forEach(o => { counts[o.type] = (counts[o.type] || 0) + 1; });
    for (const k of Object.keys(defs)) {
      const c = counts[k] || 0;
      if (c === 0) continue;
      // standing water gets the scrolling ripple map so puddles and pools
      // read as liquid rather than painted discs
      const wet = k === 'water' || k === 'puddle';
      let pm: THREE.Material;
      if (wet) {
        const rt = makeRippleTexture();
        rt.repeat.set(2, 2);
        this.waterMaps.push(rt);
        // wetter, slightly glossier than the old flat discs; puddles sit a
        // touch darker so shallow water still reads against trail dirt
        pm = new THREE.MeshStandardMaterial({
          color: k === 'puddle' ? 0x3d6270 : 0x5eb4c8,
          map: rt,
          transparent: true,
          opacity: k === 'puddle' ? 0.78 : 0.84,
          depthWrite: false,
          roughness: 0.16,
          metalness: 0.12,
        });
      } else {
        // rocks and logs are natural; everything else is course furniture
        pm = (k === 'rock' || k === 'boulder')
          ? WORLD_MAT.rock(defs[k].color)
          : (k === 'log') ? WORLD_MAT.wood(defs[k].color)
            : WORLD_MAT.paint(defs[k].color);
      }
      const mesh = new THREE.InstancedMesh(defs[k].geo, pm, c);
      // props sit on the racing line, so they get real frustum culling and
      // a bounding sphere refreshed by refreshProps()
      mesh.frustumCulled = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = c;
      this.propMeshes[k] = mesh;
      this.group.add(mesh);

      // static edge foam rings — cheap readability for wet props without
      // per-frame geometry. Matrices track the water instances in refreshProps.
      if (wet) {
        const r = k === 'puddle' ? 1.4 : 3.2;
        const foamGeo = new THREE.RingGeometry(r * 0.72, r * 1.08, k === 'puddle' ? 14 : 20);
        foamGeo.rotateX(-Math.PI / 2);
        foamGeo.translate(0, 0.05, 0);
        const foamMat = new THREE.MeshStandardMaterial({
          color: 0xe4f2f8,
          transparent: true,
          opacity: 0.52,
          depthWrite: false,
          roughness: 0.92,
          metalness: 0.0,
        });
        const foam = new THREE.InstancedMesh(foamGeo, foamMat, c);
        foam.frustumCulled = true;
        foam.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        foam.count = c;
        this.propMeshes[`${k}_foam`] = foam;
        this.group.add(foam);
      }
    }
    // assign per-type instance slots (idx remains the global unique id)
    const seen: Record<string, number> = {};
    this.obstacles.forEach(o => { o.meshIdx = seen[o.type] = (seen[o.type] ?? -1) + 1; });
    this.refreshProps();
  }

  refreshProps(sMin = -1e9, sMax = 1e9) {
    const m4 = _m4, q = _q, sc = _sc;
    const up = _up, fwd = _fwd, right = _right, p = _p;
    for (const o of this.obstacles) {
      if (o.s < sMin || o.s > sMax) continue;
      const mesh = this.propMeshes[o.type];
      if (!mesh) continue;
      const foam = this.propMeshes[`${o.type}_foam`];
      const mi = o.meshIdx;
      // shattered props are gone: collapse them to nothing
      if (o.gone) {
        m4.makeScale(0, 0, 0);
        mesh.setMatrixAt(mi, m4);
        if (foam) foam.setMatrixAt(mi, m4);
        continue;
      }
      const s = o.s + o.os, x = o.x + o.ox;
      const h = this.heightAt(s, x) + o.oy;
      this.worldPos(s, x, h, p);
      this.frameAt(s, fwd, right, up);
      q.setFromUnitVectors(_yAxis, up);
      // fences, signs and barriers align across the track, not randomly
      const aligned = o.type === 'fence' || o.type === 'sign'
        || o.type === 'barrier' || o.type === 'ramp';
      q.multiply(_qb.setFromAxisAngle(_yAxis, aligned ? Math.PI / 2 : o.rot));
      if (o.hit > 0) q.multiply(_qb.setFromAxisAngle(_tumbleAxis, o.hit * o.spin));
      const sz = o.type === 'rock' || o.type === 'boulder' ? o.r : 1;
      sc.set(sz, sz, sz);
      m4.compose(p, q, sc);
      mesh.setMatrixAt(mi, m4);
      // foam rings share the wet prop transform (geometry is pre-sized)
      if (foam) foam.setMatrixAt(mi, m4);
    }
    // Props are scattered along the whole course, so their true bound is
    // effectively the whole mountain. Computing it per frame walks every
    // instance for no benefit — set it once, wide, and let per-object
    // frustum culling do its job on the draw call.
    for (const k of Object.keys(this.propMeshes)) {
      const m = this.propMeshes[k];
      m.instanceMatrix.needsUpdate = true;
      if (!m.boundingSphere) {
        m.boundingSphere = new THREE.Sphere();
        this.worldPos(this.length * 0.5, 0, this.heightAt(this.length * 0.5, 0), _p);
        m.boundingSphere.center.copy(_p);
        m.boundingSphere.radius = this.length;
      }
    }
  }

  private buildSpectatorMeshes() {
    const { bodyG, headG, legG, armG } = spectatorParts();
    const N = this.spectators.length;
    const mkm = (g: THREE.BufferGeometry, c: number, colored: boolean) => {
      const m = new THREE.InstancedMesh(g, WORLD_MAT.fabric(colored ? 0xffffff : c), N);
      if (colored) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
      // spectators are the densest instance set on the mountain; they must
      // frustum-cull, and updateSpectators() keeps count to the live window
      m.frustumCulled = true;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = N;
      this.group.add(m);
      return m;
    };
    const body = mkm(bodyG, 0, true);
    const head = mkm(headG, 0xd8a172, true);
    const legs = mkm(legG, 0x2b2b35, false);
    const arms = mkm(armG, 0, true);
    this.specMeshes = [body, head, legs, arms];

    const col = new THREE.Color();
    const rng = new RNG(66);
    this.spectators.forEach((sp, i) => {
      col.setHex(sp.color);
      body.instanceColor!.setXYZ(i, col.r, col.g, col.b);
      const skin = new THREE.Color().setHSL(0.07, rng.range(0.25, 0.5), rng.range(0.28, 0.72));
      head.instanceColor!.setXYZ(i, skin.r, skin.g, skin.b);
      arms.instanceColor!.setXYZ(i, skin.r, skin.g, skin.b);
    });
    body.instanceColor!.needsUpdate = true;
    head.instanceColor!.needsUpdate = true;
    arms.instanceColor!.needsUpdate = true;
    // one full pass so off-window instances aren't stacked at the origin
    for (let i = 0; i < this.spectators.length; i++) this.poseSpectator(i, 0);
    this.specMeshes.forEach(m => (m.instanceMatrix.needsUpdate = true));
  }

  private poseSpectator(i: number, time: number) {
    const sp = this.spectators[i];
    const [body, head, legs, arms] = this.specMeshes;
    const s = sp.s + sp.os, x = sp.x + sp.ox;
    // only a bonked spectator has actually moved, so only they need a resolve
    const h = (sp.state === 1 ? this.heightAt(s, x) : sp.baseH) + sp.oy;
    this.worldPos(s, x, h, _p);
    this.frameAt(s, _fwd, _right, _up);
    _q.setFromUnitVectors(_yAxis, _up);
    _q.multiply(_qb.setFromAxisAngle(_yAxis,
      (sp.x < 0 ? 1 : -1) * Math.PI / 2 + Math.sin(time * 0.6 + sp.phase) * 0.25));
    if (sp.state === 1) _q.multiply(_qb.setFromAxisAngle(_tumbleAxis2, sp.rot));
    const bob = sp.state === 0 ? Math.abs(Math.sin(time * 5.5 + sp.phase)) * 0.13 : 0;
    _sc.set(sp.scale, sp.scale * (1 + bob * 0.14), sp.scale);
    _m4.compose(_p, _q, _sc);
    body.setMatrixAt(i, _m4);
    legs.setMatrixAt(i, _m4);
    _sc.set(sp.scale, sp.scale, sp.scale);
    _p2.copy(_p).addScaledVector(_up, bob * 0.9);
    _m4.compose(_p2, _q, _sc);
    head.setMatrixAt(i, _m4);
    const armRaise = sp.state === 0 ? Math.sin(time * 7 + sp.phase) * 0.55 : 0;
    _q.multiply(_qb.setFromAxisAngle(_zAxis, armRaise));
    _m4.compose(_p2, _q, _sc);
    arms.setMatrixAt(i, _m4);
  }

  /**
   * Stand everyone back up and re-pose the full list. Needed on restart:
   * the per-frame path only touches a window, so a spectator bonked last run
   * would otherwise stay face-down forever.
   */
  resetSpectators() {
    for (const sp of this.spectators) {
      sp.state = 0; sp.t = 0; sp.rot = 0;
      sp.ox = sp.oy = sp.os = 0;
      sp.vx = sp.vy = sp.vs = sp.spin = 0;
    }
    if (!this.specMeshes.length) return;
    for (let i = 0; i < this.spectators.length; i++) this.poseSpectator(i, 0);
    for (const m of this.specMeshes) {
      const attr = m.instanceMatrix as THREE.InstancedBufferAttribute & {
        clearUpdateRanges?: () => void;
      };
      attr.clearUpdateRanges?.();
      attr.needsUpdate = true;
    }
  }

  /** Animate spectators in a window around the player. */
  updateSpectators(playerS: number, time: number, dt: number, crowdScale = 1) {
    if (!this.specMeshes.length) return;
    const list = this.spectators;
    // LOD: the animation window shrinks under load. Spectators outside it
    // keep their last pose — they're static scenery, not gameplay.
    const lo = playerS - 45, hi = playerS + 230 * crowdScale;
    let a = 0, b = list.length - 1;
    while (a < b) { const m = (a + b) >> 1; if (list[m].s < lo) a = m + 1; else b = m; }

    let i = a;
    for (; i < list.length; i++) {
      const sp = list[i];
      if (sp.s > hi) break;
      if (sp.state === 1) {
        sp.t += dt;
        sp.vy -= 26 * dt;
        sp.ox += sp.vx * dt; sp.oy += sp.vy * dt; sp.os += sp.vs * dt;
        sp.rot += sp.spin * dt;
        sp.vx *= Math.exp(-0.9 * dt); sp.vs *= Math.exp(-0.9 * dt);
        if (sp.oy < 0) {
          sp.oy = 0; sp.vy *= -0.32; sp.vx *= 0.7; sp.vs *= 0.7; sp.spin *= 0.55;
          if (Math.abs(sp.vy) < 1.2) { sp.vy = 0; sp.spin *= 0.2; }
        }
      }
      this.poseSpectator(i, time);
    }
    // Upload only the slice we touched. Flagging the whole attribute would
    // re-send every spectator matrix (~1MB/frame) to move a few hundred.
    const lastTouched = Math.min(i - 1, list.length - 1);
    this.specWindow.a = a; this.specWindow.b = lastTouched;
    const count = Math.max(0, lastTouched - a + 1);
    // Draw only the live window. InstancedMesh has no start offset, so the
    // range [0..a) still submits — but those are behind the camera and get
    // frustum-culled per draw call, which is the cheap path.
    //
    // PROFILING NOTE: this used to call computeBoundingSphere() per mesh per
    // frame. That walks EVERY instance matrix — 4 meshes x ~3000 instances =
    // ~12k matrix reads a frame, to recompute a volume that barely moves.
    // The window is a known span of track, so derive the bound analytically
    // instead: one worldPos call, no iteration.
    const midS = (list[a]?.s ?? playerS + 90);
    const spanS = Math.max(40, hi - lo);
    this.worldPos(midS + spanS * 0.35, 0, this.heightAt(midS, 0), _p);
    for (const m of this.specMeshes) {
      m.count = Math.min(list.length, lastTouched + 1);
      if (!m.boundingSphere) m.boundingSphere = new THREE.Sphere();
      // generous radius: cheaper to occasionally draw an off-screen batch
      // than to walk thousands of matrices every frame to tighten it
      m.boundingSphere.center.copy(_p);
      m.boundingSphere.radius = spanS * 0.75 + 60;
    }
    for (const m of this.specMeshes) {
      const attr = m.instanceMatrix as THREE.InstancedBufferAttribute & {
        addUpdateRange?: (s: number, c: number) => void;
        clearUpdateRanges?: () => void;
        updateRange?: { offset: number; count: number };
      };
      if (count > 0 && typeof attr.addUpdateRange === 'function') {
        attr.clearUpdateRanges?.();
        attr.addUpdateRange(a * 16, count * 16);
      } else if (count > 0 && attr.updateRange) {
        attr.updateRange.offset = a * 16;
        attr.updateRange.count = count * 16;
      }
      attr.needsUpdate = true;
    }
  }

  /**
   * Signature silhouettes per zone. Colour and physics already differ; this
   * gives each stretch a shape you recognise from a distance.
   */
  private buildZoneSetPieces() {
    const rng = new RNG(80808);
    const grp = new THREE.Group();
    const up = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3();
    const wood = WORLD_MAT.wood(0x6b4a2c);
    const darkWood = WORLD_MAT.wood(0x4a3320);
    const metal = WORLD_MAT.metal(0x59606b);
    const rust = WORLD_MAT.paint(0x8a4b2a);
    const stone = WORLD_MAT.rock(0x8a7d6d);
    const hay = WORLD_MAT.fabric(0xd8b45c);
    const deadWood = WORLD_MAT.wood(0x4b4438);
    // small shared pool — building a fresh displaced icosahedron per pillar
    // meant dozens of one-off geometries uploaded at load for no visual gain
    const rockPool = [rockGeo(3), rockGeo(17), rockGeo(41), rockGeo(63)];

    /** Place a mesh at track coords, aligned to the surface. */
    const put = (mesh: THREE.Object3D, s: number, x: number, lift = 0, yaw = 0) => {
      const h = this.heightAt(s, x) + lift;
      this.worldPos(s, x, h, _p);
      this.frameAt(s, _fwd2, _right2, _up2);
      mesh.position.copy(_p);
      mesh.quaternion.setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(_right2, _up2, _fwd2));
      mesh.rotateY(yaw);
      grp.add(mesh);
      return mesh;
    };
    void up; void fwd; void right;

    for (let zi = 0; zi < this.zones.length; zi++) {
      const Z = this.zones[zi];
      const s0 = Z.t0 * this.length, s1 = Z.t1 * this.length;

      // Set-piece scenery is keyed by theme. Authored sections prefer an
      // explicit setpiece tag; otherwise name-based detection covers the
      // generic default course and loosely-named mountain sections.
      const n = Z.name.toUpperCase();
      const theme = Z.setpiece
        ?? (/PINE|THORN|ROOT|FOREST|BIRCH|ANCIENT/.test(n) ? 'PINE PLUNGE'
          : /ROCK|CLIFF|CANYON|ASH|BASALT|IRON|JAW|TEETH|SCREE|CRAG|SPINE|COLLAPS/.test(n) ? 'CANYON CUT'
          : /BONKYARD|SCRAP|PACK FIGHT|BONK/.test(n) ? 'THE BONKYARD'
          : /MUD/.test(n) ? 'MUDPIT MIRE'
          : /HAY|FARM/.test(n) ? 'HAYSTACK HOLLOW'
          : /BIG AIR|RIDGE JUMP|FINAL JUMP|ERUPTION|GAP/.test(n) ? 'BIG AIR'
          : /KICKER|WIND GAP/.test(n) ? 'KICKER RIDGE'
          : /FINAL|FINISH|SUMMIT RUN|EMERGENCE|SEND/.test(n) ? 'FINISH FURY'
          : /DROP|START|GATE|CALDERA|HIGH GATE|THE SPINE/.test(n) ? 'START GATE'
          : /LAVA|CINDER|VOLCAN/.test(n) ? 'CANYON CUT'
          : '');

      switch (theme) {
        case 'PINE PLUNGE': {
          // fallen giants arching over the trail
          for (let s = s0 + 40; s < s1; s += rng.range(95, 150)) {
            const hw = this.halfWidth(s);
            const trunk = new THREE.Mesh(
              new THREE.CylinderGeometry(0.55, 0.75, hw * 2.9, 7), wood);
            trunk.rotation.z = Math.PI / 2;
            // high enough that even a stomped kicker won't clip through it
            put(trunk, s, 0, rng.range(6.4, 8.0), rng.range(-0.3, 0.3));
            // snapped stump at the verge
            const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.05, 2.4, 7), darkWood);
            put(stump, s + 3, -(hw + 3), 1.2);
          }
          break;
        }
        case 'BIG AIR': {
          // Timber revetment at the largest gap inside this section (or the
          // section mid-point if none). Works for Shaleback, Lastlight, etc.
          let gapS = (s0 + s1) * 0.5;
          let gapLen = 60;
          for (const f of this.features) {
            if (f.kind !== 'gap' && f.kind !== 'table') continue;
            if (f.s0 < s0 || f.s0 > s1) continue;
            if (f.len > gapLen || f.kind === 'gap') {
              gapS = f.s0; gapLen = f.len;
              if (f.kind === 'gap') break;
            }
          }
          for (let side = -1; side <= 1; side += 2) {
            for (let k = 0; k < 7; k++) {
              const s = gapS + k * 3.2;
              const hw = this.halfWidth(s);
              const wall = new THREE.Mesh(
                new THREE.BoxGeometry(0.5, 2.2 + k * 0.55, 3.3), wood);
              put(wall, s, side * (hw + 0.9), (2.2 + k * 0.55) * 0.5 - 0.4);
            }
            for (let k = 0; k < 4; k++) {
              const s = gapS + gapLen * 0.7 + k * 4;
              const hw = this.halfWidth(s);
              const post = new THREE.Mesh(
                new THREE.CylinderGeometry(0.13, 0.16, 3.4, 6), darkWood);
              put(post, s, side * (hw + 1.3), 1.7);
            }
          }
          const hwG = this.halfWidth(gapS - 14);
          for (let side = -1; side <= 1; side += 2) {
            const tower = new THREE.Mesh(
              new THREE.BoxGeometry(0.7, 11, 0.7), metal);
            put(tower, gapS - 14, side * (hwG + 2.4), 5.5);
          }
          const beam = new THREE.Mesh(
            new THREE.BoxGeometry((hwG + 2.4) * 2, 0.8, 0.6), rust);
          put(beam, gapS - 14, 0, 11);
          break;
        }
        case 'KICKER RIDGE': {
          // timber scaffold ramps flanking the run
          for (let s = s0 + 30; s < s1; s += rng.range(70, 110)) {
            const hw = this.halfWidth(s);
            const side = rng.sign();
            const frame = new THREE.Group();
            for (let i = 0; i < 4; i++) {
              const leg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 2.2 + i * 0.7, 0.24), wood);
              leg.position.set(i * 0.9 - 1.35, (2.2 + i * 0.7) / 2, 0);
              frame.add(leg);
            }
            const deck = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.22, 1.8), darkWood);
            deck.position.set(0, 3.1, 0); deck.rotation.z = -0.34;
            frame.add(deck);
            put(frame, s, side * (hw + 2.6), 0, side > 0 ? 0.4 : -0.4);
          }
          break;
        }
        case 'HAYSTACK HOLLOW': {
          // barns + a windmill on the skyline
          for (let s = s0 + 50; s < s1; s += rng.range(120, 190)) {
            const hw = this.halfWidth(s);
            const side = rng.sign();
            const barn = new THREE.Group();
            const body = new THREE.Mesh(new THREE.BoxGeometry(9, 5.5, 12),
              WORLD_MAT.paint(0x9c3b2e));
            body.position.y = 2.75; barn.add(body);
            const roof = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 12.2, 3, 1),
              WORLD_MAT.metal(0x3a3f45));
            roof.rotation.x = Math.PI / 2; roof.rotation.z = Math.PI;
            roof.position.y = 6.4; barn.add(roof);
            put(barn, s, side * (hw + rng.range(13, 22)), 0, rng.range(-0.5, 0.5));
            // hay stacks
            for (let k = 0; k < 4; k++) {
              const b = new THREE.Mesh(baleGeo(), hay);
              b.scale.setScalar(rng.range(0.9, 1.3));
              put(b, s + rng.range(-14, 14), side * (hw + rng.range(3, 9)), 0, rng.range(0, 3));
            }
          }
          break;
        }
        case 'CANYON CUT': {
          // sheer pillars pinching the gorge
          for (let s = s0 + 15; s < s1; s += rng.range(26, 44)) {
            const hw = this.halfWidth(s);
            for (let side = -1; side <= 1; side += 2) {
              if (rng.chance(0.25)) continue;
              // don't stack rock over a drop-away edge
              if (Z.dropDepth !== undefined
                && (Z.dropSide === 0 || Z.dropSide === side)) continue;
              const hgt = rng.range(9, 26);
              const pillar = new THREE.Mesh(rockPool[rng.int(0, 3)], stone);
              pillar.scale.set(rng.range(3, 6), hgt, rng.range(3, 6));
              put(pillar, s + rng.range(-6, 6), side * (hw + rng.range(3.2, 6.5)), 0, rng.range(0, 3));
            }
          }
          break;
        }
        case 'THE BONKYARD': {
          // stacked wrecks, containers and a crane arm
          for (let s = s0 + 25; s < s1; s += rng.range(45, 80)) {
            const hw = this.halfWidth(s);
            const side = rng.sign();
            const stack = new THREE.Group();
            const n = rng.int(2, 4);
            for (let i = 0; i < n; i++) {
              const box = new THREE.Mesh(
                new THREE.BoxGeometry(rng.range(2.4, 3.4), 2.2, rng.range(5, 7.5)),
                rng.chance(0.5) ? rust : metal);
              box.position.set(rng.range(-0.6, 0.6), 1.1 + i * 2.25, rng.range(-0.8, 0.8));
              box.rotation.y = rng.range(-0.25, 0.25);
              stack.add(box);
            }
            put(stack, s, side * (hw + rng.range(3.5, 9)), 0, rng.range(0, 1.2));
            if (rng.chance(0.35)) {
              const crane = new THREE.Group();
              const mast = new THREE.Mesh(new THREE.BoxGeometry(0.5, 16, 0.5), metal);
              mast.position.y = 8; crane.add(mast);
              const arm = new THREE.Mesh(new THREE.BoxGeometry(14, 0.45, 0.45), metal);
              arm.position.set(4, 15.6, 0); crane.add(arm);
              const hook = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.2, 0.2), metal);
              hook.position.set(9.5, 13.8, 0); crane.add(hook);
              put(crane, s + 8, -side * (hw + rng.range(9, 15)), 0, rng.range(0, 3));
            }
          }
          break;
        }
        case 'MUDPIT MIRE': {
          // drowned dead trees clawing out of the bog
          for (let s = s0 + 12; s < s1; s += rng.range(16, 30)) {
            const hw = this.halfWidth(s);
            const side = rng.sign();
            const t = new THREE.Group();
            const trunk = new THREE.Mesh(
              new THREE.CylinderGeometry(0.16, 0.42, rng.range(5, 10), 5), deadWood);
            trunk.position.y = 3.4; t.add(trunk);
            for (let b = 0; b < 3; b++) {
              const br = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.14, rng.range(1.6, 3), 4), deadWood);
              br.position.set(0, 3.6 + b * 1.5, 0);
              br.rotation.z = rng.range(-1.1, 1.1);
              br.rotation.y = rng.range(0, 3);
              t.add(br);
            }
            t.rotation.z = rng.range(-0.22, 0.22);
            put(t, s, side * (hw + rng.range(1.6, 12)), 0, rng.range(0, 3));
          }
          break;
        }
        case 'FINISH FURY': {
          // grandstand bleachers packed either side
          for (let s = s0 + 30; s < s1 - 40; s += rng.range(60, 90)) {
            const hw = this.halfWidth(s);
            for (let side = -1; side <= 1; side += 2) {
              const stand = new THREE.Group();
              for (let row = 0; row < 5; row++) {
                const step = new THREE.Mesh(
                  new THREE.BoxGeometry(1.5, 0.55, 24),
                  WORLD_MAT.paint(row % 2 ? 0x37414d : 0x2b333d));
                step.position.set(row * 1.5, 0.3 + row * 0.85, 0);
                stand.add(step);
              }
              const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 24), metal);
              rail.position.set(-0.9, 1.0, 0);
              stand.add(rail);
              put(stand, s, side * (hw + 3.4), 0, side > 0 ? 0 : Math.PI);
            }
          }
          break;
        }
        case 'START GATE': {
          // ---- THE SUMMIT. A pair of snow-capped crags flanking the
          // drop-in, close enough to read as "you are at the very top".
          for (let side = -1; side <= 1; side += 2) {
            const s = s0 + 26;
            const hw = this.halfWidth(s);
            const crag = new THREE.Mesh(rockPool[rng.int(0, 3)], stone);
            crag.scale.set(rng.range(9, 14), rng.range(26, 40), rng.range(9, 14));
            put(crag, s, side * (hw + rng.range(16, 26)), -6, rng.range(0, 3));
            // snow cap: a paler peak sitting on the crag
            const cap = new THREE.Mesh(
              rockPool[rng.int(0, 3)],
              WORLD_MAT.rock(0xe6eef6));
            cap.scale.set(rng.range(5, 7.5), rng.range(6, 10), rng.range(5, 7.5));
            put(cap, s, side * (hw + rng.range(16, 26)), 22, rng.range(0, 3));
          }
          // starter's tower over the drop-in
          const tower = new THREE.Group();
          for (let i = 0; i < 4; i++) {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.28, 7, 0.28), metal);
            leg.position.set((i % 2 ? 1 : -1) * 1.4, 3.5, (i < 2 ? 1 : -1) * 1.4);
            tower.add(leg);
          }
          const booth = new THREE.Mesh(new THREE.BoxGeometry(4, 2.6, 4),
            WORLD_MAT.paint(0x1f2630));
          booth.position.y = 8.2; tower.add(booth);
          const roof2 = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.3, 4.8), rust);
          roof2.position.y = 9.6; tower.add(roof2);
          put(tower, s0 + 42, this.halfWidth(s0 + 42) + 6.5);
          break;
        }
      }
    }
    this.group.add(grp);
  }

  /**
   * Hand-placed landmarks from TrackDefinition. These are the memorable
   * silhouettes players navigate by — giant trees, basalt walls, iron jaws.
   * Zone setpieces handle density; landmarks are the showpieces.
   */
  private buildLandmarks() {
    if (!this.landmarks.length) return;
    const rng = new RNG(this.mountainId.length * 911 + 42);
    const grp = new THREE.Group();
    const wood = WORLD_MAT.wood(0x6b4a2c);
    const darkWood = WORLD_MAT.wood(0x4a3320);
    const stone = WORLD_MAT.rock(0x8a7d6d);
    const darkStone = WORLD_MAT.rock(0x4a4240);
    const basalt = WORLD_MAT.rock(0x3a322e);
    const lava = WORLD_MAT.paint(0xc04018);
    const metal = WORLD_MAT.metal(0x59606b);
    const rust = WORLD_MAT.paint(0x8a4b2a);
    const rockPool = [rockGeo(3), rockGeo(17), rockGeo(41), rockGeo(63)];

    const put = (mesh: THREE.Object3D, s: number, x: number, lift = 0, yaw = 0) => {
      const h = this.heightAt(s, x) + lift;
      this.worldPos(s, x, h, _p);
      this.frameAt(s, _fwd2, _right2, _up2);
      mesh.position.copy(_p);
      mesh.quaternion.setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(_right2, _up2, _fwd2));
      mesh.rotateY(yaw);
      grp.add(mesh);
      return mesh;
    };

    for (const lm of this.landmarks) {
      const s = lm.at * this.length;
      const hw = this.halfWidth(s);
      const side = lm.side ?? (rng.chance(0.5) ? -1 : 1);
      const sc = lm.scale ?? 1;

      switch (lm.kind) {
        case 'summit_crags': {
          for (let k = -1; k <= 1; k += 2) {
            const crag = new THREE.Mesh(rockPool[rng.int(0, 3)], stone);
            crag.scale.set(12 * sc, 34 * sc, 12 * sc);
            put(crag, s, k * (hw + 20), -4, rng.range(0, 3));
            const cap = new THREE.Mesh(rockPool[rng.int(0, 3)], WORLD_MAT.rock(0xe6eef6));
            cap.scale.set(6 * sc, 8 * sc, 6 * sc);
            put(cap, s, k * (hw + 20), 22 * sc, rng.range(0, 3));
          }
          break;
        }
        case 'start_tower': {
          const tower = new THREE.Group();
          for (let i = 0; i < 4; i++) {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.28, 7, 0.28), metal);
            leg.position.set((i % 2 ? 1 : -1) * 1.4, 3.5, (i < 2 ? 1 : -1) * 1.4);
            tower.add(leg);
          }
          const booth = new THREE.Mesh(new THREE.BoxGeometry(4, 2.6, 4), WORLD_MAT.paint(0x1f2630));
          booth.position.y = 8.2; tower.add(booth);
          const roof = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.3, 4.8), rust);
          roof.position.y = 9.6; tower.add(roof);
          put(tower, s, side * (hw + 6.5));
          break;
        }
        case 'fallen_giant': {
          const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.7 * sc, 0.95 * sc, hw * 3.2, 8), wood);
          trunk.rotation.z = Math.PI / 2;
          put(trunk, s, 0, 7.2 * sc, rng.range(-0.2, 0.2));
          const stump = new THREE.Mesh(
            new THREE.CylinderGeometry(1.0 * sc, 1.3 * sc, 2.8 * sc, 8), darkWood);
          put(stump, s + 4, -(hw + 4), 1.4 * sc);
          break;
        }
        case 'shale_formation': {
          for (let k = 0; k < 5; k++) {
            const slab = new THREE.Mesh(rockPool[k % 4], stone);
            slab.scale.set(
              (3 + k * 0.8) * sc, (8 + k * 3) * sc, (2 + k * 0.5) * sc);
            put(slab, s + k * 4, side * (hw + 5 + k), -1, k * 0.35);
          }
          break;
        }
        case 'timber_bridge':
          // visual only — rails/deck come from buildBridges when zone.rails
          break;
        case 'cliff_jump': {
          for (let k = 0; k < 6; k++) {
            for (const sd of [-1, 1] as const) {
              const wall = new THREE.Mesh(
                new THREE.BoxGeometry(0.5, 2.0 + k * 0.5, 3.0), wood);
              put(wall, s + k * 3.2, sd * (hw + 0.9), (2.0 + k * 0.5) * 0.5);
            }
          }
          break;
        }
        case 'volcano_rim': {
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * TAU;
            const r = hw + 18;
            const cone = new THREE.Mesh(
              new THREE.ConeGeometry(4 * sc, 10 * sc, 6), basalt);
            put(cone, s + Math.cos(a) * 6, Math.sin(a) * r, 0, a);
          }
          break;
        }
        case 'basalt_wall': {
          for (let k = 0; k < 7; k++) {
            const col = new THREE.Mesh(
              new THREE.CylinderGeometry(1.4 * sc, 1.6 * sc, (12 + k % 3 * 4) * sc, 6),
              basalt);
            put(col, s + k * 3.5, side * (hw + 3.5), 0, rng.range(0, 0.4));
          }
          break;
        }
        case 'ash_chute': {
          for (let k = 0; k < 4; k++) {
            const pile = new THREE.Mesh(
              new THREE.ConeGeometry(5 * sc, 3 * sc, 7), darkStone);
            put(pile, s + k * 8, side * (hw + 6 + k), -0.5, rng.range(0, 2));
          }
          break;
        }
        case 'lava_fissure': {
          for (let k = 0; k < 5; k++) {
            const crack = new THREE.Mesh(
              new THREE.BoxGeometry(0.8, 0.15, 6), lava);
            put(crack, s + k * 5, side * (hw + 2 + k * 0.5), 0.05, rng.range(-0.3, 0.3));
            const glow = new THREE.Mesh(
              new THREE.BoxGeometry(1.6, 0.08, 7),
              new THREE.MeshBasicMaterial({
                color: 0xff6020, transparent: true, opacity: 0.55, depthWrite: false,
              }));
            put(glow, s + k * 5, side * (hw + 2 + k * 0.5), 0.12);
          }
          break;
        }
        case 'ancient_tree': {
          const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(1.4 * sc, 2.2 * sc, 18 * sc, 8), darkWood);
          put(trunk, s, side * (hw + 8), 0);
          for (let b = 0; b < 5; b++) {
            const br = new THREE.Mesh(
              new THREE.CylinderGeometry(0.25, 0.45, 8 * sc, 5), wood);
            br.rotation.z = 0.9;
            put(br, s, side * (hw + 8), 8 + b * 1.5, b * 1.1);
          }
          break;
        }
        case 'root_tunnel': {
          for (let k = 0; k < 4; k++) {
            const root = new THREE.Mesh(
              new THREE.CylinderGeometry(0.35, 0.5, hw * 2.4, 6), darkWood);
            root.rotation.z = Math.PI / 2;
            put(root, s + k * 6, 0, 4.5 + (k % 2) * 1.2, rng.range(-0.15, 0.15));
          }
          break;
        }
        case 'mist_ravine': {
          // soft planes for mist volume — lightweight atmosphere cue
          for (let k = 0; k < 3; k++) {
            const mist = new THREE.Mesh(
              new THREE.PlaneGeometry(28, 10),
              new THREE.MeshBasicMaterial({
                color: 0xc0d0c8, transparent: true, opacity: 0.22,
                depthWrite: false, side: THREE.DoubleSide,
              }));
            put(mist, s + k * 10, side * (hw + 12), 2 + k, rng.range(0, 1));
          }
          break;
        }
        case 'iron_jaw': {
          // two massive opposing rock jaws framing the trail
          for (const sd of [-1, 1] as const) {
            const jaw = new THREE.Mesh(rockPool[rng.int(0, 3)], darkStone);
            jaw.scale.set(10 * sc, 28 * sc, 14 * sc);
            put(jaw, s, sd * (hw + 8), -2, sd > 0 ? 0.4 : -0.4);
            // "teeth" spikes
            for (let t = 0; t < 4; t++) {
              const tooth = new THREE.Mesh(
                new THREE.ConeGeometry(1.2 * sc, 5 * sc, 5), stone);
              put(tooth, s + t * 3 - 4.5, sd * (hw + 5), 8 * sc, 0);
            }
          }
          break;
        }
        case 'suspension_bridge': {
          for (const sd of [-1, 1] as const) {
            const tower = new THREE.Mesh(new THREE.BoxGeometry(1.2, 14, 1.2), metal);
            put(tower, s, sd * (hw + 1.5), 0);
          }
          const cable = new THREE.Mesh(
            new THREE.BoxGeometry(hw * 2 + 3, 0.12, 0.12), metal);
          put(cable, s, 0, 12);
          break;
        }
        case 'cliff_gate': {
          for (const sd of [-1, 1] as const) {
            const pillar = new THREE.Mesh(rockPool[0], stone);
            pillar.scale.set(5 * sc, 22 * sc, 5 * sc);
            put(pillar, s, sd * (hw + 3), -1);
          }
          break;
        }
        case 'wind_gap': {
          for (const sd of [-1, 1] as const) {
            const wall = new THREE.Mesh(rockPool[2], stone);
            wall.scale.set(6 * sc, 18 * sc, 20 * sc);
            put(wall, s, sd * (hw + 10), -3, 0);
          }
          break;
        }
        case 'spine_ridge': {
          for (let k = 0; k < 6; k++) {
            const spine = new THREE.Mesh(rockPool[k % 4], stone);
            spine.scale.set(4 * sc, (6 + k) * sc, 8 * sc);
            put(spine, s + k * 7, 0, -1, k * 0.1);
          }
          break;
        }
        case 'sunset_overlook': {
          const platform = new THREE.Mesh(
            new THREE.BoxGeometry(hw * 1.4, 0.4, 8), stone);
          put(platform, s, side * (hw + 4), 0.2);
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.2, 8), wood);
          put(rail, s, side * (hw + 4 + hw * 0.5), 0.8);
          break;
        }
        case 'final_spine': {
          for (let k = 0; k < 5; k++) {
            const slab = new THREE.Mesh(rockPool[k % 4], stone);
            slab.scale.set(8 * sc, (14 + k * 2) * sc, 5 * sc);
            put(slab, s + k * 5, side * (hw + 6), -2, 0.2);
          }
          break;
        }
        case 'grandstand': {
          for (const sd of [-1, 1] as const) {
            const stand = new THREE.Group();
            for (let row = 0; row < 5; row++) {
              const step = new THREE.Mesh(
                new THREE.BoxGeometry(1.5, 0.55, 20),
                WORLD_MAT.paint(row % 2 ? 0x37414d : 0x2b333d));
              step.position.set(row * 1.5, 0.3 + row * 0.85, 0);
              stand.add(step);
            }
            put(stand, s, sd * (hw + 3.4), 0, sd > 0 ? 0 : Math.PI);
          }
          break;
        }
        case 'finish_plaza': {
          const archL = new THREE.Mesh(new THREE.BoxGeometry(1, 10, 1), metal);
          const archR = new THREE.Mesh(new THREE.BoxGeometry(1, 10, 1), metal);
          put(archL, s, -(hw + 2), 0);
          put(archR, s, hw + 2, 0);
          const beam = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 4, 0.6, 0.6), rust);
          put(beam, s, 0, 9.5);
          break;
        }
      }
    }
    this.group.add(grp);
  }

  /**
   * Timber bridge decks: rails you can see from a distance, plus trestles
   * falling away underneath so the drop reads as real height rather than
   * a texture change.
   */
  private buildBridges() {
    const wood = WORLD_MAT.wood(0x6b4a2c);
    const dark = WORLD_MAT.wood(0x453020);
    const grp = new THREE.Group();
    for (const Z of this.zones) {
      if (!Z.rails) continue;
      const s0 = Z.t0 * this.length, s1 = Z.t1 * this.length;

      for (let s = s0; s < s1; s += 2.6) {
        const hw = this.halfWidth(s);
        const h = this.heightAt(s, 0);
        this.frameAt(s, _fwd2, _right2, _up2);
        for (let side = -1; side <= 1; side += 2) {
          const x = side * (hw + 0.35);
          this.worldPos(s, x, h, _p);
          // rail post
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.05, 0.14), wood);
          post.position.copy(_p).addScaledVector(_up2, 0.5);
          post.quaternion.setFromUnitVectors(_yAxis, _up2);
          grp.add(post);
        }
        // deck plank detail
        const plank = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 0.7, 0.14, 0.5), dark);
        this.worldPos(s, 0, h - 0.09, _p);
        plank.position.copy(_p);
        plank.quaternion.setFromRotationMatrix(
          new THREE.Matrix4().makeBasis(_right2, _up2, _fwd2));
        grp.add(plank);
      }

      // continuous top rail
      for (let side = -1; side <= 1; side += 2) {
        for (let s = s0; s < s1; s += 6) {
          const hw = this.halfWidth(s);
          const h = this.heightAt(s, 0);
          this.frameAt(s, _fwd2, _right2, _up2);
          this.worldPos(s, side * (hw + 0.35), h + 0.95, _p);
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 6.2), wood);
          rail.position.copy(_p);
          rail.quaternion.setFromRotationMatrix(
            new THREE.Matrix4().makeBasis(_right2, _up2, _fwd2));
          grp.add(rail);
        }
      }

      // trestle legs dropping into the gorge
      for (let s = s0 + 6; s < s1; s += 14) {
        const hw = this.halfWidth(s);
        const h = this.heightAt(s, 0);
        this.frameAt(s, _fwd2, _right2, _up2);
        for (let side = -1; side <= 1; side += 2) {
          this.worldPos(s, side * hw * 0.8, h - 5, _p);
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 11, 5), dark);
          leg.position.copy(_p);
          leg.quaternion.setFromUnitVectors(_yAxis, _up2);
          leg.rotateZ(side * 0.13);
          grp.add(leg);
        }
        const cross = new THREE.Mesh(new THREE.BoxGeometry(hw * 1.7, 0.16, 0.16), dark);
        this.worldPos(s, 0, h - 3.2, _p);
        cross.position.copy(_p);
        cross.quaternion.setFromRotationMatrix(
          new THREE.Matrix4().makeBasis(_right2, _up2, _fwd2));
        grp.add(cross);
      }
    }
    this.group.add(grp);
  }

  /**
   * Water features. Waterfalls are placed on cliff sections where the ground
   * genuinely falls away, and rivers run through the wet zones — both act as
   * landmarks you can navigate by, and both sell the scale of the drop.
   */
  private buildWater() {
    const rng = new RNG(3141);
    const grp = new THREE.Group();
    const fallTex = makeRippleTexture();
    fallTex.repeat.set(1, 6);
    this.waterMaps.push(fallTex);
    const mFall = new THREE.MeshBasicMaterial({
      color: 0xd0eaf6, map: fallTex, transparent: true, opacity: 0.72,
      side: THREE.DoubleSide, depthWrite: false, fog: true,
    });
    const mFoam = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.55,
      depthWrite: false, fog: true,
    });
    // denser base foam so the plunge pool reads against rock/dirt
    const mFoamPool = new THREE.MeshBasicMaterial({
      color: 0xeef8fc, transparent: true, opacity: 0.62,
      depthWrite: false, fog: true, side: THREE.DoubleSide,
    });
    // Rivers get a scrolling ripple texture rather than a flat colour, so
    // the surface reads as moving water without any per-frame geometry work.
    const rippleTex = makeRippleTexture();
    rippleTex.repeat.set(3, 26);
    const mRiver = new THREE.MeshBasicMaterial({
      color: 0x5eb0c4, map: rippleTex, transparent: true, opacity: 0.90,
      depthWrite: false, fog: true,
    });
    this.waterMaps.push(rippleTex);

    for (const Z of this.zones) {
      const s0 = Z.t0 * this.length, s1 = Z.t1 * this.length;

      // ---- WATERFALLS on cliff edges
      if (Z.dropDepth && Z.dropSide !== 0) {
        for (let k = 0; k < 2; k++) {
          const s = s0 + (s1 - s0) * (0.3 + k * 0.4) + rng.range(-20, 20);
          const hw = this.halfWidth(s);
          const side = Z.dropSide!;
          const x = side * (hw + rng.range(10, 22));
          const top = this.heightAt(s, x);
          this.worldPos(s, x, top, _p);
          this.frameAt(s, _fwd2, _right2, _up2);
          const basis = new THREE.Matrix4().makeBasis(_right2, _up2, _fwd2);

          const h = rng.range(45, 90);
          const w = rng.range(3, 7);
          const fall = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mFall);
          fall.position.copy(_p).addScaledVector(_up2, -h * 0.5);
          fall.quaternion.setFromRotationMatrix(basis);
          grp.add(fall);
          // second sheet, offset, so it reads as volume not a decal
          const fall2 = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.6, h), mFall);
          fall2.position.copy(_p)
            .addScaledVector(_up2, -h * 0.5).addScaledVector(_fwd2, 1.4);
          fall2.quaternion.setFromRotationMatrix(basis);
          fall2.rotateY(Math.PI / 2);
          grp.add(fall2);
          // mist at the lip
          const mist = new THREE.Mesh(new THREE.PlaneGeometry(w * 2.2, 5), mFoam);
          mist.position.copy(_p).addScaledVector(_up2, -1.5);
          mist.quaternion.setFromRotationMatrix(basis);
          grp.add(mist);
          // foam ring + soft pool at the plunge — static, no per-frame work
          const basePos = _p.clone().addScaledVector(_up2, -h + 0.4)
            .addScaledVector(_fwd2, rng.range(0.5, 2.0));
          const baseQ = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0), _up2,
          );
          const pool = new THREE.Mesh(
            new THREE.CircleGeometry(w * 1.5, 14).rotateX(-Math.PI / 2),
            mFoamPool,
          );
          pool.position.copy(basePos);
          pool.quaternion.copy(baseQ);
          grp.add(pool);
          const foamRing = new THREE.Mesh(
            new THREE.RingGeometry(w * 0.85, w * 2.1, 18).rotateX(-Math.PI / 2),
            mFoam,
          );
          foamRing.position.copy(basePos).addScaledVector(_up2, 0.06);
          foamRing.quaternion.copy(baseQ);
          grp.add(foamRing);
        }
      }

      // ---- RIVERS through the wet zones
      if (Z.surface === 'mud') {
        for (let side = -1; side <= 1; side += 2) {
          if (rng.chance(0.4)) continue;
          const pts: number[] = [];
          const idx: number[] = [];
          let v = 0;
          const off = rng.range(14, 30);
          for (let s = s0; s < s1; s += 8) {
            const hw = this.halfWidth(s);
            const wob = fbm2(s * 0.01, side * 3, 2) * 6;
            const cx = side * (hw + off + wob);
            const wdt = 2.4 + fbm2(s * 0.02, 9, 2) * 1.2;
            const hL = this.heightAt(s, cx - wdt) - 0.5;
            const hR = this.heightAt(s, cx + wdt) - 0.5;
            const lo = Math.min(hL, hR) + 0.25;
            const a = this.worldPos(s, cx - wdt, lo, new THREE.Vector3());
            const b = this.worldPos(s, cx + wdt, lo, new THREE.Vector3());
            pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
            if (v > 0) {
              const p0 = v - 2, p1 = v - 1, p2 = v, p3 = v + 1;
              idx.push(p0, p2, p1, p1, p2, p3);
            }
            v += 2;
          }
          if (v < 4) continue;
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
          g.setIndex(idx);
          g.computeVertexNormals();
          const river = new THREE.Mesh(g, mRiver);
          river.matrixAutoUpdate = false;
          grp.add(river);
        }
      }
    }
    this.group.add(grp);
  }

  /** Arrow boards at each shortcut mouth so the line can be read at speed. */
  private buildShortcutSigns() {
    const signTex = (() => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 128;
      const g = c.getContext('2d')!;
      g.fillStyle = '#12130f'; g.fillRect(0, 0, 256, 128);
      g.fillStyle = '#c0f000';
      g.beginPath();
      g.moveTo(40, 64); g.lineTo(120, 20); g.lineTo(120, 46);
      g.lineTo(216, 46); g.lineTo(216, 82); g.lineTo(120, 82);
      g.lineTo(120, 108); g.closePath(); g.fill();
      g.strokeStyle = '#c0f000'; g.lineWidth = 7; g.strokeRect(4, 4, 248, 120);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    const postMat = WORLD_MAT.metal(0x3a3a42);
    const grp = new THREE.Group();
    for (const sc of this.shortcuts) {
      const s = sc.s0 - 12;
      const hw = this.halfWidth(s);
      const x = sc.side * (hw + 2.0);
      const h = this.heightAt(s, x);
      this.worldPos(s, x, h, _p);
      this.frameAt(s, _fwd2, _right2, _up2);

      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.3, 5), postMat);
      post.position.copy(_p).addScaledVector(_up2, 1.15);
      post.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _up2);
      grp.add(post);

      const board = new THREE.Mesh(
        new THREE.PlaneGeometry(1.7, 0.85),
        new THREE.MeshStandardMaterial({
          map: signTex, side: THREE.DoubleSide, roughness: 0.7, metalness: 0.05,
        }));
      board.position.copy(_p).addScaledVector(_up2, 2.3);
      // face back up the hill, arrow pointing off-piste
      board.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
        _right2.clone().multiplyScalar(-sc.side), _up2, _fwd2.clone().multiplyScalar(-sc.side)));
      grp.add(board);
    }
    this.group.add(grp);
  }

  private buildStartFinish() {
    const mkArch = (s: number, label: string, bg: string, fg: string) => {
      const grp = new THREE.Group();
      const hw = this.halfWidth(s);
      const up = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3();
      this.frameAt(s, fwd, right, up);
      const postMat = WORLD_MAT.metal(0x22222a);
      for (let side = -1; side <= 1; side += 2) {
        const x = side * (hw + 2.2);
        const p = this.worldPos(s, x, this.heightAt(s, x), new THREE.Vector3());
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 8.2, 8), postMat);
        pole.position.copy(p).addScaledVector(up, 4.1);
        pole.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
        grp.add(pole);
      }
      const cx = this.worldPos(s, 0, this.heightAt(s, 0), new THREE.Vector3());
      const basis = new THREE.Matrix4().makeBasis(right.clone().negate(), up, fwd.clone().negate());
      const tex = makeBannerTexture(label, bg, fg);
      const banner = new THREE.Mesh(new THREE.PlaneGeometry((hw + 2.2) * 2, 2.8),
        new THREE.MeshStandardMaterial({
          map: tex, side: THREE.DoubleSide, roughness: 0.88, metalness: 0.0,
        }));
      banner.position.copy(cx).addScaledVector(up, 7.0);
      banner.quaternion.setFromRotationMatrix(basis);
      grp.add(banner);
      // chequered ground line
      const line = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, 1.8),
        new THREE.MeshBasicMaterial({ map: makeCheckerTexture(), transparent: true, opacity: 0.92 }));
      const lp = this.worldPos(s, 0, this.heightAt(s, 0) + 0.07, new THREE.Vector3());
      line.position.copy(lp);
      line.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, fwd));
      line.rotateX(-Math.PI / 2);
      grp.add(line);
      this.group.add(grp);
    };
    mkArch(14, 'START', '#101014', '#ffd400');
    mkArch(this.length - 26, 'FINISH', '#ffd400', '#101014');
  }
}

/**
 * Scenery draw-reach multiplier by theme and length.
 * Forest packs more instances per metre; long courses already stream by s,
 * but still need tighter reach so repack stays cheap.
 */
function themeLodMultiplier(theme: TrackTheme, length: number): number {
  let m = 1;
  switch (theme) {
    case 'forest': m = 0.78; break;     // Thornwood: dense canopy
    case 'volcanic': m = 0.92; break;   // fewer trees, keep rocks
    case 'limestone': m = 0.85; break;  // Ironjaw 6.2 km
    case 'sunset': m = 0.90; break;
    case 'canyon': m = 0.95; break;
    default: m = 1.0; break;            // alpine open vistas
  }
  // endurance courses pay a small extra tax past 5 km
  if (length > 5000) m *= 0.90;
  else if (length > 4000) m *= 0.95;
  return m;
}
