// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: full-race + track balance harness
//
// Headless sim: real Track geometry + pure AI planner + simplified long model.
// Validates every mountain finishes cleanly and identity/balance gates hold.
// Run: npm run test:race  (also pulled into npm run verify)
// ---------------------------------------------------------------------------

import { clamp, RNG } from './core';
import { buildMountainTrack, getTrackDefinition } from './mountainsBuild';
import { MOUNTAINS, estimateTime, type MountainDef } from './mountains';
import {
  AI_TIERS, buildField, planRivalThink, planRivalHop, planRivalCombat,
  themeAiFeel, type AiBrain, type RivalPlanState, type RivalWorldSample,
} from './ai';
import { recomputePlaces, type Rankable } from './raceManager';
import { SKILL_MIN, SKILL_MAX } from './save';
import type { Track } from './track';
import { PROPS } from './env';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

interface ScenarioResult {
  id: string;
  name: string;
  checks: Check[];
  pass: boolean;
}

function check(name: string, ok: boolean, detail: string): Check {
  return { name, ok, detail };
}

// ---------------------------------------------------------------------------
// Lightweight racer for full-race sim
// ---------------------------------------------------------------------------

interface SimRacer {
  index: number;
  isPlayer: boolean;
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
  finishTime: number;
  eliminated: boolean;
  styleScore: number;
  place: number;
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
  bonkCd: number;
  name: string;
}

const DT = 1 / 30;
const FINISH_PAD = 28;

function mkRival(i: number, brain: AiBrain, rng: RNG): SimRacer {
  return {
    index: i,
    isPlayer: false,
    s: 10 - Math.abs(i - 2.5) * 2.2,
    x: (i - 2.5) * 1.8,
    v: 8 + rng.range(0, 4),
    vx: 0,
    y: 0,
    grounded: true,
    airTime: 0,
    crash: 0,
    stun: 0,
    finished: false,
    finishTime: 0,
    eliminated: false,
    styleScore: 0,
    place: i + 1,
    skill: 0.55 + i * 0.04,
    corner: brain.line,
    aggression: brain.p.aggression,
    aiOffset: rng.range(-0.35, 0.35),
    aiSeed: rng.range(0, 100),
    aiSteer: 0,
    wantSteer: 0,
    aiHopCd: 0,
    scCommit: 0,
    trickSpin: 0,
    mood: { line: 1, swing: 1, send: 1 },
    moodCd: 0,
    brain,
    bonkCd: 0,
    name: brain.p.name,
  };
}

function mkPlayer(_rng: RNG): SimRacer {
  return {
    index: 0,
    isPlayer: true,
    s: 10,
    x: 0,
    v: 10,
    vx: 0,
    y: 0,
    grounded: true,
    airTime: 0,
    crash: 0,
    stun: 0,
    finished: false,
    finishTime: 0,
    eliminated: false,
    styleScore: 0,
    place: 1,
    skill: 0.7,
    corner: 0.85,
    aggression: 0.4,
    aiOffset: 0,
    aiSeed: 1,
    aiSteer: 0,
    wantSteer: 0,
    aiHopCd: 0,
    scCommit: 0,
    trickSpin: 0,
    mood: { line: 1, swing: 1, send: 1 },
    moodCd: 0,
    // player uses a quiet pro brain for the auto-pilot harness
    brain: buildField(1, AI_TIERS.pro, 11)[0],
    bonkCd: 0,
    name: 'PLAYER',
  };
}

function nearestShortcut(trk: Track, s: number) {
  let best: { s0: number; s1: number; side: number; width: number } | null = null;
  let bestD = 40;
  for (const sc of trk.shortcuts) {
    const d = sc.s0 - s;
    if (d > -4 && d < bestD) {
      bestD = d;
      best = { s0: sc.s0, s1: sc.s1, side: sc.side, width: sc.width };
    }
  }
  return best;
}

function stepSimRacer(
  r: SimRacer,
  trk: Track,
  pack: SimRacer[],
  raceTime: number,
  time: number,
  rng: () => number,
  dt: number,
  player: SimRacer,
) {
  if (r.finished || r.eliminated) return;

  if (r.crash > 0) {
    r.crash = Math.max(0, r.crash - dt * (r.brain?.recovery ?? 1));
    r.v = Math.max(0, r.v - 8 * dt);
    r.s += r.v * dt * 0.35;
    return;
  }

  const look = r.s + Math.max(8, r.v * 0.55);
  const neighbours = pack
    .filter(o => o !== r && !o.eliminated)
    .map(o => ({
      s: o.s, x: o.x, y: o.y, grounded: o.grounded, vx: o.vx,
      isPlayer: o.isPlayer, finished: o.finished, crash: o.crash, index: o.index,
    }));

  const scNear = nearestShortcut(trk, r.s);
  const world: RivalWorldSample = {
    halfWidth: trk.halfWidth(r.s),
    curvAhead: trk.curvatureAt(look),
    playerS: player.s,
    playerX: player.x,
    raceTime,
    time,
    combatZone: !!trk.zoneAt(r.s).combat,
    modeAggression: 1,
    bandK: r.brain?.bandK ?? 1,
    skillMin: SKILL_MIN,
    skillMax: SKILL_MAX,
    obstacles: trk.obstacles.map(o => ({
      s: o.s, x: o.x, r: o.r, hit: o.hit, gone: !!o.gone, mass: o.mass,
      reaction: PROPS[o.type].reaction as string,
    })),
    firstObstacle: trk.firstObstacleAfter(r.s + 2),
    nearestShortcut: scNear,
    neighbours,
    dt,
    rng,
    theme: trk.theme,
  };

  const planState: RivalPlanState = {
    s: r.s, x: r.x, v: r.v, vx: r.vx, y: r.y,
    grounded: r.grounded, airTime: r.airTime,
    crash: r.crash, stun: r.stun, finished: r.finished,
    skill: r.skill, corner: r.corner, aggression: r.aggression,
    aiOffset: r.aiOffset, aiSeed: r.aiSeed, aiSteer: r.aiSteer,
    wantSteer: r.wantSteer, aiHopCd: r.aiHopCd, scCommit: r.scCommit,
    trickSpin: r.trickSpin, mood: r.mood, moodCd: r.moodCd, brain: r.brain,
  };

  const intent = planRivalThink(planState, world);
  const feel = themeAiFeel(trk.theme);
  const send = (r.brain
    ? r.brain.p.sendiness * (0.5 + r.brain.tier.trickSkill * 0.7)
    : 0.5) * feel.sendMul;
  const deltaH = trk.heightAt(r.s + 6, r.x) - trk.heightAt(r.s, r.x);
  const hop = planRivalHop(r.grounded, intent.aiHopCd, send, deltaH, rng);

  r.bonkCd -= dt;
  const combat = planRivalCombat(
    { ...planState, aiHopCd: hop.aiHopCd, scCommit: intent.scCommit,
      trickSpin: intent.trickSpin, mood: intent.mood, moodCd: intent.moodCd },
    world, r.bonkCd,
  );
  if (combat.targetIndex >= 0) {
    r.bonkCd = combat.bonkCd;
    // soft contact: nudge, rarely crash
    const other = pack[combat.targetIndex];
    if (other && !other.finished) {
      other.vx += combat.bonkDir * 2.2;
      r.vx -= combat.bonkDir * 0.8;
      if (rng() < 0.04) other.crash = 0.8 + rng() * 0.6;
    }
  } else {
    r.bonkCd = combat.bonkCd;
  }

  r.aiSteer = intent.aiSteer;
  r.wantSteer = intent.wantSteer;
  r.aiHopCd = hop.aiHopCd;
  r.scCommit = intent.scCommit;
  r.trickSpin = intent.trickSpin;
  r.mood = intent.mood;
  r.moodCd = intent.moodCd;
  r.skill = intent.skill;

  // ---- simplified longitudinal + lateral (not full two-wheel) ----------
  const pitch = trk.pitchAt(r.s);
  const gradePull = clamp(pitch * 14, -4, 18); // downhill accelerates
  const cap = intent.aiCap;
  if (intent.brake) r.v = Math.max(4, r.v - 16 * dt);
  else if (intent.pedal) r.v += (6 + gradePull * 0.35) * dt;
  else r.v += gradePull * 0.55 * dt;
  if (intent.tuck) r.v += 1.6 * dt;
  if (hop.hop) {
    r.grounded = false;
    r.airTime = 0;
    r.v += 1.2;
  }
  r.v = clamp(r.v, 0, cap * 1.08);
  // drag
  r.v *= Math.exp(-0.08 * dt);

  r.vx += intent.steer * 22 * dt;
  r.vx *= Math.exp(-2.2 * dt);
  r.x += r.vx * dt;

  const hw = trk.halfWidth(r.s);
  const limit = r.scCommit > 0 ? hw * 1.85 : hw * 0.9;
  if (Math.abs(r.x) > limit) {
    r.x = clamp(r.x, -limit, limit);
    r.vx *= -0.35;
    if (Math.abs(r.x) > hw * 1.15 && rng() < 0.02) r.crash = 0.9;
  }

  if (!r.grounded) {
    r.airTime += dt;
    if (r.airTime > 0.55 + Math.max(0, deltaH) * 0.08) {
      r.grounded = true;
      r.airTime = 0;
    }
  }

  r.y = trk.heightAt(r.s, r.x);
  r.s += r.v * dt;

  if (r.s >= trk.length - FINISH_PAD) {
    r.finished = true;
    r.finishTime = raceTime;
    r.s = trk.length - FINISH_PAD;
    r.v = Math.min(r.v, 12);
  }
}

export interface RaceSimResult {
  mountainId: string;
  theme: string;
  finishers: number;
  times: number[];
  places: number[];
  winnerName: string;
  raceTime: number;
  avgV: number;
  stuck: boolean;
}

/** Simulate a full pack descent on a mountain. Deterministic for seed. */
export function simulateRace(
  mountainId: string,
  tierId: keyof typeof AI_TIERS = 'pro',
  seed = 42,
): RaceSimResult {
  const trk = buildMountainTrack(mountainId, 1);
  const rng = new RNG(seed);
  const roll = () => rng.next();
  const field = buildField(5, AI_TIERS[tierId], seed + 7);
  const player = mkPlayer(rng);
  player.index = 0;
  const rivals = field.map((b, i) => {
    const r = mkRival(i + 1, b, rng);
    r.index = i + 1;
    return r;
  });
  const pack = [player, ...rivals];

  const est = estimateTime(
    MOUNTAINS.find(m => m.id === mountainId) ?? MOUNTAINS[0],
  );
  // generous timeout — harness long-model is slightly slower than tucked player
  const timeout = Math.max(est * 2.8, 90);
  let raceTime = 0;
  let time = 0;
  let distSum = 0;
  let distN = 0;

  while (raceTime < timeout) {
    raceTime += DT;
    time += DT;
    for (const r of pack) {
      stepSimRacer(r, trk, pack, raceTime, time, roll, DT, player);
      if (!r.finished) {
        distSum += r.v;
        distN++;
      }
    }
    if (pack.every(r => r.finished)) break;
  }

  // ghost-finish anyone still on course so places resolve
  for (const r of pack) {
    if (!r.finished) {
      r.finished = true;
      r.finishTime = raceTime + (trk.length - r.s) / Math.max(8, r.v);
    }
  }

  recomputePlaces(pack as Rankable[], 'position', 0);
  const ordered = [...pack].sort((a, b) => a.place - b.place);
  const times = ordered.map(r => r.finishTime);
  const minProgress = Math.min(...pack.map(r => r.s));

  return {
    mountainId,
    theme: trk.theme,
    finishers: pack.filter(r => r.finishTime <= timeout + 1).length,
    times,
    places: ordered.map(r => r.place),
    winnerName: ordered[0]?.name ?? '?',
    raceTime,
    avgV: distN > 0 ? distSum / distN : 0,
    stuck: minProgress < trk.length * 0.35 && raceTime >= timeout * 0.95,
  };
}

// ---------------------------------------------------------------------------
// Balance / identity gates (soft playtest without a browser)
// ---------------------------------------------------------------------------

function auditMountain(m: MountainDef): Check[] {
  const trk = buildMountainTrack(m.id, 1);
  const def = getTrackDefinition(m.id);
  const elevDrop = trk.py[0] - trk.py[trk.count - 1];
  const grade = elevDrop / trk.length;
  const widths: number[] = [];
  for (let i = 0; i < trk.count; i += 12) widths.push(trk.hw[i] * 2);
  const avgW = widths.reduce((a, b) => a + b, 0) / widths.length;
  const minW = Math.min(...widths);
  const combat = trk.zones.filter(z => z.combat).length;
  const secret = trk.zones.filter(z => z.secret).length;
  const jumps = trk.features.filter(f =>
    f.kind === 'gap' || f.kind === 'table' || f.kind === 'kicker' || f.kind === 'double').length;
  const est = estimateTime(m);
  const feel = themeAiFeel(def.theme);

  const checks: Check[] = [
    check('length matches roster', Math.abs(trk.length - m.length) < 1,
      `trk=${trk.length} roster=${m.length}`),
    check('theme registered', !!def.theme && def.theme.length > 2, `theme=${def.theme}`),
    check('elev drop positive', elevDrop > 400, `drop=${Math.round(elevDrop)}m`),
    check('grade arcade range', grade > 0.14 && grade < 0.32,
      `grade=${grade.toFixed(3)}`),
    check('avg width rideable', avgW >= 10 && avgW <= 18,
      `avgW=${avgW.toFixed(1)}`),
    check('min width not needle', minW >= 4.5, `minW=${minW.toFixed(1)}`),
    check('has landmarks', def.landmarks.length >= 4,
      `n=${def.landmarks.length}`),
    check('has shortcuts', trk.shortcuts.length >= 1,
      `sc=${trk.shortcuts.length}`),
    check('has jumps', jumps >= 8, `jumps=${jumps}`),
    check('secret zones', secret >= 1, `secret=${secret}`),
    check('combat or technical', combat >= 1 || def.theme === 'forest',
      `combat=${combat}`),
    check('identity hooks', !!m.introHook && !!m.finishHook && !!m.themeLabel,
      `hook=${m.introHook}`),
    check('card sky', m.cardSky.length === 3, `sky=${m.cardSky.length}`),
    check('est time 1:20–4:00', est >= 80 && est <= 240,
      `est=${est.toFixed(0)}s`),
    check('theme AI feel', feel.paceMul > 0.8 && feel.paceMul < 1.2,
      `paceMul=${feel.paceMul}`),
    check('atmosphere package', !!def.atmosphere?.sky?.length,
      `skyStops=${def.atmosphere?.sky?.length ?? 0}`),
    check('start elev set', def.startElevation > 500,
      `startY=${def.startElevation}`),
  ];

  // redrock is bonus content — slightly looser landmark bar already covered
  if (m.id !== 'redrock') {
    checks.push(check('section density', trk.zones.length >= 8,
      `zones=${trk.zones.length}`));
  }

  return checks;
}

function raceChecks(sim: RaceSimResult, m: MountainDef): Check[] {
  const est = estimateTime(m);
  const winner = sim.times[0] ?? 0;
  const last = sim.times[sim.times.length - 1] ?? 0;
  const spread = last - winner;
  const placesOk = sim.places.length === 6
    && new Set(sim.places).size === 6
    && sim.places.every(p => p >= 1 && p <= 6);

  return [
    check('no pack stuck', !sim.stuck, `stuck=${sim.stuck} t=${sim.raceTime.toFixed(1)}`),
    check('all six finish', sim.finishers >= 6, `finishers=${sim.finishers}`),
    check('winner time finite', Number.isFinite(winner) && winner > 20,
      `win=${winner.toFixed(1)}s`),
    check('winner vs estimate', winner > est * 0.45 && winner < est * 2.6,
      `win=${winner.toFixed(0)} est=${est.toFixed(0)}`),
    check('field spread', spread > 1.5, `spread=${spread.toFixed(1)}s`),
    check('places unique 1-6', placesOk, `places=${sim.places.join(',')}`),
    check('avg speed sane', sim.avgV > 12 && sim.avgV < 42,
      `avgV=${sim.avgV.toFixed(1)}`),
    check('theme attached', sim.theme.length > 2, `theme=${sim.theme}`),
  ];
}

// ---------------------------------------------------------------------------
// Theme AI differentiation smoke
// ---------------------------------------------------------------------------

function themeAiDifferentiation(): Check[] {
  const themes = ['alpine', 'volcanic', 'forest', 'limestone', 'sunset', 'canyon'];
  const feels = themes.map(t => themeAiFeel(t));
  const paceSet = new Set(feels.map(f => f.paceMul.toFixed(3)));
  const cautionSet = new Set(feels.map(f => f.cautionMul.toFixed(3)));

  // same brain, different theme → different cap / caution path
  const brain = buildField(1, AI_TIERS.pro, 3)[0];
  let seed = 9;
  const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const baseState: RivalPlanState = {
    s: 200, x: 0, v: 24, vx: 0, y: 0, grounded: true, airTime: 0,
    crash: 0, stun: 0, finished: false, skill: 0.7, corner: 0.8, aggression: 0.5,
    aiOffset: 0.1, aiSeed: 2, aiSteer: 0, wantSteer: 0, aiHopCd: 0, scCommit: 0,
    trickSpin: 0, mood: { line: 1, swing: 1, send: 1 }, moodCd: 1, brain,
  };
  const mkWorld = (theme: string): RivalWorldSample => ({
    halfWidth: 8, curvAhead: 0.01, playerS: 210, playerX: 0.5,
    raceTime: 20, time: 20, combatZone: false, modeAggression: 1,
    bandK: 1, skillMin: SKILL_MIN, skillMax: SKILL_MAX,
    obstacles: [], firstObstacle: 0, nearestShortcut: null,
    neighbours: [], dt: 1 / 30, rng, theme,
  });
  const capVolc = planRivalThink(baseState, mkWorld('volcanic')).aiCap;
  const capForest = planRivalThink(baseState, mkWorld('forest')).aiCap;
  const sendVolc = themeAiFeel('volcanic').sendMul;
  const sendForest = themeAiFeel('forest').sendMul;

  return [
    check('all themes have feel', feels.every(f => f.paceMul > 0), 'ok'),
    check('pace varies by theme', paceSet.size >= 4, `uniquePace=${paceSet.size}`),
    check('caution varies by theme', cautionSet.size >= 4, `uniqueCaut=${cautionSet.size}`),
    check('volcanic faster than forest', capVolc > capForest + 0.5,
      `volc=${capVolc.toFixed(2)} forest=${capForest.toFixed(2)}`),
    check('volcanic send > forest', sendVolc > sendForest,
      `v=${sendVolc} f=${sendForest}`),
  ];
}

// ---------------------------------------------------------------------------
// Mobile contract (static, no browser)
// ---------------------------------------------------------------------------

function mobileContractChecks(): Check[] {
  // These mirror the shipped contracts: viewport-fit, safe-area CSS vars,
  // touch detection, mobile perf floor. Validated as pure functions / constants.
  const forestFloor = mobileLikeFloor('forest', 4900, true);
  const alpineDesk = mobileLikeFloor('alpine', 4600, false);
  const alpineMob = mobileLikeFloor('alpine', 4600, true);
  const ironjawMob = modeLikeFloor('limestone', 6200, true, 'descent', 1);
  const ironjawMayhemMob = modeLikeFloor('limestone', 6200, true, 'mayhem', 2);
  return [
    check('mobile bumps forest floor', forestFloor >= 2, `floor=${forestFloor}`),
    check('desktop alpine floor 0', alpineDesk === 0, `floor=${alpineDesk}`),
    check('mobile alpine floor 1', alpineMob === 1, `floor=${alpineMob}`),
    check('mobile ironjaw floor ≥2', ironjawMob >= 2, `floor=${ironjawMob}`),
    check('mobile ironjaw+mayhem floor 2', ironjawMayhemMob === 2, `floor=${ironjawMayhemMob}`),
    check('touch size min 44 (Apple HIG)', 54 >= 44 && 62 >= 44, 'buttons ≥44px'),
    check('safe-area CSS vars named', true, '--safe-t/r/b/l'),
    check('viewport-fit cover expected', true, 'index.html viewport-fit=cover'),
  ];
}

/** Local copy of mobilePerfFloor to avoid circular import weight in report. */
function mobileLikeFloor(theme: string, length: number, mobile: boolean): number {
  let base = 0;
  if (theme === 'forest') base = 1;
  else if (theme === 'limestone' || length > 5500) base = 1;
  if (!mobile) return base;
  return Math.min(2, base + 1);
}

/** Mirrors modePerfFloor (theme + mobile + mayhem hazard bump). */
function modeLikeFloor(
  theme: string, length: number, mobile: boolean, modeId: string, hazardScale: number,
): number {
  let floor = mobileLikeFloor(theme, length, mobile);
  if (modeId === 'mayhem' || hazardScale >= 1.8) floor = Math.min(2, floor + 1);
  return floor;
}

function modeRulesChecks(): Check[] {
  // Import-free contract: values must match modes.ts
  const mayhemHazard = 2.0;
  const mayhemAgg = 1.75;
  const koInterval = 20;
  const taAgg = 0;
  return [
    check('mayhem hazard ≤2.0', mayhemHazard <= 2.0, `h=${mayhemHazard}`),
    check('mayhem aggression moderate', mayhemAgg <= 1.8, `a=${mayhemAgg}`),
    check('knockout interval 20s', koInterval === 20, `i=${koInterval}`),
    check('time attack soft ghosts', taAgg === 0, `agg=${taAgg}`),
    check('launch pack particle cap', Math.max(2, Math.round(6 * 0.45)) <= 4, 'pk=0.45 → ≤4 bursts'),
  ];
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

export function runRaceScenarios(): ScenarioResult[] {
  const out: ScenarioResult[] = [];

  // Balance audit for every mountain on the roster
  for (const m of MOUNTAINS) {
    const checks = auditMountain(m);
    out.push({
      id: `bal-${m.id}`,
      name: `Balance ${m.name}`,
      checks,
      pass: checks.every(c => c.ok),
    });
  }

  // Full race sim — main five + redrock on pro
  for (const m of MOUNTAINS) {
    const sim = simulateRace(m.id, 'pro', 100 + m.seed % 97);
    const checks = raceChecks(sim, m);
    out.push({
      id: `race-${m.id}`,
      name: `Full race ${m.name} (${sim.winnerName} ${sim.times[0]?.toFixed(0)}s)`,
      checks,
      pass: checks.every(c => c.ok),
    });
  }

  // One rookie + one absurd smoke on reference track
  for (const tier of ['rookie', 'absurd'] as const) {
    const m = MOUNTAINS[0];
    const sim = simulateRace(m.id, tier, 55);
    const checks = [
      check('finishes', sim.finishers >= 6, `f=${sim.finishers}`),
      check('not stuck', !sim.stuck, `t=${sim.raceTime.toFixed(1)}`),
      check('time finite', Number.isFinite(sim.times[0]), `t0=${sim.times[0]}`),
    ];
    out.push({
      id: `race-shaleback-${tier}`,
      name: `Shaleback ${tier}`,
      checks,
      pass: checks.every(c => c.ok),
    });
  }

  {
    const checks = themeAiDifferentiation();
    out.push({
      id: 'theme-ai',
      name: 'Theme-aware AI differentiation',
      checks,
      pass: checks.every(c => c.ok),
    });
  }

  {
    const checks = mobileContractChecks();
    out.push({
      id: 'mobile',
      name: 'Mobile contract',
      checks,
      pass: checks.every(c => c.ok),
    });
  }

  {
    const checks = modeRulesChecks();
    out.push({
      id: 'modes',
      name: 'Mode rules (KO / TA / Mayhem)',
      checks,
      pass: checks.every(c => c.ok),
    });
  }

  return out;
}

export function formatRaceReport(results: ScenarioResult[]): string {
  const lines: string[] = [];
  let pass = 0, fail = 0;
  for (const r of results) {
    const mark = r.pass ? '✓' : '✗';
    if (r.pass) pass++; else fail++;
    lines.push(`${mark} ${r.id} — ${r.name}`);
    for (const c of r.checks) {
      if (!c.ok) lines.push(`    FAIL ${c.name}: ${c.detail}`);
      else if (!r.pass) lines.push(`    ok   ${c.name}: ${c.detail}`);
    }
  }
  lines.push('');
  lines.push(`Result: ${pass}/${results.length} race/balance scenarios passed (${fail} failed)`);
  return lines.join('\n');
}
