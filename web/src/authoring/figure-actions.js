// Ball events a player takes part in (A-BACK-041 step 2), for the player
// moves (pass, receive, shot) that later steps pose. three-free and a pure
// function of the frames, like every pose input (figure-gait.js), so
// seekTo() and the MP4 export see the same moves as live playback.
//
// Timing is ball-pose.js passPlan's: the same release and arrival the ball
// flight uses, never re-derived here.

import { passPlan } from './ball-pose.js';

const mainBall = (scheme) => scheme?.balls?.main ?? null;

// Same fallback as ballPoseAt(): a frame without the main ball keeps the
// previous frame's.
function withBall(fa, fb) {
  const ba = mainBall(fa);
  return mainBall(fb) || !ba ? fb : { ...fb, balls: { ...fb.balls, main: ba } };
}

const carrierIn = (scheme) => {
  const c = mainBall(scheme)?.carrier;
  return c && scheme.players?.[c] ? c : null;
};

const yaw = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);   // rotation.y convention

// { actions, carryIntervals } for chip `id`:
//   actions: sorted by tMs (ms from the start of playback), each
//     { kind: 'pass' | 'shot' | 'receive', tMs, dirYaw, speedMps,
//       partnerId (the other player, or null), aim? (shots: goal, aimX, aimY) }
//     pass / shot: at the release, dirYaw along the flight;
//     receive: at the arrival, dirYaw toward where the ball came from.
//   carryIntervals: [{ fromMs, toMs }] while `id` has the ball; a carrier
//     in the last frame keeps it to Infinity (past the end and in a
//     one-frame doc).
export function actionsFor(frames, id) {
  const actions = [];
  const carry = [];
  if (!frames?.length) return { actions, carryIntervals: carry };
  let acc = 0;
  for (let i = 0; i + 1 < frames.length; i++) {
    const d = frames[i].duration;
    const fa = frames[i].scheme;
    const fb = withBall(fa, frames[i + 1].scheme);
    const plan = passPlan(fa, fb, d);
    if (plan) {
      if (plan.passerId === id) {
        const tMs = acc + plan.releaseT * d;
        const a = { kind: plan.kind, tMs, dirYaw: yaw(plan.from, plan.to), speedMps: plan.speedMps, partnerId: plan.receiverId };
        if (plan.kind === 'shot') a.aim = { goal: plan.goal, aimX: plan.to.x, aimY: plan.aimY };
        actions.push(a);
        carry.push({ fromMs: acc, toMs: tMs });
      }
      if (plan.kind === 'pass' && plan.receiverId === id) {
        const tMs = acc + plan.arriveT * d;
        actions.push({ kind: 'receive', tMs, dirYaw: yaw(plan.to, plan.from), speedMps: plan.speedMps, partnerId: plan.passerId });
        carry.push({ fromMs: tMs, toMs: acc + d });
      }
    } else if (carrierIn(fa) === id) {
      carry.push({ fromMs: acc, toMs: acc + d });
    }
    acc += d;
  }
  if (carrierIn(frames[frames.length - 1].scheme) === id) carry.push({ fromMs: acc, toMs: Infinity });

  actions.sort((a, b) => a.tMs - b.tMs);
  return { actions, carryIntervals: mergeIntervals(carry) };
}

function mergeIntervals(list) {
  const out = [];
  for (const c of [...list].sort((a, b) => a.fromMs - b.fromMs)) {
    const last = out[out.length - 1];
    if (last && c.fromMs <= last.toMs + 1e-9) last.toMs = Math.max(last.toMs, c.toMs);
    else out.push({ ...c });
  }
  return out;
}
