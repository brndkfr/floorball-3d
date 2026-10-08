// Kit mask for the Quaternius player figure (A-BACK-031), used by
// prepare_player_figure.mjs. The base body has no clothes beyond boxers,
// so each vertex gets a [shirt, shorts] weight from its bind-pose (T-pose)
// position; the app tints those regions with the team colour at runtime.
// A proper modelled jersey is A-BACK-033 - this is the cheap stand-in.
//
// Coordinates: metres, +Y up, +Z = facing, +X = the figure's left, origin
// between the feet. Landmarks are the skin joints of
// Superhero_Male_FullBody.gltf (inverse bind matrices); the sleeve /
// hem / neckline offsets from them are estimates, tuned by eye.

export const KIT_LANDMARKS = {
  neckY: 1.521,      // neck_01
  shoulderY: 1.456,  // upperarm_l/_r (arms are horizontal in the T-pose)
  shoulderX: 0.212,  // upperarm_l
  elbowX: 0.463,     // lowerarm_l
  hipY: 0.949,       // pelvis
  kneeY: 0.542,      // calf_l
};

const L = KIT_LANDMARKS;
const NECKLINE_Y = L.neckY - 0.04;             // collar a bit below the neck joint
const NECK_HALF_WIDTH = 0.09;                  // outside this the shirt covers the shoulder tops
const SHOULDER_TOP_Y = L.neckY + 0.06;
const SLEEVE_END_X = L.shoulderX + (L.elbowX - L.shoulderX) * 0.6; // short sleeve
const ARM_HALF_THICKNESS = 0.11;               // around the arm's horizontal axis
const TORSO_HALF_WIDTH = L.shoulderX + 0.03;   // armpit edge
const HEM_Y = L.hipY + 0.02;                   // shirt hem / shorts waistband
const SHORTS_END_Y = L.kneeY + 0.12;           // a hand above the knee

// Returns [shirt, shorts], each 0 or 1, never both 1.
export function kitWeights(x, y, z) {
  const ax = Math.abs(x);
  const topY = ax > NECK_HALF_WIDTH ? SHOULDER_TOP_Y : NECKLINE_Y;
  const torso = ax <= TORSO_HALF_WIDTH && y >= HEM_Y && y <= topY;
  const sleeve = ax > TORSO_HALF_WIDTH - 0.01 && ax <= SLEEVE_END_X
    && y >= L.shoulderY - ARM_HALF_THICKNESS && y <= SHOULDER_TOP_Y;
  if (torso || sleeve) return [1, 0];
  const shorts = y < HEM_Y && y >= SHORTS_END_Y && ax <= TORSO_HALF_WIDTH + 0.05;
  return shorts ? [0, 1] : [0, 0];
}
