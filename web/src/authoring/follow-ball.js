// Follow ball (A-BACK-040 step 7): in playback the 3D camera's target
// follows the ball. Pure (three-free) so it is Node-testable. The target is
// a function of the frames and the playback time only (the mean ball
// position over the last FOLLOW_WINDOW_MS), not a per-frame low-pass, so
// seekTo() and the MP4 export show the same picture as live playback.

import { ballPoseAt } from './ball-pose.js';

export const FOLLOW_WINDOW_MS = 600;   // estimate: long enough to smooth a pass, short enough to keep up
const SAMPLES = 13;

// Ball position at `elapsedMs` of playback, the same segment walk as
// playback.js segmentAt(): past the end, the last frame. null without a
// main ball.
export function ballAtTime(frames, elapsedMs) {
  if (!frames.length) return null;
  let acc = 0;
  for (let i = 0; i < frames.length - 1; i++) {
    const d = frames[i].duration;
    if (elapsedMs < acc + d) {
      const p = ballPoseAt(frames[i].scheme, frames[i + 1].scheme, (elapsedMs - acc) / d, d);
      return p && { x: p.x, z: p.z };
    }
    acc += d;
  }
  const last = frames[frames.length - 1];
  const p = ballPoseAt(last.scheme, last.scheme, 0, last.duration);
  return p && { x: p.x, z: p.z };
}

// The camera target: the mean ball position over [elapsed - window,
// elapsed], the window cut at the start of playback.
export function followTargetAt(frames, elapsedMs) {
  const from = Math.max(0, elapsedMs - FOLLOW_WINDOW_MS);
  let x = 0, z = 0, n = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const p = ballAtTime(frames, from + ((elapsedMs - from) * i) / (SAMPLES - 1));
    if (!p) continue;
    x += p.x; z += p.z; n++;
  }
  return n ? { x: x / n, z: z / n } : null;
}
