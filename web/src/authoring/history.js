// Undo/redo snapshot stack. Snapshots are whole Doc objects (small, well
// under 1 MB for realistic scenes) rather than diffs - simpler, and fast
// enough for the sub-100-element documents we'll see in practice.

import { state } from '../state.js';
import { ensureDoc } from './doc.js';
import { rebuildFromDoc } from './chips.js';
import { rebuildShapesFromDoc } from './shapes.js';
import { saveDoc } from './storage.js';

const MAX = 100;
const stack = [];
let cursor = -1;   // index of the currently-applied snapshot in `stack`

function snapshot() {
  return structuredClone(ensureDoc());
}

export function pushHistory() {
  stack.length = cursor + 1;
  stack.push(snapshot());
  if (stack.length > MAX) stack.shift(); else cursor++;
}

function apply(snap) {
  // Selection holds live Object3D refs that rebuildFromDoc() is about to
  // dispose; drop it first so no stale ring / popover survives the rebuild.
  import('../selection.js').then((s) => s.deselectAll());
  // Any in-flight walk-tween points at an Object3D about to be disposed.
  import('./walk-tween.js').then((w) => w.finishAllWalks());
  state.doc = structuredClone(snap);
  rebuildFromDoc();
  rebuildShapesFromDoc();
  import('./cones.js').then((c) => c.rebuildConesFromDoc());
  import('./actors.js').then((a) => a.applyActorsFromScheme());
  saveDoc();
}

export function undo() {
  if (cursor <= 0) return false;
  cursor--;
  apply(stack[cursor]);
  return true;
}

export function redo() {
  if (cursor >= stack.length - 1) return false;
  cursor++;
  apply(stack[cursor]);
  return true;
}

// Seed the stack with the current doc state (call once after initial load).
export function initHistory() {
  stack.length = 0;
  cursor = -1;
  pushHistory();
}
