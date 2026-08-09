// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: TRICK SYSTEM
//
// Three independent channels that combine freely:
//
//   SPIN   yaw about the vertical  -> 180 / 360 / 540 / 720 / 900 / 1080
//   FLIP   pitch about the axle    -> backflip / frontflip (and doubles)
//   STYLE  held poses              -> no-hander, one-footer, tabletop,
//                                     tailwhip, barspin, superman
//
// Because the channels are independent, a 720 backflip tabletop is not a
// special case — it's what happens when you hold all three. Naming and
// scoring compose the same way.
// ---------------------------------------------------------------------------

import { clamp01 } from './core';

export enum StyleTrick {
  NONE = 'NONE',
  NO_HANDER = 'NO-HANDER',
  ONE_FOOTER = 'ONE-FOOTER',
  TABLETOP = 'TABLETOP',
  TAILWHIP = 'TAILWHIP',
  BARSPIN = 'BARSPIN',
  SUPERMAN = 'SUPERMAN',
}

export interface StyleDef {
  id: StyleTrick;
  name: string;
  /** points per second held */
  rate: number;
  /** minimum hold to count at all (s) */
  minHold: number;
  /** how much it costs you in rotation control while held */
  controlCost: number;
  /** which key holds it */
  key: string;
  keyLabel: string;
}

export const STYLE_TRICKS: StyleDef[] = [
  { id: StyleTrick.NO_HANDER, name: 'NO-HANDER', rate: 260, minHold: 0.18, controlCost: 0.12, key: 'Digit1', keyLabel: '1' },
  { id: StyleTrick.ONE_FOOTER, name: 'ONE-FOOTER', rate: 250, minHold: 0.18, controlCost: 0.10, key: 'Digit2', keyLabel: '2' },
  { id: StyleTrick.TABLETOP, name: 'TABLETOP', rate: 340, minHold: 0.22, controlCost: 0.22, key: 'Digit3', keyLabel: '3' },
  { id: StyleTrick.TAILWHIP, name: 'TAILWHIP', rate: 420, minHold: 0.25, controlCost: 0.30, key: 'Digit4', keyLabel: '4' },
  { id: StyleTrick.BARSPIN, name: 'BARSPIN', rate: 380, minHold: 0.22, controlCost: 0.26, key: 'Digit5', keyLabel: '5' },
  { id: StyleTrick.SUPERMAN, name: 'SUPERMAN', rate: 460, minHold: 0.28, controlCost: 0.38, key: 'Space', keyLabel: 'SPACE' },
];

export const styleDef = (id: StyleTrick) =>
  STYLE_TRICKS.find(s => s.id === id);

// --- rotation naming -------------------------------------------------------

/** Snap a yaw magnitude (radians) to the nearest completed 180. */
export function spinSteps(radians: number): number {
  const halves = Math.abs(radians) / Math.PI;
  // 0.82 tolerance: you get credit slightly before the full rotation lands
  return Math.floor(halves + 0.18);
}

export const SPIN_NAMES: Record<number, string> = {
  1: '180', 2: '360', 3: '540', 4: '720', 5: '900', 6: '1080',
};

export function spinName(steps: number): string {
  if (steps <= 0) return '';
  if (steps <= 6) return SPIN_NAMES[steps];
  // beyond 1080 just keep counting
  return `${steps * 180}`;
}

export function flipName(count: number, backwards: boolean): string {
  if (count <= 0) return '';
  const base = backwards ? 'BACKFLIP' : 'FRONTFLIP';
  if (count === 1) return base;
  if (count === 2) return `DOUBLE ${base}`;
  if (count === 3) return `TRIPLE ${base}`;
  return `${count}x ${base}`;
}

// --- scoring ---------------------------------------------------------------

/** Rotations are worth progressively more: a 720 beats two 360s. */
export function spinScore(steps: number): number {
  if (steps <= 0) return 0;
  return 90 * steps * steps;
}

export function flipScore(count: number): number {
  if (count <= 0) return 0;
  return 420 * count * count;
}

export interface TrickTally {
  spinSteps: number;
  flipCount: number;
  flipBack: boolean;
  /** style trick -> seconds held */
  styles: Map<StyleTrick, number>;
  airTime: number;
}

export interface TrickResult {
  name: string;
  score: number;
  /** how many distinct channels were used (drives the combo bonus) */
  channels: number;
  bonusLabel: string;
}

/**
 * Compose a trick name and score from whatever the rider actually did.
 * Order matters for readability: FLIP + SPIN + STYLE reads the way riders
 * actually call them ("double backflip 360 tabletop").
 */
export function scoreTrick(t: TrickTally): TrickResult | null {
  const parts: string[] = [];
  let score = 0;
  let channels = 0;

  if (t.flipCount > 0) {
    parts.push(flipName(t.flipCount, t.flipBack));
    score += flipScore(t.flipCount);
    channels++;
  }
  if (t.spinSteps > 0) {
    parts.push(spinName(t.spinSteps));
    score += spinScore(t.spinSteps);
    channels++;
  }

  // style tricks: only those held long enough
  const held: { def: StyleDef; time: number }[] = [];
  for (const [id, time] of t.styles) {
    const def = styleDef(id);
    if (!def || time < def.minHold) continue;
    held.push({ def, time });
  }
  // longest-held reads first
  held.sort((a, b) => b.time - a.time);
  for (const h of held) {
    parts.push(h.def.name);
    score += h.def.rate * Math.min(h.time, 2.2);
  }
  if (held.length) channels++;

  if (parts.length === 0) {
    // pure airtime still counts for something
    if (t.airTime >= 0.85) {
      return {
        name: 'BIG AIR', score: t.airTime * 180, channels: 1, bonusLabel: '',
      };
    }
    return null;
  }

  // combining channels is where the big numbers live
  let bonusLabel = '';
  if (channels >= 3) { score *= 2.2; bonusLabel = 'TRIPLE THREAT'; }
  else if (channels === 2) { score *= 1.55; bonusLabel = 'COMBO'; }
  // stacking multiple style tricks at once
  if (held.length >= 3) { score *= 1.35; bonusLabel = 'STYLE MASTER'; }
  else if (held.length === 2) score *= 1.15;

  // hang time multiplier
  score *= 1 + clamp01((t.airTime - 0.5) / 2.2) * 1.4;

  return { name: parts.join(' '), score, channels, bonusLabel };
}

/** Live readout while still in the air. */
export function previewName(t: TrickTally): string {
  const parts: string[] = [];
  if (t.flipCount > 0) parts.push(flipName(t.flipCount, t.flipBack));
  if (t.spinSteps > 0) parts.push(spinName(t.spinSteps));
  for (const [id, time] of t.styles) {
    const def = styleDef(id);
    if (def && time >= def.minHold) parts.push(def.name);
  }
  return parts.join(' ');
}
