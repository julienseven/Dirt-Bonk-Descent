// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: CheckpointSystem
//
// Section boundaries double as timing checkpoints and as respawn anchors.
// Keeping both in one place means a respawn can never drop you somewhere the
// split timer doesn't know about.
// ---------------------------------------------------------------------------

import { bus } from './events';
import type { Track } from './track';

export interface Checkpoint {
  index: number;
  name: string;
  /** distance along the track */
  s: number;
  /** safe lateral position to respawn at */
  x: number;
}

export class CheckpointSystem {
  list: Checkpoint[] = [];
  /** cumulative race time on crossing each checkpoint; 0 = not yet reached */
  splits: number[] = [];
  /** personal best splits to compare against; empty = no PB */
  pb: number[] = [];
  /** highest checkpoint index crossed */
  reached = -1;
  /** most recent delta vs PB, for the HUD */
  lastDelta: number | null = null;
  lastShown = 0;

  build(track: Track) {
    this.list = track.zones.map((z, i) => ({
      index: i,
      name: z.name,
      s: z.t0 * track.length,
      x: 0,
    }));
    this.splits = new Array(this.list.length).fill(0);
    this.reset();
  }

  reset() {
    this.splits.fill(0);
    this.reached = -1;
    this.lastDelta = null;
    this.lastShown = 0;
  }

  /**
   * Advance. Returns the checkpoint just crossed, if any.
   * Only ever moves forward, so shortcuts that skip a boundary don't
   * retroactively fire an old checkpoint.
   */
  update(s: number, raceTime: number, dt: number): Checkpoint | null {
    if (this.lastShown > 0) this.lastShown -= dt;
    let hit: Checkpoint | null = null;
    for (let i = this.reached + 1; i < this.list.length; i++) {
      if (s < this.list[i].s) break;
      this.reached = i;
      hit = this.list[i];
      // index 0 is the start line — no split worth reporting
      if (i > 0) {
        this.splits[i] = raceTime;
        const prev = this.pb[i];
        const delta = prev && prev > 0 ? raceTime - prev : null;
        this.lastDelta = delta;
        this.lastShown = delta !== null ? 3 : 0;
        bus.emit('checkpoint', {
          index: i, name: hit.name, time: raceTime, delta,
        });
      }
    }
    return hit;
  }

  /** Nearest checkpoint at or behind `s`, for respawning. */
  lastBefore(s: number): Checkpoint | null {
    let best: Checkpoint | null = null;
    for (const c of this.list) {
      if (c.s <= s) best = c; else break;
    }
    return best;
  }

  snapshot(): number[] { return this.splits.slice(); }
}
