// Shooter's view inset ("Winkelband", A-BACK-047) and Auto position, the
// pure parts: Node-testable, three-free. shooter-inset.js renders the
// inset; kata-section.js has the buttons.

import { GOAL_Z } from './authoring/ball-pose.js';
import { POST_OFFSET_MM } from './kata.js';

export const SHOOTER_INSET_STORAGE_KEY = 'floorball3d.shooterInset';
export const parseShooterInsetShown = (stored) => stored !== '0';

// Estimates, picked by eye: the camera sits a little behind the ball and
// a little above it, so the ball's own lines are not edge-on; the goal
// mouth (1.6 m wide) fills about 55% of the view's width.
const BACK_MM = 400;
const EYE_Y_MM = 250;
const MOUTH_HALF_MM = 800;
const MOUTH_SHARE = 0.55;
const GOAL_CENTRE_Y_MM = 575;   // half the 1.15 m mouth height

// { x, y, z, target: { x, y, z }, fovDeg } for a view `aspect` (w / h) wide.
export function shooterViewPose(ball, goalCenter, aspect) {
  let ax = ball.x - goalCenter.x, az = ball.z - goalCenter.z;
  const len = Math.hypot(ax, az) || 1;
  ax /= len; az /= len;
  const x = ball.x + ax * BACK_MM, z = ball.z + az * BACK_MM, y = EYE_Y_MM;
  const target = { x: goalCenter.x, y: GOAL_CENTRE_Y_MM, z: goalCenter.z };
  const dist = Math.hypot(x - target.x, y - target.y, z - target.z);
  const halfW = MOUTH_HALF_MM / MOUTH_SHARE;
  const vHalf = Math.atan(halfW / dist / (aspect || 1));
  const fovDeg = Math.min(70, Math.max(8, (2 * vHalf * 180) / Math.PI));
  return { x, y, z, target, fovDeg };
}

// Auto position: where and how the goalie should stand for the zone's
// targets (kataTargets), so that judgeKata calls placement, depth and axis
// ok. Free dimensions keep the goalie's own value. { x, z, yaw }.
// Pure so later steps can animate towards it (A-BACK-051).
export function idealGoaliePose({ ball, goal, goalCenter, goalie, targets }) {
  const { placement: pt, depth: dt, axis: at } = targets;
  let { x, z, yaw } = goalie;
  if (dt) {
    const d = (dt.min + dt.max) / 2;
    z = goal === 'B' ? GOAL_Z.B - d : GOAL_Z.A + d;
  }
  if (pt) {
    if (pt.ref === 'goal') x = goalCenter.x;
    else if (pt.ref === 'post') x = goalCenter.x + Math.sign(ball.x - goalCenter.x) * POST_OFFSET_MM;
    else {
      const dz = goalCenter.z - ball.z;
      x = Math.abs(dz) < 1e-6 ? ball.x : ball.x + ((z - ball.z) / dz) * (goalCenter.x - ball.x);
    }
  }
  if (at) yaw = at.ref === 'shot' ? Math.atan2(ball.x - goalCenter.x, ball.z - goalCenter.z) : (goal === 'B' ? Math.PI : 0);
  return { x, z, yaw };
}
