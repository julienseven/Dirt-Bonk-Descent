// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: THE BONK SYSTEM
//
// The signature mechanic. Every physical rider-on-rider contact resolves
// through here so that one impulse model drives classification, knockback,
// scoring, audio and FX — rather than each call site inventing its own.
//
// Design shape:
//   BASE TYPE comes from contact geometry   (SIDE / FRONT / REAR)
//   MODIFIERS upgrade it                    (DOUBLE > MEGA > WALL)
//
// Geometry types are mutually exclusive by construction (they partition the
// contact circle). Modifiers are conditions layered on top, resolved by
// priority so a single contact always yields exactly one headline type.
// ---------------------------------------------------------------------------

import { clamp, clamp01 } from './core';
import { BikeState, isAirborne } from './bikeState';

export enum BonkType {
  SIDE = 'SIDE BONK',
  FRONT = 'FRONT BONK',
  REAR = 'REAR BONK',
  WALL = 'WALL BONK',
  DOUBLE = 'DOUBLE BONK',
  MEGA = 'MEGA BONK',
}

/** One participant in a collision. */
export interface BonkBody {
  /** distance along the track (m) */
  s: number;
  /** lateral offset from centreline (m) */
  x: number;
  /** height (m) */
  y: number;
  /** forward speed (m/s) */
  v: number;
  /** lateral speed (m/s) */
  vx: number;
  /** kilograms — rider + bike */
  mass: number;
  state: BikeState;
  /** true if this body initiated the contact with a swing */
  swinging: boolean;
}

/** Everything the resolver needs that isn't a body. */
export interface BonkContext {
  /** 0..1 grip at the contact point; low grip = more slide, less bite */
  surfaceGrip: number;
  /** half-width of the track here, for wall detection */
  halfWidth: number;
  /** both riders swung within this window -> DOUBLE */
  simultaneous: boolean;
}

export interface BonkResult {
  type: BonkType;
  /** headline used for the popup */
  label: string;
  /** 0..1 normalised severity, drives shake / hitstop / audio */
  power: number;
  /** impulse magnitude (N.s) */
  impulse: number;
  /** signed lateral knockback applied to the victim (m/s) */
  knockX: number;
  /** signed longitudinal knockback applied to the victim (m/s) */
  knockS: number;
  /** vertical pop (m/s) */
  knockY: number;
  /** reaction applied back to the aggressor (m/s lateral) */
  reactX: number;
  /** multiplier on the aggressor's speed after contact */
  aggressorSpeedMul: number;
  /** multiplier on the victim's speed after contact */
  victimSpeedMul: number;
  /** probability the victim goes down */
  crashChance: number;
  /** base score before combo multiplier */
  score: number;
  /** boost granted to the aggressor */
  boost: number;
  /** collision angle in radians, 0 = head-on, PI/2 = pure side */
  angle: number;
  /** closing speed along the contact normal (m/s) */
  relativeVelocity: number;
  /** momentum through the contact (kg.m/s) */
  momentum: number;
  colour: string;
}

// --- tuning ----------------------------------------------------------------

export const BONK_TUNING = {
  /** angle (rad) below which contact counts as longitudinal, not side */
  frontRearCone: 0.62,
  /** momentum (kg.m/s) at which a hit is upgraded to MEGA */
  megaMomentum: 780,
  /** how far past the tape the victim must be shoved to count as WALL */
  wallMargin: 0.6,
  /** arcade scaling on the physical impulse -> knockback velocity */
  knockScale: 0.019,
  /** restitution: how bouncy rider-on-rider contact is */
  restitution: 0.42,
};

const TYPE_COLOUR: Record<BonkType, string> = {
  [BonkType.SIDE]: '#ffd400',
  [BonkType.FRONT]: '#ff9500',
  [BonkType.REAR]: '#7ef7ff',
  [BonkType.WALL]: '#ff6a00',
  [BonkType.DOUBLE]: '#c0f000',
  [BonkType.MEGA]: '#ff2e88',
};

/** Flavour text, picked by type. */
const TYPE_LABEL: Record<BonkType, string[]> = {
  [BonkType.SIDE]: ['SIDE BONK', 'SHOULDER CHECK', 'HIP CHECK'],
  [BonkType.FRONT]: ['FRONT BONK', 'RAMMED!', 'BATTERING RAM'],
  [BonkType.REAR]: ['REAR BONK', 'TAPPED OUT', 'BACK WHEEL SWIPE'],
  [BonkType.WALL]: ['WALL BONK!', 'INTO THE TREES!', 'OFF THE COURSE!'],
  [BonkType.DOUBLE]: ['DOUBLE BONK!', 'BOTH WENT FOR IT!', 'MUTUAL DESTRUCTION'],
  [BonkType.MEGA]: ['MEGA BONK!!', 'ABSOLUTELY CLATTERED', 'DEMOLISHED'],
};

// --- state modifiers -------------------------------------------------------

/** How much force this body can put through a hit. */
function aggressorFactor(st: BikeState): number {
  switch (st) {
    case BikeState.BOOSTING: return 1.45;   // full commitment
    case BikeState.ACCELERATING: return 1.12;
    case BikeState.DRIFTING: return 1.2;    // whole bike swinging through
    case BikeState.BRAKING: return 0.72;    // weight on the front, no drive
    case BikeState.AIRBORNE:
    case BikeState.TRICKING: return 0.5;    // nothing to push against
    case BikeState.STUNNED: return 0.45;
    case BikeState.LANDING: return 0.85;
    default: return 1;
  }
}

/** How badly this body absorbs a hit. Higher = gets thrown further. */
function victimVulnerability(st: BikeState): number {
  switch (st) {
    case BikeState.AIRBORNE:
    case BikeState.TRICKING: return 1.75;   // no contact patch to brace with
    case BikeState.DRIFTING: return 1.45;   // already sliding
    case BikeState.LANDING: return 1.35;    // suspension loaded, unsettled
    case BikeState.STUNNED: return 1.3;
    case BikeState.BRAKING: return 0.78;    // weighted, planted
    case BikeState.BOOSTING: return 0.85;   // driving hard, stable
    default: return 1;
  }
}

// --- the resolver ----------------------------------------------------------

/**
 * Resolve a collision between two bodies.
 *
 * `a` is the aggressor (or, for a natural collision, whoever is closing).
 * Pure: no randomness, no side effects — callers apply the result. That keeps
 * it unit-testable and means the same contact always resolves identically.
 */
export function resolveBonk(
  a: BonkBody, b: BonkBody, ctx: BonkContext,
): BonkResult {
  const T = BONK_TUNING;

  // ---- geometry -------------------------------------------------------
  // contact normal points from aggressor to victim
  const nS = b.s - a.s;
  const nX = b.x - a.x;
  const dist = Math.hypot(nS, nX) || 0.001;
  const uS = nS / dist, uX = nX / dist;

  // ---- relative velocity ----------------------------------------------
  const relS = a.v - b.v;
  const relX = a.vx - b.vx;
  // closing speed along the contact normal (positive = approaching)
  const relativeVelocity = relS * uS + relX * uX;

  // ---- collision angle -------------------------------------------------
  // 0 = purely longitudinal (nose-to-tail), PI/2 = purely lateral
  const angle = Math.abs(Math.atan2(Math.abs(uX), Math.abs(uS)));

  // ---- mass & momentum --------------------------------------------------
  const closing = Math.max(0, relativeVelocity);
  const reducedMass = (a.mass * b.mass) / (a.mass + b.mass);
  // Momentum through the contact. Includes the aggressor's absolute speed,
  // not just closing speed: two riders at 40 m/s trading paint is a far
  // bigger event than the same relative velocity at walking pace, and MEGA
  // is specified as a *high momentum* outcome.
  const swingKick = a.swinging ? 6.5 : 0;
  const momentum = reducedMass * (Math.abs(relativeVelocity) + swingKick)
    + a.mass * Math.abs(a.v) * 0.12;

  // ---- impulse ----------------------------------------------------------
  // Standard 1D impulse along the normal, then scaled for arcade feel.
  // A swing adds a deliberate shove on top of the physical closing speed.
  const effClosing = closing + swingKick;
  let impulse = (1 + T.restitution) * effClosing * reducedMass;

  // state modifiers
  impulse *= aggressorFactor(a.state);
  const vuln = victimVulnerability(b.state);

  // surface: loose ground means the victim slides away instead of digging in
  const slideBias = 1 + (1 - clamp01(ctx.surfaceGrip)) * 0.55;

  // ---- classification ---------------------------------------------------
  let type: BonkType;
  if (angle > T.frontRearCone) {
    type = BonkType.SIDE;
  } else if (uS > 0) {
    // victim is ahead: we hit their back wheel
    type = BonkType.REAR;
  } else {
    // victim is behind: they ran into our front / we backed into them
    type = BonkType.FRONT;
  }

  // ---- modifiers, highest priority last --------------------------------
  const knockMag = impulse * T.knockScale * vuln * slideBias;
  // where will the victim end up?
  const projectedX = b.x + uX * knockMag * 0.5;
  const intoWall = Math.abs(projectedX) > ctx.halfWidth + T.wallMargin
    && Math.abs(b.x) <= ctx.halfWidth + T.wallMargin;

  if (intoWall) type = BonkType.WALL;
  if (momentum > T.megaMomentum) type = BonkType.MEGA;
  if (ctx.simultaneous) type = BonkType.DOUBLE;

  // ---- knockback --------------------------------------------------------
  // Direction follows the contact normal, weighted per type so each one
  // reads differently in play rather than being the same shove relabelled.
  let kx = uX, ks = uS, ky = 0.0;
  let scoreBase = 300;
  let crashChance = 0.16;
  let aggressorSpeedMul = 0.97;
  let victimSpeedMul = 0.92;
  let boost = 13;

  switch (type) {
    case BonkType.SIDE:
      // pure lateral shove; barely costs the aggressor anything
      kx = Math.sign(uX) || 1; ks = 0; ky = 0.25;
      scoreBase = 300; crashChance = 0.22;
      aggressorSpeedMul = 0.985; victimSpeedMul = 0.93;
      boost = 13;
      break;
    case BonkType.FRONT:
      // we ran into their back: they get punted forward, we scrub hard
      kx = uX * 0.5; ks = 1; ky = 0.15;
      scoreBase = 260; crashChance = 0.14;
      aggressorSpeedMul = 0.80; victimSpeedMul = 1.02;
      boost = 10;
      break;
    case BonkType.REAR:
      // clipping their rear wheel fishtails them sideways
      kx = (Math.sign(uX) || 1) * 1.3; ks = 0.35; ky = 0.1;
      scoreBase = 340; crashChance = 0.34;   // most likely to put them down
      aggressorSpeedMul = 0.94; victimSpeedMul = 0.88;
      boost = 15;
      break;
    case BonkType.WALL:
      kx = (Math.sign(uX) || 1) * 1.55; ks = 0.1; ky = 0.35;
      scoreBase = 520; crashChance = 0.52;
      aggressorSpeedMul = 0.97; victimSpeedMul = 0.72;
      boost = 24;
      break;
    case BonkType.DOUBLE:
      // both bounce; nobody wins the exchange
      kx = (Math.sign(uX) || 1) * 1.2; ks = 0; ky = 0.5;
      scoreBase = 400; crashChance = 0.3;
      aggressorSpeedMul = 0.86; victimSpeedMul = 0.86;
      boost = 18;
      break;
    case BonkType.MEGA:
      kx = uX * 1.7; ks = uS * 0.8; ky = 0.85;
      scoreBase = 800; crashChance = 0.68;
      aggressorSpeedMul = 0.90; victimSpeedMul = 0.62;
      boost = 34;
      break;
  }

  const power = clamp01(impulse / 900);
  const scale = knockMag;

  return {
    type,
    label: TYPE_LABEL[type][0],
    power,
    impulse,
    knockX: kx * scale,
    knockS: ks * scale * 0.45,
    knockY: ky * scale * 0.5,
    reactX: -uX * scale * 0.28,
    aggressorSpeedMul,
    victimSpeedMul,
    crashChance: clamp01(crashChance * (0.6 + power)),
    score: scoreBase * (0.7 + power * 0.8),
    boost,
    angle,
    relativeVelocity,
    momentum,
    colour: TYPE_COLOUR[type],
  };
}

// --- verification ----------------------------------------------------------

export interface BonkVerify {
  cases: number;
  counts: Record<string, number>;
  unreachable: string[];
  deterministic: boolean;
}

/**
 * Sweep plausible collision geometries and confirm every bonk type can
 * actually occur. A type nobody can trigger is dead content, and that's not
 * something to find out from a player.
 */
export function verifyBonkSystem(): BonkVerify {
  const counts: Record<string, number> = {};
  for (const t of Object.values(BonkType)) counts[t] = 0;
  let cases = 0;
  let deterministic = true;

  const speeds = [8, 20, 34, 44];
  const offsets = [-1.4, -0.6, 0, 0.6, 1.4];
  const gaps = [-1.8, -0.7, 0, 0.7, 1.8];
  const states = [
    BikeState.GROUNDED, BikeState.BOOSTING, BikeState.DRIFTING,
    BikeState.AIRBORNE, BikeState.BRAKING,
  ];

  for (const av of speeds)
  for (const bv of speeds)
  for (const dx of offsets)
  for (const ds of gaps)
  for (const st of states)
  for (const swinging of [false, true])
  for (const sim of [false, true])
  for (const nearEdge of [false, true]) {
    const a: BonkBody = {
      s: 0, x: 0, y: 0, v: av, vx: 0, mass: 86,
      state: BikeState.GROUNDED, swinging,
    };
    const b: BonkBody = {
      s: ds, x: dx, y: 0, v: bv, vx: 0, mass: 86, state: st, swinging: sim,
    };
    if (ds === 0 && dx === 0) continue;
    const ctx = {
      surfaceGrip: 1,
      halfWidth: nearEdge ? Math.abs(dx) + 0.2 : 9,
      simultaneous: sim,
    };
    const r1 = resolveBonk(a, b, ctx);
    const r2 = resolveBonk(a, b, ctx);
    if (r1.type !== r2.type) deterministic = false;
    counts[r1.type]++;
    cases++;
  }

  return {
    cases,
    counts,
    unreachable: Object.entries(counts).filter(([, n]) => n === 0).map(([k]) => k),
    deterministic,
  };
}

/** Pick a flavour variant — callers supply randomness so the resolver stays pure. */
export function bonkFlavour(type: BonkType, roll: number): string {
  const list = TYPE_LABEL[type];
  return list[Math.floor(clamp01(roll) * list.length) % list.length];
}

/** Mass for a rider, from their loadout weight class. */
export function riderMass(bikeHeft: number, riderHeft: number): number {
  // 78kg baseline (rider + bike), scaled by build
  return 78 + bikeHeft * 0.28 + riderHeft * 0.22;
}

/** Should these two bodies be considered in contact at all? */
export function inContact(a: BonkBody, b: BonkBody): boolean {
  if (Math.abs(a.y - b.y) > 2.4) return false;
  const ds = Math.abs(a.s - b.s);
  const dx = Math.abs(a.x - b.x);
  return ds < 2.6 && dx < 1.9;
}

export const canBeBonked = (st: BikeState) =>
  st !== BikeState.CRASHING && st !== BikeState.FINISHED;

void isAirborne; void clamp;
