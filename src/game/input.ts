// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: input (keyboard + gamepad)
//
// Keyboard remains authoritative in Game.keys. This module polls the
// Gamepad API each frame and produces a normalized action snapshot the
// sim can OR into keyboard intent.
//
// Button indices follow the Standard Gamepad layout and can be remapped
// via setPadBinding / localStorage (menu CONTROLLER panel).
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

/** Remappable face / shoulder actions (triggers stay LT/RT). */
export type PadBindAction = 'hop' | 'bonkL' | 'bonkR' | 'boost' | 'tuck' | 'pause';

export const PAD_BIND_LABELS: Record<PadBindAction, string> = {
  hop: 'HOP (A)',
  bonkL: 'BONK L (X)',
  bonkR: 'BONK R (B)',
  boost: 'BOOST (RB)',
  tuck: 'TUCK (Y/LB)',
  pause: 'PAUSE (START)',
};

/** Standard Gamepad defaults matching the living-room layout. */
export const DEFAULT_PAD_BINDS: Record<PadBindAction, number> = {
  hop: 0,    // A
  bonkR: 1,  // B
  bonkL: 2,  // X
  tuck: 3,   // Y (LB also OR'd)
  boost: 5,  // RB
  pause: 9,  // Start
};

const BIND_KEY = 'dirt-bonk-descent.padBinds.v1';

function loadBinds(): Record<PadBindAction, number> {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_PAD_BINDS };
    const raw = localStorage.getItem(BIND_KEY);
    if (!raw) return { ...DEFAULT_PAD_BINDS };
    const p = JSON.parse(raw) as Partial<Record<PadBindAction, number>>;
    return { ...DEFAULT_PAD_BINDS, ...p };
  } catch {
    return { ...DEFAULT_PAD_BINDS };
  }
}

let binds = loadBinds();

export function getPadBinds(): Record<PadBindAction, number> {
  return { ...binds };
}

export function setPadBinding(action: PadBindAction, button: number) {
  binds = { ...binds, [action]: button | 0 };
  try { localStorage.setItem(BIND_KEY, JSON.stringify(binds)); } catch { /* */ }
}

export function resetPadBinds() {
  binds = { ...DEFAULT_PAD_BINDS };
  try { localStorage.removeItem(BIND_KEY); } catch { /* */ }
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
    const map = binds;
    // axes: 0 lx, 1 ly; triggers: buttons[6/7] with axis fallbacks
    const lx = axis(a[0] ?? 0);
    const ltBtn = b[6] ? b[6].value : 0;
    const rtBtn = b[7] ? b[7].value : 0;
    const ltAxis = Math.max(0, a[2] ?? a[3] ?? 0);
    const rtAxis = Math.max(0, a[5] ?? a[4] ?? 0);
    const lt = Math.max(ltBtn, ltAxis > 0.05 ? ltAxis : 0);
    const rt = Math.max(rtBtn, rtAxis > 0.05 ? rtAxis : 0);
    // D-pad as backup steer
    const dpad = (pressed(b[14]) ? -1 : 0) + (pressed(b[15]) ? 1 : 0);
    const steer = Math.abs(lx) > 0.01 ? lx : dpad;

    const hop = pressed(b[map.hop]);
    const bonkR = pressed(b[map.bonkR]);
    const bonkL = pressed(b[map.bonkL]);
    // tuck: remapped face button OR LB (4) always available for accessibility
    const tuck = pressed(b[map.tuck]) || pressed(b[4]);
    const boost = pressed(b[map.boost]);
    const brake = lt > 0.2 || pressed(b[13]); // LT or dpad down
    const pedal = rt > 0.2 || pressed(b[12]); // RT or dpad up
    const pause = pressed(b[map.pause]) || pressed(b[8]);

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

  /**
   * First button currently held (for rebinding UI). Returns -1 if none.
   * Skips LT/RT so remaps don't steal pedals.
   */
  static firstHeldButton(): number {
    const list = typeof navigator !== 'undefined' && navigator.getGamepads
      ? navigator.getGamepads()
      : [];
    for (let i = 0; i < list.length; i++) {
      const g = list[i];
      if (!g || !g.connected) continue;
      for (let bi = 0; bi < g.buttons.length; bi++) {
        if (bi === 6 || bi === 7) continue; // leave triggers alone
        if (pressed(g.buttons[bi])) return bi;
      }
    }
    return -1;
  }

  get snapshot() { return this.last; }
}
