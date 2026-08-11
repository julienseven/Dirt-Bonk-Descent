// ---------------------------------------------------------------------------
// LASTLIGHT SPINE — the epic final descent
//
// Identity: golden hour → sunset, mountain spine above the world.
// Visual climax of Dirt Bonk Descent.
// ---------------------------------------------------------------------------

import type { Zone } from './track';
import type { TrackDefinition, ScriptedFeature, TrackLandmark } from './trackDef';
import { ATMOS_SUNSET } from './trackDef';

export const LASTLIGHT_SECTIONS: Zone[] = [
  {
    name: '01 THE SPINE', sub: 'EDGE OF THE WORLD',
    t0: 0.000, t1: 0.10,
    dirt: 0x6a5440, verge: 0x4a6a38, far: 0x3a5228,
    width: 11, rough: 0.25, steep: 0.050, surface: 'dirt',
    treeDensity: 0.08, treeType: 'pine', rockDensity: 0.15,
    crowd: 0.0, fog: 0.65,
    features: ['roller'],
    props: ['rock'],
    twist: 0.10,
    dropSide: 0, dropDepth: 6.0,
    setpiece: 'START GATE',
  },
  {
    name: '02 SUNSET CRAG', sub: 'FRAMED BY STONE',
    t0: 0.10, t1: 0.22,
    dirt: 0x7a6048, verge: 0x5a7a40, far: 0x4a6230,
    width: 13, rough: 0.55, steep: 0.055, surface: 'gravel',
    treeDensity: 0.15, treeType: 'pine', rockDensity: 1.35,
    crowd: 0.0, fog: 0.80,
    features: ['berm', 'kicker', 'roller'],
    props: ['rock', 'boulder'],
    twist: 0.90,
    setpiece: 'CANYON CUT',
  },
  {
    name: '03 RIDGE JUMP', sub: 'THE TRAILER MOMENT',
    t0: 0.22, t1: 0.34,
    dirt: 0x8a6c50, verge: 0x5a7a40, far: 0x4a6230,
    width: 12, rough: 0.35, steep: 0.025, surface: 'dirt',
    treeDensity: 0.05, treeType: 'none', rockDensity: 0.20,
    crowd: 0.3, fog: 0.70,
    features: ['kicker'],
    props: ['cone', 'bale'],
    twist: 0.12,
    setpiece: 'BIG AIR',
  },
  {
    name: '04 ALPINE SHELF', sub: 'LONG SHADOWS',
    t0: 0.34, t1: 0.44,
    dirt: 0x7a6450, verge: 0x5a7040, far: 0x4a5a30,
    width: 14, rough: 0.50, steep: 0.030, surface: 'dirt',
    treeDensity: 0.20, treeType: 'pine', rockDensity: 0.40,
    crowd: 0.4, fog: 0.75,
    features: ['berm', 'roller', 'whoops'],
    props: ['fence', 'rock', 'sign'],
    // golden line along the shelf lip
    secret: true, twist: 0.95,
    setpiece: 'KICKER RIDGE',
  },
  {
    name: '05 COLLAPSING', sub: 'ROCKS ARE FALLING',
    t0: 0.44, t1: 0.56,
    dirt: 0x5c4a38, verge: 0x3a5a2c, far: 0x2a4220,
    width: 10.5, rough: 1.10, steep: 0.040, surface: 'rock',
    treeDensity: 0.0, treeType: 'none', rockDensity: 1.50,
    crowd: 0.0, fog: 1.3,
    features: ['whoops', 'roller'],
    props: ['boulder', 'rock', 'boulder'],
    twist: 0.55,
    dropSide: 1, dropDepth: 3.5,
    setpiece: 'CANYON CUT',
  },
  {
    name: '06 BONK RIDGE', sub: 'NOWHERE TO DUCK',
    t0: 0.56, t1: 0.66,
    dirt: 0x6a5840, verge: 0x4a6a38, far: 0x3a5228,
    width: 11, rough: 0.60, steep: 0.035, surface: 'gravel',
    treeDensity: 0.05, treeType: 'none', rockDensity: 0.40,
    crowd: 0.8, fog: 0.90,
    features: ['berm', 'roller'],
    props: ['boulder', 'rock'],
    twist: 0.70,
    combat: true,
    dropSide: -1, dropDepth: 3.8,
    setpiece: 'THE BONKYARD',
  },
  {
    name: '07 SECRET LEDGE', sub: 'GOLDEN LINE',
    t0: 0.66, t1: 0.74,
    dirt: 0x7a6048, verge: 0x5a7040, far: 0x4a5a30,
    width: 12, rough: 0.70, steep: 0.025, surface: 'dirt',
    treeDensity: 0.25, treeType: 'pine', rockDensity: 0.30,
    crowd: 0.2, fog: 0.85,
    features: ['berm', 'kicker', 'roller'],
    props: ['log', 'rock'],
    secret: true, twist: 1.30,
    setpiece: 'PINE PLUNGE',
  },
  {
    name: '08 OVERLOOK', sub: 'THE WHOLE WORLD',
    t0: 0.74, t1: 0.84,
    dirt: 0x8a6c50, verge: 0x6a7a48, far: 0x5a6a38,
    width: 13, rough: 0.45, steep: 0.040, surface: 'dirt',
    treeDensity: 0.12, treeType: 'mixed', rockDensity: 0.55,
    crowd: 0.6, fog: 0.70,
    features: ['roller', 'berm', 'kicker'],
    props: ['sign', 'rock', 'cone'],
    twist: 0.55,
    dropSide: 1, dropDepth: 4.5,
    setpiece: 'CANYON CUT',
  },
  {
    name: '09 FINAL SPINE', sub: 'KNIFE EDGE',
    t0: 0.84, t1: 0.92,
    dirt: 0x7a5840, verge: 0x5a6a38, far: 0x4a5230,
    // true knife-edge: single line, drops both sides
    width: 8.5, rough: 0.45, steep: 0.060, surface: 'gravel',
    treeDensity: 0.0, treeType: 'none', rockDensity: 0.55,
    crowd: 1.2, fog: 0.60,
    features: ['whoops', 'kicker', 'berm'],
    props: ['rock', 'barrier'],
    twist: 0.35,
    dropSide: 0, dropDepth: 6.0,
    setpiece: 'CANYON CUT',
  },
  {
    name: '10 THE FINAL JUMP', sub: 'FLY TO THE FINISH',
    t0: 0.92, t1: 1.001,
    dirt: 0x8a7050, verge: 0x5a7a40, far: 0x4a6230,
    // biggest finish on the range — open vista into the grandstands
    width: 18, rough: 0.25, steep: 0.080, surface: 'dirt',
    treeDensity: 0.08, treeType: 'mixed', rockDensity: 0.08,
    crowd: 3.0, fog: 0.50,
    features: ['kicker', 'table', 'kicker'],
    props: ['cone', 'bale', 'sign', 'fence'],
    twist: 0.12,
    setpiece: 'FINISH FURY',
  },
];

export const LASTLIGHT_SETPIECES: ScriptedFeature[] = [
  { kind: 'roller', at: 0.05, len: 20, h: 0.9, depth: 0 },
  { kind: 'gap', at: 0.28, len: 82, h: 5.8, depth: 7.0 },
  { kind: 'roller', at: 0.34, len: 22, h: 1.1, depth: 0 },
  { kind: 'kicker', at: 0.50, len: 18, h: 3.2, depth: 0 },
  { kind: 'whoops', at: 0.60, len: 24, h: 0.55, depth: 0 },
  { kind: 'double', at: 0.78, len: 28, h: 2.4, depth: 1.0 },
  { kind: 'table', at: 0.88, len: 40, h: 3.0, depth: 0 },
  // the money shot: bigger than Shaleback's final, framed by sunset
  { kind: 'gap', at: 0.945, len: 70, h: 5.2, depth: 6.0 },
  { kind: 'kicker', at: 0.985, len: 18, h: 3.6, depth: 0 },
];

export const LASTLIGHT_LANDMARKS: TrackLandmark[] = [
  { id: 'spine', kind: 'spine_ridge', at: 0.04, label: 'The Spine' },
  { id: 'crag', kind: 'cliff_gate', at: 0.14, label: 'Sunset Crag' },
  { id: 'ridge_jump', kind: 'cliff_jump', at: 0.28, label: 'Ridge Jump' },
  { id: 'overlook', kind: 'sunset_overlook', at: 0.78, side: 1, label: 'Sunset Overlook' },
  { id: 'final_spine', kind: 'final_spine', at: 0.88, side: -1, label: 'Final Spine' },
  { id: 'final_jump', kind: 'cliff_jump', at: 0.96, label: 'The Final Jump' },
  { id: 'finish', kind: 'grandstand', at: 0.98, label: 'Lastlight Finish' },
  { id: 'plaza', kind: 'finish_plaza', at: 0.995, label: 'Finish Plaza' },
];

export const LASTLIGHT: TrackDefinition = {
  id: 'lastlight',
  name: 'LASTLIGHT SPINE',
  theme: 'sunset',
  seed: 8829,
  length: 5600,
  difficulty: 5,
  sections: LASTLIGHT_SECTIONS,
  setpieces: LASTLIGHT_SETPIECES,
  landmarks: LASTLIGHT_LANDMARKS,
  atmosphere: ATMOS_SUNSET,
  startElevation: 1180,
};
