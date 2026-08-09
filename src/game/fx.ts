// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: procedural textures + particle systems
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { RNG, clamp01, lerp } from './core';

// --- canvas helpers --------------------------------------------------------
function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

function finish(c: HTMLCanvasElement, repeat = true): THREE.Texture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 8;
  return t;
}

/** Gritty dirt / gravel surface, mostly white so vertex colours drive the hue. */
export function makeDirtTexture(): THREE.Texture {
  const S = 512;
  const [c, g] = canvas(S);
  const rng = new RNG(9182);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);
  // large mottling
  for (let i = 0; i < 260; i++) {
    const x = rng.range(0, S), y = rng.range(0, S), r = rng.range(18, 90);
    const a = rng.range(0.02, 0.07);
    const dark = rng.chance(0.55);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(${dark ? 40 : 255},${dark ? 34 : 252},${dark ? 28 : 240},${a})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // Gravel. Deliberately restrained: high-frequency speckle at strong alpha
  // reads as noise rather than dirt, and shimmers badly once the surface is
  // moving. Fewer, larger, softer stones hold together at speed.
  for (let i = 0; i < 1700; i++) {
    const x = rng.range(0, S), y = rng.range(0, S);
    const r = rng.range(1.4, 4.2);
    const v = rng.range(0, 1);
    g.fillStyle = v > 0.62
      ? `rgba(255,252,244,${rng.range(0.05, 0.16)})`
      : `rgba(38,30,22,${rng.range(0.05, 0.14)})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // a few larger embedded stones give scale reference without density
  for (let i = 0; i < 260; i++) {
    const x = rng.range(0, S), y = rng.range(0, S);
    const r = rng.range(3.5, 8);
    g.fillStyle = `rgba(${rng.chance(0.5) ? '210,200,184' : '52,42,32'},${rng.range(0.06, 0.13)})`;
    g.beginPath(); g.ellipse(x, y, r, r * rng.range(0.6, 1), rng.range(0, 3), 0, Math.PI * 2); g.fill();
  }
  // directional drag streaks (tyre wear)
  for (let i = 0; i < 160; i++) {
    const x = rng.range(0, S), y = rng.range(0, S);
    const len = rng.range(20, 120);
    g.strokeStyle = `rgba(${rng.chance(0.5) ? '20,16,12' : '255,250,240'},${rng.range(0.03, 0.10)})`;
    g.lineWidth = rng.range(0.6, 3);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + rng.range(-8, 8), y + len); g.stroke();
  }
  return finish(c);
}

/** Soft round alpha blob for dust / smoke. */
export function makeSoftTexture(): THREE.Texture {
  const S = 128;
  const [c, g] = canvas(S);
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.42, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Hard chunky clod / spark shape. */
export function makeChunkTexture(): THREE.Texture {
  const S = 64;
  const [c, g] = canvas(S);
  g.fillStyle = 'rgba(255,255,255,1)';
  g.beginPath();
  const pts = 7;
  for (let i = 0; i < pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    const r = S / 2 * (0.6 + Math.sin(i * 2.3) * 0.22);
    const x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r;
    i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
  }
  g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Caution tape strip: repeating chevrons. */
export function makeTapeTexture(colA = '#ffd400', colB = '#161616'): THREE.Texture {
  const W = 256, H = 64;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = colA; g.fillRect(0, 0, W, H);
  g.fillStyle = colB;
  for (let i = -2; i < 8; i++) {
    g.beginPath();
    const x = i * 64;
    g.moveTo(x, 0); g.lineTo(x + 32, 0); g.lineTo(x + 32 - 40, H); g.lineTo(x - 40, H);
    g.closePath(); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Seamless ripple bands for flowing water. Scrolled via texture offset. */
export function makeRippleTexture(): THREE.Texture {
  const S = 128;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#9fc8d8';
  g.fillRect(0, 0, S, S);
  // horizontal crests, wrapped so the tile is seamless vertically
  for (let i = 0; i < 26; i++) {
    const y = (i / 26) * S;
    const a = 0.10 + Math.abs(Math.sin(i * 1.7)) * 0.22;
    g.strokeStyle = `rgba(255,255,255,${a})`;
    g.lineWidth = 1 + Math.abs(Math.sin(i * 2.3)) * 2.5;
    g.beginPath();
    for (let x = 0; x <= S; x += 4) {
      const yy = y + Math.sin((x / S) * Math.PI * 4 + i) * 2.5;
      x === 0 ? g.moveTo(x, yy) : g.lineTo(x, yy);
    }
    g.stroke();
  }
  // darker troughs for depth
  for (let i = 0; i < 14; i++) {
    const y = (i / 14) * S + 3;
    g.strokeStyle = 'rgba(30,70,90,0.16)';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Grass tuft alpha: a few tapered blades on a transparent field. */
export function makeTuftTexture(): THREE.Texture {
  const S = 64;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!;
  const rng = new RNG(515);
  g.clearRect(0, 0, S, S);
  for (let i = 0; i < 11; i++) {
    const x0 = rng.range(6, S - 6);
    const lean = rng.range(-11, 11);
    const top = rng.range(6, 26);
    const w = rng.range(2.2, 4.4);
    const v = Math.floor(rng.range(190, 255));
    g.fillStyle = `rgba(${v},${v},${v},1)`;
    g.beginPath();
    g.moveTo(x0 - w / 2, S);
    g.lineTo(x0 + w / 2, S);
    g.lineTo(x0 + lean + 0.6, top);
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Chequered start/finish strip. */
export function makeCheckerTexture(): THREE.Texture {
  const W = 256, H = 64;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const n = 16, cw = W / n, ch = H / 2;
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < n; x++) {
      g.fillStyle = (x + y) % 2 ? '#111111' : '#f6f6f6';
      g.fillRect(x * cw, y * ch, cw, ch);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Sponsor banner canvas with bold nonsense-brand type. */
export function makeBannerTexture(text: string, bg: string, fg: string): THREE.Texture {
  const W = 512, H = 128;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,255,255,0.10)';
  for (let i = 0; i < 12; i++) g.fillRect(i * 48, 0, 22, H);
  g.fillStyle = fg;
  g.font = 'bold 68px Impact, "Arial Black", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.save(); g.translate(W / 2, H / 2 + 3);
  g.transform(1, 0, -0.14, 1, 0, 0);
  g.fillText(text, 0, 0);
  g.restore();
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 8; g.strokeRect(0, 0, W, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Sky dome gradient with sun bloom + haze band. */
export function makeSkyTexture(): THREE.Texture {
  const W = 32, H = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  // Late afternoon: deep blue zenith falling through pale haze into a warm
  // band at the horizon. The warm/cool split is what makes distant peaks
  // read as far away rather than merely small.
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0.00, '#1d3f78');
  grd.addColorStop(0.26, '#4a86c6');
  grd.addColorStop(0.50, '#93c6e4');
  grd.addColorStop(0.66, '#d6e2e4');
  grd.addColorStop(0.78, '#f0d9ac');
  grd.addColorStop(0.90, '#eec085');
  grd.addColorStop(1.00, '#d99b62');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Cloud sprite sheet-ish puffy alpha. */
export function makeCloudTexture(): THREE.Texture {
  const S = 256;
  const [c, g] = canvas(S);
  const rng = new RNG(4242);
  g.clearRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) {
    const x = S / 2 + rng.range(-70, 70);
    const y = S / 2 + rng.range(-26, 22);
    const r = rng.range(24, 62);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.5)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------
// Particle pool
// ---------------------------------------------------------------------------

export interface SpawnOpts {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  size: number;
  endSize?: number;
  color: THREE.Color;
  endColor?: THREE.Color;
  alpha?: number;
  gravity?: number;
  drag?: number;
  spin?: number;
  bounce?: number;
  groundY?: number;
}

const VS = `
attribute float aSize;
attribute vec4 aColor;
attribute float aRot;
varying vec4 vColor;
varying float vRot;
void main() {
  vColor = aColor;
  vRot = aRot;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (420.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;

const FS = `
uniform sampler2D map;
varying vec4 vColor;
varying float vRot;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float c = cos(vRot), s = sin(vRot);
  uv = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c) + 0.5;
  vec4 t = texture2D(map, uv);
  float a = t.a * vColor.a;
  if (a < 0.012) discard;
  gl_FragColor = vec4(vColor.rgb * t.rgb, a);
}`;

export class ParticlePool {
  points: THREE.Points;
  private geo: THREE.BufferGeometry;
  private N: number;
  private pos: Float32Array;
  private col: Float32Array;
  private siz: Float32Array;
  private rot: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private size0: Float32Array;
  private size1: Float32Array;
  private c0: Float32Array;
  private c1: Float32Array;
  private a0: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private spin: Float32Array;
  private bnc: Float32Array;
  private gy: Float32Array;
  private cursor = 0;
  /** highest slot index ever used since the pool last fully drained */
  private hi = -1;
  live = 0;

  constructor(count: number, map: THREE.Texture, blending: THREE.Blending, depthWrite = false) {
    this.N = count;
    this.pos = new Float32Array(count * 3);
    this.col = new Float32Array(count * 4);
    this.siz = new Float32Array(count);
    this.rot = new Float32Array(count);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);
    this.size0 = new Float32Array(count);
    this.size1 = new Float32Array(count);
    this.c0 = new Float32Array(count * 3);
    this.c1 = new Float32Array(count * 3);
    this.a0 = new Float32Array(count);
    this.grav = new Float32Array(count);
    this.drag = new Float32Array(count);
    this.spin = new Float32Array(count);
    this.bnc = new Float32Array(count);
    this.gy = new Float32Array(count);
    for (let i = 0; i < count; i++) this.pos[i * 3 + 1] = -99999;

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.siz, 1));
    this.geo.setAttribute('aRot', new THREE.BufferAttribute(this.rot, 1));
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);

    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: map } },
      vertexShader: VS, fragmentShader: FS,
      transparent: true, depthWrite, blending,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
  }

  spawn(o: SpawnOpts) {
    const i = this.cursor;
    if (i > this.hi) this.hi = i;
    this.cursor = (this.cursor + 1) % this.N;
    const i3 = i * 3;
    this.pos[i3] = o.pos.x; this.pos[i3 + 1] = o.pos.y; this.pos[i3 + 2] = o.pos.z;
    this.vel[i3] = o.vel.x; this.vel[i3 + 1] = o.vel.y; this.vel[i3 + 2] = o.vel.z;
    this.life[i] = o.life; this.maxLife[i] = o.life;
    this.size0[i] = o.size; this.size1[i] = o.endSize ?? o.size * 1.6;
    this.c0[i3] = o.color.r; this.c0[i3 + 1] = o.color.g; this.c0[i3 + 2] = o.color.b;
    const ec = o.endColor ?? o.color;
    this.c1[i3] = ec.r; this.c1[i3 + 1] = ec.g; this.c1[i3 + 2] = ec.b;
    this.a0[i] = o.alpha ?? 1;
    this.grav[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 0.6;
    this.spin[i] = o.spin ?? 0;
    this.bnc[i] = o.bounce ?? 0;
    this.gy[i] = o.groundY ?? -1e9;
    this.rot[i] = Math.random() * 6.28;
  }

  update(dt: number) {
    let live = 0;
    // Only sweep slots that have actually been used. An idle 2600-slot pool
    // was costing a full pass every frame to find nothing.
    const end = this.hi + 1;
    for (let i = 0; i < end; i++) {
      if (this.life[i] <= 0) { this.col[i * 4 + 3] = 0; continue; }
      live++;
      this.life[i] -= dt;
      const i3 = i * 3;
      const t = 1 - clamp01(this.life[i] / this.maxLife[i]);
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= d;
      this.vel[i3 + 1] = this.vel[i3 + 1] * d - this.grav[i] * dt;
      this.vel[i3 + 2] *= d;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < this.gy[i]) {
        this.pos[i3 + 1] = this.gy[i];
        if (this.bnc[i] > 0 && this.vel[i3 + 1] < -1) {
          this.vel[i3 + 1] *= -this.bnc[i];
          this.vel[i3] *= 0.6; this.vel[i3 + 2] *= 0.6;
        } else { this.vel[i3 + 1] = 0; }
      }
      this.rot[i] += this.spin[i] * dt;
      this.siz[i] = lerp(this.size0[i], this.size1[i], t);
      const i4 = i * 4;
      this.col[i4] = lerp(this.c0[i3], this.c1[i3], t);
      this.col[i4 + 1] = lerp(this.c0[i3 + 1], this.c1[i3 + 1], t);
      this.col[i4 + 2] = lerp(this.c0[i3 + 2], this.c1[i3 + 2], t);
      const fadeIn = clamp01(t / 0.12);
      this.col[i4 + 3] = this.a0[i] * fadeIn * (1 - t) * (1 - t * 0.35);
      if (this.life[i] <= 0) this.col[i4 + 3] = 0;
    }
    this.live = live;
    // fully drained -> collapse the sweep range until something spawns again
    if (live === 0) { this.hi = -1; this.cursor = 0; }
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aRot as THREE.BufferAttribute).needsUpdate = true;
  }

  clear() {
    for (let i = 0; i < this.N; i++) { this.life[i] = 0; this.col[i * 4 + 3] = 0; }
    this.hi = -1;
    this.cursor = 0;
    (this.geo.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
  }
}
