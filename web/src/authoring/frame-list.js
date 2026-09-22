// Pure frame-list index/bounds math, extracted from frames.js so it's
// unit-testable without scene.js/storage.js/history.js (S-BACK-009). The
// actual `doc.frames` array mutation (splice) stays in frames.js - only
// the boundary calculations that determine *whether* and *where* live here.

// Whether index i is a real slot in a frames array of this length.
export function isValidFrameIndex(framesLength, i) {
  return i >= 0 && i < framesLength;
}

// Clamps an insertion point to a valid splice index (0..framesLength,
// inclusive - "append at the end" is a valid insert).
export function clampInsertIndex(framesLength, at) {
  return Math.min(Math.max(at, 0), framesLength);
}

// Whether frame i can be removed: never the last remaining frame, and i
// has to be a real slot.
export function canRemoveFrame(framesLength, i) {
  return framesLength > 1 && isValidFrameIndex(framesLength, i);
}

// The current-frame pointer to use once the frames array has shrunk to
// `framesLengthAfterRemoval` - pulls the pointer back onto the last frame
// if it pointed past the new end (i.e. the removed frame was the current
// one and also the last in the list).
export function clampCurrentAfterRemoval(framesLengthAfterRemoval, currentFrame) {
  return currentFrame >= framesLengthAfterRemoval ? framesLengthAfterRemoval - 1 : currentFrame;
}
