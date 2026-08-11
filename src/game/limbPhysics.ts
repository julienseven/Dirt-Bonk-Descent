// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: skeletal limb physics
//
// Anatomical joint limits, G-force upper-body reaction, hybrid
// mounted-IK ↔ ragdoll attachment release. Pure helpers — no scene graph.
// ---------------------------------------------------------------------------

import { clamp, clamp01, damp } from './core';
import type { RiderRig } from './models';
import type { RagdollLimbs } from './crash';

/** Anatomical limits (radians) for DH attack posture offsets. */
export const JOINT_LIMITS = {
  // shoulder: flex/ext, abd/add, twist
  shoulderFlex: [-2.4, 0.9] as const,
  shoulderAbd: [-0.3, 2.0] as const,
  shoulderTwist: [-1.2, 1.2] as const,
  // elbow hinge (local X), only folds one way
  elbow: [-2.5, 0.05] as const,
  // hip
  hipFlex: [-0.4, 2.0] as const,
  hipAbd: [-0.6, 0.9] as const,
  hipTwist: [-0.7, 0.7] as const,
  // knee hinge
  knee: [-2.4, 0.05] as const,
  // spine segment
  spinePitch: [-0.35, 0.85] as const,
  spineRoll: [-0.55, 0.55] as const,
  spineYaw: [-0.7, 0.7] as const,
  // neck
  neckPitch: [-0.55, 0.65] as const,
  neckYaw: [-1.1, 1.1] as const,
  headPitch: [-0.7, 0.6] as const,
} as const;

function lim(v: number, range: readonly [number, number]): number {
  return clamp(v, range[0], range[1]);
}

/** Clamp a limb euler into anatomical ranges. */
export function clampArm(
  flex: number, abd: number, twist: number,
): [number, number, number] {
  return [
    lim(flex, JOINT_LIMITS.shoulderFlex),
    lim(abd, JOINT_LIMITS.shoulderAbd),
    lim(twist, JOINT_LIMITS.shoulderTwist),
  ];
}

export function clampFore(fold: number): number {
  return lim(fold, JOINT_LIMITS.elbow);
}

export function clampLeg(
  flex: number, abd: number, twist: number,
): [number, number, number] {
  return [
    lim(flex, JOINT_LIMITS.hipFlex),
    lim(abd, JOINT_LIMITS.hipAbd),
    lim(twist, JOINT_LIMITS.hipTwist),
  ];
}

export function clampShin(fold: number): number {
  return lim(fold, JOINT_LIMITS.knee);
}

/** Pose sample from ragdoll (may omit flail metadata). */
export type LimbPose = Pick<
  RagdollLimbs,
  'armL' | 'armR' | 'foreL' | 'foreR' | 'legL' | 'legR' | 'shinL' | 'shinR' | 'headX' | 'headY'
>;

/** Apply joint limits to a ragdoll limb sample. */
export function clampRagdollLimbs<T extends LimbPose>(lims: T): T {
  return {
    ...lims,
    armL: clampArm(lims.armL[0], lims.armL[1], lims.armL[2]),
    armR: clampArm(lims.armR[0], lims.armR[1], lims.armR[2]),
    legL: clampLeg(lims.legL[0], lims.legL[1], lims.legL[2]),
    legR: clampLeg(lims.legR[0], lims.legR[1], lims.legR[2]),
    foreL: clampFore(lims.foreL),
    foreR: clampFore(lims.foreR),
    shinL: clampShin(lims.shinL),
    shinR: clampShin(lims.shinR),
    headX: lim(lims.headX, JOINT_LIMITS.headPitch),
    headY: lim(lims.headY, JOINT_LIMITS.neckYaw),
  };
}

// ---------------------------------------------------------------------------
// G-force torso / attachment dynamics
// ---------------------------------------------------------------------------

export interface BodyDynState {
  /** residual chest pitch from G (rad) */
  gPitch: number;
  gPitchV: number;
  /** residual chest roll from centripetal (rad) */
  gRoll: number;
  gRollV: number;
  /** residual lateral hip shift (m) */
  gLat: number;
  /** hand grip strength 0..1 (1 = locked to bars) */
  gripL: number;
  gripR: number;
  /** foot pedal lock 0..1 */
  footL: number;
  footR: number;
}

export const createBodyDyn = (): BodyDynState => ({
  gPitch: 0, gPitchV: 0,
  gRoll: 0, gRollV: 0,
  gLat: 0,
  gripL: 1, gripR: 1,
  footL: 1, footR: 1,
});

export function resetBodyDyn(s: BodyDynState) {
  s.gPitch = 0; s.gPitchV = 0;
  s.gRoll = 0; s.gRollV = 0;
  s.gLat = 0;
  s.gripL = s.gripR = s.footL = s.footR = 1;
}

export interface BodyDynInput {
  /** longitudinal accel m/s² (forward +) */
  ax: number;
  /** lateral accel m/s² (screen-left +) */
  ay: number;
  /** vertical accel m/s² (up +) */
  az: number;
  /** lean rad */
  lean: number;
  /** chassis pitch rad */
  pitch: number;
  /** suspension absorb 0..1 */
  absorb: number;
  /** crash active */
  crash: boolean;
  /** deliberate detach (tricks) 0..1 */
  handOffL: number;
  handOffR: number;
  footOffR: number;
  /** bonk impulse magnitude this frame */
  bonkImpulse: number;
  dt: number;
}

export interface BodyDynResult {
  chestPitchAdd: number;
  chestRollAdd: number;
  hipLat: number;
  hipDrop: number;
  /** IK hand detach 0..1 */
  handOffL: number;
  handOffR: number;
  footOffL: number;
  footOffR: number;
}

/**
 * Hybrid upper-body mass: soft 2nd-order response to G, grip release under
 * high load / crash. Mounted riding keeps hands/feet IK-locked unless force
 * exceeds attachment threshold.
 */
export function stepBodyDyn(s: BodyDynState, inp: BodyDynInput): BodyDynResult {
  const dt = Math.min(inp.dt, 1 / 20);
  // G-target: brake opens chest, accel tucks; pitch counter-balance
  // (nose down → rider opens/shifts back; nose up → weight forward)
  const g = 9.81;
  const pitchTarget = clamp(
    -inp.ax / g * 0.14 + inp.az / g * 0.06 - inp.pitch * 0.14 + inp.absorb * 0.04,
    -0.35, 0.28,
  );
  const rollTarget = clamp(
    -inp.ay / g * 0.18 + inp.lean * 0.12,
    -0.4, 0.4,
  );

  // underdamped torso mass
  s.gPitchV += (pitchTarget - s.gPitch) * 55 * dt - s.gPitchV * 9 * dt;
  s.gPitch += s.gPitchV * dt;
  s.gPitch = lim(s.gPitch, JOINT_LIMITS.spinePitch);

  s.gRollV += (rollTarget - s.gRoll) * 48 * dt - s.gRollV * 10 * dt;
  s.gRoll += s.gRollV * dt;
  s.gRoll = lim(s.gRoll, JOINT_LIMITS.spineRoll);

  s.gLat = damp(s.gLat, -inp.ay / g * 0.05 - inp.lean * 0.03, 10, dt);

  // attachment: restore when calm, tear under crash / big G / bonk
  const load =
    Math.abs(inp.ax) / g * 0.15 +
    Math.abs(inp.ay) / g * 0.2 +
    Math.abs(inp.az) / g * 0.12 +
    inp.absorb * 0.15 +
    inp.bonkImpulse * 0.8;

  const restore = inp.crash ? 0 : 2.8;
  const tear = inp.crash ? 8 : load * 1.4;

  const stepGrip = (g0: number, deliberate: number) => {
    let g = g0;
    g -= tear * dt;
    g += restore * dt;
    g = clamp01(g);
    // deliberate trick release wins
    return Math.min(g, 1 - deliberate);
  };

  s.gripL = stepGrip(s.gripL, inp.handOffL);
  s.gripR = stepGrip(s.gripR, inp.handOffR);
  s.footL = stepGrip(s.footL, 0);
  s.footR = stepGrip(s.footR, inp.footOffR);

  if (inp.crash) {
    s.gripL = s.gripR = s.footL = s.footR = 0;
  }

  // Bike down → pelvis drops (readable knee bend on landings); up → slight extend
  const heaveDrop =
    clamp01(inp.absorb) * 0.072
    + Math.max(0, -inp.az / g) * 0.048
    - clamp(inp.az / g, 0, 1.2) * 0.012;

  return {
    chestPitchAdd: s.gPitch,
    chestRollAdd: s.gRoll,
    hipLat: s.gLat,
    hipDrop: heaveDrop,
    handOffL: 1 - s.gripL,
    handOffR: 1 - s.gripR,
    footOffL: 1 - s.footL,
    footOffR: 1 - s.footR,
  };
}

/**
 * Soft secondary motion on spine after stance/IK: applies G offsets + limits.
 */
export function applyBodyDynToRig(
  rig: RiderRig,
  dyn: BodyDynResult,
  lean: number,
): void {
  rig.torso.rotation.x = lim(
    rig.torso.rotation.x + dyn.chestPitchAdd,
    JOINT_LIMITS.spinePitch,
  );
  rig.torso.rotation.z = lim(
    rig.torso.rotation.z + dyn.chestRollAdd * 0.65,
    JOINT_LIMITS.spineRoll,
  );
  if (rig.spine) {
    rig.spine.rotation.x = lim(
      rig.spine.rotation.x + dyn.chestPitchAdd * 0.45,
      JOINT_LIMITS.spinePitch,
    );
    rig.spine.rotation.z = lim(
      rig.spine.rotation.z - lean * 0.04 + dyn.chestRollAdd * 0.25,
      JOINT_LIMITS.spineRoll,
    );
  }
  rig.pelvis.position.x += dyn.hipLat;
  rig.pelvis.position.y -= dyn.hipDrop;
}
