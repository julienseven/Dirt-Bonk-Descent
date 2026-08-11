// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: performance governor
//
// Two jobs:
//   1. LOD — decide what detail level a thing at distance D should render at.
//   2. BUDGET — watch the frame clock and shed non-gameplay cost when we're
//      missing 60fps, in a fixed priority order.
//
// The priority order matters and is deliberate: particles and scenery detail
// go first, AI fidelity and physics rate go last. Nothing here is allowed to
// touch the player's physics step, because "don't sacrifice gameplay feel"
// means the sim must stay identical whether the GPU is coping or not.
// ---------------------------------------------------------------------------

export enum Lod { NEAR = 0, MID = 1, FAR = 2, CULLED = 3 }

/** Distance bands in metres. */
export const LOD_BANDS = [45, 130, 320];

export function lodFor(dist: number): Lod {
  if (dist < LOD_BANDS[0]) return Lod.NEAR;
  if (dist < LOD_BANDS[1]) return Lod.MID;
  if (dist < LOD_BANDS[2]) return Lod.FAR;
  return Lod.CULLED;
}

/**
 * How often a rival should run its full AI think, by distance. Racers far
 * behind still need to move, but they don't need to re-plan their line at
 * 60Hz — nobody can see them do it.
 */
export function aiThinkInterval(dist: number): number {
  if (dist < 60) return 0;        // every frame
  if (dist < 160) return 1 / 20;
  if (dist < 400) return 1 / 8;
  return 1 / 3;
}

export interface PerfSample {
  fps: number;
  frameMs: number;
  tier: number;
  particles: number;
  draws: number;
}

/**
 * Adaptive quality. Measures a rolling median frame time and steps a quality
 * tier up or down, with hysteresis so it can't oscillate every frame.
 */
export class PerfGovernor {
  /** 0 = full quality, 3 = minimum */
  tier = 0;
  private samples: number[] = [];
  private cursor = 0;
  private readonly N = 45;
  private cooldown = 0;
  private accum = 0;
  fps = 60;
  enabled = true;

  constructor(startTier = 0) { this.tier = startTier; }

  /** Feed the frame time in seconds. */
  sample(dt: number) {
    const ms = dt * 1000;
    if (this.samples.length < this.N) this.samples.push(ms);
    else { this.samples[this.cursor] = ms; this.cursor = (this.cursor + 1) % this.N; }

    this.accum += dt;
    if (this.accum < 0.5) return;
    this.accum = 0;
    if (this.cooldown > 0) { this.cooldown--; return; }
    if (this.samples.length < this.N) return;

    // median is robust against the odd GC spike; a mean would over-react
    const sorted = this.samples.slice().sort((a, b) => a - b);
    const med = sorted[sorted.length >> 1];
    this.fps = 1000 / Math.max(0.1, med);

    if (!this.enabled) return;
    // 20ms ~= 50fps: we're missing the target, shed something
    if (med > 20.0 && this.tier < 3) { this.tier++; this.cooldown = 4; }
    // 13.5ms ~= 74fps: comfortable headroom, take some back
    else if (med < 13.5 && this.tier > 0) { this.tier--; this.cooldown = 6; }
  }

  // ---- what each tier costs, in priority order -------------------------

  /**
   * Optional floor applied by heavy mountains (forest / endurance) so the
   * first frames don't thrash before adaptive sampling has evidence.
   * 0 = no bias; 1–2 nudges the starting tier without locking quality.
   */
  themeFloor = 0;

  /** Particle spawn rate multiplier. First thing to go. */
  get particleScale(): number {
    const t = Math.min(3, this.tier + this.themeFloor);
    return [1, 0.7, 0.45, 0.25][t];
  }

  /** Scenery LOD distances shrink as tier rises. */
  get lodScale(): number {
    const t = Math.min(3, this.tier + this.themeFloor);
    return [1, 0.82, 0.65, 0.5][t];
  }

  /** Extra spectators beyond the near band get dropped. */
  get crowdScale(): number {
    const t = Math.min(3, this.tier + this.themeFloor);
    return [1, 0.8, 0.55, 0.3][t];
  }

  /** Renderer pixel ratio ceiling. Last visual resort. */
  get pixelRatio(): number {
    const t = Math.min(3, this.tier + this.themeFloor);
    return [2, 1.75, 1.4, 1.0][t];
  }

  /**
   * AI think rate multiplier. Deliberately mild even at the worst tier —
   * degrading the race is worse than degrading the picture.
   */
  get aiScale(): number { return [1, 1, 1.4, 2.0][this.tier]; }

  /** Set a soft quality floor for dense/long mountains. */
  setThemeFloor(n: number) {
    this.themeFloor = Math.max(0, Math.min(2, n | 0));
  }

  reset() {
    this.samples.length = 0; this.cursor = 0; this.tier = 0;
    this.cooldown = 0; this.themeFloor = 0;
  }
}

/** Suggested governor floor by mountain theme + length. */
export function themePerfFloor(theme: string, length: number): number {
  if (theme === 'forest') return 1;
  if (theme === 'limestone' || length > 5500) return 1;
  if (theme === 'volcanic') return 0; // short sprint, few trees
  return 0;
}

/**
 * Mobile (coarse pointer / touch-first) bumps the floor so dense mountains
 * start leaner. Caps at 2 so ABSURD/limestone doesn't collapse to mush.
 */
export function mobilePerfFloor(theme: string, length: number, mobile: boolean): number {
  const base = themePerfFloor(theme, length);
  if (!mobile) return base;
  return Math.min(2, base + 1);
}

/**
 * Fixed-timestep accumulator. Keeps physics deterministic regardless of
 * frame rate, which matters because the ghost, the balance harness and the
 * live race must all agree.
 */
export class FixedStep {
  /** seconds per physics tick */
  readonly step: number;
  private acc = 0;
  /** cap on catch-up ticks, so a stall can't spiral */
  private readonly maxTicks: number;

  constructor(hz = 120, maxTicks = 5) {
    this.step = 1 / hz;
    this.maxTicks = maxTicks;
  }

  /** Returns how many fixed ticks to run this frame. */
  count(dt: number): number {
    this.acc += dt;
    let n = 0;
    while (this.acc >= this.step && n < this.maxTicks) {
      this.acc -= this.step;
      n++;
    }
    // dropped time: discard rather than accumulate a debt we can't pay
    if (this.acc > this.step * this.maxTicks) this.acc = 0;
    return n;
  }

  /** 0..1 position between the last tick and the next, for interpolation. */
  get alpha() { return this.acc / this.step; }

  reset() { this.acc = 0; }
}
