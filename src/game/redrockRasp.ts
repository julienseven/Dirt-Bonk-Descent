// ---------------------------------------------------------------------------
// REDROCK RASP — mid-length canyon grind
//
// Six sections: dry heat, rock shelves, a narrow pipe fight, and a final
// open wash. Unlocks mid-progression as a technical alternative to Cinder.
// ---------------------------------------------------------------------------
import type { Zone } from './track';

export const REDROCK_SECTIONS: Zone[] = [
  {
    name: '01 HEAT HAZE', sub: 'WIDE OPEN',
    t0: 0.000, t1: 0.140,
    dirt: 0xb86a3c, verge: 0x9a5a30, far: 0x7a4828,
    width: 18, rough: 0.40, steep: 0.08, surface: 'dirt',
    treeDensity: 0.05, treeType: 'none', rockDensity: 0.55,
    crowd: 1.8, fog: 0.75,
    features: ['roller', 'berm', 'kicker'],
    props: ['cone', 'barrel', 'sign'],
    twist: 0.35,
  },
  {
    name: '02 SHELF STACK', sub: 'STEP DOWNS',
    t0: 0.140, t1: 0.300,
    dirt: 0xc47a48, verge: 0xa86838, far: 0x8a5630,
    width: 12, rough: 1.40, steep: 0.055, surface: 'rock',
    treeDensity: 0.0, treeType: 'none', rockDensity: 1.45,
    crowd: 0.5, fog: 0.9,
    features: ['whoops', 'double', 'roller', 'berm'],
    props: ['rock', 'boulder', 'barrier', 'rock'],
    twist: 1.25,
  },
  {
    name: '03 PIPE FIGHT', sub: 'NO PASSING LANE',
    t0: 0.300, t1: 0.460,
    dirt: 0x8a6040, verge: 0x6a4a30, far: 0x4a3520,
    width: 8, rough: 0.55, steep: 0.02, surface: 'gravel',
    treeDensity: 0.0, treeType: 'none', rockDensity: 0.35,
    crowd: 2.6, fog: 1.1,
    features: ['roller', 'berm'],
    props: ['barrel', 'barrier'],
    dropSide: 0, dropDepth: 2.8, noTape: true, rails: true,
    twist: 0.4, combat: true,
  },
  {
    name: '04 DRY WASH', sub: 'SAND & SPEED',
    t0: 0.460, t1: 0.640,
    dirt: 0xd4a060, verge: 0xb88848, far: 0x9a7038,
    width: 16, rough: 0.85, steep: 0.03, surface: 'gravel',
    treeDensity: 0.08, treeType: 'none', rockDensity: 0.40,
    crowd: 1.2, fog: 0.85,
    features: ['table', 'kicker', 'berm', 'roller'],
    props: ['cone', 'bale', 'ramp'],
    // shelf cut rewards looking left of the wash
    secret: true, twist: 0.85,
  },
  {
    name: '05 RASP RIDGE', sub: 'EXPOSED',
    t0: 0.640, t1: 0.820,
    dirt: 0xa87850, verge: 0x886040, far: 0x684830,
    width: 10, rough: 1.10, steep: 0.045, surface: 'rock',
    treeDensity: 0.12, treeType: 'pine', rockDensity: 0.90,
    crowd: 0.6, fog: 0.8,
    features: ['whoops', 'berm', 'kicker', 'gap'],
    props: ['rock', 'drift', 'sign', 'rock'],
    dropSide: 1, dropDepth: 4.2, twist: 1.35,
  },
  {
    name: '06 WASH OUT', sub: 'TO THE FLOOR',
    t0: 0.820, t1: 1.001,
    dirt: 0xb88a50, verge: 0x8a7038, far: 0x6a5828,
    width: 19, rough: 0.35, steep: 0.10, surface: 'dirt',
    treeDensity: 0.10, treeType: 'mixed', rockDensity: 0.15,
    crowd: 2.8, fog: 0.7,
    features: ['kicker', 'table', 'roller', 'double'],
    props: ['cone', 'bale', 'fence', 'ramp'],
    twist: 0.3,
  },
];

export const REDROCK_SETPIECES: {
  kind: string; at: number; len: number; h: number; depth: number;
}[] = [
  { kind: 'kicker', at: 0.08, len: 14, h: 2.0, depth: 0 },
  { kind: 'double', at: 0.22, len: 28, h: 2.1, depth: 1.0 },
  { kind: 'roller', at: 0.38, len: 16, h: 0.9, depth: 0 },
  { kind: 'table', at: 0.54, len: 40, h: 3.0, depth: 0 },
  { kind: 'gap', at: 0.72, len: 56, h: 3.8, depth: 5.0 },
  { kind: 'kicker', at: 0.93, len: 18, h: 3.2, depth: 0 },
];
