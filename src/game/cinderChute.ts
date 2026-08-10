// ---------------------------------------------------------------------------
// CINDER CHUTE — volcanic scree slope, short and vicious
//
// 2800 m, ~1:35 at 28 m/s average. Five tight sections with no breathing
// room. The environment is dark rock, ash, lava glow, narrow trails, and
// constant rockfall.
//
// Pacing: tension → release → tension → combat → release
// ---------------------------------------------------------------------------

import type { Zone } from './track';

/**
 * Cinder Chute. The volcanic mountain.
 *
 * Every section shares the dark, desaturated base palette of the volcano.
 * Visual variety comes from temperature: cool grey ash near the summit,
// warm orange rock where lava has been, and a deep red interior in the
 * chasm. Lava glow at the edges makes the trail feel like the mountain
 * is alive and hostile.
 *
 * Widths are deliberately tight. This is a sprint, not a cruise — the
 * trail rarely exceeds 13 m and sometimes narrows to 8. Speed is the
 * only option because the terrain won't let you think.
 */
export const CINDER_SECTIONS: Zone[] = [
  // ---- 01: CALDERA EDGE
  // The start sits on the lip of an active volcano. The trail drops
  // almost vertically, flanked by ash cones and fumaroles. First section
  // teaches the player: the mountain does not care about you.
  {
    name: '01 CALDERA EDGE', sub: 'STRAIGHT DOWN THE MOUTH',
    t0: 0.000, t1: 0.14,
    dirt: 0x4a3e36, verge: 0x3d332a, far: 0x2e2822,
    width: 12, rough: 0.65, steep: 0.135, surface: 'gravel',
    treeDensity: 0.0, treeType: 'none', rockDensity: 0.40,
    crowd: 0.0, fog: 1.4,
    features: ['roller', 'kicker'],
    props: ['rock', 'cone'],
    twist: 0.18,
  },

  // ---- 02: ASH CASCADES
  // Narrow trails along the crater rim. Loose scree falls away on one side
  // into a fog-filled abyss. Rockfall arrows warn of boulders rolling
  // across the line every few seconds.
  {
    name: '02 ASH CASCADES', sub: 'RIM OF THE MOUTH',
    t0: 0.14, t1: 0.32,
    dirt: 0x3a332c, verge: 0x2e2822, far: 0x22201c,
    width: 10, rough: 1.0, steep: 0.045, surface: 'gravel',
    treeDensity: 0.0, treeType: 'none', rockDensity: 0.90,
    crowd: 0.0, fog: 1.6,
    features: ['whoops', 'roller', 'berm'],
    props: ['rock', 'boulder', 'rock'],
    twist: 1.25,
    dropSide: -1, dropDepth: 4.2,
  },

  // ---- 03: LAVA RUNS
  // The trail crosses a lava field. Orange glow on the terrain edges,
  // heat-shimmer implied by dense fog. Standing water (rain on hot rock
  // creates steam). The ground is rougher here — more whoops, harder to
  // keep the wheel planted.
  {
    name: '03 LAVA RUNS', sub: 'HOT GROUND',
    t0: 0.32, t1: 0.52,
    dirt: 0x5c3e28, verge: 0x6b3420, far: 0x4a2818,
    width: 11.5, rough: 1.45, steep: 0.030, surface: 'mud',
    treeDensity: 0.0, treeType: 'none', rockDensity: 1.10,
    crowd: 0.0, fog: 1.8,
    features: ['whoops', 'kicker', 'roller'],
    props: ['rock', 'puddle', 'rock'],
    twist: 0.95,
  },

  // ---- 04: THE CANYON
  // The widest section — but only because it's a slot canyon with vertical
  // walls on both sides. Rockfalls are the main hazard. Combat section:
  // there's nowhere to hide, so the AI comes for you.
  {
    name: '04 THE CANYON', sub: 'NO ESCAPE',
    t0: 0.52, t1: 0.74,
    dirt: 0x5a4432, verge: 0x4e3c2c, far: 0x3a2c20,
    width: 14, rough: 0.80, steep: 0.055, surface: 'gravel',
    treeDensity: 0.0, treeType: 'none', rockDensity: 1.20,
    crowd: 0.0, fog: 1.2,
    features: ['berm', 'roller', 'kicker', 'double'],
    props: ['rock', 'barrel', 'rock'],
    twist: 0.65,
    combat: true,
  },

  // ---- 05: ERUPTION POINT
  // The fastest section. A straight blast down the final scree field,
  // the volcano looming behind, a huge kicker into the finish. Everything
  // you have, right now, or it's over.
  {
    name: '05 ERUPTION POINT', sub: 'FINAL SCREE',
    t0: 0.74, t1: 1.001,
    dirt: 0x4e4038, verge: 0x3a3028, far: 0x2a2420,
    width: 13.5, rough: 0.40, steep: 0.110, surface: 'gravel',
    treeDensity: 0.0, treeType: 'none', rockDensity: 0.35,
    crowd: 0.0, fog: 1.0,
    features: ['kicker', 'table', 'roller'],
    props: ['rock', 'cone'],
    twist: 0.22,
  },
];

export const CINDER_SETPIECES: {
  kind: string; at: number; len: number; h: number; depth: number;
}[] = [
  { kind: 'kicker', at: 0.06, len: 14, h: 2.8, depth: 0 },
  { kind: 'double', at: 0.39, len: 26, h: 2.0, depth: 1.2 },
  { kind: 'gap', at: 0.58, len: 38, h: 3.6, depth: 4.0 },
  { kind: 'kicker', at: 0.92, len: 16, h: 3.2, depth: 0 },
];
