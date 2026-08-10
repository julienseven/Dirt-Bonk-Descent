// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: RACE MODES
//
// Architecture only, plus a complete DESCENT implementation. Each mode is a
// data-driven RuleSet the engine consults at fixed hook points, rather than
// a pile of `if (mode === ...)` branches scattered through the simulation.
//
// Adding a mode means writing one object. The engine never learns their names.
// ---------------------------------------------------------------------------

import type { Difficulty } from './save';

export type ModeId = 'descent' | 'timeattack' | 'trickjam' | 'knockout' | 'mayhem';

/** Why a run ended — modes can end a race for their own reasons. */
export type EndReason =
  | 'finished'        // crossed the line
  | 'timeup'          // ran out of clock
  | 'eliminated'      // knocked out of the field
  | 'quit';

export interface ModeContext {
  raceTime: number;
  /** 0..1 down the mountain */
  progress: number;
  place: number;
  fieldSize: number;
  score: number;
  tricks: number;
  bonks: number;
  shortcuts: number;
  nearMisses: number;
  finished: boolean;
  /** seconds remaining, for timed modes; Infinity when untimed */
  clock: number;
}

/** What the HUD should show for this mode, beyond the standard readouts. */
export interface ModeHud {
  /** big centre-top objective line, e.g. "TARGET 2:35" */
  objective: string;
  /** secondary line under it */
  detail: string;
  /** 0..1 progress toward the objective, -1 to hide the bar */
  meter: number;
  /** urgency tint */
  urgent: boolean;
}

export interface ModeRules {
  id: ModeId;
  name: string;
  sub: string;
  blurb: string;
  colour: string;
  /** implemented, or architecture-only for now */
  available: boolean;
  /** player level required */
  reqLevel: number;

  // ---- rule switches the engine reads -------------------------------
  /** riders can be eliminated mid-race */
  elimination: boolean;
  /** seconds between eliminations, 0 = never */
  elimInterval: number;
  /** overall clock; Infinity = untimed */
  timeLimit: (diff: Difficulty, estTime: number) => number;
  /** multiplier on hazard/prop density */
  hazardScale: number;
  /** multiplier on rival aggression */
  aggressionScale: number;
  /** score multiplier for tricks specifically */
  trickScale: number;
  /** does finishing position decide the winner, or score? */
  winBy: 'position' | 'score' | 'time';

  // ---- hooks --------------------------------------------------------
  /** per-frame HUD state */
  hud: (c: ModeContext) => ModeHud;
  /** should the race end now? */
  checkEnd: (c: ModeContext) => EndReason | null;
  /** final XP multiplier, so harder modes pay better */
  xpScale: number;
  /** final currency multiplier */
  cashScale: number;
}

const untimed = () => Infinity;

const noHud = (): ModeHud => ({ objective: '', detail: '', meter: -1, urgent: false });

// ---------------------------------------------------------------------------
// DESCENT — the vertical slice. Fully implemented.
// ---------------------------------------------------------------------------
export const DESCENT: ModeRules = {
  id: 'descent',
  name: 'DESCENT',
  sub: 'STRAIGHT RACE',
  blurb: 'Six riders, one mountain. First to the bottom takes it.',
  colour: '#ffd400',
  available: true,
  reqLevel: 0,
  elimination: false,
  elimInterval: 0,
  timeLimit: untimed,
  hazardScale: 1,
  aggressionScale: 1,
  trickScale: 1,
  winBy: 'position',
  hud: noHud,
  checkEnd: c => (c.finished ? 'finished' : null),
  xpScale: 1,
  cashScale: 1,
};

// ---------------------------------------------------------------------------
// Architecture-only modes. Rules are defined; the engine already reads every
// switch they use, so enabling one is a flag flip plus its own testing pass.
// ---------------------------------------------------------------------------

export const TIME_ATTACK: ModeRules = {
  id: 'timeattack',
  name: 'TIME ATTACK',
  sub: 'BEAT THE CLOCK',
  blurb: 'Solo run against a target time. Style points buy you seconds.',
  colour: '#7ef7ff',
  available: true,
  reqLevel: 0,
  elimination: false,
  elimInterval: 0,
  // target is the model's estimate, tightened by difficulty
  timeLimit: (d, est) => est * (d === 'chill' ? 1.18 : d === 'pro' ? 1.06 : 0.97),
  hazardScale: 0.85,
  /** ghosts of rivals stay for drama; they never swing */
  aggressionScale: 0,
  trickScale: 1.4,
  winBy: 'time',
  hud: c => ({
    objective: c.clock > 0 ? fmt(c.clock) : 'TIME UP',
    detail: 'TARGET',
    meter: -1,
    urgent: c.clock < 15,
  }),
  checkEnd: c => (c.finished ? 'finished' : c.clock <= 0 ? 'timeup' : null),
  xpScale: 1.15,
  cashScale: 1.1,
};

export const TRICK_JAM: ModeRules = {
  id: 'trickjam',
  name: 'TRICK JAM',
  sub: 'STYLE WINS',
  blurb: 'Position is irrelevant. Highest style score at the bottom takes it.',
  colour: '#ff2e88',
  available: false,
  reqLevel: 6,
  elimination: false,
  elimInterval: 0,
  timeLimit: untimed,
  hazardScale: 0.8,
  aggressionScale: 0.6,
  trickScale: 2.0,
  winBy: 'score',
  hud: c => ({
    objective: Math.round(c.score).toLocaleString(),
    detail: 'STYLE TO BEAT',
    meter: -1,
    urgent: false,
  }),
  checkEnd: c => (c.finished ? 'finished' : null),
  xpScale: 1.2,
  cashScale: 1.15,
};

export const KNOCKOUT: ModeRules = {
  id: 'knockout',
  name: 'KNOCKOUT',
  sub: 'LAST RIDER OUT',
  blurb: 'Every twenty seconds, whoever is last is gone. Do not be last.',
  colour: '#ff6a00',
  available: false,
  reqLevel: 9,
  elimination: true,
  elimInterval: 20,
  timeLimit: untimed,
  hazardScale: 1,
  aggressionScale: 1.5,
  trickScale: 1,
  winBy: 'position',
  hud: c => ({
    objective: c.place >= c.fieldSize ? 'DANGER' : `P${c.place}`,
    detail: 'NEXT CUT',
    meter: -1,
    urgent: c.place >= c.fieldSize,
  }),
  checkEnd: c => (c.finished ? 'finished' : null),
  xpScale: 1.35,
  cashScale: 1.3,
};

export const MAYHEM: ModeRules = {
  id: 'mayhem',
  name: 'MAYHEM',
  sub: 'EVERYTHING AT ONCE',
  blurb: 'Maximum hazards, maximum aggression. The mountain wants you gone.',
  colour: '#c0f000',
  available: false,
  reqLevel: 12,
  elimination: false,
  elimInterval: 0,
  timeLimit: untimed,
  hazardScale: 2.4,
  aggressionScale: 2.0,
  trickScale: 1.25,
  winBy: 'position',
  hud: noHud,
  checkEnd: c => (c.finished ? 'finished' : null),
  xpScale: 1.5,
  cashScale: 1.4,
};

export const MODES: ModeRules[] = [DESCENT, TIME_ATTACK, TRICK_JAM, KNOCKOUT, MAYHEM];

export const getMode = (id: ModeId): ModeRules =>
  MODES.find(m => m.id === id) ?? DESCENT;

function fmt(t: number): string {
  if (t <= 0) return '0:00';
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
