// ---------------------------------------------------------------------------
// SHALEBACK RUN — REFERENCE-QUALITY TRACK
//
// The classic Dirt Bonk Descent mountain. Cool mountain daylight, green
// forest, warm brown dirt, gray rock. Ten hand-authored sections with full
// landmarks, setpieces, and alpine atmosphere.
//
// Pacing: release → tension → tension → combat → release → tension →
//         reward → dread → combat → release
// ---------------------------------------------------------------------------
import type { Zone } from './track';
import type { TrackDefinition, ScriptedFeature, TrackLandmark } from './trackDef';
import { ATMOS_ALPINE } from './trackDef';

export const SHALEBACK_SECTIONS: Zone[] = [
  {
    name: '01 THE DROP', sub: 'STRAIGHT DOWN',
    t0: 0.000, t1: 0.075,
    dirt: 0x8f6a44, verge: 0x6f9440, far: 0x54783a,
    width: 20, rough: 0.30, steep: 0.115, surface: 'dirt',
    treeDensity: 0.18, treeType: 'pine', rockDensity: 0.10,
    crowd: 3.0, fog: 0.85,
    features: ['roller', 'roller', 'kicker'],
    props: ['cone', 'bale'],
    twist: 0.25,
    setpiece: 'START GATE',
  },
  {
    name: '02 PINE PANIC', sub: 'NO SIGHTLINES',
    t0: 0.075, t1: 0.185,
    dirt: 0x5f4a30, verge: 0x2f5a26, far: 0x1d3a19,
    width: 11.5, rough: 1.30, steep: 0.030, surface: 'dirt',
    treeDensity: 1.50, treeType: 'pine', rockDensity: 0.35,
    // slight fog pullback for line readability at full speed
    crowd: 0.35, fog: 1.40,
    features: ['whoops', 'kicker', 'berm', 'roller'],
    props: ['rock', 'fence', 'rock', 'sign'],
    twist: 1.50,
    setpiece: 'PINE PLUNGE',
  },
  {
    name: '03 ROCK & ROLL', sub: 'PICK YOUR LINE',
    t0: 0.185, t1: 0.290,
    dirt: 0xa87350, verge: 0x8a6742, far: 0x6a4f33,
    width: 13, rough: 1.55, steep: 0.045, surface: 'rock',
    treeDensity: 0.10, treeType: 'none', rockDensity: 1.55,
    crowd: 0.6, fog: 0.95,
    features: ['whoops', 'roller', 'kicker', 'berm'],
    props: ['rock', 'boulder', 'barrier', 'rock'],
    // technical off-camber cut through the rocks
    secret: true, twist: 1.25,
    setpiece: 'CANYON CUT',
  },
  {
    name: '04 BONK BRIDGE', sub: 'NOWHERE TO GO',
    t0: 0.290, t1: 0.360,
    dirt: 0x6b5540, verge: 0x4a3b2c, far: 0x33291f,
    width: 7, rough: 0.10, steep: -0.055, surface: 'dirt',
    treeDensity: 0.0, treeType: 'none', rockDensity: 0.0,
    crowd: 2.4, fog: 1.15,
    features: ['roller'],
    props: ['barrel'],
    dropSide: 0, dropDepth: 3.4, noTape: true, rails: true,
    twist: 0.15, combat: true,
  },
  {
    name: '05 BIG AIR', sub: 'SEND IT',
    t0: 0.360, t1: 0.455,
    dirt: 0xb08c55, verge: 0x7d9440, far: 0x64803a,
    width: 18, rough: 0.30, steep: 0.020, surface: 'dirt',
    treeDensity: 0.12, treeType: 'mixed', rockDensity: 0.10,
    crowd: 2.8, fog: 0.7,
    features: ['table', 'kicker', 'double', 'berm'],
    props: ['ramp', 'cone', 'bale', 'sign', 'barrier'],
    twist: 0.2,
    setpiece: 'BIG AIR',
  },
  {
    name: '06 MUD PIT', sub: 'NO GRIP',
    t0: 0.455, t1: 0.550,
    dirt: 0x453a2a, verge: 0x3f5230, far: 0x2b3a1e,
    width: 14, rough: 1.05, steep: -0.030, surface: 'mud',
    treeDensity: 0.85, treeType: 'broad', rockDensity: 0.15,
    crowd: 0.8, fog: 1.5,
    features: ['roller', 'whoops', 'berm'],
    props: ['water', 'puddle', 'bale', 'water', 'bale'],
    twist: 1.15,
    setpiece: 'MUDPIT MIRE',
  },
  {
    name: '07 SECRET SEND', sub: 'IF YOU KNOW',
    t0: 0.550, t1: 0.640,
    dirt: 0x8a7148, verge: 0x5f7f38, far: 0x47632c,
    width: 13.5, rough: 0.75, steep: 0.030, surface: 'dirt',
    treeDensity: 0.95, treeType: 'mixed', rockDensity: 0.30,
    crowd: 0.5, fog: 1.2,
    features: ['berm', 'roller', 'kicker'],
    props: ['rock', 'barrel'],
    secret: true, twist: 1.45,
    setpiece: 'PINE PLUNGE',
  },
  {
    name: '08 CLIFFSIDE', sub: 'DO NOT LOOK DOWN',
    t0: 0.640, t1: 0.740,
    dirt: 0x9c8262, verge: 0x6d5c44, far: 0x4a3f30,
    width: 9, rough: 0.85, steep: 0.040, surface: 'gravel',
    treeDensity: 0.15, treeType: 'pine', rockDensity: 0.70,
    crowd: 0.45, fog: 0.8,
    features: ['roller', 'berm', 'whoops'],
    props: ['drift', 'rock', 'drift', 'sign'],
    dropSide: 1, dropDepth: 5.0, twist: 1.30,
    setpiece: 'CANYON CUT',
  },
  {
    name: '09 THE BONK CANYON', sub: 'SETTLE IT HERE',
    t0: 0.740, t1: 0.870,
    dirt: 0xb2653c, verge: 0x8d5636, far: 0x6f432b,
    width: 17, rough: 0.55, steep: 0.035, surface: 'gravel',
    treeDensity: 0.05, treeType: 'none', rockDensity: 1.10,
    crowd: 3.0, fog: 1.0,
    features: ['roller', 'kicker', 'berm', 'double'],
    props: ['barrier', 'barrel', 'bale', 'boulder', 'barrier'],
    twist: 0.75, combat: true,
    setpiece: 'CANYON CUT',
  },
  {
    name: '10 FINAL SEND', sub: 'ALL OF IT',
    t0: 0.870, t1: 1.001,
    dirt: 0x9d7c4f, verge: 0x78993f, far: 0x5f7a34,
    width: 19, rough: 0.35, steep: 0.095, surface: 'dirt',
    treeDensity: 0.15, treeType: 'mixed', rockDensity: 0.08,
    crowd: 3.0, fog: 0.65,
    features: ['kicker', 'table', 'roller', 'double', 'berm'],
    props: ['fence', 'cone', 'bale', 'ramp', 'sign'],
    twist: 0.35,
    setpiece: 'FINISH FURY',
  },
];

export const SHALEBACK_SETPIECES: ScriptedFeature[] = [
  { kind: 'kicker', at: 0.040, len: 16, h: 2.4, depth: 0 },
  { kind: 'whoops', at: 0.110, len: 28, h: 0.65, depth: 0 },
  { kind: 'double', at: 0.238, len: 32, h: 2.2, depth: 1.1 },
  { kind: 'roller', at: 0.325, len: 18, h: 1.0, depth: 0 },
  { kind: 'gap', at: 0.392, len: 88, h: 5.6, depth: 7.5 },
  { kind: 'roller', at: 0.432, len: 24, h: 1.2, depth: 0 },
  { kind: 'kicker', at: 0.690, len: 18, h: 2.8, depth: 0 },
  { kind: 'table', at: 0.795, len: 52, h: 3.4, depth: 0 },
  { kind: 'double', at: 0.840, len: 30, h: 2.0, depth: 1.0 },
  { kind: 'kicker', at: 0.952, len: 20, h: 3.6, depth: 0 },
];

export const SHALEBACK_LANDMARKS: TrackLandmark[] = [
  { id: 'summit', kind: 'summit_crags', at: 0.02, label: 'Summit Crags' },
  { id: 'start_tower', kind: 'start_tower', at: 0.03, side: 1, label: "Starter's Tower" },
  { id: 'fallen_giant', kind: 'fallen_giant', at: 0.13, label: 'Giant Fallen Pine' },
  { id: 'shale_rock', kind: 'shale_formation', at: 0.22, side: -1, scale: 1.3, label: 'Shaleback Formation' },
  { id: 'bridge', kind: 'timber_bridge', at: 0.325, label: 'Bonk Bridge' },
  { id: 'big_air', kind: 'cliff_jump', at: 0.392, label: 'The Big One' },
  { id: 'cliff_jump', kind: 'cliff_jump', at: 0.690, side: 1, label: 'Cliff Launch' },
  { id: 'finish', kind: 'grandstand', at: 0.94, label: 'Finish Crowds' },
  { id: 'plaza', kind: 'finish_plaza', at: 0.99, label: 'Finish Plaza' },
];

/** Full reference definition for Shaleback Run. */
export const SHALEBACK: TrackDefinition = {
  id: 'shaleback',
  name: 'SHALEBACK RUN',
  theme: 'alpine',
  seed: 20260114,
  length: 4600,
  difficulty: 2,
  sections: SHALEBACK_SECTIONS,
  setpieces: SHALEBACK_SETPIECES,
  landmarks: SHALEBACK_LANDMARKS,
  atmosphere: ATMOS_ALPINE,
  startElevation: 980,
};
