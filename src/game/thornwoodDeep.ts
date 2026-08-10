// ---------------------------------------------------------------------------
// THORNWOOD DEEP — technical forest racing
//
// 4900 m, ~2:50 at 28.5 m/s average. The densest, darkest, most technical
// course on the mountain. Tree density and visibility make route selection
// part of the challenge. The forest closes in; shortcuts go off-piste through
// the undergrowth; ambush BONKs are the norm.
//
// Pacing: tension → tension → dread → release → combat → release
//
// This course deliberately contrasts with Shaleback Run: where Shaleback
// is open and fast, Thornwood is tight and punishing. The player should
// feel the difference in their hands — more braking, more corrections, more
// looking for the line through the trees.
// ---------------------------------------------------------------------------

import type { Zone } from './track';

export const THORNWOOD_SECTIONS: Zone[] = [
  // ---- 01: THORNWOOD GATE
  // The forest swallows you immediately. The trail is narrow, the canopy
  // is closed overhead, and the only light comes through gaps between trunks.
  // The first jump teaches you that the forest has teeth.
  {
    name: '01 THORNWOOD GATE', sub: 'FOREST SWALLOWS YOU',
    t0: 0.000, t1: 0.14,
    dirt: 0x5c4a38, verge: 0x2f5a26, far: 0x1d3a19,
    width: 12, rough: 0.70, steep: 0.060, surface: 'dirt',
    treeDensity: 1.20, treeType: 'pine', rockDensity: 0.20,
    crowd: 0.0, fog: 1.35,
    features: ['kicker', 'roller'],
    props: ['log', 'fence'],
    twist: 1.10,
  },

  // ---- 02: ROOT RUN
  // The deepest, darkest section. The trail is barely visible — the player
  // follows the worn racing line through a maze of exposed roots and fallen
  // trunks. Visibility is near-zero; the forest IS the course.
  {
    name: '02 ROOT RUN', sub: 'CAN\'T SEE THE GROUND',
    t0: 0.14, t1: 0.30,
    dirt: 0x4a3828, verge: 0x26441e, far: 0x1a3016,
    width: 10.5, rough: 1.65, steep: 0.025, surface: 'mud',
    treeDensity: 1.85, treeType: 'pine', rockDensity: 0.15,
    crowd: 0.0, fog: 2.2,
    features: ['whoops', 'roller'],
    props: ['log', 'log', 'rock'],
    twist: 1.60,
  },

  // ---- 03: BIRCH CLEARING
  // A brief moment of light as the forest thins into a birch stand. The
  // clearing is wider, but it's a trick — the real challenge is the
  // transition back into the dense trees on the other side.
  {
    name: '03 BIRCH CLEARING', sub: 'BRIEF OPEN SKY',
    t0: 0.30, t1: 0.40,
    dirt: 0x6a5840, verge: 0x5a7a38, far: 0x3a5a28,
    width: 14.5, rough: 0.55, steep: 0.015, surface: 'dirt',
    treeDensity: 0.50, treeType: 'broad', rockDensity: 0.10,
    crowd: 0.4, fog: 0.9,
    features: ['kicker', 'berm'],
    props: ['cone', 'bale'],
    twist: 0.80,
  },

  // ---- 04: MUDWALLS
  // A section where the trail has been widened by landslides, leaving
  // soft mud walls on both sides that spray when you clip them. Hidden
  // shortcuts through the undergrowth reward those who look sideways.
  {
    name: '04 MUDWALLS', sub: 'SOFT EDGES',
    t0: 0.40, t1: 0.53,
    dirt: 0x3e3024, verge: 0x3a4e2c, far: 0x2a3a1e,
    width: 13, rough: 0.90, steep: -0.010, surface: 'mud',
    treeDensity: 0.65, treeType: 'broad', rockDensity: 0.20,
    crowd: 0.3, fog: 1.5,
    features: ['berm', 'roller', 'kicker'],
    props: ['bale', 'puddle', 'fence'],
    twist: 1.0,
    secret: true,
  },

  // ---- 05: BONK ALLEY
  // A straight, tree-lined corridor — perfect for ambush BONKs. The AI
  // cranks up aggression here. Narrow enough that every swing connects.
  {
    name: '05 BONK ALLEY', sub: 'AMBUSH COUNTRY',
    t0: 0.53, t1: 0.68,
    dirt: 0x564434, verge: 0x305024, far: 0x22381a,
    width: 11, rough: 0.65, steep: 0.040, surface: 'dirt',
    treeDensity: 0.90, treeType: 'pine', rockDensity: 0.15,
    crowd: 0.5, fog: 1.1,
    features: ['roller', 'berm'],
    props: ['log', 'sign', 'barrel'],
    twist: 0.85,
    combat: true,
  },

  // ---- 06: ROOT DROP
  // The trail suddenly pitches down through a root-covered slope. The
  // steepest section of the course. A series of drops and compressions
  // make the suspension work overtime.
  {
    name: '06 ROOT DROP', sub: 'STEEP & ROUGH',
    t0: 0.68, t1: 0.80,
    dirt: 0x4c3a2a, verge: 0x2c4e22, far: 0x1e3a18,
    width: 11.5, rough: 1.35, steep: 0.080, surface: 'mud',
    treeDensity: 0.70, treeType: 'pine', rockDensity: 0.25,
    crowd: 0.2, fog: 1.4,
    features: ['whoops', 'kicker', 'double'],
    props: ['log', 'rock'],
    twist: 1.05,
  },

  // ---- 07: EMERGENCE
  // The forest thins into the final descent. The sky opens up, the trail
  // widens, and the finish line is visible below — but the transition
  // from dark forest to bright light is itself disorienting.
  {
    name: '07 EMERGENCE', sub: 'LIGHT AT THE END',
    t0: 0.80, t1: 1.001,
    dirt: 0x5e4c3a, verge: 0x4a6a34, far: 0x3a5228,
    width: 15, rough: 0.45, steep: 0.055, surface: 'dirt',
    treeDensity: 0.30, treeType: 'mixed', rockDensity: 0.10,
    crowd: 1.8, fog: 0.75,
    features: ['kicker', 'table', 'berm'],
    props: ['cone', 'bale', 'sign'],
    twist: 0.40,
  },
];

export const THORNWOOD_SETPIECES: {
  kind: string; at: number; len: number; h: number; depth: number;
}[] = [
  { kind: 'kicker', at: 0.05, len: 14, h: 2.0, depth: 0 },
  { kind: 'double', at: 0.22, len: 22, h: 1.8, depth: 0.9 },
  { kind: 'kicker', at: 0.45, len: 16, h: 2.4, depth: 0 },
  { kind: 'gap', at: 0.71, len: 34, h: 3.2, depth: 3.5 },
  { kind: 'kicker', at: 0.90, len: 18, h: 2.8, depth: 0 },
];
