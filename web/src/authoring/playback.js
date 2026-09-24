// Keyframe playback (A4). Interpolates chip / ball / goalie positions
// (linear MVP; bezier arrives in A5) between adjacent frames. The Doc
// stays authoritative for frame content; the scene meshes are just
// re-driven each tick from main.js's animate() loop via tickPlayback().
//
// timer-worker.js is left in the tree as the future recording heartbeat
// for A6 - the visible-tab path only needs rAF.

import * as THREE from 'three';
import { state } from '../state.js';
import { ensureDoc } from './doc.js';
import { getFrames } from './frames.js';
import { camera, topDownCamera } from '../scene.js';

const playback = {
  playing: false,
  loop: false,
  speed: 1,      // 1..9 multiplier
  elapsed: 0,    // ms since play() (in playback time, i.e. dt * speed)
  savedFrame: 0, // frame index to restore to when stopping
  savedCamera: null, // pose snapshot restored on stop()
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
  // Snapshot the perspective camera so stop() can put it back where the
  // user left it. Only the perspective cam gets keyframed (top-down is
  // the flat authoring surface); its pose is left alone.
  playback.savedCamera = {
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
    fov: camera.fov,
  };
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
  if (playback.savedCamera) {
    camera.position.copy(playback.savedCamera.position);
    camera.quaternion.copy(playback.savedCamera.quaternion);
    camera.fov = playback.savedCamera.fov;
    camera.updateProjectionMatrix();
    playback.savedCamera = null;
  }
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

// Cubic Bezier evaluation + segment-control resolution + shortest-path
// angle lerp live in ./bezier.js so they can be unit-tested without the
// three.js graph.
import { bezierPos, segmentControls, lerpAngle } from './bezier.js';
import { ballPoseAt } from './ball-pose.js';

function applyPose(elapsed) {
  const frames = getFrames();
  if (frames.length === 0) return;
  const { a, b, t } = segmentAt(elapsed);
  const fa = frames[a].scheme, fb = frames[b].scheme;

  // chips: cubic-bezier interpolate position, linear angle. Missing
  // control points fall back to the straight-line degenerate case.
  for (const g of state.chipGroups) {
    const id = g.userData?.chip?.id;
    if (!id) continue;
    const pa = fa.players[id], pb = fb.players[id] || pa;
    if (!pa) continue;
    const [c1x, c1z, c2x, c2z] = segmentControls(pa, pb);
    g.position.x = bezierPos(pa.x, pb.x, c1x, c2x, t);
    g.position.z = bezierPos(pa.z, pb.z, c1z, c2z, t);
    g.rotation.y = lerpAngle(pa.angle || 0, pb.angle || 0, t);
  }

  // ball: carrier-aware with pass release/flight timing (ball-pose.js); goalie: lerp.
  if (state.ballGroup) {
    const p = ballPoseAt(fa, fb, t, frames[a].duration);
    if (p) {
      state.ballGroup.position.x = p.x;
      state.ballGroup.position.z = p.z;
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

  applyCamera(elapsed);
}

// Camera keyframes only affect the perspective camera. Frames that have
// no `camera` field are skipped - the interpolator only considers the
// pair of nearest keyframed frames that bracket the current elapsed
// time. Sections with no bracketing keyframe on one side leave the
// camera alone (so a partial-flight authoring is intuitive).
const _qA = new THREE.Quaternion();
const _qB = new THREE.Quaternion();
function applyCamera(elapsed) {
  if (state.activeCamera !== camera) return;
  const frames = getFrames();
  // Precompute each frame's start time (cheap; small N).
  let acc = 0;
  const times = new Array(frames.length);
  for (let i = 0; i < frames.length; i++) { times[i] = acc; acc += frames[i].duration; }
  let prev = -1, next = -1;
  for (let i = 0; i < frames.length; i++) {
    if (!frames[i].camera || frames[i].camera.mode !== 'perspective') continue;
    if (times[i] <= elapsed) prev = i;
    if (times[i] >= elapsed && next === -1) next = i;
  }
  if (prev < 0 && next < 0) return;
  const kf = frames[prev >= 0 ? prev : next].camera;
  if (prev < 0 || next < 0 || prev === next) {
    camera.position.set(kf.position[0], kf.position[1], kf.position[2]);
    camera.quaternion.set(kf.quaternion[0], kf.quaternion[1], kf.quaternion[2], kf.quaternion[3]);
    if (kf.fov) { camera.fov = kf.fov; camera.updateProjectionMatrix(); }
    return;
  }
  const a = frames[prev].camera, b = frames[next].camera;
  const span = times[next] - times[prev];
  const t = span > 0 ? (elapsed - times[prev]) / span : 0;
  camera.position.set(
    lerp(a.position[0], b.position[0], t),
    lerp(a.position[1], b.position[1], t),
    lerp(a.position[2], b.position[2], t),
  );
  _qA.set(a.quaternion[0], a.quaternion[1], a.quaternion[2], a.quaternion[3]);
  _qB.set(b.quaternion[0], b.quaternion[1], b.quaternion[2], b.quaternion[3]);
  camera.quaternion.slerpQuaternions(_qA, _qB, t);
  if (a.fov && b.fov) { camera.fov = lerp(a.fov, b.fov, t); camera.updateProjectionMatrix(); }
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

// { a, b, t } of the segment under the playhead (pass-overlay.js trail).
export function playbackSegment() { return getFrames().length ? segmentAt(playback.elapsed) : null; }

// Position the scene at `elapsed` ms without touching playback flags.
// Used by the offline export driver to render each frame at max speed.
export function seekTo(elapsed) {
  playback.elapsed = Math.max(0, elapsed);
  applyPose(playback.elapsed);
}

export { frameIndexAt, frameStartTime, totalDuration, bezierPos, segmentControls };
