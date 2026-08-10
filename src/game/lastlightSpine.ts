// ---------------------------------------------------------------------------
// LASTLIGHT SPINE — the showcase mountain
//
// 5600 m, ~3:05 at 29 m/s average. The highest and most dramatic course on
// the mountain. Designed as the "trailer moment" — every section should be
// visually spectacular and mechanically satisfying.
//
// The spine is a knife-edge ridge in late afternoon light. The camera sees
// the sun behind the rider at the start, the world drops away on both sides,
// and the course opens to reveal the entire valley below.
//
// Pacing: awe → tension → release → combat → dread → spectacle → release
//
// This is the course you'd put in a 20-second clip:
//   rider launches off a ridge at sunset → 360 → BONK opponent →
//   boost through a collapsing section → huge final jump
// ---------------------------------------------------------------------------

import type { Zone } from './track';

export const LASTLIGHT_SECTIONS: Zone[] = [
  // ---- 01: THE SPINE
  // The rider starts on a knife-edge ridge. Camera is behind them, the sun
  // is directly ahead, and the valley drops away on BOTH sides. This is the
  // money shot — the image that sells the game. Maximum visual impact, no
  // gameplay complexity yet.
  {
    name: '01 THE SPINE', sub: 'EDGE OF THE WORLD',
    t0: 0.000, t1: 0.13,
    dirt: 0x6a5440, verge: 0x4a6a38, far: 0x3a5228,
    width: 11, rough: 0.25, steep: 0.045, surface: 'dirt',
    treeDensity: 0.10, treeType: 'pine', rockDensity: 0.15,
    crowd: 0.0, fog: 0.65,
    features: ['roller'],
    props: ['rock'],
    twist: 0.10,
    // drops on BOTH sides — you're on a knife-edge
    dropSide: 0, dropDepth: 6.0,
  },

  // ---- 02: SUNSET CRAG
  // Massive rock formations on both sides, backlit by the golden-hour sun.
  // The rocks should read as towering walls framing the trail. First
  // berm section teaches the player to look ahead at the golden light.
  {
    name: '02 SUNSET CRAG', sub: 'FRAMED BY STONE',
    t0: 0.13, t1: 0.28,
    dirt: 0x7a6048, verge: 0x5a7a40, far: 0x4a6230,
    width: 13, rough: 0.55, steep: 0.055, surface: 'gravel',
    treeDensity: 0.15, treeType: 'pine', rockDensity: 1.35,
    crowd: 0.0, fog: 0.80,
    features: ['berm', 'kicker', 'roller'],
    props: ['rock', 'boulder'],
    twist: 0.90,
  },

  // ---- 03: RIDGE JUMP
  // THE signature moment. The trail climbs to a narrow launch point and
  // the player is sent flying across a gap with the entire valley visible
  // below. This is the shot you put in the trailer.
  {
    name: '03 RIDGE JUMP', sub: 'THE TRAILER MOMENT',
    t0: 0.28, t1: 0.42,
    dirt: 0x8a6c50, verge: 0x5a7a40, far: 0x4a6230,
    width: 12, rough: 0.35, steep: 0.025, surface: 'dirt',
    treeDensity: 0.05, treeType: 'none', rockDensity: 0.20,
    crowd: 0.3, fog: 0.70,
    features: ['kicker'],
    props: ['cone', 'bale'],
    twist: 0.12,
  },

  // ---- 04: COLLAPSING SECTION
  // A dramatic set-piece: the trail runs through a narrow gap between
  // unstable rock walls. Boulders tumble periodically (rockfall). This
  // is the "boost through danger" moment.
  {
    name: '04 COLLAPSING', sub: 'ROCKS ARE FALLING',
    t0: 0.42, t1: 0.56,
    dirt: 0x5c4a38, verge: 0x3a5a2c, far: 0x2a4220,
    width: 10.5, rough: 1.10, steep: 0.040, surface: 'rock',
    treeDensity: 0.0, treeType: 'none', rockDensity: 1.50,
    crowd: 0.0, fog: 1.3,
    features: ['whoops', 'roller'],
    props: ['boulder', 'rock', 'boulder'],
    twist: 0.55,
    // cliff walls on both sides
    dropSide: 1, dropDepth: 3.5,
  },

  // ---- 05: BONK RIDGE
  // A narrow ridge section designed for rider-on-rider combat. The AI
  // cranks aggression, and there's nowhere to go if someone swings at you.
  // The sunset is still visible, keeping the visual impact high.
  {
    name: '05 BONK RIDGE', sub: 'NOWHERE TO DUCK',
    t0: 0.56, t1: 0.70,
    dirt: 0x6a5840, verge: 0x4a6a38, far: 0x3a5228,
    width: 11, rough: 0.60, steep: 0.035, surface: 'gravel',
    treeDensity: 0.05, treeType: 'none', rockDensity: 0.40,
    crowd: 0.8, fog: 0.90,
    features: ['berm', 'roller'],
    props: ['boulder', 'rock'],
    twist: 0.70,
    combat: true,
    // narrow with steep drop on one side
    dropSide: -1, dropDepth: 3.8,
  },

  // ---- 06: THE FINAL JUMP
  // The grand finale. A massive kicker sends you soaring over the valley
  // to the finish line below. The camera pulls back to reveal the full
  // scale of the mountain you just descended. This is the last image
  // the player sees — it should be spectacular.
  {
    name: '06 THE FINAL JUMP', sub: 'FLY TO THE FINISH',
    t0: 0.70, t1: 1.001,
    dirt: 0x8a7050, verge: 0x5a7a40, far: 0x4a6230,
    width: 16, rough: 0.30, steep: 0.060, surface: 'dirt',
    treeDensity: 0.10, treeType: 'mixed', rockDensity: 0.10,
    crowd: 2.5, fog: 0.60,
    features: ['kicker', 'table', 'kicker'],
    props: ['cone', 'bale', 'sign'],
    twist: 0.18,
  },
];

export const LASTLIGHT_SETPIECES: {
  kind: string; at: number; len: number; h: number; depth: number;
}[] = [
  // The money shot: a huge launch at sunset with the valley below
  { kind: 'gap', at: 0.33, len: 82, h: 5.8, depth: 7.0 },
  // A kicker through the collapsing section
  { kind: 'kicker', at: 0.48, len: 18, h: 3.2, depth: 0 },
  // The signature final jump — everything you have, right now
  { kind: 'kicker', at: 0.90, len: 22, h: 4.8, depth: 0 },
];
