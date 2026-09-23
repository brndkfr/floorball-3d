// Undo/redo snapshot stack. Snapshots are whole Doc objects (small, well
// under 1 MB for realistic scenes) rather than diffs - simpler, and fast
// enough for the sub-100-element documents we'll see in practice.
//
// S-BACK-012: the stack itself (push/undo/redo/cursor bookkeeping) lives in
// the dependency-free history-stack.js so it's unit-testable, and is now
// persisted per-project (see storage.js's saveHistoryState/loadHistoryState)
// so a reload or an accidental "New scheme" doesn't silently drop undo
// history the way the in-memory-only stack used to. Photo-overlay actions
// (landmark placement, solve) still don't call pushHistory() - that's a
// separate, riskier change (needs live-browser verification of edit
// granularity) left open, see docs/plan.md S-BACK-012.

import { state } from '../state.js';
import { ensureDoc } from './doc.js';
import { rebuildFromDoc } from './chips.js';
import { rebuildShapesFromDoc } from './shapes.js';
import { saveDoc, getCurrentProjectId, saveHistoryState, loadHistoryState } from './storage.js';
import { createHistoryStack, pushSnapshot, stepUndo, stepRedo, resetHistoryStack, serializeHistoryStack, hydrateHistoryStack } from './history-stack.js';

const MAX = 100;
const hs = createHistoryStack(MAX);

function snapshot() {
  return structuredClone(ensureDoc());
}

function persist() {
  const id = getCurrentProjectId();
  if (id) saveHistoryState(id, serializeHistoryStack(hs));
}

export function pushHistory() {
  pushSnapshot(hs, snapshot());
  persist();
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
  import('./balls.js').then((b) => b.rebuildBallsFromDoc());
  import('./goals.js').then((g) => g.rebuildGoalsFromDoc());
  import('./actors.js').then((a) => a.applyActorsFromScheme());
  saveDoc();
}

export function undo() {
  const snap = stepUndo(hs);
  if (!snap) return false;
  apply(snap);
  persist();
  return true;
}

export function redo() {
  const snap = stepRedo(hs);
  if (!snap) return false;
  apply(snap);
  persist();
  return true;
}

// Seed the stack with the current doc state (call once after initial load,
// and again on every project switch so undo can't reach across projects).
// Restores a persisted stack for this project if one exists; otherwise
// falls back to seeding a fresh stack with the doc already in `state.doc`.
export function initHistory() {
  const id = getCurrentProjectId();
  const saved = id ? loadHistoryState(id) : null;
  resetHistoryStack(hs);
  if (!hydrateHistoryStack(hs, saved)) pushHistory();
}
