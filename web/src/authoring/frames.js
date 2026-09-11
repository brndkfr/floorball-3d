// Frame CRUD for the animation timeline (A4). All operations mutate
// state.doc.frames, then rebuild the on-screen scene from the (possibly
// new) current frame and push to history so undo/redo cover frame edits
// too.

import { state } from '../state.js';
import { ensureDoc, emptyFrame } from './doc.js';
import { rebuildFromDoc } from './chips.js';
import { rebuildShapesFromDoc } from './shapes.js';
import { rebuildConesFromDoc } from './cones.js';
import { saveDoc } from './storage.js';
import { applyActorsFromScheme } from './actors.js';

function afterMutation(pushHistory = true) {
  saveDoc();
  rebuildFromDoc();
  rebuildShapesFromDoc();
  rebuildConesFromDoc();
  applyActorsFromScheme();
  if (pushHistory) import('./history.js').then((h) => h.pushHistory());
  window.dispatchEvent(new Event('framesChanged'));
}

export function getFrames() {
  return ensureDoc().frames;
}

export function getCurrentIndex() {
  return ensureDoc().currentFrame;
}

export function selectFrame(i) {
  const doc = ensureDoc();
  if (i < 0 || i >= doc.frames.length) return;
  if (doc.currentFrame === i) return;
  doc.currentFrame = i;
  afterMutation();
}

// Duplicate frame at `srcIdx` (deep clone its scheme) and insert it at
// `insertAt`. Returns the new frame's index. Ids inside the cloned scheme
// stay the same so per-element interpolation can pair them up.
export function duplicateFrame(srcIdx = getCurrentIndex(), insertAt = srcIdx + 1) {
  const doc = ensureDoc();
  const src = doc.frames[srcIdx];
  if (!src) return -1;
  const clone = emptyFrame(structuredClone(src.scheme), src.duration);
  doc.frames.splice(insertAt, 0, clone);
  doc.currentFrame = insertAt;
  afterMutation();
  return insertAt;
}

export function insertBlankFrame(at) {
  const doc = ensureDoc();
  const idx = Math.min(Math.max(at, 0), doc.frames.length);
  doc.frames.splice(idx, 0, emptyFrame());
  doc.currentFrame = idx;
  afterMutation();
  return idx;
}

export function deleteFrame(i) {
  const doc = ensureDoc();
  if (doc.frames.length <= 1) return false;   // must always keep frame 0
  if (i < 0 || i >= doc.frames.length) return false;
  doc.frames.splice(i, 1);
  if (doc.currentFrame >= doc.frames.length) doc.currentFrame = doc.frames.length - 1;
  afterMutation();
  return true;
}

// Append a copy of the current scene as a new keyframe. This is the
// primary "add frame" action wired to the timeline's + button.
export function addFrame() {
  return duplicateFrame(getCurrentIndex(), ensureDoc().frames.length);
}

export function setFrameDuration(i, ms) {
  const doc = ensureDoc();
  const f = doc.frames[i];
  if (!f) return;
  f.duration = Math.max(50, ms | 0);
  saveDoc();
  import('./history.js').then((h) => h.pushHistory());
  window.dispatchEvent(new Event('framesChanged'));
}

// --- camera keyframes (A5 phase B) ------------------------------------

// Capture the active camera's pose into frame `i`. Stores mode so the
// playback path can tell perspective from top-down keyframes.
export async function setFrameCamera(i) {
  const doc = ensureDoc();
  const f = doc.frames[i];
  if (!f) return;
  const { camera, topDownCamera } = await import('../scene.js');
  const { state } = await import('../state.js');
  const cam = state.activeCamera;
  const mode = cam === topDownCamera ? 'topdown' : 'perspective';
  f.camera = {
    mode,
    position: [cam.position.x, cam.position.y, cam.position.z],
    quaternion: [cam.quaternion.x, cam.quaternion.y, cam.quaternion.z, cam.quaternion.w],
    fov: cam.isPerspectiveCamera ? cam.fov : undefined,
    zoom: cam.zoom,
  };
  saveDoc();
  import('./history.js').then((h) => h.pushHistory());
  window.dispatchEvent(new Event('framesChanged'));
}

export function clearFrameCamera(i) {
  const doc = ensureDoc();
  const f = doc.frames[i];
  if (!f || !f.camera) return;
  delete f.camera;
  saveDoc();
  import('./history.js').then((h) => h.pushHistory());
  window.dispatchEvent(new Event('framesChanged'));
}
