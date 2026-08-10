// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: CRASH SYSTEM
//
// A crash has to answer two questions instantly:
//   READABLE — "what did I do wrong?"  (cause-specific motion + callout)
//   FUNNY    — "do it again"           (overwrought physics, no real punishment)
//
// So each cause gets its own ragdoll profile rather than one shared tumble.
// Going over the bars pitches you forward over the front wheel; a side bonk
// barrel-rolls you sideways; falling off the track is a long silent drop.
// You can tell what happened from the silhouette alone.
//
// Pipeline: IMPACT -> RAGDOLL -> RECOVERY -> REMOUNT -> CONTINUE
// ---------------------------------------------------------------------------

export enum CrashCause {
  BAD_LANDING = 'BAD_LANDING',
  HIGH_SPEED = 'HIGH_SPEED',
  FAILED_TRICK = 'FAILED_TRICK',
  OFF_TRACK = 'OFF_TRACK',
  OBSTACLE = 'OBSTACLE',
  ATTACKED = 'ATTACKED',
}

export interface CrashProfile {
  /** headline, picked at random from the list */
  calls: string[];
  /** how long the ragdoll runs before recovery can begin (s) */
  duration: number;
  /** initial vertical impulse */
  pop: number;
  /** forward tumble rate (rad/s) — positive pitches over the bars */
  tumble: number;
  /** sideways barrel-roll rate (rad/s) */
  roll: number;
  /** yaw spin rate (rad/s) */
  spin: number;
  /** how far the rider slides after touching down */
  slide: number;
  /** bike separates from the rider and cartwheels off on its own */
  bikeEject: boolean;
  /** screen shake magnitude */
  shake: number;
  /** hit-stop duration (s) */
  hitStop: number;
  /** debris count */
  debris: number;
  /** slow motion on the first moment of impact */
  slowmo: number;
  colour: string;
}

/**
 * Cause-specific profiles. The numbers are chosen for legibility first:
 * each silhouette should be distinguishable at a glance and at speed.
 */
export const CRASH_PROFILES: Record<CrashCause, CrashProfile> = {
  [CrashCause.BAD_LANDING]: {
    calls: ['CASED IT!', 'HEAVY LANDING!', 'FOLDED IT!'],
    duration: 1.05, pop: 4.0, tumble: 6.5, roll: 1.2, spin: 2.0,
    slide: 0.7, bikeEject: false, shake: 1.15, hitStop: 0.09,
    debris: 26, slowmo: 0, colour: '#ff9500',
  },
  [CrashCause.HIGH_SPEED]: {
    // the big one: everything separates and keeps going
    calls: ['YARD SALE!', 'CARTWHEEL!', 'FULL SEND, FULL STOP'],
    duration: 1.45, pop: 7.5, tumble: 11.0, roll: 5.5, spin: 7.0,
    slide: 2.6, bikeEject: true, shake: 1.7, hitStop: 0.14,
    debris: 44, slowmo: 0.55, colour: '#ff2e88',
  },
  [CrashCause.FAILED_TRICK]: {
    // came down mid-rotation: keeps rotating into the dirt
    calls: ['DIDN\'T STICK IT!', 'OVER-COOKED!', 'ROTATION FAIL'],
    duration: 1.2, pop: 5.5, tumble: 9.0, roll: 3.5, spin: 9.5,
    slide: 1.2, bikeEject: true, shake: 1.25, hitStop: 0.10,
    debris: 32, slowmo: 0.35, colour: '#7ef7ff',
  },
  [CrashCause.OFF_TRACK]: {
    // long quiet fall — the joke is the silence
    calls: ['GONE!', 'SEE YOU DOWN THERE', 'WRONG WAY!'],
    duration: 1.3, pop: 1.0, tumble: 3.0, roll: 2.0, spin: 3.5,
    slide: 0.4, bikeEject: false, shake: 0.5, hitStop: 0.0,
    debris: 10, slowmo: 0, colour: '#9fd0ff',
  },
  [CrashCause.OBSTACLE]: {
    // dead stop: pitched straight over the front
    calls: ['OVER THE BARS!', 'FULL STOP!', 'ATE IT!'],
    duration: 1.15, pop: 6.0, tumble: 13.0, roll: 0.6, spin: 1.2,
    slide: 0.5, bikeEject: true, shake: 1.5, hitStop: 0.13,
    debris: 34, slowmo: 0.4, colour: '#ff4d4d',
  },
  [CrashCause.ATTACKED]: {
    // knocked sideways: barrel roll away from the hit
    calls: ['BONKED OFF!', 'TAKEN OUT!', 'MUGGED!'],
    duration: 1.1, pop: 4.5, tumble: 2.0, roll: 10.5, spin: 4.0,
    slide: 1.6, bikeEject: false, shake: 1.3, hitStop: 0.11,
    debris: 28, slowmo: 0.3, colour: '#ffd400',
  },
};

/** Per-limb secondary motion for a cause-readable silhouette. */
export interface RagdollLimbs {
  /** upper-arm euler (x/y/z) */
  armL: [number, number, number];
  armR: [number, number, number];
  foreL: number; // elbow fold (local X)
  foreR: number;
  legL: [number, number, number];
  legR: [number, number, number];
  shinL: number;
  shinR: number;
  headX: number;
  headY: number;
  /** flail rates (rad/s) for secondary sine */
  flailRate: number;
  flailAmp: number;
}

/** Live ragdoll state for one crashed rider. */
export interface Ragdoll {
  cause: CrashCause;
  /** counts UP from 0 */
  t: number;
  duration: number;
  /** accumulated rotations */
  pitch: number;
  roll: number;
  yaw: number;
  /** current angular rates, damped on ground contact */
  pitchV: number;
  rollV: number;
  yawV: number;
  /** has the rider hit the ground yet? */
  grounded: boolean;
  bounces: number;
  /** direction of the hit, for asymmetric profiles */
  dir: number;
  limbs: RagdollLimbs;
  /** ejected bike, animated separately */
  bike: {
    active: boolean;
    ox: number; oy: number; os: number;
    vx: number; vy: number; vs: number;
    spin: number; tumble: number;
  };
}

/** Cause-specific limb pose so the silhouette explains the crash. */
function limbsForCause(cause: CrashCause, dir: number): RagdollLimbs {
  const d = Math.sign(dir) || 1;
  switch (cause) {
    case CrashCause.OBSTACLE:
    case CrashCause.BAD_LANDING:
      // over the bars: arms reach forward, legs trail
      return {
        armL: [-1.4, 0.2 * d, 0.9], armR: [-1.4, -0.2 * d, -0.9],
        foreL: -0.9, foreR: -0.9,
        legL: [0.6, 0.15 * d, 0.25], legR: [0.55, -0.15 * d, -0.25],
        shinL: -0.5, shinR: -0.45,
        headX: 0.35, headY: 0,
        flailRate: 16, flailAmp: 1.1,
      };
    case CrashCause.ATTACKED:
      // barrel-roll: impact-side arm out, opposite tucks
      return {
        armL: d < 0 ? [-0.4, 0.8, 1.6] : [-0.6, 0.3, 0.5],
        armR: d > 0 ? [-0.4, -0.8, -1.6] : [-0.6, -0.3, -0.5],
        foreL: -0.5, foreR: -0.5,
        legL: [0.3, 0.4 * d, 0.5 * d], legR: [0.3, -0.4 * d, -0.5 * d],
        shinL: -0.35, shinR: -0.35,
        headX: 0.1, headY: -0.5 * d,
        flailRate: 18, flailAmp: 1.35,
      };
    case CrashCause.HIGH_SPEED:
      // yard sale: limbs splay wide
      return {
        armL: [-0.3, 0.5, 1.8], armR: [-0.3, -0.5, -1.8],
        foreL: -0.3, foreR: -0.3,
        legL: [0.8, 0.5, 0.7], legR: [0.8, -0.5, -0.7],
        shinL: -0.2, shinR: -0.2,
        headX: 0.2, headY: 0,
        flailRate: 20, flailAmp: 1.5,
      };
    case CrashCause.FAILED_TRICK:
      // mid-rotation: tucked then opens
      return {
        armL: [-0.9, 0.4, 0.7], armR: [-0.9, -0.4, -0.7],
        foreL: -1.2, foreR: -1.2,
        legL: [1.1, 0.2, 0.3], legR: [1.1, -0.2, -0.3],
        shinL: -1.0, shinR: -1.0,
        headX: 0.4, headY: 0.3 * d,
        flailRate: 14, flailAmp: 1.0,
      };
    case CrashCause.OFF_TRACK:
      // long fall: arms out for balance, legs hang
      return {
        armL: [-0.2, 0.3, 1.3], armR: [-0.2, -0.3, -1.3],
        foreL: -0.2, foreR: -0.2,
        legL: [0.15, 0.1, 0.15], legR: [0.15, -0.1, -0.15],
        shinL: -0.15, shinR: -0.15,
        headX: -0.15, headY: 0,
        flailRate: 8, flailAmp: 0.55,
      };
    default:
      return {
        armL: [-0.5, 0.2, 0.8], armR: [-0.5, -0.2, -0.8],
        foreL: -0.6, foreR: -0.6,
        legL: [0.4, 0.15, 0.2], legR: [0.4, -0.15, -0.2],
        shinL: -0.4, shinR: -0.4,
        headX: 0.15, headY: 0,
        flailRate: 15, flailAmp: 1.0,
      };
  }
}

export function startRagdoll(cause: CrashCause, dir: number): Ragdoll {
  const P = CRASH_PROFILES[cause];
  const jitter = () => (Math.random() * 2 - 1);
  return {
    cause,
    t: 0,
    duration: P.duration,
    pitch: 0, roll: 0, yaw: 0,
    pitchV: P.tumble * (0.8 + Math.random() * 0.4),
    rollV: P.roll * dir * (0.8 + Math.random() * 0.4),
    yawV: P.spin * (Math.random() < 0.5 ? -1 : 1) * (0.7 + Math.random() * 0.6),
    grounded: false,
    bounces: 0,
    dir,
    limbs: limbsForCause(cause, dir),
    bike: {
      active: P.bikeEject,
      ox: 0, oy: 0, os: 0,
      vx: dir * (2 + Math.random() * 4) + jitter() * 2,
      vy: P.pop * 0.75,
      vs: 3 + Math.random() * 6,
      spin: jitter() * 9,
      tumble: 5 + Math.random() * 8,
    },
  };
}

/**
 * Advance the ragdoll. Pure-ish: mutates the passed struct only.
 * `groundY` is the terrain height at the rider's current position.
 */
export function stepRagdoll(rd: Ragdoll, dt: number, bodyY: number, groundY: number) {
  rd.t += dt;

  // angular motion, heavily damped once sliding on the ground
  const damping = rd.grounded ? 3.4 : 0.35;
  const k = Math.exp(-damping * dt);
  rd.pitchV *= k; rd.rollV *= k; rd.yawV *= k;
  rd.pitch += rd.pitchV * dt;
  rd.roll += rd.rollV * dt;
  rd.yaw += rd.yawV * dt;

  // limb energy bleeds off on ground contact (arms stop windmilling)
  if (rd.grounded) {
    rd.limbs.flailAmp *= Math.exp(-2.8 * dt);
    // elbows/knees settle into a crumpled rest
    const settle = 1 - Math.exp(-3.2 * dt);
    rd.limbs.foreL += (-1.1 - rd.limbs.foreL) * settle;
    rd.limbs.foreR += (-1.1 - rd.limbs.foreR) * settle;
    rd.limbs.shinL += (-0.9 - rd.limbs.shinL) * settle;
    rd.limbs.shinR += (-0.9 - rd.limbs.shinR) * settle;
  } else {
    rd.limbs.flailAmp *= Math.exp(-0.15 * dt);
  }

  if (bodyY <= groundY + 0.05) {
    if (!rd.grounded) {
      rd.grounded = true;
      rd.bounces++;
      // impact jolt on first touchdown
      rd.limbs.flailAmp = Math.min(1.6, rd.limbs.flailAmp + 0.45);
    }
  } else {
    rd.grounded = false;
  }

  // ejected bike tumbles away on its own arc
  const b = rd.bike;
  if (b.active) {
    b.vy -= 30 * dt;
    b.ox += b.vx * dt;
    b.oy += b.vy * dt;
    b.os += b.vs * dt;
    b.vx *= Math.exp(-0.9 * dt);
    b.vs *= Math.exp(-0.9 * dt);
    b.spin += b.tumble * dt;
    if (b.oy < 0) {
      b.oy = 0;
      b.vy *= -0.34;
      b.vx *= 0.7; b.vs *= 0.7;
      b.tumble *= 0.6;
      if (Math.abs(b.vy) < 1.2) { b.vy = 0; b.tumble *= 0.2; }
    }
  }
}

/**
 * Sample limb pose for a frame. `time` is global clock for secondary motion.
 * Returns values ready to write onto the rig.
 */
export function sampleRagdollLimbs(rd: Ragdoll, time: number) {
  const L = rd.limbs;
  const fade = 1 - ragdollProgress(rd);
  const amp = L.flailAmp * fade * (rd.grounded ? 0.55 : 1);
  const w = time * L.flailRate;
  const s = Math.sin, c = Math.cos;
  return {
    armL: [
      L.armL[0] + s(w) * amp * 0.55,
      L.armL[1] + c(w * 0.7) * amp * 0.35,
      L.armL[2] + s(w + 0.8) * amp * 0.7,
    ] as [number, number, number],
    armR: [
      L.armR[0] + s(w + 2.1) * amp * 0.55,
      L.armR[1] + c(w * 0.7 + 1.2) * amp * 0.35,
      L.armR[2] + s(w + 2.9) * -amp * 0.7,
    ] as [number, number, number],
    foreL: L.foreL + c(w * 1.1) * amp * 0.35,
    foreR: L.foreR + c(w * 1.1 + 1.4) * amp * 0.35,
    legL: [
      L.legL[0] + s(w * 0.75 + 1) * amp * 0.5,
      L.legL[1],
      L.legL[2] + s(w * 0.6) * amp * 0.25,
    ] as [number, number, number],
    legR: [
      L.legR[0] + s(w * 0.75 + 3) * amp * 0.5,
      L.legR[1],
      L.legR[2] + s(w * 0.6 + 1.5) * amp * 0.25,
    ] as [number, number, number],
    shinL: L.shinL + s(w * 0.9 + 0.5) * amp * 0.25,
    shinR: L.shinR + s(w * 0.9 + 2.0) * amp * 0.25,
    headX: L.headX + s(w * 0.5) * amp * 0.3,
    headY: L.headY + c(w * 0.4) * amp * 0.25,
  };
}

/** 0..1 progress through the ragdoll. */
export const ragdollProgress = (rd: Ragdoll) => Math.min(1, rd.t / rd.duration);

/** Pick a callout. */
export function crashCall(cause: CrashCause, roll: number): string {
  const list = CRASH_PROFILES[cause].calls;
  return list[Math.floor(Math.max(0, Math.min(0.999, roll)) * list.length)];
}

/**
 * Classify a generic crash from context, so call sites don't have to
 * remember which cause to pass.
 */
export function classifyCrash(o: {
  speed: number; airTime: number; misaligned: boolean;
  offTrack: boolean; hitObstacle: boolean; hitByRider: boolean;
}): CrashCause {
  if (o.offTrack) return CrashCause.OFF_TRACK;
  if (o.hitByRider) return CrashCause.ATTACKED;
  if (o.hitObstacle) return o.speed > 26 ? CrashCause.HIGH_SPEED : CrashCause.OBSTACLE;
  if (o.airTime > 0.4 && o.misaligned) return CrashCause.FAILED_TRICK;
  if (o.speed > 30) return CrashCause.HIGH_SPEED;
  return CrashCause.BAD_LANDING;
}
