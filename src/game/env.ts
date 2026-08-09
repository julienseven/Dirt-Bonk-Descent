// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: environmental interaction
//
// Every prop the world can throw at you, described in one table so the
// collision resolver, the mesh builder and the FX layer all agree on how a
// thing behaves. Adding a new prop means adding a row here, not editing
// three separate switch statements.
// ---------------------------------------------------------------------------

export type PropKind =
  | 'bale' | 'cone' | 'barrel' | 'log' | 'rock' | 'puddle'
  | 'fence' | 'sign' | 'barrier' | 'ramp' | 'boulder' | 'water' | 'drift';

export type Reaction =
  /** flies away intact, tumbling */
  | 'scatter'
  /** shatters into debris and is destroyed */
  | 'shatter'
  /** pivots over and stays down */
  | 'topple'
  /** immovable; you lose */
  | 'solid'
  /** rideable: launches you */
  | 'launch'
  /** no collision, but changes the surface and throws spray */
  | 'surface';

export interface PropDef {
  kind: PropKind;
  reaction: Reaction;
  /** collision radius (m) */
  radius: number;
  /** how much it slows you, and how hard it resists (kg-ish) */
  mass: number;
  /** how high you must be to clear it */
  height: number;
  /** debris pieces on destruction */
  shards: number;
  /** colour for debris + instanced mesh */
  colour: number;
  /** secondary colour, used by some builders */
  colour2?: number;
  /** speed (m/s) below which it just gets nudged rather than destroyed */
  breakSpeed?: number;
  /** launch strength for ramps */
  launch?: number;
  /** surface override radius for water/mud/snow patches */
  patch?: number;
  label?: string;
}

export const PROPS: Record<PropKind, PropDef> = {
  bale:    { kind: 'bale', reaction: 'scatter', radius: 0.85, mass: 2.4, height: 1.4, shards: 6, colour: 0xd8b45c },
  cone:    { kind: 'cone', reaction: 'scatter', radius: 0.36, mass: 0.5, height: 0.75, shards: 3, colour: 0xff5a1f },
  barrel:  { kind: 'barrel', reaction: 'scatter', radius: 0.55, mass: 1.6, height: 1.1, shards: 5, colour: 0x2f7bff },
  log:     { kind: 'log', reaction: 'solid', radius: 2.2, mass: 999, height: 0.95, shards: 0, colour: 0x6b4a2c },
  rock:    { kind: 'rock', reaction: 'solid', radius: 1.0, mass: 999, height: 1.2, shards: 0, colour: 0x7d766c },
  puddle:  { kind: 'puddle', reaction: 'surface', radius: 1.4, mass: 0, height: 0, shards: 0, colour: 0x30404a, patch: 1.6 },

  // ---- new environmental objects
  fence: {
    kind: 'fence', reaction: 'shatter', radius: 1.5, mass: 1.1, height: 1.15,
    shards: 10, colour: 0xc4a878, colour2: 0x8a7350, breakSpeed: 7,
    label: 'FENCE',
  },
  sign: {
    kind: 'sign', reaction: 'topple', radius: 0.5, mass: 0.9, height: 2.0,
    shards: 4, colour: 0xe8e2d0, colour2: 0x5a5a62, breakSpeed: 5,
    label: 'SIGN',
  },
  barrier: {
    kind: 'barrier', reaction: 'scatter', radius: 1.15, mass: 4.2, height: 1.0,
    shards: 7, colour: 0xff8a1f, colour2: 0xf2f2f2, breakSpeed: 12,
    label: 'BARRIER',
  },
  ramp: {
    kind: 'ramp', reaction: 'launch', radius: 2.4, mass: 999, height: 0.1,
    shards: 0, colour: 0x8a6237, launch: 9.5, label: 'RAMP',
  },
  boulder: {
    // spawns above the track and rolls down across your line
    kind: 'boulder', reaction: 'solid', radius: 1.35, mass: 999, height: 1.9,
    shards: 0, colour: 0x6e675d, label: 'ROCKFALL',
  },
  water: {
    kind: 'water', reaction: 'surface', radius: 3.2, mass: 0, height: 0,
    shards: 0, colour: 0x3d6e82, patch: 3.6, label: 'WATER',
  },
  drift: {
    // snow drift: soft, slows you, throws powder
    kind: 'drift', reaction: 'surface', radius: 2.6, mass: 0, height: 0,
    shards: 0, colour: 0xeaf2f8, patch: 3.0, label: 'SNOW',
  },
};

/** Score for destroying a thing, before the combo multiplier. */
export const PROP_SCORE: Partial<Record<PropKind, number>> = {
  fence: 160, sign: 120, barrier: 200, bale: 120, cone: 80, barrel: 140,
};

/** Boost granted for destroying a thing. */
export const PROP_BOOST: Partial<Record<PropKind, number>> = {
  fence: 7, sign: 5, barrier: 9, bale: 6, cone: 3, barrel: 7,
};

/** Callout text on destruction. */
export const PROP_CALL: Partial<Record<PropKind, string>> = {
  fence: 'THROUGH THE FENCE!', sign: 'SIGN DOWN!', barrier: 'BARRIER BLASTED!',
  bale: 'PLOW', cone: 'CONED', barrel: 'BARREL ROLL',
};

/** Which props each surface theme should scatter around. */
export const THEME_PROPS: Record<string, PropKind[]> = {
  dirt: ['cone', 'bale', 'fence', 'sign'],
  grass: ['bale', 'fence', 'sign', 'cone'],
  rock: ['rock', 'boulder', 'barrier'],
  mud: ['log', 'puddle', 'water', 'bale'],
  gravel: ['barrel', 'barrier', 'cone', 'rock'],
};

/** Surface effect of standing in a patch. */
export function patchSurface(kind: PropKind): {
  grip: number; drag: number; spray: 'water' | 'snow' | 'mud' | null;
} | null {
  switch (kind) {
    case 'water': return { grip: 0.80, drag: 2.6, spray: 'water' };
    case 'puddle': return { grip: 0.86, drag: 1.9, spray: 'water' };
    case 'drift': return { grip: 0.72, drag: 3.1, spray: 'snow' };
    default: return null;
  }
}
