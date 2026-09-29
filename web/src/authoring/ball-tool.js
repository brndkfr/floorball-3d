// Ball tool decisions + match-ball scheme edits (A-BACK-026), three-free so it is Node-testable.
// The "match ball" is scheme.balls.main: the one ball that can be carried, passed and shot.
// Extra balls (scheme.balls.extras) are decorative.

// What a left-click with a ball tool does. chipId = chip under the cursor, or null.
export function ballToolAction({ tool, chipId = null, shift = false }) {
  if (tool === 'ball-extra') return { kind: 'extra' };
  if (tool !== 'ball') return null;
  if (shift) return { kind: 'extra' };
  if (chipId) return { kind: 'carry', chipId };
  return { kind: 'move' };
}

function detach(main) {
  main.carrier = null;
  delete main.pass;
  delete main.shot;
}

// Move the match ball to a loose spot in this frame's scheme only.
export function placeMatchBall(scheme, { x, z }) {
  if (!scheme.balls) scheme.balls = {};
  if (!scheme.balls.main) scheme.balls.main = { x, z, carrier: null };
  const main = scheme.balls.main;
  main.x = x;
  main.z = z;
  detach(main);
}

// Promote extra ball `id` to match ball: the two trade position and colour.
// shownPos is where the match ball is drawn now (its carrier's spot when carried).
export function swapWithMatchBall(scheme, id, shownPos) {
  const extra = scheme.balls?.extras?.find((b) => b.id === id);
  if (!extra) return false;
  if (!scheme.balls.main) scheme.balls.main = { x: shownPos.x, z: shownPos.z, carrier: null };
  const main = scheme.balls.main;
  const extraPos = { x: extra.x, z: extra.z };
  const extraColor = extra.color;
  extra.x = shownPos.x;
  extra.z = shownPos.z;
  if (main.color) extra.color = main.color; else delete extra.color;
  main.x = extraPos.x;
  main.z = extraPos.z;
  if (extraColor) main.color = extraColor; else delete main.color;
  detach(main);
  return true;
}
