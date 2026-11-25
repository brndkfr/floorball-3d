// KATA for the goalie (A-BACK-046): Körper (body), Ausrichtung (placement),
// Tiefe (depth), Achse (axis), after the J+S / swiss unihockey module
// "Goalies - Positionierung". Pure and three-free so it is Node-testable;
// kata-readout.js feeds it the live scene, kata-section.js shows it.
//
// Left / right and turning are the goalie's own, standing in the goal and
// facing out: goal A faces +z (left = +x), goal B faces -z (left = -x).
// rotation.y grows when turning left (CLAUDE.md coordinate conventions).
// Body waits for goalie poses (A-BACK-042): always 'pending' here.

import { GOAL_Z, passPlan } from './authoring/ball-pose.js';

export const KATA_DIMS = ['body', 'placement', 'depth', 'axis'];

const DEG = 180 / Math.PI;
const leftSign = (goal) => (goal === 'B' ? -1 : 1);
const normalYaw = (goal) => (goal === 'B' ? Math.PI : 0);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));   // to (-pi, pi]

// ball / goalCenter / goalie: floor x, z in mm; goalie.yaw = rotation.y.
export function kataOf({ ball, goal, goalCenter, goalie }) {
  const L = leftSign(goal);
  const dz = goalCenter.z - ball.z;
  const lineX = Math.abs(dz) < 1e-6 ? ball.x : ball.x + ((goalie.z - ball.z) / dz) * (goalCenter.x - ball.x);
  const lineYaw = Math.atan2(ball.x - goalCenter.x, ball.z - goalCenter.z);   // goal -> ball
  const side = Math.sign(L * (ball.x - goalCenter.x));
  return {
    placementLeftMm: L * (goalie.x - lineX),         // + = left of the shooting line
    depthMm: goal === 'B' ? GOAL_Z.B - goalie.z : goalie.z - GOAL_Z.A,
    axisDeg: wrap(goalie.yaw - lineYaw) * DEG,       // vs square to the shot; + = turned left of it
    axisToLineDeg: wrap(goalie.yaw - normalYaw(goal)) * DEG,   // vs knees parallel to the goal line
    offsetFromGoalLeftMm: L * (goalie.x - goalCenter.x),
    ballSide: side === 0 ? 0 : side,                 // +1 ball on the goalie's left, -1 right
  };
}

// Target ranges per zone and expected action. ESTIMATES (no figures in the
// module; picked so the module's words come out: "forward, square" for a
// shot, "back, knees parallel" for a pass, "centred, deep, parallel" in
// attention, "feet in the goal, on the line" behind the goal).
// placement.ref: 'line' (shooting line), 'goal' (goal centre), 'post'
// (ball-side post); tol in mm. depth min / max in mm from the goal line.
// axis.ref: 'shot' (square to the shooting line) or 'goalLine' (knees
// parallel to it); tol in degrees.
export const POST_OFFSET_MM = 500;   // goalie centre 0.3 m inside the post (mouth half-width 0.8 m)

// Tight angle (found building the lessons, A-BACK-049): a ball wide and
// close to the goal line is still in the danger zone, but "step forward on
// the shooting line" would put the goalie metres to the side, level with
// the ball. Below this angle between the shooting line and the goal line,
// danger and slot use the passing-first targets (on the line at the
// ball-side post). ESTIMATE, picked by eye; not a figure from the module.
export const TIGHT_ANGLE_DEG = 25;

// Angle in degrees (0 to 90) between the line ball -> goal centre and the
// goal line; 0 when the ball is level with or behind the goal line.
export function shotAngleDeg(ball, goal, goalCenter) {
  const out = goal === 'B' ? goalCenter.z - ball.z : ball.z - goalCenter.z;
  if (out <= 0) return 0;
  return Math.atan2(out, Math.abs(ball.x - goalCenter.x)) * DEG;
}

// angleDeg (optional): shotAngleDeg of the ball; left out, no tight-angle rule.
export function kataTargets(zone, action, angleDeg) {
  if (zone === 'awareness') return { placement: null, depth: null, axis: null };
  if (zone === 'attention') return { placement: { ref: 'goal', tol: 150 }, depth: { min: 0, max: 500 }, axis: { ref: 'goalLine', tol: 15 } };
  if (zone === 'passing' || angleDeg < TIGHT_ANGLE_DEG) return { placement: { ref: 'post', tol: 200 }, depth: { min: 0, max: 200 }, axis: { ref: 'goalLine', tol: 10 } };
  // danger and slot
  if (action === 'pass') return { placement: { ref: 'line', tol: 300 }, depth: { min: 0, max: 500 }, axis: { ref: 'goalLine', tol: 10 } };
  if (action === 'dribble') return { placement: { ref: 'line', tol: 100 }, depth: { min: 700, max: 1600 }, axis: { ref: 'shot', tol: 15 } };
  return { placement: { ref: 'line', tol: 100 }, depth: { min: 700, max: 1600 }, axis: { ref: 'shot', tol: 10 } };
}

const metres = (mm) => String(Math.max(0.1, Math.round(Math.abs(mm) / 100) / 10).toFixed(1));

function placementValue(k, t) {
  if (t.ref === 'goal') return k.offsetFromGoalLeftMm;
  if (t.ref === 'post') return k.offsetFromGoalLeftMm - k.ballSide * POST_OFFSET_MM;
  return k.placementLeftMm;
}

// Per dimension: 'ok' | 'adjust' | 'free' (no target) | 'pending' (body);
// worst = the dimension furthest out of range (relative to its tolerance),
// or null; hint = { key, vars } for i18n.js, one sentence for the worst.
export function judgeKata(k, targets) {
  const status = { body: 'pending' };
  const off = {};   // dim -> { ratio, hint }

  const pt = targets.placement;
  if (!pt) status.placement = 'free';
  else {
    const v = placementValue(k, pt);
    const excess = Math.abs(v) - pt.tol;
    status.placement = excess > 0 ? 'adjust' : 'ok';
    if (excess > 0) off.placement = { ratio: excess / pt.tol, hint: { key: `goalie.hint.placement.${v > 0 ? 'right' : 'left'}`, vars: { m: metres(v) } } };
  }

  const dt = targets.depth;
  if (!dt) status.depth = 'free';
  else {
    const below = dt.min - k.depthMm, above = k.depthMm - dt.max;
    const excess = Math.max(below, above);
    status.depth = excess > 0 ? 'adjust' : 'ok';
    if (excess > 0) off.depth = { ratio: excess / 300, hint: { key: `goalie.hint.depth.${below > 0 ? 'forward' : 'back'}`, vars: { m: metres(excess) } } };
  }

  const at = targets.axis;
  if (!at) status.axis = 'free';
  else {
    const v = at.ref === 'shot' ? k.axisDeg : k.axisToLineDeg;
    const excess = Math.abs(v) - at.tol;
    status.axis = excess > 0 ? 'adjust' : 'ok';
    const kind = at.ref === 'shot' ? 'square' : 'parallel';
    if (excess > 0) off.axis = { ratio: excess / at.tol, hint: { key: `goalie.hint.axis.${kind}.${v > 0 ? 'right' : 'left'}`, vars: { deg: Math.round(Math.abs(v)) } } };
  }

  const worst = Object.keys(off).sort((a, b) => off[b].ratio - off[a].ratio)[0] ?? null;
  const allFree = !pt && !dt && !at;
  const hint = worst ? off[worst].hint : { key: allFree ? 'goalie.hint.free' : 'goalie.hint.ok', vars: {} };
  return { status, worst, hint };
}

// --- expected action (A-Q-009): the play's next ball event ------------------

const withBall = (fa, fb) => (fb.balls?.main || !fa.balls?.main ? fb : { ...fb, balls: { ...fb.balls, main: fa.balls.main } });
const carrierIn = (s) => { const c = s?.balls?.main?.carrier; return c && s.players?.[c] ? c : null; };

// The ball the KATA card grades against (A-BACK-049, decided 2026-11-22):
// from a shot's release until its keyframe's own time ends, the release
// point, so a goal in the net reads the goalie's stance when the shot was
// taken, not the ball behind it. Any other time: the live ball.
export function kataBall(frames, elapsedMs, liveBall) {
  if (!frames?.length) return liveBall;
  let acc = 0;
  let hit = null;   // the latest shot released by now wins
  for (let i = 0; i + 1 < frames.length && acc <= elapsedMs; i++) {
    const d = frames[i].duration;
    const end = acc + d + frames[i + 1].duration;   // the shot keyframe's own time ends here
    if (elapsedMs < end) {
      const plan = passPlan(frames[i].scheme, frames[i + 1].scheme, d);
      if (plan?.kind === 'shot' && elapsedMs >= acc + plan.releaseT * d) hit = { x: plan.from.x, z: plan.from.z };
    }
    acc += d;
  }
  return hit ?? liveBall;
}

// 'shot' | 'pass' from the next pass or shot released at or after
// elapsedMs; 'dribble' when a player carries the ball and nothing follows;
// 'shot' otherwise (a loose ball near goal is the shot to fear).
export function expectedAction(frames, elapsedMs = 0) {
  if (!frames?.length) return 'shot';
  let acc = 0;
  let current = frames[frames.length - 1].scheme;
  for (let i = 0; i < frames.length; i++) {
    const d = frames[i].duration;
    if (elapsedMs >= acc && elapsedMs < acc + d) current = frames[i].scheme;
    if (i + 1 < frames.length) {
      const plan = passPlan(frames[i].scheme, withBall(frames[i].scheme, frames[i + 1].scheme), d);
      if (plan && acc + plan.releaseT * d >= elapsedMs) return plan.kind === 'shot' ? 'shot' : 'pass';
    }
    acc += d;
  }
  return carrierIn(current) ? 'dribble' : 'shot';
}
