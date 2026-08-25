// Face-off dot snap for chip placement (A7). If the user drops a chip
// within SNAP_RADIUS_MM of any face-off dot, snap it to the dot. Toggle
// via the HUD checkbox; persists in localStorage.
//
// Dot positions mirror generators/generate_rink.py constants. Keep the
// two sides in sync when the rink dimensions change.

const HALF_W = 10000;
const RINK_L = 40000;
const GOAL_LINE_FROM_BOARD = 3500;
const FACEOFF_FROM_SIDE = 1500;

export const FACEOFF_DOTS = [
  { x: 0, z: RINK_L / 2 },                                    // centre spot
  { x: HALF_W - FACEOFF_FROM_SIDE, z: GOAL_LINE_FROM_BOARD },
  { x: -(HALF_W - FACEOFF_FROM_SIDE), z: GOAL_LINE_FROM_BOARD },
  { x: HALF_W - FACEOFF_FROM_SIDE, z: RINK_L - GOAL_LINE_FROM_BOARD },
  { x: -(HALF_W - FACEOFF_FROM_SIDE), z: RINK_L - GOAL_LINE_FROM_BOARD },
  { x: HALF_W - FACEOFF_FROM_SIDE, z: RINK_L / 2 },
  { x: -(HALF_W - FACEOFF_FROM_SIDE), z: RINK_L / 2 },
];

const SNAP_RADIUS_MM = 800;
const PREF_KEY = 'floorball-3d:snap-faceoff';

export function isSnapEnabled() {
  return localStorage.getItem(PREF_KEY) !== '0';   // default: on
}

export function setSnapEnabled(on) {
  localStorage.setItem(PREF_KEY, on ? '1' : '0');
}

export function snapToNearestDot(x, z) {
  if (!isSnapEnabled()) return { x, z };
  let best = null, bestD2 = SNAP_RADIUS_MM * SNAP_RADIUS_MM;
  for (const d of FACEOFF_DOTS) {
    const dx = d.x - x, dz = d.z - z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) { bestD2 = d2; best = d; }
  }
  return best ? { x: best.x, z: best.z } : { x, z };
}

export function initFaceoffSnapToggle() {
  const cb = document.getElementById('faceoffSnapCheckbox');
  if (!cb) return;
  cb.checked = isSnapEnabled();
  cb.addEventListener('change', () => setSnapEnabled(cb.checked));
}
