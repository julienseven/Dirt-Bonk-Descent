// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: race field ranking & knockout cuts
//
// Pure helpers for placings and elimination order. Side effects (popups,
// audio, finish crowning) stay in game.ts.
// ---------------------------------------------------------------------------

export type WinBy = 'position' | 'score' | 'time';

/** Minimal racer slice needed for ranking. */
export interface Rankable {
  s: number;
  finished: boolean;
  finishTime: number;
  eliminated: boolean;
  isPlayer: boolean;
  styleScore: number;
  place: number;
}

/**
 * Sort the field and write `.place` (1-based).
 *
 * - Eliminated sink to the bottom.
 * - Score modes: higher style wins (player score passed separately).
 * - Else: finished riders rank by finishTime (sooner = better);
 *   live riders rank by track progress `s`.
 */
export function recomputePlaces<T extends Rankable>(
  racers: T[],
  winBy: WinBy,
  playerScore: number,
): T[] {
  const order = [...racers].sort((a, b) => {
    if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
    if (winBy === 'score') {
      const sa = a.isPlayer ? playerScore : a.styleScore;
      const sb = b.isPlayer ? playerScore : b.styleScore;
      if (Math.abs(sb - sa) > 0.5) return sb - sa;
    }
    const ra = a.finished ? 1e9 - a.finishTime : a.s;
    const rb = b.finished ? 1e9 - b.finishTime : b.s;
    return rb - ra;
  });
  order.forEach((r, i) => { r.place = i + 1; });
  return order;
}

/** Live pack (not eliminated, not finished), sorted last→first by progress. */
export function activePackByProgress<T extends Rankable>(racers: T[]): T[] {
  return racers
    .filter(r => !r.eliminated && !r.finished)
    .sort((a, b) => a.s - b.s);
}

/**
 * Pick the knockout victim: last place in the live pack by track progress.
 * Returns null if the pack is empty or only one remains (caller crowns).
 */
export function pickKnockoutVictim<T extends Rankable>(racers: T[]): T | null {
  const active = activePackByProgress(racers);
  if (active.length <= 1) return null;
  return active[0];
}

/** Finish-time stamp for an eliminated rider (sorts after natural finishers). */
export function eliminationFinishTime(raceTime: number, progress01: number): number {
  return raceTime + 1000 + (1 - Math.max(0, Math.min(1, progress01)));
}

/** Gap between player finish and nearest rival finish (seconds). */
export function nearestFinishGap(
  playerFinishTime: number,
  rivals: { finished: boolean; finishTime: number }[],
): number {
  let gap = Infinity;
  for (const o of rivals) {
    if (!o.finished) continue;
    gap = Math.min(gap, Math.abs(o.finishTime - playerFinishTime));
  }
  return gap;
}
