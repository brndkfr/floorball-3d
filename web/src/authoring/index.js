// Authoring bootstrap. Imported once for side effects from main.js.
//
// Loads any saved Doc from localStorage, seeds the history stack, then wires
// the dock. Chip spawning happens after the OBJ prototype loads - see
// chips.js for the pending-spawn queue.

import { state } from '../state.js';
import { ensureDoc } from './doc.js';
import { loadDoc, saveDoc } from './storage.js';
import { readHashDoc, clearHashDoc } from './share.js';
import { rebuildFromDoc, updateChipAnimations } from './chips.js';
import { rebuildShapesFromDoc } from './shapes.js';
import { rebuildConesFromDoc } from './cones.js';
import { rebuildBallsFromDoc } from './balls.js';
import { initHistory } from './history.js';
import { initFaceoffSnapToggle } from './faceoff-snap.js';
import './save-status-ui.js'; // side-effect: wires up the save-status badge + beforeunload guard
import './dock.js';       // side-effect: wires up the DOM
import './tool-palette.js'; // side-effect: wires up the left tool palette
import './inspector.js';    // side-effect: wires up the right inspector panel
import './chip-popover.js'; // side-effect: wires up the chip-anchored popover
import './layers-panel.js'; // side-effect: wires up the right layers panel
import './timeline.js';   // side-effect: wires up the timeline UI
import './photo-overlay/photo-overlay.js'; // side-effect: wires up the photo overlay panel
export { tickChoreo } from './choreograph.js';
export { tickActors } from './actors.js';

// Prefer a shared doc from the URL hash so incognito links "just work"
// without touching whatever the user already has in localStorage. Fall
// back to the default localStorage slot for a normal reload.
const shared = await readHashDoc();
if (shared) {
  state.doc = shared;
  clearHashDoc();
  saveDoc();
} else {
  const saved = loadDoc();
  if (saved) state.doc = saved;
}
ensureDoc();
rebuildFromDoc();
rebuildShapesFromDoc();
rebuildConesFromDoc();
rebuildBallsFromDoc();
initHistory();
initFaceoffSnapToggle();

export { updateChipAnimations };
