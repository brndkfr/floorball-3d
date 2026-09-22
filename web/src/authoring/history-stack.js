// Pure undo/redo stack bookkeeping, factored out of history.js so it can
// be unit-tested without pulling in chips.js / shapes.js / scene.js
// (entangled via rebuildFromDoc/rebuildShapesFromDoc, and scene.js reads
// window.innerWidth at module load - see S-BACK-009). Operates on a plain
// { stack, cursor, max } record; callers own the snapshot contents,
// applying a snapshot to the live scene, and persistence.

export function createHistoryStack(max = 100) {
  return { stack: [], cursor: -1, max };
}

// Truncates any redo-able future, appends `snap`, and evicts the oldest
// entry once `max` is exceeded. `cursor` always ends up pointing at the
// snapshot just pushed: when the stack is still under capacity that's a
// plain increment, and when it's full, shifting the oldest entry off the
// front moves every remaining index (including the new one) down by one,
// so leaving `cursor` unchanged still lands on the newest entry.
export function pushSnapshot(hs, snap) {
  hs.stack.length = hs.cursor + 1;
  hs.stack.push(snap);
  if (hs.stack.length > hs.max) hs.stack.shift();
  else hs.cursor++;
}

// Returns the snapshot to apply, or null if there's nothing to undo.
export function stepUndo(hs) {
  if (hs.cursor <= 0) return null;
  hs.cursor--;
  return hs.stack[hs.cursor];
}

// Returns the snapshot to apply, or null if there's nothing to redo.
export function stepRedo(hs) {
  if (hs.cursor >= hs.stack.length - 1) return null;
  hs.cursor++;
  return hs.stack[hs.cursor];
}

// Clears the stack, optionally seeding it with a single starting snapshot.
export function resetHistoryStack(hs, seed) {
  hs.stack.length = 0;
  hs.cursor = -1;
  if (seed !== undefined) pushSnapshot(hs, seed);
}

export function canUndo(hs) { return hs.cursor > 0; }
export function canRedo(hs) { return hs.cursor < hs.stack.length - 1; }

// --- persistence round-trip (S-BACK-012) -------------------------------

export function serializeHistoryStack(hs) {
  return { stack: hs.stack, cursor: hs.cursor };
}

// Replaces hs's contents with a previously-serialized stack, after
// validating the shape - a corrupt/foreign localStorage value must never
// crash the app, it should just be treated as "nothing to restore".
// Returns true if the data was applied, false if it was rejected.
export function hydrateHistoryStack(hs, data) {
  if (!data || !Array.isArray(data.stack) || data.stack.length === 0) return false;
  if (!Number.isInteger(data.cursor) || data.cursor < 0 || data.cursor >= data.stack.length) return false;
  const stack = data.stack.length > hs.max ? data.stack.slice(-hs.max) : data.stack;
  const cursor = data.cursor - (data.stack.length - stack.length);
  hs.stack = stack;
  hs.cursor = cursor;
  return true;
}
