// ---------------------------------------------------------------------------
// SHALEBACK RUN — the authored vertical slice
//
// Ten hand-placed sections rather than a procedural sample. The generator
// still fills in micro-terrain, scenery and props, but the shape, width,
// surface, hazard mix and set-pieces of every stretch are specified here.
//
// Pacing intent — alternating tension and release, never two of the same
// kind back to back:
//
//   01 DROP        release   plunge, wide, learn the speed
//   02 PINE PANIC  tension   tight, blind, claustrophobic
//   03 ROCK & ROLL tension   technical, punishing line choice
//   04 BONK BRIDGE combat    narrow, no escape, fight or fall
//   05 BIG AIR     release   one enormous jump, pure spectacle
//   06 MUD PIT     tension   grip vanishes, everything slides
//   07 SECRET SEND reward    the hidden line, for players who look
//   08 CLIFFSIDE   dread     one wrong input and you're gone
//   09 BONK CANYON combat    wide arena, crowd, the big brawl
//   10 FINAL SEND  release   steepest, fastest, everything at once
// ---------------------------------------------------------------------------
import type { Zone } from './track';

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
  },
  {
    name: '02 PINE PANIC', sub: 'NO SIGHTLINES',
    t0: 0.075, t1: 0.185,
    dirt: 0x5f4a30, verge: 0x2f5a26, far: 0x1d3a19,
    width: 11.5, rough: 1.35, steep: 0.030, surface: 'dirt',
    treeDensity: 1.60, treeType: 'pine', rockDensity: 0.35,
    crowd: 0.35, fog: 1.55,
    features: ['whoops', 'kicker', 'berm', 'roller'],
    props: ['log', 'fence', 'rock', 'sign'],
    twist: 1.55,
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
    twist: 1.20,
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
    // the whole point: the deck ends and there is nothing under you
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
  },
  {
    name: '06 MUD PIT', sub: 'NO GRIP',
    t0: 0.455, t1: 0.550,
    dirt: 0x453a2a, verge: 0x3f5230, far: 0x2b3a1e,
    width: 14, rough: 1.05, steep: -0.030, surface: 'mud',
    treeDensity: 0.85, treeType: 'broad', rockDensity: 0.15,
    crowd: 0.8, fog: 1.5,
    features: ['roller', 'whoops', 'berm'],
    props: ['water', 'puddle', 'log', 'water', 'bale'],
    twist: 1.15,
  },
  {
    name: '07 SECRET SEND', sub: 'IF YOU KNOW',
    t0: 0.550, t1: 0.640,
    dirt: 0x8a7148, verge: 0x5f7f38, far: 0x47632c,
    width: 13.5, rough: 0.75, steep: 0.030, surface: 'dirt',
    treeDensity: 0.95, treeType: 'mixed', rockDensity: 0.30,
    crowd: 0.5, fog: 1.2,
    features: ['berm', 'roller', 'kicker'],
    props: ['log', 'rock'],
    secret: true, twist: 1.45,
  },
  {
    name: '08 CLIFFSIDE', sub: 'DO NOT LOOK DOWN',
    t0: 0.640, t1: 0.740,
    dirt: 0x9c8262, verge: 0x6d5c44, far: 0x4a3f30,
    width: 9, rough: 0.85, steep: 0.040, surface: 'gravel',
    treeDensity: 0.15, treeType: 'pine', rockDensity: 0.70,
    crowd: 0.45, fog: 0.8,
    features: ['roller', 'berm', 'whoops'],
    // exposed altitude: snow clings to the cliff edge
    props: ['drift', 'rock', 'drift', 'sign'],
    // the mountain simply stops on the right
    dropSide: 1, dropDepth: 5.0, twist: 1.30,
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
  },
];

/**
 * Hand-placed showpieces, as fractions of track length. These are guaranteed
 * — the procedural pass fills around them but never overwrites them.
 */
export const SHALEBACK_SETPIECES: {
  kind: string; at: number; len: number; h: number; depth: number;
}[] = [
  // 01 — a steep launch off the gate to set the tone immediately
  { kind: 'kicker', at: 0.040, len: 16, h: 2.4, depth: 0 },
  // 02 — whoops into pine panic
  { kind: 'whoops', at: 0.110, len: 28, h: 0.65, depth: 0 },
  // 03 — technical double through the rocks
  { kind: 'double', at: 0.238, len: 32, h: 2.2, depth: 1.1 },
  // 04 — bridge roller (forces weight shift mid-fight)
  { kind: 'roller', at: 0.325, len: 18, h: 1.0, depth: 0 },
  // 05 — THE showpiece: a genuinely enormous gap
  { kind: 'gap', at: 0.392, len: 88, h: 5.6, depth: 7.5 },
  // 05 — landing roller so you can pump out of it
  { kind: 'roller', at: 0.432, len: 24, h: 1.2, depth: 0 },
  // 08 — cliffside kicker (commit or scrub)
  { kind: 'kicker', at: 0.690, len: 18, h: 2.8, depth: 0 },
  // 09 — big tabletop in the middle of the brawl
  { kind: 'table', at: 0.795, len: 52, h: 3.4, depth: 0 },
  // 09 — second double so the canyon isn't one note
  { kind: 'double', at: 0.840, len: 30, h: 2.0, depth: 1.0 },
  // 10 — final launch at the crowd
  { kind: 'kicker', at: 0.952, len: 20, h: 3.6, depth: 0 },
];
