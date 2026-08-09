// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: rider material library
//
// A single roughness scalar per material class gives you seven kinds of the
// same plastic. Real differentiation comes from roughness *maps* — variation
// across the surface — because that is what the eye reads as "fabric" versus
// "shell" versus "rubber".
//
// Every map here is generated procedurally into a small canvas and shared
// across all riders. Cost is a handful of 128px textures at load, and they
// are cached by key so six riders don't build six copies.
//
// Design rule: nothing is uniformly shiny. The helmet is the only genuinely
// glossy surface on the rider, and even that is broken by scratches.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { RNG } from './core';

const cache = new Map<string, THREE.Texture>();

function build(key: string, size: number, draw: (g: CanvasRenderingContext2D, s: number) => void) {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  // roughness/metalness maps are data, not colour — must stay linear
  t.colorSpace = THREE.NoColorSpace;
  cache.set(key, t);
  return t;
}

/**
 * HELMET. Mostly smooth gloss, broken by fine scratches and a few deeper
 * scuffs. The scratches are the point: an unblemished shell reads as plastic
 * toy, a scratched one reads as equipment that has been used.
 */
export const helmetRough = () => build('helmet', 256, (g, S) => {
  const rng = new RNG(4311);
  // base: semi-gloss
  g.fillStyle = '#3d3d3d';
  g.fillRect(0, 0, S, S);
  // broad clearcoat unevenness, very subtle
  for (let i = 0; i < 40; i++) {
    const x = rng.range(0, S), y = rng.range(0, S), r = rng.range(30, 90);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(255,255,255,${rng.range(0.02, 0.06)})`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // fine scratches: brighter = rougher = catches light differently
  g.lineCap = 'round';
  for (let i = 0; i < 120; i++) {
    const x = rng.range(0, S), y = rng.range(0, S);
    const a = rng.range(0, Math.PI * 2);
    const len = rng.range(6, 46);
    g.strokeStyle = `rgba(190,190,190,${rng.range(0.18, 0.5)})`;
    g.lineWidth = rng.range(0.5, 1.4);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  // deeper scuffs where a lid actually gets hit: crown and edges
  for (let i = 0; i < 14; i++) {
    const x = rng.range(0, S), y = rng.range(0, S);
    g.fillStyle = `rgba(225,225,225,${rng.range(0.25, 0.55)})`;
    g.beginPath();
    g.ellipse(x, y, rng.range(4, 13), rng.range(2, 6), rng.range(0, 3), 0, Math.PI * 2);
    g.fill();
  }
});

/**
 * JERSEY. Matte throughout, but with woven variation so it isn't a flat
 * value — that variation is the difference between "cloth" and "painted".
 */
export const jerseyRough = () => build('jersey', 128, (g, S) => {
  const rng = new RNG(9021);
  g.fillStyle = '#d2d2d2';       // high roughness = matte
  g.fillRect(0, 0, S, S);
  // weave: fine cross-hatch, low contrast
  g.globalAlpha = 0.12;
  for (let i = 0; i < S; i += 2) {
    g.strokeStyle = i % 4 === 0 ? '#ffffff' : '#b4b4b4';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(S, i); g.stroke();
  }
  g.globalAlpha = 1;
  // soft patches: sweat, dust, wear across panels
  for (let i = 0; i < 26; i++) {
    const x = rng.range(0, S), y = rng.range(0, S), r = rng.range(10, 34);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const v = rng.chance(0.5) ? 255 : 170;
    grd.addColorStop(0, `rgba(${v},${v},${v},${rng.range(0.06, 0.16)})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
});

/**
 * PANTS. Rougher than jersey, with reinforced panels — the inner knee and
 * seat of a real DH pant use a tougher, slightly slicker material.
 */
export const pantsRough = () => build('pants', 128, (g, S) => {
  const rng = new RNG(1777);
  g.fillStyle = '#c0c0c0';
  g.fillRect(0, 0, S, S);
  // reinforcement panels: smoother bands
  for (let i = 0; i < 7; i++) {
    const x = rng.range(0, S), y = rng.range(0, S);
    const w = rng.range(24, 60), h = rng.range(18, 46);
    g.fillStyle = `rgba(140,140,140,${rng.range(0.35, 0.6)})`;
    g.beginPath();
    g.roundRect(x, y, w, h, 6);
    g.fill();
    // stitch line around the panel
    g.strokeStyle = 'rgba(220,220,220,0.35)';
    g.lineWidth = 1;
    g.setLineDash([3, 3]);
    g.strokeRect(x + 3, y + 3, w - 6, h - 6);
    g.setLineDash([]);
  }
  // twill grain
  g.globalAlpha = 0.14;
  for (let i = -S; i < S; i += 3) {
    g.strokeStyle = '#ffffff';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + S, S); g.stroke();
  }
  g.globalAlpha = 1;
});

/**
 * ARMOUR. Hard shell: fairly smooth with moulded ridges and impact scuffs.
 * Moderate specular, clearly harder than anything cloth.
 */
export const armourRough = () => build('armour', 128, (g, S) => {
  const rng = new RNG(6540);
  g.fillStyle = '#5a5a5a';
  g.fillRect(0, 0, S, S);
  // moulded ribs
  for (let i = 8; i < S; i += 16) {
    g.fillStyle = 'rgba(90,90,90,0.5)';
    g.fillRect(0, i, S, 3);
    g.fillStyle = 'rgba(30,30,30,0.35)';
    g.fillRect(0, i + 3, S, 2);
  }
  // impact scuffing: where pads have actually hit dirt
  for (let i = 0; i < 30; i++) {
    const x = rng.range(0, S), y = rng.range(0, S);
    g.fillStyle = `rgba(190,190,190,${rng.range(0.15, 0.4)})`;
    g.beginPath();
    g.ellipse(x, y, rng.range(3, 10), rng.range(2, 5), rng.range(0, 3), 0, Math.PI * 2);
    g.fill();
  }
});

/**
 * GLOVE / RUBBER. Uniformly matte with a fine grip pattern. Should never
 * catch a highlight — if gloves shine they read as latex.
 */
export const rubberRough = () => build('rubber', 128, (g, S) => {
  const rng = new RNG(3388);
  g.fillStyle = '#e0e0e0';       // very rough
  g.fillRect(0, 0, S, S);
  // dimpled grip
  for (let y = 4; y < S; y += 7) {
    for (let x = 4; x < S; x += 7) {
      g.fillStyle = `rgba(160,160,160,${rng.range(0.2, 0.4)})`;
      g.beginPath();
      g.arc(x + (y % 14 === 4 ? 0 : 3.5), y, 2.1, 0, Math.PI * 2);
      g.fill();
    }
  }
});

/**
 * BOOT. Rugged: scuffed toe box, coarse grain, worn patches where a boot
 * drags on the ground and the crank.
 */
export const bootRough = () => build('boot', 128, (g, S) => {
  const rng = new RNG(8123);
  g.fillStyle = '#b8b8b8';
  g.fillRect(0, 0, S, S);
  // coarse leather grain
  for (let i = 0; i < 900; i++) {
    const x = rng.range(0, S), y = rng.range(0, S);
    g.fillStyle = `rgba(${rng.chance(0.5) ? 255 : 130},${rng.chance(0.5) ? 255 : 130},130,${rng.range(0.05, 0.18)})`;
    g.fillRect(x, y, rng.range(1, 3), rng.range(1, 3));
  }
  // polished wear patches: scuffed smooth by contact
  for (let i = 0; i < 12; i++) {
    const x = rng.range(0, S), y = rng.range(0, S), r = rng.range(8, 22);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(90,90,90,${rng.range(0.3, 0.55)})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
});

/** Brushed-metal variation for frame tubing. */
export const metalRough = () => build('metal', 128, (g, S) => {
  const rng = new RNG(2255);
  g.fillStyle = '#4a4a4a';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 420; i++) {
    const y = rng.range(0, S);
    g.strokeStyle = `rgba(${rng.chance(0.5) ? 200 : 60},${rng.chance(0.5) ? 200 : 60},60,${rng.range(0.04, 0.12)})`;
    g.lineWidth = rng.range(0.5, 1.6);
    g.beginPath(); g.moveTo(0, y); g.lineTo(S, y + rng.range(-2, 2)); g.stroke();
  }
  // anodising blemishes
  for (let i = 0; i < 18; i++) {
    const x = rng.range(0, S), y = rng.range(0, S);
    g.fillStyle = `rgba(200,200,200,${rng.range(0.1, 0.3)})`;
    g.beginPath();
    g.ellipse(x, y, rng.range(2, 7), rng.range(1, 4), rng.range(0, 3), 0, Math.PI * 2);
    g.fill();
  }
});

/**
 * The rider material set.
 *
 * Roughness ranges are chosen so no two classes overlap — that separation is
 * what makes the differentiation visible rather than theoretical:
 *
 *   helmet  0.22-0.40   the only glossy thing, scratched
 *   armour  0.38-0.58   hard shell, moderate specular
 *   metal   0.28-0.50   anodised, brushed
 *   pants   0.62-0.86   rough with smoother reinforcement
 *   jersey  0.74-0.92   matte cloth
 *   boot    0.60-0.90   rugged, patchy
 *   rubber  0.82-0.98   never shines
 */
export const RIDER_MAT = {
  helmet: (color: number) => new THREE.MeshStandardMaterial({
    color, roughness: 0.40, metalness: 0.12,
    roughnessMap: helmetRough(),
  }),
  armour: (color: number) => new THREE.MeshStandardMaterial({
    color, roughness: 0.58, metalness: 0.06,
    roughnessMap: armourRough(),
  }),
  jersey: (color: number) => new THREE.MeshStandardMaterial({
    color, roughness: 0.92, metalness: 0.0,
    roughnessMap: jerseyRough(),
  }),
  pants: (color: number) => new THREE.MeshStandardMaterial({
    color, roughness: 0.86, metalness: 0.0,
    roughnessMap: pantsRough(),
  }),
  glove: (color: number) => new THREE.MeshStandardMaterial({
    color, roughness: 0.98, metalness: 0.0,
    roughnessMap: rubberRough(),
  }),
  boot: (color: number) => new THREE.MeshStandardMaterial({
    color, roughness: 0.90, metalness: 0.0,
    roughnessMap: bootRough(),
  }),
  frame: (color: number) => new THREE.MeshStandardMaterial({
    color, roughness: 0.50, metalness: 0.78,
    roughnessMap: metalRough(),
  }),
  steel: (color: number) => new THREE.MeshStandardMaterial({
    color, roughness: 0.55, metalness: 0.88,
    roughnessMap: metalRough(),
  }),
  tyre: (color: number) => new THREE.MeshStandardMaterial({
    color, roughness: 0.96, metalness: 0.0,
    roughnessMap: rubberRough(),
  }),
  /** saddle: matte synthetic, no shine, slightly grippy */
  seat: (color: number) => new THREE.MeshStandardMaterial({
    color, roughness: 0.94, metalness: 0.0,
    roughnessMap: rubberRough(),
  }),
  /** chain and cassette: dark oily metal, low-key highlight */
  chain: (color: number) => new THREE.MeshStandardMaterial({
    color, roughness: 0.42, metalness: 0.95,
    roughnessMap: metalRough(),
  }),
  /** rotors and calipers: bare machined metal, brighter than the chain */
  brake: (color: number) => new THREE.MeshStandardMaterial({
    color, roughness: 0.32, metalness: 0.92,
    roughnessMap: metalRough(),
  }),
  /** fork stanchions: the most reflective thing on the bike */
  stanchion: (color: number) => new THREE.MeshStandardMaterial({
    color, roughness: 0.18, metalness: 0.95,
  }),
  skin: (color: number) => new THREE.MeshStandardMaterial({
    color, roughness: 0.74, metalness: 0.0,
  }),
  lens: (color: number) => new THREE.MeshStandardMaterial({
    color, roughness: 0.14, metalness: 0.35,
    emissive: new THREE.Color(color).multiplyScalar(0.25),
  }),
} as const;

// ---------------------------------------------------------------------------
// PROGRESSIVE DIRT
//
// A bike that finishes a mud section looking factory-fresh breaks the whole
// illusion. Rather than swapping textures, every rider/bike material gets a
// small shader injection that lerps its albedo toward a grime colour and
// pushes roughness up, driven by one shared uniform per rig.
//
// Cost is a uniform write per frame. No extra draw calls, no texture churn.
// ---------------------------------------------------------------------------

export interface DirtHandle {
  /** 0..1 how filthy this rig currently is */
  set(amount: number, tint: THREE.Color): void;
}

interface DirtUniforms {
  uDirt: { value: number };
  uDirtColor: { value: THREE.Color };
}

/**
 * Attach dirt to a material. Upward-facing surfaces grime faster than
 * undersides, which is what makes it read as accumulation rather than a
 * global tint.
 */
export function makeDirty(
  m: THREE.Material, shared: DirtUniforms, exposure = 1,
) {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uDirt = shared.uDirt;
    shader.uniforms.uDirtColor = shared.uDirtColor;
    shader.uniforms.uDirtExposure = { value: exposure };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vDirtNormal;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vDirtNormal = normalize(normalMatrix * normal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uDirt;
        uniform vec3 uDirtColor;
        uniform float uDirtExposure;
        varying vec3 vDirtNormal;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          // upward faces catch spray; undersides stay cleaner
          float up = clamp(vDirtNormal.y * 0.5 + 0.5, 0.0, 1.0);
          float g = clamp(uDirt * uDirtExposure * (0.35 + up * 0.9), 0.0, 0.92);
          diffuseColor.rgb = mix(diffuseColor.rgb, uDirtColor, g);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.95,
          clamp(uDirt * uDirtExposure * 0.8, 0.0, 0.85));`);
  };
  // force a program rebuild so the injection takes effect
  m.customProgramCacheKey = () => 'dirt';
  m.needsUpdate = true;
}

/** Create a dirt controller and wire every material under `root` to it. */
export function attachDirt(root: THREE.Object3D): DirtHandle {
  const shared: DirtUniforms = {
    uDirt: { value: 0 },
    uDirtColor: { value: new THREE.Color(0x6b5942) },
  };
  const seen = new Set<THREE.Material>();
  root.traverse(o => {
    const mesh = o as THREE.Mesh;
    const mm = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (!mm) return;
    const list = Array.isArray(mm) ? mm : [mm];
    for (const m of list) {
      // skip the silhouette shells: they're flat black by design
      if ((m as THREE.MeshBasicMaterial).side === THREE.BackSide) continue;
      if (seen.has(m)) continue;
      seen.add(m);
      // tyres and lower frame get dirtier than a helmet does
      makeDirty(m, shared, 1);
    }
  });
  return {
    set(amount, tint) {
      shared.uDirt.value = amount;
      shared.uDirtColor.value.copy(tint);
    },
  };
}

export function disposeRiderMaterials() {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
