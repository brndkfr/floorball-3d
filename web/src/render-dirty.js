// S-BACK-011 (partial): main animate() loop dirty-check.
//
// A one-shot "something outside the per-frame poll changed" flag. main.js's
// animate() already polls a handful of things every frame (camera pose,
// selection identity, whether an in-flight animation subsystem - chip
// spawn, walk-tween, choreograph, draw preview - is active) and can detect
// those changes by diffing against the previous frame. Everything else that
// can change the live scene without going through one of those - a doc
// mutation (chips/shapes/cones/balls/frames/undo, all funnel through
// storage.js's saveDoc()) or a layer-visibility toggle that isn't part of
// the doc (bindLayerToggle, the goalie/grid checkboxes, chip-label
// visibility) - calls markRenderDirty() at the source instead.
//
// Deliberately fail-open: a call site that forgets to mark dirty only costs
// one extra (correct) render on the next frame something else invalidates
// it, never a frozen frame. A missed per-frame poll diff, by contrast,
// would only show as a genuinely one-frame-late redraw at worst, since the
// mutation itself already happened before this flag is read.
let dirty = true; // the very first frame must always render

export function markRenderDirty() {
  dirty = true;
}

// Edge-triggered: returns whether a render is needed and clears the flag.
// Call exactly once per frame from the render loop.
export function consumeRenderDirty() {
  const was = dirty;
  dirty = false;
  return was;
}
