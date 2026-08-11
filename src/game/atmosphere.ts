// ---------------------------------------------------------------------------
// Atmosphere helpers — sky textures, ridge silhouettes, ambient particles
// Driven by TrackAtmosphere so each mountain owns its horizon.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { fbm1, clamp01, TAU, RNG } from './core';
import type { TrackAtmosphere } from './trackDef';

/** Build a vertical sky gradient texture from atmosphere stops. */
export function makeThemeSkyTexture(stops: TrackAtmosphere['sky']): THREE.Texture {
  const W = 32, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 0, H);
  const t = [0.00, 0.22, 0.42, 0.58, 0.72, 0.88, 1.00];
  for (let i = 0; i < 7; i++) grd.addColorStop(t[i], stops[i]);
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * Layered mountain vistas tinted by atmosphere. Three rings + valley floor.
 * Unlit: colour IS aerial perspective.
 */
export function buildThemeRidges(atmo: TrackAtmosphere, seed = 0): THREE.Group {
  const group = new THREE.Group();
  const LAYERS = [
    { R: 1750, base: -340, amp: 210, tall: 300, seed: seed + 0.0, tint: 0.18, sharp: 1.5 },
    { R: 2500, base: -320, amp: 300, tall: 520, seed: seed + 51.3, tint: 0.46, sharp: 1.1 },
    { R: 3300, base: -300, amp: 380, tall: 760, seed: seed + 97.7, tint: 0.72, sharp: 0.85 },
  ];
  const HAZE = new THREE.Color(atmo.ridgeHaze);
  const ROCK = new THREE.Color(atmo.ridgeRock);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(3400, 40).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(atmo.valleyColor),
      fog: false, depthWrite: false, transparent: true, opacity: 0.92,
    }),
  );
  floor.position.y = -560;
  floor.renderOrder = -9;
  group.add(floor);

  for (const L of LAYERS) {
    const seg = 190;
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const c = new THREE.Color();
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * TAU;
      const n1 = fbm1(i * 0.11 + L.seed, 4);
      const n2 = Math.max(0, fbm1(i * 0.037 + L.seed + 20, 2));
      const peak = Math.pow(Math.abs(n1), 1 / L.sharp) * Math.sign(n1);
      const hgt = L.amp + peak * L.amp * 0.9 + n2 * L.tall;
      const x = Math.cos(a) * L.R, z = Math.sin(a) * L.R;
      pos.push(x, L.base, z);
      pos.push(x, L.base + hgt, z);
      c.copy(ROCK).lerp(HAZE, L.tint);
      col.push(c.r, c.g, c.b);
      const snow = clamp01((hgt - L.amp * 1.1) / (L.tall * 0.7));
      c.copy(ROCK).lerp(new THREE.Color(1, 1, 1), snow * 0.45).lerp(HAZE, L.tint);
      col.push(c.r, c.g, c.b);
    }
    for (let i = 0; i < seg; i++) {
      const a = i * 2, b = a + 1, d = a + 2, e = a + 3;
      idx.push(a, d, b, b, d, e);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      vertexColors: true, side: THREE.DoubleSide, fog: false, depthWrite: false,
    }));
    m.renderOrder = -8;
    group.add(m);
  }
  return group;
}

/**
 * Lightweight ambient particles (ash, mist, dust, leaves, embers).
 * Pooled Points — repositions around the camera each frame.
 */
export class AmbienceParticles {
  points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private vel: Float32Array;
  private n: number;
  private kind: TrackAtmosphere['particle'] = 'none';
  private color = new THREE.Color(0xffffff);
  private rate = 0;
  private rng = new RNG(9001);
  constructor(soft: THREE.Texture, max = 180) {
    this.n = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.vel = new Float32Array(max * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    const mat = new THREE.PointsMaterial({
      map: soft,
      size: 1.8,
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      blending: THREE.NormalBlending,
      sizeAttenuation: true,
      fog: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    this.points.visible = false;
  }

  apply(atmo: TrackAtmosphere) {
    this.kind = atmo.particle;
    this.color.setHex(atmo.particleColor);
    this.rate = atmo.particleRate;
    this.points.visible = this.kind !== 'none' && this.rate > 0.01;
    const mat = this.points.material as THREE.PointsMaterial;
    mat.size = this.kind === 'mist' ? 4.5
      : this.kind === 'embers' ? 1.2
      : this.kind === 'ash' ? 1.6
      : this.kind === 'leaves' ? 2.2
      : 1.4;
    mat.blending = this.kind === 'embers'
      ? THREE.AdditiveBlending
      : THREE.NormalBlending;
    // seed particles off-screen until first update
    for (let i = 0; i < this.n; i++) this.respawn(i, new THREE.Vector3(), true);
  }

  private respawn(i: number, cam: THREE.Vector3, cold = false) {
    const r = cold ? this.rng.range(8, 90) : this.rng.range(20, 70);
    const a = this.rng.range(0, TAU);
    const y = this.rng.range(-6, this.kind === 'mist' ? 18 : 28);
    this.pos[i * 3] = cam.x + Math.cos(a) * r;
    this.pos[i * 3 + 1] = cam.y + y;
    this.pos[i * 3 + 2] = cam.z + Math.sin(a) * r;

    const fall = this.kind === 'ash' ? this.rng.range(-2.5, -0.6)
      : this.kind === 'leaves' ? this.rng.range(-1.2, -0.2)
      : this.kind === 'embers' ? this.rng.range(0.4, 2.2)
      : this.kind === 'mist' ? this.rng.range(-0.3, 0.3)
      : this.rng.range(-0.8, 0.2);
    const drift = this.rng.range(-1.5, 1.5);
    this.vel[i * 3] = drift;
    this.vel[i * 3 + 1] = fall;
    this.vel[i * 3 + 2] = this.rng.range(-1.2, 1.2);

    const a0 = this.kind === 'mist' ? 0.12
      : this.kind === 'embers' ? 0.75
      : this.kind === 'ash' ? 0.35
      : 0.28;
    const jitter = this.rng.range(0.7, 1.15);
    this.col[i * 4] = this.color.r * jitter;
    this.col[i * 4 + 1] = this.color.g * jitter;
    this.col[i * 4 + 2] = this.color.b * jitter;
    this.col[i * 4 + 3] = a0 * this.rate * this.rng.range(0.5, 1);
  }

  update(dt: number, cam: THREE.Vector3, wind = 0.4) {
    if (!this.points.visible) return;
    const windX = wind * 1.2;
    for (let i = 0; i < this.n; i++) {
      this.pos[i * 3] += (this.vel[i * 3] + windX) * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      // respawn if too far from camera
      const dx = this.pos[i * 3] - cam.x;
      const dy = this.pos[i * 3 + 1] - cam.y;
      const dz = this.pos[i * 3 + 2] - cam.z;
      if (dx * dx + dy * dy + dz * dz > 95 * 95 || this.pos[i * 3 + 1] < cam.y - 25) {
        this.respawn(i, cam);
      }
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
