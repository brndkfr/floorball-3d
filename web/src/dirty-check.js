// Generic "did any tracked field change since last frame" comparator - a
// plain shallow diff over a fixed list of keys, for any per-frame
// recompute that wants to skip its expensive path on an unchanged frame.
// Extracted from coverage.js's hand-rolled, previously-untested
// coverageInputsChanged() (S-BACK-009) so the comparison logic itself is
// unit-testable without a live THREE.scene/goalie mesh, and reusable
// elsewhere (see docs/plan.md S-BACK-011 - the main animate() loop has no
// dirty-check at all).
//
// NaN !== NaN in JS, so seeding a "last" snapshot's numeric fields with NaN
// makes the very first real frame always report "changed" - callers rely
// on that instead of tracking a separate isFirstFrame flag.
export function snapshotChanged(prev, next, keys) {
  for (const key of keys) {
    if (prev[key] !== next[key]) return true;
  }
  return false;
}

// Copies only `keys` from source onto target, in place, and returns target -
// the usual pairing with snapshotChanged() once a caller has decided a
// frame's inputs did change and wants to remember them for next time.
export function copySnapshot(target, source, keys) {
  for (const key of keys) target[key] = source[key];
  return target;
}
