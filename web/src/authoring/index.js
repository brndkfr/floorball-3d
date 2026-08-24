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
import { initHistory } from './history.js';
import './dock.js';   // side-effect: wires up the DOM

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
initHistory();

export { updateChipAnimations };
