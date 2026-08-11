// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: persistence (records, splits, settings)
// ---------------------------------------------------------------------------

import { type Loadout, DEFAULT_LOADOUT, BIKES } from './garage';

export type Difficulty = 'chill' | 'rider' | 'pro' | 'savage';

export const DIFFICULTIES: { id: Difficulty; label: string; blurb: string; color: string }[] = [
  { id: 'chill', label: 'ROOKIE', blurb: 'Wide lines, early brakes, slow to recover', color: '#7ef7c8' },
  { id: 'rider', label: 'RIDER', blurb: 'Knows the lines and takes the obvious shortcuts', color: '#ffd400' },
  { id: 'pro', label: 'PRO', blurb: 'Hits every apex and punishes mistakes', color: '#ff9500' },
  { id: 'savage', label: 'ABSURD', blurb: 'Perfect lines, every shortcut, perfect timing', color: '#ff2e88' },
];

/**
 * Base skill / aggression per difficulty.
 *
 * Hard speed ceilings live in AI_TIERS[].cap (m/s), tuned so a competent
 * tucked player (~42-46) is competitive rather than free:
 *   chill/rookie  ~39.2  (DECENT+ clears; CASUAL fights)
 *   rider         ~41.4  (GOOD/EXPERT clear; DECENT scrapes)
 *   pro           ~42.9  (GOOD ≈ 50% in ?tune)
 *   savage/absurd ~45.0  (EXPERT fights; CASUAL/DECENT lose)
 *
 * `skill` here drives execution quality and the per-grid-slot spread. The
 * four rows line up one-to-one with the four AI tiers via tierFromLegacy().
 *
 * `bandK` scales the rubber band. At 1.0 the band moves skill by up to +/-0.15
 * — chill damps it (you can run away), savage amplifies it (they hunt).
 */
export const DIFF_TUNING: Record<
  Difficulty, { skill: number; step: number; aggro: number; bandK: number }
> = {
  chill:  { skill: 0.427, step: 0.028, aggro: 0.45, bandK: 0.35 },
  rider:  { skill: 0.545, step: 0.035, aggro: 0.60, bandK: 0.80 },
  pro:    { skill: 0.657, step: 0.042, aggro: 0.75, bandK: 1.00 },
  savage: { skill: 0.893, step: 0.048, aggro: 1.15, bandK: 1.35 },
};

/** Hard limits on rival skill after the rubber band is applied. */
export const SKILL_MIN = 0.40;
export const SKILL_MAX = 1.30;

export interface RunRecord {
  time: number;
  score: number;
  place: number;
  topSpeed: number;
  /** cumulative race time on entering each zone */
  splits: number[];
  date: number;
}

/** Seconds between recorded ghost samples. */
export const GHOST_HZ = 10;
export const GHOST_DT = 1 / GHOST_HZ;

/**
 * A recorded line down the mountain, flattened to a single number array so it
 * survives JSON cheaply: [s, x, y, lean] per frame, fixed-point rounded.
 */
export interface Ghost {
  dt: number;
  time: number;
  frames: number[];
}

export function encodeGhost(
  samples: { s: number; x: number; y: number; lean: number }[],
  time: number,
): Ghost {
  const frames: number[] = [];
  for (const f of samples) {
    frames.push(
      Math.round(f.s * 20) / 20,
      Math.round(f.x * 50) / 50,
      Math.round(f.y * 50) / 50,
      Math.round(f.lean * 100) / 100,
    );
  }
  return { dt: GHOST_DT, time, frames };
}

export interface SaveData {
  version: number;
  difficulty: Difficulty;
  best: Partial<Record<Difficulty, RunRecord>>;
  bestScore: Partial<Record<Difficulty, number>>;
  ghost: Partial<Record<Difficulty, Ghost>>;
  runs: number;
  music: boolean;
  sfx: boolean;
  /** accessibility */
  reducedMotion: boolean;
  showGhost: boolean;
  /** garage */
  coins: number;
  loadout: Loadout;
  /** progression */
  xp: number;
  mountain: string;
  /** best time per mountain id */
  mountainBest: Record<string, number>;
  /** first-run how-to dismissed */
  onboardingDone: boolean;
}

const KEY = 'dirt-bonk-descent.v1';

const DEFAULTS: SaveData = {
  version: 1,
  difficulty: 'pro',
  best: {},
  bestScore: {},
  ghost: {},
  runs: 0,
  music: true,
  sfx: true,
  reducedMotion:
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
  showGhost: true,
  coins: 0,
  loadout: DEFAULT_LOADOUT,
  xp: 0,
  mountain: 'shaleback',
  mountainBest: {},
  onboardingDone: false,
};

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw) as Partial<SaveData>;
    if (!p || p.version !== 1) return { ...DEFAULTS };
    return {
      ...DEFAULTS,
      ...p,
      // an unknown id would index DIFF_TUNING as undefined and take the
      // whole race setup down, so pin it to the table
      difficulty: DIFFICULTIES.some(d => d.id === p.difficulty)
        ? p.difficulty! : DEFAULTS.difficulty,
      best: p.best ?? {},
      bestScore: p.bestScore ?? {},
      ghost: p.ghost ?? {},
      coins: p.coins ?? 0,
      xp: p.xp ?? 0,
      // old saves referenced the pre-authored id
      mountain: (p.mountain === 'shalebeck' ? 'shaleback' : p.mountain) ?? 'shaleback',
      mountainBest: p.mountainBest ?? {},
      onboardingDone: p.onboardingDone ?? false,
      // merge so loadouts saved before a field existed still load
      loadout: {
        ...DEFAULT_LOADOUT,
        ...(p.loadout ?? {}),
        levels: p.loadout?.levels ?? {},
        // old saves may name bikes that no longer exist; drop them and
        // guarantee the starter frame is always owned
        owned: Array.from(new Set([
          'hornet',
          ...(p.loadout?.owned ?? []).filter(id => BIKES.some(b => b.id === id)),
        ])),
        bike: BIKES.some(b => b.id === p.loadout?.bike)
          ? p.loadout!.bike : 'hornet',
      },
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeSave(data: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* private mode / quota — records just won't persist */
  }
}

export interface RecordResult {
  timeRecord: boolean;
  scoreRecord: boolean;
  prevTime: number | null;
}

/** Fold a finished run into the save, reporting which records fell. */
export function commitRun(
  data: SaveData, diff: Difficulty, run: RunRecord, ghost?: Ghost | null,
): RecordResult {
  const prev = data.best[diff];
  const prevScore = data.bestScore[diff] ?? 0;
  const timeRecord = !prev || run.time < prev.time;
  const scoreRecord = run.score > prevScore;
  if (timeRecord) {
    data.best[diff] = run;
    // the ghost always travels with the best time, so they never disagree
    if (ghost) data.ghost[diff] = ghost;
  }
  if (scoreRecord) data.bestScore[diff] = run.score;
  data.runs += 1;
  writeSave(data);
  return { timeRecord, scoreRecord, prevTime: prev ? prev.time : null };
}

/** +1.23 / -0.44 style delta string. */
export function formatDelta(d: number): string {
  const s = d >= 0 ? '+' : '-';
  const a = Math.abs(d);
  return `${s}${a.toFixed(2)}`;
}
