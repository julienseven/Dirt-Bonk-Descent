// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: headless tuning harness
//
// Runs the longitudinal race model with no rendering so difficulty can be
// measured instead of guessed. It mirrors stepRacer()'s speed physics exactly;
// it deliberately ignores tricks, bonks and crashes, so results are a clean
// read on the *speed* balance between the player and the field.
//
// playerSkill (0..1) is a synthetic competence lever:
//   0.45 CASUAL  — sits up, brakes early, freewheels, lower hold speed
//   0.65 DECENT  — partial tuck discipline
//   0.85 GOOD    — clean lines, ~50% wins on PRO
//   1.00 EXPERT  — near-optimal tuck + brake timing, holds near SOFT_CAP
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
  cap: number; grip: number;
  finish: number;
  tuckGate: number;
  cornerCommit: number;
  /** lower tiers make more line mistakes */
  mistake: number;
}

/**
 * Longitudinal step shared by player and AI. Mirrors the real sim's forces:
 * gravity along pitch, pedal, brake, quadratic drag, surface drag, caps.
 * `pedalMul` scales throttle force (player skill only).
 */
function stepSpeed(
  trk: Track, s: number, v: number,
  pedal: boolean, brake: boolean, tuck: boolean, cap: number,
  pedalMul = 1,
): number {
  const pitch = trk.pitchAt(s);
  const surf = trk.surfaceAt(s, 0);
  const speed01 = clamp01(v / 33);
  let a = GRAV * Math.sin(pitch);
  if (pedal) a += (11 + (1.2 - 11) * speed01) * pedalMul;
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

/** Soften the upper skill band so GOOD sits near EXPERT, not midway. */
function skillEase(sk: number): number {
  return Math.pow(clamp01(sk), 0.85);
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
 *        holds a line. 0.45 = casual, 0.65 = decent, 0.85 = good, 1.0 = expert.
 */
export function simulateRace(
  trk: Track, diff: Difficulty, playerSkill: number, seed = 1,
): RaceResult {
  const rng = new RNG(seed * 7919 + 13);
  const T = DIFF_TUNING[diff];
  const tier = AI_TIERS[tierFromLegacy(diff)];

  const ai: Sim[] = [];
  for (let i = 1; i <= 5; i++) {
    const spread = (i - 1 - 2.5) * tier.spread;
    // personality paceBias stand-in (±4%) so the field isn't a mono-cap blob
    const pace = 1 + rng.range(-0.04, 0.04);
    ai.push({
      s: 0, v: 0,
      cap: ((tier.cap + spread * 10) + rng.range(-0.5, 0.5)) * pace,
      grip: 13 + tier.cornerCommit * 11 + rng.range(0, 3),
      finish: -1,
      tuckGate: 0.003 + tier.lineQuality * 0.006 + rng.range(-0.001, 0.001),
      cornerCommit: tier.cornerCommit,
      mistake: (1 - tier.lineQuality) * 0.35,
    });
  }

  // ---- reference player: skill must change lap time (not just labels)
  const sk = skillEase(playerSkill);
  const pCap = 29 + sk * 10;                 // 29..39 sustained hold
  const pGrip = 9 + sk * 16;                 // corner belief
  const pBrakeMul = 0.74 + sk * 0.30;        // fraction of limit before brake
  const pTuckMaxCurv = 0.0005 + sk * 0.008;  // how bent a line still tucks
  const pPedalMul = 0.65 + sk * 0.35;        // throttle efficiency
  const pUpright = (1 - sk) * 0.50;          // form-break rate (sit up)

  let ps = 0, pv = 0, pTop = 0, pFinish = -1;

  for (let t = 0; t < MAX_T; t += DT) {
    // ---- player
    if (pFinish < 0) {
      const look = ps + 18 + pv * 0.5;
      const lim = cornerLimit(trk, look, pGrip);
      const curv = Math.abs(trk.curvatureAt(look));
      const brake = pv > lim * pBrakeMul && curv > 0.0008;
      let tuck = !brake && curv < pTuckMaxCurv;
      // low skill randomly sits up — free speed leaks
      if (tuck && rng.next() < pUpright * DT * 3) tuck = false;
      const wantPedal = !brake && pv < pCap * (0.90 + sk * 0.10);
      pv = stepSpeed(trk, ps, pv, wantPedal, brake, tuck, pCap, pPedalMul);
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
      const curv = Math.abs(trk.curvatureAt(look));
      // higher tiers commit closer to the true corner limit
      let brake = r.v > Math.min(cap * 1.1, lim * (0.88 + r.cornerCommit * 0.14))
        && curv > 0.008;
      // line mistakes: early brakes, broken tuck
      if (!brake && curv > 0.005 && r.v > cap * 0.75
        && rng.next() < r.mistake * DT * 1.2) {
        brake = true;
      }
      let tuck = !brake && curv < r.tuckGate && r.v > 18;
      if (tuck && rng.next() < r.mistake * DT * 1.5) tuck = false;
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
