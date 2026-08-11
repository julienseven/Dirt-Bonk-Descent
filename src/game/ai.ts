// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: AI personalities & difficulty
//
// Two orthogonal axes, deliberately kept separate:
//
//   PERSONALITY — *what kind of rider* this is. Fixed per character.
//   DIFFICULTY  — *how good they are at being it*. Set by the player.
//
// Crossing them is what stops races feeling scripted: the BONKER is always
// the one who comes for you, but on ROOKIE he telegraphs it and misses, and
// on ABSURD he times it for the moment you're mid-corner and committed.
//
// Difficulty deliberately does NOT scale raw speed much (see SKILL, below).
// It scales decision quality: line choice, shortcut nerve, overtaking,
// combat timing, risk management, recovery and trick usage.
// ---------------------------------------------------------------------------

import { clamp, clamp01, RNG } from './core';

export type PersonalityId =
  | 'speedfreak' | 'bonker' | 'showoff' | 'coward' | 'chaos' | 'allround';

export interface Personality {
  id: PersonalityId;
  name: string;
  tag: string;
  blurb: string;
  colour: string;

  // ---- behavioural weights, 0..1 unless noted ------------------------
  /** commitment to the geometrically fastest line */
  lineDiscipline: number;
  /** willingness to leave the tape for a shortcut */
  shortcutNerve: number;
  /** how often they swing at a neighbour */
  aggression: number;
  /** how much they enjoy hitting the *player* specifically */
  playerFocus: number;
  /** chance of throwing a trick off any given jump */
  trickAppetite: number;
  /** how hard they brake for hazards; high = timid */
  caution: number;
  /** willingness to carry speed into blind sections */
  sendiness: number;
  /** random steering wander, in half-widths */
  erratic: number;
  /** how quickly they get going again after a crash */
  recovery: number;
  /** multiplier on their speed ceiling — kept near 1 on purpose */
  paceBias: number;
}

export const PERSONALITIES: Record<PersonalityId, Personality> = {
  speedfreak: {
    id: 'speedfreak', name: 'SPEED FREAK', tag: 'THE LINE',
    blurb: 'Takes the fastest line through everything and never looks sideways.',
    colour: '#7ef7ff',
    lineDiscipline: 1.0, shortcutNerve: 0.75, aggression: 0.12, playerFocus: 0.1,
    trickAppetite: 0.05, caution: 0.25, sendiness: 0.9, erratic: 0.05,
    recovery: 0.7, paceBias: 1.05,
  },
  bonker: {
    id: 'bonker', name: 'THE BONKER', tag: 'CONTACT SPORT',
    blurb: 'Treats every rider in reach as a target. Racing is secondary.',
    colour: '#ff2e88',
    lineDiscipline: 0.45, shortcutNerve: 0.35, aggression: 1.0, playerFocus: 0.95,
    trickAppetite: 0.1, caution: 0.2, sendiness: 0.75, erratic: 0.3,
    recovery: 0.85, paceBias: 0.97,
  },
  showoff: {
    id: 'showoff', name: 'THE SHOWOFF', tag: 'STYLE FIRST',
    blurb: 'Sends everything, spins everything, occasionally forgets to win.',
    colour: '#ffd400',
    lineDiscipline: 0.5, shortcutNerve: 0.6, aggression: 0.3, playerFocus: 0.25,
    trickAppetite: 1.0, caution: 0.15, sendiness: 1.0, erratic: 0.35,
    recovery: 0.6, paceBias: 0.95,
  },
  coward: {
    id: 'coward', name: 'THE COWARD', tag: 'SELF-PRESERVATION',
    blurb: 'Brakes early, avoids the rough, and somehow keeps finishing.',
    colour: '#9fd0ff',
    lineDiscipline: 0.7, shortcutNerve: 0.05, aggression: 0.05, playerFocus: 0.05,
    trickAppetite: 0.02, caution: 1.0, sendiness: 0.25, erratic: 0.1,
    recovery: 0.5, paceBias: 0.93,
  },
  chaos: {
    id: 'chaos', name: 'CHAOS AGENT', tag: 'NO PLAN',
    blurb: 'Nobody knows what this one is doing. Including this one.',
    colour: '#c0f000',
    lineDiscipline: 0.3, shortcutNerve: 0.8, aggression: 0.6, playerFocus: 0.5,
    trickAppetite: 0.6, caution: 0.3, sendiness: 0.85, erratic: 1.0,
    recovery: 0.75, paceBias: 1.0,
  },
  allround: {
    id: 'allround', name: 'THE PRO', tag: 'NO WEAKNESS',
    blurb: 'Quietly competent at everything. Usually still there at the bottom.',
    colour: '#f2f2f2',
    lineDiscipline: 0.85, shortcutNerve: 0.5, aggression: 0.45, playerFocus: 0.4,
    trickAppetite: 0.35, caution: 0.5, sendiness: 0.65, erratic: 0.15,
    recovery: 0.8, paceBias: 1.0,
  },
};

export const PERSONALITY_LIST = Object.values(PERSONALITIES);

// ---------------------------------------------------------------------------
// DIFFICULTY
// ---------------------------------------------------------------------------

export type AiTier = 'rookie' | 'rider' | 'pro' | 'absurd';

export interface TierDef {
  id: AiTier;
  name: string;
  blurb: string;
  colour: string;

  /**
   * Speed ceiling in m/s. Rookie→absurd is ~15% (~39→45). Difficulty still
   * comes mostly from decisions (line, combat, reaction), but the cap must
   * sit near a tucked player or pure speed makes every race a free win.
   */
  cap: number;
  /** per-rider spread within the field, so the pack isn't uniform */
  spread: number;

  // ---- competence multipliers ----------------------------------------
  /** how accurately they hit the apex (0..1 of their personality's ability) */
  lineQuality: number;
  /** how close to the true corner limit they carry speed */
  cornerCommit: number;
  /** willingness + success rate on shortcuts */
  shortcutSkill: number;
  /** how well they pick overtaking moments */
  overtaking: number;
  /** bonk timing and follow-through */
  combatSkill: number;
  /** how well they avoid hazards and manage crash risk */
  riskManagement: number;
  /** how fast they remount and rebuild speed */
  recoverySkill: number;
  /** how often and how ambitiously they trick */
  trickSkill: number;
  /** reaction delay in seconds — the honest way to make AI beatable */
  reaction: number;
  /** how much the rubber band helps them */
  bandK: number;
}

export const AI_TIERS: Record<AiTier, TierDef> = {
  // Caps sit just under a competent tucked player (~34-37 m/s). The soft
  // player ceiling is SOFT_CAP (39); tier spacing is ~1.5-2 m/s so each
  // difficulty is a real fight rather than a free win on pure speed.
  // Validated by ?tune: PRO/GOOD ≈ 50%, SAVAGE/EXPERT ≈ 80%, CASUAL loses above ROOKIE.
  rookie: {
    id: 'rookie', name: 'ROOKIE',
    blurb: 'Learning the mountain. Wide lines, early brakes, slow to recover.',
    colour: '#7ef7c8',
    cap: 32.5, spread: 0.055,
    lineQuality: 0.45, cornerCommit: 0.70, shortcutSkill: 0.10,
    overtaking: 0.25, combatSkill: 0.25, riskManagement: 0.35,
    recoverySkill: 0.35, trickSkill: 0.20, reaction: 0.42, bandK: 0.35,
  },
  rider: {
    id: 'rider', name: 'RIDER',
    blurb: 'Knows the lines. Will take a shortcut if it is obvious.',
    colour: '#ffd400',
    cap: 34.4, spread: 0.05,
    lineQuality: 0.68, cornerCommit: 0.82, shortcutSkill: 0.40,
    overtaking: 0.50, combatSkill: 0.50, riskManagement: 0.58,
    recoverySkill: 0.58, trickSkill: 0.45, reaction: 0.26, bandK: 0.8,
  },
  pro: {
    id: 'pro', name: 'PRO',
    blurb: 'Hits every apex, poaches every line, and punishes mistakes.',
    colour: '#ff9500',
    cap: 35.6, spread: 0.045,
    lineQuality: 0.88, cornerCommit: 0.93, shortcutSkill: 0.75,
    overtaking: 0.78, combatSkill: 0.78, riskManagement: 0.80,
    recoverySkill: 0.80, trickSkill: 0.70, reaction: 0.14, bandK: 1.05,
  },
  absurd: {
    id: 'absurd', name: 'ABSURD',
    blurb: 'Perfect lines, every shortcut, and it hits you when it hurts most.',
    colour: '#ff2e88',
    cap: 37.3, spread: 0.04,
    lineQuality: 1.0, cornerCommit: 1.0, shortcutSkill: 1.0,
    overtaking: 1.0, combatSkill: 1.0, riskManagement: 0.95,
    recoverySkill: 1.0, trickSkill: 0.95, reaction: 0.06, bandK: 1.3,
  },
};

export const TIER_LIST = Object.values(AI_TIERS);

// ---------------------------------------------------------------------------
// Resolved per-rider brain
// ---------------------------------------------------------------------------

/** Personality x tier, flattened into the numbers the controller reads. */
export interface AiBrain {
  p: Personality;
  tier: TierDef;
  /** speed ceiling, m/s */
  cap: number;
  /** apex-seeking accuracy, 0..1 */
  line: number;
  /** cornering grip they believe they have */
  cornerGrip: number;
  /** 0..1 chance of committing to a shortcut they can see */
  shortcut: number;
  /** swing probability per second when a target is in range */
  swingRate: number;
  /** bias toward hitting the player over other rivals */
  playerFocus: number;
  /** chance of tricking off a given lip */
  trick: number;
  /** brake-early factor for hazards */
  caution: number;
  /** lateral wander amplitude */
  wander: number;
  /** seconds of input delay */
  reaction: number;
  /** crash recovery speed multiplier */
  recovery: number;
  /** rubber band strength */
  bandK: number;
}

export function makeBrain(p: Personality, tier: TierDef, rng: RNG, index: number): AiBrain {
  const spread = (index - 2.5) * tier.spread;
  return {
    p, tier,
    cap: (tier.cap + spread * 10) * p.paceBias + rng.range(-0.4, 0.4),

    // Competence gates personality. A SPEED FREAK on ROOKIE *wants* the
    // perfect line and can't execute it; on ABSURD he nails it every time.
    line: clamp01(p.lineDiscipline * tier.lineQuality),
    cornerGrip: 13 + tier.cornerCommit * 11 + p.sendiness * 3,
    shortcut: clamp01(p.shortcutNerve * tier.shortcutSkill),
    swingRate: p.aggression * (0.5 + tier.combatSkill * 1.7),
    playerFocus: clamp01(p.playerFocus * (0.4 + tier.overtaking * 0.8)),
    trick: clamp01(p.trickAppetite * tier.trickSkill),
    // a cautious rider brakes earlier; good risk management means braking
    // early for real hazards rather than for everything
    caution: p.caution * (0.5 + (1 - tier.riskManagement) * 0.9),
    wander: p.erratic * (1.3 - tier.lineQuality * 0.8),
    reaction: tier.reaction * (0.7 + p.erratic * 0.6),
    recovery: 0.55 + p.recovery * 0.45 * (0.5 + tier.recoverySkill * 0.8),
    bandK: tier.bandK,
  };
}

/** Assign personalities so a field always contains contrasting characters. */
export function buildField(count: number, tier: TierDef, seed = 99): AiBrain[] {
  const rng = new RNG(seed);
  // guarantee the memorable four appear first, then fill
  const order: PersonalityId[] =
    ['bonker', 'speedfreak', 'showoff', 'coward', 'chaos', 'allround'];
  const out: AiBrain[] = [];
  for (let i = 0; i < count; i++) {
    const id = order[i % order.length];
    out.push(makeBrain(PERSONALITIES[id], tier, rng, i));
  }
  return out;
}

/**
 * Chaos agents re-roll their intent periodically. Returns a multiplier set
 * that swings their behaviour around without changing their identity.
 */
export function chaosRoll(rng: RNG): { line: number; swing: number; send: number } {
  const mood = rng.next();
  if (mood < 0.25) return { line: 0.2, swing: 2.2, send: 1.3 };   // menace
  if (mood < 0.5) return { line: 1.4, swing: 0.3, send: 1.2 };    // focused
  if (mood < 0.75) return { line: 0.6, swing: 0.8, send: 0.5 };   // dawdling
  return { line: 0.9, swing: 1.4, send: 1.6 };                    // unhinged
}

/**
 * Save-file difficulty id -> AI tier. Named "legacy" because the save format
 * predates the four-tier table and still stores the old ids. Unknown values
 * fall back to 'pro', which is what saves written before RIDER existed hold.
 */
export const tierFromLegacy = (d: string): AiTier =>
  d === 'chill' ? 'rookie'
  : d === 'rider' ? 'rider'
  : d === 'savage' ? 'absurd'
  : 'pro';

// ---------------------------------------------------------------------------
// Pure rival controller (planning only — no scene graph / audio / FX)
//
// game.ts samples the world, calls planRivalThink / planRivalCombat, then
// applies the returned intents via stepRacer + resolveContact.
// ---------------------------------------------------------------------------

/** Minimal obstacle slice the planner needs. */
export interface AiObstacle {
  s: number;
  x: number;
  r: number;
  hit: number;
  gone: boolean;
  mass: number;
  /** 'surface' | 'launch' | other — surface/launch are not steered around */
  reaction: string;
}

export interface AiShortcut {
  s0: number;
  s1: number;
  side: number;
  width: number;
}

export interface AiNeighbour {
  s: number;
  x: number;
  y: number;
  grounded: boolean;
  vx: number;
  isPlayer: boolean;
  finished: boolean;
  crash: number;
  /** stable index into the caller's racer list */
  index: number;
}

export interface RivalPlanState {
  s: number;
  x: number;
  v: number;
  vx: number;
  y: number;
  grounded: boolean;
  airTime: number;
  crash: number;
  stun: number;
  finished: boolean;
  skill: number;
  corner: number;
  aggression: number;
  aiOffset: number;
  aiSeed: number;
  aiSteer: number;
  wantSteer: number;
  aiHopCd: number;
  scCommit: number;
  trickSpin: number;
  mood: { line: number; swing: number; send: number };
  moodCd: number;
  brain: AiBrain | null;
}

export interface RivalWorldSample {
  halfWidth: number;
  curvAhead: number;
  playerS: number;
  playerX: number;
  raceTime: number;
  time: number;
  combatZone: boolean;
  modeAggression: number;
  /** rubber-band scale from save difficulty */
  bandK: number;
  skillMin: number;
  skillMax: number;
  obstacles: AiObstacle[];
  /** first index where o.s >= rival.s + 2 (caller may pass full list) */
  firstObstacle: number;
  nearestShortcut: AiShortcut | null;
  neighbours: AiNeighbour[];
  dt: number;
  /** 0..1 rng samples — caller supplies so pure code stays deterministic */
  rng: () => number;
}

export interface RivalControlIntent {
  steer: number;
  pedal: boolean;
  brake: boolean;
  tuck: boolean;
  hop: boolean;
  /** updated cached plan fields to write back on the racer */
  aiSteer: number;
  wantSteer: number;
  aiPedal: boolean;
  aiBrake: boolean;
  aiTuck: boolean;
  aiCap: number;
  aiHopCd: number;
  scCommit: number;
  trickSpin: number;
  mood: { line: number; swing: number; send: number };
  moodCd: number;
  skill: number;
}

export interface RivalCombatIntent {
  /** neighbour index to swing at, or -1 */
  targetIndex: number;
  bonkDir: number;
  /** cooldown to write if a swing was chosen */
  bonkCd: number;
}

/**
 * Plan one rival frame: line, speed, hop, tricks. Pure — no mutation of
 * external objects beyond returning the next state snapshot.
 */
export function planRivalThink(
  r: RivalPlanState,
  w: RivalWorldSample,
): RivalControlIntent {
  const B = r.brain;
  const hw = w.halfWidth;
  const curvAhead = w.curvAhead;

  // ---- CHAOS AGENT mood -------------------------------------------------
  let mood = r.mood;
  let moodCd = r.moodCd - w.dt;
  if (B && B.p.id === 'chaos' && moodCd <= 0) {
    moodCd = 1.6 + w.rng() * 2.8;
    const m = w.rng();
    if (m < 0.25) mood = { line: 0.2, swing: 2.2, send: 1.3 };
    else if (m < 0.5) mood = { line: 1.4, swing: 0.3, send: 1.2 };
    else if (m < 0.75) mood = { line: 0.6, swing: 0.8, send: 0.5 };
    else mood = { line: 0.9, swing: 1.4, send: 1.6 };
  }
  const moodLine = B?.p.id === 'chaos' ? mood.line : 1;

  // ---- LINE ------------------------------------------------------------
  const apex = Math.sign(curvAhead) * Math.min(hw * 0.55, Math.abs(curvAhead) * 2200);
  const quality = clamp01((B ? B.line : r.corner) * moodLine);
  let targetX = apex * quality;
  targetX += r.aiOffset * hw * 0.55 * (1 - quality * 0.6);
  const wander = B ? B.wander : (1.6 - r.corner);
  targetX += Math.sin(w.time * 0.7 + r.aiSeed) * hw * 0.12 * wander;

  // ---- SHORTCUTS -------------------------------------------------------
  let scCommit = r.scCommit;
  if (B) {
    if (scCommit > 0) {
      scCommit -= w.dt;
      const sc = w.nearestShortcut;
      if (sc) targetX = sc.side * (hw + sc.width * 0.5);
    } else {
      const sc = w.nearestShortcut;
      if (sc && sc.s0 - r.s > 4 && sc.s0 - r.s < 26 && w.rng() < B.shortcut * w.dt * 3) {
        scCommit = (sc.s1 - r.s) / Math.max(8, r.v) + 0.5;
      }
    }
  }

  // ---- OBSTACLES -------------------------------------------------------
  const obs = w.obstacles;
  for (let i = w.firstObstacle; i < obs.length; i++) {
    const o = obs[i];
    if (o.s - r.s > 34) break;
    if (o.hit > 0 || o.gone) continue;
    if (o.reaction === 'surface' || o.reaction === 'launch') continue;
    if (Math.abs(o.x - targetX) < o.r + 1.4) {
      targetX += (targetX > o.x ? 1 : -1) * (o.r + 2.2);
    }
  }

  // ---- COMBAT ZONE: hunt player line -----------------------------------
  if (w.combatZone) {
    const dp = w.playerS - r.s;
    if (Math.abs(dp) < 26) {
      targetX = targetX + (w.playerX - targetX) * (0.55 * r.aggression);
    }
  }

  targetX = clamp(targetX, scCommit > 0 ? -hw * 2 : -hw * 0.86,
    scCommit > 0 ? hw * 2 : hw * 0.86);
  const rawSteer = clamp((targetX - r.x) * 0.42 - r.vx * 0.18, -1, 1);
  const wantSteer = rawSteer;
  const react = B ? B.reaction : 0.2;
  const steer = react > 0.01
    ? dampLocal(r.aiSteer, wantSteer, 1 / Math.max(0.02, react), w.dt)
    : rawSteer;

  // ---- RUBBER BAND + SPEED CAP -----------------------------------------
  const rel = w.playerS - r.s;
  const bk = B ? B.bandK : w.bandK;
  const band2 = clamp(rel * 0.0024 * bk, -0.10 * bk, 0.15 * bk);
  const skill = clamp(r.skill + band2, w.skillMin, w.skillMax);
  const aiCap = B ? B.cap * (1 + band2 * 0.5) : 20.5 + skill * 12.5;
  const early = w.raceTime < 28
    ? 1 - clamp01(w.raceTime / 28) * 0.35
    : 1;
  const wantSpeed = aiCap * (0.88 + early * 0.12);
  const grip = B ? B.cornerGrip : 15 + r.corner * 9;
  const cornerLimit = Math.abs(curvAhead) > 0.0002
    ? Math.sqrt(grip / Math.abs(curvAhead)) : 999;
  const caution = B ? B.caution : 0.5;
  const hazardAhead = aiHazardInPath(r.s, r.x, 12 + r.v * 0.9, obs, w.firstObstacle);
  const brakeFor = hazardAhead ? caution * 0.35 : 0;
  const pedal = r.v < wantSpeed * (1 - brakeFor);
  const brake = (r.v > Math.min(wantSpeed * 1.1, cornerLimit * (1 - caution * 0.12))
    && Math.abs(curvAhead) > 0.008) || (hazardAhead && caution > 0.6);
  const tuck = !brake && Math.abs(curvAhead) < 0.005 && r.v > 18;

  // ---- TRICKS (hop is planRivalHop — needs terrain height from engine) --
  let trickSpin = r.trickSpin;
  if (!r.grounded && r.airTime > 0.22 && B && trickSpin === 0) {
    if (w.rng() < B.trick) {
      trickSpin = (w.rng() < 0.5 ? -1 : 1) * (2 + B.tier.trickSkill * 7);
    }
  }
  if (r.grounded) trickSpin = 0;

  return {
    steer, pedal, brake, tuck, hop: false,
    aiSteer: steer, wantSteer, aiPedal: pedal, aiBrake: brake, aiTuck: tuck,
    aiCap, aiHopCd: r.aiHopCd - w.dt, scCommit, trickSpin, mood, moodCd, skill,
  };
}

/** Lip hop decision — pure. `deltaH` = height at s+6 minus height at s. */
export function planRivalHop(
  grounded: boolean,
  aiHopCd: number,
  sendiness: number,
  deltaH: number,
  rng: () => number,
): { hop: boolean; aiHopCd: number } {
  let cd = aiHopCd;
  if (!grounded || cd > 0) return { hop: false, aiHopCd: Math.max(0, cd) };
  if (deltaH > 0.9 && rng() < sendiness) {
    return { hop: true, aiHopCd: 0.8 };
  }
  return { hop: false, aiHopCd: cd };
}

/**
 * Combat swing pick — pure. Returns who to bonk (or -1).
 * Caller owns bonkCd countdown; only call when bonkCd <= 0 and crash/stun clear.
 */
export function planRivalCombat(
  r: RivalPlanState,
  w: RivalWorldSample,
  bonkCd: number,
): RivalCombatIntent {
  if (bonkCd > 0 || r.crash > 0 || r.stun > 0) {
    return { targetIndex: -1, bonkDir: 0, bonkCd };
  }
  const B = r.brain;
  const moodSwing = B?.p.id === 'chaos' ? r.mood.swing : 1;
  const earlyFight = w.raceTime < 35 ? 1.45 : 1;
  const arena = (w.combatZone ? 2.3 : 1) * earlyFight;
  const modeK = w.modeAggression;

  for (const other of w.neighbours) {
    if (other.crash > 0 || other.finished) continue;
    const ds = other.s - r.s, dx = other.x - r.x;
    if (Math.abs(ds) > 3.4 || Math.abs(dx) > 3.6) continue;
    if (Math.abs(other.y - r.y) > 2.4) continue;
    const spite = other.s > r.s ? 1.5 : 0.7;
    const focus = other.isPlayer ? 1 + (B ? B.playerFocus * 2.2 : 0) : 1;
    const vulnerable = (!other.grounded || Math.abs(other.vx) > 5) ? 1.8 : 1;
    const timing = B ? 1 + (vulnerable - 1) * B.tier.combatSkill : 1;
    const rate = (B ? B.swingRate : r.aggression)
      * spite * arena * modeK * focus * timing * moodSwing;
    if (w.rng() < rate * w.dt * 1.6) {
      return {
        targetIndex: other.index,
        bonkDir: Math.sign(dx) || 1,
        bonkCd: 1.6,
      };
    }
  }
  return { targetIndex: -1, bonkDir: 0, bonkCd };
}

/** Solid hazard in path within reach (mass ≥ 100). */
export function aiHazardInPath(
  s: number, x: number, reach: number,
  obs: AiObstacle[], first: number,
): boolean {
  for (let i = first; i < obs.length; i++) {
    const o = obs[i];
    if (o.s - s > reach) break;
    if (o.gone || o.mass < 100) continue;
    if (Math.abs(o.x - x) < o.r + 1.2) return true;
  }
  return false;
}

function dampLocal(a: number, b: number, rate: number, dt: number): number {
  return a + (b - a) * (1 - Math.exp(-rate * dt));
}
