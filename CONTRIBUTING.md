# Contributing

Thanks for taking a look. This document covers how the project is organised and the
conventions worth knowing before changing anything.

## Setup

```bash
npm install
npm run dev      # dev server
npm run build    # single-file dist/index.html
```

No asset pipeline — everything is generated at runtime, so there is nothing to import,
bake or optimise offline.

## Architecture principles

**Pure resolvers, impure callers.** The systems that decide *what happened* are pure
functions: `resolveState()` in `bikeState.ts`, `resolveBonk()` in `bonk.ts`,
`scoreTrick()` in `tricks.ts`. They take a snapshot and return a result. Side effects —
audio, particles, scoring, HUD — happen in the caller. This keeps them testable and
makes determinism verifiable.

**Data tables over branches.** Per-state physics lives in `STATE_RULES`, prop behaviour in
`PROPS`, crash behaviour in `CRASH_PROFILES`. Adding a case should mean adding a row, not
editing a switch in three files.

**One lighting model.** Everything visible uses `MeshStandardMaterial` via `RIDER_MAT` or
`WORLD_MAT`. Mixing in `MeshLambertMaterial` breaks visual consistency in a way colour
matching cannot fix — Lambert has no specular term, so those objects are lit by different
physics than the rest of the scene. The three exceptions (sky dome, distant ridge layers,
contact shadows) are deliberate and commented.

## Conventions

### Track space
The generator's `right` basis vector points to **screen-left**
(screen-right is `forward × up = −x`). All physics is derived consistently in this space.
Only map player-facing left/right at the input boundary — flipping the basis mirrors the
world and inverts every berm.

### Roughness hierarchy
The world is authored matte (0.88+) so the rider and bike remain the most optically active
things on screen. Keep new world materials above 0.7 unless there's a specific reason.

### Performance budget
The adaptive governor in `perf.ts` sheds cost in a fixed order:
particles → scenery LOD → crowd → pixel ratio. **Never let it touch physics.** The
simulation must be identical whether the GPU is coping or not.

If you add an instanced mesh, register it with a draw reach via the `reg()` helper in
`buildScenery()` and give it a bounding sphere. `computeBoundingSphere()` on an
`InstancedMesh` walks every instance — do not call it per frame; derive the bound
analytically from the known track span instead.

### Determinism
`RNG` in `core.ts` is a seeded xorshift. Use it rather than `Math.random()` anywhere the
result must be reproducible across runs (track generation, AI personality assignment).
`Math.random()` is fine for one-shot cosmetic variation.

## Verification

Two harnesses run in-browser rather than as a test suite, because both need the real
generated track:

- **`?tune`** — balance simulation plus exhaustive sweeps of the state machine and bonk
  system. Check this after changing AI tiers, physics constants or state transitions.
- **`?states`** — live state and performance overlay. Check FPS and draw calls after any
  rendering change.

## Tuning knobs

Most feel-critical constants are grouped deliberately:

| What | Where |
|---|---|
| Speed envelope, drag | `GRAV`, `SOFT_CAP`, `DRAG_K` in `game.ts` |
| State physics | `STATE_RULES` in `bikeState.ts` |
| Collision outcomes | `BONK_TUNING` in `bonk.ts` |
| Crash feel | `CRASH_PROFILES` in `crash.ts` |
| AI difficulty | `AI_TIERS` in `ai.ts` |
| LOD distances | `reg()` calls in `buildScenery()` |
| Progression curve | `xpForLevel()` in `mountains.ts` |

## What needs doing

The honest list:

- **Playtesting.** Most tuning is reasoned from the physics rather than felt. The AI tiers
  and trick landing tolerances especially would benefit from real sessions.
- **Controller extraction.** `game.ts` is large. The event bus in `events.ts` exists to
  make extracting `CameraController`, `RaceManager` and `AIController` safe — they can
  come out one at a time with the game playable after each step.
- **Race modes.** `modes.ts` defines rulesets for Time Attack, Trick Jam, Knockout and
  Mayhem. Their switches are read by the engine already; enabling one is a flag plus a
  tuning pass.
