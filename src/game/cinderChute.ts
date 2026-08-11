// ---------------------------------------------------------------------------
// CINDER CHUTE — volcanic speed descent
//
// Identity: black ash, red/brown earth, smoke, steep chutes, rock shelves.
// Shorter sprint (~1:35) with aggressive pacing and zero vegetation.
// ---------------------------------------------------------------------------

import type { Zone } from './track';
import type { TrackDefinition, ScriptedFeature, TrackLandmark } from './trackDef';
import { ATMOS_VOLCANIC } from './trackDef';

export const CINDER_SECTIONS: Zone[] = [
  {
    name: '01 CALDERA EDGE', sub: 'STRAIGHT DOWN THE MOUTH',
    t0: 0.000, t1: 0.10,
    dirt: 0x4a3e36, verge: 0x3d332a, far: 0x2e2822,
    width: 13, rough: 0.55, steep: 0.140, surface: 'gravel',
    treeDensity: 0.0, treeType: 'none', rockDensity: 0.45,
    crowd: 0.0, fog: 1.4,
    features: ['roller', 'kicker'],
    props: ['rock', 'cone'],
    twist: 0.18,
    setpiece: 'START GATE',
  },
  {
    name: '02 ASH CASCADES', sub: 'RIM OF THE MOUTH',
    t0: 0.10, t1: 0.22,
    dirt: 0x3a332c, verge: 0x2e2822, far: 0x22201c,
    width: 10, rough: 1.05, steep: 0.050, surface: 'gravel',
    treeDensity: 0.0, treeType: 'none', rockDensity: 0.95,
    crowd: 0.0, fog: 1.6,
    features: ['whoops', 'roller', 'berm'],
    props: ['rock', 'boulder', 'rock'],
    twist: 1.30,
    dropSide: -1, dropDepth: 4.2,
    setpiece: 'CANYON CUT',
  },
  {
    name: '03 BASALT SHELF', sub: 'BLACK STONE HIGHWAY',
    t0: 0.22, t1: 0.34,
    dirt: 0x3a3430, verge: 0x2a2420, far: 0x1e1a18,
    width: 12, rough: 0.70, steep: 0.035, surface: 'rock',
    treeDensity: 0.0, treeType: 'none', rockDensity: 1.25,
    crowd: 0.0, fog: 1.3,
    features: ['berm', 'kicker', 'roller'],
    props: ['rock', 'barrier', 'boulder'],
    // rim cut over the shelves — visible but hot
    secret: true, twist: 1.05,
    setpiece: 'CANYON CUT',
  },
  {
    name: '04 LAVA RUNS', sub: 'HOT GROUND',
    t0: 0.34, t1: 0.48,
    dirt: 0x5c3e28, verge: 0x6b3420, far: 0x4a2818,
    width: 11.5, rough: 1.45, steep: 0.030, surface: 'mud',
    treeDensity: 0.0, treeType: 'none', rockDensity: 1.10,
    crowd: 0.0, fog: 1.55,
    features: ['whoops', 'kicker', 'roller'],
    props: ['rock', 'puddle', 'rock'],
    twist: 0.95,
    setpiece: 'CANYON CUT',
  },
  {
    name: '05 NARROW CHUTE', sub: 'SINGLE FILE',
    t0: 0.48, t1: 0.58,
    dirt: 0x4a3830, verge: 0x3a2c24, far: 0x2a2018,
    width: 8, rough: 0.90, steep: 0.070, surface: 'gravel',
    treeDensity: 0.0, treeType: 'none', rockDensity: 0.80,
    crowd: 0.0, fog: 1.35,
    features: ['roller', 'whoops'],
    props: ['rock', 'boulder'],
    twist: 0.45,
    dropSide: 0, dropDepth: 3.8, noTape: true,
    setpiece: 'CANYON CUT',
  },
  {
    name: '06 THE CANYON', sub: 'NO ESCAPE',
    t0: 0.58, t1: 0.72,
    dirt: 0x5a4432, verge: 0x4e3c2c, far: 0x3a2c20,
    width: 14, rough: 0.80, steep: 0.055, surface: 'gravel',
    treeDensity: 0.0, treeType: 'none', rockDensity: 1.20,
    crowd: 0.0, fog: 1.15,
    features: ['berm', 'roller', 'kicker', 'double'],
    props: ['rock', 'barrel', 'rock'],
    twist: 0.70,
    combat: true,
    setpiece: 'THE BONKYARD',
  },
  {
    name: '07 ROCKFALL', sub: 'DODGE OR DIE',
    t0: 0.72, t1: 0.84,
    dirt: 0x4a3a30, verge: 0x3a2e26, far: 0x2a221c,
    width: 11, rough: 1.20, steep: 0.040, surface: 'rock',
    treeDensity: 0.0, treeType: 'none', rockDensity: 1.40,
    crowd: 0.0, fog: 1.30,
    features: ['whoops', 'kicker', 'berm'],
    props: ['boulder', 'rock', 'boulder'],
    // risky rim cut for skilled riders
    secret: true, twist: 1.15,
    setpiece: 'CANYON CUT',
  },
  {
    name: '08 ERUPTION POINT', sub: 'FINAL SCREE',
    t0: 0.84, t1: 1.001,
    dirt: 0x4e4038, verge: 0x3a3028, far: 0x2a2420,
    width: 15, rough: 0.35, steep: 0.120, surface: 'gravel',
    treeDensity: 0.0, treeType: 'none', rockDensity: 0.30,
    crowd: 0.0, fog: 0.95,
    features: ['kicker', 'table', 'roller'],
    props: ['rock', 'cone'],
    twist: 0.20,
    setpiece: 'FINISH FURY',
  },
];

export const CINDER_SETPIECES: ScriptedFeature[] = [
  { kind: 'kicker', at: 0.05, len: 14, h: 2.8, depth: 0 },
  { kind: 'whoops', at: 0.16, len: 24, h: 0.7, depth: 0 },
  { kind: 'double', at: 0.40, len: 26, h: 2.0, depth: 1.2 },
  { kind: 'gap', at: 0.62, len: 42, h: 3.8, depth: 4.2 },
  { kind: 'kicker', at: 0.78, len: 16, h: 2.6, depth: 0 },
  { kind: 'table', at: 0.90, len: 36, h: 3.0, depth: 0 },
  { kind: 'kicker', at: 0.96, len: 16, h: 3.4, depth: 0 },
];

export const CINDER_LANDMARKS: TrackLandmark[] = [
  { id: 'rim', kind: 'volcano_rim', at: 0.04, label: 'Caldera Rim' },
  { id: 'ash', kind: 'ash_chute', at: 0.16, side: -1, label: 'Ash Cascades' },
  { id: 'basalt', kind: 'basalt_wall', at: 0.28, side: 1, label: 'Basalt Wall' },
  { id: 'fissure', kind: 'lava_fissure', at: 0.40, side: -1, label: 'Glowing Fissure' },
  { id: 'chute', kind: 'cliff_gate', at: 0.52, label: 'Narrow Chute' },
  { id: 'canyon', kind: 'basalt_wall', at: 0.65, side: 0, scale: 1.4, label: 'Canyon Walls' },
  { id: 'final', kind: 'cliff_jump', at: 0.92, label: 'Eruption Launch' },
];

export const CINDER: TrackDefinition = {
  id: 'cinder',
  name: 'CINDER CHUTE',
  theme: 'volcanic',
  seed: 771453,
  length: 2800,
  difficulty: 3,
  sections: CINDER_SECTIONS,
  setpieces: CINDER_SETPIECES,
  landmarks: CINDER_LANDMARKS,
  atmosphere: ATMOS_VOLCANIC,
  startElevation: 1120,
};
