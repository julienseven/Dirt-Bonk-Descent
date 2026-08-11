// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: two-wheel vehicle physics
//
// Single chain: TERRAIN → WHEELS → SUSPENSION → FRAME → RIDER → CAMERA
// Pure resolvers — no scene graph. Geometry constants match models/physics.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { clamp, clamp01, damp } from './core';
import { AXLE_F, AXLE_R, WHEELBASE, GRAV } from './physics';
import { WHEEL_R, FRONT_AXLE_POS, REAR_AXLE_POS, BB_POS, PELVIS_REST } from './models';

/** Combined rider+bike mass (kg). Arcade-scaled with force models. */
export const VEHICLE_MASS = 86;
/** Bike-only mass (kg). */
export const BIKE_MASS = 18;
/** Rider mass (kg). */
export const RIDER_MASS = 68;

/**
 * Bike CoM in bike-local space (between axles, low).
 * Used for debug + weight-transfer bias, not full multi-body.
 */
export const BIKE_COM = new THREE.Vector3(0, 0.42, -0.02);

/**
 * Rider CoM target relative to bike origin when in attack stance
 * (hips over BB region, chest forward, weight between wheels).
 */
export const RIDER_COM_LOCAL = new THREE.Vector3(
  0,
  PELVIS_REST.y + 0.22,
  PELVIS_REST.z + 0.06,
);

/** Combined system CoM (weighted). */
export const SYSTEM_COM = new THREE.Vector3(
  0,
  (BIKE_COM.y * BIKE_MASS + RIDER_COM_LOCAL.y * RIDER_MASS) / VEHICLE_MASS,
  (BIKE_COM.z * BIKE_MASS + RIDER_COM_LOCAL.z * RIDER_MASS) / VEHICLE_MASS,
);

export const WHEEL_RADIUS = WHEEL_R;
export { FRONT_AXLE_POS, REAR_AXLE_POS, BB_POS, WHEELBASE, AXLE_F, AXLE_R };

// ---------------------------------------------------------------------------
// Two-wheel contact
// ---------------------------------------------------------------------------

export interface ContactSample {
  hF: number;
  hR: number;
  /** terrain pitch that plants both wheels (rad, + = front higher) */
  terrainPitch: number;
  /** root Y so both tyre bottoms sit on terrain at terrainPitch */
  supportY: number;
  midH: number;
}

/** Sample support plane from front/rear terrain heights. */
export function sampleContactPlane(hF: number, hR: number): ContactSample {
  const terrainPitch = Math.atan2(hF - hR, WHEELBASE);
  // y + AF·sin(θ) = hF  when body pitch visual uses rx = −θ
  const supportY = hF - AXLE_F * Math.sin(terrainPitch);
  return {
    hF,
    hR,
    terrainPitch,
    supportY,
    midH: (hF + hR) * 0.5,
  };
}

/**
 * Predicted tyre-bottom height along track-up for a chassis pose.
 * Uses small-angle-safe sin of chassis pitch (same sign as terrainPitch).
 */
export function predictedContactY(
  rootY: number,
  chassisPitch: number,
  axleZ: number,
): number {
  return rootY + axleZ * Math.sin(chassisPitch);
}

export interface TwoWheelInput {
  y: number;
  vy: number;
  chassisPitch: number;
  pitchV: number;
  grounded: boolean;
  /** suspension compression (m) — frame drop under load */
  forkX: number;
  rearX: number;
  dt: number;
  hop: boolean;
  /** forward speed for lip launch */
  v: number;
  /** pump −1..+1 */
  pump: number;
  pumpArmed: number;
  hF: number;
  hR: number;
}

export interface TwoWheelResult {
  y: number;
  vy: number;
  chassisPitch: number;
  pitchV: number;
  grounded: boolean;
  contactF: boolean;
  contactR: boolean;
  /** positive impact magnitude on touchdown */
  impact: number;
  /** front-only impact for fork */
  impactF: number;
  /** rear-only impact for shock */
  impactR: number;
  terrainPitch: number;
  supportY: number;
  /** slope ahead of front for lip launch */
  slopeF: number;
  wasAir: boolean;
  pumpArmed: number;
  /** 0..1 how planted (both wheels) */
  plant: number;
}

const CONTACT_SLACK = 0.10;   // m — still counts as touching
const CONTACT_SNAP = 0.18;    // m — hard penetration / stick band
const AIR_LEAVE = 0.14;       // m above support before true air

/**
 * Integrate vertical + pitch for a two-wheel chassis.
 * Wheels are independent contact patches; orientation comes from their
 * relationship to terrain, not a single-point snap.
 */
export function stepTwoWheel(inp: TwoWheelInput): TwoWheelResult {
  const dt = Math.min(inp.dt, 1 / 20);
  const plane = sampleContactPlane(inp.hF, inp.hR);
  const wasAir = !inp.grounded;

  let y = inp.y;
  let vy = inp.vy - GRAV * dt;
  y += vy * dt;

  let pitch = inp.chassisPitch;
  let pitchV = inp.pitchV;

  // Soft ride-height sag from suspension (wheels on ground → frame drops).
  // Visual fork/swingarm also show compression; this is the chassis sink only.
  const sag = (Math.max(0, inp.forkX) * 0.45 + Math.max(0, inp.rearX) * 0.55) * 0.28;
  const targetY = plane.supportY - sag;

  // Stick assist: if we were grounded and still near the plane, pull gently
  // toward support so slopes don't lose both contacts from pitch lag.
  // Do NOT pull while rising (hop / lip launch).
  if (inp.grounded && vy < 1.2 && y > targetY && y < targetY + AIR_LEAVE) {
    y = damp(y, targetY, 28, dt);
    if (vy > 0 && vy < 1.2) vy *= 0.45;
  }

  const yF = predictedContactY(y, pitch, AXLE_F);
  const yR = predictedContactY(y, pitch, AXLE_R);
  const penF = plane.hF - yF; // >0 = into ground
  const penR = plane.hR - yR;

  let contactF = penF > -CONTACT_SLACK;
  let contactR = penR > -CONTACT_SLACK;

  // If previously grounded and still within leave band of support, keep plant
  if (inp.grounded && y < targetY + AIR_LEAVE) {
    if (penF > -CONTACT_SLACK * 1.6) contactF = true;
    if (penR > -CONTACT_SLACK * 1.6) contactR = true;
  }

  // Partial: far side can still be airborne over a crest
  if (contactF && !contactR && penR < -0.22) contactR = false;
  if (contactR && !contactF && penF < -0.22) contactF = false;

  let impact = 0;
  let impactF = 0;
  let impactR = 0;
  let grounded = inp.grounded;
  let pumpArmed = inp.pumpArmed;
  const slopeF = 0;

  if (contactF || contactR) {
    const downSpeed = Math.max(0, -vy);

    if (contactF && contactR) {
      // Full plant: root on support plane, pitch springs hard to terrain.
      // Skip height snap while rising so hop / lip can leave the ground.
      const rising = vy > 1.5;
      if (!rising && (penF > 0 || penR > 0 || y < targetY + CONTACT_SNAP || inp.grounded)) {
        if (wasAir || downSpeed > 1.5) {
          impact = downSpeed;
          impactF = downSpeed * (0.45 + clamp(pitch, -0.3, 0.3) * 0.4);
          impactR = downSpeed * (0.55 - clamp(pitch, -0.3, 0.3) * 0.4);
        }
        // blend then snap residual so slopes track without chatter
        y = y * 0.15 + targetY * 0.85;
        if (Math.abs(y - targetY) < 0.04) y = targetY;
        if (vy < 0) vy = 0;
      }
      // pitch spring toward terrain chord (stiffer when planted)
      const pitchErr = pitch - plane.terrainPitch;
      pitchV += (-pitchErr * 260 - pitchV * 22) * dt;
      pitch += pitchV * dt;
    } else if (contactF) {
      // Front wheel only — nose lands / crest
      if (penF > -CONTACT_SLACK) {
        if (wasAir || downSpeed > 1.2) {
          impact = downSpeed * 0.85;
          impactF = downSpeed;
        }
        if (penF > 0) y += penF;
        if (vy < 0) vy *= 0.12;
      }
      // rear free: gravity pitches bike toward terrain
      pitchV += (1.1 * GRAV / WHEELBASE) * dt;
      pitchV += (-(pitch - plane.terrainPitch * 0.55) * 70 - pitchV * 10) * dt;
      pitch += pitchV * dt;
    } else {
      // Rear wheel only
      if (penR > -CONTACT_SLACK) {
        if (wasAir || downSpeed > 1.2) {
          impact = downSpeed * 0.9;
          impactR = downSpeed;
        }
        if (penR > 0) y += penR;
        if (vy < 0) vy *= 0.12;
      }
      pitchV -= (0.85 * GRAV / WHEELBASE) * dt;
      pitchV += (-(pitch - plane.terrainPitch * 0.55) * 70 - pitchV * 10) * dt;
      pitch += pitchV * dt;
    }

    grounded = true;
  } else {
    // fully airborne
    if (y > targetY + AIR_LEAVE) grounded = false;
    else if (inp.grounded && y <= targetY + AIR_LEAVE) {
      // still in stick band — re-acquire
      grounded = true;
      contactF = true;
      contactR = true;
      y = damp(y, targetY, 20, dt);
      if (vy < 0) vy = 0;
      const pitchErr = pitch - plane.terrainPitch;
      pitchV += (-pitchErr * 200 - pitchV * 18) * dt;
      pitch += pitchV * dt;
    } else {
      grounded = false;
      contactF = false;
      contactR = false;
      // ease pitch toward level in air (momentum kept via pitchV)
      pitchV += (-pitch * 8 - pitchV * 2.2) * dt;
      pitch += pitchV * dt;
    }
  }

  pitch = clamp(pitch, -0.72, 0.72);

  const plant = (contactF ? 0.5 : 0) + (contactR ? 0.5 : 0);

  return {
    y, vy, chassisPitch: pitch, pitchV,
    grounded, contactF, contactR,
    impact, impactF, impactR,
    terrainPitch: plane.terrainPitch,
    supportY: targetY,
    slopeF,
    wasAir,
    pumpArmed,
    plant,
  };
}

/**
 * Lip launch / pump helpers that need an extra terrain sample.
 */
export function lipLaunch(
  v: number,
  hAhead: number,
  hR: number,
  axleAhead: number,
): number {
  const slopeF = (hAhead - hR) / Math.max(0.5, axleAhead - AXLE_R);
  return slopeF > 0.06 ? v * slopeF * 1.15 : 0;
}

export function stepPump(
  pump: number,
  pumpArmed: number,
  wantDown: boolean,
  hop: boolean,
  hF: number,
  hR: number,
  midProbe: number,
  grounded: boolean,
  dt: number,
): { pump: number; pumpArmed: number; speedGain: number; hopVy: number } {
  if (!grounded) {
    return {
      pump: damp(pump, 0, 6, dt),
      pumpArmed: Math.max(0, pumpArmed - dt * 1.2),
      speedGain: 0,
      hopVy: 0,
    };
  }
  const pumpTarget = wantDown ? 1 : hop ? -1 : 0;
  const p = damp(pump, pumpTarget, 9, dt);
  let armed = pumpArmed;
  let speedGain = 0;
  // curvature: >0 compression (valley), <0 crest
  const curveT = (hF + hR) * 0.5 - midProbe;
  if (curveT > 0.012 && p > 0.35) {
    armed = Math.min(1, armed + p * curveT * 22 * dt);
  } else if (curveT < -0.008 && armed > 0.05 && p < 0.1) {
    speedGain = armed * 9 * 8; // applied * dt by caller
    armed = Math.max(0, armed - dt * 2.4);
  } else {
    armed = Math.max(0, armed - dt * 0.7);
  }
  let hopVy = 0;
  if (hop) {
    hopVy = 7.6 + armed * 3.4;
    armed = 0;
  }
  return { pump: p, pumpArmed: armed, speedGain, hopVy };
}

// ---------------------------------------------------------------------------
// Chassis visual pitch (body.rotation.x)
// ---------------------------------------------------------------------------

/**
 * Map physics chassisPitch → body.rotation.x.
 * +chassisPitch (front higher) → nose-up visual → negative rx in Three.js.
 */
export function bodyPitchFromChassis(
  chassisPitch: number,
  vy: number,
  grounded: boolean,
  landCrouch: number,
  weight: number,
): number {
  const airLean = grounded
    ? clamp(-vy * 0.012, -0.16, 0.16)
    : clamp(-vy * 0.016, -0.3, 0.3);
  return (
    airLean
    - chassisPitch
    + landCrouch
    + clamp01(-weight) * 0.06
    - clamp01(weight) * 0.05
  );
}

// ---------------------------------------------------------------------------
// Debug draw helpers (caller owns the Object3D group)
// ---------------------------------------------------------------------------

export interface PhysicsDebugSnapshot {
  root: THREE.Vector3;
  bikeCom: THREE.Vector3;
  riderCom: THREE.Vector3;
  contactF: THREE.Vector3;
  contactR: THREE.Vector3;
  forward: THREE.Vector3;
  velocity: THREE.Vector3;
  normal: THREE.Vector3;
  steerAxis: THREE.Vector3;
  gripL: THREE.Vector3;
  gripR: THREE.Vector3;
  pedalL: THREE.Vector3;
  pedalR: THREE.Vector3;
  forkRatio: number;
  rearRatio: number;
  contactFOn: boolean;
  contactROn: boolean;
  grounded: boolean;
}

export function createPhysicsDebugGroup(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'physicsDebug';
  g.visible = false;

  const mkBall = (color: number, r = 0.08) => {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(r, 8, 6),
      new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 }),
    );
    m.renderOrder = 999;
    g.add(m);
    return m;
  };
  const mkLine = (color: number) => {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(), new THREE.Vector3(0, 1, 0),
    ]);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.9 }),
    );
    line.renderOrder = 999;
    g.add(line);
    return line;
  };

  // order matters for updatePhysicsDebug
  mkBall(0xff3344, 0.10); // 0 bike CoM
  mkBall(0x33ff88, 0.09); // 1 rider CoM
  mkBall(0xffee00, 0.07); // 2 contact F
  mkBall(0xffaa00, 0.07); // 3 contact R
  mkBall(0x66ccff, 0.05); // 4 grip L
  mkBall(0x66ccff, 0.05); // 5 grip R
  mkBall(0xff66cc, 0.05); // 6 pedal L
  mkBall(0xff66cc, 0.05); // 7 pedal R
  mkLine(0xffffff);       // 8 forward
  mkLine(0x00ffaa);       // 9 velocity
  mkLine(0x4488ff);       // 10 normal
  mkLine(0xff8800);       // 11 steer axis
  // suspension bars (12 front, 13 rear) — short vertical segments
  mkLine(0x00ffcc);
  mkLine(0x00ccff);

  return g;
}

const _dA = new THREE.Vector3();
const _dB = new THREE.Vector3();

function setLine(line: THREE.Line, a: THREE.Vector3, b: THREE.Vector3) {
  const pos = line.geometry.getAttribute('position') as THREE.BufferAttribute;
  pos.setXYZ(0, a.x, a.y, a.z);
  pos.setXYZ(1, b.x, b.y, b.z);
  pos.needsUpdate = true;
  line.geometry.computeBoundingSphere();
}

export function updatePhysicsDebug(group: THREE.Group, snap: PhysicsDebugSnapshot) {
  const ch = group.children;
  if (ch.length < 14) return;

  (ch[0] as THREE.Mesh).position.copy(snap.bikeCom);
  (ch[1] as THREE.Mesh).position.copy(snap.riderCom);

  const cF = ch[2] as THREE.Mesh;
  const cR = ch[3] as THREE.Mesh;
  cF.position.copy(snap.contactF);
  cR.position.copy(snap.contactR);
  cF.visible = snap.contactFOn || snap.grounded;
  cR.visible = snap.contactROn || snap.grounded;
  (cF.material as THREE.MeshBasicMaterial).color.setHex(snap.contactFOn ? 0xffee00 : 0x666633);
  (cR.material as THREE.MeshBasicMaterial).color.setHex(snap.contactROn ? 0xffaa00 : 0x664422);

  (ch[4] as THREE.Mesh).position.copy(snap.gripL);
  (ch[5] as THREE.Mesh).position.copy(snap.gripR);
  (ch[6] as THREE.Mesh).position.copy(snap.pedalL);
  (ch[7] as THREE.Mesh).position.copy(snap.pedalR);

  setLine(ch[8] as THREE.Line, snap.root, _dA.copy(snap.root).add(snap.forward));
  setLine(ch[9] as THREE.Line, snap.root, _dB.copy(snap.root).add(snap.velocity));
  setLine(ch[10] as THREE.Line, snap.root, _dA.copy(snap.root).add(snap.normal));
  setLine(ch[11] as THREE.Line, snap.steerAxis, _dB.copy(snap.steerAxis).addScaledVector(snap.normal, 0.55));

  // susp travel bars at contact points
  const fH = 0.15 + snap.forkRatio * 0.35;
  const rH = 0.15 + snap.rearRatio * 0.35;
  setLine(
    ch[12] as THREE.Line,
    snap.contactF,
    _dA.copy(snap.contactF).addScaledVector(snap.normal, fH),
  );
  setLine(
    ch[13] as THREE.Line,
    snap.contactR,
    _dB.copy(snap.contactR).addScaledVector(snap.normal, rH),
  );
}
