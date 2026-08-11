# Mountain / Track System

Dirt Bonk Descent mountains are **data-driven TrackDefinitions**: authored
spline sections + setpieces + landmarks + a full atmosphere package.

## Architecture

```
TrackDefinition
  sections[]     Zone table (width, surface, features, drop-offs…)
  setpieces[]    Guaranteed jumps / whoops at fractions of length
  landmarks[]    Named silhouettes (fallen giant, iron jaw, …)
  atmosphere     Sky gradient, sun, fog, ridge palette, particles
  theme          alpine | volcanic | forest | limestone | sunset | canyon
       ↓
Track (track.ts)     builds spline, terrain mesh, scenery, bridges
       ↓
game.applyAtmosphere()  swaps sky / light / ridges / ambient particles
```

**Do not hardcode a mountain into game.ts.** Add a definition module and
register it in `mountainsBuild.ts`.

## Build order (reference quality)

1. Spline + elevation (`buildNodes`)
2. Playable trail surface + width variation
3. Features (jumps, berms, whoops)
4. Shortcuts + checkpoints
5. Section markers + start/finish
6. Landmarks + zone setpieces
7. Vegetation / rocks (instanced, LOD-banded)
8. Sky / fog / lighting / ridges
9. Ambient particles
10. Debug overlay

## The five mountains

| Id | Theme | Length | Sections | Identity |
|----|-------|--------|----------|----------|
| **shaleback** | alpine | 4600 m | 10 | Classic dirt / pine / bridge / big air |
| **cinder** | volcanic | 2800 m | 8 | Ash, basalt, lava fissures, no trees |
| **thornwood** | forest | 4900 m | 10 | Dense mist, roots, line choice |
| **ironjaw** | limestone | 6200 m | 10 | Cliffs, iron jaw, thin air endurance |
| **lastlight** | sunset | 5600 m | 10 | Golden-hour spine, trailer moments |

Shaleback is the **reference-quality** track. New courses should match its
section density, landmark count, and atmosphere specificity.

## Atmosphere

Each mountain owns:

- 7-stop sky gradient
- sun colour / intensity / direction
- hemisphere sky + ground bounce
- fog base colour + density scale
- three-layer ridge silhouette colours
- ambient particle mode: `dust` | `ash` | `mist` | `embers` | `leaves`

Zone `fog` still modulates density as you ride (forest darkens, summit clears).

## Debug

| Key / URL | What |
|-----------|------|
| `?track` or **F11** (with `?debug`) | Spline centreline, width edges, section boundaries, shortcuts, jumps, landmarks |
| **F8** | Physics gizmos |
| `?states` | Live state machine + perf |

## Adding a mountain

1. Create `src/game/myMountain.ts` exporting a `TrackDefinition`
2. Register in `DEFS` inside `mountainsBuild.ts`
3. Add a row to `MOUNTAINS` in `mountains.ts`
4. Keep rider/bike physics untouched

## Performance notes

- Terrain is chunked (`CHUNK = 96` nodes) and **streamed by s** (`updateSurfaceChunks`)
- Vegetation is InstancedMesh + distance-band repack (`updateSceneryLod`)
- Theme LOD multiplier: forest/endurance pull scenery reach in
- Perf governor theme floor: Thornwood / Ironjaw start one tier leaner
- Ambient particles: pooled + budgeted via `particleScale`
- Distant ridges are unlit low-poly silhouettes

## Audio theming

`audio.setTheme(theme)` on mountain load retargets:

| Theme | Beds | Music |
|-------|------|-------|
| alpine | forest + birds | 158 bpm classic |
| volcanic | ash rumble, dry roll, no birds | 168 bpm aggressive |
| forest | dense canopy, wet water, many birds | 148 bpm |
| limestone | thin high wind | 152 bpm, strong finale |
| sunset | warm wind, big finale layers | 156 bpm, finaleMul 1.45 |
| canyon | grit rumble, sparse birds | 162 bpm |
