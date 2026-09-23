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
