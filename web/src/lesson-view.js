// Quiet screen for the lessons (A-BACK-049): a frame with `layers: [...]`
// shows only its caption, the KATA card and the named rink layers. Labels,
// the shooter inset, the verdict chip, the hint pill and extra lines go.
// A frame without `layers` leaves the screen as the viewer set it, so old
// docs and the other lessons are unchanged. Pure and three-free so it is
// Node-testable (test/lesson-view.test.js).
//
// Layer names: 'line' (the shooting line), 'area' (the shooting area: the
// ball to both posts), 'coverage', 'zones' (the floor zones), 'marks' (the
// KATA marks on the rink), 'lane' (the pass lane: a line from the ball
// carrier to the free team mate).

export const LAYER_NAMES = Object.freeze(['line', 'area', 'coverage', 'zones', 'marks', 'lane']);

// What each layer switches: the shot overlays (shot-view.js keys) and the
// floor zones / KATA marks. Everything else is off while quiet.
export function quietLayers(layers) {
  if (!Array.isArray(layers)) return null;
  const has = (n) => layers.includes(n);
  return { shotLine: has('line'), lines: has('area'), coverage: has('coverage'), zones: has('zones'), marks: has('marks'), lane: has('lane') };
}

// Is `key` on, given the quiet state (null: not quiet, the viewer decides)?
export const quietAllows = (quiet, key) => !quiet || !!quiet[key];

// The shot view with the quiet state applied (the same object when not quiet).
export function quietShotView(view, quiet) {
  if (!quiet) return view;
  return { ...view, lines: !!view.lines && quiet.lines, shotLine: !!view.shotLine && quiet.shotLine, coverage: !!view.coverage && quiet.coverage };
}

// The quiet state for the frame on screen: `i` is that frame's index (the
// one whose caption shows), null when there is none or it names no layers.
export function quietForFrame(frames, i) {
  return quietLayers(frames?.[i]?.layers);
}

// A clean `layers` for a doc from outside: known names only, no repeats;
// undefined for anything that is not an array.
export function sanitizeLayers(raw) {
  if (!Array.isArray(raw)) return undefined;
  return LAYER_NAMES.filter((n) => raw.includes(n));
}

// The pass lane of a frame: { from, to } floor points, the ball carrier to
// the other player of its team, or null (a shot in flight, no carrier, no
// team mate); `ids` are the two players, so a view can follow them live. Used by the lane layer (authoring/pass-lane-view.js).
export function passLaneOf(frame) {
  const players = frame?.scheme?.players;
  const carrierId = frame?.scheme?.balls?.main?.carrier;
  const carrier = players?.[carrierId];
  if (!carrier) return null;
  const mate = Object.values(players).find((p) => p.id !== carrier.id && p.team === carrier.team);
  return mate ? { from: { x: carrier.x, z: carrier.z }, to: { x: mate.x, z: mate.z }, ids: [carrier.id, mate.id] } : null;
}
