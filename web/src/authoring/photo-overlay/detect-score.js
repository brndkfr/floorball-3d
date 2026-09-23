// Pure scoring for goal-frame candidates found by the classical CV
// red-mask pipeline in detect.js. Kept module-scope so it can be
// unit-tested without importing opencv.js.
//
// A real floorball goal is a hollow rectangular frame: red bars around
// an empty mouth. In the red mask its bounding box is mostly NOT red
// (interior is net / floor). A red spectator-chair band or a solid
// sponsor banner is nearly all red in the same window, so its
// `interiorRedFraction` is close to 1.
//
// interiorRedFraction is measured on the mask, on the inner ~60% of
// each candidate's bounding box (skip a 20% margin on each side so the
// goal's own bars don't dominate the sample).

// Solid red > this fraction = not a goal frame, hard reject.
export const SOLID_RED_REJECT = 0.75;
// Goal frame is ~1.4x wider than tall (mouth 1.6m x posts 1.15m plus
// perspective).
export const IDEAL_ASPECT = 1.4;

// Return a scalar score; 0 means reject. Higher is better.
// `area` is contour area in mask px, `aspect` is bbox width / height,
// `interiorRedFraction` is 0..1 (see comment above).
export function scoreGoalCandidate({ area, aspect, interiorRedFraction, idealAspect = IDEAL_ASPECT }) {
  if (!(area > 0)) return 0;
  if (!(aspect > 0)) return 0;
  if (interiorRedFraction > SOLID_RED_REJECT) return 0;
  const aspectPenalty = Math.abs(Math.log(aspect / idealAspect));
  // Hollowness bonus: interior <= 0.15 is fully hollow (score x1.0),
  // interior >= SOLID_RED_REJECT is at the reject edge (score x0.5).
  const clamped = Math.max(0.15, Math.min(SOLID_RED_REJECT, interiorRedFraction));
  const hollowBonus = 1 - 0.5 * ((clamped - 0.15) / (SOLID_RED_REJECT - 0.15));
  return (area / (1 + 3 * aspectPenalty)) * hollowBonus;
}

// Red mask thresholds (OpenCV HSV: hue 0-180, S/V 0-255). A thin red post
// over the blue floor chroma-bleeds toward magenta (hue ~150-160 measured on
// a broadcast frame), so inside a user-drawn ROI - where magenta ads can't
// win anyway - the upper band is widened to catch it.
export const RED_MIN_SAT = 90;
export const RED_MIN_VAL = 70;
export function redHueRanges({ scoped = false } = {}) {
  return [[0, 18], [scoped ? 145 : 160, 180]];
}
export function isRedHsv(h, s, v, { scoped = false } = {}) {
  if (s < RED_MIN_SAT || v < RED_MIN_VAL) return false;
  return redHueRanges({ scoped }).some(([lo, hi]) => h >= lo && h <= hi);
}

// Working-mat scale for detectGoal. Whole photos only downscale; an ROI crop
// may upscale (capped) so a 3-4 px post isn't erased by the 5x5 morphology.
export const MAX_UPSCALE = 4;
export function workingScale(w, h, { maxSide = 1024, allowUpscale = false } = {}) {
  const s = maxSide / Math.max(w, h);
  return allowUpscale ? Math.min(MAX_UPSCALE, s) : Math.min(1, s);
}
