// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: garage turntable
// A self-contained studio scene: one bike + rider on a rotating plinth, lit
// like a product shot, with scrubbable animation previews.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import {
  createRider, getBuild, shapeForBike, solveRiderIK, applyRiderStance, type RiderRig,
  CHEST_ATTACK, BB_POS, SHOCK_UPPER, SHOCK_LOWER, SHOCK_BASE_LEN, FORK_AXIS,
} from './models';
import { type Loadout, getBike, loadoutColors, RIDER_BUILD_OF } from './garage';
import { clamp, clamp01, damp, TAU } from './core';

/** Chest pitch on top of pelvis/spine attack lean (models.ts). */
const ATTACK_PITCH = CHEST_ATTACK;

export type PreviewAnim =
  | 'idle' | 'pedal' | 'attack' | 'bonk' | 'whip' | 'flip' | 'superbonk' | 'land';

export const PREVIEW_LIST: { id: PreviewAnim; label: string }[] = [
  { id: 'idle', label: 'IDLE' },
  { id: 'pedal', label: 'PEDAL' },
  { id: 'attack', label: 'ATTACK' },
  { id: 'land', label: 'COMPRESS' },
  { id: 'bonk', label: 'BONK' },
  { id: 'whip', label: 'WHIP' },
  { id: 'flip', label: 'BONKFLIP' },
  { id: 'superbonk', label: 'SUPERBONK' },
];

export class GarageScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private turntable = new THREE.Group();
  private rig: RiderRig | null = null;
  private raf = 0;
  private t = 0;
  /** Start in 3/4 view so fork, bars, and rear triangle all read on open. */
  private spin = 0.72;
  private spinVel = 0.28;
  private dragging = false;
  private lastX = 0;
  private lastMoveT = 0;
  private host: HTMLElement;
  private anim: PreviewAnim = 'idle';
  private animT = 0;
  private crank = Math.PI * 0.5; // level pedals at rest
  private susp = 0;
  private suspV = 0;
  // Framed on full bike + rider silhouette (wheels on plinth → helmet).
  private camDist = 4.6;
  private camHeight = 1.35;
  private targetDist = 4.6;
  private ro: ResizeObserver | null = null;
  reducedMotion = false;

  constructor(host: HTMLElement) {
    this.host = host;
    const w = host.clientWidth || 640, h = host.clientHeight || 420;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Match race scene: Cineon holds arcade colour; ACES desaturates toward
    // photoreal product shots and made the garage feel like a different game.
    this.renderer.toneMapping = THREE.CineonToneMapping;
    this.renderer.toneMappingExposure = 1.24;
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;cursor:grab';
    host.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 90);
    this.scene.add(this.turntable);
    this.buildStudio();

    this.renderer.domElement.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove, { passive: false });
    window.addEventListener('pointerup', this.onUp);
    this.renderer.domElement.addEventListener('wheel', this.onWheel, { passive: false });

    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(host);
    }
    this.loop();
  }

  // -- studio -------------------------------------------------------------
  private buildStudio() {
    // Golden-hour key + cool sky hemi — same temperature as the race
    // Cineon setup so garage and track share one material response.
    this.scene.add(new THREE.HemisphereLight(0xa8ccff, 0x8a6438, 1.05));
    const key = new THREE.DirectionalLight(0xffd9a0, 2.4);
    key.position.set(2.8, 4.2, 3.0); // low warm raking, ~golden hour
    this.scene.add(key);
    const rimA = new THREE.DirectionalLight(0x9ec4ff, 1.15);
    rimA.position.set(-4.5, 1.6, -2.4);
    this.scene.add(rimA);
    const rimB = new THREE.DirectionalLight(0xff2e88, 0.95);
    rimB.position.set(3.6, 0.9, -3.8);
    this.scene.add(rimB);
    const fill = new THREE.DirectionalLight(0xfff0dc, 0.55);
    fill.position.set(-1.5, 2.2, 4.2);
    this.scene.add(fill);
    // warm dirt bounce so undersides match race lighting
    const bounce = new THREE.DirectionalLight(0xffb878, 0.38);
    bounce.position.set(0.2, -1, 0.1);
    this.scene.add(bounce);

    // plinth
    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(2.05, 2.25, 0.20, 56),
      new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.55, metalness: 0.35 }),
    );
    plinth.position.y = -0.10;
    this.scene.add(plinth);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.06, 0.028, 8, 72),
      new THREE.MeshBasicMaterial({ color: 0xffd400 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.008;
    this.scene.add(ring);

    // tick marks that make the rotation readable
    const tickMat = new THREE.MeshBasicMaterial({ color: 0x2fe6c8 });
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.012, i % 6 === 0 ? 0.22 : 0.11), tickMat);
      tick.position.set(Math.cos(a) * 1.86, 0.012, Math.sin(a) * 1.86);
      tick.rotation.y = -a;
      this.scene.add(tick);
    }

    // floor glow
    const glowTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d')!;
      const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grd.addColorStop(0, 'rgba(90,220,255,0.30)');
      grd.addColorStop(0.5, 'rgba(60,120,200,0.10)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 9),
      new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.002;
    this.scene.add(glow);

    // contact shadow under the bike
    const shTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d')!;
      const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grd.addColorStop(0, 'rgba(0,0,0,0.72)');
      grd.addColorStop(0.55, 'rgba(0,0,0,0.28)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const sh = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 2.0),
      new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false }),
    );
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.014;
    this.turntable.add(sh);
  }

  // -- content ------------------------------------------------------------
  setLoadout(l: Loadout) {
    if (this.rig) {
      this.turntable.remove(this.rig.root);
      // Geometry only — RIDER_MAT materials share cached maps; disposing them
      // would untexture every subsequent preview (same rule as race applyLoadout).
      this.rig.root.traverse(o => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      this.rig = null;
    }
    const bike = getBike(l.bike);
    const rig = createRider(
      loadoutColors(l),
      getBuild(RIDER_BUILD_OF[l.rider] ?? 'allround'),
      shapeForBike(bike.id, bike.tubeScale));
    // Match race: clamp wheel scale so tyres stay planted on the plinth and
    // inside the fork. Scaling rig.bike would desync grips/pedals from the rider.
    const ws = clamp(bike.wheelScale, 0.96, 1.06);
    rig.frontWheel.scale.setScalar(ws);
    rig.rearWheel.scale.setScalar(ws);
    rig.shadow.visible = false;
    rig.contactF.visible = false;
    rig.contactR.visible = false;
    // Plant contact at y=0: root sits so both tyres kiss the plinth.
    rig.root.position.y = 0;
    this.turntable.add(rig.root);
    this.rig = rig;
    // Level pedals immediately for this preview
    this.crank = Math.PI * 0.5;
  }

  setAnim(a: PreviewAnim) {
    this.anim = a;
    this.animT = 0;
    if (a === 'land') { this.suspV = -9; }
  }

  getAnim() { return this.anim; }

  // -- interaction --------------------------------------------------------
  private onDown = (e: PointerEvent) => {
    e.preventDefault();
    this.dragging = true;
    this.lastX = e.clientX;
    this.lastMoveT = performance.now();
    this.renderer.domElement.style.cursor = 'grabbing';
  };
  private onMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    e.preventDefault();
    const dx = e.clientX - this.lastX;
    this.lastX = e.clientX;
    const now = performance.now();
    const dt = Math.max(1, now - this.lastMoveT);
    this.lastMoveT = now;
    this.spin += dx * 0.011;
    // carry momentum when released
    this.spinVel = clamp((dx * 0.011) / (dt / 1000), -14, 14);
  };
  private onUp = () => {
    if (!this.dragging) return;
    this.dragging = false;
    this.renderer.domElement.style.cursor = 'grab';
  };
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.targetDist = clamp(this.targetDist + e.deltaY * 0.0035, 2.9, 6.4);
  };

  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (w < 2 || h < 2) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // -- animation ----------------------------------------------------------
  private poseRig(dt: number) {
    const rig = this.rig;
    if (!rig) return;
    this.animT += dt;
    const A = this.anim;
    const T = this.animT;

    // reset the parts every frame so previews never bleed into each other
    rig.lean.rotation.set(0, 0, 0);
    rig.body.rotation.set(0, 0, 0);
    rig.body.position.set(0, 0, 0);
    rig.spin.rotation.set(0, 0, 0);
    rig.flip.rotation.set(0, 0, 0);
    rig.fork.rotation.y = 0;
    rig.rider.position.set(0, 0, 0);
    rig.head.rotation.set(0, 0, 0);

    // --- suspension spring (shared by all previews)
    let suspTarget = 0;
    if (A === 'attack') suspTarget = -0.10;
    if (A === 'pedal') suspTarget = -0.03;
    this.suspV += (-(this.susp - suspTarget) * 210 - this.suspV * 19) * dt;
    this.susp += this.suspV * dt;
    this.susp = clamp(this.susp, -0.42, 0.28);
    if (A === 'land' && T > 1.6) { this.animT = 0; this.suspV = -9; }

    // --- drivetrain
    const pedalling = A === 'pedal' ? 1 : 0;
    if (pedalling) this.crank += 7.2 * dt;
    else this.crank = damp(this.crank, Math.round((this.crank - Math.PI * 0.5) / Math.PI) * Math.PI + Math.PI * 0.5, 7, dt);
    rig.cranks.rotation.x = this.crank;

    // --- suspension visuals
    const comp = -this.susp;
    const travel = clamp(comp * 0.5, -0.035, 0.13);
    rig.forkLower.position.copy(FORK_AXIS).multiplyScalar(-travel);
    const swing = clamp(comp * 0.38, -0.03, 0.15);
    rig.swingarm.rotation.x = swing;
    _v1.copy(SHOCK_LOWER).applyAxisAngle(_xAxis, swing).add(BB_POS);
    _v2.subVectors(_v1, SHOCK_UPPER);
    const len = _v2.length() || SHOCK_BASE_LEN;
    rig.shock.position.copy(SHOCK_UPPER).addScaledVector(_v2, 0.5);
    rig.shock.quaternion.setFromUnitVectors(_yAxis, _v2.divideScalar(len));
    rig.shock.scale.y = len / SHOCK_BASE_LEN;

    rig.body.position.y = this.susp * 0.35;

    // --- per-preview posing via skeletal stance + anchored IK
    const breathe = Math.sin(this.t * 1.7) * 0.02;
    let bonkArm = 0;
    let superM = 0;
    let absorb = clamp(-this.susp * 1.4, 0, 0.65);
    let weight = 0;
    let chestPitch = ATTACK_PITCH;
    let chestYaw = 0;
    let leanAmt = 0;
    switch (A) {
      case 'idle': {
        rig.body.rotation.x = breathe;
        rig.head.rotation.y = Math.sin(this.t * 0.55) * 0.34;
        chestYaw = Math.sin(this.t * 0.5) * 0.06;
        const roll = this.t * 0.9;
        rig.frontWheel.rotation.x = roll;
        rig.rearWheel.rotation.x = roll;
        break;
      }
      case 'pedal': {
        const roll = this.t * 7;
        rig.frontWheel.rotation.x = roll;
        rig.rearWheel.rotation.x = roll;
        leanAmt = Math.sin(this.crank) * 0.07;
        rig.lean.rotation.z = leanAmt;
        chestPitch = ATTACK_PITCH + 0.05;
        weight = 0.45;
        rig.head.rotation.x = -0.08;
        break;
      }
      case 'attack': {
        // tuck deeper over the bars
        chestPitch = ATTACK_PITCH + 0.10;
        weight = 0.55;
        absorb = Math.max(absorb, 0.25);
        rig.head.rotation.x = -0.12;
        rig.head.rotation.y = Math.sin(this.t * 0.8) * 0.18;
        const roll = this.t * 11;
        rig.frontWheel.rotation.x = roll;
        rig.rearWheel.rotation.x = roll;
        leanAmt = Math.sin(this.t * 1.4) * 0.10;
        rig.lean.rotation.z = leanAmt;
        break;
      }
      case 'land': {
        const k = clamp01(T / 1.6);
        // compress: more fold on impact, recover to attack
        chestPitch = ATTACK_PITCH + 0.12 * (1 - k);
        weight = -0.35 * (1 - k);
        absorb = Math.max(absorb, 0.45 * (1 - k));
        rig.head.rotation.x = -0.12;
        const roll = this.t * 9;
        rig.frontWheel.rotation.x = roll;
        rig.rearWheel.rotation.x = roll;
        break;
      }
      case 'bonk': {
        const cyc = T % 1.5;
        const k = clamp01(cyc / 0.42);
        const swingAmt = Math.sin(k * Math.PI) * 1.55;
        bonkArm = 1;
        chestYaw = swingAmt * 0.32;
        leanAmt = -swingAmt * 0.16;
        rig.lean.rotation.z = leanAmt;
        rig.head.rotation.y = -swingAmt * 0.4;
        const roll = this.t * 8;
        rig.frontWheel.rotation.x = roll;
        rig.rearWheel.rotation.x = roll;
        break;
      }
      case 'whip': {
        const cyc = (T % 2.4) / 2.4;
        const e = Math.sin(cyc * Math.PI);
        rig.spin.rotation.y = e * TAU;
        leanAmt = -e * 0.55;
        rig.lean.rotation.z = leanAmt;
        rig.body.rotation.x = -0.12 - e * 0.1;
        rig.body.position.y += 0.35 * Math.sin(cyc * Math.PI);
        rig.head.rotation.y = e * 0.6;
        break;
      }
      case 'flip': {
        const cyc = (T % 2.6) / 2.6;
        rig.flip.rotation.x = -cyc * TAU;
        rig.body.position.y += 0.55 * Math.sin(cyc * Math.PI);
        chestPitch = ATTACK_PITCH + 0.12;
        absorb = Math.max(absorb, 0.2);
        break;
      }
      case 'superbonk': {
        const cyc = (T % 2.8) / 2.8;
        const ext = Math.sin(clamp01((cyc - 0.12) / 0.5) * Math.PI);
        superM = ext;
        rig.body.position.y += 0.5 * Math.sin(cyc * Math.PI);
        // flatten out of attack as the body extends behind the bike
        chestPitch = ATTACK_PITCH - ext * 0.22;
        rig.head.rotation.x = -ext * 0.3;
        rig.body.rotation.x = -0.16;
        break;
      }
    }

    applyRiderStance(rig, {
      chestPitch,
      chestYaw,
      weight,
      absorb,
      superman: superM,
      lean: leanAmt,
    });
    solveRiderIK(rig, {
      bonkArm: bonkArm || undefined,
      superman: superM,
      lockLegs: superM > 0.85,
      absorb,
      lean: leanAmt,
    });
    if (bonkArm !== 0) {
      const cyc = T % 1.5;
      const k = clamp01(cyc / 0.42);
      const swingAmt = Math.sin(k * Math.PI) * 1.55;
      rig.armR.rotation.set(-0.2, swingAmt * 0.6, -swingAmt);
      rig.foreR.rotation.set(0, 0, 0);
    }
    if (superM > 0.85) {
      rig.legL.rotation.set(superM * 1.2, 0, 0);
      rig.legR.rotation.set(superM * 1.2, 0, 0);
      rig.shinL.rotation.set(-superM * 0.15, 0, 0);
      rig.shinR.rotation.set(-superM * 0.15, 0, 0);
    }
  }

  // -- loop ---------------------------------------------------------------
  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clockDelta());
    this.t += dt;

    if (!this.dragging) {
      const idle = this.reducedMotion ? 0.12 : 0.35;
      this.spinVel = damp(this.spinVel, idle, 1.6, dt);
      this.spin += this.spinVel * dt;
    }
    this.turntable.rotation.y = this.spin;

    this.poseRig(dt);

    this.camDist = damp(this.camDist, this.targetDist, 6, dt);
    const bob = this.reducedMotion ? 0 : Math.sin(this.t * 0.4) * 0.06;
    // Aim mid-rider (hips/chest) so helmet, bars, and both wheels stay in frame.
    this.camera.position.set(0, this.camHeight + bob, this.camDist);
    this.camera.lookAt(0, 0.72, 0.05);

    this.renderer.render(this.scene, this.camera);
  };

  private last = performance.now();
  private clockDelta() {
    const now = performance.now();
    const d = (now - this.last) / 1000;
    this.last = now;
    return d;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.renderer.domElement.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    this.renderer.domElement.removeEventListener('wheel', this.onWheel);
    this.scene.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach(x => x.dispose());
      else mat?.dispose();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _xAxis = new THREE.Vector3(1, 0, 0);
const _yAxis = new THREE.Vector3(0, 1, 0);
