// "The viewer moved the 3D camera" (A-BACK-049): orbit, pan, wheel / pinch
// zoom and keyboard pan call userMovedCamera(); the lesson director
// (authoring/director-ui.js) listens and hands the camera over. Tiny and
// DOM-free so the gesture code does not depend on the director.

const subs = new Set();

export function onUserCamera(cb) {
  subs.add(cb);
  return () => subs.delete(cb);
}

export function userMovedCamera() {
  for (const cb of subs) {
    try { cb(); } catch (e) { console.error(e); }
  }
}
