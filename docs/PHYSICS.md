# Physics + rider + bike chain

Physical foundation for Dirt Bonk Descent. Feel comes from this order — do not short-circuit it with mesh offsets.

```
TERRAIN → WHEELS → SUSPENSION → FRAME → RIDER → CAMERA
```

## Modules

| Module | Role |
|--------|------|
| `vehiclePhysics.ts` | Two-wheel contact, pitch/supportY, CoM constants, hop/pump, phys debug |
| `bikeDynamics.ts` | Dual-crown fork + Horst rear integrators, axle loads, susp visuals |
| `wheelTraction.ts` | Per-wheel Pacejka-lite slip / grip |
| `limbPhysics.ts` | G-force torso, grip/foot attach, joint limits |
| `models.ts` | Bike hierarchy, IK (hands→grips, feet→pedals), stance |
| `bonk.ts` | Pure rider-on-rider impulse resolution |
| `crash.ts` | Ragdoll separation |
| `camera.ts` | Chase FOV / land compress / shake |
| `raceManager.ts` | Pure placings + knockout victim pick |
| `ai.ts` | Personalities, tiers, pure `planRivalThink` / combat / hop, `themeAiFeel` |
| `physicsScenarios.ts` | Automated playtest harness (geometry + AI plan + theme) |
| `raceScenarios.ts` | Full-pack race sim on real tracks + balance / mobile gates |

## Geometry constants (single source)

Defined in `models.ts`, re-exported via `physics.ts` / `vehiclePhysics.ts`:

- `WHEEL_R`, `FRONT_AXLE_POS`, `REAR_AXLE_POS`, `BB_POS`, `WHEELBASE`
- Seat: `SEAT_T`, `SADDLE_POS` (slammed aft, below standing hips)
- Rider attack: `PELVIS_REST`, `PELVIS_ATTACK`, `SPINE_ATTACK`, `CHEST_ATTACK`

Physics root sits at tyre contact height. Both wheels share `WHEEL_R` so contact is at local y=0 when level.

## Two-wheel contact

Each step samples terrain at front and rear axle track positions:

1. `terrainPitch = atan2(hF − hR, wheelbase)`
2. `supportY` plants both tyre bottoms when pitch matches
3. Independent `contactF` / `contactR` from predicted contact heights
4. Rising (hop/lip) skips height snap so the bike can leave the ground
5. Stick band on slopes prevents pitch-lag from floating both wheels

## Suspension feel

`DH_FORK` / `DH_REAR` spring rates are **arcade-scaled** to `VEHICLE_MASS` (~86 kg) so static sag sits ~20–25% travel. Full SI DH rates (14k N/m) top out under `axleLoads` and read as no suspension.

Landings add impact load per end; visuals drive `forkLower` along `FORK_AXIS` and swingarm pitch from travel ratios.

## Rider

- Pelvis CoM between wheels (`PELVIS_REST`), not over the bars
- Hands/feet IK-locked to grip/pedal anchors on the bike hierarchy
- Absorb from real susp ratios + land pulse + brake + air crouch + flip tuck
- Crash: full grip/foot release → ragdoll; bike gets separate impulse

## Camera

- Speed → FOV punch
- Hard landing → height compress + FOV tighten
- Big air → wider framing
- Bonk/crash → shake (via `addShake`)

## Debug

| Toggle | How |
|--------|-----|
| Phys gizmos | `?phys`, `?debug`, or **F8** in race |
| State overlay | `?states` / `?debug` |
| Balance harness | `?tune` |

Gizmos: bike CoM, rider CoM, contact patches, susp bars, steer axis, grips/pedals, velocity / forward / normal.

## Automated playtest

```bash
npm run test:physics   # chassis / bonk / AI plan (21 scenarios)
npm run test:race      # full descent sim per mountain + balance audit
npm run audit:tracks   # soft playtest dump with hard gates
npm run verify         # typecheck + physics + race + build
```

Race harness uses real `Track` geometry and pure AI planning with a simplified
longitudinal model (not the full two-wheel step — that stays in physics scenarios).

Runs the acceptance scenarios (flat, steep, brake, turns, bumps, drop, jumps, landing, tricks, bonks, crash, recovery, DH seat identity, pure AI plan) against pure sim — no browser required.

## Tuning order

When something “looks disconnected”:

1. Contact / pitch (`vehiclePhysics.ts`)
2. Suspension sag & travel (`bikeDynamics.ts`)
3. Rider absorb / stance (`limbPhysics.ts`, `applyRiderStance`)
4. Camera sell (`camera.ts`)
5. Only then: mesh or decorative changes

## Do not

- Move visual parts with independent world-space offsets
- Replace gameplay systems for physics feel
- Touch physics from the perf governor
