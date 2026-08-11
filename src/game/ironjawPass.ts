// ---------------------------------------------------------------------------
// IRONJAW PASS — extreme rocky mountain pass
//
// Identity: giant rock walls, cliffs, bridges, enormous scale, thin air.
// Longest course (6.2 km endurance).
// ---------------------------------------------------------------------------

import type { Zone } from './track';
import type { TrackDefinition, ScriptedFeature, TrackLandmark } from './trackDef';
import { ATMOS_LIMESTONE } from './trackDef';

export const IRONJAW_SECTIONS: Zone[] = [
  {
    name: '01 HIGH GATE', sub: 'THIN AIR',
    t0: 0.000, t1: 0.08,
    dirt: 0x8a7a68, verge: 0x6a7a50, far: 0x4a5a38,
    width: 18, rough: 0.28, steep: 0.095, surface: 'dirt',
    treeDensity: 0.08, treeType: 'pine', rockDensity: 0.18,
    crowd: 2.2, fog: 0.70,
    features: ['roller', 'kicker'],
    props: ['cone', 'bale', 'sign'],
    twist: 0.22,
    setpiece: 'START GATE',
  },
  {
    name: '02 SCREE SHELF', sub: 'LOOSE & LONG',
    t0: 0.08, t1: 0.18,
    dirt: 0x7a6a58, verge: 0x6a6048, far: 0x4a4438,
    width: 13, rough: 1.25, steep: 0.040, surface: 'gravel',
    treeDensity: 0.05, treeType: 'none', rockDensity: 1.20,
    crowd: 0.3, fog: 0.95,
    features: ['whoops', 'berm', 'roller'],
    props: ['rock', 'boulder', 'rock'],
    // early high line for riders who commit on the scree
    secret: true, twist: 1.25,
    setpiece: 'CANYON CUT',
  },
  {
    name: '03 WIND GAP', sub: 'HOLD YOUR LINE',
    t0: 0.18, t1: 0.28,
    dirt: 0x9a8870, verge: 0x708858, far: 0x506038,
    width: 14, rough: 0.35, steep: 0.025, surface: 'dirt',
    treeDensity: 0.04, treeType: 'pine', rockDensity: 0.25,
    crowd: 0.8, fog: 0.65,
    features: ['table', 'kicker'],
    props: ['cone', 'bale', 'ramp'],
    twist: 0.30,
    dropSide: 1, dropDepth: 3.2,
    setpiece: 'KICKER RIDGE',
  },
  {
    name: '04 IRON WALL', sub: 'NO ROOM LEFT',
    t0: 0.28, t1: 0.36,
    dirt: 0x5a5048, verge: 0x3a3830, far: 0x2a2820,
    width: 7.5, rough: 0.15, steep: -0.04, surface: 'rock',
    treeDensity: 0.0, treeType: 'none', rockDensity: 0.05,
    crowd: 2.0, fog: 1.10,
    features: ['roller'],
    props: ['barrel'],
    dropSide: 0, dropDepth: 3.6, noTape: true, rails: true,
    twist: 0.18, combat: true,
  },
  {
    name: '05 LONG BURN', sub: 'SAVE YOUR BOOST',
    t0: 0.36, t1: 0.48,
    dirt: 0x8a7458, verge: 0x688048, far: 0x486030,
    // false-flat release: wider, gentler — then THE TEETH punishes early boost
    width: 16, rough: 0.45, steep: 0.010, surface: 'dirt',
    treeDensity: 0.22, treeType: 'mixed', rockDensity: 0.25,
    crowd: 0.5, fog: 0.80,
    features: ['berm', 'roller', 'whoops', 'kicker'],
    props: ['fence', 'rock', 'sign'],
    twist: 0.75,
    setpiece: 'KICKER RIDGE',
  },
  {
    name: '06 THE TEETH', sub: 'ROCK GARDEN',
    t0: 0.48, t1: 0.58,
    dirt: 0xa08060, verge: 0x786050, far: 0x584838,
    width: 12, rough: 1.55, steep: 0.050, surface: 'rock',
    treeDensity: 0.08, treeType: 'none', rockDensity: 1.45,
    crowd: 0.4, fog: 1.00,
    features: ['whoops', 'kicker', 'berm'],
    props: ['rock', 'boulder', 'barrier'],
    twist: 1.25,
    setpiece: 'CANYON CUT',
  },
  {
    name: '07 SECRET RIM', sub: 'IF YOU LOOK UP',
    t0: 0.58, t1: 0.66,
    dirt: 0x7a6850, verge: 0x587040, far: 0x385028,
    width: 12.5, rough: 0.70, steep: 0.030, surface: 'dirt',
    treeDensity: 0.55, treeType: 'pine', rockDensity: 0.35,
    crowd: 0.3, fog: 1.15,
    features: ['berm', 'roller', 'kicker'],
    props: ['rock', 'boulder'],
    secret: true, twist: 1.40,
    setpiece: 'PINE PLUNGE',
  },
  {
    name: '08 DROP JAW', sub: 'ONE SIDE ONLY',
    t0: 0.66, t1: 0.76,
    dirt: 0x9a8668, verge: 0x6a5c48, far: 0x4a4030,
    width: 9.5, rough: 0.90, steep: 0.045, surface: 'gravel',
    treeDensity: 0.12, treeType: 'pine', rockDensity: 0.75,
    crowd: 0.35, fog: 0.80,
    features: ['roller', 'berm', 'whoops'],
    props: ['drift', 'rock', 'sign'],
    dropSide: -1, dropDepth: 5.2, twist: 1.20,
    setpiece: 'CANYON CUT',
  },
  {
    name: '09 PACK FIGHT', sub: 'SETTLE IT',
    t0: 0.76, t1: 0.88,
    dirt: 0xb07048, verge: 0x8a5838, far: 0x6a4028,
    width: 17, rough: 0.55, steep: 0.035, surface: 'dirt',
    treeDensity: 0.10, treeType: 'mixed', rockDensity: 0.25,
    crowd: 2.6, fog: 0.75,
    features: ['berm', 'table', 'roller'],
    props: ['bale', 'barrel', 'cone'],
    twist: 0.55, combat: true,
    setpiece: 'THE BONKYARD',
  },
  {
    name: '10 SUMMIT RUN', sub: 'EMPTY THE TANK',
    t0: 0.88, t1: 1.001,
    dirt: 0x9a7c54, verge: 0x789940, far: 0x5f7a34,
    width: 18, rough: 0.32, steep: 0.100, surface: 'dirt',
    treeDensity: 0.12, treeType: 'mixed', rockDensity: 0.10,
    crowd: 3.0, fog: 0.60,
    features: ['kicker', 'table', 'roller'],
    props: ['fence', 'cone', 'bale', 'sign'],
    twist: 0.30,
    setpiece: 'FINISH FURY',
  },
];

export const IRONJAW_SETPIECES: ScriptedFeature[] = [
  { kind: 'kicker', at: 0.05, len: 16, h: 2.6, depth: 0 },
  { kind: 'gap', at: 0.22, len: 70, h: 4.8, depth: 6.2 },
  { kind: 'roller', at: 0.32, len: 18, h: 1.0, depth: 0 },
  { kind: 'whoops', at: 0.42, len: 30, h: 0.65, depth: 0 },
  { kind: 'double', at: 0.52, len: 30, h: 2.3, depth: 1.0 },
  { kind: 'kicker', at: 0.70, len: 18, h: 2.8, depth: 0 },
  { kind: 'table', at: 0.81, len: 48, h: 3.2, depth: 0 },
  { kind: 'kicker', at: 0.94, len: 20, h: 3.8, depth: 0 },
];

export const IRONJAW_LANDMARKS: TrackLandmark[] = [
  { id: 'summit', kind: 'summit_crags', at: 0.03, label: 'High Gate Crags' },
  { id: 'wind', kind: 'wind_gap', at: 0.22, label: 'Wind Gap' },
  { id: 'bridge', kind: 'suspension_bridge', at: 0.32, label: 'Iron Wall Bridge' },
  { id: 'jaw', kind: 'iron_jaw', at: 0.52, scale: 1.2, label: 'The Iron Jaw' },
  { id: 'gate', kind: 'cliff_gate', at: 0.70, label: 'Cliff Gate' },
  { id: 'drop', kind: 'cliff_jump', at: 0.70, side: -1, label: 'Drop Jaw' },
  { id: 'finish', kind: 'grandstand', at: 0.95, label: 'Summit Finish' },
  { id: 'plaza', kind: 'finish_plaza', at: 0.99, label: 'Finish Plaza' },
];

export const IRONJAW: TrackDefinition = {
  id: 'ironjaw',
  name: 'IRONJAW PASS',
  theme: 'limestone',
  seed: 505017,
  length: 6200,
  difficulty: 4,
  sections: IRONJAW_SECTIONS,
  setpieces: IRONJAW_SETPIECES,
  landmarks: IRONJAW_LANDMARKS,
  atmosphere: ATMOS_LIMESTONE,
  startElevation: 1280,
};
