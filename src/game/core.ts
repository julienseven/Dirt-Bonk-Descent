// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: core math, noise, and small utilities
// ---------------------------------------------------------------------------

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => (b - a === 0 ? 0 : (v - a) / (b - a));
export const smoothstep = (t: number) => t * t * (3 - 2 * t);
export const smootherstep = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t: number) => t * t * t;
export const easeOutBack = (t: number) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const TAU = Math.PI * 2;

/** Frame-rate independent exponential approach. `rate` = how much of the gap closes per second. */
export const damp = (current: number, target: number, rate: number, dt: number) =>
  lerp(current, target, 1 - Math.exp(-rate * dt));

export const approach = (current: number, target: number, maxDelta: number) => {
  const d = target - current;
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
};

export const wrapAngle = (a: number) => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};

// --- deterministic RNG -----------------------------------------------------

export class RNG {
  private s: number;
  constructor(seed = 1337) {
    this.s = seed >>> 0 || 1;
  }
  next() {
    // xorshift32
    let x = this.s;
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5; x >>>= 0;
    this.s = x;
    return x / 4294967296;
  }
  range(a: number, b: number) { return a + (b - a) * this.next(); }
  int(a: number, b: number) { return Math.floor(this.range(a, b + 1)); }
  pick<T>(arr: T[]): T { return arr[Math.floor(this.next() * arr.length) % arr.length]; }
  chance(p: number) { return this.next() < p; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
}

// --- value noise -----------------------------------------------------------

const hash1 = (n: number) => {
  const s = Math.sin(n * 127.1) * 43758.5453123;
  return s - Math.floor(s);
};

/** 1D smooth value noise in [-1, 1]. */
export function noise1(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hash1(i), b = hash1(i + 1);
  return (a + (b - a) * u) * 2 - 1;
}

/** Fractal 1D noise. */
export function fbm1(x: number, octaves = 4, lac = 2.03, gain = 0.5): number {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise1(x * freq + i * 31.7) * amp;
    norm += amp;
    amp *= gain;
    freq *= lac;
  }
  return sum / norm;
}

const hash2 = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
};

/** 2D smooth value noise in [-1, 1]. */
export function noise2(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  const top = a + (b - a) * ux;
  const bot = c + (d - c) * ux;
  return (top + (bot - top) * uy) * 2 - 1;
}

export function fbm2(x: number, y: number, octaves = 4): number {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise2(x * freq + i * 17.3, y * freq - i * 9.1) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.07;
  }
  return sum / norm;
}

// --- misc ------------------------------------------------------------------

export function formatTime(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const cs = Math.floor((t * 100) % 100);
  return `${m}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export const PLACE_LABEL = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];
