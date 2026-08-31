// 2D canvas that shows the uploaded photo behind the WebGL viewport and
// lets the user click rink landmarks on it. Coordinates are tracked in
// ORIGINAL image pixels (not canvas/CSS pixels) so pnp.js's intrinsics
// (built from image width/height) stay valid regardless of window size.
//
// Left-click places the currently armed landmark. Scroll wheel zooms in/out
// centered on the cursor; right-click-drag pans; double-click resets.
// `getPhotoRect()` always returns the fit-to-screen (zoom=1) rect - that's
// what view.js sizes the locked-in WebGL overlay to - while the zoom/pan
// state only affects the interactive calibration view below.

const canvas = document.getElementById('photo-canvas');
const ctx = canvas.getContext('2d');

const MIN_ZOOM = 1, MAX_ZOOM = 12;

let image = null;
let baseRect = { x: 0, y: 0, w: 0, h: 0 }; // fit-to-screen rect, CSS px, zoom=1
let zoom = 1;
let panX = 0, panY = 0; // extra canvas-space offset on top of the centered zoom
const placed = new Map(); // key -> [imgX, imgY]
let onClickLandmark = null; // (imgX, imgY) => void, set by photo-overlay.js

function computeBaseRect() {
  if (!image) { baseRect = { x: 0, y: 0, w: canvas.width, h: canvas.height }; return; }
  const scale = Math.min(canvas.width / image.width, canvas.height / image.height);
  const w = image.width * scale, h = image.height * scale;
  baseRect = { x: (canvas.width - w) / 2, y: (canvas.height - h) / 2, w, h };
}

// The current (possibly zoomed/panned) drawing rect, derived from baseRect
// by growing it around the canvas centre and then shifting by panX/panY.
function computeViewRect() {
  const w = baseRect.w * zoom, h = baseRect.h * zoom;
  const x = baseRect.x - (w - baseRect.w) / 2 + panX;
  const y = baseRect.y - (h - baseRect.h) / 2 + panY;
  return { x, y, w, h };
}

function resetZoom() {
  zoom = 1;
  panX = 0;
  panY = 0;
}

// Exported so photo-overlay.js can force zoom-back-to-fit when entering
// photo view - otherwise the zoomed photo doesn't line up with the (unzoomed)
// WebGL renderer canvas and the preview strips drift off the 3D mesh.
export function resetView() { resetZoom(); redraw(); }

// Frame a region of the ORIGINAL image (roi in image px) so it fills as
// much of the canvas as possible with a small margin. Used when the user
// has drawn an ROI around the goal and wants to click landmarks precisely
// in that zoomed-in view.
export function zoomToRoi(r = roi, margin = 0.9) {
  if (!image || !r || r.w <= 0 || r.h <= 0) return;
  const targetW = canvas.width * margin;
  const targetH = canvas.height * margin;
  const baseScaleX = baseRect.w / image.width;
  const baseScaleY = baseRect.h / image.height;
  const zoomX = targetW / (r.w * baseScaleX);
  const zoomY = targetH / (r.h * baseScaleY);
  zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(zoomX, zoomY)));
  // Solve pan so the ROI centre lands at canvas centre.
  const roiCx = r.x + r.w / 2, roiCy = r.y + r.h / 2;
  const vw = baseRect.w * zoom, vh = baseRect.h * zoom;
  const vxNoPan = baseRect.x - (vw - baseRect.w) / 2;
  const vyNoPan = baseRect.y - (vh - baseRect.h) / 2;
  panX = canvas.width / 2 - (roiCx / image.width) * vw - vxNoPan;
  panY = canvas.height / 2 - (roiCy / image.height) * vh - vyNoPan;
  redraw();
}

let showMarkers = true;
export function setShowMarkers(v) { showMarkers = v; redraw(); }

// Line-strip previews drawn in orange over the photo during calibration -
// shows where solvePnP thinks reference geometry (goal, crease, boards)
// projects to under the current pose, so the user can see if the fit is
// right BEFORE clicking Enter Photo View. Coordinates are in ORIGINAL
// image pixels (same coordinate space as placed landmarks). Kept visible
// even in locked photo-view since they're the clearest indicator of where
// the goal / crease / boards are being placed (much more legible than the
// solid 3D mesh render, especially at large distances).
let previewStrips = []; // [{ color, points: [[x,y], ...] }, ...]
export function setPreviewStrips(strips) { previewStrips = strips || []; redraw(); }

// Semi-transparent Canny-edge overlay drawn on top of the photo so
// landmark clicks can snap to visible edges (goal frame, board line,
// crease outline) regardless of photo colours. Coordinates match the
// photo exactly - drawn scaled to the same viewRect.
let edgeOverlay = null;
let edgeOverlayEnabled = false;
export function setEdgeOverlay(canvas) { edgeOverlay = canvas; redraw(); }
export function setEdgeOverlayEnabled(on) { edgeOverlayEnabled = !!on; redraw(); }
export function hasEdgeOverlay() { return !!edgeOverlay; }

// Manual detection ROI (in ORIGINAL image px). When set, detect.js only
// searches inside this rect - typically drawn by the user around the goal
// to eliminate false positives (spectators, red ads, referee jerseys).
let roi = null;                     // { x, y, w, h } in image px
let roiMode = false;                // true while user is drag-to-define
let roiDrag = null;                 // { startImg: [x,y] } while dragging
export function getRoi() { return roi; }
export function clearRoi() { roi = null; redraw(); }
export function setRoiMode(on) {
  roiMode = on;
  canvas.style.cursor = on ? 'crosshair' : '';
}
export function isRoiMode() { return roiMode; }
let onRoiChange = null;
export function setRoiChangeHandler(fn) { onRoiChange = fn; }

// Optional yellow ring on the photo showing the last click that is awaiting
// a mini-map pairing (border mode) - separate from placed[] because it has
// no world coordinate yet.
let pendingMarker = null; // [imgX, imgY] or null
export function setPendingMarker(xy) { pendingMarker = xy ? [xy[0], xy[1]] : null; redraw(); }

function redraw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!image) return;
  const vr = computeViewRect();
  ctx.drawImage(image, vr.x, vr.y, vr.w, vr.h);
  if (edgeOverlayEnabled && edgeOverlay) {
    ctx.drawImage(edgeOverlay, vr.x, vr.y, vr.w, vr.h);
  }
  for (const strip of previewStrips) {
    ctx.strokeStyle = strip.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let first = true;
    for (const [px, py] of strip.points) {
      const cx = vr.x + (px / image.width) * vr.w;
      const cy = vr.y + (py / image.height) * vr.h;
      if (first) { ctx.moveTo(cx, cy); first = false; } else ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  if (!showMarkers) return; // locked photo-view: preview strips only, no cyan calibration crosshairs
  ctx.font = '11px Consolas, monospace';
  let i = 0;
  for (const [, xy] of placed) {
    const cx = vr.x + (xy[0] / image.width) * vr.w;
    const cy = vr.y + (xy[1] / image.height) * vr.h;
    i++;
    ctx.strokeStyle = '#4fe0ff';
    ctx.fillStyle = '#4fe0ff';
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 9, cy); ctx.lineTo(cx + 9, cy);
    ctx.moveTo(cx, cy - 9); ctx.lineTo(cx, cy + 9);
    ctx.stroke();
    ctx.fillText(String(i), cx + 8, cy - 8);
  }
  if (roi) {
    const rx = vr.x + (roi.x / image.width) * vr.w;
    const ry = vr.y + (roi.y / image.height) * vr.h;
    const rw = (roi.w / image.width) * vr.w;
    const rh = (roi.h / image.height) * vr.h;
    ctx.save();
    ctx.strokeStyle = '#ffb347';
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 2;
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.restore();
  }
  if (pendingMarker) {
    const mx = vr.x + (pendingMarker[0] / image.width) * vr.w;
    const my = vr.y + (pendingMarker[1] / image.height) * vr.h;
    ctx.strokeStyle = '#e8d34a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mx, my, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
  }
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  computeBaseRect();
  resetZoom(); // simplest correct behaviour - re-fit on resize rather than re-deriving a stale pan/zoom
  redraw();
}

export function getPhotoRect() { return baseRect; }
export function getImageSize() { return image ? { w: image.width, h: image.height } : null; }
export function getImage() { return image; }
export function hasPhoto() { return !!image; }

export async function loadPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('could not decode image'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
  placed.clear();
  previewStrips = [];
  roi = null;
  edgeOverlay = null;
  computeBaseRect();
  resetZoom();
  redraw();
  canvas.style.display = 'block';
}

export function clearPhoto() {
  image = null;
  placed.clear();
  previewStrips = [];
  canvas.style.display = 'none';
}

export function setLandmarkClickHandler(fn) { onClickLandmark = fn; }

export function placeLandmark(key, imgXY) {
  placed.set(key, imgXY);
  redraw();
}
export function removeLandmark(key) {
  placed.delete(key);
  redraw();
}
export function getPlacedPoints() {
  return [...placed.entries()].map(([key, image]) => ({ key, image }));
}

canvas.addEventListener('click', (e) => {
  if (!image || !onClickLandmark) return;
  if (roiMode || roiDrag) return; // suppress landmark placement while defining ROI
  const vr = computeViewRect();
  const { clientX: cx, clientY: cy } = e;
  if (cx < vr.x || cx > vr.x + vr.w || cy < vr.y || cy > vr.y + vr.h) return;
  const imgX = ((cx - vr.x) / vr.w) * image.width;
  const imgY = ((cy - vr.y) / vr.h) * image.height;
  onClickLandmark(imgX, imgY);
});

function clientToImage(clientX, clientY) {
  const vr = computeViewRect();
  return [
    ((clientX - vr.x) / vr.w) * image.width,
    ((clientY - vr.y) / vr.h) * image.height,
  ];
}

canvas.addEventListener('wheel', (e) => {
  if (!image) return;
  e.preventDefault();
  const vr = computeViewRect();
  const scaleCur = vr.w / image.width;
  const ix = (e.clientX - vr.x) / scaleCur, iy = (e.clientY - vr.y) / scaleCur;
  zoom = Math.min(Math.max(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), MIN_ZOOM), MAX_ZOOM);
  if (zoom <= MIN_ZOOM) {
    resetZoom();
  } else {
    const wNew = baseRect.w * zoom, hNew = baseRect.h * zoom;
    const scaleNew = wNew / image.width;
    // solve pan so the same image point (ix, iy) stays under the cursor
    panX = e.clientX - ix * scaleNew - (baseRect.x - (wNew - baseRect.w) / 2);
    panY = e.clientY - iy * scaleNew - (baseRect.y - (hNew - baseRect.h) / 2);
  }
  redraw();
}, { passive: false });

// Right-click-drag pans; middle-drag also works. Left button is reserved
// for landmark placement (a plain click, no drag threshold needed there).
let panning = null; // { startX, startY, startPanX, startPanY } while active
canvas.addEventListener('contextmenu', (e) => { if (image) e.preventDefault(); });
canvas.addEventListener('mousedown', (e) => {
  if (!image) return;
  if (e.button === 0 && roiMode) {
    e.preventDefault();
    const [ix, iy] = clientToImage(e.clientX, e.clientY);
    roiDrag = { startImg: [ix, iy] };
    roi = { x: ix, y: iy, w: 0, h: 0 };
    redraw();
    return;
  }
  if (e.button !== 1 && e.button !== 2) return;
  e.preventDefault();
  panning = { startX: e.clientX, startY: e.clientY, startPanX: panX, startPanY: panY };
});
window.addEventListener('mousemove', (e) => {
  if (roiDrag && image) {
    const [ix, iy] = clientToImage(e.clientX, e.clientY);
    const [sx, sy] = roiDrag.startImg;
    roi = {
      x: Math.max(0, Math.min(sx, ix)),
      y: Math.max(0, Math.min(sy, iy)),
      w: Math.min(image.width, Math.abs(ix - sx)),
      h: Math.min(image.height, Math.abs(iy - sy)),
    };
    redraw();
    return;
  }
  if (!panning) return;
  panX = panning.startPanX + (e.clientX - panning.startX);
  panY = panning.startPanY + (e.clientY - panning.startY);
  redraw();
});
window.addEventListener('mouseup', () => {
  if (roiDrag) {
    roiDrag = null;
    // Discard tiny rects (accidental clicks).
    if (roi && (roi.w < 8 || roi.h < 8)) roi = null;
    setRoiMode(false);
    if (onRoiChange) onRoiChange(roi);
    redraw();
    return;
  }
  panning = null;
});

canvas.addEventListener('dblclick', () => {
  if (!image) return;
  resetZoom();
  redraw();
});

window.addEventListener('resize', resizeCanvas);
resizeCanvas();
