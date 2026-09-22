// Pure "reorder within absolute slots" algorithm, shared by chips.js's
// reorderChips and shapes.js's reorderShapes (S-BACK-009: previously two
// independent, near-identical implementations - one over Object.keys() of
// a players map, one over an array of shape objects - with no test
// coverage for either since both lived in modules entangled with
// scene.js). No DOM/scene dependency, so it's unit-testable on its own.

// `items` is a flat list (of ids, or of objects - see `getId`). The
// entries whose id appears in `orderedIds` keep the same absolute index
// positions they currently occupy, but take on `orderedIds`' relative
// order; every other entry stays in its own slot untouched. Returns a NEW
// array, or null if `orderedIds` isn't exactly the set of ids already
// present in `items` (caller should treat that as a no-op - the layers
// panel never passes a mismatched set in practice, but a stale/racy caller
// shouldn't corrupt the list).
export function reorderAtSlots(items, orderedIds, getId = (x) => x) {
  const idSet = new Set(orderedIds);
  const slots = [];
  for (let i = 0; i < items.length; i++) {
    if (idSet.has(getId(items[i]))) slots.push(i);
  }
  if (slots.length !== orderedIds.length) return null;
  const byId = new Map(items.map((item) => [getId(item), item]));
  const next = items.slice();
  for (let k = 0; k < slots.length; k++) next[slots[k]] = byId.get(orderedIds[k]);
  return next;
}
