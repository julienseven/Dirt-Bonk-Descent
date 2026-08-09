// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: geometry builders (rider rig, scenery, props)
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { RNG, TAU } from './core';
import { RIDER_MAT, attachDirt, type DirtHandle } from './riderMaterials';

export interface RiderColors {
  jersey: number; pants: number; helmet: number; frame: number; accent: number; skin: number;
}

/**
 * SILHOUETTE ARCHETYPES
 *
 * The chase camera means the player almost always sees riders from BEHIND,
 * so the readable silhouette is: helmet outline -> shoulder line -> back
 * profile. Those three get the strongest per-rider variation; limbs and
 * details vary less because they're rarely the deciding shape.
 *
 * Proportions are deliberately exaggerated ~15-25% beyond human: oversized
 * helmets, wide shoulders, chunky boots. At speed a realistic head is a
 * grey dot, and realistic gloves vanish entirely.
 */
export interface RiderBuild {
  /** overall scale */
  scale: number;
  /** shoulder width multiplier — the primary rear-view read */
  shoulders: number;
  /** torso depth / bulk */
  bulk: number;
  /** helmet size multiplier */
  helmet: number;
  /** helmet silhouette family */
  lid: 'round' | 'aero' | 'boxy' | 'domed' | 'crest';
  /** limb thickness */
  limbs: number;
  /** leg length */
  legs: number;
  /** 0..1 how much armour they wear (pads, protector, brace) */
  armour: number;
  /** back protector / pack size */
  pack: number;
  /** knee and elbow pads */
  pads: boolean;
  /** neck brace: reads as a strong collar shape from behind */
  brace: boolean;
  /** deliberately mismatched gear */
  asymmetric: boolean;
}

export const BUILD_DEFAULT: RiderBuild = {
  scale: 1, shoulders: 1, bulk: 1, helmet: 1, lid: 'round',
  limbs: 1, legs: 1, armour: 0.5, pack: 1, pads: true,
  brace: false, asymmetric: false,
};

/** One per personality, so the grid reads as six different people. */
export const RIDER_BUILDS: Record<string, RiderBuild> = {
  // low, narrow, aero — everything tucked in
  speedfreak: {
    scale: 0.97, shoulders: 0.86, bulk: 0.88, helmet: 1.02, lid: 'aero',
    limbs: 0.9, legs: 1.08, armour: 0.2, pack: 0.5, pads: false,
    brace: false, asymmetric: false,
  },
  // enormous: wide shoulders, heavy armour, blunt helmet
  bonker: {
    scale: 1.1, shoulders: 1.42, bulk: 1.35, helmet: 1.12, lid: 'boxy',
    limbs: 1.3, legs: 0.94, armour: 1.0, pack: 1.5, pads: true,
    brace: true, asymmetric: false,
  },
  // lean and loose, big crested lid
  showoff: {
    scale: 1.0, shoulders: 0.94, bulk: 0.9, helmet: 1.18, lid: 'crest',
    limbs: 0.92, legs: 1.12, armour: 0.15, pack: 0.7, pads: false,
    brace: false, asymmetric: false,
  },
  // wrapped in every pad available — a walking crash mat
  coward: {
    scale: 0.94, shoulders: 1.2, bulk: 1.2, helmet: 1.22, lid: 'domed',
    limbs: 1.15, legs: 0.92, armour: 1.0, pack: 1.35, pads: true,
    brace: true, asymmetric: false,
  },
  // mismatched, lopsided, wrong
  chaos: {
    scale: 1.03, shoulders: 1.12, bulk: 1.0, helmet: 1.08, lid: 'crest',
    limbs: 1.05, legs: 1.0, armour: 0.55, pack: 1.1, pads: true,
    brace: false, asymmetric: true,
  },
  // textbook proportions, clean lines
  allround: {
    scale: 1.0, shoulders: 1.05, bulk: 1.0, helmet: 1.05, lid: 'round',
    limbs: 1.0, legs: 1.0, armour: 0.6, pack: 1.0, pads: true,
    brace: false, asymmetric: false,
  },
};

export const getBuild = (id: string): RiderBuild =>
  RIDER_BUILDS[id] ?? BUILD_DEFAULT;

export const RIDER_PALETTES: RiderColors[] = [
  { jersey: 0xff3b30, pants: 0x18181b, helmet: 0xfff0d0, frame: 0x2fe6c8, accent: 0xffd400, skin: 0xd8a172 },
  { jersey: 0x2f7bff, pants: 0x101820, helmet: 0xff7a00, frame: 0xf2f2f2, accent: 0x00ff9d, skin: 0x8a5a34 },
  { jersey: 0x9b30ff, pants: 0x1a1a22, helmet: 0x00e5ff, frame: 0xffd400, accent: 0xff2e88, skin: 0xf0c39a },
  { jersey: 0x00c853, pants: 0x14140f, helmet: 0xff2e2e, frame: 0x1b1b1b, accent: 0xffffff, skin: 0x6b4226 },
  { jersey: 0xff9500, pants: 0x232323, helmet: 0x1b1b1b, frame: 0xff2e88, accent: 0x00e5ff, skin: 0xe8b98d },
  { jersey: 0xffffff, pants: 0x2b2b35, helmet: 0x111111, frame: 0xff3b30, accent: 0xffd400, skin: 0xc98b5e },
];

// Material definitions now live in riderMaterials.ts, where each class
// carries a procedural roughness map rather than a single scalar.

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
  forkLower: THREE.Group;   // telescoping lowers + front wheel
  swingarm: THREE.Group;    // rear triangle, pivots at the BB
  shock: THREE.Mesh;        // re-aimed each frame between its mounts
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
  shinL: THREE.Group;
  shinR: THREE.Group;
  shadow: THREE.Mesh;
  contactF: THREE.Mesh;   // tight shadow under the front tyre
  contactR: THREE.Mesh;   // ... and the rear
  /** progressive grime controller for this rig */
  dirt: DirtHandle;
}

const PIVOT_Y = 0.72;

// --- suspension geometry (bike-local space, +Z is forward) ----------------
/** Bottom-bracket / swingarm pivot. */
export const BB_POS = new THREE.Vector3(0, 0.30, -0.06);
/** Rear axle, expressed relative to the swingarm pivot. */
export const SWING_AXLE = new THREE.Vector3(0, 0.06, -0.56);
/** Shock mounts: upper is on the frame, lower rides the swingarm. */
export const SHOCK_UPPER = new THREE.Vector3(0, 0.93, -0.33);
export const SHOCK_LOWER = new THREE.Vector3(0, 0.02, -0.30);
export const SHOCK_BASE_LEN = SHOCK_UPPER.distanceTo(
  SHOCK_LOWER.clone().add(BB_POS));
/** Unit vector from the fork crown down to the front axle. */
export const FORK_AXIS = new THREE.Vector3(0, -0.28, 0.10).normalize();

/** Wheel with its axle along local X so it spins on rotation.x. */
function makeWheel(
  tyre: THREE.Material, rim: THREE.Material, hub: THREE.Material,
  rotor?: THREE.Material,
): THREE.Mesh {
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
  // brake rotor: bright machined metal, catches light as the wheel turns
  if (rotor) {
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(R * 0.52, R * 0.52, 0.012, 14), rotor);
    disc.rotation.z = Math.PI / 2;
    disc.position.x = 0.09;
    wheel.add(disc);
  }
  return wheel;
}

export function createRider(c: RiderColors, build: RiderBuild = BUILD_DEFAULT): RiderRig {
  const B = build;
  const root = new THREE.Group();
  const lean = new THREE.Group(); root.add(lean);
  const body = new THREE.Group(); lean.add(body);
  const spin = new THREE.Group(); spin.position.y = PIVOT_Y; body.add(spin);
  const flip = new THREE.Group(); spin.add(flip);
  const offset = new THREE.Group(); offset.position.y = -PIVOT_Y; flip.add(offset);

  // Material classes with non-overlapping roughness bands, each carrying a
  // procedural roughness map so surfaces vary across themselves rather than
  // being seven shades of the same plastic.
  const mFrame = RIDER_MAT.frame(c.frame);
  const mTyre = RIDER_MAT.tyre(0x16161a);
  const mRim = RIDER_MAT.steel(0xd8d8dd);
  const mHub = RIDER_MAT.frame(c.accent);
  const mJersey = RIDER_MAT.jersey(c.jersey);
  const mPants = RIDER_MAT.pants(c.pants);
  const mHelmet = RIDER_MAT.helmet(c.helmet);
  const mSkin = RIDER_MAT.skin(c.skin);
  const mDark = RIDER_MAT.steel(0x232329);
  const mArmour = RIDER_MAT.armour(c.pants);
  const mGlove = RIDER_MAT.glove(c.pants);
  const mBoot = RIDER_MAT.boot(0x1b1b20);

  // ---- bike -----------------------------------------------------------
  const bike = new THREE.Group();
  offset.add(bike);

  const BB = V(0, 0.30, -0.06);       // bottom bracket
  const HEAD_T = V(0, 0.86, 0.44);    // head tube top
  const HEAD_B = V(0, 0.62, 0.50);    // head tube bottom
  const SEAT_T = V(0, 0.98, -0.40);

  bike.add(tube(BB, HEAD_B, 0.045, mFrame));            // down tube
  bike.add(tube(SEAT_T, HEAD_T, 0.040, mFrame));        // top tube
  bike.add(tube(BB, SEAT_T, 0.042, mFrame));            // seat tube
  bike.add(tube(HEAD_B, HEAD_T, 0.05, mDark));          // head tube

  // ---- rear suspension: swingarm pivoting at the BB, driven by a coil
  // shock. The seatstay is replaced by the shock, which is how a real
  // full-suspension DH bike reads.
  const swingarm = new THREE.Group();
  swingarm.position.copy(BB);
  bike.add(swingarm);
  swingarm.add(tube(V(0, 0, 0), SWING_AXLE.clone(), 0.036, mFrame));
  swingarm.add(tube(V(0, 0.02, -0.16), V(0, 0.10, -0.30), 0.026, mFrame));
  const rocker = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.13, 0.07), mHub);
  rocker.position.copy(SHOCK_LOWER);
  swingarm.add(rocker);

  const shock = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, SHOCK_BASE_LEN, 8), mHub);
  // rest transform, so rigs that never run the pose pass (the ghost) still
  // show the shock correctly seated between its mounts
  {
    const lo = SHOCK_LOWER.clone().add(BB_POS);
    const dir = lo.clone().sub(SHOCK_UPPER);
    shock.position.copy(SHOCK_UPPER).addScaledVector(dir, 0.5);
    shock.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  }
  bike.add(shock);
  const shockShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, SHOCK_BASE_LEN * 0.5, 6), mRim);
  shockShaft.position.y = -SHOCK_BASE_LEN * 0.42;
  shock.add(shockShaft);
  // saddle
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.06, 0.32),
    RIDER_MAT.seat(0x1c1c22));
  saddle.position.set(0, 1.02, -0.42); saddle.rotation.x = -0.12;
  bike.add(saddle);
  // chainring
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 12), mHub);
  ring.rotation.z = Math.PI / 2; ring.position.copy(BB);
  bike.add(ring);
  // chain run: dark oily metal, distinctly duller than the rotors
  const mChain = RIDER_MAT.chain(0x2a2a30);
  const chainTop = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.56), mChain);
  chainTop.position.set(0.09, BB.y + 0.13, BB.z - 0.28);
  bike.add(chainTop);
  const chainBot = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.56), mChain);
  chainBot.position.set(0.09, BB.y - 0.13, BB.z - 0.28);
  bike.add(chainBot);

  // ---- fork / steering ------------------------------------------------
  const fork = new THREE.Group();
  fork.position.copy(HEAD_B);
  bike.add(fork);
  const AX = V(0, -0.26, 0.10);
  // crown + stanchions stay with the frame; the lowers slide over them
  const crown = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.07, 0.11), mDark);
  crown.position.set(0, 0.02, 0.012);
  fork.add(crown);
  // stanchions: polished chrome, the most reflective part of the bike
  const mStanchion = RIDER_MAT.stanchion(0xd6dae0);
  [-1, 1].forEach(s => {
    fork.add(tube(
      V(s * 0.11, 0.02, 0.0),
      V(s * 0.11, AX.y * 0.62, AX.z * 0.62), 0.028, mStanchion));
  });
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

  const forkLower = new THREE.Group();
  fork.add(forkLower);
  [-1, 1].forEach(s => {
    forkLower.add(tube(
      V(s * 0.11, AX.y * 0.55, AX.z * 0.55),
      V(s * 0.11, AX.y, AX.z), 0.042, mDark));
  });
  const arch = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.07), mDark);
  arch.position.set(0, AX.y * 0.72, AX.z * 0.72);
  forkLower.add(arch);

  const mRotor = RIDER_MAT.brake(0xb8bcc4);
  const frontWheel = makeWheel(mTyre, mRim, mHub, mRotor);
  frontWheel.position.copy(AX);
  forkLower.add(frontWheel);

  const rearWheel = makeWheel(mTyre, mRim, mHub, mRotor);
  rearWheel.position.copy(SWING_AXLE);
  swingarm.add(rearWheel);

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
  // ---- CHEST. Widened by the shoulder multiplier: this is the strongest
  // rear-view read after the helmet, so it carries the most variation.
  const chest = new THREE.Mesh(
    new THREE.BoxGeometry(0.42 * B.shoulders, 0.56, 0.30 * B.bulk), mJersey);
  chest.position.set(0, 0.26, 0.16);
  chest.rotation.x = -0.62;
  torso.add(chest);

  // ---- SHOULDER PADS. Bold angular caps that break the arm line and read
  // as armour at any distance. The single clearest "heavy rider" cue.
  if (B.armour > 0.4) {
    [-1, 1].forEach((s, i) => {
      // asymmetric riders wear one and lost the other
      if (B.asymmetric && i === 0) return;
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(0.20 * B.shoulders, 0.16, 0.26), mArmour);
      pad.position.set(s * 0.24 * B.shoulders, 0.44, 0.16);
      pad.rotation.z = -s * 0.32;
      pad.rotation.x = -0.5;
      torso.add(pad);
    });
  }

  const numPlate = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.20, 0.02), RIDER_MAT.helmet(0xf5f5f5));
  numPlate.position.set(0, 0.30, 0.33); numPlate.rotation.x = -0.62;
  torso.add(numPlate);

  const hips = new THREE.Mesh(
    new THREE.BoxGeometry(0.36 * B.bulk, 0.24, 0.28), mPants);
  hips.position.set(0, 0.02, -0.04);
  torso.add(hips);

  // ---- BACK PROTECTOR / PACK. Seen from behind on almost every frame, so
  // its outline matters more than any front detail.
  const pack = new THREE.Mesh(
    new THREE.BoxGeometry(0.30 * B.pack, 0.30 * B.pack, 0.14 * B.pack),
    RIDER_MAT.pants(c.accent));
  pack.position.set(0, 0.34, -0.02); pack.rotation.x = -0.62;
  torso.add(pack);
  // ribbed spine plate on armoured riders
  if (B.armour > 0.7) {
    for (let i = 0; i < 3; i++) {
      const rib = new THREE.Mesh(
        new THREE.BoxGeometry(0.26 * B.pack, 0.06, 0.05), mArmour);
      rib.position.set(0, 0.26 + i * 0.10, -0.10 - i * 0.02);
      rib.rotation.x = -0.62;
      torso.add(rib);
    }
  }

  // ---- NECK BRACE. A hard collar ring that visually detaches the helmet
  // from the shoulders — very legible in silhouette.
  if (B.brace) {
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.17, 0.055, 6, 12), RIDER_MAT.armour(c.accent));
    collar.position.set(0, 0.52, 0.30);
    collar.rotation.x = Math.PI / 2 - 0.5;
    torso.add(collar);
  }

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.10, 6), mSkin);
  neck.position.set(0, 0.53, 0.34);
  torso.add(neck);

  // ---- HELMET. Oversized on purpose (~20% beyond scale) because at racing
  // speed a correctly-proportioned head is an unreadable dot. Five distinct
  // profiles so riders are identifiable by outline alone.
  const H = 0.165 * B.helmet;
  const head = new THREE.Mesh(new THREE.SphereGeometry(H, 12, 10), mHelmet);
  head.position.set(0, 0.63, 0.42);
  switch (B.lid) {
    case 'aero':  head.scale.set(0.92, 0.92, 1.34); break;  // long teardrop
    case 'boxy':  head.scale.set(1.18, 1.02, 1.08); break;  // wide and blunt
    case 'domed': head.scale.set(1.12, 1.18, 1.12); break;  // big round bulb
    case 'crest': head.scale.set(1.0, 1.08, 1.14); break;   // fin added below
    default:      head.scale.set(1, 0.98, 1.12);
  }
  torso.add(head);

  // aero tail: a swept spoiler off the back of the lid
  if (B.lid === 'aero') {
    const tail = new THREE.Mesh(new THREE.ConeGeometry(H * 0.62, H * 1.5, 6), mHelmet);
    tail.position.set(0, 0.02, -H * 1.15);
    tail.rotation.x = -Math.PI / 2;
    head.add(tail);
  }
  // crest: a mohawk fin, unmistakable from behind
  if (B.lid === 'crest') {
    const fin = new THREE.Mesh(
      new THREE.BoxGeometry(H * 0.16, H * 0.75, H * 1.7), RIDER_MAT.helmet(c.accent));
    fin.position.set(0, H * 0.88, -H * 0.1);
    head.add(fin);
  }
  // boxy lids get hard corner blocks rather than a smooth shell
  if (B.lid === 'boxy') {
    const jaw = new THREE.Mesh(
      new THREE.BoxGeometry(H * 2.0, H * 0.7, H * 1.5), mHelmet);
    jaw.position.set(0, -H * 0.45, H * 0.2);
    head.add(jaw);
  }
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.045, 0.20), RIDER_MAT.helmet(c.accent));
  visor.position.set(0, 0.10, 0.13); visor.rotation.x = 0.28;
  head.add(visor);
  const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.10, 0.06), RIDER_MAT.glove(0x101018));
  goggles.position.set(0, 0.0, 0.16);
  head.add(goggles);
  const lens = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.02), RIDER_MAT.lens(0x66e0ff));
  lens.position.set(0, 0.0, 0.19);
  head.add(lens);
  const chin = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.16), mHelmet);
  chin.position.set(0, -0.13, 0.10);
  head.add(chin);

  // ---- CONTACT POINTS, resolved in BIKE space ------------------------
  // The grips live under `fork`, which sits at HEAD_B, so their true
  // position is HEAD_B + local offset. Solving against the local offset
  // alone (as an earlier pass did) puts the hands ~0.6m short and 0.3m low.
  // GRIP_BIKE / PEDAL_BIKE are the single source of truth for where the
  // rider must reach; both arms and legs derive from them.
  const GRIP_LOCAL = V(0.28, 0.31, 0.07);
  const GRIP_BIKE = V(
    GRIP_LOCAL.x,
    HEAD_B.y + GRIP_LOCAL.y,
    HEAD_B.z + GRIP_LOCAL.z,
  );
  // torso group origin — everything on the rider is relative to this
  const TORSO_AT = V(0, 0.92, -0.26);

  const mkArm = (s: number) => {
    const g = new THREE.Group();
    // NOTE: arms are parented to `rider`, NOT `torso`. Their positions are
    // already in rider space (which is bike space), so no torso offset is
    // subtracted here — unlike the legs below, which are also on `rider`
    // but were authored relative to the hip.
    const shoulder = V(s * 0.21 * B.shoulders, TORSO_AT.y + 0.46, TORSO_AT.z + 0.20);
    g.position.copy(shoulder);
    // grip expressed in this arm group's own space
    const grip = V(
      s * GRIP_BIKE.x - shoulder.x,
      GRIP_BIKE.y - shoulder.y,
      GRIP_BIKE.z - shoulder.z,
    );
    // elbow: 55% of the way out, dropped and flared so the arm bends
    const elbow = V(grip.x * 0.5 + s * 0.05, grip.y * 0.45 - 0.06, grip.z * 0.45);
    const upper = tube(V(0, 0, 0), elbow, 0.062 * B.limbs, mJersey);
    g.add(upper);
    // ---- ELBOW PAD: a hard angular cap mid-limb
    if (B.pads) {
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(0.13 * B.limbs, 0.13, 0.13), mArmour);
      pad.position.copy(elbow);
      g.add(pad);
    }
    const fore = new THREE.Group();
    fore.position.copy(elbow);
    // remaining reach from the elbow to the grip
    const hand = V(grip.x - elbow.x, grip.y - elbow.y, grip.z - elbow.z);
    fore.add(tube(V(0, 0, 0), hand, 0.052 * B.limbs, mSkin));
    // ---- GLOVE: oversized so the hands stay visible at speed
    const glove = new THREE.Mesh(
      new THREE.BoxGeometry(0.13 * B.limbs, 0.13, 0.15), mGlove);
    glove.position.copy(hand);
    fore.add(glove);
    // knuckle plate catches the light and reads as a fist
    const knuckle = new THREE.Mesh(
      new THREE.BoxGeometry(0.12 * B.limbs, 0.05, 0.06), RIDER_MAT.armour(c.accent));
    knuckle.position.set(hand.x, hand.y + 0.04, hand.z + 0.05);
    fore.add(knuckle);
    g.add(fore);
    rider.add(g);
    return g;
  };
  const armL = mkArm(-1), armR = mkArm(1);

  const mkLeg = (s: number) => {
    const g = new THREE.Group();
    // SYNC: the pedal orbits the bottom bracket at crank radius, so the
    // foot target is BB + (+/-0.10 outboard, -0.29 down at rest). Solving
    // for X alone (an earlier pass) left the feet floating well above and
    // behind the cranks. All three axes are resolved here.
    const hip = V(s * 0.13 * B.bulk, TORSO_AT.y, TORSO_AT.z);
    g.position.copy(hip);
    const PEDAL_BIKE = V(s * 0.10, BB.y - 0.29, BB.z);
    // pedal expressed in this leg group's space
    const foot = V(
      PEDAL_BIKE.x - hip.x,
      PEDAL_BIKE.y - hip.y,
      PEDAL_BIKE.z - hip.z,
    );
    // knee sits forward of the straight hip->foot line, which is what
    // makes the leg read as bent over the cranks rather than stiff
    const knee = V(foot.x * 0.5, foot.y * 0.52, foot.z * 0.5 + 0.16);
    g.add(tube(V(0, 0, 0), knee, 0.085 * B.limbs, mPants));
    const shin = new THREE.Group();
    shin.position.copy(knee);
    const lower = V(foot.x - knee.x, foot.y - knee.y, foot.z - knee.z);
    shin.add(tube(V(0, 0, 0), lower, 0.062 * B.limbs, mPants));
    // ---- KNEE PAD: chunky forward-facing block, the classic DH shape
    if (B.pads) {
      const kp = new THREE.Mesh(
        new THREE.BoxGeometry(0.15 * B.limbs, 0.18, 0.13), mArmour);
      kp.position.set(0, -0.02, 0.07);
      shin.add(kp);
    }
    // ---- BOOT: deliberately oversized. Small feet disappear at speed and
    // make the whole rider read as spindly. Sits ON the pedal.
    const shoe = new THREE.Mesh(
      new THREE.BoxGeometry(0.15 * B.limbs, 0.11, 0.29), mBoot);
    shoe.position.copy(lower);
    shin.add(shoe);
    const sole = new THREE.Mesh(
      new THREE.BoxGeometry(0.16 * B.limbs, 0.04, 0.31), RIDER_MAT.boot(c.accent));
    sole.position.set(lower.x, lower.y - 0.05, lower.z);
    shin.add(sole);
    g.add(shin);
    rider.add(g);
    return { hip: g, shin };
  };
  const legLp = mkLeg(-1), legRp = mkLeg(1);
  const legL = legLp.hip, legR = legRp.hip;
  const shinL = legLp.shin, shinR = legRp.shin;

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

  // Tight, dark contact patches directly under each tyre. The big blob reads
  // as "roughly here"; these are what actually plant the bike on the dirt.
  const contactTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g2 = cv.getContext('2d')!;
    const grd = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(0,0,0,0.85)');
    grd.addColorStop(0.35, 'rgba(0,0,0,0.55)');
    grd.addColorStop(0.72, 'rgba(0,0,0,0.14)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g2.fillStyle = grd; g2.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const mkContact = () => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.92),
      new THREE.MeshBasicMaterial({
        map: contactTex, transparent: true, depthWrite: false, opacity: 0.85,
      }));
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 3;
    return m;
  };
  const contactF = mkContact(), contactR = mkContact();

  root.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = false; o.receiveShadow = false; } });

  // NOTE: deliberately NOT scaling the rider group here. The hands are
  // placed to reach the bars and the feet to reach the pedals, and the bike
  // is not scaled with them — so a group-level scale detached the limbs
  // from the contact points. Build variation comes from the per-part
  // multipliers (shoulders / bulk / limbs / legs / helmet) instead, which
  // preserve those contacts.

  // NOTE: an inverted-hull outline pass used to live here and was removed.
  // It scaled a duplicate of every mesh by 1.055, which works for closed
  // blobs but is wrong for this rig: the frame is built from `tube()`
  // cylinders whose geometry is centred on the mesh origin, so uniform
  // scaling made every tube 5.5% LONGER as well as fatter. The frame
  // visibly came apart at its joints and the mesh count doubled.
  // Rider readability is carried by the material contrast and contact
  // shadows instead.

  return {
    root, lean, body, spin, flip, bike, fork, forkLower, swingarm, shock,
    frontWheel, rearWheel, cranks,
    rider, torso, head, armL, armR, legL, legR, shinL, shinR,
    shadow, contactF, contactR,
    // must run last: every material has to exist before it can be grimed
    dirt: attachDirt(root),
  };
}

// ---------------------------------------------------------------------------
// Scenery geometry
// ---------------------------------------------------------------------------

/**
 * Pine canopy variants. A single cone repeated across a whole forest is the
 * most visible kind of asset repetition there is, because the silhouette is
 * identical at every distance. These four differ in tier count, taper and
 * raggedness so the treeline reads as a forest rather than a stamp.
 *
 *   0  single spire    — young, narrow
 *   1  two-tier        — the classic shape
 *   2  three-tier      — old and layered
 *   3  broken top      — storm-damaged, asymmetric
 */
export function pineFoliageGeo(variant = 0): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  switch (variant % 4) {
    case 1: {
      const lo = new THREE.ConeGeometry(1.05, 1.7, 7, 1);
      lo.translate(0, 0.85, 0);
      const hi = new THREE.ConeGeometry(0.7, 1.5, 7, 1);
      hi.translate(0, 1.95, 0);
      parts.push(lo, hi);
      break;
    }
    case 2: {
      const a = new THREE.ConeGeometry(1.15, 1.3, 8, 1); a.translate(0, 0.65, 0);
      const b = new THREE.ConeGeometry(0.85, 1.2, 8, 1); b.translate(0, 1.5, 0);
      const c = new THREE.ConeGeometry(0.52, 1.1, 8, 1); c.translate(0, 2.35, 0);
      parts.push(a, b, c);
      break;
    }
    case 3: {
      // snapped crown: squat, wide, leaning
      const lo = new THREE.ConeGeometry(1.2, 1.5, 7, 1);
      lo.translate(0, 0.75, 0);
      const stub = new THREE.ConeGeometry(0.55, 0.8, 6, 1);
      stub.rotateZ(0.34);
      stub.translate(0.22, 1.7, 0);
      parts.push(lo, stub);
      break;
    }
    default: {
      const g = new THREE.ConeGeometry(0.92, 2.7, 7, 1);
      g.translate(0, 1.35, 0);
      parts.push(g);
    }
  }
  return mergeGeos(parts);
}

/** Trunk variants: straight, tapered, and a leaning one. */
export function pineTrunkVariant(variant = 0): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(
    0.13 + (variant % 3) * 0.03, 0.22 + (variant % 3) * 0.04, 1.6, 5);
  g.translate(0, 0.8, 0);
  if (variant % 4 === 3) g.rotateZ(0.09);
  return g;
}

/**
 * FAR-BAND pine. Two crossed billboards' worth of geometry collapsed into a
 * single low cone — 7 tris instead of 40+. Used beyond the mid band where
 * the tree is a silhouette and nothing more.
 */
export function pineImpostorGeo(): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(1.0, 2.6, 4, 1);
  g.translate(0, 1.3, 0);
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

export type RockFamily = 'pebble' | 'boulder' | 'landmark' | 'formation';

/**
 * Rock families differ in SHAPE, not just scale — a scaled-up pebble still
 * reads as a pebble. Detail level also rises with size, since a massive
 * formation occupies far more screen area than a trailside stone.
 *
 *   pebble     rounded, low detail, flattish
 *   boulder    chunky and irregular — the obstacle read
 *   landmark   tall and angular, visible from distance
 *   formation  jagged spires, communicates mountain scale
 */
export function rockGeo(seed = 5, family: RockFamily = 'boulder'): THREE.BufferGeometry {
  const rng = new RNG(seed);
  const detail = family === 'pebble' ? 0 : family === 'formation' ? 2 : 1;
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position as THREE.BufferAttribute;

  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    switch (family) {
      case 'pebble': {
        const f = 0.75 + rng.next() * 0.4;
        p.setXYZ(i, x * f * 1.2, Math.max(0, y) * f * 0.55, z * f * 1.15);
        break;
      }
      case 'landmark': {
        // vertical bias with hard facets: reads as a standing stone
        const f = 0.7 + rng.next() * 0.5;
        const facet = Math.round(x * 3) / 3;
        p.setXYZ(i, facet * f * 0.9, Math.max(0, y) * (1.5 + rng.next() * 0.9),
          Math.round(z * 3) / 3 * f * 0.9);
        break;
      }
      case 'formation': {
        // spiky: push vertices out along their own normal at random
        const spike = 0.75 + Math.pow(rng.next(), 2) * 1.6;
        p.setXYZ(i, x * spike * 0.85,
          Math.max(-0.1, y) * spike * (1.6 + rng.next()), z * spike * 0.85);
        break;
      }
      default: {
        const f = 0.62 + rng.next() * 0.7;
        p.setXYZ(i, x * f * 1.15, Math.max(0, y) * f * 0.86, z * f * 1.1);
      }
    }
    void x; void y; void z;
  }
  g.computeVertexNormals();
  return g;
}

/** A pool of distinct geometries for a family, to break up repetition. */
export function rockFamily(family: RockFamily, count = 4): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) out.push(rockGeo(11 + i * 137, family));
  return out;
}

/** Bush variants: differing lump counts and spread. */
export function bushGeo(variant = 0): THREE.BufferGeometry {
  const rng = new RNG(21 + variant * 137);
  const lumps = 1 + (variant % 3);
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < lumps; k++) {
    const g = new THREE.IcosahedronGeometry(0.8 / (1 + k * 0.35), 0);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const f = 0.6 + rng.next() * 0.8;
      p.setXYZ(i, p.getX(i) * f, Math.max(-0.1, p.getY(i)) * f, p.getZ(i) * f);
    }
    g.computeVertexNormals();
    g.translate(
      rng.range(-0.45, 0.45) * k,
      0.35 - k * 0.06,
      rng.range(-0.45, 0.45) * k);
    parts.push(g);
  }
  return mergeGeos(parts);
}

/** Small ground plants: a low fan of leaves, cheap and readable up close. */
export function plantGeo(variant = 0): THREE.BufferGeometry {
  const rng = new RNG(707 + variant * 53);
  const parts: THREE.BufferGeometry[] = [];
  const n = 3 + (variant % 3);
  for (let i = 0; i < n; i++) {
    const leaf = new THREE.ConeGeometry(0.10, rng.range(0.35, 0.62), 4, 1);
    leaf.translate(0, rng.range(0.16, 0.3), 0);
    leaf.rotateZ(rng.range(-0.7, 0.7));
    leaf.rotateY((i / n) * TAU + rng.range(-0.3, 0.3));
    parts.push(leaf);
  }
  return mergeGeos(parts);
}

/** Fallen branch: a forked stick lying on the ground. */
export function branchGeo(variant = 0): THREE.BufferGeometry {
  const rng = new RNG(311 + variant * 91);
  const parts: THREE.BufferGeometry[] = [];
  const main = new THREE.CylinderGeometry(0.05, 0.08, rng.range(1.6, 2.8), 5);
  main.rotateZ(Math.PI / 2);
  main.translate(0, 0.07, 0);
  parts.push(main);
  const forks = 1 + (variant % 2);
  for (let i = 0; i < forks; i++) {
    const f = new THREE.CylinderGeometry(0.03, 0.045, rng.range(0.5, 1.0), 4);
    f.rotateZ(Math.PI / 2 + rng.range(-0.8, 0.8));
    f.translate(rng.range(-0.6, 0.6), 0.06, rng.range(-0.3, 0.3));
    parts.push(f);
  }
  return mergeGeos(parts);
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
/** Three-rail timber fence section, ~2.9m long. */
export function fenceGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 2; i++) {
    const p = new THREE.BoxGeometry(0.13, 1.15, 0.13);
    p.translate(i * 2.6 - 1.3, 0.58, 0);
    parts.push(p);
  }
  for (let r = 0; r < 3; r++) {
    const rail = new THREE.BoxGeometry(2.75, 0.16, 0.07);
    rail.translate(0, 0.35 + r * 0.34, 0);
    parts.push(rail);
  }
  return mergeGeos(parts);
}

/** Course sign on a post. */
export function signGeo(): THREE.BufferGeometry {
  const post = new THREE.BoxGeometry(0.1, 1.5, 0.1);
  post.translate(0, 0.75, 0);
  const board = new THREE.BoxGeometry(1.25, 0.72, 0.07);
  board.translate(0, 1.68, 0);
  return mergeGeos([post, board]);
}

/** Plastic road barrier with feet. */
export function barrierGeo(): THREE.BufferGeometry {
  const body = new THREE.BoxGeometry(2.2, 0.82, 0.32);
  body.translate(0, 0.5, 0);
  const footL = new THREE.BoxGeometry(0.3, 0.16, 0.78);
  footL.translate(-0.85, 0.08, 0);
  const footR = footL.clone(); footR.translate(1.7, 0, 0);
  return mergeGeos([body, footL, footR]);
}

/** Wooden kicker ramp you can ride up. */
export function rampGeo(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const W = 2.2, L = 4.4, H = 1.15;
  // wedge: flat at the back, rising to a lip at the front (+Z)
  const v = new Float32Array([
    -W, 0, -L / 2, W, 0, -L / 2, W, H, L / 2, -W, H, L / 2,   // deck
    -W, 0, -L / 2, -W, H, L / 2, -W, 0, L / 2,                // left side
    W, 0, -L / 2, W, 0, L / 2, W, H, L / 2,                   // right side
    -W, 0, L / 2, W, H, L / 2, W, 0, L / 2,                   // front face
    -W, 0, L / 2, -W, H, L / 2, W, H, L / 2,
  ]);
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  g.computeVertexNormals();
  return g;
}

/** Low snow drift mound. */
export function driftGeo(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(2.6, 0.5, 1.7);
  return g;
}

/** Merge a set of geometries that share no attributes beyond position/normal. */
function mergeGeos(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let vCount = 0;
  for (const g of list) vCount += g.attributes.position.count;

  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const idx: number[] = [];
  let vo = 0;
  for (const g of list) {
    const p = g.attributes.position.array as ArrayLike<number>;
    const n = g.attributes.normal.array as ArrayLike<number>;
    pos.set(p as never, vo * 3);
    nor.set(n as never, vo * 3);
    const count = g.attributes.position.count;
    // CRITICAL: several Three primitives are NON-indexed — ConeGeometry with
    // 4+ radial segments among them. Assuming g.index exists throws and
    // takes the whole track build (and therefore the loading screen) with it.
    if (g.index) {
      const gi = g.index.array as ArrayLike<number>;
      for (let i = 0; i < gi.length; i++) idx.push(gi[i] + vo);
    } else {
      // synthesise a trivial index for the vertex run
      for (let i = 0; i < count; i++) idx.push(vo + i);
    }
    vo += count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setIndex(idx);
  out.computeVertexNormals();
  return out;
}

export function flagGeo(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(0.9, 0.6, 4, 1);
  g.translate(0.45, 0, 0);
  return g;
}
