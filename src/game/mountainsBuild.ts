// ---------------------------------------------------------------------------
// Mountain → Track factory
//
// Each mountain is a TrackDefinition (sections + setpieces + landmarks +
// atmosphere). Geometry builds here; atmosphere is applied by game.ts when
// the mountain loads.
// ---------------------------------------------------------------------------

import { Track } from './track';
import { getMountain } from './mountains';
import type { TrackDefinition } from './trackDef';
import { ATMOS_ALPINE, ATMOS_CANYON } from './trackDef';
import { SHALEBACK } from './shaleback';
import { CINDER } from './cinderChute';
import { THORNWOOD } from './thornwoodDeep';
import { LASTLIGHT } from './lastlightSpine';
import { IRONJAW } from './ironjawPass';
import { REDROCK_SECTIONS, REDROCK_SETPIECES } from './redrockRasp';

const REDROCK: TrackDefinition = {
  id: 'redrock',
  name: 'REDROCK RASP',
  theme: 'canyon',
  seed: 441902,
  length: 3400,
  difficulty: 3,
  sections: REDROCK_SECTIONS,
  setpieces: REDROCK_SETPIECES,
  landmarks: [
    { id: 'start', kind: 'start_tower', at: 0.03, side: 1, label: 'Heat Gate' },
    { id: 'shelf', kind: 'shale_formation', at: 0.20, side: -1, label: 'Shelf Stack' },
    { id: 'pipe', kind: 'cliff_gate', at: 0.55, label: 'The Pipe' },
    { id: 'finish', kind: 'grandstand', at: 0.95, label: 'Wash Finish' },
  ],
  atmosphere: ATMOS_CANYON,
  startElevation: 880,
};

const DEFS: Record<string, TrackDefinition> = {
  shaleback: SHALEBACK,
  cinder: CINDER,
  thornwood: THORNWOOD,
  ironjaw: IRONJAW,
  lastlight: LASTLIGHT,
  redrock: REDROCK,
};

export function getTrackDefinition(id: string): TrackDefinition {
  return DEFS[id] ?? SHALEBACK;
}

export function buildMountainTrack(id: string, hazardScale = 1): Track {
  const m = getMountain(id);
  const def = getTrackDefinition(m.id);
  const hs = hazardScale;
  return new Track(
    def.seed,
    def.length,
    def.sections,
    def.setpieces,
    hs,
    {
      theme: def.theme,
      landmarks: def.landmarks,
      startElevation: def.startElevation,
      mountainId: def.id,
    },
  );
}

/** Atmosphere package for the currently selected mountain. */
export function mountainAtmosphere(id: string) {
  return getTrackDefinition(id).atmosphere ?? ATMOS_ALPINE;
}
