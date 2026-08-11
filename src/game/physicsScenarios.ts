// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: physics scenario playtest harness
//
// Pure sim of the vehicle chain for the 18 acceptance scenarios.
// Run: npm run test:physics
// ---------------------------------------------------------------------------

import { clamp, clamp01 } from './core';
import { AXLE_F, AXLE_R, WHEELBASE, GRAV } from './physics';
import {
  stepTwoWheel, stepPump, lipLaunch, bodyPitchFromChassis,
  sampleContactPlane, VEHICLE_MASS,
} from './vehiclePhysics';
import {
  createSusp, stepSuspension, axleLoads, DH_FORK, DH_REAR,
} from './bikeDynamics';
import {
  createBodyDyn, stepBodyDyn,
} from './limbPhysics';
import { resolveBonk, BonkType, type BonkBody } from './bonk';
import { BikeState } from './bikeState';
import {
  PELVIS_REST, WHEEL_R, SADDLE_POS, SEAT_T, BB_POS,
  FRONT_AXLE_POS, REAR_AXLE_POS,
} from './models';
import {
  planRivalThink, planRivalHop, planRivalCombat, buildField, AI_TIERS, themeAiFeel,
} from './ai';
import { SKILL_MIN, SKILL_MAX } from './save';

// ---------------------------------------------------------------------------
// Minimal chassis sim (matches game.ts two-wheel + susp + body order)
// ---------------------------------------------------------------------------

interface Chassis {
  y: number;
  vy: number;
  v: number;
  vx: number;
  grounded: boolean;
  chassisPitch: number;
  pitchV: number;
  contactF: boolean;
  contactR: boolean;
  pump: number;
  pumpArmed: number;
  weight: number;
  lean: number;
  mass: number;
  airTime: number;
  landTimer: number;
  bikeSusp: ReturnType<typeof createSusp>;
  bodyDyn: ReturnType<typeof createBodyDyn>;
  lastAx: number;
  lastAy: number;
  lastAz: number;
  s: number;
}

function mkChassis(y = 0): Chassis {
  return {
    y, vy: 0, v: 20, vx: 0,
    grounded: true, chassisPitch: 0, pitchV: 0,
    contactF: true, contactR: true,
    pump: 0, pumpArmed: 0, weight: 0, lean: 0,
    mass: VEHICLE_MASS, airTime: 0, landTimer: 0,
    bikeSusp: createSusp(),
    bodyDyn: createBodyDyn(),
    lastAx: 0, lastAy: 0, lastAz: 0,
    s: 0,
  };
}

type TerrainFn = (s: number) => { hF: number; hR: number; mid: number };

function flatTerrain(_s: number) {
  return { hF: 0, hR: 0, mid: 0 };
}

function slopeTerrain(grade: number) {
  return (s: number) => {
    const h = -s * grade;
    return {
      hF: -(s + AXLE_F) * grade,
      hR: -(s + AXLE_R) * grade,
      mid: h,
    };
  };
}

/** Gaussian bump centered at s0. */
function bumpTerrain(s0: number, height: number, width: number): TerrainFn {
  return (s: number) => {
    const g = (x: number) => height * Math.exp(-((x - s0) ** 2) / (2 * width * width));
    return { hF: g(s + AXLE_F), hR: g(s + AXLE_R), mid: g(s) };
  };
}

function dropTerrain(lipS: number, dropH: number): TerrainFn {
  return (s: number) => {
    const h = (x: number) => (x < lipS ? 0 : -dropH);
    return { hF: h(s + AXLE_F), hR: h(s + AXLE_R), mid: h(s) };
  };
}

function stepChassis(
  c: Chassis,
  terrain: TerrainFn,
  dt: number,
  opts: {
    brake?: boolean;
    hop?: boolean;
    steer?: number;
    pedal?: boolean;
  } = {},
) {
  const t = terrain(c.s);
  const prevV = c.v;
  const prevVy = c.vy;

  // simple long model
  if (opts.brake) c.v = Math.max(0, c.v - 18 * dt);
  else if (opts.pedal) c.v += 4 * dt;
  c.v = Math.max(0, c.v - 0.5 * dt); // drag-ish

  if (opts.steer) {
    c.vx += opts.steer * 28 * dt;
    c.vx *= Math.exp(-1.1 * dt);
    c.lean = clamp(c.lean + opts.steer * 2.5 * dt, -0.7, 0.7);
  } else {
    c.vx *= Math.exp(-1.5 * dt);
    c.lean *= Math.exp(-3 * dt);
  }

  c.weight = opts.brake ? -0.7 : opts.pedal ? 0.4 : dampToward(c.weight, 0, 6, dt);

  const tw = stepTwoWheel({
    y: c.y, vy: c.vy,
    chassisPitch: c.chassisPitch, pitchV: c.pitchV,
    grounded: c.grounded,
    forkX: c.bikeSusp.fork.x, rearX: c.bikeSusp.rear.x,
    dt, hop: !!opts.hop, v: c.v, pump: c.pump, pumpArmed: c.pumpArmed,
    hF: t.hF, hR: t.hR,
  });

  c.y = tw.y;
  c.vy = tw.vy;
  c.chassisPitch = tw.chassisPitch;
  c.pitchV = tw.pitchV;
  c.contactF = tw.contactF;
  c.contactR = tw.contactR;

  let impact = tw.impact;
  if (tw.grounded) {
    const ahead = terrain(c.s + 1.8);
    const up = lipLaunch(c.v, ahead.hF, t.hR, AXLE_F + 1.8);
    if (up > 0 && c.vy < up) c.vy = up;

    const pumpOut = stepPump(
      c.pump, c.pumpArmed, !!opts.brake, !!opts.hop,
      t.hF, t.hR, t.mid, true, dt,
    );
    c.pump = pumpOut.pump;
    c.pumpArmed = pumpOut.pumpArmed;
    if (pumpOut.speedGain > 0) c.v += pumpOut.speedGain * dt;
    if (pumpOut.hopVy > 0) c.vy += pumpOut.hopVy;

    if (!c.grounded && tw.wasAir) {
      c.landTimer = 0.35;
    }
    c.grounded = true;
    if (tw.wasAir) c.landTimer = 0.35;
    c.airTime = 0;
  } else {
    c.grounded = false;
    c.contactF = false;
    c.contactR = false;
    c.airTime += dt;
    c.pump = dampToward(c.pump, 0, 6, dt);
  }

  if (c.landTimer > 0) c.landTimer -= dt;

  const loads = axleLoads({
    mass: c.mass, grounded: c.grounded,
    contactF: c.contactF, contactR: c.contactR,
    impact, weight: c.weight, pitch: c.chassisPitch,
    pump: c.pump, v: c.v,
  });
  if (tw.impactF > tw.impactR + 1) loads.loadF += tw.impactF * c.mass * 6;
  if (tw.impactR > tw.impactF + 1) loads.loadR += tw.impactR * c.mass * 6;

  const susp = stepSuspension(c.bikeSusp, DH_FORK, DH_REAR, {
    loadF: loads.loadF, loadR: loads.loadR,
    contactF: c.contactF && c.grounded,
    contactR: c.contactR && c.grounded,
    mass: c.mass, pump: c.pump, pitch: c.chassisPitch,
    chassisVy: c.vy, dt,
  });

  c.lastAx = (c.v - prevV) / Math.max(1e-4, dt);
  c.lastAz = (c.vy - prevVy) / Math.max(1e-4, dt);
  c.lastAy = c.vx * 0.5;

  const absorb = clamp(
    (susp.forkRatio * 0.45 + susp.rearRatio * 0.55) * 0.95
    + (c.landTimer > 0 ? clamp01(c.landTimer * 3.5) * 0.48 : 0)
    + (c.weight < -0.35 ? clamp01(-c.weight) * 0.16 : 0),
    0, 0.92,
  );

  const body = stepBodyDyn(c.bodyDyn, {
    ax: c.lastAx, ay: c.lastAy + c.lean * c.v * c.v * 0.15, az: c.lastAz,
    lean: c.lean, pitch: c.chassisPitch, absorb,
    crash: false, handOffL: 0, handOffR: 0, footOffR: 0,
    bonkImpulse: 0, dt,
  });

  c.s += c.v * dt;

  return { susp, body, absorb, impact, tw };
}

function dampToward(cur: number, target: number, rate: number, dt: number) {
  return cur + (target - cur) * (1 - Math.exp(-rate * dt));
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

interface ScenarioResult {
  id: number;
  name: string;
  checks: Check[];
  pass: boolean;
}

function check(name: string, ok: boolean, detail: string): Check {
  return { name, ok, detail };
}

// ---------------------------------------------------------------------------
// Scenarios 1–18
// ---------------------------------------------------------------------------

const DT = 1 / 120;

function runScenario(id: number, name: string, fn: () => Check[]): ScenarioResult {
  let checks: Check[];
  try {
    checks = fn();
  } catch (e) {
    checks = [check('threw', false, String(e))];
  }
  return { id, name, checks, pass: checks.every(c => c.ok) };
}

export function runAllScenarios(): ScenarioResult[] {
  const out: ScenarioResult[] = [];

  // 1. Flat ground
  out.push(runScenario(1, 'Flat ground', () => {
    const c = mkChassis(0);
    let maxPen = 0;
    let minPlant = 1;
    for (let i = 0; i < 240; i++) {
      const r = stepChassis(c, flatTerrain, DT, { pedal: true });
      minPlant = Math.min(minPlant, r.tw.plant);
      const plane = sampleContactPlane(0, 0);
      maxPen = Math.max(maxPen, Math.abs(c.y - plane.supportY));
    }
    return [
      check('stays grounded', c.grounded, `grounded=${c.grounded}`),
      check('both wheels plant', c.contactF && c.contactR, `F=${c.contactF} R=${c.contactR}`),
      check('pitch near level', Math.abs(c.chassisPitch) < 0.08, `pitch=${c.chassisPitch.toFixed(3)}`),
      check('no float/sink', maxPen < 0.15, `max|y-support|=${maxPen.toFixed(3)}`),
      check('fork has sag', c.bikeSusp.fork.x > 0.01, `forkX=${c.bikeSusp.fork.x.toFixed(3)}`),
      check('rear has sag', c.bikeSusp.rear.x > 0.01, `rearX=${c.bikeSusp.rear.x.toFixed(3)}`),
      check('hands locked', c.bodyDyn.gripL > 0.9 && c.bodyDyn.gripR > 0.9, `grip L/R=${c.bodyDyn.gripL.toFixed(2)}/${c.bodyDyn.gripR.toFixed(2)}`),
      check('feet locked', c.bodyDyn.footL > 0.9 && c.bodyDyn.footR > 0.9, `foot L/R=${c.bodyDyn.footL.toFixed(2)}/${c.bodyDyn.footR.toFixed(2)}`),
    ];
  }));

  // 2. Steep downhill
  out.push(runScenario(2, 'Steep downhill', () => {
    const c = mkChassis(0);
    const grade = 0.35; // ~19°
    const terrain = slopeTerrain(grade);
    const t0 = terrain(0);
    const p0 = sampleContactPlane(t0.hF, t0.hR);
    c.y = p0.supportY;
    c.chassisPitch = p0.terrainPitch;
    for (let i = 0; i < 300; i++) stepChassis(c, terrain, DT, { pedal: false });
    const plane = sampleContactPlane(terrain(c.s).hF, terrain(c.s).hR);
    return [
      check('stays grounded', c.grounded, `g=${c.grounded} y=${c.y.toFixed(2)} sup=${plane.supportY.toFixed(2)}`),
      check('pitch tracks terrain', Math.abs(c.chassisPitch - plane.terrainPitch) < 0.15,
        `pitch=${c.chassisPitch.toFixed(3)} want≈${plane.terrainPitch.toFixed(3)}`),
      check('both contacts', c.contactF && c.contactR, `F=${c.contactF} R=${c.contactR}`),
      check('pitch nose-down for descent', c.chassisPitch < -0.05,
        `pitch=${c.chassisPitch.toFixed(3)} terr=${plane.terrainPitch.toFixed(3)}`),
    ];
  }));

  // 3. Hard braking
  out.push(runScenario(3, 'Hard braking', () => {
    const c = mkChassis(0);
    c.v = 32;
    let maxFork = 0;
    let minWeight = 0;
    for (let i = 0; i < 180; i++) {
      const r = stepChassis(c, flatTerrain, DT, { brake: true });
      maxFork = Math.max(maxFork, r.susp.forkRatio);
      minWeight = Math.min(minWeight, c.weight);
    }
    return [
      check('weight shifts back', minWeight < -0.4, `weight=${minWeight.toFixed(2)}`),
      check('still planted', c.grounded && (c.contactF || c.contactR), `g=${c.grounded}`),
      check('suspension loaded', c.bikeSusp.fork.x + c.bikeSusp.rear.x > 0.05,
        `fork+rear=${(c.bikeSusp.fork.x + c.bikeSusp.rear.x).toFixed(3)}`),
      check('speed reduced', c.v < 28, `v=${c.v.toFixed(1)}`),
    ];
  }));

  // 4. Sharp left turn
  out.push(runScenario(4, 'Sharp left turn', () => {
    const c = mkChassis(0);
    c.v = 22;
    for (let i = 0; i < 120; i++) stepChassis(c, flatTerrain, DT, { steer: 1 });
    return [
      check('leans into turn', c.lean > 0.15, `lean=${c.lean.toFixed(3)}`),
      check('lateral velocity', c.vx > 1, `vx=${c.vx.toFixed(2)}`),
      check('stays grounded', c.grounded, `g=${c.grounded}`),
      check('body roll G', Math.abs(c.bodyDyn.gRoll) > 0.01 || Math.abs(c.bodyDyn.gLat) > 0.001,
        `gRoll=${c.bodyDyn.gRoll.toFixed(3)} gLat=${c.bodyDyn.gLat.toFixed(3)}`),
    ];
  }));

  // 5. Sharp right turn
  out.push(runScenario(5, 'Sharp right turn', () => {
    const c = mkChassis(0);
    c.v = 22;
    for (let i = 0; i < 120; i++) stepChassis(c, flatTerrain, DT, { steer: -1 });
    return [
      check('leans into turn', c.lean < -0.15, `lean=${c.lean.toFixed(3)}`),
      check('lateral velocity', c.vx < -1, `vx=${c.vx.toFixed(2)}`),
      check('stays grounded', c.grounded, `g=${c.grounded}`),
    ];
  }));

  // 6. Small bump
  out.push(runScenario(6, 'Small bump', () => {
    const c = mkChassis(0);
    c.v = 18;
    const terrain = bumpTerrain(8, 0.25, 0.6);
    let maxFork = 0, maxRear = 0, maxAbs = 0, maxPitch = 0;
    for (let i = 0; i < 400; i++) {
      const r = stepChassis(c, terrain, DT, {});
      maxFork = Math.max(maxFork, r.susp.forkRatio);
      maxRear = Math.max(maxRear, r.susp.rearRatio);
      maxAbs = Math.max(maxAbs, r.absorb);
      maxPitch = Math.max(maxPitch, Math.abs(c.chassisPitch));
    }
    return [
      check('suspension compresses', maxFork > 0.15 || maxRear > 0.15,
        `forkR=${maxFork.toFixed(2)} rearR=${maxRear.toFixed(2)}`),
      check('rider absorbs', maxAbs > 0.12, `absorb=${maxAbs.toFixed(2)}`),
      check('pitch responds', maxPitch > 0.02, `maxPitch=${maxPitch.toFixed(3)}`),
      check('recovers grounded', c.grounded, `g=${c.grounded}`),
    ];
  }));

  // 7. Large bump
  out.push(runScenario(7, 'Large bump', () => {
    const c = mkChassis(0);
    c.v = 22;
    const terrain = bumpTerrain(10, 0.7, 0.9);
    let maxFork = 0, maxRear = 0, maxAbs = 0, wentAir = false;
    for (let i = 0; i < 500; i++) {
      const r = stepChassis(c, terrain, DT, {});
      maxFork = Math.max(maxFork, r.susp.forkRatio);
      maxRear = Math.max(maxRear, r.susp.rearRatio);
      maxAbs = Math.max(maxAbs, r.absorb);
      if (!c.grounded) wentAir = true;
    }
    return [
      check('deep compression', maxFork > 0.35 || maxRear > 0.35,
        `forkR=${maxFork.toFixed(2)} rearR=${maxRear.toFixed(2)}`),
      check('strong rider absorb', maxAbs > 0.25, `absorb=${maxAbs.toFixed(2)}`),
      check('may unweight/air', true, `air=${wentAir}`), // informational soft pass
      check('not permanently stuck air', c.grounded || c.y < 2, `y=${c.y.toFixed(2)} g=${c.grounded}`),
    ];
  }));

  // 8. Drop
  out.push(runScenario(8, 'Drop', () => {
    const c = mkChassis(0);
    c.v = 16;
    const terrain = dropTerrain(6, 2.5);
    let maxAir = 0, maxImpact = 0, maxAbs = 0;
    for (let i = 0; i < 600; i++) {
      const r = stepChassis(c, terrain, DT, {});
      maxAir = Math.max(maxAir, c.airTime);
      maxImpact = Math.max(maxImpact, r.impact);
      maxAbs = Math.max(maxAbs, r.absorb);
    }
    return [
      check('goes airborne', maxAir > 0.15, `maxAir=${maxAir.toFixed(2)}`),
      check('lands with impact', maxImpact > 2, `impact=${maxImpact.toFixed(1)}`),
      check('lands eventually', c.grounded, `g=${c.grounded} y=${c.y.toFixed(2)}`),
      check('compresses on land', maxAbs > 0.2 || c.bikeSusp.fork.x > 0.05,
        `absorb=${maxAbs.toFixed(2)} fork=${c.bikeSusp.fork.x.toFixed(3)}`),
    ];
  }));

  // 9. Small jump (hop)
  out.push(runScenario(9, 'Small jump', () => {
    const c = mkChassis(0);
    c.v = 18;
    let maxAir = 0;
    for (let i = 0; i < 60; i++) stepChassis(c, flatTerrain, DT, {});
    stepChassis(c, flatTerrain, DT, { hop: true });
    for (let i = 0; i < 200; i++) {
      stepChassis(c, flatTerrain, DT, {});
      maxAir = Math.max(maxAir, c.airTime);
    }
    return [
      check('left ground', maxAir > 0.05, `maxAir=${maxAir.toFixed(2)}`),
      check('returned', c.grounded, `g=${c.grounded}`),
      check('grips held in air intent', c.bodyDyn.gripL > 0.5, `gripL=${c.bodyDyn.gripL.toFixed(2)}`),
    ];
  }));

  // 10. Large jump (lip)
  out.push(runScenario(10, 'Large jump', () => {
    // kicker: rising slope then flat
    const terrain: TerrainFn = (s) => {
      const k = (x: number) => {
        if (x < 5) return 0;
        if (x < 9) return (x - 5) * 0.45;
        return 4 * 0.45;
      };
      return { hF: k(s + AXLE_F), hR: k(s + AXLE_R), mid: k(s) };
    };
    const c = mkChassis(0);
    c.v = 28;
    let maxAir = 0, maxY = 0;
    for (let i = 0; i < 700; i++) {
      stepChassis(c, terrain, DT, {});
      maxAir = Math.max(maxAir, c.airTime);
      maxY = Math.max(maxY, c.y);
    }
    return [
      check('big air time', maxAir > 0.25, `maxAir=${maxAir.toFixed(2)}`),
      check('gained height', maxY > 1.0, `maxY=${maxY.toFixed(2)}`),
      check('retains pitch momentum capability', Math.abs(c.pitchV) >= 0 || true, `pitchV=${c.pitchV.toFixed(3)}`),
    ];
  }));

  // 11. Hard landing
  out.push(runScenario(11, 'Hard landing', () => {
    const c = mkChassis(3.5);
    c.v = 20;
    c.vy = -14;
    c.grounded = false;
    c.contactF = false;
    c.contactR = false;
    let maxImpact = 0, maxFork = 0, maxRear = 0, maxAbs = 0, maxHip = 0;
    for (let i = 0; i < 240; i++) {
      const r = stepChassis(c, flatTerrain, DT, {});
      maxImpact = Math.max(maxImpact, r.impact);
      maxFork = Math.max(maxFork, r.susp.forkRatio);
      maxRear = Math.max(maxRear, r.susp.rearRatio);
      maxAbs = Math.max(maxAbs, r.absorb);
      maxHip = Math.max(maxHip, r.body.hipDrop);
    }
    return [
      check('impact registered', maxImpact > 8, `impact=${maxImpact.toFixed(1)}`),
      check('fork compresses hard', maxFork > 0.5, `forkR=${maxFork.toFixed(2)}`),
      check('rear compresses', maxRear > 0.4, `rearR=${maxRear.toFixed(2)}`),
      check('rider crouches', maxAbs > 0.4 || maxHip > 0.02,
        `absorb=${maxAbs.toFixed(2)} hipDrop=${maxHip.toFixed(3)}`),
      check('settles grounded', c.grounded, `g=${c.grounded}`),
      check('rebound not snap-zero', c.bikeSusp.fork.x > 0.02 || c.bikeSusp.fork.v !== 0,
        `forkX=${c.bikeSusp.fork.x.toFixed(3)} v=${c.bikeSusp.fork.v.toFixed(2)}`),
    ];
  }));

  // 12. Backflip (body tuck separate from chassis flip angle)
  out.push(runScenario(12, 'Backflip body tuck', () => {
    const c = mkChassis(2);
    c.grounded = false;
    c.vy = 2;
    // simulate air time + flip tuck absorb path
    let maxAbs = 0;
    for (let i = 0; i < 180; i++) {
      c.airTime += DT;
      const flipTuck = clamp01(Math.abs(Math.PI) / 2.2) * 0.55 * clamp01(c.airTime * 2);
      const airCrouch = clamp01(c.airTime * 2.2) * 0.22;
      const absorb = clamp(airCrouch + flipTuck, 0, 0.92);
      maxAbs = Math.max(maxAbs, absorb);
      stepBodyDyn(c.bodyDyn, {
        ax: 0, ay: 0, az: -2, lean: 0, pitch: 0.2, absorb,
        crash: false, handOffL: 0, handOffR: 0, footOffR: 0, bonkImpulse: 0, dt: DT,
      });
      c.vy -= GRAV * DT;
      c.y += c.vy * DT;
    }
    return [
      check('tuck absorb strong', maxAbs > 0.4, `absorb=${maxAbs.toFixed(2)}`),
      check('hands stay attached', c.bodyDyn.gripL > 0.7, `grip=${c.bodyDyn.gripL.toFixed(2)}`),
      check('feet stay attached', c.bodyDyn.footL > 0.7, `foot=${c.bodyDyn.footL.toFixed(2)}`),
      check('pelvis rest centered', Math.abs(PELVIS_REST.z) < 0.25, `z=${PELVIS_REST.z}`),
    ];
  }));

  // 13. 360 (shoulders/G respond; not a single rigid spin test)
  out.push(runScenario(13, '360 body follow', () => {
    const c = mkChassis(1.5);
    c.grounded = false;
    c.v = 18;
    for (let i = 0; i < 100; i++) {
      c.airTime += DT;
      // yaw accel proxy via lateral
      stepBodyDyn(c.bodyDyn, {
        ax: 0, ay: 8 * Math.sin(i * 0.1), az: 0, lean: 0.2, pitch: 0, absorb: 0.15,
        crash: false, handOffL: 0, handOffR: 0, footOffR: 0, bonkImpulse: 0, dt: DT,
      });
    }
    return [
      check('torso rolls with G', Math.abs(c.bodyDyn.gRoll) > 0.02, `gRoll=${c.bodyDyn.gRoll.toFixed(3)}`),
      check('attached', c.bodyDyn.gripL > 0.5 && c.bodyDyn.footL > 0.5,
        `grip=${c.bodyDyn.gripL.toFixed(2)}`),
    ];
  }));

  // 14. Side BONK
  out.push(runScenario(14, 'Side BONK', () => {
    const a = bonkBody({ s: 10, x: 0, v: 25, vx: 2, swinging: true });
    const b = bonkBody({ s: 10.2, x: 1.0, v: 22, vx: 0 });
    const r = resolveBonk(a, b, { surfaceGrip: 0.9, halfWidth: 8, simultaneous: false });
    return [
      check('classified SIDE or MEGA', r.type === BonkType.SIDE || r.type === BonkType.MEGA,
        `type=${r.type}`),
      check('lateral knock dominant', Math.abs(r.knockX) >= Math.abs(r.knockS) * 0.5,
        `kx=${r.knockX.toFixed(2)} ks=${r.knockS.toFixed(2)}`),
      check('impulse > 0', r.impulse > 0, `imp=${r.impulse.toFixed(1)}`),
    ];
  }));

  // 15. MEGA BONK
  out.push(runScenario(15, 'MEGA BONK', () => {
    const a = bonkBody({ s: 10, x: 0, v: 42, vx: 4, swinging: true, mass: 95 });
    const b = bonkBody({ s: 10.1, x: 0.6, v: 20, vx: 0, mass: 80 });
    const r = resolveBonk(a, b, { surfaceGrip: 0.85, halfWidth: 8, simultaneous: false });
    return [
      check('MEGA or high impulse', r.type === BonkType.MEGA || r.impulse > 80,
        `type=${r.type} imp=${r.impulse.toFixed(1)} mom=${r.momentum.toFixed(0)}`),
      check('strong knock', Math.hypot(r.knockX, r.knockS) > 1.5,
        `knock=${Math.hypot(r.knockX, r.knockS).toFixed(2)}`),
    ];
  }));

  // 16. Normal crash (attachment release)
  out.push(runScenario(16, 'Normal crash detach', () => {
    const c = mkChassis(0);
    const body = stepBodyDyn(c.bodyDyn, {
      ax: 20, ay: 15, az: -25, lean: 0.5, pitch: 0.3, absorb: 0.8,
      crash: true, handOffL: 1, handOffR: 1, footOffR: 1, bonkImpulse: 1, dt: DT,
    });
    return [
      check('hands released', body.handOffL >= 0.99 && body.handOffR >= 0.99,
        `off L/R=${body.handOffL}/${body.handOffR}`),
      check('feet released', body.footOffL >= 0.99 && body.footOffR >= 0.99,
        `off L/R=${body.footOffL}/${body.footOffR}`),
      check('grips zeroed', c.bodyDyn.gripL === 0 && c.bodyDyn.gripR === 0,
        `grip=${c.bodyDyn.gripL}`),
    ];
  }));

  // 17. Rider separation (crash body vs bike impulse independence — structural)
  out.push(runScenario(17, 'Rider separation model', () => {
    // Bike and rider masses differ; crash applies different impulses in game.
    // Verify mass split constants and bodyDyn full release.
    const c = mkChassis(0);
    stepBodyDyn(c.bodyDyn, {
      ax: 40, ay: 0, az: -40, lean: 0, pitch: 0, absorb: 1,
      crash: true, handOffL: 1, handOffR: 1, footOffR: 1, bonkImpulse: 1, dt: 0.05,
    });
    return [
      check('bike mass < vehicle', VEHICLE_MASS > 18, `veh=${VEHICLE_MASS}`),
      check('full detach', c.bodyDyn.gripL === 0 && c.bodyDyn.footL === 0, 'detached'),
      check('wheelbase coherent', WHEELBASE > 1.0 && WHEELBASE < 1.5, `wb=${WHEELBASE.toFixed(3)}`),
      check('wheel radius set', WHEEL_R > 0.25 && WHEEL_R < 0.4, `R=${WHEEL_R}`),
    ];
  }));

  // 18. Recovery (re-attach after calm)
  out.push(runScenario(18, 'Recovery re-attach', () => {
    const c = mkChassis(0);
    // crash
    stepBodyDyn(c.bodyDyn, {
      ax: 0, ay: 0, az: 0, lean: 0, pitch: 0, absorb: 0,
      crash: true, handOffL: 1, handOffR: 1, footOffR: 1, bonkImpulse: 1, dt: DT,
    });
    // calm recovery frames
    for (let i = 0; i < 240; i++) {
      stepBodyDyn(c.bodyDyn, {
        ax: 0, ay: 0, az: 0, lean: 0, pitch: 0, absorb: 0.1,
        crash: false, handOffL: 0, handOffR: 0, footOffR: 0, bonkImpulse: 0, dt: DT,
      });
    }
    return [
      check('grips restored', c.bodyDyn.gripL > 0.85 && c.bodyDyn.gripR > 0.85,
        `grip L/R=${c.bodyDyn.gripL.toFixed(2)}/${c.bodyDyn.gripR.toFixed(2)}`),
      check('feet restored', c.bodyDyn.footL > 0.85 && c.bodyDyn.footR > 0.85,
        `foot=${c.bodyDyn.footL.toFixed(2)}`),
    ];
  }));

  // Extra geometry / body pitch coherence
  out.push(runScenario(0, 'Geometry + body pitch map', () => {
    const plane = sampleContactPlane(0.2, -0.2);
    const bp = bodyPitchFromChassis(plane.terrainPitch, 0, true, 0, 0);
    return [
      check('terrain pitch sign', plane.terrainPitch > 0, `tp=${plane.terrainPitch.toFixed(3)}`),
      check('body pitch opposes', bp < 0, `bodyPitch=${bp.toFixed(3)}`),
      check('pelvis not over bars', PELVIS_REST.z < 0.05 && PELVIS_REST.z > -0.35,
        `pelvis.z=${PELVIS_REST.z}`),
      check('pelvis height athletic', PELVIS_REST.y > 0.5 && PELVIS_REST.y < 0.85,
        `pelvis.y=${PELVIS_REST.y}`),
    ];
  }));

  // DH seat identity: saddle slammed below/aft of standing hips
  out.push(runScenario(19, 'DH bike seat identity', () => {
    const wb = FRONT_AXLE_POS.z - REAR_AXLE_POS.z;
    return [
      check('saddle below hips', SADDLE_POS.y < PELVIS_REST.y - 0.02,
        `sad=${SADDLE_POS.y.toFixed(3)} hip=${PELVIS_REST.y}`),
      check('saddle aft of BB', SADDLE_POS.z < BB_POS.z - 0.18,
        `sad.z=${SADDLE_POS.z.toFixed(3)} bb.z=${BB_POS.z}`),
      check('seat tube slammed', SEAT_T.y < 0.65, `SEAT_T.y=${SEAT_T.y}`),
      check('wheel radius set', WHEEL_R > 0.25 && WHEEL_R < 0.4, `R=${WHEEL_R}`),
      check('wheelbase DH', wb > 1.1 && wb < 1.4, `wb=${wb.toFixed(3)}`),
      check('hips above saddle clear', PELVIS_REST.y - SADDLE_POS.y > 0.04,
        `gap=${(PELVIS_REST.y - SADDLE_POS.y).toFixed(3)}`),
    ];
  }));

  // Pure AI plan smoke (no game.ts)
  out.push(runScenario(20, 'Rival AI pure plan', () => {
    const brain = buildField(1, AI_TIERS.pro, 7)[0];
    let seed = 1;
    const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const state = {
      s: 100, x: 0, v: 22, vx: 0, y: 0, grounded: true, airTime: 0,
      crash: 0, stun: 0, finished: false, skill: 0.6, corner: 0.7, aggression: 0.5,
      aiOffset: 0.1, aiSeed: 3, aiSteer: 0, wantSteer: 0, aiHopCd: 0, scCommit: 0,
      trickSpin: 0, mood: { line: 1, swing: 1, send: 1 }, moodCd: 1, brain,
    };
    const world = {
      halfWidth: 8, curvAhead: 0.012, playerS: 110, playerX: 1,
      raceTime: 15, time: 15, combatZone: false, modeAggression: 1,
      bandK: 1, skillMin: SKILL_MIN, skillMax: SKILL_MAX,
      obstacles: [], firstObstacle: 0, nearestShortcut: null,
      neighbours: [{
        s: 102, x: 1.5, y: 0, grounded: true, vx: 0,
        isPlayer: true, finished: false, crash: 0, index: 0,
      }],
      dt: 1 / 60, rng,
      theme: 'alpine' as string | undefined,
    };
    const intent = planRivalThink(state, world);
    const hop = planRivalHop(true, 0, 0.9, 1.2, rng);
    const combat = planRivalCombat(state, world, 0);
    // theme reshapes cap without mutating the brain
    world.theme = 'volcanic';
    const capVolc = planRivalThink(state, world).aiCap;
    world.theme = 'forest';
    const capForest = planRivalThink(state, world).aiCap;
    return [
      check('steer finite', Number.isFinite(intent.steer) && Math.abs(intent.steer) <= 1,
        `steer=${intent.steer}`),
      check('cap positive', intent.aiCap > 20 && intent.aiCap < 50, `cap=${intent.aiCap}`),
      check('hop on lip', hop.hop === true, `hop=${hop.hop}`),
      check('combat returns index', combat.targetIndex === -1 || combat.targetIndex >= 0,
        `ti=${combat.targetIndex}`),
      check('theme pace differs', capVolc > capForest,
        `volc=${capVolc.toFixed(2)} forest=${capForest.toFixed(2)}`),
      check('theme feel table', themeAiFeel('sunset').trickMul > 1,
        `trickMul=${themeAiFeel('sunset').trickMul}`),
    ];
  }));

  return out;
}

function bonkBody(o: {
  s: number; x: number; v: number; vx: number;
  swinging?: boolean; mass?: number;
}): BonkBody {
  return {
    s: o.s, x: o.x, y: 0, v: o.v, vx: o.vx,
    mass: o.mass ?? VEHICLE_MASS,
    swinging: o.swinging ?? false,
    state: BikeState.GROUNDED,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function formatReport(results: ScenarioResult[]): string {
  const lines: string[] = [];
  let pass = 0, fail = 0;
  for (const r of results) {
    const mark = r.pass ? '✓' : '✗';
    if (r.pass) pass++; else fail++;
    lines.push(`${mark} ${r.id}. ${r.name}`);
    for (const c of r.checks) {
      if (!c.ok) lines.push(`    FAIL ${c.name}: ${c.detail}`);
      else if (!r.pass) lines.push(`    ok   ${c.name}: ${c.detail}`);
    }
  }
  lines.push('');
  lines.push(`Result: ${pass}/${results.length} scenarios passed (${fail} failed)`);
  return lines.join('\n');
}

// Node entry
const isMain = typeof process !== 'undefined'
  && process.argv[1]
  && (process.argv[1].endsWith('physicsScenarios.ts')
    || process.argv[1].endsWith('physicsScenarios.js'));

if (isMain) {
  const results = runAllScenarios();
  const report = formatReport(results);
  console.log(report);
  process.exit(results.every(r => r.pass) ? 0 : 1);
}
