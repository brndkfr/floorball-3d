// World-space rink landmarks (mm) the user can click on a photo to
// calibrate the camera. Coordinates duplicate generate_rink.py's marking
// geometry (crease/goal-line/face-off dimensions) rather than importing it
// (it's a Python generator) - keep these in sync if that script's constants
// ever change, same as the other "must stay in sync" duplicated dimensions
// noted in CLAUDE.md.
import { RINK_L, HALF_W, GOAL_LINE_FROM_BOARD } from '../../constants.js';

const CREASE_NEAR = 2850;
const CREASE_DEPTH = 4000;
const CREASE_HALF_W = 2500;
const FACEOFF_FROM_SIDE = 1500;
const POST_HALF_W = 800;   // matches constants.js's GOAL_MOUTH_CORNERS_LOCAL
const POST_HEIGHT = 1150;
const BOARD_R = 2000;      // matches generate_rink.py's BOARD_R (corner radius)
const BOARD_H = 500;       // matches generate_rink.py's BOARD_H (board height)

// Rink markings are symmetric about x=0 at both ends, independent of goal
// mesh orientation - so landmarks are plain absolute world coordinates,
// not derived from the goal Object3Ds in layers.js.
function endLandmarks(prefix, boardZ, sign) {
  const into = (d) => boardZ + sign * d;
  const creaseNear = into(CREASE_NEAR);
  const creaseFar = into(CREASE_NEAR + CREASE_DEPTH);
  const goalLineZ = into(GOAL_LINE_FROM_BOARD);
  return {
    [`${prefix}_creaseNearL`]: [-CREASE_HALF_W, 0, creaseNear],
    [`${prefix}_creaseNearR`]: [CREASE_HALF_W, 0, creaseNear],
    [`${prefix}_creaseFarL`]: [-CREASE_HALF_W, 0, creaseFar],
    [`${prefix}_creaseFarR`]: [CREASE_HALF_W, 0, creaseFar],
    [`${prefix}_postL`]: [-POST_HALF_W, 0, goalLineZ],
    [`${prefix}_postR`]: [POST_HALF_W, 0, goalLineZ],
    [`${prefix}_postTopL`]: [-POST_HALF_W, POST_HEIGHT, goalLineZ],
    [`${prefix}_postTopR`]: [POST_HALF_W, POST_HEIGHT, goalLineZ],
    [`${prefix}_faceoffL`]: [-(HALF_W - FACEOFF_FROM_SIDE), 0, goalLineZ],
    [`${prefix}_faceoffR`]: [HALF_W - FACEOFF_FROM_SIDE, 0, goalLineZ],
  };
}

// Two post-top landmarks per end are non-coplanar with the floor - that's
// deliberate, it's what keeps solvePnP out of the planar-only degenerate
// case (see docs/photo-overlay-plan.md Phase 1 step 2).
export const WORLD_LANDMARKS = {
  ...endLandmarks('goalA', 0, +1),
  ...endLandmarks('goalB', RINK_L, -1),
  centreSpot: [0, 0, RINK_L / 2],
  centreFaceoffL: [-(HALF_W - FACEOFF_FROM_SIDE), 0, RINK_L / 2],
  centreFaceoffR: [HALF_W - FACEOFF_FROM_SIDE, 0, RINK_L / 2],
  // Board landmarks - crucial for pinning down the pose away from the goal
  // cluster (otherwise a small angular error at the goal fans out into a
  // big pixel offset at the far boards). Tangent points are where the
  // straight long-side boards meet the rounded corner arcs.
  boardCentreL: [-HALF_W, 0, RINK_L / 2],
  boardCentreR: [HALF_W, 0, RINK_L / 2],
  goalA_boardTangentL: [-HALF_W, 0, BOARD_R],
  goalA_boardTangentR: [HALF_W, 0, BOARD_R],
  goalB_boardTangentL: [-HALF_W, 0, RINK_L - BOARD_R],
  goalB_boardTangentR: [HALF_W, 0, RINK_L - BOARD_R],
  // Same 6 points at board TOP (y=500). Board top is usually a crisp edge
  // against the crowd/hall background even when the floor line is in
  // shadow or occluded by players. Mixing y=0 and y=500 landmarks also
  // gives solvePnP a non-planar set for roll/pitch stability.
  boardCentreL_top: [-HALF_W, BOARD_H, RINK_L / 2],
  boardCentreR_top: [HALF_W, BOARD_H, RINK_L / 2],
  goalA_boardTangentL_top: [-HALF_W, BOARD_H, BOARD_R],
  goalA_boardTangentR_top: [HALF_W, BOARD_H, BOARD_R],
  goalB_boardTangentL_top: [-HALF_W, BOARD_H, RINK_L - BOARD_R],
  goalB_boardTangentR_top: [HALF_W, BOARD_H, RINK_L - BOARD_R],
};

export const LANDMARK_LABELS = {
  goalA_creaseNearL: 'Goal A - crease near-left', goalA_creaseNearR: 'Goal A - crease near-right',
  goalA_creaseFarL: 'Goal A - crease far-left', goalA_creaseFarR: 'Goal A - crease far-right',
  goalA_postL: 'Goal A - left post (base)', goalA_postR: 'Goal A - right post (base)',
  goalA_postTopL: 'Goal A - left post (top)', goalA_postTopR: 'Goal A - right post (top)',
  goalA_faceoffL: 'Goal A - left face-off dot', goalA_faceoffR: 'Goal A - right face-off dot',
  goalB_creaseNearL: 'Goal B - crease near-left', goalB_creaseNearR: 'Goal B - crease near-right',
  goalB_creaseFarL: 'Goal B - crease far-left', goalB_creaseFarR: 'Goal B - crease far-right',
  goalB_postL: 'Goal B - left post (base)', goalB_postR: 'Goal B - right post (base)',
  goalB_postTopL: 'Goal B - left post (top)', goalB_postTopR: 'Goal B - right post (top)',
  goalB_faceoffL: 'Goal B - left face-off dot', goalB_faceoffR: 'Goal B - right face-off dot',
  centreSpot: 'Centre spot',
  centreFaceoffL: 'Centre-line - left face-off dot', centreFaceoffR: 'Centre-line - right face-off dot',
  boardCentreL: 'Board - left side at centre line', boardCentreR: 'Board - right side at centre line',
  goalA_boardTangentL: 'Board - Goal A end, left corner tangent',
  goalA_boardTangentR: 'Board - Goal A end, right corner tangent',
  goalB_boardTangentL: 'Board - Goal B end, left corner tangent',
  goalB_boardTangentR: 'Board - Goal B end, right corner tangent',
  boardCentreL_top: 'Board TOP - left side at centre line',
  boardCentreR_top: 'Board TOP - right side at centre line',
  goalA_boardTangentL_top: 'Board TOP - Goal A end, left corner tangent',
  goalA_boardTangentR_top: 'Board TOP - Goal A end, right corner tangent',
  goalB_boardTangentL_top: 'Board TOP - Goal B end, left corner tangent',
  goalB_boardTangentR_top: 'Board TOP - Goal B end, right corner tangent',
};

export const MIN_LANDMARKS = 6;
export const RECOMMENDED_LANDMARKS = 8;
