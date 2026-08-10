// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: BoostSystem
//
// Owns the boost meter end to end: what fills it, what drains it, and what
// it's worth. Previously this logic was smeared across the input handler,
// the force integrator, the bonk resolver and the trick scorer — four places
// that each had to remember the 0..100 clamp.
// ---------------------------------------------------------------------------

import { clamp01 } from './core';
import { bus } from './events';

/** Everything that can put boost in the tank, with its yield. */
export const BOOST_GAINS = {
  bonk: 13,
  megaBonk: 34,
  prop: 6,
  trick: 14,          // plus a score-scaled bonus
  shortcut: 26,
  nearMiss: 7,
  draft: 7,           // per second
  cleanLanding: 5,
  quickRecovery: 12,
} as const;

export type BoostSource = keyof typeof BOOST_GAINS;

export class BoostSystem {
  /** 0..100 */
  charge = 0;
  active = false;
  /** total spent this run, for the results screen */
  spent = 0;
  private wasFull = false;

  /** drain per second while boosting, before efficiency */
  static readonly DRAIN = 34;
  /** minimum charge required to trigger (matches HUD "SPACE!" threshold) */
  static readonly MIN_TRIGGER = 12;

  reset() {
    this.charge = 0;
    this.active = false;
    this.spent = 0;
    this.wasFull = false;
  }

  /** Add charge from a named source, so yields live in one table. */
  add(source: BoostSource, scale = 1) {
    this.gain(BOOST_GAINS[source] * scale);
  }

  gain(amount: number) {
    if (amount <= 0) return;
    this.charge = Math.min(100, this.charge + amount);
    if (this.charge >= 100 && !this.wasFull) {
      this.wasFull = true;
      bus.emit('boost:full', {});
    }
  }

  /**
   * @param want   player is holding the boost key
   * @param usable ground contact / not crashed
   * @param burn   efficiency multiplier from the loadout (lower lasts longer)
   */
  update(dt: number, want: boolean, usable: boolean, burn: number) {
    const canStart = want && usable && this.charge > BoostSystem.MIN_TRIGGER;
    if (canStart && !this.active) {
      this.active = true;
      bus.emit('boost:start', {});
    } else if (this.active && (!want || !usable || this.charge <= 0)) {
      this.active = false;
      bus.emit('boost:end', { spent: this.spent });
    }
    if (this.active) {
      const d = BoostSystem.DRAIN * burn * dt;
      this.charge = Math.max(0, this.charge - d);
      this.spent += d;
      if (this.charge <= 0) {
        this.active = false;
        bus.emit('boost:end', { spent: this.spent });
      }
    }
    if (this.charge < 100) this.wasFull = false;
  }

  /** 0..1 for the HUD. */
  get level() { return clamp01(this.charge / 100); }
  /** enough to be worth telling the player about */
  get ready() { return this.charge > 25 && !this.active; }
}
