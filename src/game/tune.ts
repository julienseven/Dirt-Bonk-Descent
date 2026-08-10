// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: headless tuning harness
//
// Runs the longitudinal race model with no rendering so difficulty can be
// measured instead of guessed. It mirrors stepRacer()'s speed physics exactly;
// it deliberately ignores tricks, bonks and crashes, so results are a clean
// read on the *speed* balance between the player and the field.
// ---------------------------------------------------------------------------
import { clamp, clamp01, RNG } from './core';
import { Track, TRACK_LENGTH } from './track';
import { GRAV, SOFT_CAP, DRAG_K, TUCK_DRAG } from './game';
import { DIFF_TUNING, type Difficulty } from './save';
import { AI_TIERS, tierFromLegacy } from './ai';

const DT = 1 / 60;
const MAX_T = 600;

interface Sim {
  s: number; v: number;
  skill: number; cap: number; grip: number;
  finish: number;
}

/**
 * Longitudinal step shared by player and AI. Mirrors the real sim's forces:
 * gravity along pitch, pedal, brake, quadratic drag, surface drag, caps.
 */
function stepSpeed(
  trk: Track, s: number, v: number,
  pedal: boolean, brake: boolean, tuck: boolean, cap: number,
): number {
  const pitch = trk.pitchAt(s);
  const surf = trk.surfaceAt(s, 0);
  const speed01 = clamp01(v / 40);
  let a = GRAV * Math.sin(pitch);
  if (pedal) a += 11 + (1.2 - 11) * speed01;
  if (brake) a -= 30 * surf.grip;
  a -= DRAG_K * (tuck ? TUCK_DRAG : 1) * v * v;
  a -= surf.drag * (v * 0.055 + 0.5);
  if (v > SOFT_CAP) a -= (v - SOFT_CAP) * 5;
  if (v > cap) a -= (v - cap) * 4;
  return Math.max(0, v + a * DT);
}

/** Corner speed limit, matching the AI's own model. */
function cornerLimit(trk: Track, s: number, grip: number): number {
  const c = Math.abs(trk.curvatureAt(s));
  return c > 0.0002 ? Math.sqrt(grip / c) : 9999;
}

export interface RaceResult {
  playerTime: number;
  aiTimes: number[];
  place: number;
  playerAvg: number;
  playerTop: number;
}

/**
 * @param playerSkill 0..1 — how well the reference player tucks, brakes and
 *        holds a line. 0.5 = casual, 0.8 = competent, 1.0 = near-optimal.
 */
export function simulateRace(
  trk: Track, diff: Difficulty, playerSkill: number, seed = 1,
): RaceResult {
  const rng = new RNG(seed * 7919 + 13);
  const T = DIFF_TUNING[diff];

  // model the real field: personality caps and per-tier cornering grip
  const tier = AI_TIERS[tierFromLegacy(diff)];
  const ai: Sim[] = [];
  for (let i = 1; i <= 5; i++) {
    const spread = (i - 1 - 2.5) * tier.spread;
    ai.push({
      s: 0, v: 0,
      skill: T.skill + i * T.step + rng.range(-0.03, 0.03),
      cap: (tier.cap + spread * 10) + rng.range(-0.4, 0.4),
      grip: 13 + tier.cornerCommit * 11 + rng.range(0, 3),
      finish: -1,
    });
  }

  // reference player: better skill = tucks more, brakes later, carries more
  const pGrip = 14 + playerSkill * 12;
  const pTuckBias = 0.004 + playerSkill * 0.010;
  let ps = 0, pv = 0, pTop = 0, pFinish = -1;

  for (let t = 0; t < MAX_T; t += DT) {
    // ---- player
    if (pFinish < 0) {
      const look = ps + 18 + pv * 0.5;
      const lim = cornerLimit(trk, look, pGrip);
      const brake = pv > lim;
      const tuck = !brake && Math.abs(trk.curvatureAt(look)) < pTuckBias;
      pv = stepSpeed(trk, ps, pv, !brake, brake, tuck, SOFT_CAP);
      ps += pv * DT;
      pTop = Math.max(pTop, pv);
      if (ps >= TRACK_LENGTH - 20) pFinish = t;
    }
    // ---- rivals, including the live rubber band
    for (const r of ai) {
      if (r.finish >= 0) continue;
      const rel = ps - r.s;
      const band = clamp(rel * 0.0024 * T.bandK, -0.10 * T.bandK, 0.15 * T.bandK);
      const cap = r.cap * (1 + band * 0.5);
      const look = r.s + 22 + r.v * 0.55;
      const lim = cornerLimit(trk, look, r.grip);
      const brake = r.v > Math.min(cap * 1.1, lim)
        && Math.abs(trk.curvatureAt(look)) > 0.008;
      const tuck = !brake && Math.abs(trk.curvatureAt(look)) < 0.005 && r.v > 18;
      r.v = stepSpeed(trk, r.s, r.v, r.v < cap, brake, tuck, cap);
      r.s += r.v * DT;
      if (r.s >= TRACK_LENGTH - 20) r.finish = t;
    }
    if (pFinish >= 0 && ai.every(r => r.finish >= 0)) break;
  }

  const aiTimes = ai.map(r => (r.finish >= 0 ? r.finish : MAX_T));
  const pt = pFinish >= 0 ? pFinish : MAX_T;
  const place = 1 + aiTimes.filter(x => x < pt).length;
  return {
    playerTime: pt, aiTimes, place,
    playerAvg: (TRACK_LENGTH - 20) / pt, playerTop: pTop,
  };
}

export interface DiffReport {
  diff: Difficulty;
  skill: number;
  winRate: number;
  avgPlace: number;
  playerTime: number;
  fieldBest: number;
  fieldWorst: number;
  margin: number;      // player time minus best AI (negative = player wins)
}

/** Sweep player skill levels against one difficulty. */
export function profileDifficulty(
  trk: Track, diff: Difficulty, skills = [0.45, 0.65, 0.85, 1.0], runs = 6,
): DiffReport[] {
  const out: DiffReport[] = [];
  for (const sk of skills) {
    let wins = 0, places = 0, pt = 0, fb = 0, fw = 0, marg = 0;
    for (let n = 0; n < runs; n++) {
      const r = simulateRace(trk, diff, sk, n + 1);
      if (r.place === 1) wins++;
      places += r.place;
      pt += r.playerTime;
      const best = Math.min(...r.aiTimes);
      fb += best;
      fw += Math.max(...r.aiTimes);
      marg += r.playerTime - best;
    }
    out.push({
      diff, skill: sk,
      winRate: wins / runs,
      avgPlace: places / runs,
      playerTime: pt / runs,
      fieldBest: fb / runs,
      fieldWorst: fw / runs,
      margin: marg / runs,
    });
  }
  return out;
}

export function fullReport(trk: Track) {
  const diffs: Difficulty[] = ['chill', 'rider', 'pro', 'savage'];
  return diffs.map(d => ({ diff: d, rows: profileDifficulty(trk, d) }));
}
