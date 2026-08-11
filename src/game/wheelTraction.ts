// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: per-wheel traction / slip
//
// Pacejka-lite lateral + longitudinal slip on each contact patch.
// Surface µ from track.surfaceAt; returns effective grip & slip for FX.
// ---------------------------------------------------------------------------

import { clamp, clamp01 } from './core';

export type SurfaceKind = 'dirt' | 'mud' | 'rock' | 'gravel' | 'grass';

/** Peak friction coefficients by surface (dry, loose DH pack). */
export const SURFACE_MU: Record<SurfaceKind, { peak: number; slide: number; roll: number }> = {
  rock:   { peak: 1.15, slide: 0.85, roll: 0.012 },
  dirt:   { peak: 1.00, slide: 0.72, roll: 0.018 },
  gravel: { peak: 0.88, slide: 0.55, roll: 0.028 },
  grass:  { peak: 0.82, slide: 0.50, roll: 0.022 },
  mud:    { peak: 0.62, slide: 0.38, roll: 0.045 },
};

export interface WheelState {
  /** rad/s spin */
  omega: number;
  /** slip ratio (−1 lock … + wheelspin) */
  slipLong: number;
  /** slip angle proxy rad */
  slipLat: number;
  /** 0..1 how far past peak (for roost FX) */
  slipAmount: number;
  contact: boolean;
}

export const createWheel = (): WheelState => ({
  omega: 0, slipLong: 0, slipLat: 0, slipAmount: 0, contact: false,
});

export interface WheelInput {
  /** forward speed m/s */
  v: number;
  /** lateral speed m/s */
  vx: number;
  /** wheel radius m */
  radius: number;
  /** normal load N */
  load: number;
  contact: boolean;
  /** brake 0..1, pedal drive 0..1 */
  brake: number;
  drive: number;
  /** surface peak µ (already blended) */
  muPeak: number;
  muSlide: number;
  /** roll resistance coeff */
  rollC: number;
  dt: number;
}

export interface WheelResult {
  /** force along track (− drag / brake) N */
  longForce: number;
  /** lateral force (opposes vx) N */
  latForce: number;
  slipLong: number;
  slipLat: number;
  slipAmount: number;
  omega: number;
}

/**
 * Integrate one wheel: rotating rigid body + brush-ish friction ellipse.
 */
export function stepWheel(w: WheelState, inp: WheelInput): WheelResult {
  const dt = Math.min(inp.dt, 1 / 30);
  const R = inp.radius;
  w.contact = inp.contact;

  if (!inp.contact || inp.load < 20) {
    // freewheel in air — spin down slowly, drive still spins it
    w.omega += (inp.drive * 40 - inp.brake * 25 - w.omega * 0.4) * dt;
    w.slipLong = 0;
    w.slipLat = 0;
    w.slipAmount = 0;
    return {
      longForce: 0, latForce: 0,
      slipLong: 0, slipLat: 0, slipAmount: 0, omega: w.omega,
    };
  }

  // target omega from ground speed; brake locks toward 0, drive overspins
  const freeOmega = inp.v / Math.max(0.05, R);
  const driveOmega = freeOmega + inp.drive * 18;
  const brakeOmega = freeOmega * (1 - inp.brake * 0.92);
  const wantOmega = inp.brake > 0.05 ? brakeOmega : driveOmega;

  // tyre relaxation length — slip doesn't snap
  const kappa = freeOmega > 0.5
    ? (w.omega * R - inp.v) / Math.max(2, Math.abs(inp.v))
    : 0;
  w.slipLong = dampApprox(w.slipLong, clamp(kappa, -1.2, 1.2), 14, dt);

  // slip angle: lateral vel vs forward
  const alpha = Math.atan2(inp.vx, Math.max(3, Math.abs(inp.v)));
  w.slipLat = dampApprox(w.slipLat, alpha, 12, dt);

  // magic-formula-ish peak curve
  const comb = Math.hypot(w.slipLong * 1.1, w.slipLat * 1.4);
  const shape = Math.sin(1.35 * Math.atan(comb * 4.2));
  const mu = inp.muPeak * (1 - clamp01(comb / 1.1)) + inp.muSlide * clamp01(comb / 1.1);
  const Fz = inp.load;
  const Fmax = mu * Fz * Math.abs(shape);

  // friction ellipse split
  const latShare = Math.abs(w.slipLat) / (Math.abs(w.slipLat) + Math.abs(w.slipLong) + 1e-4);
  const latForce = -Math.sign(w.slipLat || inp.vx) * Fmax * (0.35 + latShare * 0.65);
  const longForce =
    -Math.sign(w.slipLong || (wantOmega - freeOmega)) * Fmax * (1 - latShare * 0.55)
    - inp.rollC * Fz * Math.sign(inp.v || 1)
    - inp.brake * Fz * mu * 0.55;

  // wheel inertia ~ 0.18 kg·m² DH wheel
  const I = 0.18;
  const torque = (wantOmega - w.omega) * 12 - longForce * R * 0.15;
  w.omega += (torque / I) * dt;
  // clamp runaway
  w.omega = clamp(w.omega, -5, freeOmega + 40);

  w.slipAmount = clamp01(comb / 0.55);

  return {
    longForce,
    latForce,
    slipLong: w.slipLong,
    slipLat: w.slipLat,
    slipAmount: w.slipAmount,
    omega: w.omega,
  };
}

function dampApprox(cur: number, target: number, rate: number, dt: number): number {
  const k = 1 - Math.exp(-rate * dt);
  return cur + (target - cur) * k;
}

/**
 * Combine two wheels into lateral grip scale for the arcade lateral model.
 * Keeps existing game feel: returns 0.35..1.15 multiplier.
 */
export function combinedGripScale(
  front: WheelResult,
  rear: WheelResult,
  baseGrip: number,
): { gripMul: number; slipRoost: number; longDrag: number } {
  const slip = Math.max(front.slipAmount, rear.slipAmount);
  // past peak µ falls off — still steerable
  const peakLoss = slip * 0.38;
  const gripMul = clamp(baseGrip * (1 - peakLoss) * 0.92 + 0.08, 0.35, 1.15);
  // longitudinal scrub from locked/spinning wheels (m/s² scale via caller)
  const longDrag = -(front.longForce + rear.longForce) / 900;
  return {
    gripMul,
    slipRoost: slip,
    longDrag: clamp(longDrag, -12, 8),
  };
}

/** Map track surface kind + grip float → µ pair. */
export function muFromSurface(
  kind: string,
  grip: number,
): { muPeak: number; muSlide: number; rollC: number } {
  const row = SURFACE_MU[(kind as SurfaceKind)] ?? SURFACE_MU.dirt;
  // track grip is already 0.4..1.1-ish; fold into peak
  const k = clamp(grip, 0.35, 1.2);
  return {
    muPeak: row.peak * k,
    muSlide: row.slide * k,
    rollC: row.roll,
  };
}
