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
}

export const MOUNTAINS: MountainDef[] = [
  {
    id: 'shalebeck', name: 'SHALEBECK RUN', sub: 'THE PROVING HILL',
    blurb: 'Wide, fast and forgiving. Where everyone learns to let go of the brakes.',
    seed: 20260114, length: 4600, rating: 2, reqLevel: 0, estSpeed: 30, tint: '#2fe6c8',
  },
  {
    id: 'cinder', name: 'CINDER CHUTE', sub: 'SHORT & VICIOUS',
    blurb: 'A sprint straight down a scree slope. No time to think, only to react.',
    seed: 771453, length: 2800, rating: 3, reqLevel: 2, estSpeed: 29.5, tint: '#ff6a00',
  },
  {
    id: 'thornwood', name: 'THORNWOOD DEEP', sub: 'TIGHT & DARK',
    blurb: 'Trees close in, ruts run deep, and the crowd is close enough to grab.',
    seed: 33911, length: 4900, rating: 4, reqLevel: 5, estSpeed: 28.5, tint: '#7ef7c8',
  },
  {
    id: 'ironjaw', name: 'IRONJAW PASS', sub: 'ENDURANCE',
    blurb: 'Six kilometres of mountain. Bring legs and a bike you trust.',
    seed: 505017, length: 6200, rating: 4, reqLevel: 8, estSpeed: 30.5, tint: '#ffd400',
  },
  {
    id: 'lastlight', name: 'LASTLIGHT SPINE', sub: 'THE BIG ONE',
    blurb: 'The ridge nobody finishes clean. Every hazard this mountain owns, in order.',
    seed: 8829, length: 5600, rating: 5, reqLevel: 12, estSpeed: 29, tint: '#ff2e88',
  },
];

export const getMountain = (id: string) =>
  MOUNTAINS.find(m => m.id === id) ?? MOUNTAINS[0];

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
