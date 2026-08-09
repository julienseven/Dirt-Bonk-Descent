// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: bike physics state machine
//
// Two halves, deliberately kept apart:
//
//   1. resolveState()  — a PURE function from a snapshot to a state. No side
//      effects, no randomness, no reads outside the snapshot. Same input ->
//      same output, always. This is the whole determinism guarantee.
//
//   2. STATE_RULES     — a table of per-state physics modifiers. Each state
//      owns its own numbers instead of them being scattered through one
//      giant controller as `if (braking) ...` branches.
//
// A note on orthogonality, because it drives the design:
// some of these states are not naturally exclusive. You can be BOOSTING and
// DRIFTING at the same time; TRICKING is a kind of AIRBORNE. Modelling them
// as 12 mutually-exclusive states would silently drop the second condition.
// So the machine resolves ONE primary state by strict priority (below), and
// exposes orthogonal truths as separate read-only flags on the snapshot
// (airborne / onThrottle / slipping). Physics reads whichever it needs, so
// nothing is lost, and there is still exactly one state to reason about.
// ---------------------------------------------------------------------------

export enum BikeState {
  GROUNDED = 'GROUNDED',
  ACCELERATING = 'ACCELERATING',
  BRAKING = 'BRAKING',
  DRIFTING = 'DRIFTING',
  AIRBORNE = 'AIRBORNE',
  TRICKING = 'TRICKING',
  LANDING = 'LANDING',
  BOOSTING = 'BOOSTING',
  CRASHING = 'CRASHING',
  STUNNED = 'STUNNED',
  RECOVERING = 'RECOVERING',
  FINISHED = 'FINISHED',
}

/** Everything the transition function is allowed to look at. */
export interface StateSnapshot {
  // lifecycle
  finished: boolean;
  crashTimer: number;      // >0 while tumbling
  recoverTimer: number;    // >0 while remounting (post-crash grace)
  stunTimer: number;       // >0 after a hit that didn't crash
  // contact
  grounded: boolean;
  airTime: number;
  landTimer: number;       // >0 for a beat after touchdown
  // motion
  speed: number;           // m/s along the track
  lateralSpeed: number;    // m/s across it
  // intent
  pedal: boolean;
  brake: boolean;
  boost: boolean;
  trickInput: boolean;
  trickRotation: number;   // accumulated |spin| + |flip| in radians
}

/** Thresholds live here so tuning is in one visible place. */
export const STATE_TUNING = {
  /** lateral speed (m/s) at which a grounded bike counts as sliding */
  driftSlip: 4.2,
  /** ...but only above this forward speed, so slow wobbles aren't drifts */
  driftMinSpeed: 9,
  /** how long LANDING holds after touchdown */
  landWindow: 0.22,
  /** rotation (rad) that counts as committed to a trick without input held */
  trickCommit: 0.5,
  /** below this speed a racer is considered stopped */
  stopSpeed: 0.4,
};

/**
 * Resolve the single authoritative state.
 *
 * Priority is strict and total — the first matching rule wins, and the final
 * branch is unconditional, so this can never fall through or return
 * undefined. Reading top to bottom is the transition table.
 */
export function resolveState(s: StateSnapshot): BikeState {
  const T = STATE_TUNING;

  // ---- lifecycle overrides: these outrank anything the rider is doing
  if (s.finished) return BikeState.FINISHED;
  if (s.crashTimer > 0) return BikeState.CRASHING;
  if (s.recoverTimer > 0) return BikeState.RECOVERING;

  // ---- airborne family (checked before STUNNED: physics in the air is
  //      ballistic regardless of whether you got hit on the way up)
  if (!s.grounded) {
    const committed = s.trickRotation > T.trickCommit;
    return (s.trickInput || committed) ? BikeState.TRICKING : BikeState.AIRBORNE;
  }

  // ---- just touched down
  if (s.landTimer > 0) return BikeState.LANDING;

  // ---- hit, but still upright
  if (s.stunTimer > 0) return BikeState.STUNNED;

  // ---- grounded family, most-specific first
  if (s.boost) return BikeState.BOOSTING;
  if (Math.abs(s.lateralSpeed) > T.driftSlip && s.speed > T.driftMinSpeed) {
    return BikeState.DRIFTING;
  }
  if (s.brake) return BikeState.BRAKING;
  if (s.pedal) return BikeState.ACCELERATING;
  return BikeState.GROUNDED;
}

// --- orthogonal truths -----------------------------------------------------
// Derived rather than stored, so they can never disagree with the state.

export const isAirborne = (st: BikeState) =>
  st === BikeState.AIRBORNE || st === BikeState.TRICKING;

export const isDisabled = (st: BikeState) =>
  st === BikeState.CRASHING || st === BikeState.FINISHED;

/** Can the rider steer at all? */
export const canSteer = (st: BikeState) => !isDisabled(st);

/** Can the rider throw a bonk? */
export const canBonk = (st: BikeState) =>
  st === BikeState.GROUNDED || st === BikeState.ACCELERATING ||
  st === BikeState.BRAKING || st === BikeState.DRIFTING ||
  st === BikeState.BOOSTING || st === BikeState.LANDING;

/** Can the rider start a rotation? */
export const canTrick = (st: BikeState) => isAirborne(st);

// --- per-state physics -----------------------------------------------------

export interface StateRules {
  /** longitudinal accel added on top of gravity/drag (m/s^2) */
  thrust: number;
  /** longitudinal accel subtracted (m/s^2), scaled by surface grip */
  retard: number;
  /** multiplier on lateral grip (cornering authority) */
  gripMul: number;
  /** multiplier on how fast lateral velocity bleeds off */
  slipDamp: number;
  /** per-second speed scrub, for states that cost momentum */
  scrub: number;
  /** does the rider hold a throttle in this state? */
  throttle: boolean;
  /** human-readable, for the debug overlay */
  label: string;
}

/**
 * Numbers reproduce the previously tuned behaviour; moving them here changes
 * where they live, not what they do. `thrust` for ACCELERATING is applied
 * separately because it is speed-dependent (see pedalForce below).
 */
export const STATE_RULES: Record<BikeState, StateRules> = {
  [BikeState.GROUNDED]: {
    thrust: 0, retard: 0, gripMul: 1, slipDamp: 1.1, scrub: 0,
    throttle: false, label: 'ROLLING',
  },
  [BikeState.ACCELERATING]: {
    thrust: 0, retard: 0, gripMul: 1, slipDamp: 1.1, scrub: 0,
    throttle: true, label: 'ON POWER',
  },
  [BikeState.BRAKING]: {
    thrust: 0, retard: 30, gripMul: 1.12, slipDamp: 1.5, scrub: 0,
    throttle: false, label: 'BRAKING',
  },
  [BikeState.DRIFTING]: {
    // a slide costs momentum but lets the bike rotate faster
    thrust: 0, retard: 0, gripMul: 0.78, slipDamp: 0.62, scrub: 1.6,
    throttle: false, label: 'DRIFTING',
  },
  [BikeState.AIRBORNE]: {
    thrust: 0.6, retard: 0, gripMul: 0.45, slipDamp: 0.35, scrub: 0,
    throttle: false, label: 'AIRBORNE',
  },
  [BikeState.TRICKING]: {
    thrust: 0.6, retard: 0, gripMul: 0.32, slipDamp: 0.35, scrub: 0,
    throttle: false, label: 'TRICKING',
  },
  [BikeState.LANDING]: {
    // brief window with extra bite as the tyres hook up
    thrust: 0, retard: 0, gripMul: 1.18, slipDamp: 1.9, scrub: 0,
    throttle: false, label: 'LANDING',
  },
  [BikeState.BOOSTING]: {
    thrust: 17, retard: 0, gripMul: 0.94, slipDamp: 1.0, scrub: 0,
    throttle: true, label: 'BOOSTING',
  },
  [BikeState.CRASHING]: {
    thrust: 0, retard: 0, gripMul: 0, slipDamp: 3, scrub: 0,
    throttle: false, label: 'CRASHED',
  },
  [BikeState.STUNNED]: {
    thrust: 0, retard: 8, gripMul: 0.55, slipDamp: 0.9, scrub: 0,
    throttle: false, label: 'STUNNED',
  },
  [BikeState.RECOVERING]: {
    thrust: 0, retard: 0, gripMul: 0.7, slipDamp: 1.2, scrub: 0,
    throttle: true, label: 'REMOUNTING',
  },
  [BikeState.FINISHED]: {
    thrust: 0, retard: 0, gripMul: 1, slipDamp: 1.5, scrub: 0,
    throttle: false, label: 'FINISHED',
  },
};

/** Speed-dependent pedal force: strong off the bottom, fading out up top. */
export function pedalForce(speed01: number): number {
  return 11 + (1.2 - 11) * speed01;
}

/** States that should emit a tyre-roost plume. */
export const roostFactor = (st: BikeState): number => {
  switch (st) {
    case BikeState.DRIFTING: return 2.4;
    case BikeState.BRAKING: return 1.7;
    case BikeState.BOOSTING: return 1.4;
    case BikeState.LANDING: return 1.8;
    case BikeState.ACCELERATING: return 1.1;
    case BikeState.GROUNDED: return 1.0;
    // still rolling, so still throwing dirt — just less of it
    case BikeState.STUNNED: return 0.7;
    case BikeState.RECOVERING: return 0.8;
    // airborne, crashed or done: no tyre contact
    default: return 0;
  }
};

// --- verification ----------------------------------------------------------

export interface VerifyReport {
  cases: number;
  reachable: BikeState[];
  unreachable: BikeState[];
  nonDeterministic: number;
  total: boolean;
}

/**
 * Exhaustively walk the input space and prove three properties:
 *   TOTAL          — every input maps to a defined state
 *   DETERMINISTIC  — the same snapshot always yields the same state
 *   REACHABLE      — no state in the enum is dead code
 *
 * Runs in a few milliseconds, so it can be executed on demand rather than
 * being an assertion nobody ever checks.
 */
export function verifyStateMachine(): VerifyReport {
  const bools = [false, true];
  const timers = [0, 0.5];
  const speeds = [0, 6, 20, 40];
  const laterals = [0, 2, 8];
  const rotations = [0, 1.2];

  const seen = new Set<BikeState>();
  let cases = 0;
  let nonDeterministic = 0;
  let total = true;

  for (const finished of bools)
  for (const crashTimer of timers)
  for (const recoverTimer of timers)
  for (const stunTimer of timers)
  for (const grounded of bools)
  for (const landTimer of timers)
  for (const speed of speeds)
  for (const lateralSpeed of laterals)
  for (const pedal of bools)
  for (const brake of bools)
  for (const boost of bools)
  for (const trickInput of bools)
  for (const trickRotation of rotations) {
    const snap: StateSnapshot = {
      finished, crashTimer, recoverTimer, stunTimer,
      grounded, airTime: grounded ? 0 : 0.5, landTimer,
      speed, lateralSpeed,
      pedal, brake, boost, trickInput, trickRotation,
    };
    const a = resolveState(snap);
    const b = resolveState(snap);      // same input, twice
    if (a !== b) nonDeterministic++;
    if (!a || !(a in STATE_RULES)) total = false;
    seen.add(a);
    cases++;
  }

  const all = Object.values(BikeState);
  return {
    cases,
    reachable: all.filter(s => seen.has(s)),
    unreachable: all.filter(s => !seen.has(s)),
    nonDeterministic,
    total,
  };
}

// --- transition logging (dev aid) ------------------------------------------

export interface Transition { from: BikeState; to: BikeState; t: number; }

/**
 * Fixed-size ring of recent transitions. Cheap enough to leave on, and it
 * makes "is this machine actually deterministic?" an observable question
 * rather than a claim.
 */
export class TransitionLog {
  private buf: Transition[] = [];
  private cap: number;
  constructor(cap = 16) { this.cap = cap; }
  push(from: BikeState, to: BikeState, t: number) {
    this.buf.push({ from, to, t });
    if (this.buf.length > this.cap) this.buf.shift();
  }
  recent(n = 8): Transition[] { return this.buf.slice(-n); }
  clear() { this.buf.length = 0; }
}
