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
 * Chase camera reads helmet → shoulders → back first. Builds vary those
 * strongly; limb thickness / length stay near human so IK stays believable.
 * Exaggeration is mild (~8–15%) — readable at speed, not disconnected blocks.
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
    scale: 0.96, shoulders: 0.90, bulk: 0.90, helmet: 1.0, lid: 'aero',
    limbs: 0.92, legs: 1.04, armour: 0.2, pack: 0.55, pads: false,
    brace: false, asymmetric: false,
  },
  // wide shoulders, heavy armour, blunt helmet
  bonker: {
    scale: 1.06, shoulders: 1.22, bulk: 1.18, helmet: 1.08, lid: 'boxy',
    limbs: 1.14, legs: 0.96, armour: 1.0, pack: 1.35, pads: true,
    brace: true, asymmetric: false,
  },
  // lean and loose, crested lid
  showoff: {
    scale: 1.0, shoulders: 0.96, bulk: 0.92, helmet: 1.12, lid: 'crest',
    limbs: 0.94, legs: 1.06, armour: 0.15, pack: 0.7, pads: false,
    brace: false, asymmetric: false,
  },
  // wrapped in every pad available
  coward: {
    scale: 0.95, shoulders: 1.12, bulk: 1.12, helmet: 1.14, lid: 'domed',
    limbs: 1.08, legs: 0.96, armour: 1.0, pack: 1.25, pads: true,
    brace: true, asymmetric: false,
  },
  // mismatched, lopsided
  chaos: {
    scale: 1.02, shoulders: 1.08, bulk: 1.0, helmet: 1.06, lid: 'crest',
    limbs: 1.02, legs: 1.0, armour: 0.55, pack: 1.05, pads: true,
    brace: false, asymmetric: true,
  },
  // textbook proportions
  allround: {
    scale: 1.0, shoulders: 1.02, bulk: 1.0, helmet: 1.02, lid: 'round',
    limbs: 1.0, legs: 1.0, armour: 0.6, pack: 1.0, pads: true,
    brace: false, asymmetric: false,
  },
};

/**
 * Downhill attack stance (radians), distributed across the spine.
 *
 * Three.js: +rotation.x tips local +Y toward +Z (bars). Keep total lean
 * athletic (~45°), NOT flat-horizontal — head must sit clearly above the bars
 * from the chase camera. Prior 60°+ short-spine stack looked like a sausage.
 */
export const PELVIS_ATTACK = 0.30;
export const SPINE_ATTACK = 0.20;
export const CHEST_ATTACK = 0.12;
/** Alias used by pose layers (chest contribution only). */
export const ATTACK_PITCH = CHEST_ATTACK;

/**
 * Rest pelvis in bike-local space: over the BB, slightly aft.
 * Height tuned so knees stay bent on pedals and shoulders reach the bars.
 */
export const PELVIS_REST = { x: 0, y: 0.70, z: -0.16 };

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

/**
 * Tapered limb segment along local +Y from 0 → len.
 * Wider near the joint origin, narrower at the far end — reads as muscle→joint
 * rather than a uniform pipe bolted between spheres.
 */
function boneSeg(
  rNear: number, len: number, m: THREE.Material, segs = 7, rFar?: number,
): THREE.Mesh {
  const r1 = rNear;
  const r0 = rFar ?? rNear * 0.82;
  // Plain tapered cylinder — no end-cap spheres (those read as floating
  // pink marbles at elbows/knees in the garage close-up).
  const cyl = new THREE.Mesh(
    new THREE.CylinderGeometry(r0, r1, len, segs, 1), m);
  cyl.position.y = len * 0.5;
  return cyl;
}

/**
 * Soft elongated pad along local Z (saddle, gloves). Capsule rotated so the
 * long axis is forward rather than a hard BoxGeometry slab.
 */
function softPad(w: number, h: number, d: number, m: THREE.Material, segs = 6): THREE.Mesh {
  const r = Math.min(w, h) * 0.48;
  const body = Math.max(0.01, d - r * 2);
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, body, 3, segs), m);
  mesh.rotation.x = Math.PI / 2;
  mesh.scale.set(w / (r * 2), 1, h / (r * 2));
  return mesh;
}

/**
 * Subtle dark BackSide shell so the silhouette holds against busy forests.
 * Shared geometry with the source mesh; ghost setup strips these by
 * detecting MeshBasicMaterial + BackSide.
 */
function addOutlineShell(mesh: THREE.Mesh, scale = 1.08): THREE.Mesh {
  const shell = new THREE.Mesh(
    mesh.geometry,
    new THREE.MeshBasicMaterial({
      color: 0x0a0a12,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  shell.scale.setScalar(scale);
  shell.renderOrder = -1;
  // mark so disposers can skip shared geometry / materials if needed
  shell.userData.outlineShell = true;
  mesh.add(shell);
  return shell;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const _Y_UP = new THREE.Vector3(0, 1, 0);
const _ikA = new THREE.Vector3();
const _ikB = new THREE.Vector3();
const _ikC = new THREE.Vector3();
const _ikD = new THREE.Vector3();
const _ikE = new THREE.Vector3();

/**
 * Two-bone IK. Bones live along local +Y; `upper` is at the joint origin in
 * parent space, `lower` is a child of `upper` at (0, upperLen, 0).
 * `target` and `pole` are in upper.parent local space.
 */
export function solveTwoBoneIK(
  upper: THREE.Object3D,
  lower: THREE.Object3D,
  target: THREE.Vector3,
  upperLen: number,
  lowerLen: number,
  pole: THREE.Vector3,
): void {
  const origin = upper.position;
  _ikA.subVectors(target, origin);
  let dist = _ikA.length();
  const maxR = upperLen + lowerLen - 0.002;
  const minR = Math.abs(upperLen - lowerLen) + 0.002;
  if (dist < 1e-6) {
    _ikA.set(0, -1, 0);
    dist = minR;
  }
  dist = Math.max(minR, Math.min(maxR, dist));
  _ikA.normalize();

  // mid joint distance along origin→target, and height of the bend
  const d1 = (upperLen * upperLen - lowerLen * lowerLen + dist * dist) / (2 * dist);
  const h2 = Math.max(0, upperLen * upperLen - d1 * d1);
  const h = Math.sqrt(h2);

  // pole projected off the reach axis → bend plane normal
  _ikB.subVectors(pole, origin);
  _ikB.addScaledVector(_ikA, -_ikB.dot(_ikA));
  if (_ikB.lengthSq() < 1e-8) {
    _ikB.set(0, 0, 1).cross(_ikA);
    if (_ikB.lengthSq() < 1e-8) _ikB.set(1, 0, 0).cross(_ikA);
  }
  _ikB.normalize();

  // mid joint position in parent space
  _ikC.copy(origin).addScaledVector(_ikA, d1).addScaledVector(_ikB, h);
  // aim upper +Y at mid
  _ikD.subVectors(_ikC, origin).normalize();
  upper.quaternion.setFromUnitVectors(_Y_UP, _ikD);
  // lower is child of upper: target → upper local, then past the elbow joint
  _ikE.copy(target).sub(origin);
  _ikE.applyQuaternion(_ikTmpQ.copy(upper.quaternion).invert());
  _ikE.y -= upperLen;
  if (_ikE.lengthSq() < 1e-10) _ikE.set(0, -1, 0);
  else _ikE.normalize();
  lower.quaternion.setFromUnitVectors(_Y_UP, _ikE);
}

const _ikTmpQ = new THREE.Quaternion();

export interface RiderIKOpts {
  /** 0..1 detach left / right hand from grip (no-hander) */
  handOffL?: number;
  handOffR?: number;
  /** 0..1 kick right foot off pedal (one-footer) */
  footOffR?: number;
  /** 0..1 extend both legs back (superman) */
  superman?: number;
  /** skip arm IK and leave current arm rotations (bonk swing / crash) */
  lockArms?: boolean;
  /** skip leg IK */
  lockLegs?: boolean;
  /** which arm is swinging for a bonk: -1 L, +1 R, 0 none */
  bonkArm?: number;
  /** body absorb: elbows/knees fold extra (suspension) */
  absorb?: number;
  /** bike lean for elbow pole bias */
  lean?: number;
}

/** Transform a world-space point into `obj` local space (uses matrixWorld). */
function worldToLocalPoint(obj: THREE.Object3D, world: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  _ikMat.copy(obj.matrixWorld).invert();
  return out.copy(world).applyMatrix4(_ikMat);
}

/**
 * Attach hands→grips and feet→pedals via two-bone IK.
 *
 * Targets are Object3D anchors parented to the fork / crank arms, so steer
 * and pedal rotation are free — no manual space hacks. Call AFTER fork yaw,
 * crank phase, and body (pelvis/spine/chest) pose for the frame.
 */
export function solveRiderIK(rig: RiderRig, o: RiderIKOpts = {}): void {
  const handOffL = o.handOffL ?? 0;
  const handOffR = o.handOffR ?? 0;
  const footOffR = o.footOffR ?? 0;
  const superM = o.superman ?? 0;
  const absorb = o.absorb ?? 0;
  const lean = o.lean ?? 0;

  // Resolve anchor worlds, then body parents — order matters for matrixWorld.
  rig.bike.updateWorldMatrix(true, true);
  rig.rider.updateWorldMatrix(true, true);

  rig.gripL.getWorldPosition(_gripL);
  rig.gripR.getWorldPosition(_gripR);
  rig.pedalL.getWorldPosition(_pedL);
  rig.pedalR.getWorldPosition(_pedR);

  // No-hander / victory: push targets outward from grips.
  if (handOffL > 0) {
    _gripL.x -= handOffL * 0.55;
    _gripL.y += handOffL * 0.22;
    _gripL.z -= handOffL * 0.10;
  }
  if (handOffR > 0) {
    _gripR.x += handOffR * 0.55;
    _gripR.y += handOffR * 0.22;
    _gripR.z -= handOffR * 0.10;
  }
  if (footOffR > 0) {
    _pedR.x += footOffR * 0.35;
    _pedR.y += footOffR * 0.12;
    _pedR.z -= footOffR * 0.38;
  }
  if (superM > 0) {
    _pedL.z -= superM * 0.55; _pedL.y += superM * 0.18;
    _pedR.z -= superM * 0.55; _pedR.y += superM * 0.18;
  }

  if (!o.lockArms) {
    // Arms under chest. Hands stay on grip anchors — never slide targets off.
    // Pole is built in WORLD space (out + down from shoulder→grip mid) so
    // elbows never fold above the bars when the torso is pitched forward.
    worldToLocalPoint(rig.torso, _gripL, _torsoL);
    worldToLocalPoint(rig.torso, _gripR, _torsoR);

    if (o.bonkArm !== -1) {
      rig.armL.getWorldPosition(_shW);
      _midW.lerpVectors(_shW, _gripL, 0.45);
      _poleW.set(
        _midW.x - 0.40 - absorb * 0.10,
        _midW.y - 0.38 - absorb * 0.10,
        _midW.z - 0.04 - lean * 0.08,
      );
      worldToLocalPoint(rig.torso, _poleW, _poleL);
      solveTwoBoneIK(rig.armL, rig.foreL, _torsoL, rig.upperArm, rig.lowerArm, _poleL);
      rig.handL.rotation.set(0.7 + absorb * 0.1, 0.18, 0.45);
    }
    if (o.bonkArm !== 1) {
      rig.armR.getWorldPosition(_shW);
      _midW.lerpVectors(_shW, _gripR, 0.45);
      _poleW.set(
        _midW.x + 0.40 + absorb * 0.10,
        _midW.y - 0.38 - absorb * 0.10,
        _midW.z - 0.04 + lean * 0.08,
      );
      worldToLocalPoint(rig.torso, _poleW, _poleR);
      solveTwoBoneIK(rig.armR, rig.foreR, _torsoR, rig.upperArm, rig.lowerArm, _poleR);
      rig.handR.rotation.set(0.7 + absorb * 0.1, -0.18, -0.45);
    }
  }

  if (!o.lockLegs) {
    // Legs under pelvis. Feet locked to pedals. Knees forward-out in WORLD space.
    worldToLocalPoint(rig.pelvis, _pedL, _legL);
    worldToLocalPoint(rig.pelvis, _pedR, _legR);

    if (superM < 0.85) {
      rig.legL.getWorldPosition(_hipW);
      _midW.lerpVectors(_hipW, _pedL, 0.45);
      _poleW.set(
        _midW.x - 0.28 - lean * 0.08,
        _midW.y + 0.06,
        _midW.z + 0.32 + absorb * 0.10,
      );
      worldToLocalPoint(rig.pelvis, _poleW, _poleL);
      solveTwoBoneIK(rig.legL, rig.shinL, _legL, rig.thigh, rig.shinLen, _poleL);
      rig.footL.rotation.set(0.35, 0.08, 0.12);
    }
    if (superM < 0.85 && footOffR < 0.85) {
      rig.legR.getWorldPosition(_hipW);
      _midW.lerpVectors(_hipW, _pedR, 0.45);
      _poleW.set(
        _midW.x + 0.28 + lean * 0.08,
        _midW.y + 0.06,
        _midW.z + 0.32 + absorb * 0.10,
      );
      worldToLocalPoint(rig.pelvis, _poleW, _poleR);
      solveTwoBoneIK(rig.legR, rig.shinR, _legR, rig.thigh, rig.shinLen, _poleR);
      rig.footR.rotation.set(0.35, -0.08, -0.12);
    }
  }
}

/**
 * Apply downhill body stance from high-level physics intent.
 * Sets pelvis placement + spine chain; call solveRiderIK after.
 */
export function applyRiderStance(
  rig: RiderRig,
  o: {
    /** chest pitch (absolute; default CHEST_ATTACK) */
    chestPitch?: number;
    /** chest yaw (look/twist) — only applied when provided */
    chestYaw?: number;
    /** weight −1 brake … +1 accel */
    weight?: number;
    /** suspension absorb 0..1 — hips drop */
    absorb?: number;
    /** 0..1 superman body stretch */
    superman?: number;
    /** bike lean (rad) — hips counter-shift */
    lean?: number;
  } = {},
): void {
  const w = o.weight ?? 0;
  const abs = o.absorb ?? 0;
  const superM = o.superman ?? 0;
  const lean = o.lean ?? 0;
  const chestPitch = o.chestPitch ?? CHEST_ATTACK;

  // Hips: butt-back attack over BB; shift with weight / lean / absorb / tricks.
  // Positive pitch = forward lean (+Y tips toward +Z bars).
  // Absorb drops the whole chain so elbows/knees fold via IK — hands/feet stay planted.
  rig.pelvis.position.set(
    PELVIS_REST.x - lean * 0.055,
    PELVIS_REST.y - abs * 0.10 - Math.max(0, -w) * 0.05 + superM * 0.10,
    PELVIS_REST.z + w * 0.12 - superM * 0.50 - abs * 0.02,
  );
  rig.pelvis.rotation.set(
    PELVIS_ATTACK - Math.max(0, -w) * 0.14 + Math.max(0, w) * 0.10 - superM * 0.18 + abs * 0.04,
    lean * 0.10,
    -lean * 0.22,
  );

  const chestYaw = o.chestYaw ?? 0;
  rig.spine.rotation.set(
    SPINE_ATTACK - Math.max(0, -w) * 0.07 + Math.max(0, w) * 0.05 - superM * 0.12 + abs * 0.03,
    chestYaw * 0.38,
    -lean * 0.12,
  );

  rig.torso.rotation.x = chestPitch;
  if (o.chestYaw !== undefined) rig.torso.rotation.y = chestYaw;
  // Counter-rotate shoulders slightly into the lean so the upper body reads as active.
  rig.torso.rotation.z = -lean * 0.08;
  // Neck stays readable: slight counter-yaw toward travel.
  if (rig.neck) {
    rig.neck.rotation.z = lean * 0.06;
    rig.neck.rotation.x = -abs * 0.04 - Math.max(0, w) * 0.03;
  }
}

const _gripL = new THREE.Vector3();
const _gripR = new THREE.Vector3();
const _pedL = new THREE.Vector3();
const _pedR = new THREE.Vector3();
const _torsoL = new THREE.Vector3();
const _torsoR = new THREE.Vector3();
const _legL = new THREE.Vector3();
const _legR = new THREE.Vector3();
const _poleL = new THREE.Vector3();
const _poleR = new THREE.Vector3();
const _ikMat = new THREE.Matrix4();
const _shW = new THREE.Vector3();
const _hipW = new THREE.Vector3();
const _midW = new THREE.Vector3();
const _poleW = new THREE.Vector3();

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
  /** character root (sibling of bike under offset) */
  rider: THREE.Group;
  /** hip bone — legs parent here; primary weight-shift target */
  pelvis: THREE.Group;
  /** mid-spine bone between pelvis and chest */
  spine: THREE.Group;
  /** chest / shoulder bone — arms parent here (alias for historical "torso") */
  torso: THREE.Group;
  neck: THREE.Group;
  /** head group (helmet meshes are children) */
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  foreL: THREE.Group;
  foreR: THREE.Group;
  handL: THREE.Group;
  handR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  shinL: THREE.Group;
  shinR: THREE.Group;
  footL: THREE.Group;
  footR: THREE.Group;
  /** IK targets parented to fork grips / crank pedals */
  gripL: THREE.Object3D;
  gripR: THREE.Object3D;
  pedalL: THREE.Object3D;
  pedalR: THREE.Object3D;
  shadow: THREE.Mesh;
  contactF: THREE.Mesh;
  contactR: THREE.Mesh;
  dirt: DirtHandle;
  upperArm: number;
  lowerArm: number;
  thigh: number;
  shinLen: number;
  crankR: number;
  gripX: number;
  gripY: number;
  gripZ: number;
}

const PIVOT_Y = 0.72;

// =============================================================================
// BIKE GEOMETRY — single source of truth (bike-local, +Z forward, ground y=0)
//
// Neutral side-view layout (meters):
//
//   front contact ──►  y=0, z=+FRONT_Z
//   rear contact  ──►  y=0, z=REAR_Z
//   both axles    ──►  y=WHEEL_R  (same diameter, same height)
//   BB            ──►  low, just aft of mid-wheelbase
//   head tube     ──►  slack DH angle, fork steers from HEAD_B
//   saddle        ──►  on seat post above SEAT_T (reference, not main support)
//
// Hierarchy:
//   bike
//   ├── frame          (static tubes + BB shell + seat)
//   ├── fork           @ HEAD_B  (steer yaw)
//   │   ├── stem/bars/grips
//   │   ├── crown + stanchions
//   │   └── forkLower  (slides along FORK_AXIS)
//   │       └── frontWheel @ FORK_AXLE_LOCAL
//   ├── swingarm       @ BB_POS  (pitch for rear travel)
//   │   ├── chainstays / seatstays / rocker
//   │   └── rearWheel  @ SWING_AXLE
//   ├── shock          (re-aimed each frame between mounts)
//   └── cranks         @ BB_POS
//       ├── L arm → pedal → pedalL anchor
//       └── R arm → pedal → pedalR anchor
// =============================================================================

/**
 * Wheel radius. Must match physics ground contact (root at track height →
 * tyre bottom at local y=0). Sized so the frame/fork read above the tyre —
 * previous 0.36 + short fork put the crown through the front tyre.
 */
export const WHEEL_R = 0.32;

/** Front / rear axle positions in bike-local space. */
export const FRONT_AXLE_POS = new THREE.Vector3(0, WHEEL_R, 0.58);
export const REAR_AXLE_POS = new THREE.Vector3(0, WHEEL_R, -0.60);

/** Bottom-bracket / swingarm pivot. */
export const BB_POS = new THREE.Vector3(0, 0.28, -0.04);

/**
 * Head tube: crown sits CLEAR above the front tyre top (WHEEL_R*2).
 * Long DH fork visual — axle well below the crown, not jammed into it.
 */
export const HEAD_B = new THREE.Vector3(0, 0.78, 0.42);
export const HEAD_T = new THREE.Vector3(0, 1.00, 0.30);

/** Seat tube top — low DH seat; short post above this. */
export const SEAT_T = new THREE.Vector3(0, 0.82, -0.34);

/** Rear axle relative to swingarm pivot (BB). */
export const SWING_AXLE = new THREE.Vector3().subVectors(REAR_AXLE_POS, BB_POS);

/** Front axle relative to fork origin (HEAD_B). */
export const FORK_AXLE_LOCAL = new THREE.Vector3().subVectors(FRONT_AXLE_POS, HEAD_B);

/** Shock mounts: upper on frame, lower on swingarm (local). */
export const SHOCK_UPPER = new THREE.Vector3(0, 0.72, -0.24);
export const SHOCK_LOWER = new THREE.Vector3(0, 0.04, -0.26);
export const SHOCK_BASE_LEN = SHOCK_UPPER.distanceTo(
  new THREE.Vector3().copy(SHOCK_LOWER).add(BB_POS));

/**
 * Unit vector along the fork from crown toward the front axle.
 * Suspension travel slides forkLower along this axis. Must match FORK_AXLE_LOCAL.
 */
export const FORK_AXIS = FORK_AXLE_LOCAL.clone().normalize();

/** Pedal spindle radius from BB (≈170mm crank). */
export const CRANK_R = 0.175;

/** Handlebar grip half-width and local position on the fork (for IK + construction). */
export const GRIP_HALF_W = 0.28;
/** Bars just above head-tube top in fork space (HEAD_B.y + grip.y ≈ 1.0). */
export const GRIP_LOCAL = new THREE.Vector3(0, 0.22, 0.06);

/**
 * Wheel with axle along local X (spins on rotation.x).
 * Tyre + rim + hub + spokes + optional rotor — same diameter both ends.
 */
function makeWheel(
  tyre: THREE.Material, rim: THREE.Material, hub: THREE.Material,
  rotor?: THREE.Material,
): THREE.Mesh {
  const R = WHEEL_R;
  // Outer tyre radius == WHEEL_R so contact is exactly at local y=0.
  const tyreT = 0.045;
  const major = Math.max(0.08, R - tyreT);
  const g = new THREE.TorusGeometry(major, tyreT, 7, 20).rotateY(Math.PI / 2);
  const wheel = new THREE.Mesh(g, tyre);
  const rimM = new THREE.Mesh(
    new THREE.TorusGeometry(major - 0.02, 0.016, 5, 16).rotateY(Math.PI / 2), rim);
  wheel.add(rimM);
  // Subtle dark fill so wheels don't look empty at chase distance
  const fill = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 0.55, R * 0.55, 0.005, 12), tyre);
  fill.rotation.z = Math.PI / 2;
  wheel.add(fill);
  const h = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.12, 8), hub);
  h.rotation.z = Math.PI / 2;
  wheel.add(h);
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.18, 6), rim);
  axle.rotation.z = Math.PI / 2;
  wheel.add(axle);
  for (let i = 0; i < 6; i++) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.012, R * 1.55, 0.012), rim);
    sp.rotation.x = (i / 6) * Math.PI;
    wheel.add(sp);
  }
  if (rotor) {
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(R * 0.42, R * 0.42, 0.008, 14), rotor);
    disc.rotation.z = Math.PI / 2;
    disc.position.x = 0.07;
    wheel.add(disc);
  }
  return wheel;
}

/**
 * Neutral side-view bike audit (no rider). Returns component world positions
 * and pass/fail flags for mechanical coherence. Used by validation scripts.
 */
export function auditBikeGeometry(rig: RiderRig): {
  ok: boolean;
  issues: string[];
  frontAxle: THREE.Vector3;
  rearAxle: THREE.Vector3;
  bb: THREE.Vector3;
  bar: THREE.Vector3;
  saddle: THREE.Vector3;
  pedalL: THREE.Vector3;
  pedalR: THREE.Vector3;
  wheelbase: number;
  frontContactY: number;
  rearContactY: number;
} {
  rig.bike.updateWorldMatrix(true, true);
  const frontAxle = new THREE.Vector3();
  const rearAxle = new THREE.Vector3();
  const bb = new THREE.Vector3();
  const bar = new THREE.Vector3();
  const saddle = new THREE.Vector3();
  const pedalL = new THREE.Vector3();
  const pedalR = new THREE.Vector3();
  rig.frontWheel.getWorldPosition(frontAxle);
  rig.rearWheel.getWorldPosition(rearAxle);
  rig.cranks.getWorldPosition(bb);
  rig.gripL.getWorldPosition(bar);
  // saddle is child of bike — find by walking, or use SEAT_T + offset
  saddle.set(0, SEAT_T.y + 0.08, SEAT_T.z - 0.02);
  rig.bike.localToWorld(saddle);
  rig.pedalL.getWorldPosition(pedalL);
  rig.pedalR.getWorldPosition(pedalR);

  const issues: string[] = [];
  const eps = 0.04;
  if (Math.abs(frontAxle.y - rearAxle.y) > eps) {
    issues.push(`axle height mismatch F=${frontAxle.y.toFixed(3)} R=${rearAxle.y.toFixed(3)}`);
  }
  if (Math.abs(frontAxle.y - WHEEL_R) > eps) {
    issues.push(`front axle not at WHEEL_R (${frontAxle.y.toFixed(3)} vs ${WHEEL_R})`);
  }
  if (Math.abs(rearAxle.y - WHEEL_R) > eps) {
    issues.push(`rear axle not at WHEEL_R (${rearAxle.y.toFixed(3)} vs ${WHEEL_R})`);
  }
  if (Math.abs(frontAxle.x) > eps || Math.abs(rearAxle.x) > eps) {
    issues.push('wheels not on bike centerline');
  }
  const wheelbase = frontAxle.z - rearAxle.z;
  if (wheelbase < 1.05 || wheelbase > 1.45) {
    issues.push(`wheelbase out of DH range: ${wheelbase.toFixed(3)}`);
  }
  if (bb.y < 0.22 || bb.y > 0.42) {
    issues.push(`BB height implausible: ${bb.y.toFixed(3)}`);
  }
  if (bb.z < rearAxle.z || bb.z > frontAxle.z) {
    issues.push('BB not between axles');
  }
  // Grips should be above and forward of BB
  if (bar.y < bb.y + 0.35) issues.push('handlebars too low vs BB');
  if (bar.z < bb.z) issues.push('handlebars behind BB');
  // Pedals near BB radius
  const pedDist = Math.hypot(pedalL.y - bb.y, pedalL.z - bb.z);
  if (Math.abs(pedDist - CRANK_R) > 0.05) {
    issues.push(`L pedal not on crank radius (${pedDist.toFixed(3)} vs ${CRANK_R})`);
  }
  // Fork should put front wheel near FRONT_AXLE_POS in bike space
  const fLocal = frontAxle.clone();
  rig.bike.worldToLocal(fLocal);
  if (fLocal.distanceTo(FRONT_AXLE_POS) > 0.06) {
    issues.push(`front wheel local offset ${fLocal.distanceTo(FRONT_AXLE_POS).toFixed(3)}`);
  }
  const rLocal = rearAxle.clone();
  rig.bike.worldToLocal(rLocal);
  if (rLocal.distanceTo(REAR_AXLE_POS) > 0.06) {
    issues.push(`rear wheel local offset ${rLocal.distanceTo(REAR_AXLE_POS).toFixed(3)}`);
  }

  return {
    ok: issues.length === 0,
    issues,
    frontAxle, rearAxle, bb, bar, saddle, pedalL, pedalR,
    wheelbase,
    frontContactY: frontAxle.y - WHEEL_R,
    rearContactY: rearAxle.y - WHEEL_R,
  };
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

  // =====================================================================
  // BICYCLE — coherent DH MTB hierarchy (see geometry constants above)
  // =====================================================================
  const bike = new THREE.Group();
  bike.name = 'bike';
  offset.add(bike);

  // Local aliases (Vectors for tube()) — never invent independent positions.
  const BB = BB_POS.clone();
  const HB = HEAD_B.clone();
  const HT = HEAD_T.clone();
  const ST = SEAT_T.clone();
  const AX = FORK_AXLE_LOCAL.clone(); // front axle in fork space
  const RA = SWING_AXLE.clone();      // rear axle in swingarm space

  // ---- FRAME (static) -------------------------------------------------
  const frame = new THREE.Group();
  frame.name = 'frame';
  bike.add(frame);

  // Main triangle: down / top / seat + head tube
  const downTube = tube(BB, HB, 0.048, mFrame, 8);
  const topTube = tube(ST, HT, 0.042, mFrame, 8);
  const seatTube = tube(BB, ST, 0.044, mFrame, 8);
  const headTube = tube(HB, HT, 0.055, mDark, 8);
  frame.add(downTube, topTube, seatTube, headTube);
  addOutlineShell(downTube, 1.05);
  addOutlineShell(topTube, 1.05);
  addOutlineShell(seatTube, 1.05);

  // BB shell — the visual hub of the drivetrain
  const bbShell = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 10, 8), mDark);
  bbShell.scale.set(1.35, 1.0, 1.15);
  bbShell.position.copy(BB);
  frame.add(bbShell);

  // Short head-tube gusset so the triangle reads continuous at the crown
  const gusset = tube(
    V(BB.x, BB.y + 0.12, BB.z + 0.18),
    V(HB.x, HB.y - 0.04, HB.z - 0.02),
    0.028, mFrame, 6);
  frame.add(gusset);

  // Short seat post + low DH saddle (not a tall antenna behind the rider)
  const seatPostTop = V(ST.x, ST.y + 0.04, ST.z - 0.01);
  frame.add(tube(ST, seatPostTop, 0.018, mDark, 6));
  const saddle = softPad(0.11, 0.04, 0.22, RIDER_MAT.seat(0x1c1c22), 7);
  saddle.position.copy(seatPostTop);
  saddle.position.y += 0.015;
  saddle.rotation.x = -0.12;
  frame.add(saddle);

  // ---- REAR ASSEMBLY (swingarm) ---------------------------------------
  const swingarm = new THREE.Group();
  swingarm.name = 'swingarm';
  swingarm.position.copy(BB);
  bike.add(swingarm);

  // Dual chainstays (left / right) — main load path BB → rear axle
  const stayY = 0.0;
  [-1, 1].forEach(s => {
    const cs = tube(
      V(s * 0.045, stayY, 0.02),
      V(s * 0.055, RA.y, RA.z),
      0.032, mFrame, 7);
    swingarm.add(cs);
  });
  // Bridge plate near the axle
  const dropout = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.04, 0.10, 3, 6), mDark);
  dropout.rotation.z = Math.PI / 2;
  dropout.position.copy(RA);
  swingarm.add(dropout);

  // Seatstays: rear axle → rocker / shock lower (forms the rear triangle)
  const rockerPos = SHOCK_LOWER.clone();
  [-1, 1].forEach(s => {
    const ss = tube(
      V(s * 0.05, RA.y + 0.02, RA.z + 0.02),
      V(s * 0.04, rockerPos.y + 0.02, rockerPos.z),
      0.026, mFrame, 6);
    swingarm.add(ss);
  });
  // Rocker link (shock lower mount)
  const rocker = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.035, 0.08, 3, 6), mHub);
  rocker.rotation.z = Math.PI / 2;
  rocker.scale.set(1, 1, 1.2);
  rocker.position.copy(rockerPos);
  swingarm.add(rocker);
  // Small brace from pivot toward rocker
  swingarm.add(tube(V(0, 0.01, -0.08), rockerPos.clone(), 0.022, mDark, 5));

  // Rear wheel — parented to swingarm at local axle
  const mRotor = RIDER_MAT.brake(0xb8bcc4);
  const rearWheel = makeWheel(mTyre, mRim, mHub, mRotor);
  rearWheel.name = 'rearWheel';
  rearWheel.position.copy(RA);
  swingarm.add(rearWheel);

  // ---- SHOCK (frame-mounted, re-aimed each frame) ---------------------
  const shock = new THREE.Mesh(
    new THREE.CylinderGeometry(0.042, 0.048, SHOCK_BASE_LEN, 8), mHub);
  shock.name = 'shock';
  {
    const lo = SHOCK_LOWER.clone().add(BB_POS);
    const dir = lo.clone().sub(SHOCK_UPPER);
    const n = dir.length() || 1;
    shock.position.copy(SHOCK_UPPER).addScaledVector(dir, 0.5);
    shock.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), dir.multiplyScalar(1 / n));
  }
  bike.add(shock);
  const shockShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, SHOCK_BASE_LEN * 0.45, 6), mRim);
  shockShaft.position.y = -SHOCK_BASE_LEN * 0.38;
  shock.add(shockShaft);
  // Coil visual (stylized rings)
  const coil = new THREE.Mesh(
    new THREE.TorusGeometry(0.055, 0.012, 4, 10), mRim);
  coil.position.y = SHOCK_BASE_LEN * 0.12;
  shock.add(coil);

  // ---- FRONT ASSEMBLY (fork + bars + front wheel) ---------------------
  const fork = new THREE.Group();
  fork.name = 'fork';
  fork.position.copy(HB);
  bike.add(fork);

  // Crown bridges the steerer to the stanchions
  const crown = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.04, 0.24, 3, 8), mDark);
  crown.rotation.z = Math.PI / 2;
  crown.scale.set(1, 1, 1.2);
  crown.position.set(0, 0.01, 0.01);
  fork.add(crown);

  // Steerer stub up into the head tube / stem
  fork.add(tube(V(0, 0.0, 0), V(0, 0.22, -0.04), 0.028, mDark, 6));

  // Stanchions outside the tyre width; stop well above the tyre carcass so
  // they never read as spears through the front wheel (garage close-up bug).
  const mStanchion = RIDER_MAT.stanchion(0xd6dae0);
  const forkSpread = 0.12; // half-width > tyre section
  const stanchEnd = AX.clone().multiplyScalar(0.42);
  [-1, 1].forEach(s => {
    fork.add(tube(
      V(s * forkSpread, 0.0, 0.0),
      V(s * forkSpread, stanchEnd.y, stanchEnd.z),
      0.022, mStanchion, 6));
  });

  // Stem + wide DH bar
  const gripX = GRIP_HALF_W;
  const gripY = GRIP_LOCAL.y;
  const gripZ = GRIP_LOCAL.z;
  fork.add(tube(V(0, 0.18, -0.02), V(0, gripY, gripZ - 0.02), 0.024, mDark, 6));
  const bar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, gripX * 2 + 0.10, 8), mFrame);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, gripY, gripZ);
  fork.add(bar);
  [-1, 1].forEach(s => {
    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.030, 0.030, 0.11, 8), mHub);
    grip.rotation.z = Math.PI / 2;
    grip.position.set(s * gripX, gripY, gripZ);
    fork.add(grip);
  });
  const gripL = new THREE.Object3D();
  gripL.name = 'gripL';
  gripL.position.set(-gripX, gripY, gripZ);
  fork.add(gripL);
  const gripR = new THREE.Object3D();
  gripR.name = 'gripR';
  gripR.position.set(gripX, gripY, gripZ);
  fork.add(gripR);

  // Small number plate — not a floating billboard
  const plate = softPad(0.16, 0.012, 0.12, mJersey, 5);
  plate.position.set(0, gripY + 0.05, gripZ - 0.01);
  plate.rotation.x = 0.22;
  fork.add(plate);

  // Telescoping lowers + front wheel (compress along FORK_AXIS)
  const forkLower = new THREE.Group();
  forkLower.name = 'forkLower';
  fork.add(forkLower);
  const lowerStart = AX.clone().multiplyScalar(0.38);
  [-1, 1].forEach(s => {
    forkLower.add(tube(
      V(s * forkSpread, lowerStart.y, lowerStart.z),
      V(s * forkSpread, AX.y, AX.z),
      0.032, mDark, 6));
  });
  // Arch above the tyre, not through it
  const arch = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.026, 0.12, 3, 6), mDark);
  arch.rotation.z = Math.PI / 2;
  arch.position.copy(AX.clone().multiplyScalar(0.55));
  forkLower.add(arch);

  const frontWheel = makeWheel(mTyre, mRim, mHub, mRotor);
  frontWheel.name = 'frontWheel';
  frontWheel.position.copy(AX);
  forkLower.add(frontWheel);

  // ---- DRIVETRAIN -----------------------------------------------------
  const cranks = new THREE.Group();
  cranks.name = 'cranks';
  cranks.position.copy(BB);
  bike.add(cranks);

  // Chainring at BB (sits on bike, not on rotating crank group — OK visually)
  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.14, 0.018, 14), mHub);
  ring.rotation.z = Math.PI / 2;
  ring.position.copy(BB);
  bike.add(ring);
  // Small chainline: top + bottom runs BB → rear hub (decorative, parented to frame)
  const mChain = RIDER_MAT.chain(0x2a2a30);
  const chainTop = tube(
    V(0.08, BB.y + 0.10, BB.z - 0.02),
    V(0.08, REAR_AXLE_POS.y + 0.08, REAR_AXLE_POS.z + 0.04),
    0.012, mChain, 4);
  frame.add(chainTop);
  const chainBot = tube(
    V(0.08, BB.y - 0.10, BB.z - 0.02),
    V(0.08, REAR_AXLE_POS.y - 0.06, REAR_AXLE_POS.z + 0.04),
    0.012, mChain, 4);
  frame.add(chainBot);

  const crankR = CRANK_R;
  let pedalL!: THREE.Object3D;
  let pedalR!: THREE.Object3D;
  [-1, 1].forEach(s => {
    const holder = new THREE.Group();
    // Opposing crank arms: right arm at 0 (pedal at +Y), left at π
    holder.rotation.x = s > 0 ? 0 : Math.PI;
    holder.position.set(s * 0.095, 0, 0);
    const armLen = crankR;
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.018, armLen, 7), mDark);
    arm.position.set(0, armLen * 0.5, 0);
    holder.add(arm);
    // Pedal platform
    const ped = softPad(0.085, 0.018, 0.12, mHub, 5);
    ped.position.set(0, armLen, 0);
    holder.add(ped);
    // Foot IK anchor — slightly above pedal top
    const anchor = new THREE.Object3D();
    anchor.position.set(0, armLen + 0.012, 0);
    holder.add(anchor);
    if (s < 0) { pedalL = anchor; pedalL.name = 'pedalL'; }
    else { pedalR = anchor; pedalR.name = 'pedalR'; }
    cranks.add(holder);
  });

  // =====================================================================
  // RIDER SKELETON
  //
  //   rider
  //    └── pelvis
  //         ├── hips mesh
  //         ├── spine
  //         │    └── torso (chest)
  //         │         ├── chest / pack / gear meshes
  //         │         ├── neck → head (helmet group)
  //         │         ├── armL → foreL → handL
  //         │         └── armR → foreR → handR
  //         ├── legL → shinL → footL
  //         └── legR → shinR → footR
  //
  // All limb motion is skeletal. Hands/feet stick to bike anchors via IK.
  // =====================================================================
  const rider = new THREE.Group();
  offset.add(rider);

  // Stylized athletic DH proportions (~1.72m standing, compressed into attack).
  // Arms sized for new bar height (grip world ~ y=1.0); surplus keeps elbows bent
  // under brake hang-back / steer extremes. Legs reach pedals with athletic bend.
  const S = B.scale;
  // Limb lengths for bent IK on grips/pedals; thickness so garage close-ups
  // don't read as stick-figure limbs with floating marble joints.
  const upperArm = 0.30 * S;
  const lowerArm = 0.26 * S;
  const thigh = 0.38 * B.legs * S;
  const shinLen = 0.34 * B.legs * S;
  const armR0 = 0.058 * B.limbs * S;
  const legR0 = 0.066 * B.limbs * S;
  const hipW = 0.10 * B.bulk * S;
  const shW = 0.155 * B.shoulders * S;

  // ---- PELVIS ---------------------------------------------------------
  const pelvis = new THREE.Group();
  pelvis.position.set(PELVIS_REST.x, PELVIS_REST.y, PELVIS_REST.z);
  pelvis.rotation.x = PELVIS_ATTACK;
  rider.add(pelvis);

  // Hips: one mass, not stacked spheres
  const hipsMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.095 * B.bulk * S, 10, 8), mPants);
  hipsMesh.scale.set(1.45, 0.85, 1.05);
  hipsMesh.position.set(0, 0.01, 0.01);
  pelvis.add(hipsMesh);
  addOutlineShell(hipsMesh, 1.06);

  // ---- SPINE → CHEST --------------------------------------------------
  const spine = new THREE.Group();
  // Longer spine links so the helmet rises clear of the bars after attack pitch.
  spine.position.set(0, 0.12 * S, 0.02);
  spine.rotation.x = SPINE_ATTACK;
  pelvis.add(spine);

  const midBack = new THREE.Mesh(
    new THREE.SphereGeometry(0.07 * B.bulk * S, 8, 6), mJersey);
  midBack.scale.set(1.15 * B.shoulders, 0.85, 0.9);
  midBack.position.set(0, 0.06 * S, 0.0);
  spine.add(midBack);

  const torso = new THREE.Group(); // chest bone
  torso.position.set(0, 0.16 * S, 0.03);
  torso.rotation.x = CHEST_ATTACK;
  spine.add(torso);

  // Athletic torso: capsule + shoulder shelf (not a fridge box).
  const chestMesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.10 * B.bulk * S, 0.22 * S, 5, 12), mJersey);
  chestMesh.scale.set(1.22 * B.shoulders, 1, 0.92);
  chestMesh.position.set(0, 0.14 * S, 0.02);
  torso.add(chestMesh);
  addOutlineShell(chestMesh, 1.08);

  const waist = new THREE.Mesh(
    new THREE.SphereGeometry(0.085 * B.bulk * S, 10, 8), mJersey);
  waist.scale.set(1.18 * B.shoulders, 0.65, 0.88);
  waist.position.set(0, 0.01 * S, 0.0);
  torso.add(waist);

  // Shoulders — joint origins for arms (must match mkArm placement)
  const shoulderY = 0.24 * S;
  const shoulderZ = 0.02;
  [-1, 1].forEach(s => {
    const sh = new THREE.Mesh(
      new THREE.SphereGeometry(0.055 * B.limbs * S, 8, 6), mJersey);
    sh.scale.set(1.15, 0.8, 1.05);
    sh.position.set(s * shW, shoulderY, shoulderZ);
    torso.add(sh);
  });

  if (B.armour > 0.4) {
    [-1, 1].forEach((s, i) => {
      if (B.asymmetric && i === 0) return;
      const pad = new THREE.Mesh(
        new THREE.SphereGeometry(0.052 * B.shoulders * S, 8, 6), mArmour);
      pad.scale.set(1.2, 0.7, 1.25);
      pad.position.set(s * shW * 0.92, shoulderY - 0.02 * S, shoulderZ + 0.04);
      torso.add(pad);
    });
  }

  const numPlate = softPad(0.15 * S, 0.015, 0.11 * S, RIDER_MAT.helmet(0xf5f5f5), 6);
  numPlate.position.set(0, 0.14 * S, 0.13 * S);
  numPlate.rotation.x = 0.15;
  torso.add(numPlate);

  const pack = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.048 * B.pack * S, 0.10 * B.pack * S, 3, 7),
    RIDER_MAT.pants(c.accent));
  pack.scale.set(1.05, 1, 0.55);
  pack.position.set(0, 0.12 * S, -0.08 * S);
  torso.add(pack);
  if (B.armour > 0.7) {
    for (let i = 0; i < 3; i++) {
      const rib = softPad(0.15 * B.pack * S, 0.028 * S, 0.03 * S, mArmour, 5);
      rib.position.set(0, 0.06 * S + i * 0.055 * S, -0.11 * S);
      torso.add(rib);
    }
  }

  if (B.brace) {
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.095 * S, 0.028 * S, 5, 14), RIDER_MAT.armour(c.accent));
    collar.position.set(0, shoulderY + 0.02 * S, 0.04);
    collar.rotation.x = Math.PI / 2 - 0.28;
    torso.add(collar);
  }

  // ---- NECK → HEAD ----------------------------------------------------
  const neck = new THREE.Group();
  neck.position.set(0, shoulderY + 0.04 * S, 0.04);
  torso.add(neck);
  const neckMesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.032 * S, 0.04 * S, 3, 7), mSkin);
  neckMesh.position.y = 0.03 * S;
  neck.add(neckMesh);

  // Full-face DH helmet — sits above the bar plane in rest attack stance
  const head = new THREE.Group();
  head.position.set(0, 0.13 * S, 0.03 * S);
  neck.add(head);

  // Head ≈ 1/8 body — previous 0.108 ballooned in garage close-up
  const H = 0.092 * B.helmet * S;
  const helm = new THREE.Mesh(new THREE.SphereGeometry(H, 16, 14), mHelmet);
  switch (B.lid) {
    case 'aero':  helm.scale.set(0.92, 0.92, 1.24); break;
    case 'boxy':  helm.scale.set(1.08, 0.96, 1.06); break;
    case 'domed': helm.scale.set(1.05, 1.10, 1.05); break;
    case 'crest': helm.scale.set(1.0, 1.03, 1.10); break;
    default:      helm.scale.set(1.0, 0.96, 1.08);
  }
  head.add(helm);
  addOutlineShell(helm, 1.08);

  // chin bar — continuous full-face shell, not a detached half-sphere
  const chin = new THREE.Mesh(
    new THREE.SphereGeometry(H * 0.72, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), mHelmet);
  chin.scale.set(1.05, 0.72, 1.18);
  chin.position.set(0, -H * 0.48, H * 0.28);
  head.add(chin);
  // face void
  const faceCut = new THREE.Mesh(
    new THREE.SphereGeometry(H * 0.48, 8, 6), RIDER_MAT.glove(0x0c0c12));
  faceCut.position.set(0, -H * 0.02, H * 0.7);
  faceCut.scale.set(0.9, 0.62, 0.3);
  head.add(faceCut);
  // visor peak — soft pad, not a brick
  const visor = softPad(H * 1.5, H * 0.16, H * 0.7, RIDER_MAT.helmet(c.accent), 6);
  visor.position.set(0, H * 0.4, H * 0.45);
  visor.rotation.x = -0.35;
  head.add(visor);
  // goggle strap wraps the shell + tinted lens
  const goggles = new THREE.Mesh(
    new THREE.TorusGeometry(H * 0.48, H * 0.09, 5, 14, Math.PI * 1.15),
    RIDER_MAT.glove(0x101018));
  goggles.position.set(0, H * 0.03, H * 0.48);
  goggles.rotation.x = Math.PI / 2;
  goggles.rotation.z = Math.PI;
  head.add(goggles);
  const lens = softPad(H * 1.0, H * 0.32, H * 0.08, RIDER_MAT.lens(0x66e0ff), 6);
  lens.position.set(0, H * 0.02, H * 0.7);
  head.add(lens);

  if (B.lid === 'aero') {
    const tail = new THREE.Mesh(new THREE.ConeGeometry(H * 0.45, H * 1.1, 7), mHelmet);
    tail.position.set(0, 0, -H * 0.95);
    tail.rotation.x = -Math.PI / 2;
    head.add(tail);
  }
  if (B.lid === 'crest') {
    const fin = softPad(H * 0.1, H * 0.5, H * 1.15, RIDER_MAT.helmet(c.accent), 5);
    fin.position.set(0, H * 0.68, -H * 0.04);
    head.add(fin);
  }
  if (B.lid === 'boxy') {
    const jaw = new THREE.Mesh(
      new THREE.SphereGeometry(H * 0.7, 10, 8), mHelmet);
    jaw.scale.set(1.2, 0.55, 1.05);
    jaw.position.set(0, -H * 0.32, H * 0.1);
    head.add(jaw);
  }

  // ---- ARMS (parented to chest) ---------------------------------------
  const mkArm = (s: number) => {
    const upper = new THREE.Group();
    // Match shoulder shelf — slightly forward for bar reach
    upper.position.set(s * shW, shoulderY, shoulderZ + 0.01);
    torso.add(upper);

    // Continuous arm: boneSeg end-caps replace separate joint marbles
    upper.add(boneSeg(armR0 * 1.12, upperArm, mJersey, 7, armR0 * 0.92));

    const fore = new THREE.Group();
    fore.position.set(0, upperArm, 0);
    upper.add(fore);
    // Sleeve cuff instead of floating elbow marble
    if (B.pads) {
      const cuff = new THREE.Mesh(
        new THREE.CylinderGeometry(armR0 * 1.05, armR0 * 1.15, 0.04 * S, 7), mArmour);
      cuff.position.y = 0.02;
      fore.add(cuff);
    }
    fore.add(boneSeg(armR0 * 0.95, lowerArm, mSkin, 7, armR0 * 0.78));

    const hand = new THREE.Group();
    hand.position.set(0, lowerArm, 0);
    fore.add(hand);
    // Compact glove — not a pink balloon on the bar
    const glove = new THREE.Mesh(
      new THREE.SphereGeometry(0.032 * B.limbs * S, 8, 6), mGlove);
    glove.scale.set(1.35, 0.75, 1.05);
    glove.position.set(0, 0.02, 0.005);
    hand.add(glove);
    const fingers = softPad(0.045 * B.limbs * S, 0.022 * B.limbs * S, 0.04 * S, mGlove, 4);
    fingers.position.set(0, 0.038, 0.01);
    fingers.rotation.x = 0.35;
    hand.add(fingers);

    return { upper, fore, hand };
  };
  const armLp = mkArm(-1), armRp = mkArm(1);
  const armL = armLp.upper, armR = armRp.upper;
  const foreL = armLp.fore, foreR = armRp.fore;
  const handL = armLp.hand, handR = armRp.hand;

  // ---- LEGS (parented to pelvis) --------------------------------------
  const mkLeg = (s: number) => {
    const upper = new THREE.Group();
    // hip sockets slightly out — knees track outside the downtube
    upper.position.set(s * hipW, -0.015, 0.015);
    pelvis.add(upper);

    upper.add(boneSeg(legR0 * 1.15, thigh, mPants, 7, legR0 * 0.95));

    const shin = new THREE.Group();
    shin.position.set(0, thigh, 0);
    upper.add(shin);
    if (B.pads) {
      const cuff = new THREE.Mesh(
        new THREE.CylinderGeometry(legR0 * 1.05, legR0 * 1.18, 0.05 * S, 7), mArmour);
      cuff.position.set(0, 0.02, 0.01);
      shin.add(cuff);
    }
    shin.add(boneSeg(legR0 * 0.95, shinLen, mPants, 7, legR0 * 0.78));

    const foot = new THREE.Group();
    foot.position.set(0, shinLen, 0);
    shin.add(foot);
    // Compact MTB shoe
    const shoe = softPad(0.06 * B.limbs * S, 0.04 * B.limbs * S, 0.13 * S, mBoot, 6);
    shoe.position.set(0, 0.006, 0.038);
    foot.add(shoe);
    const sole = softPad(0.055 * B.limbs * S, 0.012, 0.12 * S, RIDER_MAT.boot(c.accent), 4);
    sole.position.set(0, -0.014, 0.035);
    foot.add(sole);

    return { upper, shin, foot };
  };
  const legLp = mkLeg(-1), legRp = mkLeg(1);
  const legL = legLp.upper, legR = legRp.upper;
  const shinL = legLp.shin, shinR = legRp.shin;
  const footL = legLp.foot, footR = legRp.foot;

  // Soft contact shadow — elongated bike silhouette under the chassis.
  // Soft falloff (no hard edge) so the bike reads as planted without
  // looking like a flat decal. Higher res so the edge doesn't stair-step.
  const shadowTex = (() => {
    const S = 128;
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g2 = cv.getContext('2d')!;
    // outer soft plate
    const outer = g2.createRadialGradient(S * 0.5, S * 0.52, 0, S * 0.5, S * 0.52, S * 0.48);
    outer.addColorStop(0, 'rgba(0,0,0,0.48)');
    outer.addColorStop(0.45, 'rgba(0,0,0,0.22)');
    outer.addColorStop(0.78, 'rgba(0,0,0,0.06)');
    outer.addColorStop(1, 'rgba(0,0,0,0)');
    g2.fillStyle = outer; g2.fillRect(0, 0, S, S);
    // tighter core under the frame
    const core = g2.createRadialGradient(S * 0.5, S * 0.5, 0, S * 0.5, S * 0.5, S * 0.28);
    core.addColorStop(0, 'rgba(0,0,0,0.55)');
    core.addColorStop(0.6, 'rgba(0,0,0,0.18)');
    core.addColorStop(1, 'rgba(0,0,0,0)');
    g2.fillStyle = core; g2.fillRect(0, 0, S, S);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 3.4),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.88 })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = 2;

  // Per-tyre contact patches — elliptical, soft edge, plant the wheels.
  const contactTex = (() => {
    const S = 128;
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g2 = cv.getContext('2d')!;
    // squash into a tyre-shaped ellipse via gradient + oval fill
    g2.save();
    g2.translate(S / 2, S / 2);
    g2.scale(1.0, 1.35);
    const grd = g2.createRadialGradient(0, 0, 0, 0, 0, S * 0.48);
    grd.addColorStop(0, 'rgba(0,0,0,0.78)');
    grd.addColorStop(0.28, 'rgba(0,0,0,0.42)');
    grd.addColorStop(0.62, 'rgba(0,0,0,0.12)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g2.fillStyle = grd;
    g2.beginPath(); g2.arc(0, 0, S * 0.48, 0, Math.PI * 2); g2.fill();
    g2.restore();
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const mkContact = () => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(0.72, 1.05),
      new THREE.MeshBasicMaterial({
        map: contactTex, transparent: true, depthWrite: false, opacity: 0.78,
      }));
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 3;
    return m;
  };
  const contactF = mkContact(), contactR = mkContact();

  root.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = false; o.receiveShadow = false; } });

  const rig: RiderRig = {
    root, lean, body, spin, flip, bike, fork, forkLower, swingarm, shock,
    frontWheel, rearWheel, cranks,
    rider, pelvis, spine, torso, neck, head,
    armL, armR, foreL, foreR, handL, handR,
    legL, legR, shinL, shinR, footL, footR,
    gripL, gripR, pedalL, pedalR,
    shadow, contactF, contactR,
    upperArm, lowerArm, thigh, shinLen, crankR, gripX, gripY, gripZ,
    dirt: attachDirt(root),
  };

  // Rest pose: level pedals (horizontal cranks) + plant hands/feet via IK
  cranks.rotation.x = Math.PI * 0.5;
  applyRiderStance(rig, {});
  solveRiderIK(rig, {});
  return rig;
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
