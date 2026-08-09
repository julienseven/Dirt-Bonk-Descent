// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: persistence (records, splits, settings)
// ---------------------------------------------------------------------------

import { type Loadout, DEFAULT_LOADOUT, BIKES } from './garage';

export type Difficulty = 'chill' | 'pro' | 'savage';

export const DIFFICULTIES: { id: Difficulty; label: string; blurb: string; color: string }[] = [
  { id: 'chill', label: 'ROOKIE', blurb: 'Wide lines, early brakes, slow to recover', color: '#7ef7c8' },
  { id: 'pro', label: 'PRO', blurb: 'Hits every apex and punishes mistakes', color: '#ff9500' },
  { id: 'savage', label: 'ABSURD', blurb: 'Perfect lines, every shortcut, perfect timing', color: '#ff2e88' },
];

/**
 * Base skill / aggression per difficulty.
 *
 * `skill` maps to a speed ceiling via aiCap = 24.5 + skill*15 (m/s). Analysis
 * of the drag model puts a competent player at ~38-42 m/s tucked and ~33
 * un-tucked, so the top rival's cap is set relative to that:
 *   chill  top ~33 m/s  (a good line beats them comfortably)
 *   pro    top ~37 m/s  (a real fight)
 *   savage top ~41 m/s  (needs near-perfect tucking and corner exits)
 *
 * `bandK` scales the rubber band. At 1.0 the band moves skill by up to +/-0.15
 * = 2.25 m/s, which was large enough to erase the gap between difficulties —
 * so chill damps it (you can run away) and savage amplifies it (they hunt).
 */
export const DIFF_TUNING: Record<
  Difficulty, { skill: number; step: number; aggro: number; bandK: number }
> = {
  chill:  { skill: 0.427, step: 0.028, aggro: 0.45, bandK: 0.35 },
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
      best: p.best ?? {},
      bestScore: p.bestScore ?? {},
      ghost: p.ghost ?? {},
      coins: p.coins ?? 0,
      xp: p.xp ?? 0,
      // old saves referenced the pre-authored id
      mountain: (p.mountain === 'shalebeck' ? 'shaleback' : p.mountain) ?? 'shaleback',
      mountainBest: p.mountainBest ?? {},
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
