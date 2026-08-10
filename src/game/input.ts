// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: input (keyboard + gamepad)
//
// Keyboard remains authoritative in Game.keys. This module polls the
// Gamepad API each frame and produces a normalized action snapshot the
// sim can OR into keyboard intent. No remapping UI yet — defaults match
// the living-room layout from the build brief.
//
// Controller defaults:
//   LT brake · RT pedal · Left stick steer · A hop · B/X attack · RB boost
//   Y tuck · Start pause
// ---------------------------------------------------------------------------

import { clamp } from './core';

export interface PadActions {
  connected: boolean;
  /** screen-space steer −1 left … +1 right */
  steer: number;
  pedal: boolean;
  brake: boolean;
  boost: boolean;
  hop: boolean;
  tuck: boolean;
  bonkL: boolean;
  bonkR: boolean;
  pause: boolean;
  /** edge: true only on the frame the button went down */
  hopTap: boolean;
  bonkLTap: boolean;
  bonkRTap: boolean;
  pauseTap: boolean;
}

const DEAD = 0.18;

function axis(v: number): number {
  if (Math.abs(v) < DEAD) return 0;
  // re-scale past deadzone so the stick still reaches full throw
  const s = Math.sign(v);
  return s * clamp((Math.abs(v) - DEAD) / (1 - DEAD), 0, 1);
}

function pressed(b: GamepadButton | undefined): boolean {
  return !!b && (b.pressed || b.value > 0.45);
}

const empty = (): PadActions => ({
  connected: false,
  steer: 0, pedal: false, brake: false, boost: false,
  hop: false, tuck: false, bonkL: false, bonkR: false, pause: false,
  hopTap: false, bonkLTap: false, bonkRTap: false, pauseTap: false,
});

/**
 * Sticky previous-button mask so we can emit one-frame taps without the
 * engine needing to track gamepad history itself.
 */
export class GamepadInput {
  private prev = {
    hop: false, bonkL: false, bonkR: false, pause: false,
  };
  private last: PadActions = empty();

  /** Poll the first connected standard gamepad. Safe to call every frame. */
  poll(): PadActions {
    const list = typeof navigator !== 'undefined' && navigator.getGamepads
      ? navigator.getGamepads()
      : [];
    let pad: Gamepad | null = null;
    for (let i = 0; i < list.length; i++) {
      const g = list[i];
      if (g && g.connected) { pad = g; break; }
    }
    if (!pad) {
      this.prev = { hop: false, bonkL: false, bonkR: false, pause: false };
      this.last = empty();
      return this.last;
    }

    const a = pad.axes;
    const b = pad.buttons;
    // standard mapping: 0=A, 1=B, 2=X, 3=Y, 4=LB, 5=RB, 6=LT, 7=RT, 9=Start
    // axes: 0 lx, 1 ly, 2 rx, 3 ry  (some pads use 6/7 for triggers as axes)
    const lx = axis(a[0] ?? 0);
    // triggers: standard buttons[6/7], with axes[2/5] or [3/4] as fallback
    // for pads that don't expose trigger buttons
    const ltBtn = b[6] ? b[6].value : 0;
    const rtBtn = b[7] ? b[7].value : 0;
    const ltAxis = Math.max(0, a[2] ?? a[3] ?? 0);
    const rtAxis = Math.max(0, a[5] ?? a[4] ?? 0);
    const lt = Math.max(ltBtn, ltAxis > 0.05 ? ltAxis : 0);
    const rt = Math.max(rtBtn, rtAxis > 0.05 ? rtAxis : 0);
    // D-pad as backup steer
    const dpad = (pressed(b[14]) ? -1 : 0) + (pressed(b[15]) ? 1 : 0);
    const steer = Math.abs(lx) > 0.01 ? lx : dpad;

    const hop = pressed(b[0]);           // A
    const bonkR = pressed(b[1]);         // B — attack right
    const bonkL = pressed(b[2]);         // X — attack left
    const tuck = pressed(b[3]) || pressed(b[4]); // Y or LB
    const boost = pressed(b[5]);         // RB
    const brake = lt > 0.2 || pressed(b[13]); // LT or dpad down
    const pedal = rt > 0.2 || pressed(b[12]); // RT or dpad up
    const pause = pressed(b[9]) || pressed(b[8]);

    const out: PadActions = {
      connected: true,
      steer,
      pedal: pedal && !brake,
      brake,
      boost,
      hop,
      tuck,
      bonkL,
      bonkR,
      pause,
      hopTap: hop && !this.prev.hop,
      bonkLTap: bonkL && !this.prev.bonkL,
      bonkRTap: bonkR && !this.prev.bonkR,
      pauseTap: pause && !this.prev.pause,
    };
    this.prev = { hop, bonkL, bonkR, pause };
    this.last = out;
    return out;
  }

  get snapshot() { return this.last; }
}
