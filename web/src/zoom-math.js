// One zoom feel for the 2D wheel, the 3D wheel and pinch (A-BACK-040
// step 8). Pure math, three-free so it runs under node --test;
// topdown-camera.js, scene.js (via orbit-math.js's dollyBy) and
// touch-controls.js apply it.
//
// Everything is measured in wheel pixels: negative zooms in. A zoom step
// is exponential in the delta, so ten small touchpad events zoom exactly
// as much as one big mouse notch.

// All estimates, chosen by feel.
export const WHEEL_ZOOM_RATE = 0.0015;   // per wheel px: a 100 px mouse notch -> ~16 %
export const WHEEL_LINE_PX = 16;         // deltaMode 1 (lines), as browsers scroll a line
export const PINCH_WHEEL_BOOST = 10;     // touchpad pinch arrives as wheel + ctrlKey with small deltas

// The wheel event's deltaY in pixels. `pageH` is the page size for
// deltaMode 2 (pages), usually the window height.
export function wheelDeltaPx({ deltaY, deltaMode = 0, ctrlKey = false }, pageH = 800) {
  const px = deltaMode === 1 ? deltaY * WHEEL_LINE_PX : deltaMode === 2 ? deltaY * pageH : deltaY;
  return ctrlKey ? px * PINCH_WHEEL_BOOST : px;
}

// How much bigger things get on screen for a wheel delta in px.
export function zoomFactor(deltaPx) {
  return Math.exp(-deltaPx * WHEEL_ZOOM_RATE);
}

// The wheel delta that zooms like fingers moving from `prevDist` to
// `dist` px apart: twice as far apart, twice as big.
export function pinchWheelDelta(prevDist, dist) {
  if (!(prevDist > 0) || !(dist > 0)) return 0;
  return Math.log(prevDist / dist) / WHEEL_ZOOM_RATE;
}

// Zoom an orthographic top-down camera by `factor` about the point at
// normalised device coords (ndcX, ndcY), which stays under the cursor.
//   view = { x, z, zoom, left, right, top, bottom, rightAxis, upAxis }
// (x, z) is the camera position, left..bottom its frustum, rightAxis /
// upAxis its screen right and up on the floor ({ x, z }; the 2D view can
// be rotated, see scene.js setTopDownRotationSteps). Returns { x, z, zoom }.
export function zoomOrthoAt(view, factor, ndcX, ndcY, { min = 0, max = Infinity } = {}) {
  const zoom = Math.min(Math.max(view.zoom * factor, min), max);
  const shrink = 1 / view.zoom - 1 / zoom;
  const dx = (ndcX * (view.right - view.left)) / 2 * shrink;
  const dy = (ndcY * (view.top - view.bottom)) / 2 * shrink;
  return {
    x: view.x + view.rightAxis.x * dx + view.upAxis.x * dy,
    z: view.z + view.rightAxis.z * dx + view.upAxis.z * dy,
    zoom,
  };
}
