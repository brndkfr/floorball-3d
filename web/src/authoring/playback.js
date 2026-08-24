// Keyframe playback (A4). Interpolates chip / ball / goalie positions
// (linear MVP; bezier arrives in A5) between adjacent frames. The Doc
// stays authoritative for frame content; the scene meshes are just
// re-driven each tick from main.js's animate() loop via tickPlayback().
//
// timer-worker.js is left in the tree as the future recording heartbeat
// for A6 - the visible-tab path only needs rAF.

import { state } from '../state.js';
import { ensureDoc } from './doc.js';
import { getFrames } from './frames.js';

const playback = {
  playing: false,
  loop: false,
  speed: 1,      // 1..9 multiplier
  elapsed: 0,    // ms since play() (in playback time, i.e. dt * speed)
  savedFrame: 0, // frame index to restore to when stopping
};
state.playback = playback;

function advance(dtMs) {
  playback.elapsed += dtMs * playback.speed;
  const total = totalDuration();
  if (playback.elapsed >= total) {
    if (playback.loop && total > 0) {
      playback.elapsed = playback.elapsed % total;
    } else {
      playback.elapsed = total;
      pause();
    }
  }
  applyPose(playback.elapsed);
}

// Called from main.js's animate() with dt in ms.
export function tickPlayback(dtMs) {
  if (!playback.playing) return;
  advance(dtMs);
}

// --- transport controls ----------------------------------------------

export function play() {
  if (playback.playing) return;
  ensureDoc();
  // If we're already at the end and not looping, rewind first.
  if (playback.elapsed >= totalDuration() && !playback.loop) {
    playback.elapsed = 0;
  }
  playback.savedFrame = ensureDoc().currentFrame;
  playback.playing = true;
  window.dispatchEvent(new Event('playbackChanged'));
}

export function pause() {
  if (!playback.playing) return;
  playback.playing = false;
  window.dispatchEvent(new Event('playbackChanged'));
}

export function stop() {
  playback.playing = false;
  playback.elapsed = 0;
  restoreEditFrame();
  window.dispatchEvent(new Event('playbackChanged'));
}

export function toggle() { playback.playing ? pause() : play(); }

export function setSpeed(n) {
  playback.speed = Math.min(Math.max(n | 0, 1), 9);
  window.dispatchEvent(new Event('playbackChanged'));
}

export function toggleLoop() {
  playback.loop = !playback.loop;
  window.dispatchEvent(new Event('playbackChanged'));
}

// Step to previous/next keyframe. Snaps playback.elapsed to that frame's
// start time so the transport UI stays in sync.
export function stepFrame(delta) {
  const frames = getFrames();
  const cur = frameIndexAt(playback.elapsed);
  const next = Math.min(Math.max(cur + delta, 0), frames.length - 1);
  playback.elapsed = frameStartTime(next);
  applyPose(playback.elapsed);
  window.dispatchEvent(new Event('playbackChanged'));
}

// --- interpolation core ----------------------------------------------

function totalDuration() {
  const frames = getFrames();
  if (frames.length < 2) return 0;
  let sum = 0;
  for (let i = 0; i < frames.length - 1; i++) sum += frames[i].duration;
  return sum;
}

function frameStartTime(i) {
  const frames = getFrames();
  let t = 0;
  for (let k = 0; k < i && k < frames.length - 1; k++) t += frames[k].duration;
  return t;
}

function frameIndexAt(elapsed) {
  const frames = getFrames();
  let t = 0;
  for (let i = 0; i < frames.length - 1; i++) {
    if (elapsed < t + frames[i].duration) return i;
    t += frames[i].duration;
  }
  return frames.length - 1;
}

// Returns { a, b, t } where a/b are frame indices and t is 0..1 across
// the (a -> b) transition. If we're past the last frame (and not looping),
// returns { a: last, b: last, t: 0 }.
function segmentAt(elapsed) {
  const frames = getFrames();
  if (frames.length < 2) return { a: 0, b: 0, t: 0 };
  let acc = 0;
  for (let i = 0; i < frames.length - 1; i++) {
    const d = frames[i].duration;
    if (elapsed < acc + d) return { a: i, b: i + 1, t: (elapsed - acc) / d };
    acc += d;
  }
  return { a: frames.length - 1, b: frames.length - 1, t: 0 };
}

function lerp(a, b, t) { return a + (b - a) * t; }

// Shortest-path lerp for angles in radians (so a chip doesn't take the
// long way around when its heading crosses -PI / +PI).
function lerpAngle(a, b, t) {
  let d = b - a;
  d = ((d + Math.PI) % (2 * Math.PI)) - Math.PI;
  return a + d * t;
}

function applyPose(elapsed) {
  const frames = getFrames();
  if (frames.length === 0) return;
  const { a, b, t } = segmentAt(elapsed);
  const fa = frames[a].scheme, fb = frames[b].scheme;

  // chips: linear interpolate position + angle by player id
  for (const g of state.chipGroups) {
    const id = g.userData?.chip?.id;
    if (!id) continue;
    const pa = fa.players[id], pb = fb.players[id] || pa;
    if (!pa) continue;
    g.position.x = lerp(pa.x, pb.x, t);
    g.position.z = lerp(pa.z, pb.z, t);
    g.rotation.y = lerpAngle(pa.angle || 0, pb.angle || 0, t);
  }

  // ball & goalie: interpolate if a frame carries their position
  if (state.ballGroup) {
    const ba = fa.balls?.main, bb = fb.balls?.main || ba;
    if (ba) {
      state.ballGroup.position.x = lerp(ba.x, bb.x, t);
      state.ballGroup.position.z = lerp(ba.z, bb.z, t);
    }
  }
  if (state.goalieGroup) {
    const ga = fa.goalie, gb = fb.goalie || ga;
    if (ga) {
      state.goalieGroup.position.x = lerp(ga.x, gb.x, t);
      state.goalieGroup.position.z = lerp(ga.z, gb.z, t);
      state.goalieGroup.rotation.y = lerpAngle(ga.angle || 0, gb.angle || 0, t);
    }
  }
}

function restoreEditFrame() {
  // Snap chip / ball / goalie back to the frame the user was editing.
  const doc = ensureDoc();
  const scheme = doc.frames[playback.savedFrame]?.scheme;
  if (!scheme) return;
  for (const g of state.chipGroups) {
    const id = g.userData?.chip?.id;
    const p = id && scheme.players[id];
    if (!p) continue;
    g.position.set(p.x, 0, p.z);
    g.rotation.y = p.angle || 0;
  }
}

export function playbackState() { return playback; }
export { frameIndexAt, frameStartTime, totalDuration };
