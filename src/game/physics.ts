// ---------------------------------------------------------------------------
// DIRT BONK DESCENT :: shared physics constants
//
// Single source of truth for the longitudinal model, contact geometry and
// chassis lean. Axle Z comes from models.ts so contact patches, pitch span
// and visual wheels stay locked together.
// ---------------------------------------------------------------------------

import { CHEST_ATTACK, FRONT_AXLE_POS, REAR_AXLE_POS } from './models';

export const GRAV = 30;
/** Soft top-speed envelope (m/s). Garage top upgrades add a little on top. */
export const SOFT_CAP = 39;

/**
 * Chest pitch on top of pelvis/spine attack lean.
 * Full DH lean lives in models.ts (PELVIS_ATTACK + SPINE_ATTACK + CHEST_ATTACK).
 */
export const ATTACK_PITCH = CHEST_ATTACK;

/** Front / rear axle offsets along track-forward (bike local Z), metres. */
export const AXLE_F = FRONT_AXLE_POS.z;
export const AXLE_R = REAR_AXLE_POS.z;
/** Contact span used for pitch, pump and lip launch. */
export const WHEELBASE = AXLE_F - AXLE_R;

/** Quadratic air drag; tucking multiplies this by TUCK_DRAG. */
export const DRAG_K = 0.0040;
export const TUCK_DRAG = 0.58;
