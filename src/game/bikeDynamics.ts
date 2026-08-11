// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: full-suspension bike dynamics
//
// Dual-crown fork + Horst-link rear (virtual pivot), pure integrators.
// Geometry constants match models.ts; visuals consume travel ratios only.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { clamp, clamp01 } from './core';
import {
  FORK_AXIS, BB_POS, SHOCK_UPPER, SHOCK_LOWER, SHOCK_BASE_LEN,
  type RiderRig,
} from './models';

/** DH dual-crown fork: 200 mm travel, progressive air spring + damper. */
export interface ForkSpec {
  travel: number;       // m (0.20 = 200 mm)
  springK: number;      // N/m linear term
  airProg: number;      // progressive air-volume hardness near bottom
  compressC: number;    // Ns/m high-speed compression
  reboundC: number;     // Ns/m rebound (higher = slower return)
  topOut: number;       // soft top-out spring
  preload: number;      // static sag force offset (N)
  unsprung: number;     // kg at wheel
}

/** Horst-link rear: axle path via swingarm angle; shock via leverage curve. */
export interface RearSpec {
  travel: number;       // vertical axle travel (m)
  springK: number;
  airProg: number;
  compressC: number;
  reboundC: number;
  topOut: number;
  preload: number;
  /** swingarm angle (rad) at full travel */
  maxAngle: number;
  /** leverage ratio at 0..1 travel (shock force / axle force) */
  leverage0: number;
  leverage1: number;
  unsprung: number;
}

/**
 * Spring rates scaled to VEHICLE_MASS (~86 kg) arcade loads so static sag
 * sits near 20–25% travel. Full-rate DH numbers (14k+) topped out under
 * axleLoads because game force units are lighter than SI bike math.
 */
export const DH_FORK: ForkSpec = {
  travel: 0.20,
  springK: 5_800,
  airProg: 2.2,
  compressC: 720,
  reboundC: 980,
  topOut: 18_000,
  preload: 140,
  unsprung: 4.2,
};

export const DH_REAR: RearSpec = {
  travel: 0.20,
  springK: 6_400,
  airProg: 2.5,
  compressC: 820,
  reboundC: 1_100,
  topOut: 20_000,
  preload: 165,
  maxAngle: 0.42, // ~24°
  leverage0: 2.55,
  leverage1: 2.15, // progressive: harder deep
  unsprung: 5.1,
};

/** Per-end damper state (travel 0 = fully extended, travel = full compression). */
export interface DamperState {
  x: number;   // m compression
  v: number;   // m/s
}

export interface BikeSuspState {
  fork: DamperState;
  rear: DamperState;
  /** chassis heave residual (m) for body pose */
  heave: number;
  heaveV: number;
}

export const createSusp = (): BikeSuspState => ({
  fork: { x: 0.045, v: 0 },   // ~22% sag seed
  rear: { x: 0.050, v: 0 },
  heave: 0,
  heaveV: 0,
});

export function resetSusp(s: BikeSuspState) {
  s.fork.x = 0.045; s.fork.v = 0;
  s.rear.x = 0.050; s.rear.v = 0;
  s.heave = 0; s.heaveV = 0;
}

/**
 * Spring + damper force for a telescopic or progressive air unit.
 * x ≥ 0 compression. Returns force opposing further compression when positive
 * is extension force on the chassis (standard 1D mass-spring).
 */
function damperForce(
  x: number, v: number,
  travel: number, k: number, airProg: number,
  cComp: number, cReb: number, topOut: number, preload: number,
): number {
  const t = travel;
  // progressive air: F = k·x + k·airProg·(x/t)³·t
  const ratio = clamp01(x / t);
  const spring = k * x + k * airProg * ratio * ratio * ratio * t;
  // damping: high-speed compression softer than rebound (DH stack)
  const c = v > 0 ? cComp : cReb;
  // digressive: softens at high shaft speed
  const damp = c * v * (1 / (1 + Math.abs(v) * 0.35));
  // bottom-out rubber
  let bottom = 0;
  if (x > t * 0.92) {
    const pen = (x - t * 0.92) / (t * 0.08);
    bottom = pen * pen * topOut * t * 0.08;
  }
  // top-out when extending past 0
  let top = 0;
  if (x < 0) {
    top = x * topOut * 0.35 + v * cReb * 0.5;
  }
  return spring + damp + bottom + top + preload;
}

/** Horst leverage at travel ratio r∈[0,1]. */
function leverage(spec: RearSpec, r: number): number {
  return lerp(spec.leverage0, spec.leverage1, clamp01(r));
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

export interface SuspInput {
  /** axle normal load (N), positive into the ground contact */
  loadF: number;
  loadR: number;
  /** true when that wheel is in contact */
  contactF: boolean;
  contactR: boolean;
  /** rider mass kg (sprung) */
  mass: number;
  /** pump intent −1 unweight … +1 compress */
  pump: number;
  /** chassis pitch rad (+ nose up in our terrain convention) */
  pitch: number;
  /** vertical chassis vel (m/s, world up) */
  chassisVy: number;
  dt: number;
}

export interface SuspResult {
  /** fork compression 0..travel */
  forkX: number;
  /** rear axle travel 0..travel */
  rearX: number;
  /** swingarm angle rad (visual) */
  swingAngle: number;
  /** fork travel ratio 0..1 */
  forkRatio: number;
  /** rear travel ratio 0..1 */
  rearRatio: number;
  /** net chassis heave from suspension (m, negative = squat) */
  heave: number;
  /** energy absorbed this step (for FX/audio scale) */
  absorb: number;
  /** bottom-out flags */
  forkBottom: boolean;
  rearBottom: boolean;
}

/**
 * Integrate dual-crown fork + Horst rear for one physics tick.
 * Pure mutator on `state`; returns visual/drive quantities.
 */
export function stepSuspension(
  state: BikeSuspState,
  fork: ForkSpec,
  rear: RearSpec,
  inp: SuspInput,
): SuspResult {
  const dt = Math.min(inp.dt, 1 / 30);
  const g = 9.81;
  // split sprung mass front/rear (~40/60 DH bias, pitch shifts load)
  const pitchBias = clamp(inp.pitch * 1.8, -0.35, 0.35);
  const wF = 0.42 - pitchBias * 0.18 + inp.pump * 0.06;
  const wR = 1 - wF;
  const mF = inp.mass * wF;
  const mR = inp.mass * wR;

  // ---- FORK (telescopic along stanchion) --------------------------------
  {
    const d = state.fork;
    // contact force from wheel; free when airborne → extend under spring
    const groundPush = inp.contactF
      ? Math.max(0, inp.loadF) + mF * g * 0.35
      : 0;
    // shaft force: spring wants to extend (push chassis up = reduce x when free)
    // model:  m * x'' = groundPush - springForce  (x compression increases under load)
    const Fspring = damperForce(
      d.x, d.v, fork.travel, fork.springK, fork.airProg,
      fork.compressC, fork.reboundC, fork.topOut, fork.preload,
    );
    // pump crouch adds deliberate compression
    const pumpF = inp.pump * 380;
    const net = groundPush + pumpF * 0.45 - Fspring + mF * (-inp.chassisVy) * 8;
    const a = net / Math.max(1, mF + fork.unsprung);
    d.v += a * dt;
    d.v *= Math.exp(-0.4 * dt); // coulomb-ish seal friction
    d.x += d.v * dt;
    d.x = clamp(d.x, -0.008, fork.travel + 0.004);
  }

  // ---- REAR (Horst / virtual pivot via leverage) -----------------------
  {
    const d = state.rear;
    const r = clamp01(d.x / rear.travel);
    const lev = leverage(rear, r);
    const groundPush = inp.contactR
      ? Math.max(0, inp.loadR) + mR * g * 0.35
      : 0;
    // shock sees axle force / leverage
    const shockX = d.x / lev; // effective shock stroke
    const shockV = d.v / lev;
    const Fshock = damperForce(
      shockX, shockV, rear.travel / lev, rear.springK, rear.airProg,
      rear.compressC, rear.reboundC, rear.topOut, rear.preload,
    );
    // axle force = shock * leverage
    const Faxle = Fshock * lev;
    const pumpF = inp.pump * 420;
    const net = groundPush + pumpF * 0.55 - Faxle + mR * (-inp.chassisVy) * 8;
    const a = net / Math.max(1, mR + rear.unsprung);
    d.v += a * dt;
    d.v *= Math.exp(-0.45 * dt);
    d.x += d.v * dt;
    d.x = clamp(d.x, -0.008, rear.travel + 0.004);
  }

  // chassis heave from mean compression (for body visual, not double-count contact y)
  const mean = (state.fork.x / fork.travel + state.rear.x / rear.travel) * 0.5;
  const heaveTarget = -mean * 0.12;
  state.heaveV += (heaveTarget - state.heave) * 40 * dt - state.heaveV * 12 * dt;
  state.heave += state.heaveV * dt;

  const forkRatio = clamp01(state.fork.x / fork.travel);
  const rearRatio = clamp01(state.rear.x / rear.travel);
  const swingAngle = rearRatio * rear.maxAngle;

  const absorb =
    Math.max(0, state.fork.v) * forkRatio * 0.5 +
    Math.max(0, state.rear.v) * rearRatio * 0.5;

  return {
    forkX: state.fork.x,
    rearX: state.rear.x,
    swingAngle,
    forkRatio,
    rearRatio,
    heave: state.heave,
    absorb,
    forkBottom: forkRatio > 0.94,
    rearBottom: rearRatio > 0.94,
  };
}

const _shockA = new THREE.Vector3();
const _shockD = new THREE.Vector3();
const _xAxis = new THREE.Vector3(1, 0, 0);
const _yAxis = new THREE.Vector3(0, 1, 0);

/**
 * Drive fork lowers, swingarm, and coil shock mesh from integrated travel.
 * Call after body pitch; before IK (grips move with fork).
 */
export function applySuspVisual(
  rig: RiderRig,
  fork: ForkSpec,
  _rear: RearSpec,
  res: SuspResult,
): void {
  // dual-crown: lowers slide along FORK_AXIS toward the axle
  const forkSlide = res.forkRatio * fork.travel;
  rig.forkLower.position.copy(FORK_AXIS).multiplyScalar(-forkSlide);

  // Horst swingarm pitch about BB
  rig.swingarm.rotation.x = res.swingAngle;

  // re-aim coil between frame mount and swingarm lower mount
  _shockA.copy(SHOCK_LOWER).applyAxisAngle(_xAxis, res.swingAngle).add(BB_POS);
  _shockD.subVectors(_shockA, SHOCK_UPPER);
  const len = _shockD.length() || SHOCK_BASE_LEN;
  rig.shock.position.copy(SHOCK_UPPER).addScaledVector(_shockD, 0.5);
  rig.shock.quaternion.setFromUnitVectors(_yAxis, _shockD.divideScalar(len));
  rig.shock.scale.y = len / SHOCK_BASE_LEN;
}

/**
 * Estimate normal load at each axle from impact + weight transfer.
 * Returns Newtons (approx, arcade-scaled).
 */
export function axleLoads(o: {
  mass: number;
  grounded: boolean;
  contactF: boolean;
  contactR: boolean;
  impact: number;       // −vy at contact
  weight: number;       // −1 brake … +1 accel
  pitch: number;
  pump: number;
  v: number;
}): { loadF: number; loadR: number } {
  if (!o.grounded) return { loadF: 0, loadR: 0 };
  const g = 9.81;
  // Arcade force scale: keep SI mass but boost effective weight so
  // progressive springs sit in the readable mid-travel band under G + landings.
  const base = o.mass * g * 1.35;
  // static split + brake/accel transfer + pitch
  // brake (weight < 0) loads REAR; accel loads FRONT
  let f = 0.40 + o.weight * 0.18 - o.pitch * 0.22;
  f = clamp(f, 0.18, 0.75);
  const impactF = o.contactF ? o.impact * o.mass * 14 : 0;
  const impactR = o.contactR ? o.impact * o.mass * 12 : 0;
  const pump = o.pump * o.mass * 5.5;
  // aero/speed slight front load
  const aero = clamp01(o.v / 40) * o.mass * 1.5;
  // If only one wheel reports contact, dump most load there
  if (o.contactF && !o.contactR) {
    return { loadF: base * 0.85 + impactF + pump * 0.4 + aero, loadR: 0 };
  }
  if (o.contactR && !o.contactF) {
    return { loadF: 0, loadR: base * 0.85 + impactR + pump * 0.5 };
  }
  return {
    loadF: o.contactF ? base * f + impactF + pump * 0.35 + aero : 0,
    loadR: o.contactR ? base * (1 - f) + impactR + pump * 0.55 : 0,
  };
}
