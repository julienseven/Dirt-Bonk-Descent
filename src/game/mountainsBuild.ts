// ---------------------------------------------------------------------------
// Mountain → Track factory
//
// Keeps authored section wiring out of game.ts. Pass hazardScale so modes
// densify or open the course without rewriting zone tables.
// ---------------------------------------------------------------------------

import { Track } from './track';
import { getMountain } from './mountains';
import { SHALEBACK_SECTIONS, SHALEBACK_SETPIECES } from './shaleback';
import { CINDER_SECTIONS, CINDER_SETPIECES } from './cinderChute';
import { THORNWOOD_SECTIONS, THORNWOOD_SETPIECES } from './thornwoodDeep';
import { LASTLIGHT_SECTIONS, LASTLIGHT_SETPIECES } from './lastlightSpine';
import { IRONJAW_SECTIONS, IRONJAW_SETPIECES } from './ironjawPass';
import { REDROCK_SECTIONS, REDROCK_SETPIECES } from './redrockRasp';

export function buildMountainTrack(id: string, hazardScale = 1): Track {
  const m = getMountain(id);
  const hs = hazardScale;
  switch (m.id) {
    case 'cinder':
      return new Track(m.seed, m.length, CINDER_SECTIONS, CINDER_SETPIECES, hs);
    case 'thornwood':
      return new Track(m.seed, m.length, THORNWOOD_SECTIONS, THORNWOOD_SETPIECES, hs);
    case 'lastlight':
      return new Track(m.seed, m.length, LASTLIGHT_SECTIONS, LASTLIGHT_SETPIECES, hs);
    case 'ironjaw':
      return new Track(m.seed, m.length, IRONJAW_SECTIONS, IRONJAW_SETPIECES, hs);
    case 'redrock':
      return new Track(m.seed, m.length, REDROCK_SECTIONS, REDROCK_SETPIECES, hs);
    case 'shaleback':
      return new Track(m.seed, m.length, SHALEBACK_SECTIONS, SHALEBACK_SETPIECES, hs);
    default:
      if (m.authored) {
        return new Track(m.seed, m.length, SHALEBACK_SECTIONS, SHALEBACK_SETPIECES, hs);
      }
      return new Track(m.seed, m.length, undefined, undefined, hs);
  }
}
