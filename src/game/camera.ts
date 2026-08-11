// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: camera rig
//
// Every shot in the game lives here. The rig owns the THREE camera and the
// smoothed state behind it (position, look target, roll, FOV, shake) so no
// other module ever writes those directly — the engine picks a shot per
// frame and hands over the state that shot needs to frame itself.
//
// Six shots:
//   cinematic  slow menu flyby down the mountain
//   intro      the cold open, beat-sheet driven
//   chase      the race camera
//   finish     pull back and arc around the victory carve
//   replay     results-screen highlight reel, cuts between four angles
//   (+ shake / FOV punch, which layer onto whichever shot is live)
//
// Shots never read the phase — the engine dispatches. That keeps this module
// free of any import from game.ts, so there is no cycle.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { clamp, clamp01, damp, lerp, smootherstep } from './core';
import { Track } from './track';

/**
 * Cold-open beat sheet. Times are cumulative seconds.
 * The whole thing runs ~8.5s and ends the instant the racers launch, so the
 * player is riding before they've finished reading anything.
 *
 * Lives here because the intro shot branches on it; the engine imports it
 * for the matching HUD beats.
 */
export const INTRO = {
  /** low wide shot, rider silhouetted against the drop */
  wide: 0,
  /** camera swings around behind the rider, revealing the mountain */
  swing: 2.6,
  /** rival rolls up alongside */
  rival: 4.4,
  /** the look */
  glance: 5.6,
  /** rival stands up and goes */
  jump: 6.9,
  /** reaction window opens — ~1s to answer */
  react: 6.9,
  /** 3 - 2 - 1 */
  count: 7.9,
  /** SEND IT */
  send: 10.9,
  end: 11.6,
};

/**
 * The subject being framed. `Racer` satisfies this structurally, so the
 * engine passes its racers straight in with no adapter.
 */
export interface CamRider {
  s: number;
  x: number;
  y: number;
  v: number;
  lean: number;
  yaw: number;
  airTime: number;
  crash: number;
  crashMax: number;
  finishRoll: number;
  finishCarve: number;
  /** >0 after touchdown — camera compresses */
  landTimer?: number;
  /** chassis pitch for look offset */
  chassisPitch?: number;
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;

  /** smoothed rig state — read-only to the outside world */
  pos = new THREE.Vector3();
  look = new THREE.Vector3();
  roll = 0;
  fov = 68;
  shake = 0;

  /** menu flyby clock, advanced by cinematic() */
  menuTime = 0;

  /** set by the engine on a hard cut so the next frame lands instantly */
  private snap = false;

  /**
   * Accessibility scaling. Shake and FOV surge are the two things that
   * reliably make people motion-sick, so both funnel through one flag.
   */
  reducedMotion = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(this.fov, aspect, 0.4, 6000);
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** All shake funnels through here so accessibility can scale it globally. */
  addShake(v: number) {
    const scale = this.reducedMotion ? 0.22 : 1;
    this.shake = Math.min(2.2, this.shake + v * scale);
  }

  /** One-off FOV kick, e.g. selling a big clean landing. */
  punchFov(v: number, max: number) {
    this.fov = Math.min(this.fov + v, max);
  }

  /** Hard cut: the next shot update snaps instead of damping. */
  cut() { this.snap = true; }

  /** Clear transient state on race reset. */
  reset() {
    this.shake = 0;
  }

  resetMenuClock() { this.menuTime = 0; }

  // -------------------------------------------------------------------------
  // shared plumbing
  // -------------------------------------------------------------------------

  /** Decay shake and jitter the camera by what's left of it. */
  private applyShake(dt: number, amount: number, withZ: boolean) {
    if (this.shake <= 0) return;
    this.shake = Math.max(0, this.shake - dt * 2.6);
    const m = this.shake * this.shake * amount;
    this.camera.position.x += (Math.random() * 2 - 1) * m;
    this.camera.position.y += (Math.random() * 2 - 1) * m;
    if (withZ) this.camera.position.z += (Math.random() * 2 - 1) * m;
  }

  /** Push the smoothed state onto the actual camera. */
  private commit(targetFov: number, fovRate: number, dt: number, lazyFov: boolean) {
    this.camera.lookAt(this.look);
    this.camera.rotateZ(this.roll);
    this.fov = damp(this.fov, targetFov, fovRate, dt);
    // The chase shot runs every frame at speed, where updateProjectionMatrix
    // on a sub-hundredth FOV delta is pure waste; the cinematic shots are
    // cheap enough not to care.
    if (!lazyFov || Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  private dampPos(want: THREE.Vector3, rate: number, yRate: number, dt: number) {
    this.pos.x = damp(this.pos.x, want.x, rate, dt);
    this.pos.y = damp(this.pos.y, want.y, yRate, dt);
    this.pos.z = damp(this.pos.z, want.z, rate, dt);
  }

  private dampLook(want: THREE.Vector3, rate: number, dt: number) {
    this.look.x = damp(this.look.x, want.x, rate, dt);
    this.look.y = damp(this.look.y, want.y, rate, dt);
    this.look.z = damp(this.look.z, want.z, rate, dt);
  }

  // -------------------------------------------------------------------------
  // shots
  // -------------------------------------------------------------------------

  /**
   * Slow cinematic sweep down the mountain behind the main menu.
   * Returns the track distance it framed so the engine can band scenery
   * around the camera rather than around the parked player.
   */
  cinematic(trk: Track, dt: number): number {
    this.menuTime += dt;
    const loop = 74;
    const t = (this.menuTime % loop) / loop;
    const s = 40 + t * (trk.length - 260);
    const wob = Math.sin(this.menuTime * 0.42);
    const hw = trk.halfWidth(s);
    const x = wob * hw * 0.75;
    const h = trk.heightAt(s, x) + 5.4 + Math.sin(this.menuTime * 0.31) * 2.2;

    const first = this.menuTime < dt * 2;
    const rate = first ? 999 : 1.6;
    this.dampPos(trk.worldPos(s, x, h, _v1), rate, rate, dt);

    const lookS = s + 40;
    const lookWant = trk.worldPos(lookS, x * 0.3, trk.heightAt(lookS, 0) + 2, _v2);
    this.dampLook(lookWant, first ? 999 : 1.8, dt);

    this.camera.position.copy(this.pos);
    this.roll = damp(this.roll, wob * 0.04, 2, dt);
    this.commit(58, 2, dt, false);
    return s;
  }

  /**
   * The cold open. Beat-sheet driven; `t` is seconds into the intro.
   * `theme` shifts the opening wide shot so each mountain's first frame
   * sells its identity (spine silhouette vs forest canopy vs caldera).
   */
  intro(trk: Track, p: CamRider, t: number, dt: number, theme = 'alpine') {
    const first = t < dt * 2;
    const rate = first ? 999 : 3.2;
    let cs: number, cx: number, ch: number, ls: number, lx: number, lh: number, fov: number;

    // theme-tuned opening: how far/high we start the hero silhouette
    const open = introOpen(theme);

    if (t < INTRO.swing) {
      // low and in front, looking back up at the rider against the sky
      const k = clamp01(t / INTRO.swing);
      cs = p.s + lerp(open.front, 5.5, k);
      cx = p.x + lerp(open.side, 1.6, k);
      ch = lerp(open.height, 1.5, k);
      ls = p.s; lx = p.x; lh = 1.5;
      fov = lerp(open.fov, 50, k);
    } else if (t < INTRO.rival) {
      // swing around behind, revealing the drop — look-ahead sells scale
      const k = smootherstep(clamp01((t - INTRO.swing) / (INTRO.rival - INTRO.swing)));
      const a = lerp(0, Math.PI, k);
      const radius = open.swingR;
      cs = p.s + Math.cos(a) * radius;
      cx = p.x + Math.sin(a) * (radius * 0.77);
      ch = lerp(1.5, open.swingH, k);
      ls = p.s + open.lookAhead; lx = p.x; lh = open.lookH;
      fov = lerp(50, open.swingFov, k);
    } else if (t < INTRO.jump) {
      // two-shot: both riders in frame
      cs = p.s - 5.4; cx = p.x - 1.4; ch = 2.5;
      ls = p.s + 3; lx = p.x + 1.6; lh = 1.5;
      fov = 52;
    } else if (t < INTRO.send) {
      // settle into the race chase
      const k = smootherstep(clamp01((t - INTRO.jump) / (INTRO.send - INTRO.jump)));
      cs = lerp(p.s - 5.4, p.s - 7.6, k);
      cx = lerp(p.x - 1.4, p.x * 0.62, k);
      ch = lerp(2.5, 2.9, k);
      ls = lerp(p.s + 3, p.s + 12, k); lx = p.x * 0.55; lh = lerp(1.5, 1.9, k);
      fov = lerp(52, 66, k);
    } else {
      // punch in on the launch
      cs = p.s - 7.0; cx = p.x * 0.62; ch = 2.8;
      ls = p.s + 13; lx = p.x * 0.55; lh = 1.9;
      fov = 72;
    }

    this.dampPos(trk.worldPos(cs, cx, trk.heightAt(cs, cx) + ch, _v1), rate, rate, dt);
    this.dampLook(trk.worldPos(ls, lx, trk.heightAt(ls, lx) + lh, _v2), first ? 999 : 4.5, dt);

    this.camera.position.copy(this.pos);
    this.applyShake(dt, 0.9, false);
    this.roll = damp(this.roll, t < INTRO.swing ? 0.05 : 0, 3, dt);
    this.commit(fov, 4, dt, false);
  }

  /**
   * Start-grid money shot: elevated rear three-quarter so the whole
   * shoulder pack (or staggered KO field) reads in one frame.
   * Used during countdown and by the docs capture harness.
   */
  packShot(trk: Track, p: CamRider, packHalfWidth = 5, snap = true) {
    const back = 12.5;
    const side = Math.max(4.2, packHalfWidth * 0.85);
    const height = 4.6;
    const camS = p.s - back;
    const camX = p.x - side;
    const camH = trk.heightAt(camS, camX) + height;
    const want = trk.worldPos(camS, camX, camH, _v1);
    // look at pack center a touch ahead of the gate
    const lookS = p.s + 4;
    const lookX = p.x * 0.35;
    const lookH = trk.heightAt(lookS, lookX) + 1.7;
    const lookWant = trk.worldPos(lookS, lookX, lookH, _v2);
    if (snap) {
      this.pos.copy(want);
      this.look.copy(lookWant);
    } else {
      this.dampPos(want, 8, 8, 0.05);
      this.dampLook(lookWant, 9, 0.05);
    }
    this.camera.position.copy(this.pos);
    this.roll = 0.03;
    this.commit(58, 99, 0.05, false);
  }

  /** The race camera. */
  chase(trk: Track, p: CamRider, dt: number, boosting: boolean, tight: boolean, snap: boolean) {
    const speed01 = clamp01(p.v / 42);
    const air = clamp01(p.airTime / 1.4);
    const gh = trk.heightAt(p.s, p.x);
    const aboveGround = clamp(p.y - gh, 0, 22);
    const landK = clamp01((p.landTimer ?? 0) * 3.6);
    const pitch = p.chassisPitch ?? 0;

    // a crash is worth watching: pull back and up so the tumble is in frame
    const crashK = p.crash > 0 ? clamp01(p.crash / Math.max(0.4, p.crashMax)) : 0;
    // Slightly closer/higher so helmet → bars → wheels stay readable.
    // Hard landing compresses height; big air widens framing.
    // Stationary gate (countdown): pull wider so the pack fills the frame.
    const gateWide = !tight && p.v < 2 ? 1 : 0;
    const back = 6.8 + speed01 * 3.2 + air * 2.8 + (boosting ? -0.7 : 0)
      + crashK * 3.4 + gateWide * 4.2;
    const height = 2.95 - speed01 * 0.45 + air * 1.65 + aboveGround * 0.55
      + crashK * 2.2
      - landK * 0.52 + gateWide * 1.5;
    const camS = p.s - back;
    const camX = p.x * 0.62 - gateWide * 3.6;
    const camH = trk.heightAt(camS, camX) + height;

    const want = trk.worldPos(camS, camX, camH, _v1);
    if (snap) this.pos.copy(want);
    else {
      // landings snap camera slightly tighter for impact weight
      const rate = tight ? (11 + landK * 6) : 6;
      this.dampPos(want, rate, rate * 0.85, dt);
    }

    // Look at rider unit; lead path; dip look on hard landings
    const lookS = p.s + 5.5 + p.v * 0.22;
    const lookX = p.x * 0.55;
    const lookH = trk.heightAt(lookS, lookX) + 1.55 + aboveGround * 0.45
      - landK * 0.32 + pitch * 0.15;
    const lookWant = trk.worldPos(lookS, lookX, lookH, _v2);
    if (snap) this.look.copy(lookWant);
    else {
      this.look.x = damp(this.look.x, lookWant.x, 8, dt);
      this.look.y = damp(this.look.y, lookWant.y, 7 + landK * 4, dt);
      this.look.z = damp(this.look.z, lookWant.z, 8, dt);
    }

    this.camera.position.copy(this.pos);
    this.applyShake(dt, 0.9, true);

    // roll with lean + drift
    const rollScale = this.reducedMotion ? 0.4 : 1;
    const targetRoll = (-p.lean * 0.22 - p.yaw * 0.10) * rollScale
      + (this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.06 : 0);
    this.roll = damp(this.roll, targetRoll, 7, dt);

    // Sense of speed: FOV punches at top end / boost / big air; tightens on land
    const fovK = this.reducedMotion ? 0.35 : 1;
    const speedPunch = speed01 * speed01;
    const targetFov = 65
      + (speedPunch * 14 + speed01 * 6
        + (boosting ? 11 : 0)
        + (p.crash > 0 ? -7 : 0)
        + air * 5
        - landK * 4.2) * fovK;
    this.commit(targetFov, boosting || landK > 0.2 ? 9 : 5, dt, true);
  }

  /**
   * FINISH CAMERA. Pulls back and rises as the rider crosses, then swings
   * around to the carve side so the carve and the victory pose are both in
   * frame. `epic` (Lastlight) pulls further and slower so the sunset vista
   * owns the final frame.
   */
  finish(trk: Track, p: CamRider, dt: number, epic = false) {
    const t = p.finishRoll;

    // 0-1.0s: drop back and up, still behind
    // 1.0s+ : arc around to the carve side, framing the rider three-quarter
    const arc = smootherstep(clamp01((t - 1.0) / (epic ? 3.2 : 2.4)));
    const back = lerp(epic ? 10 : 8.5, epic ? 18 : 13.5, clamp01(t / (epic ? 3.4 : 2.5)));
    const height = lerp(epic ? 3.6 : 3.0, epic ? 9.5 : 6.2, clamp01(t / (epic ? 4.0 : 3.0)));
    const side = arc * (epic ? 12 : 9) * -p.finishCarve;

    const cs = p.s - back;
    const cx = p.x + side;
    this.dampPos(trk.worldPos(cs, cx, trk.heightAt(cs, cx) + height, _v1), epic ? 2.0 : 2.6, epic ? 2.0 : 2.6, dt);

    // look slightly ahead of the rider early, then settle onto them
    // epic: keep looking past the rider into the valley a beat longer
    const lookS = p.s + lerp(epic ? 10 : 6, epic ? 1.2 : 0.5, arc);
    this.dampLook(trk.worldPos(lookS, p.x, trk.heightAt(lookS, p.x) + (epic ? 1.2 : 1.6), _v2), epic ? 2.4 : 3.2, dt);

    this.camera.position.copy(this.pos);
    this.applyShake(dt, 0.7, false);
    this.roll = damp(this.roll, arc * 0.05 * p.finishCarve, 2, dt);
    // widen as we pull out — epic ends wider so the whole spine is in frame
    this.commit(lerp(epic ? 74 : 70, epic ? 52 : 58, clamp01(t / (epic ? 3.5 : 2.5))), epic ? 1.6 : 2.2, dt, false);
  }

  /**
   * Results-screen highlight reel. `shot` selects the angle; the engine
   * calls cut() when it changes so the new angle lands without a sweep.
   */
  replay(trk: Track, s: number, x: number, shot: number, dt: number) {
    let cs = s, cx = x, ch = 3;
    switch (shot) {
      case 0: cs = s - 8.5; cx = x * 0.6; ch = 3.0; break;   // chase
      case 1: cs = s + 11; cx = x * 0.4; ch = 2.4; break;    // look back
      case 2: cs = s - 2; cx = x + 9; ch = 4.5; break;       // side pan
      case 3: cs = s - 5; cx = x * 0.5; ch = 9.0; break;     // high crane
    }
    const rate = this.snap ? 999 : 3.4;
    this.dampPos(trk.worldPos(cs, cx, trk.heightAt(cs, cx) + ch, _v1), rate, rate, dt);
    this.dampLook(trk.worldPos(s, x, trk.heightAt(s, x) + 1.4, _v2), this.snap ? 999 : 5, dt);
    this.snap = false;

    this.camera.position.copy(this.pos);
    this.roll = shot === 2 ? 0.06 : 0;
    this.commit(shot === 3 ? 52 : 64, 3, dt, false);
  }
}

/** Per-theme cold-open framing. */
function introOpen(theme: string) {
  switch (theme) {
    case 'volcanic':
      // lower, closer to the ash — heat and ground
      return { front: 8, side: 2.8, height: 0.45, fov: 40, swingR: 6.2, swingH: 2.8, swingFov: 60, lookAhead: 12, lookH: 0.2 };
    case 'forest':
      // nestled, less sky — canopy owns the frame
      return { front: 7.5, side: 2.4, height: 0.9, fov: 44, swingR: 5.8, swingH: 2.6, swingFov: 58, lookAhead: 10, lookH: 0.5 };
    case 'limestone':
      // high and wide — thin air, big walls
      return { front: 11, side: 4.2, height: 1.1, fov: 38, swingR: 7.5, swingH: 3.8, swingFov: 66, lookAhead: 18, lookH: 0.1 };
    case 'sunset':
      // hero silhouette against the sky — trailer money shot
      return { front: 12, side: 4.5, height: 0.35, fov: 36, swingR: 8.0, swingH: 4.2, swingFov: 68, lookAhead: 22, lookH: -0.2 };
    case 'canyon':
      return { front: 9.5, side: 3.6, height: 0.7, fov: 40, swingR: 6.8, swingH: 3.2, swingFov: 62, lookAhead: 15, lookH: 0.3 };
    default: // alpine
      return { front: 9, side: 3.4, height: 0.6, fov: 42, swingR: 6.5, swingH: 3.1, swingFov: 62, lookAhead: 14, lookH: 0.4 };
  }
}
