// KATA marks on the rink (A-BACK-046 follow-up, mock: third row of
// https://claude.ai/artifact/Dvebi8ZfC8rea9WpHEdm16). Pure and three-free so
// it is Node-testable; kata-marks-layer.js draws it. World mm, floor x / z.
//
//   band       where to stand: on the reference line (shooting line, goal
//              centre or ball-side post, kata.js placement.ref) between the
//              target depths, +/- the placement tolerance
//   footprint  the ideal spot: the band's middle
//   rays       where the goalie faces now and where it should face, the arc
//              between them, and the turn in degrees (+ = turn left, as
//              kata.js: rotation.y grows turning left)
//   offset     goalie -> reference line at its own depth, when placement is off
// Statuses come from judgeKata(): 'ok' draws green, 'adjust' yellow.

import { GOAL_Z } from './authoring/ball-pose.js';
import { POST_OFFSET_MM } from './kata.js';

export const RAY_MM = 2000;              // estimate: long enough to read, short of the slot
export const MIN_BAND_HALF_MM = 150;     // estimate: the tightest tolerance (0.1 m) is too thin to see
const ARC_RADIUS = 0.7 * RAY_MM;
const ARC_POINTS = 9;

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const ahead = (from, yaw, len) => ({ x: from.x + Math.sin(yaw) * len, z: from.z + Math.cos(yaw) * len });

export function kataMarks({ ball, goal, goalCenter, goalie, targets, judged }) {
  const zAt = (d) => (goal === 'B' ? GOAL_Z.B - d : GOAL_Z.A + d);
  const pt = targets.placement;
  const side = Math.sign(ball.x - goalCenter.x);
  // x of the reference line at world z
  const refX = (z) => {
    if (!pt || pt.ref === 'goal') return goalCenter.x;
    if (pt.ref === 'post') return goalCenter.x + side * POST_OFFSET_MM;
    const dz = goalCenter.z - ball.z;
    return Math.abs(dz) < 1e-6 ? ball.x : ball.x + ((z - ball.z) / dz) * (goalCenter.x - ball.x);
  };

  let band = null, footprint = null;
  const dt = targets.depth;
  if (pt && dt) {
    const h = Math.max(pt.tol, MIN_BAND_HALF_MM);
    const z0 = zAt(dt.min), z1 = zAt(dt.max);
    const inside = judged.status.placement === 'ok' && judged.status.depth === 'ok';
    band = {
      corners: [{ x: refX(z0) - h, z: z0 }, { x: refX(z0) + h, z: z0 }, { x: refX(z1) + h, z: z1 }, { x: refX(z1) - h, z: z1 }],
      inside,
      status: inside ? 'ok' : 'adjust',
    };
    const zm = zAt((dt.min + dt.max) / 2);
    footprint = { x: refX(zm), z: zm };
  }

  const at = targets.axis;
  const from = { x: goalie.x, z: goalie.z };
  const current = { from, to: ahead(from, goalie.yaw, RAY_MM) };
  let target = null, arc = [], turnDeg = 0;
  if (at) {
    const yaw = at.ref === 'shot' ? Math.atan2(ball.x - goalCenter.x, ball.z - goalCenter.z) : (goal === 'B' ? Math.PI : 0);
    target = { from, to: ahead(from, yaw, RAY_MM) };
    const delta = wrap(yaw - goalie.yaw);
    turnDeg = (delta * 180) / Math.PI;
    for (let i = 0; i < ARC_POINTS; i++) arc.push(ahead(from, goalie.yaw + (delta * i) / (ARC_POINTS - 1), ARC_RADIUS));
  }
  const rays = { current, target, arc, turnDeg, status: judged.status.axis === 'adjust' ? 'adjust' : 'ok' };

  let offset = null;
  if (judged.status.placement === 'adjust') {
    const to = { x: refX(goalie.z), z: goalie.z };
    offset = { from, to, m: Math.abs(goalie.x - to.x) / 1000 };
  }

  return { band, footprint, rays, offset };
}

// The Marks toggle in the KATA card: on by default, remembered per browser.
export const KATA_MARKS_STORAGE_KEY = 'floorball3d.kataMarks';
export const parseKataMarksShown = (stored) => stored !== '0';
