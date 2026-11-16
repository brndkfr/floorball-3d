// Frame note caption (A-BACK-035): the current frame's note as a subtitle
// at the bottom of the stage. Stopped: the frame being edited. Playing or
// scrubbing (playback.previewing): the frame whose move is on screen.
// Plan, Train and Present; not in Analyze. updateFrameCaption() runs every
// frame from main.js and on the events below; export.js burns the same
// text into the video (currentCaptionText).

import { state } from '../state.js';
import { ensureDoc } from './doc.js';
import { noteText, noteFrameAt } from './frame-notes.js';
import { playbackState } from './playback.js';

// Throw when the DOM root is missing; see CLAUDE.md 'DOM-owning modules'.
const el = document.getElementById('frameCaption');
if (!el) throw new Error('frame-caption.js: #frameCaption missing from index.html');

export function currentCaptionText() {
  if (!state.doc) return '';
  const doc = ensureDoc();
  const pb = playbackState();
  const i = pb && (pb.playing || pb.previewing) ? noteFrameAt(doc.frames, pb.elapsed) : doc.currentFrame;
  return noteText(doc.frames[i]?.note, state.lang);
}

let shown = null;
export function updateFrameCaption() {
  const text = document.body.dataset.mode === 'analyze' ? '' : currentCaptionText();
  if (text === shown) return;
  shown = text;
  el.textContent = text;
  el.hidden = !text;
}

for (const ev of ['framesChanged', 'langChanged', 'shell:mode']) window.addEventListener(ev, updateFrameCaption);
document.addEventListener('layers:dirty', updateFrameCaption);   // undo / redo
