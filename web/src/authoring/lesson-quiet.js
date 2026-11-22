// Quiet screen in the lessons (A-BACK-049, lesson-view.js holds the rules):
// every frame main.js asks which frame is on screen (the one whose caption
// shows) and, when it names `layers`, sets state.quiet so the rink layers
// (shooting line, corner lines, zones, labels, the shooter inset, the
// verdict chip, the hint pill, extra lines) show only what it names. Train
// only; Plan and Present are never quiet. Fires `quietChanged` on window
// when it switches, and marks the scene dirty.

import { state } from '../state.js';
import { ensureDoc } from './doc.js';
import { noteFrameAt } from './frame-notes.js';
import { playbackState } from './playback.js';
import { quietForFrame } from '../lesson-view.js';
import { markRenderDirty } from '../render-dirty.js';

let key = 'null';

export function updateQuiet() {
  let quiet = null;
  if (state.doc && document.body.dataset.mode === 'train') {
    const doc = ensureDoc();
    const pb = playbackState();
    const i = pb && (pb.playing || pb.previewing) ? noteFrameAt(doc.frames, pb.elapsed) : doc.currentFrame;
    quiet = quietForFrame(doc.frames, i);
  }
  const next = JSON.stringify(quiet);
  if (next === key) return;
  key = next;
  state.quiet = quiet;
  if (quiet) document.body.dataset.quiet = '1'; else delete document.body.dataset.quiet;
  window.dispatchEvent(new Event('quietChanged'));
  markRenderDirty();
}
