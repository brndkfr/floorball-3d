// Sizes of the blob shadows (S-BACK-030 step 3, blob-shadow.js). Pure, so
// it runs under node --test. Every number is an estimate, chosen by eye.

const RADIUS_MM = {
  ball: 80,      // the ball itself is 36 mm
  figure: 420,   // feet plus a little of the stick side
  goalie: 620,   // kneeling, pads spread
};
export const BLOB_KINDS = Object.freeze(Object.keys(RADIUS_MM));

const FLOOR_OPACITY = 0.55;
const LIFT_SPREAD_MM = 1500;   // height at which the shadow is twice as wide
const MAX_SPREAD = 3;

export function blobRadiusFor(kind) {
  const r = RADIUS_MM[kind];
  if (!r) throw new Error(`blob-shadow: unknown kind "${kind}"`);
  return r;
}

// Radius and opacity of the shadow of a `kind` whose floor-contact point is
// `heightMm` above the floor (only balls ever are): higher = wider and
// fainter, like a soft light from above.
export function blobAt(kind, heightMm) {
  const spread = Math.min(1 + Math.max(heightMm, 0) / LIFT_SPREAD_MM, MAX_SPREAD);
  return { radius: blobRadiusFor(kind) * spread, opacity: FLOOR_OPACITY / (spread * spread) };
}
