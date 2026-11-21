// Where things may be placed by a command (S-BACK-033). Pure, so Node-testable.
// One world frame serves Plan and Train (Train only frames the goal A end of
// the same rink): millimetres, x across the rink, z along it.

import { RINK_L, HALF_W, GOAL_LINE_FROM_BOARD } from '../constants.js';

export const RINK_BOUNDS = Object.freeze({ xMin: -HALF_W, xMax: HALF_W, zMin: 0, zMax: RINK_L });

export const RINK_FRAME_NOTE =
  `Frame: millimetres. x runs across the rink from ${-HALF_W} to ${HALF_W} (0 = the centre line between the long boards). ` +
  `z runs along it from 0 (goal A's end board) to ${RINK_L} (goal B's end board). ` +
  `Goal A's goal line is at z ${GOAL_LINE_FROM_BOARD} (centre x 0), goal B's at z ${RINK_L - GOAL_LINE_FROM_BOARD}. ` +
  'Plan and Train share this frame; Train shows the goal A end.';

// A message when (x, z) is outside the rink, else null.
export function rinkPointProblem(x, z) {
  const b = RINK_BOUNDS;
  const out = [];
  if (x < b.xMin || x > b.xMax) out.push(`x ${x} is off the rink (x must be ${b.xMin}..${b.xMax})`);
  if (z < b.zMin || z > b.zMax) out.push(`z ${z} is off the rink (z must be ${b.zMin}..${b.zMax}, goal A at ${GOAL_LINE_FROM_BOARD})`);
  return out.length ? `${out.join('; ')}. ${RINK_FRAME_NOTE}` : null;
}
