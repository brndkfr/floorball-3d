// Authoring bootstrap. Imported once for side effects from main.js.
//
// Loads any saved Doc from localStorage, seeds the history stack, then wires
// the dock. Chip spawning happens after the OBJ prototype loads - see
// chips.js for the pending-spawn queue.

import { state } from '../state.js';
import { ensureDoc } from './doc.js';
import {
  loadDoc,
  saveDoc,
  migrateLegacyStorage,
  adoptDocAsProject,
  setCurrentProjectId,
  createProject,
  loadProject,
  getCurrentProjectId,
} from './storage.js';
import { readHashDoc, clearHashDoc } from './share.js';
import { rebuildFromDoc, updateChipAnimations } from './chips.js';
import { rebuildShapesFromDoc } from './shapes.js';
import { rebuildConesFromDoc } from './cones.js';
import { rebuildBallsFromDoc } from './balls.js';
import { rebuildGoalsFromDoc } from './goals.js';
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
import { notifyProjectChanged } from './library-dialog.js';
export { tickChoreo } from './choreograph.js';
export { tickActors } from './actors.js';

migrateLegacyStorage();

// Prefer a shared doc from the URL hash so incognito links "just work"
// without touching whatever the user already has in localStorage. Shared
// docs land as a new local project (fresh id, name from the doc or a
// default), then become the current project.
const shared = await readHashDoc();
if (shared) {
  const adopted = adoptDocAsProject(shared, { name: shared.meta?.name || 'Shared scheme' });
  if (adopted) {
    state.doc = adopted;
    setCurrentProjectId(adopted.meta.id);
  }
  clearHashDoc();
} else {
  const saved = loadDoc();
  if (saved) {
    state.doc = saved;
  } else if (getCurrentProjectId()) {
    // Pointer references a project that was deleted or corrupted -
    // create a fresh one so the user isn't stranded.
    const id = createProject('Untitled');
    setCurrentProjectId(id);
    const doc = loadProject(id);
    if (doc) state.doc = doc;
  }
}
ensureDoc();
// First-run bootstrap: no legacy doc, no share link, no current pointer -
// register the fresh in-memory doc as the initial project so save/history
// have somewhere to write.
if (!getCurrentProjectId()) saveDoc();
// dock.js and other UI ran their initial render at import time, before
// state.doc was finalised - kick a project-changed event so the
// project-name label picks up the migrated / loaded name.
notifyProjectChanged();
rebuildFromDoc();
rebuildShapesFromDoc();
rebuildConesFromDoc();
rebuildBallsFromDoc();
rebuildGoalsFromDoc();
initHistory();
initFaceoffSnapToggle();

export { updateChipAnimations };
