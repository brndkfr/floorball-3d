// Authoring bootstrap. Imported once for side effects from main.js.
//
// Loads any saved Doc from localStorage, seeds the history stack, then wires
// the dock. Chip spawning happens after the OBJ prototype loads - see
// chips.js for the pending-spawn queue.

import { state } from '../state.js';
import { ensureDoc } from './doc.js';
import { loadDoc } from './storage.js';
import { rebuildFromDoc, updateChipAnimations } from './chips.js';
import { initHistory } from './history.js';
import './dock.js';   // side-effect: wires up the DOM

const saved = loadDoc();
if (saved) state.doc = saved;
ensureDoc();
rebuildFromDoc();
initHistory();

export { updateChipAnimations };
