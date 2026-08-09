// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: procedural downhill course
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { RNG, clamp, clamp01, fbm1, fbm2, lerp, smoothstep, TAU } from './core';
import {
  makeDirtTexture, makeTapeTexture, makeBannerTexture, makeCheckerTexture,
} from './fx';
import {
  pineFoliageGeo, pineTrunkGeo, broadleafGeo, rockGeo, bushGeo,
  spectatorParts, SPECTATOR_COLORS, baleGeo, coneGeo, logGeo, barrelGeo, postGeo,
} from './models';

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
}

export const ZONES: Zone[] = [
  { name: 'START GATE', sub: 'DROP IN', t0: 0.000, t1: 0.055, dirt: 0x9a7550, verge: 0x6f9440, far: 0x5c7a38, width: 19, rough: 0.35, steep: -0.02, surface: 'dirt', treeDensity: 0.20, treeType: 'pine', rockDensity: 0.10, crowd: 2.6, fog: 0.9, features: ['roller', 'berm'], props: ['cone', 'bale'] },
  { name: 'PINE PLUNGE', sub: 'ROOTS & RUTS', t0: 0.055, t1: 0.195, dirt: 0x6d5236, verge: 0x39662c, far: 0x27461f, width: 13.5, rough: 1.25, steep: 0.055, surface: 'dirt', treeDensity: 1.00, treeType: 'pine', rockDensity: 0.55, crowd: 0.55, fog: 1.25, features: ['whoops', 'roller', 'berm', 'kicker'], props: ['log', 'rock'] },
  { name: 'KICKER RIDGE', sub: 'SEND IT', t0: 0.195, t1: 0.335, dirt: 0xa8814f, verge: 0x7d9440, far: 0x6a7f38, width: 17, rough: 0.55, steep: 0.01, surface: 'dirt', treeDensity: 0.22, treeType: 'mixed', rockDensity: 0.30, crowd: 1.5, fog: 0.75, features: ['table', 'kicker', 'double', 'berm'], props: ['cone', 'bale', 'barrel'] },
  { name: 'HAYSTACK HOLLOW', sub: 'FARM CHAOS', t0: 0.335, t1: 0.470, dirt: 0x9d7c4d, verge: 0x93b04c, far: 0x7c9640, width: 14.5, rough: 0.7, steep: -0.015, surface: 'grass', treeDensity: 0.30, treeType: 'broad', rockDensity: 0.12, crowd: 2.2, fog: 0.8, features: ['roller', 'berm', 'kicker', 'chicane'], props: ['bale', 'bale', 'cone', 'barrel'] },
  { name: 'CANYON CUT', sub: 'NO BRAKES', t0: 0.470, t1: 0.605, dirt: 0xb2653c, verge: 0x8d5636, far: 0x6f432b, width: 11.5, rough: 1.35, steep: 0.065, surface: 'rock', treeDensity: 0.08, treeType: 'none', rockDensity: 1.30, crowd: 0.5, fog: 1.0, features: ['whoops', 'kicker', 'roller', 'berm'], props: ['rock', 'rock', 'barrel'] },
  { name: 'THE BONKYARD', sub: 'BIG AIR', t0: 0.605, t1: 0.740, dirt: 0x7d746a, verge: 0x616356, far: 0x4c4d44, width: 16.5, rough: 0.8, steep: 0.02, surface: 'gravel', treeDensity: 0.10, treeType: 'none', rockDensity: 0.35, crowd: 1.8, fog: 0.85, features: ['gap', 'table', 'kicker', 'double'], props: ['barrel', 'cone', 'bale'] },
  { name: 'MUDPIT MIRE', sub: 'SLIP CITY', t0: 0.740, t1: 0.860, dirt: 0x4e4132, verge: 0x4a5b33, far: 0x39471f, width: 13, rough: 1.1, steep: -0.045, surface: 'mud', treeDensity: 0.75, treeType: 'broad', rockDensity: 0.25, crowd: 0.9, fog: 1.35, features: ['whoops', 'roller', 'berm'], props: ['log', 'bale', 'rock'] },
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
  type: 'bale' | 'cone' | 'barrel' | 'log' | 'rock' | 'puddle';
  mass: number;
  hit: number;              // 0 = intact
  vx: number; vy: number; vs: number; spin: number;
  ox: number; oy: number; os: number; rot: number;
  idx: number;
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

  group = new THREE.Group();
  private specMeshes: THREE.InstancedMesh[] = [];
  private propMeshes: Record<string, THREE.InstancedMesh> = {};
  private specWindow = { a: 0, b: 0 };
  rng = new RNG(20260114);

  constructor(seed = 20260114) {
    this.rng = new RNG(seed);
    this.length = TRACK_LENGTH;
    this.count = Math.floor(TRACK_LENGTH / STEP) + 2;
    this.buildNodes();
    this.buildFeatures();
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
    let x = 0, y = 980, z = 0;

    for (let i = 0; i < n; i++) {
      const s = i * STEP;
      const t = s / TRACK_LENGTH;
      const zi = this.zoneIndexAt(t);
      const Z = ZONES[zi];
      this.zoneIdx[i] = zi;

      // --- curvature: layered sweepers + tighter corners, calmed at the start
      const warm = smoothstep(clamp01(s / 260));
      let c = 0.0062 * fbm1(s * 0.00155 + 11.3, 2)
        + 0.0055 * fbm1(s * 0.0049 + 71.9, 2)
        + 0.0030 * fbm1(s * 0.0125 + 5.5, 1);
      // tighten inside the twisty zones
      if (zi === 1 || zi === 4 || zi === 6) c *= 1.35;
      if (zi === 0 || zi === 7) c *= 0.5;
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
    for (let i = 0; i < ZONES.length; i++) if (t >= ZONES[i].t0 && t < ZONES[i].t1) return i;
    return ZONES.length - 1;
  }
  zoneAt(s: number): Zone { return ZONES[this.zoneIndexAt(s / TRACK_LENGTH)]; }

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
    while (s < TRACK_LENGTH - 140) {
      const Z = this.zoneAt(s);
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
    this.addFeature({ kind: 'table', s0: TRACK_LENGTH * 0.245, len: 54, h: 4.1, depth: 0, x0: -999, x1: 999, n: 0 });
    this.addFeature({ kind: 'gap', s0: TRACK_LENGTH * 0.665, len: 72, h: 4.6, depth: 6.0, x0: -999, x1: 999, n: 0 });
    this.addFeature({ kind: 'kicker', s0: TRACK_LENGTH * 0.935, len: 18, h: 3.4, depth: 0, x0: -999, x1: 999, n: 0 });

    for (let g = 320; g < TRACK_LENGTH - 200; g += 520) this.gantries.push({ s: g });
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
    const Z = ZONES[zi];
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
      const slope = x < 0 ? this.slopeLAt(s) : this.slopeRAt(s);
      h += slope * 18 * Math.log(1 + t / 18);
      h += fbm2(s * 0.05, x * 0.05, 3) * Math.min(4.0, t * 0.42);
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
    while (s < TRACK_LENGTH - 90) {
      const Z = this.zoneAt(s);
      const hw = this.halfWidth(s);
      const type = rng.pick(Z.props) as Obstacle['type'];
      // avoid landing zones of big features
      let blocked = false;
      const bl = this.buckets[Math.floor(s / this.bucketSize)];
      if (bl) for (const f of bl) if (f.kind === 'gap' || f.kind === 'table' || f.kind === 'double') blocked = true;
      if (!blocked) {
        const cluster = type === 'cone' ? rng.int(2, 5) : type === 'bale' ? rng.int(1, 3) : 1;
        for (let k = 0; k < cluster; k++) {
          const x = rng.range(-hw * 0.85, hw * 0.85);
          const r = type === 'log' ? 2.2 : type === 'rock' ? rng.range(0.7, 1.3) : type === 'barrel' ? 0.55 : type === 'bale' ? 0.85 : 0.36;
          const mass = type === 'rock' ? 999 : type === 'log' ? 999 : type === 'barrel' ? 1.6 : type === 'bale' ? 2.4 : 0.5;
          this.obstacles.push({
            s: s + k * rng.range(2.5, 6), x, r, type, mass, hit: 0,
            vx: 0, vy: 0, vs: 0, spin: 0, ox: 0, oy: 0, os: 0, rot: rng.range(0, TAU), idx: 0,
          });
        }
      }
      s += rng.range(26, 62);
    }
    this.obstacles.sort((a, b) => a.s - b.s);
    this.obstacles.forEach((o, i) => (o.idx = i));
  }

  private placeSpectators() {
    const rng = this.rng;
    let s = 20;
    while (s < TRACK_LENGTH - 10) {
      const Z = this.zoneAt(s);
      const hw = this.halfWidth(s);
      const density = Z.crowd;
      const gap = lerp(12, 2.7, clamp01(density / 3));
      const rows = density > 1.6 ? 3 : density > 0.8 ? 2 : 1;
      for (let side = -1; side <= 1; side += 2) {
        if (density < 0.7 && rng.chance(0.45)) continue;
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
    this.buildScenery();
    this.buildPropMeshes();
    this.buildSpectatorMeshes();
    this.buildZoneSetPieces();
    this.buildStartFinish();
    return this.group;
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
    const tex = makeDirtTexture();
    tex.repeat.set(1, 1);
    const material = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true });
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
        const Z = ZONES[this.zoneIdx[i]];
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
          // tonal variation
          const n = fbm2(s * 0.035, x * 0.06, 3) * 0.5 + fbm2(s * 0.006, x * 0.012, 2) * 0.5;
          const shade = 1 + n * 0.22;
          // packed racing line (darker, polished)
          const line = Math.exp(-Math.pow((ax) / (hw * 0.62), 2)) * (1 - edge);
          const lineShade = 1 - line * 0.14;
          // bright dust on the very lip
          const lip = Math.exp(-Math.pow((ax - hw) / 1.3, 2)) * 0.18;
          cTmp.multiplyScalar(shade * lineShade + lip);
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
      this.group.add(mesh);
      rngc.next();
    }
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
        const lo = this.worldPos(s, x, base + 0.62 + sag, new THREE.Vector3());
        const hi = this.worldPos(s, x, base + 1.02 + sag, new THREE.Vector3());
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
    const postCount = Math.floor(TRACK_LENGTH / 7) * 2;
    const posts = new THREE.InstancedMesh(postGeo(), new THREE.MeshLambertMaterial({ color: 0xdedede }), postCount);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
    const up = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3();
    let n = 0;
    for (let s = 0; s < TRACK_LENGTH && n < postCount; s += 7) {
      for (let side = -1; side <= 1; side += 2) {
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
    const postMat = new THREE.MeshLambertMaterial({ color: 0x3a3a42 });
    const up = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3();
    this.gantries.forEach((g, gi) => {
      const s = g.s;
      const hw = this.halfWidth(s);
      const grp = new THREE.Group();
      const br = brands[gi % brands.length];
      const tex = makeBannerTexture(br[0], br[1], br[2]);
      const bannerMat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
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

  private buildScenery() {
    const rng = new RNG(5150);
    const up = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3();
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    const qTilt = new THREE.Quaternion();
    const MAX = 4200;

    const pineTrunk = new THREE.InstancedMesh(pineTrunkGeo(), new THREE.MeshLambertMaterial({ color: 0x5a4028 }), MAX);
    const pineTop = new THREE.InstancedMesh(pineFoliageGeo(), new THREE.MeshLambertMaterial({ vertexColors: false, color: 0xffffff }), MAX);
    pineTop.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    const broad = new THREE.InstancedMesh(broadleafGeo(), new THREE.MeshLambertMaterial({ color: 0xffffff }), 1400);
    broad.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(1400 * 3), 3);
    const broadTrunk = new THREE.InstancedMesh(pineTrunkGeo(), new THREE.MeshLambertMaterial({ color: 0x6b4a2c }), 1400);
    const rocks = new THREE.InstancedMesh(rockGeo(11), new THREE.MeshLambertMaterial({ color: 0xffffff }), 2600);
    rocks.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(2600 * 3), 3);
    const bushes = new THREE.InstancedMesh(bushGeo(), new THREE.MeshLambertMaterial({ color: 0xffffff }), 2200);
    bushes.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(2200 * 3), 3);

    let nPine = 0, nBroad = 0, nRock = 0, nBush = 0;
    const col = new THREE.Color();

    for (let s = 4; s < TRACK_LENGTH; s += 3.2) {
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
        if (roll < Z.treeDensity * 0.34 * (0.4 + near * 0.9) && Z.treeType !== 'none') {
          const isPine = Z.treeType === 'pine' || (Z.treeType === 'mixed' && rng.chance(0.55));
          const scale = rng.range(1.5, 3.6) * (isPine ? 1.5 : 1.0);
          if (isPine && nPine < MAX) {
            sc.set(scale * rng.range(0.7, 1.0), scale * rng.range(1.5, 2.6), scale * rng.range(0.7, 1.0));
            m4.compose(p, q, sc); pineTrunk.setMatrixAt(nPine, m4);
            sc.set(scale * rng.range(0.85, 1.25), scale * rng.range(1.4, 2.4), scale * rng.range(0.85, 1.25));
            m4.compose(p, q, sc); pineTop.setMatrixAt(nPine, m4);
            col.setHSL(0.28 + rng.range(-0.035, 0.045), rng.range(0.32, 0.6), rng.range(0.14, 0.28));
            pineTop.instanceColor!.setXYZ(nPine, col.r, col.g, col.b);
            nPine++;
          } else if (!isPine && nBroad < 1400) {
            sc.set(scale * rng.range(0.9, 1.3), scale * rng.range(0.9, 1.4), scale * rng.range(0.9, 1.3));
            m4.compose(p, q, sc); broad.setMatrixAt(nBroad, m4);
            sc.set(scale * 0.55, scale * 1.0, scale * 0.55);
            m4.compose(p, q, sc); broadTrunk.setMatrixAt(nBroad, m4);
            col.setHSL(0.24 + rng.range(-0.05, 0.06), rng.range(0.35, 0.65), rng.range(0.20, 0.36));
            broad.instanceColor!.setXYZ(nBroad, col.r, col.g, col.b);
            nBroad++;
          }
        } else if (roll < Z.treeDensity * 0.34 + Z.rockDensity * 0.22 && nRock < 2600) {
          const scale = rng.range(0.5, 2.6) * (dist > 20 ? 1.7 : 1);
          sc.set(scale * rng.range(0.8, 1.5), scale * rng.range(0.5, 1.1), scale * rng.range(0.8, 1.5));
          m4.compose(p, q, sc); rocks.setMatrixAt(nRock, m4);
          const g0 = rng.range(0.30, 0.55);
          col.setRGB(g0 * 1.05, g0 * 0.98, g0 * 0.9).lerp(new THREE.Color(Z.far), 0.35);
          rocks.instanceColor!.setXYZ(nRock, col.r, col.g, col.b);
          nRock++;
        } else if (rng.chance(0.30) && nBush < 2200) {
          const scale = rng.range(0.5, 1.6);
          sc.set(scale * rng.range(0.9, 1.5), scale * rng.range(0.7, 1.3), scale * rng.range(0.9, 1.5));
          m4.compose(p, q, sc); bushes.setMatrixAt(nBush, m4);
          col.setHex(Z.verge).offsetHSL(rng.range(-0.03, 0.03), rng.range(-0.1, 0.1), rng.range(-0.09, 0.06));
          bushes.instanceColor!.setXYZ(nBush, col.r, col.g, col.b);
          nBush++;
        }
      }
    }
    pineTrunk.count = nPine; pineTop.count = nPine;
    broad.count = nBroad; broadTrunk.count = nBroad;
    rocks.count = nRock; bushes.count = nBush;
    [pineTrunk, pineTop, broad, broadTrunk, rocks, bushes].forEach(m => {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.frustumCulled = false;
      this.group.add(m);
    });
  }

  private buildPropMeshes() {
    const defs: Record<string, { geo: THREE.BufferGeometry; color: number }> = {
      bale: { geo: baleGeo(), color: 0xd8b45c },
      cone: { geo: coneGeo(), color: 0xff5a1f },
      barrel: { geo: barrelGeo(), color: 0x2f7bff },
      log: { geo: logGeo(), color: 0x6b4a2c },
      rock: { geo: rockGeo(31), color: 0x7d766c },
      puddle: { geo: new THREE.CircleGeometry(1.4, 12).rotateX(-Math.PI / 2), color: 0x30404a },
    };
    const counts: Record<string, number> = {};
    this.obstacles.forEach(o => { counts[o.type] = (counts[o.type] || 0) + 1; });
    for (const k of Object.keys(defs)) {
      const c = counts[k] || 0;
      if (c === 0) continue;
      const mesh = new THREE.InstancedMesh(defs[k].geo, new THREE.MeshLambertMaterial({ color: defs[k].color }), c);
      mesh.frustumCulled = false;
      mesh.count = c;
      this.propMeshes[k] = mesh;
      this.group.add(mesh);
    }
    // assign per-type index
    const seen: Record<string, number> = {};
    this.obstacles.forEach(o => { o.idx = seen[o.type] = (seen[o.type] ?? -1) + 1; });
    this.refreshProps();
  }

  refreshProps(sMin = -1e9, sMax = 1e9) {
    const m4 = _m4, q = _q, sc = _sc;
    const up = _up, fwd = _fwd, right = _right, p = _p;
    for (const o of this.obstacles) {
      if (o.s < sMin || o.s > sMax) continue;
      const mesh = this.propMeshes[o.type];
      if (!mesh) continue;
      const s = o.s + o.os, x = o.x + o.ox;
      const h = this.heightAt(s, x) + o.oy;
      this.worldPos(s, x, h, p);
      this.frameAt(s, fwd, right, up);
      q.setFromUnitVectors(_yAxis, up);
      q.multiply(_qb.setFromAxisAngle(_yAxis, o.rot));
      if (o.hit > 0) q.multiply(_qb.setFromAxisAngle(_tumbleAxis, o.hit * o.spin));
      const sz = o.type === 'rock' ? o.r : 1;
      sc.set(sz, sz, sz);
      m4.compose(p, q, sc);
      mesh.setMatrixAt(o.idx, m4);
    }
    for (const k of Object.keys(this.propMeshes)) this.propMeshes[k].instanceMatrix.needsUpdate = true;
  }

  private buildSpectatorMeshes() {
    const { bodyG, headG, legG, armG } = spectatorParts();
    const N = this.spectators.length;
    const mkm = (g: THREE.BufferGeometry, c: number, colored: boolean) => {
      const m = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color: colored ? 0xffffff : c }), N);
      if (colored) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
      m.frustumCulled = false;
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
  updateSpectators(playerS: number, time: number, dt: number) {
    if (!this.specMeshes.length) return;
    const list = this.spectators;
    const lo = playerS - 45, hi = playerS + 230;
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
    const wood = new THREE.MeshLambertMaterial({ color: 0x6b4a2c });
    const darkWood = new THREE.MeshLambertMaterial({ color: 0x4a3320 });
    const metal = new THREE.MeshLambertMaterial({ color: 0x59606b });
    const rust = new THREE.MeshLambertMaterial({ color: 0x8a4b2a });
    const stone = new THREE.MeshLambertMaterial({ color: 0x8a7d6d });
    const hay = new THREE.MeshLambertMaterial({ color: 0xd8b45c });
    const deadWood = new THREE.MeshLambertMaterial({ color: 0x4b4438 });
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

    for (let zi = 0; zi < ZONES.length; zi++) {
      const Z = ZONES[zi];
      const s0 = Z.t0 * TRACK_LENGTH, s1 = Z.t1 * TRACK_LENGTH;

      switch (Z.name) {
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
              new THREE.MeshLambertMaterial({ color: 0x9c3b2e }));
            body.position.y = 2.75; barn.add(body);
            const roof = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 12.2, 3, 1),
              new THREE.MeshLambertMaterial({ color: 0x3a3f45 }));
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
                  new THREE.MeshLambertMaterial({ color: row % 2 ? 0x37414d : 0x2b333d }));
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
          // starter's tower over the drop-in
          const tower = new THREE.Group();
          for (let i = 0; i < 4; i++) {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.28, 7, 0.28), metal);
            leg.position.set((i % 2 ? 1 : -1) * 1.4, 3.5, (i < 2 ? 1 : -1) * 1.4);
            tower.add(leg);
          }
          const booth = new THREE.Mesh(new THREE.BoxGeometry(4, 2.6, 4),
            new THREE.MeshLambertMaterial({ color: 0x1f2630 }));
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

  private buildStartFinish() {
    const mkArch = (s: number, label: string, bg: string, fg: string) => {
      const grp = new THREE.Group();
      const hw = this.halfWidth(s);
      const up = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3();
      this.frameAt(s, fwd, right, up);
      const postMat = new THREE.MeshLambertMaterial({ color: 0x22222a });
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
        new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
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
    mkArch(TRACK_LENGTH - 26, 'FINISH', '#ffd400', '#101014');
  }
}
