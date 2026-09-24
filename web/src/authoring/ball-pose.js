// Where the main ball is, derived from each frame's carrier and the pass timing
// (A-BACK-020 / A-BACK-021). three-free so it is Node-testable. A carried ball's
// stored x/z is only its last loose spot, so the carrier must win when set.

import { bezierPos, segmentControls } from './bezier.js';
import { BALL_RADIUS, GOAL_LINE_FROM_BOARD, RINK_L } from '../constants.js';

export const BALL_CARRY_OFFSET = { x: 0, z: 250 };   // "in front of the player"
export const PASS_FLIGHT_S = 0.35;                   // edit-mode hand-off animation
export const DEFAULT_RELEASE_T = 0.5;
export const DEFAULT_PASS_SPEED_MPS = 15;            // estimate, not a sourced figure
export const PASS_LANE_HALF_WIDTH_MM = 400;          // same as passOptions() default in insights.js
export const MIN_PASS_SPEED_MPS = 3;
export const MAX_PASS_SPEED_MPS = 40;
const LANE_SAMPLES = 16;

// --- shots (A-BACK-022) ---
export const GOAL_Z = { A: GOAL_LINE_FROM_BOARD, B: RINK_L - GOAL_LINE_FROM_BOARD };
export const DEFAULT_SHOT_SPEED_MPS = 25;            // estimate, not a sourced figure
export const SHOT_REST_DEPTH = 400;                  // mm behind the goal line where the ball ends up
const MOUTH_HALF_W = 800, MOUTH_H = 1150;             // IFF goal mouth, see generate_goal.py

export function clampAim({ aimX, aimY } = {}) {
  const x = Number.isFinite(aimX) ? aimX : 0;
  const y = Number.isFinite(aimY) ? aimY : MOUTH_H / 2;
  return { aimX: clamp(x, -(MOUTH_HALF_W - BALL_RADIUS), MOUTH_HALF_W - BALL_RADIUS), aimY: clamp(y, BALL_RADIUS, MOUTH_H - BALL_RADIUS) };
}

const restZ = (goal) => (goal === 'A' ? GOAL_Z.A - SHOT_REST_DEPTH : GOAL_Z.B + SHOT_REST_DEPTH);

export function makeShot(goal, aim) {
  const { aimX, aimY } = clampAim(aim);
  return { shot: { goal, aimX, aimY }, rest: { x: aimX, z: restZ(goal) } };
}

// Aim pad as seen by the shooter: u = 0..1 left to right, v = 0..1 bottom to top.
// Facing goal B means facing +z, so the shooter's left is +x; facing A it is -x.
const leftSign = (goal) => (goal === 'B' ? 1 : -1);
export function padToAim(goal, u, v) {
  return clampAim({ aimX: leftSign(goal) * MOUTH_HALF_W * (1 - 2 * u), aimY: v * MOUTH_H });
}
export function aimToPad(goal, aimX, aimY) {
  return { u: (1 - aimX / (leftSign(goal) * MOUTH_HALF_W)) / 2, v: aimY / MOUTH_H };
}

export function shotTargetFrame({ choreoActive, draftCarrierChanged }) {
  return choreoActive && !draftCarrierChanged ? 'draft' : 'new';
}

const validShot = (s) => s && (s.goal === 'A' || s.goal === 'B');

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const withOffset = (p) => ({ x: p.x + BALL_CARRY_OFFSET.x, z: p.z + BALL_CARRY_OFFSET.z });
const lerpPt = (a, b, s) => ({ x: a.x + (b.x - a.x) * s, z: a.z + (b.z - a.z) * s });

// Same bezier playback.js uses for chips, so the ball and the chips agree.
export function chipPosAt(fa, fb, id, t) {
  const pa = fa.players?.[id];
  if (!pa) return null;
  const pb = fb.players?.[id] || pa;
  const [c1x, c1z, c2x, c2z] = segmentControls(pa, pb);
  return { x: bezierPos(pa.x, pb.x, c1x, c2x, t), z: bezierPos(pa.z, pb.z, c1z, c2z, t) };
}

// The pass across fa -> fb, or null when the carrier does not change.
// speedMps m/s is mm/ms, so flight ms = distance mm / speedMps.
export function passPlan(fa, fb, durationMs) {
  const ba = fa.balls?.main, bb = fb.balls?.main;
  if (!ba || !bb) return null;
  const passerId = ba.carrier && fa.players?.[ba.carrier] ? ba.carrier : null;
  const receiverId = bb.carrier && fb.players?.[bb.carrier] ? bb.carrier : null;
  if (passerId === receiverId) return null;
  const shot = !receiverId && passerId && validShot(bb.shot) ? { ...bb.shot, ...clampAim(bb.shot) } : null;

  const stored = bb.pass || {};
  const releaseT = clamp(Number.isFinite(stored.releaseT) ? stored.releaseT : (passerId ? DEFAULT_RELEASE_T : 0), 0, 1);
  const speedMps = clamp(Number.isFinite(stored.speedMps) ? stored.speedMps : (shot ? DEFAULT_SHOT_SPEED_MPS : DEFAULT_PASS_SPEED_MPS), MIN_PASS_SPEED_MPS, MAX_PASS_SPEED_MPS);
  const releaseMark = passerId ? chipPosAt(fa, fb, passerId, releaseT) : { x: ba.x, z: ba.z };
  const from = passerId ? withOffset(releaseMark) : releaseMark;
  const targetAt = (t) => {
    if (shot) return { x: shot.aimX, z: GOAL_Z[shot.goal] };
    return receiverId ? withOffset(chipPosAt(fa, fb, receiverId, t)) : { x: bb.x, z: bb.z };
  };

  // Fixed point: arrival depends on where the (possibly running) receiver is at arrival.
  const dur = Math.max(1, durationMs);
  let arriveT = 1;
  for (let i = 0; i < 8; i++) {
    const to = targetAt(Math.min(arriveT, 1));
    arriveT = releaseT + Math.hypot(to.x - from.x, to.z - from.z) / speedMps / dur;
  }
  const late = arriveT > 1 + 1e-9;
  arriveT = Math.min(arriveT, 1);
  const to = targetAt(arriveT);
  const needMs = Math.hypot(to.x - from.x, to.z - from.z) / speedMps;

  const team = (passerId ? fa.players[passerId] : fb.players[receiverId]).team;
  const blockedBy = [];
  if (arriveT > releaseT) {
    const ids = new Set([...Object.keys(fa.players || {}), ...Object.keys(fb.players || {})]);
    for (const id of ids) {
      const p = fa.players?.[id] || fb.players?.[id];
      if (p.team === team) continue;
      for (let i = 1; i < LANE_SAMPLES; i++) {
        const s = i / LANE_SAMPLES;
        if (s < 0.05 || s > 0.95) continue;   // passer / receiver ends, as in passOptions
        const t = releaseT + (arriveT - releaseT) * s;
        const ball = lerpPt(from, to, s);
        const d = chipPosAt(fa.players?.[id] ? fa : fb, fb, id, t);
        if (Math.hypot(ball.x - d.x, ball.z - d.z) <= PASS_LANE_HALF_WIDTH_MM) { blockedBy.push(id); break; }
      }
    }
  }
  const base = { passerId, receiverId, releaseT, arriveT, late, needMs, speedMps, from, to, releaseMark, blockedBy };
  if (!shot) return { kind: 'pass', ...base };
  const rest = { x: bb.x, z: bb.z };
  const restT = Math.min(1, arriveT + Math.hypot(rest.x - to.x, rest.z - to.z) / speedMps / dur);
  return { kind: 'shot', goal: shot.goal, aimY: shot.aimY, rest, restT, ...base };
}

const onFloor = (p) => ({ x: p.x, y: 0, z: p.z });

export function ballPoseAt(fa, fb, t, durationMs) {
  const ba = fa.balls?.main;
  if (!ba) return null;
  const fbb = fb.balls?.main ? fb : { ...fb, balls: { ...fb.balls, main: ba } };
  const bb = fbb.balls.main;
  const plan = passPlan(fa, fbb, durationMs);
  if (!plan) {
    if (ba.carrier && ba.carrier === bb.carrier && fa.players?.[ba.carrier]) return onFloor(withOffset(chipPosAt(fa, fbb, ba.carrier, t)));
    return onFloor(lerpPt({ x: ba.x, z: ba.z }, { x: bb.x, z: bb.z }, t));
  }
  if (t <= plan.releaseT) return onFloor(plan.passerId ? withOffset(chipPosAt(fa, fbb, plan.passerId, t)) : plan.from);
  if (plan.kind === 'shot') {
    const top = Math.max(0, plan.aimY - BALL_RADIUS);
    if (t < plan.arriveT) {
      const s = (t - plan.releaseT) / (plan.arriveT - plan.releaseT);
      return { ...lerpPt(plan.from, plan.to, s), y: top * s };
    }
    if (t < plan.restT) {
      const s = (t - plan.arriveT) / (plan.restT - plan.arriveT);
      return { ...lerpPt(plan.to, plan.rest, s), y: top * (1 - s) };
    }
    return onFloor(plan.rest);
  }
  if (t >= plan.arriveT) return onFloor(plan.receiverId ? withOffset(chipPosAt(fa, fbb, plan.receiverId, t)) : plan.to);
  return onFloor(lerpPt(plan.from, plan.to, (t - plan.releaseT) / (plan.arriveT - plan.releaseT)));
}

// Release-marker drag: the t on the passer's run closest to a floor point.
export function nearestReleaseT(fa, fb, passerId, point, steps = 200) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i <= steps; i++) {
    const p = chipPosAt(fa, fb, passerId, i / steps);
    const d = Math.hypot(p.x - point.x, p.z - point.z);
    if (d < bestD) { bestD = d; best = i / steps; }
  }
  return best;
}

export function passFlightPos(from, to, elapsedS) {
  const t = Math.min(Math.max(elapsedS / PASS_FLIGHT_S, 0), 1);
  const e = 1 - (1 - t) ** 3;   // ease-out cubic, same feel as walk-tween
  return { pos: lerpPt(from, to, e), done: t >= 1 };
}
