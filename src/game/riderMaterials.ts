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
  if ((m as any).userData?.dirtAttached) return;
  (m as any).userData = { ...(m as any).userData, dirtAttached: true };

  // Chain so wind (or any prior injection) is not clobbered if both attach.
  const prevCompile = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey.bind(m);

  m.onBeforeCompile = (shader, renderer) => {
    prevCompile.call(m, shader, renderer);
    shader.uniforms.uDirt = shared.uDirt;
    shader.uniforms.uDirtColor = shared.uDirtColor;
    shader.uniforms.uDirtExposure = { value: exposure };
    // Guard against double-injection if three recompiles the same material.
    if (shader.vertexShader.includes('vDirtNormal')) return;
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
  // Same GLSL injection for every dirty material → shared program key.
  // Per-material uniforms (exposure) live on materialProperties.uniforms, not
  // the program cache. Three already keys on maps/defines separately.
  m.customProgramCacheKey = () => `${prevKey()}|dirt`;
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
      // only Standard materials carry the chunks this injection patches;
      // anything else would silently no-op or break its shader
      if (!(m as THREE.MeshStandardMaterial).isMeshStandardMaterial) continue;
      if (seen.has(m)) continue;
      seen.add(m);
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

// ---------------------------------------------------------------------------
// FOLIAGE WIND
//
// Cheap vertex sway for instanced canopies / grass. Shared uTime + uWind are
// written once per frame from Track.animateWind — no per-instance matrix
// updates. Displacement is stronger at the top of the mesh (local Y) so
// trunks and roots stay planted.
// ---------------------------------------------------------------------------

export interface WindUniforms {
  uTime: { value: number };
  uWind: { value: number };
}

/** Inject procedural wind into a material. Idempotent for the same mat. */
export function attachWind(m: THREE.Material, shared: WindUniforms) {
  if ((m as any).userData?.windAttached) return;
  (m as any).userData = { ...(m as any).userData, windAttached: true };

  // Chain so dirt (or any prior injection) is not clobbered if both attach.
  const prevCompile = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey.bind(m);

  m.onBeforeCompile = (shader, renderer) => {
    prevCompile.call(m, shader, renderer);
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uWind = shared.uWind;
    if (shader.vertexShader.includes('uniform float uWind')) return;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uWind;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          // world-ish position for phase variety across the forest
          #ifdef USE_INSTANCING
            vec3 wPos = (instanceMatrix * vec4(transformed, 1.0)).xyz;
          #else
            vec3 wPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
          #endif
          // height falloff: base stays put, crown / tips lean
          float h = max(transformed.y, 0.0);
          float amp = uWind * h * 0.055;
          float ph = uTime * 1.35 + wPos.x * 0.18 + wPos.z * 0.14;
          transformed.x += sin(ph) * amp;
          transformed.z += cos(ph * 0.81 + 1.7) * amp * 0.65;
        }`,
      );
  };
  // same injection → same program key; three still keys on maps/defines
  m.customProgramCacheKey = () => `${prevKey()}|wind`;
  m.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// WORLD MATERIALS
//
// ART CONSISTENCY: the rider and bike use MeshStandardMaterial, which has a
// specular term. Lambert does not — it is purely diffuse. Mixing the two
// means the character is lit by a different model than the world around it,
// and no amount of colour matching fixes that: the rider will always look
// pasted on because light behaves differently on them.
//
// These are the world's counterparts, sharing the same roughness vocabulary
// as RIDER_MAT so everything belongs to one lighting model. Roughness values
// are deliberately HIGH — the world should be matte so the rider and bike
// remain the most visually active things on screen.
//
// rock / wood / ground carry procedural roughness maps (same approach as
// RIDER_MAT) so they aren't flat plastic-adjacent slabs. Variation stays
// subtle and overall roughness stays high.
// ---------------------------------------------------------------------------

/**
 * WOOD. Long grain with slightly smoother sap lines and a few knots —
 * enough to read as timber without competing with the rider's specular.
 */
export const woodRough = () => build('wood', 128, (g, S) => {
  const rng = new RNG(5510);
  g.fillStyle = '#c6c6c6';
  g.fillRect(0, 0, S, S);
  // vertical grain streaks
  for (let i = 0; i < 52; i++) {
    const x = rng.range(0, S);
    const light = rng.chance(0.55);
    g.strokeStyle = light
      ? `rgba(230,230,230,${rng.range(0.10, 0.28)})`
      : `rgba(80,80,80,${rng.range(0.12, 0.32)})`;
    g.lineWidth = rng.range(0.7, 2.8);
    g.beginPath();
    g.moveTo(x, 0);
    for (let y = 0; y <= S; y += 6) {
      g.lineTo(x + Math.sin(y * 0.08 + i * 1.3) * rng.range(1.2, 3.2), y);
    }
    g.stroke();
  }
  // knots: smoother dark cores with a rough halo
  for (let i = 0; i < 7; i++) {
    const x = rng.range(8, S - 8), y = rng.range(8, S - 8);
    const r = rng.range(5, 14);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(70,70,70,0.55)');
    grd.addColorStop(0.55, 'rgba(150,150,150,0.25)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // fine pore noise
  for (let i = 0; i < 280; i++) {
    g.fillStyle = `rgba(255,255,255,${rng.range(0.04, 0.12)})`;
    g.fillRect(rng.range(0, S), rng.range(0, S), 1, 1);
  }
});

/**
 * ROCK. Craggy mottling, fracture lines, and pitting — matte stone with
 * just enough micro-variation that boulders don't read as painted foam.
 */
export const rockRough = () => build('rock', 128, (g, S) => {
  const rng = new RNG(7744);
  g.fillStyle = '#b8b8b8';
  g.fillRect(0, 0, S, S);
  // broad mineral patches
  for (let i = 0; i < 36; i++) {
    const x = rng.range(0, S), y = rng.range(0, S), r = rng.range(10, 38);
    const v = rng.chance(0.5) ? 210 : 95;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(${v},${v},${v},${rng.range(0.12, 0.30)})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // fracture lines (slightly smoother seams)
  g.lineCap = 'round';
  for (let i = 0; i < 22; i++) {
    const x = rng.range(0, S), y = rng.range(0, S);
    const a = rng.range(0, Math.PI * 2);
    const len = rng.range(12, 48);
    g.strokeStyle = `rgba(70,70,70,${rng.range(0.18, 0.40)})`;
    g.lineWidth = rng.range(0.8, 2.2);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  // pitting
  for (let i = 0; i < 90; i++) {
    const x = rng.range(0, S), y = rng.range(0, S);
    g.fillStyle = `rgba(50,50,50,${rng.range(0.15, 0.4)})`;
    g.beginPath();
    g.ellipse(x, y, rng.range(1, 3.5), rng.range(1, 2.5), rng.range(0, 3), 0, Math.PI * 2);
    g.fill();
  }
});

/**
 * GROUND. Dirt grit and soft mud patches — high-roughness trail surface
 * with granular flecks so mud and gravel don't look like rubber.
 */
export const groundRough = () => build('ground', 128, (g, S) => {
  const rng = new RNG(3399);
  g.fillStyle = '#d4d4d4';
  g.fillRect(0, 0, S, S);
  // soft mud / packed-dirt patches (a touch smoother)
  for (let i = 0; i < 18; i++) {
    const x = rng.range(0, S), y = rng.range(0, S), r = rng.range(12, 40);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(100,100,100,${rng.range(0.10, 0.22)})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // gravel flecks
  for (let i = 0; i < 700; i++) {
    const v = rng.chance(0.55) ? 245 : 90;
    g.fillStyle = `rgba(${v},${v},${v},${rng.range(0.06, 0.18)})`;
    g.fillRect(rng.range(0, S), rng.range(0, S), rng.range(1, 2.5), rng.range(1, 2.5));
  }
  // coarser clumps
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(200,200,200,${rng.range(0.08, 0.2)})`;
    g.beginPath();
    g.ellipse(
      rng.range(0, S), rng.range(0, S),
      rng.range(2, 6), rng.range(1.5, 4),
      rng.range(0, 3), 0, Math.PI * 2,
    );
    g.fill();
  }
});

export const WORLD_MAT = {
  /** bark, planks, bridge timber */
  wood: (color: number) => new THREE.MeshStandardMaterial({
    color, roughness: 0.92, metalness: 0.0,
    roughnessMap: woodRough(),
  }),
  /** stone, cliffs, boulders */
  rock: (color: number) => new THREE.MeshStandardMaterial({
    color, roughness: 0.88, metalness: 0.02,
    roughnessMap: rockRough(),
  }),
  /** foliage: fully matte so canopies read as mass, not surface */
  leaf: (color: number) => new THREE.MeshStandardMaterial({
    color, roughness: 0.97, metalness: 0.0,
  }),
  /** painted course furniture — barriers, signs, bales */
  paint: (color: number) => new THREE.MeshStandardMaterial({
    color, roughness: 0.72, metalness: 0.03,
  }),
  /** scaffold, gantries, posts: the world's only semi-reflective class */
  metal: (color: number) => new THREE.MeshStandardMaterial({
    color, roughness: 0.55, metalness: 0.7,
  }),
  /** dirt, mud, gravel — the trail surface itself */
  ground: (color: number) => new THREE.MeshStandardMaterial({
    color, roughness: 0.95, metalness: 0.0,
    roughnessMap: groundRough(),
  }),
  /** cloth: spectator clothing, banners */
  fabric: (color: number) => new THREE.MeshStandardMaterial({
    color, roughness: 0.9, metalness: 0.0,
  }),
} as const;

export function disposeRiderMaterials() {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
