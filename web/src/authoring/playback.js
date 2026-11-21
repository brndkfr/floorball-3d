// Keyframe playback (A4). Interpolates chip / ball / goalie positions
// (linear MVP; bezier arrives in A5) between adjacent frames. The Doc
// stays authoritative for frame content; the scene meshes are just
// re-driven each tick from main.js's animate() loop via tickPlayback().
//
// Playback runs on rAF only. A staged worker heartbeat for tab-hidden
// recording (timer-worker.js) was never wired up and was removed in
// 2026-10; it is in git history if recording needs one.

import * as THREE from 'three';
import { state } from '../state.js';
import { ensureDoc } from './doc.js';
import { getFrames } from './frames.js';
import { camera, topDownCamera, renderer, getActiveCamera, getCameraRig, applyCameraRig } from '../scene.js';
import { normalizeSpeed } from './transport-math.js';
import { captionHolds, stepWithHolds, captionPauseOn } from './caption-hold.js';

const playback = {
  playing: false,
  loop: false,
  speed: 1,      // one of transport-math.js SPEEDS (0.25..2)
  elapsed: 0,    // ms since play() (in playback time, i.e. dt * speed)
  savedFrame: 0, // frame index to restore to when stopping
  savedCamera: null, // pose snapshot restored on stop()
  // True while the meshes show a playback-time pose (playing, paused
  // mid-play, stepped, scrubbed, exported) instead of the edit frame.
  // tickActors() must not write that pose back into the doc; stop() and
  // any frame switch (frames.js afterMutation) clear it.
  previewing: false,
  // Pause on captions (A-BACK-049, caption-hold.js): wall ms left to hold
  // on a noted frame, and the play time of the last hold so it fires once.
  holdLeft: 0,
  heldAt: -1,
};
state.playback = playback;

// Called after every applyPose() (play ticks, seekTo, stepFrame), so
// anything posed from playback time - the animated figures - follows the
// export driver too, which renders right after seekTo() without a tick.
const poseListeners = [];
export function addPoseListener(fn) { poseListeners.push(fn); }

function clearHold() {
  playback.holdLeft = 0;
  playback.heldAt = -1;
}

function advance(dtMs) {
  const holds = captionPauseOn(state.captionPause, ensureDoc()) ? captionHolds(getFrames(), state.lang) : [];
  Object.assign(playback, stepWithHolds(playback, dtMs, playback.speed, holds));
  const total = totalDuration();
  if (playback.elapsed >= total && playback.holdLeft <= 0) {
    if (playback.loop && total > 0) {
      playback.elapsed = playback.elapsed % total;
      clearHold();
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
    clearHold();
  }
  playback.savedFrame = ensureDoc().currentFrame;
  // Snapshot the perspective camera so stop() can put it back where the
  // user left it. Only the perspective cam gets keyframed (top-down is
  // the flat authoring surface); its pose is left alone.
  saveCamera();
  playback.playing = true;
  window.dispatchEvent(new Event('playbackChanged'));
}

function saveCamera() {
  playback.savedCamera = {
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
    fov: camera.fov,
  };
}

export function pause() {
  if (!playback.playing) return;
  playback.playing = false;
  window.dispatchEvent(new Event('playbackChanged'));
}

export function stop() {
  playback.playing = false;
  playback.elapsed = 0;
  clearHold();
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
  playback.speed = normalizeSpeed(n);
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
  clearHold();
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
import { followTargetAt } from './follow-ball.js';
import { applyActorsFromScheme } from './actors.js';
import { cachedGoalieTrack, goalieTrackAt } from '../goalie-track.js';

function applyPose(elapsed) {
  const frames = getFrames();
  if (frames.length === 0) return;
  playback.previewing = true;
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

  // ball: carrier-aware with pass release/flight timing (ball-pose.js); goalies: lerp per goal end.
  if (state.ballGroup) {
    const p = ballPoseAt(fa, fb, t, frames[a].duration);
    if (p) {
      state.ballGroup.position.x = p.x;
      state.ballGroup.position.y = p.y ?? 0;
      state.ballGroup.position.z = p.z;
    }
  }
  const auto = ensureDoc().autoGoalie;   // lessons: this goalie moves by the rules (goalie-track.js)
  for (const letter of ['A', 'B']) {
    const g = state.goalies[letter];
    if (!g) continue;
    if (letter === auto) {
      const p = goalieTrackAt(cachedGoalieTrack(frames, letter), elapsed);
      g.position.x = p.x;
      g.position.z = p.z;
      g.rotation.y = p.yaw;
      continue;
    }
    const ga = fa.goalies?.[letter], gb = fb.goalies?.[letter] || ga;
    if (ga) {
      g.position.x = lerp(ga.x, gb.x, t);
      g.position.z = lerp(ga.z, gb.z, t);
      g.rotation.y = lerpAngle(ga.angle || 0, gb.angle || 0, t);
    }
  }

  if (!applyCamera(elapsed)) applyFollow(elapsed);
  for (const fn of poseListeners) fn(elapsed);
}

// Follow ball (A-BACK-040 step 7): where no camera keyframe applies, the
// perspective camera turns around the ball (follow-ball.js, a function of
// the frames and the time, so the export matches). Direction and distance
// are read from the camera each time, so an orbit drag still works while
// following. A scrub (seekTo without play) snapshots the camera first, so
// stop() puts it back.
function applyFollow(elapsed) {
  if (!state.followBall || state.activeCamera !== camera) return;
  const target = followTargetAt(getFrames(), elapsed);
  if (!target) return;
  if (!playback.savedCamera) saveCamera();
  applyCameraRig({ ...getCameraRig(), tx: target.x, tz: target.z });
}

// Camera keyframes only affect the perspective camera. Frames that have
// no `camera` field are skipped - the interpolator only considers the
// pair of nearest keyframed frames that bracket the current elapsed
// time. Sections with no bracketing keyframe on one side leave the
// camera alone (so a partial-flight authoring is intuitive).
const _qA = new THREE.Quaternion();
const _qB = new THREE.Quaternion();
// Returns true when a keyframe set the camera.
function applyCamera(elapsed) {
  if (state.activeCamera !== camera) return false;
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
  if (prev < 0 && next < 0) return false;
  const kf = frames[prev >= 0 ? prev : next].camera;
  if (prev < 0 || next < 0 || prev === next) {
    camera.position.set(kf.position[0], kf.position[1], kf.position[2]);
    camera.quaternion.set(kf.quaternion[0], kf.quaternion[1], kf.quaternion[2], kf.quaternion[3]);
    if (kf.fov) { camera.fov = kf.fov; camera.updateProjectionMatrix(); }
    return true;
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
  return true;
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
  // Ball + goalie too: else tickActors writes their playback pose into the edit frame.
  applyActorsFromScheme();
  playback.previewing = false;
}

// Clicking the 2D rink while a preview pose is showing goes back to the
// edit frame first, so the gesture edits what the doc holds rather than a
// pose that is never saved. 3D look-around keeps the preview.
renderer.domElement.addEventListener('pointerdown', () => {
  if (playback.previewing && !playback.playing && getActiveCamera() === topDownCamera) stop();
}, true);

export function playbackState() { return playback; }

// { a, b, t } of the segment under the playhead (pass-overlay.js trail).
export function playbackSegment() { return getFrames().length ? segmentAt(playback.elapsed) : null; }

// Position the scene at `elapsed` ms without touching playback flags.
// Used by the offline export driver to render each frame at max speed.
export function seekTo(elapsed) {
  playback.elapsed = Math.max(0, elapsed);
  clearHold();
  applyPose(playback.elapsed);
}

export { frameIndexAt, frameStartTime, totalDuration, bezierPos, segmentControls };
