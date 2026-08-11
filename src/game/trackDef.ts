// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: TrackDefinition
//
// Data-driven mountain package. Geometry (sections + setpieces) stays in the
// per-mountain modules; this module owns the *world identity* — atmosphere,
// sky, lighting, ridge palette, and landmark tags that make each mountain
// immediately recognizable from a screenshot.
//
// Philosophy:
//   authored spline / sections  →  gameplay shape
//   TrackAtmosphere             →  mood, sky, light, fog, distant ridges
//   landmarks + theme           →  set-piece builders pick the right props
// ---------------------------------------------------------------------------

import type { Zone } from './track';

/** Visual world identity for a mountain. */
export type TrackTheme =
  | 'alpine'      // Shaleback — cool daylight, green forest, brown dirt
  | 'volcanic'    // Cinder — ash, heat, dark rock
  | 'forest'      // Thornwood — mist, dense canopy
  | 'limestone'   // Ironjaw — high rock, thin air
  | 'sunset'      // Lastlight — golden hour climax
  | 'canyon';     // Redrock — sun-blasted shelves

export interface ScriptedFeature {
  kind: string;
  at: number;
  len: number;
  h: number;
  depth: number;
}

/**
 * Per-mountain atmospheric profile. Applied when the mountain loads and
 * gently re-targeted each frame as the player descends (fog density still
 * responds to zone.fog; base colour / sun / sky come from here).
 */
export interface TrackAtmosphere {
  /** Scene fog base colour (hex). Zone.far tints toward this. */
  fogColor: number;
  /** Multiplier on zone fog density (1 = current default scale). */
  fogScale: number;
  /** Sky gradient stops top→bottom as CSS colours. */
  sky: [string, string, string, string, string, string, string];
  /** Directional key light. */
  sunColor: number;
  sunIntensity: number;
  /** Offset from camera, unit-ish direction scaled in game. */
  sunOffset: [number, number, number];
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  exposure: number;
  /** Distant ridge rock colour before haze. */
  ridgeRock: number;
  /** Haze colour layered onto ridges. */
  ridgeHaze: number;
  /** Valley floor under the ridges. */
  valleyColor: number;
  cloudOpacity: number;
  /** Subtle world particles while racing. */
  particle: 'none' | 'ash' | 'mist' | 'dust' | 'leaves' | 'embers';
  particleColor: number;
  particleRate: number;
}

export interface TrackLandmark {
  /** Stable id for debug / docs. */
  id: string;
  /** Builder key used by Track.buildLandmarks(). */
  kind:
    | 'summit_crags'
    | 'fallen_giant'
    | 'timber_bridge'
    | 'cliff_jump'
    | 'shale_formation'
    | 'volcano_rim'
    | 'basalt_wall'
    | 'ash_chute'
    | 'lava_fissure'
    | 'ancient_tree'
    | 'root_tunnel'
    | 'mist_ravine'
    | 'iron_jaw'
    | 'suspension_bridge'
    | 'cliff_gate'
    | 'wind_gap'
    | 'spine_ridge'
    | 'sunset_overlook'
    | 'final_spine'
    | 'grandstand'
    | 'start_tower'
    | 'finish_plaza';
  /** Fraction of track length (0..1). */
  at: number;
  /** -1 left, 1 right, 0 centre / both. */
  side?: -1 | 0 | 1;
  scale?: number;
  /** Optional label for debug. */
  label?: string;
}

export interface TrackDefinition {
  id: string;
  name: string;
  theme: TrackTheme;
  seed: number;
  length: number;
  difficulty: number;
  sections: Zone[];
  setpieces: ScriptedFeature[];
  landmarks: TrackLandmark[];
  atmosphere: TrackAtmosphere;
  /** Starting summit elevation in metres (visual anchor). */
  startElevation: number;
}

// ---------------------------------------------------------------------------
// Atmosphere presets — the five mountains + redrock
// ---------------------------------------------------------------------------

export const ATMOS_ALPINE: TrackAtmosphere = {
  fogColor: 0xb8cfe0,
  fogScale: 1.0,
  sky: ['#1a4a88', '#4a8ec8', '#8ec4e0', '#d0e0e4', '#e8d8b0', '#e8c080', '#d09058'],
  sunColor: 0xffe8c0,
  sunIntensity: 2.55,
  sunOffset: [-0.55, 0.55, 0.35],
  hemiSky: 0xa0c8ff,
  hemiGround: 0x7a6a40,
  hemiIntensity: 1.18,
  exposure: 1.22,
  ridgeRock: 0x4a5a70,
  ridgeHaze: 0xc0d4e8,
  valleyColor: 0x6a8a78,
  cloudOpacity: 0.82,
  particle: 'dust',
  particleColor: 0xc8b090,
  particleRate: 0.35,
};

export const ATMOS_VOLCANIC: TrackAtmosphere = {
  fogColor: 0x6a5040,
  fogScale: 1.35,
  sky: ['#1a1420', '#3a2830', '#6a4030', '#a06038', '#c07030', '#e07028', '#ff6020'],
  sunColor: 0xffa060,
  sunIntensity: 2.35,
  sunOffset: [-0.35, 0.38, 0.55],
  hemiSky: 0xffb080,
  hemiGround: 0x4a3020,
  hemiIntensity: 1.05,
  exposure: 1.15,
  ridgeRock: 0x2a2220,
  ridgeHaze: 0x8a6050,
  valleyColor: 0x3a2820,
  cloudOpacity: 0.55,
  particle: 'ash',
  particleColor: 0x6a5a50,
  particleRate: 1.1,
};

export const ATMOS_FOREST: TrackAtmosphere = {
  fogColor: 0x6a7a68,
  fogScale: 1.55,
  sky: ['#1a2a38', '#2a4050', '#4a6870', '#6a8880', '#8aa090', '#a0b098', '#b0b8a0'],
  sunColor: 0xd0e0c8,
  sunIntensity: 1.85,
  sunOffset: [-0.25, 0.72, 0.20],
  hemiSky: 0x88a898,
  hemiGround: 0x3a4a28,
  hemiIntensity: 1.35,
  exposure: 1.10,
  ridgeRock: 0x3a4a40,
  ridgeHaze: 0x90a898,
  valleyColor: 0x2a3a28,
  cloudOpacity: 0.70,
  particle: 'mist',
  particleColor: 0xc0d0c8,
  particleRate: 0.85,
};

export const ATMOS_LIMESTONE: TrackAtmosphere = {
  fogColor: 0xc8d4e0,
  fogScale: 0.78,
  sky: ['#2850a0', '#5080c0', '#90b8e0', '#c8dce8', '#e0e4e0', '#e8e0c8', '#d0c0a0'],
  sunColor: 0xfff0d8,
  sunIntensity: 2.85,
  sunOffset: [-0.70, 0.48, 0.15],
  hemiSky: 0xb0d0ff,
  hemiGround: 0x8a7858,
  hemiIntensity: 1.05,
  exposure: 1.28,
  ridgeRock: 0x6a6a68,
  ridgeHaze: 0xd0dce8,
  valleyColor: 0x5a6a58,
  cloudOpacity: 0.90,
  particle: 'dust',
  particleColor: 0xd0c8b8,
  particleRate: 0.45,
};

export const ATMOS_SUNSET: TrackAtmosphere = {
  fogColor: 0xe0b080,
  fogScale: 0.92,
  sky: ['#1a1848', '#3a2868', '#8a4080', '#e07050', '#ff9040', '#ffb050', '#ffd080'],
  sunColor: 0xffb060,
  sunIntensity: 2.95,
  sunOffset: [0.15, 0.22, 0.85],
  hemiSky: 0xffc0a0,
  hemiGround: 0x8a5030,
  hemiIntensity: 1.25,
  exposure: 1.30,
  ridgeRock: 0x4a3040,
  ridgeHaze: 0xe0a070,
  valleyColor: 0x4a3a50,
  cloudOpacity: 0.75,
  particle: 'embers',
  particleColor: 0xffa040,
  particleRate: 0.55,
};

export const ATMOS_CANYON: TrackAtmosphere = {
  fogColor: 0xd0b090,
  fogScale: 0.95,
  sky: ['#2050a0', '#5090c8', '#90c0e0', '#d0d8d0', '#e8d0a0', '#e0b070', '#c09050'],
  sunColor: 0xffe0a0,
  sunIntensity: 2.70,
  sunOffset: [-0.50, 0.60, 0.40],
  hemiSky: 0xb0d0ff,
  hemiGround: 0xa07040,
  hemiIntensity: 1.12,
  exposure: 1.24,
  ridgeRock: 0x8a5030,
  ridgeHaze: 0xe0c0a0,
  valleyColor: 0x7a5a38,
  cloudOpacity: 0.65,
  particle: 'dust',
  particleColor: 0xd0a070,
  particleRate: 0.70,
};

export const ATMOS_BY_THEME: Record<TrackTheme, TrackAtmosphere> = {
  alpine: ATMOS_ALPINE,
  volcanic: ATMOS_VOLCANIC,
  forest: ATMOS_FOREST,
  limestone: ATMOS_LIMESTONE,
  sunset: ATMOS_SUNSET,
  canyon: ATMOS_CANYON,
};

/** Resolve atmosphere for a theme, with optional overrides. */
export function atmosphereFor(
  theme: TrackTheme,
  patch?: Partial<TrackAtmosphere>,
): TrackAtmosphere {
  return { ...ATMOS_BY_THEME[theme], ...patch };
}
