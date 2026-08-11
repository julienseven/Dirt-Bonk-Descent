// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: mountain roster
//
// Race length targets. Measured against the validated speed model: a
// competent player averages ~30 m/s over a full descent (terminal is ~42
// tucked, but corners, jumps and braking pull the average down).
//
//   2800m -> ~1:35   sprint
//   4600m -> ~2:35   the standard event
//   6200m -> ~3:30   endurance
//
// Arcade downhill wants 2-3 minutes: long enough for the pack to shuffle and
// a comeback to mean something, short enough to re-run instantly.
// ---------------------------------------------------------------------------

export interface MountainDef {
  id: string;
  name: string;
  sub: string;
  blurb: string;
  seed: number;
  length: number;
  /** 1-5, shown as chevrons */
  rating: number;
  /** player level needed to unlock */
  reqLevel: number;
  /** rough m/s the model predicts, used for the estimate label */
  estSpeed: number;
  tint: string;
  /** hand-built section list rather than the procedural default */
  authored?: boolean;
  /** short identity tag for cards / intro */
  themeLabel: string;
  /** cold-open secondary line under the mountain name */
  introHook: string;
  /** finish-line callout */
  finishHook: string;
  /** CSS sky strip for mountain select cards (top → bottom) */
  cardSky: [string, string, string];
  /** one-word feel for the card footer */
  feel: string;
}

export const MOUNTAINS: MountainDef[] = [
  {
    id: 'shaleback', name: 'SHALEBACK RUN', sub: 'CLASSIC ALPINE DESCENT',
    blurb: 'Cool daylight, pine forest, timber bridge, 88 m gap. The mountain that teaches the game.',
    seed: 20260114, length: 4600, rating: 2, reqLevel: 0, estSpeed: 30, tint: '#ffd400',
    authored: true,
    themeLabel: 'ALPINE',
    introHook: 'SUMMIT GATE · CLEAR AIR',
    finishHook: 'YOU TOOK SHALEBACK',
    cardSky: ['#1a4a88', '#8ec4e0', '#d09058'],
    feel: 'CLASSIC',
  },
  {
    id: 'cinder', name: 'CINDER CHUTE', sub: 'VOLCANIC SPEED',
    blurb: 'Ash, basalt, lava glow. Steep chutes and rockfall — short, vicious, no trees.',
    seed: 771453, length: 2800, rating: 3, reqLevel: 2, estSpeed: 30.5, tint: '#ff6a00',
    authored: true,
    themeLabel: 'VOLCANIC',
    introHook: 'CALDERA EDGE · DO NOT LOOK BACK',
    finishHook: 'CINDER CLAIMED',
    cardSky: ['#1a1420', '#6a4030', '#ff6020'],
    feel: 'SPRINT',
  },
  {
    id: 'thornwood', name: 'THORNWOOD DEEP', sub: 'DENSE FOREST TECHNICAL',
    blurb: 'Roots, mist, ancient trees. Progressive density and line choice through the canopy.',
    seed: 33911, length: 4900, rating: 4, reqLevel: 5, estSpeed: 28.0, tint: '#7ef7c8',
    authored: true,
    themeLabel: 'FOREST',
    introHook: 'CANOPY CLOSES · PICK YOUR LINE',
    finishHook: 'EMERGED',
    cardSky: ['#1a2a38', '#4a6870', '#8aa090'],
    feel: 'TECHNICAL',
  },
  {
    id: 'ironjaw', name: 'IRONJAW PASS', sub: 'EXTREME ROCKY PASS',
    blurb: 'Limestone walls, wind gap, suspension bridge, iron jaw. Six kilometres of thin air.',
    seed: 505017, length: 6200, rating: 4, reqLevel: 8, estSpeed: 30.5, tint: '#c0d0e0',
    authored: true,
    themeLabel: 'LIMESTONE',
    introHook: 'HIGH GATE · THIN AIR',
    finishHook: 'IRONJAW BROKEN',
    cardSky: ['#2850a0', '#90b8e0', '#d0c0a0'],
    feel: 'ENDURANCE',
  },
  {
    id: 'lastlight', name: 'LASTLIGHT SPINE', sub: 'GOLDEN-HOUR FINALE',
    blurb: 'Knife-edge ridge at sunset. Ridge jump, collapsing rock, final spine above the world.',
    seed: 8829, length: 5600, rating: 5, reqLevel: 0, estSpeed: 29, tint: '#ff2e88',
    authored: true,
    themeLabel: 'SUNSET',
    introHook: 'EDGE OF THE WORLD · GOLDEN HOUR',
    finishHook: 'LAST LIGHT TAKEN',
    cardSky: ['#1a1848', '#e07050', '#ffd080'],
    feel: 'EPIC',
  },
  {
    id: 'redrock', name: 'REDROCK RASP', sub: 'CANYON GRIND',
    blurb: 'Sun-blasted shelves, a pipe fight, and a dry wash finish. Technical without the trees.',
    seed: 441902, length: 3400, rating: 3, reqLevel: 3, estSpeed: 29, tint: '#ff8a40',
    authored: true,
    themeLabel: 'CANYON',
    introHook: 'HEAT HAZE · WIDE OPEN',
    finishHook: 'WASHED OUT',
    cardSky: ['#2050a0', '#d0d8d0', '#c09050'],
    feel: 'TECHNICAL',
  },
];

export const getMountain = (id: string) =>
  MOUNTAINS.find(m => m.id === id) ?? MOUNTAINS[0];

export const DEFAULT_MOUNTAIN = 'shaleback';

/** Predicted race time in seconds, for the select screen. */
export const estimateTime = (m: MountainDef) => (m.length - 20) / m.estSpeed;

// --- progression -----------------------------------------------------------

/** XP needed to reach the *next* level from level n. */
export const xpForLevel = (n: number) => Math.round(320 + n * 210 + n * n * 26);

export function levelFromXp(xp: number): { level: number; into: number; need: number } {
  let level = 0, rem = xp;
  for (;;) {
    const need = xpForLevel(level);
    if (rem < need || level > 60) return { level, into: rem, need };
    rem -= need;
    level++;
  }
}

/** XP awarded for a finished run. */
export function runXp(o: {
  place: number; score: number; tricks: number; bonks: number;
  shortcuts: number; length: number;
}): number {
  const placeXp = [0, 220, 165, 125, 95, 70, 55][o.place] ?? 45;
  return Math.round(
    placeXp
    + o.score / 110
    + o.tricks * 7
    + o.bonks * 4
    + o.shortcuts * 22
    + (o.length / 1000) * 14,
  );
}
