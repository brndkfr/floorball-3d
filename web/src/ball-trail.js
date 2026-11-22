// Ball trail for lesson shots (A-BACK-049): at 720p the ball is a few
// pixels, so a slow-motion shot barely reads. This is the pure part, the
// recent positions of the ball while a shot is in flight; ball-trail-view.js
// draws them. Millimetres, y = ball-centre height.

import { passPlan, ballPoseAt } from './authoring/ball-pose.js';
import { BALL_RADIUS } from './constants.js';

export const TRAIL = Object.freeze({ lengthMs: 400, stepMs: 50 });   // estimates, chosen by eye

// [{ x, y, z, age }] newest first (age 0 = the ball now) for a ball in
// flight after a shot's release at play time `elapsed`; empty before the
// release, after the ball has come to rest, and for anything but a shot.
// Never reaches back before the release.
export function trailPoints(frames, elapsed, { lengthMs = TRAIL.lengthMs, stepMs = TRAIL.stepMs } = {}) {
  if (!frames?.length) return [];
  let acc = 0;
  for (let i = 0; i + 1 < frames.length; i++) {
    const d = frames[i].duration;
    if (elapsed < acc + d) {
      const plan = passPlan(frames[i].scheme, frames[i + 1].scheme, d);
      if (plan?.kind !== 'shot') return [];
      const t = (ms) => (ms - acc) / d;
      if (t(elapsed) < plan.releaseT || t(elapsed) >= plan.restT) return [];
      const out = [];
      for (let age = 0; age <= lengthMs; age += stepMs) {
        const ms = elapsed - age;
        if (t(ms) < plan.releaseT) break;
        const p = ballPoseAt(frames[i].scheme, frames[i + 1].scheme, t(ms), d);
        if (p) out.push({ x: p.x, y: (p.y ?? 0) + BALL_RADIUS, z: p.z, age });
      }
      return out;
    }
    acc += d;
  }
  return [];
}
