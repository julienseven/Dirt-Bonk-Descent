// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: event bus
//
// Systems publish facts; other systems decide what to do about them. This is
// what stops the physics step from needing to know about audio, scoring, the
// HUD and the particle pools — it just says "a bonk happened" and moves on.
//
// Typed end to end: emitting an event with the wrong payload is a compile
// error, and every handler knows exactly what it receives.
// ---------------------------------------------------------------------------

import type * as THREE from 'three';
import type { BikeState } from './bikeState';
import type { BonkType } from './bonk';
import type { CrashCause } from './crash';

export interface GameEvents {
  // ---- lifecycle
  'race:start': { mountain: string; mode: string };
  'race:finish': { place: number; time: number };
  'race:phase': { phase: string };

  // ---- bike
  'bike:state': { racer: number; from: BikeState; to: BikeState };
  'bike:land': { racer: number; impact: number; clean: boolean };
  'bike:jump': { racer: number; power: number };
  'bike:crash': { racer: number; cause: CrashCause; world: THREE.Vector3 };
  'bike:recover': { racer: number; fast: boolean };

  // ---- combat
  'bonk:landed': {
    type: BonkType; power: number; score: number;
    world: THREE.Vector3; byPlayer: boolean; onPlayer: boolean;
  };
  'bonk:prop': { kind: string; score: number; world: THREE.Vector3 };

  // ---- scoring
  'trick:landed': { name: string; score: number; channels: number };
  'combo:changed': { combo: number };
  'combo:broken': { at: number };
  'shortcut:taken': { name: string; saved: number };
  'nearmiss': { world: THREE.Vector3 };

  // ---- boost
  'boost:start': Record<string, never>;
  'boost:end': { spent: number };
  'boost:full': Record<string, never>;

  // ---- checkpoints
  'checkpoint': { index: number; name: string; time: number; delta: number | null };
}

export type EventName = keyof GameEvents;
type Handler<K extends EventName> = (payload: GameEvents[K]) => void;

/**
 * Minimal synchronous bus. No queueing: handlers run inside the emit call,
 * which keeps ordering obvious and avoids a frame of latency on things like
 * hit-stop that need to happen *now*.
 */
export class EventBus {
  private map = new Map<EventName, Set<(p: never) => void>>();
  /** dev aid: last N events, for the debug overlay */
  private log: { name: string; t: number }[] = [];
  private logCap = 24;
  time = 0;

  on<K extends EventName>(name: K, fn: Handler<K>): () => void {
    let set = this.map.get(name);
    if (!set) { set = new Set(); this.map.set(name, set); }
    set.add(fn as (p: never) => void);
    return () => { set!.delete(fn as (p: never) => void); };
  }

  once<K extends EventName>(name: K, fn: Handler<K>): () => void {
    const off = this.on(name, (p) => { off(); fn(p); });
    return off;
  }

  emit<K extends EventName>(name: K, payload: GameEvents[K]): void {
    const set = this.map.get(name);
    this.log.push({ name, t: this.time });
    if (this.log.length > this.logCap) this.log.shift();
    if (!set) return;
    for (const fn of set) (fn as Handler<K>)(payload);
  }

  recent(n = 10) { return this.log.slice(-n); }
  clear() { this.map.clear(); this.log.length = 0; }
}

export const bus = new EventBus();
