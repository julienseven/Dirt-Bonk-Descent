// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: geometry builders (rider rig, scenery, props)
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { RNG } from './core';

export interface RiderColors {
  jersey: number; pants: number; helmet: number; frame: number; accent: number; skin: number;
}

export const RIDER_PALETTES: RiderColors[] = [
  { jersey: 0xff3b30, pants: 0x18181b, helmet: 0xfff0d0, frame: 0x2fe6c8, accent: 0xffd400, skin: 0xd8a172 },
  { jersey: 0x2f7bff, pants: 0x101820, helmet: 0xff7a00, frame: 0xf2f2f2, accent: 0x00ff9d, skin: 0x8a5a34 },
  { jersey: 0x9b30ff, pants: 0x1a1a22, helmet: 0x00e5ff, frame: 0xffd400, accent: 0xff2e88, skin: 0xf0c39a },
  { jersey: 0x00c853, pants: 0x14140f, helmet: 0xff2e2e, frame: 0x1b1b1b, accent: 0xffffff, skin: 0x6b4226 },
  { jersey: 0xff9500, pants: 0x232323, helmet: 0x1b1b1b, frame: 0xff2e88, accent: 0x00e5ff, skin: 0xe8b98d },
  { jersey: 0xffffff, pants: 0x2b2b35, helmet: 0x111111, frame: 0xff3b30, accent: 0xffd400, skin: 0xc98b5e },
];

const mat = (color: number, opts: Partial<THREE.MeshLambertMaterialParameters> = {}) =>
  new THREE.MeshLambertMaterial({ color, ...opts });

/** Cylinder tube between two local points. */
function tube(a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material, seg = 7): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1);
  const mesh = new THREE.Mesh(g, m);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export interface RiderRig {
  root: THREE.Group;        // world transform target
  lean: THREE.Group;        // roll about forward axis
  body: THREE.Group;        // pitch / squash
  spin: THREE.Group;        // yaw (whips), pivoted at hip height
  flip: THREE.Group;        // pitch rotations (flips)
  bike: THREE.Group;
  fork: THREE.Group;        // steering
  frontWheel: THREE.Mesh;
  rearWheel: THREE.Mesh;
  cranks: THREE.Group;
  rider: THREE.Group;
  torso: THREE.Group;
  head: THREE.Mesh;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  shadow: THREE.Mesh;
}

const PIVOT_Y = 0.72;

/** Wheel with its axle along local X so it spins on rotation.x. */
function makeWheel(tyre: THREE.Material, rim: THREE.Material, hub: THREE.Material): THREE.Mesh {
  const R = 0.36;
  const g = new THREE.TorusGeometry(R, 0.085, 6, 18).rotateY(Math.PI / 2);
  const wheel = new THREE.Mesh(g, tyre);
  const rimM = new THREE.Mesh(new THREE.TorusGeometry(R - 0.075, 0.035, 4, 18).rotateY(Math.PI / 2), rim);
  wheel.add(rimM);
  const h = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.17, 8), hub);
  h.rotation.z = Math.PI / 2;
  wheel.add(h);
  for (let i = 0; i < 4; i++) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.02, R * 1.86, 0.022), rim);
    sp.rotation.x = (i / 4) * Math.PI;
    wheel.add(sp);
  }
  return wheel;
}

export function createRider(c: RiderColors): RiderRig {
  const root = new THREE.Group();
  const lean = new THREE.Group(); root.add(lean);
  const body = new THREE.Group(); lean.add(body);
  const spin = new THREE.Group(); spin.position.y = PIVOT_Y; body.add(spin);
  const flip = new THREE.Group(); spin.add(flip);
  const offset = new THREE.Group(); offset.position.y = -PIVOT_Y; flip.add(offset);

  const mFrame = mat(c.frame);
  const mTyre = mat(0x16161a);
  const mRim = mat(0xd8d8dd);
  const mHub = mat(c.accent);
  const mJersey = mat(c.jersey);
  const mPants = mat(c.pants);
  const mHelmet = mat(c.helmet);
  const mSkin = mat(c.skin);
  const mDark = mat(0x232329);

  // ---- bike -----------------------------------------------------------
  const bike = new THREE.Group();
  offset.add(bike);

  const BB = V(0, 0.30, -0.06);       // bottom bracket
  const HEAD_T = V(0, 0.86, 0.44);    // head tube top
  const HEAD_B = V(0, 0.62, 0.50);    // head tube bottom
  const SEAT_T = V(0, 0.98, -0.40);
  const REAR_AX = V(0, 0.36, -0.62);

  bike.add(tube(BB, HEAD_B, 0.045, mFrame));            // down tube
  bike.add(tube(SEAT_T, HEAD_T, 0.040, mFrame));        // top tube
  bike.add(tube(BB, SEAT_T, 0.042, mFrame));            // seat tube
  bike.add(tube(BB, REAR_AX, 0.032, mFrame));           // chainstay
  bike.add(tube(SEAT_T, REAR_AX, 0.028, mFrame));       // seatstay
  bike.add(tube(HEAD_B, HEAD_T, 0.05, mDark));          // head tube
  // saddle
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.06, 0.32), mDark);
  saddle.position.set(0, 1.02, -0.42); saddle.rotation.x = -0.12;
  bike.add(saddle);
  // chainring
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 12), mHub);
  ring.rotation.z = Math.PI / 2; ring.position.copy(BB);
  bike.add(ring);

  // ---- fork / steering ------------------------------------------------
  const fork = new THREE.Group();
  fork.position.copy(HEAD_B);
  bike.add(fork);
  const AX = V(0, -0.26, 0.10);
  fork.add(tube(V(0, 0.02, 0), V(-0.11, AX.y, AX.z), 0.034, mDark));
  fork.add(tube(V(0, 0.02, 0), V(0.11, AX.y, AX.z), 0.034, mDark));
  // handlebar
  const stem = tube(V(0, 0.24, 0), V(0, 0.30, 0.06), 0.03, mDark); fork.add(stem);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.68, 6), mFrame);
  bar.rotation.z = Math.PI / 2; bar.position.set(0, 0.31, 0.07);
  fork.add(bar);
  [-1, 1].forEach(s => {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.13, 6), mHub);
    grip.rotation.z = Math.PI / 2; grip.position.set(s * 0.28, 0.31, 0.07);
    fork.add(grip);
  });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.22, 0.02), mJersey);
  plate.position.set(0, 0.40, 0.05); plate.rotation.x = 0.25;
  fork.add(plate);

  const frontWheel = makeWheel(mTyre, mRim, mHub);
  frontWheel.position.copy(AX);
  fork.add(frontWheel);

  const rearWheel = makeWheel(mTyre, mRim, mHub);
  rearWheel.position.copy(REAR_AX);
  bike.add(rearWheel);

  const cranks = new THREE.Group();
  cranks.position.copy(BB);
  bike.add(cranks);
  [-1, 1].forEach(s => {
    const holder = new THREE.Group();
    holder.rotation.x = s > 0 ? 0 : Math.PI;   // opposing crank arms
    holder.position.set(s * 0.10, 0, 0);
    const a2 = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.30, 0.035), mDark);
    a2.position.set(0, 0.14, 0);
    const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.028, 0.15), mHub);
    p2.position.set(0, 0.29, 0);
    holder.add(a2); holder.add(p2);
    cranks.add(holder);
  });

  // ---- rider ----------------------------------------------------------
  const rider = new THREE.Group();
  offset.add(rider);

  const torso = new THREE.Group();
  torso.position.set(0, 0.92, -0.26);
  rider.add(torso);
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.56, 0.30), mJersey);
  chest.position.set(0, 0.26, 0.16);
  chest.rotation.x = -0.62;
  torso.add(chest);
  const numPlate = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.20, 0.02), mat(0xf5f5f5));
  numPlate.position.set(0, 0.30, 0.33); numPlate.rotation.x = -0.62;
  torso.add(numPlate);
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.24, 0.28), mPants);
  hips.position.set(0, 0.02, -0.04);
  torso.add(hips);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.30, 0.14), mat(c.accent));
  pack.position.set(0, 0.34, -0.02); pack.rotation.x = -0.62;
  torso.add(pack);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.10, 6), mSkin);
  neck.position.set(0, 0.53, 0.34);
  torso.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.165, 12, 10), mHelmet);
  head.position.set(0, 0.63, 0.42);
  head.scale.set(1, 0.98, 1.12);
  torso.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.045, 0.20), mat(c.accent));
  visor.position.set(0, 0.10, 0.13); visor.rotation.x = 0.28;
  head.add(visor);
  const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.10, 0.06), mat(0x101018));
  goggles.position.set(0, 0.0, 0.16);
  head.add(goggles);
  const lens = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.02), mat(0x66e0ff, { emissive: 0x113344 }));
  lens.position.set(0, 0.0, 0.19);
  head.add(lens);
  const chin = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.16), mHelmet);
  chin.position.set(0, -0.13, 0.10);
  head.add(chin);

  const mkArm = (s: number) => {
    const g = new THREE.Group();
    g.position.set(s * 0.21, 0.46, 0.20);
    const upper = tube(V(0, 0, 0), V(s * 0.07, -0.20, 0.22), 0.062, mJersey);
    g.add(upper);
    const fore = new THREE.Group();
    fore.position.set(s * 0.07, -0.20, 0.22);
    fore.add(tube(V(0, 0, 0), V(s * 0.05, -0.16, 0.26), 0.052, mSkin));
    const glove = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, 0.12), mat(c.pants));
    glove.position.set(s * 0.05, -0.17, 0.28);
    fore.add(glove);
    g.add(fore);
    rider.add(g);
    return g;
  };
  const armL = mkArm(-1), armR = mkArm(1);

  const mkLeg = (s: number) => {
    const g = new THREE.Group();
    g.position.set(s * 0.13, 0.92, -0.26);
    g.add(tube(V(0, 0, 0), V(s * 0.02, -0.34, 0.10), 0.085, mPants));
    const shin = new THREE.Group();
    shin.position.set(s * 0.02, -0.34, 0.10);
    shin.add(tube(V(0, 0, 0), V(0, -0.30, -0.06), 0.062, mPants));
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.24), mat(0x1b1b20));
    shoe.position.set(0, -0.32, -0.02);
    shin.add(shoe);
    g.add(shin);
    rider.add(g);
    return g;
  };
  const legL = mkLeg(-1), legR = mkLeg(1);

  // contact shadow
  const shadowTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g2 = cv.getContext('2d')!;
    const grd = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(0,0,0,0.62)');
    grd.addColorStop(0.55, 'rgba(0,0,0,0.32)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g2.fillStyle = grd; g2.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 3.0),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.9 })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = 2;

  root.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = false; o.receiveShadow = false; } });

  return { root, lean, body, spin, flip, bike, fork, frontWheel, rearWheel, cranks, rider, torso, head, armL, armR, legL, legR, shadow };
}

// ---------------------------------------------------------------------------
// Scenery geometry
// ---------------------------------------------------------------------------

export function pineFoliageGeo(): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(1, 2.4, 7, 1);
  g.translate(0, 1.2, 0);
  return g;
}
export function pineTrunkGeo(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.16, 0.24, 1.6, 5);
  g.translate(0, 0.8, 0);
  return g;
}
export function broadleafGeo(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1.15, 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  const rng = new RNG(77);
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i,
      p.getX(i) * (0.82 + rng.next() * 0.4),
      p.getY(i) * (0.7 + rng.next() * 0.35),
      p.getZ(i) * (0.82 + rng.next() * 0.4));
  }
  g.computeVertexNormals();
  g.translate(0, 1.6, 0);
  return g;
}

export function rockGeo(seed = 5): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  const rng = new RNG(seed);
  for (let i = 0; i < p.count; i++) {
    const f = 0.62 + rng.next() * 0.7;
    p.setXYZ(i, p.getX(i) * f * 1.15, Math.max(0, p.getY(i)) * f * 0.86, p.getZ(i) * f * 1.1);
  }
  g.computeVertexNormals();
  return g;
}

export function bushGeo(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.8, 0);
  const p = g.attributes.position as THREE.BufferAttribute;
  const rng = new RNG(21);
  for (let i = 0; i < p.count; i++) {
    const f = 0.6 + rng.next() * 0.8;
    p.setXYZ(i, p.getX(i) * f, Math.max(-0.1, p.getY(i)) * f, p.getZ(i) * f);
  }
  g.computeVertexNormals();
  g.translate(0, 0.35, 0);
  return g;
}

/** Grass tuft billboard cross. */
export function tuftGeo(): THREE.BufferGeometry {
  const a = new THREE.PlaneGeometry(1, 1); a.translate(0, 0.5, 0);
  const b = a.clone(); b.rotateY(Math.PI / 2);
  const merged = new THREE.BufferGeometry();
  const pa = a.attributes.position.array as Float32Array;
  const pb = b.attributes.position.array as Float32Array;
  const pos = new Float32Array(pa.length + pb.length);
  pos.set(pa, 0); pos.set(pb, pa.length);
  const na = a.attributes.normal.array as Float32Array;
  const nb = b.attributes.normal.array as Float32Array;
  const nor = new Float32Array(na.length + nb.length); nor.set(na, 0); nor.set(nb, na.length);
  const ua = a.attributes.uv.array as Float32Array;
  const ub = b.attributes.uv.array as Float32Array;
  const uv = new Float32Array(ua.length + ub.length); uv.set(ua, 0); uv.set(ub, ua.length);
  const ia = Array.from(a.index!.array as ArrayLike<number>);
  const ib = Array.from(b.index!.array as ArrayLike<number>).map(i => i + a.attributes.position.count);
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  merged.setIndex([...ia, ...ib]);
  return merged;
}

// --- spectators ------------------------------------------------------------
export function spectatorParts() {
  const bodyG = new THREE.CylinderGeometry(0.20, 0.26, 0.78, 6);
  bodyG.translate(0, 0.62, 0);
  const headG = new THREE.SphereGeometry(0.16, 8, 6);
  headG.translate(0, 1.20, 0);
  const legG = new THREE.BoxGeometry(0.30, 0.46, 0.20);
  legG.translate(0, 0.23, 0);
  const armG = new THREE.BoxGeometry(0.62, 0.11, 0.11);
  armG.translate(0, 1.28, 0);
  return { bodyG, headG, legG, armG };
}

export const SPECTATOR_COLORS = [
  0xff4d4d, 0x4d9bff, 0xffd400, 0x2fe6a0, 0xff8ad0, 0xffffff, 0xffa33c, 0x9b6bff,
  0x18c9c9, 0xf25c05, 0xc0f000, 0xe8e8ee,
];

// --- props -----------------------------------------------------------------
export function baleGeo(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.72, 0.72, 1.5, 12);
  g.rotateZ(Math.PI / 2);
  g.translate(0, 0.72, 0);
  return g;
}
export function coneGeo(): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(0.30, 0.72, 8);
  g.translate(0, 0.36, 0);
  return g;
}
export function logGeo(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.42, 0.46, 4.4, 8);
  g.rotateZ(Math.PI / 2);
  g.translate(0, 0.42, 0);
  return g;
}
export function barrelGeo(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.42, 0.42, 1.05, 10);
  g.translate(0, 0.52, 0);
  return g;
}
export function postGeo(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.055, 0.07, 1.35, 5);
  g.translate(0, 0.67, 0);
  return g;
}
export function flagGeo(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(0.9, 0.6, 4, 1);
  g.translate(0.45, 0, 0);
  return g;
}
