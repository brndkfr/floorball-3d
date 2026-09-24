// Where the main ball is, derived from each frame's carrier (three-free so it is Node-testable).
// A carried ball's stored x/z is only its last loose spot, so the carrier must win when set.

export const BALL_CARRY_OFFSET = { x: 0, z: 250 };   // "in front of the player"
export const PASS_FLIGHT_S = 0.35;

function resolve(scheme, ball) {
  const c = ball.carrier ? scheme.players?.[ball.carrier] : null;
  return c ? { x: c.x + BALL_CARRY_OFFSET.x, z: c.z + BALL_CARRY_OFFSET.z } : { x: ball.x, z: ball.z };
}

// livePos(id) -> the carrier chip's already-interpolated {x, z} this frame, or null.
export function ballPoseAt(fa, fb, t, livePos) {
  const ba = fa.balls?.main;
  if (!ba) return null;
  const bb = fb.balls?.main || ba;
  if (ba.carrier && ba.carrier === bb.carrier && fa.players?.[ba.carrier]) {
    const p = livePos(ba.carrier);
    if (p) return { x: p.x + BALL_CARRY_OFFSET.x, z: p.z + BALL_CARRY_OFFSET.z };
  }
  const a = resolve(fa, ba), b = resolve(fb, bb);
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

export function passFlightPos(from, to, elapsedS) {
  const t = Math.min(Math.max(elapsedS / PASS_FLIGHT_S, 0), 1);
  const e = 1 - (1 - t) ** 3;   // ease-out cubic, same feel as walk-tween
  return { pos: { x: from.x + (to.x - from.x) * e, z: from.z + (to.z - from.z) * e }, done: t >= 1 };
}
