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

// Draggable rink-outline quad (Mode B alt calibration): 4 independently
// draggable corners (+ 2 edge-midpoints) the user drags onto the boards
// visible in the photo - or beyond the photo's edge if that part of the
// rink wasn't actually captured (nothing here clamps to the image bounds).
// Corners map to the 4 board-tangent landmarks, midpoints to the 2
// board-centre landmarks (landmarks.js) - reuses the same solvePnP
// pipeline as clicking those landmarks one at a time. Straight lines only
// (no rounded corners): these 6 points are where the STRAIGHT boards are,
// the true rounded corner arcs aren't part of the calibration model.
let quad = null;        // { tl, tr, bl, br, midL, midR }, each [x,y] image px, or null
let quadEnabled = false;
let quadDrag = null;    // { mode: 'move'|'point', key?, startQuad, startPointer } while dragging
let quadJustHit = false; // true if the current mousedown->click cycle hit the quad - suppresses the click-to-place-landmark handler for just that cycle
let roiJustHit = false;  // same idea for ROI-drag: the trailing 'click' fires AFTER mouseup already cleared roiMode/roiDrag, so those alone don't suppress it

// Dragging an already-placed landmark marker to nudge it, instead of
// having to re-arm + re-click from scratch. Position updates live on every
// mousemove (cheap, just a redraw); the solve-triggering callback only
// fires once on mouseup so dragging doesn't hammer solvePnP every frame.
// A drag only becomes real once the mouse actually moves past a small
// threshold - a plain click near an existing marker (very common when
// placing tightly-clustered points) must fall through to normal landmark
// placement, not silently grab/relocate whatever marker happens to be
// nearby.
let markerDrag = null;          // { key } once promoted to an actual drag
let markerDragCandidate = null; // { key, startX, startY } - mousedown hit a marker, not yet moved enough to count
let markerJustHit = false;      // true only once promoted - suppresses the trailing click-to-place-landmark handler
let onMarkerMoved = null;  // (key, imgXY) => void, set by photo-overlay.js
export function setMarkerMovedHandler(fn) { onMarkerMoved = fn; }

// Player chips + ball marker (Phase 2 Step 3, docs/phase-2-plan.md T4).
// Domain-agnostic like the rest of this module - photo-overlay.js owns the
// team-colour/world-coordinate meaning, this just draws/drags image px.
let playerChips = []; // [{ id, imagePx:[x,y], team, isCarrier }]
let ballMarker = null; // [x,y] image px, or null
let chipDrag = null;          // { id } once promoted to an actual drag
let chipDragCandidate = null; // { id, startX, startY }
let chipJustHit = false;      // suppresses the trailing click while dragging a chip
let ballDrag = null;
let ballDragCandidate = null;
let ballJustHit = false;
let onPlayerChipMoved = null; // (id, imgXY) => void
let onBallMoved = null;       // (imgXY) => void
let ballPlacementMode = false;
let onBallPlacementClick = null; // (imgX, imgY) => void, fired by a plain click while ballPlacementMode is on

// Phase-3 insight overlays (docs/phase-3-plan.md T4/T6) - image-px only,
// world->px projection stays in insights-overlay.js so this module stays
// domain-agnostic (same discipline as the labelResolver pattern).
let shotLines = null;     // { corners:[{px1,px2}]*4, centre:{px1,px2}, colorKey } | null
let coverageOverlay = null; // { corners:[tl,tr,bl,br], grid:Float32Array, cols, rows } | null
let passLines = null;     // [{ fromPx, toPx, clear }] | null
let angleBadge = null;    // angleDeg (number) | null - drawn near the ball marker
const SHOT_LINE_COLORS = { open: '#ff3b30', 'blocked-off': '#ffd21a', 'blocked-centred': '#2ecc55' };

export function setShotLines(lines) { shotLines = lines || null; redraw(); }
export function setCoverageOverlay(cov) { coverageOverlay = cov || null; redraw(); }
export function setPassLines(lines) { passLines = lines || null; redraw(); }
export function setAngleBadge(angleDeg) { angleBadge = angleDeg != null ? angleDeg : null; redraw(); }

// chip.ring (optional): [[x,y], ...] image px tracing a real-world-radius
// footprint circle - drawn as an outline around the dot. null/absent falls
// back to just the dot (e.g. a ring point went behind the camera).
// chip.outline (optional): [[x,y], ...] a real body-silhouette polygon
// (segment-player.js's GrabCut result) - only ever set for the currently
// selected chip, see photo-overlay.js's handleChipSelected.
export function setPlayerChips(chips) {
  playerChips = (chips || []).map((c) => ({ ...c, imagePx: [c.imagePx[0], c.imagePx[1]] }));
  redraw();
}

// A plain click (not a drag) on a chip toggles its selection - used to
// gate the expensive on-demand body-outline segmentation to one player at
// a time instead of running it for every detection automatically.
let selectedChipId = null;
let onChipSelected = null; // (id|null) => void
export function setChipSelectedHandler(fn) { onChipSelected = fn; }
export function getSelectedChipId() { return selectedChipId; }
export function setBallMarker(imagePx) {
  ballMarker = imagePx ? [imagePx[0], imagePx[1]] : null;
  redraw();
}
export function setPlayerChipMovedHandler(fn) { onPlayerChipMoved = fn; }
export function setBallMovedHandler(fn) { onBallMoved = fn; }
export function setBallPlacementMode(on) {
  ballPlacementMode = !!on;
  canvas.style.cursor = on ? 'crosshair' : '';
}
export function isBallPlacementMode() { return ballPlacementMode; }
export function setBallPlacementClickHandler(fn) { onBallPlacementClick = fn; }

function hitTestChip(clientX, clientY) {
  if (!image) return null;
  const vr = computeViewRect();
  const tol = 13; // fixed screen px, same convention as hitTestMarker
  let bestId = null, bestDist = Infinity;
  for (const chip of playerChips) {
    const [px, py] = chip.imagePx;
    const cx = vr.x + (px / image.width) * vr.w;
    const cy = vr.y + (py / image.height) * vr.h;
    const d = Math.hypot(clientX - cx, clientY - cy);
    if (d < tol && d < bestDist) { bestDist = d; bestId = chip.id; }
  }
  return bestId;
}

function hitTestBall(clientX, clientY) {
  if (!image || !ballMarker) return false;
  const vr = computeViewRect();
  const cx = vr.x + (ballMarker[0] / image.width) * vr.w;
  const cy = vr.y + (ballMarker[1] / image.height) * vr.h;
  return Math.hypot(clientX - cx, clientY - cy) < 10;
}

// Resolves a landmark key to a friendly display label for the on-photo
// marker text (e.g. "goalA_postL" -> "Goal A - left post (base)") - kept
// as an injected callback rather than importing landmarks.js directly, so
// this module stays domain-agnostic. Falls back to the raw key.
let labelResolver = (key) => key;
export function setLabelResolver(fn) { labelResolver = fn || ((key) => key); }

function hitTestMarker(clientX, clientY) {
  if (!image) return null;
  const vr = computeViewRect();
  const tol = 12; // fixed screen px - markers are drawn at a fixed screen size regardless of zoom
  let bestKey = null, bestDist = Infinity;
  for (const [key, xy] of placed) {
    const cx = vr.x + (xy[0] / image.width) * vr.w;
    const cy = vr.y + (xy[1] / image.height) * vr.h;
    const d = Math.hypot(clientX - cx, clientY - cy);
    if (d < tol && d < bestDist) { bestDist = d; bestKey = key; }
  }
  return bestKey;
}
let mirrorLR = false;
let swapEnds = false;   // top edge = Goal B instead of Goal A (photo shot from the other end)

function rinkFitScale() {
  return image ? computeViewRect().w / image.width : 1;
}

function cloneQuad(q) {
  const out = {};
  for (const k of Object.keys(q)) out[k] = [q[k][0], q[k][1]];
  return out;
}

// Even-odd-free convex-ish point-in-quad test via consistent cross-product
// sign around tl->tr->br->bl - good enough as long as the user hasn't
// dragged corners into a self-intersecting (bowtie) shape.
function pointInQuad(px, py, q) {
  const pts = [q.tl, q.tr, q.br, q.bl];
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % 4];
    const cross = (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1);
    if (cross !== 0) {
      const s = Math.sign(cross);
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
  }
  return true;
}

function hitTestQuad(ix, iy) {
  const tol = 12 / rinkFitScale();
  for (const key of ['tl', 'tr', 'bl', 'br', 'midL', 'midR']) {
    const [px, py] = quad[key];
    if (Math.hypot(ix - px, iy - py) < tol) return { mode: 'point', key };
  }
  if (pointInQuad(ix, iy, quad)) return { mode: 'move' };
  return null;
}

function updateQuadDrag(ix, iy) {
  const drag = quadDrag;
  if (drag.mode === 'move') {
    const dx = ix - drag.startPointer.x, dy = iy - drag.startPointer.y;
    for (const k of Object.keys(quad)) {
      quad[k] = [drag.startQuad[k][0] + dx, drag.startQuad[k][1] + dy];
    }
    return;
  }
  if (drag.key === 'midL' || drag.key === 'midR') {
    // Constrained to the straight board line between its two corners - a
    // real straight edge stays straight (collinear) under any perspective.
    const [aKey, bKey] = drag.key === 'midL' ? ['tl', 'bl'] : ['tr', 'br'];
    const [ax, ay] = quad[aKey], [bx, by] = quad[bKey];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    const t = ((ix - ax) * dx + (iy - ay) * dy) / len2;
    quad[drag.key] = [ax + t * dx, ay + t * dy];
    return;
  }
  quad[drag.key] = [ix, iy];
}

function drawRinkFit(vr) {
  if (!quadEnabled || !quad) return;
  const scale = vr.w / image.width;
  const toScreen = ([ix, iy]) => [vr.x + ix * scale, vr.y + iy * scale];
  const corners = ['tl', 'tr', 'br', 'bl'].map((k) => toScreen(quad[k]));
  ctx.save();
  ctx.strokeStyle = '#5fe0ff';
  ctx.fillStyle = '#5fe0ff';
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 5]);
  // Real rink corners are 2000mm-radius arcs, but a true circle doesn't
  // stay a circle under perspective - this "cut the corner" bezier trick
  // rounds any (possibly perspective-distorted) quad without needing to
  // know the actual camera pose, purely as a visual reference.
  const CORNER_FRAC = 0.14;
  ctx.beginPath();
  const n = corners.length;
  for (let i = 0; i < n; i++) {
    const prev = corners[(i - 1 + n) % n], cur = corners[i], next = corners[(i + 1) % n];
    const inPt = [cur[0] + (prev[0] - cur[0]) * CORNER_FRAC, cur[1] + (prev[1] - cur[1]) * CORNER_FRAC];
    const outPt = [cur[0] + (next[0] - cur[0]) * CORNER_FRAC, cur[1] + (next[1] - cur[1]) * CORNER_FRAC];
    if (i === 0) ctx.moveTo(inPt[0], inPt[1]); else ctx.lineTo(inPt[0], inPt[1]);
    ctx.quadraticCurveTo(cur[0], cur[1], outPt[0], outPt[1]);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);
  const hs = 6;
  for (const key of ['tl', 'tr', 'bl', 'br', 'midL', 'midR']) {
    const [x, y] = toScreen(quad[key]);
    ctx.fillRect(x - hs, y - hs, hs * 2, hs * 2);
  }
  ctx.restore();
}

export function setRinkFitEnabled(on) {
  quadEnabled = !!on;
  if (quadEnabled && !quad && image) {
    const w = image.width, h = image.height;
    const x0 = w * 0.3, x1 = w * 0.7, y0 = h * 0.3, y1 = h * 0.7;
    quad = {
      tl: [x0, y0], tr: [x1, y0], bl: [x0, y1], br: [x1, y1],
      midL: [x0, (y0 + y1) / 2], midR: [x1, (y0 + y1) / 2],
    };
  }
  if (!quadEnabled) quadDrag = null;
  redraw();
}
export function isRinkFitEnabled() { return quadEnabled; }
export function resetRinkFit() { quad = null; }
export function setRinkFitMirror(on) { mirrorLR = !!on; }
export function isRinkFitMirror() { return mirrorLR; }
export function setRinkFitSwapEnds(on) { swapEnds = !!on; }
export function isRinkFitSwapEnds() { return swapEnds; }
// Board top (y=500) is the crisper, less-occluded edge in most elevated
// photos - floor level (y=0) is offered too since very low/pitch-side
// shots can see the base line more clearly than the (foreshortened) top.
let useTop = true;
export function setRinkFitUseTop(on) { useTop = !!on; }
export function isRinkFitUseTop() { return useTop; }

// 4 corners + 2 side-midpoints, keyed to landmarks.js's board-tangent /
// board-centre world points (top edge = Goal A end unless swapped, left =
// -x side unless mirrored). Only points actually within the photo's pixel
// bounds are returned - a handle dragged past the photo's edge means "this
// corner isn't in frame", not a real observed pixel, so it's excluded
// rather than fed to solvePnP as if it were a genuine click.
export function getRinkFitLandmarks() {
  if (!quad || !image) return null;
  const L = mirrorLR ? 'R' : 'L', R = mirrorLR ? 'L' : 'R';
  const suffix = useTop ? '_top' : '';
  const topEnd = swapEnds ? 'B' : 'A', botEnd = swapEnds ? 'A' : 'B';
  const candidates = {
    [`goal${topEnd}_boardTangent${L}${suffix}`]: quad.tl,
    [`goal${topEnd}_boardTangent${R}${suffix}`]: quad.tr,
    [`goal${botEnd}_boardTangent${L}${suffix}`]: quad.bl,
    [`goal${botEnd}_boardTangent${R}${suffix}`]: quad.br,
    [`boardCentre${L}${suffix}`]: quad.midL,
    [`boardCentre${R}${suffix}`]: quad.midR,
  };
  const out = {};
  for (const [key, xy] of Object.entries(candidates)) {
    if (xy[0] >= 0 && xy[0] <= image.width && xy[1] >= 0 && xy[1] <= image.height) out[key] = xy;
  }
  return out;
}

// Exported so photo-overlay.js can force zoom-back-to-fit when entering
// photo view - otherwise the zoomed photo doesn't line up with the (unzoomed)
// WebGL renderer canvas and the preview strips drift off the 3D mesh.
export function resetView() { resetZoom(); redraw(); }

// Whether every one of the given landmark keys (or all currently placed,
// if omitted) falls within the CURRENT viewport - lets a caller reset zoom
// only when something would actually be invisible, instead of always
// snapping back to the full photo on every auto-detect call (which was
// disorienting when repeatedly re-running detect while already zoomed in
// on a region that already showed everything fine).
export function arePointsVisible(keys) {
  if (!image) return true;
  const vr = computeViewRect();
  const list = (keys ? keys.map((k) => placed.get(k)) : [...placed.values()]).filter(Boolean);
  return list.every(([px, py]) => {
    const sx = vr.x + (px / image.width) * vr.w;
    const sy = vr.y + (py / image.height) * vr.h;
    return sx >= 0 && sx <= canvas.width && sy >= 0 && sy <= canvas.height;
  });
}

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

// Drives the guided "alignment check" slider (docs/plan.md 4.3 Step 2):
// 0 = photo alone, 1 = full-strength overlay, in between fades the strips -
// a continuous before/after comparison instead of the raw reprojection
// error number, which becomes a secondary badge.
let previewOpacity = 1;
export function setPreviewOpacity(v) { previewOpacity = Math.max(0, Math.min(1, v)); redraw(); }

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

// Lets "just scroll-zoom onto the goal, then Auto-detect" scope detection
// to what's on screen without the separate explicit ROI-drag gesture -
// the current view rect, converted back to ORIGINAL image px and clipped
// to the canvas bounds. Returns null at zoom=1 (whole image, same as no ROI).
export function getViewRoi() {
  if (!image || zoom <= MIN_ZOOM) return null;
  const vr = computeViewRect();
  const scaleX = vr.w / image.width, scaleY = vr.h / image.height;
  const x0 = Math.max(0, (0 - vr.x) / scaleX);
  const x1 = Math.min(image.width, (canvas.width - vr.x) / scaleX);
  const y0 = Math.max(0, (0 - vr.y) / scaleY);
  const y1 = Math.min(image.height, (canvas.height - vr.y) / scaleY);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
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
  ctx.globalAlpha = previewOpacity;
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
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;

  // Coverage heatmap (Phase 3) - low-opacity red/green fill per grid cell,
  // corners already projected to image px by insights-overlay.js.
  if (coverageOverlay) {
    const { corners, grid, cols, rows } = coverageOverlay;
    const vcols = cols + 1;
    const toCanvas = ([px, py]) => [vr.x + (px / image.width) * vr.w, vr.y + (py / image.height) * vr.h];
    ctx.save();
    ctx.globalAlpha = 0.35;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const v00 = r * vcols + c, v10 = v00 + 1, v01 = v00 + vcols, v11 = v01 + 1;
        const mean = (grid[v00] + grid[v10] + grid[v01] + grid[v11]) / 4;
        ctx.fillStyle = mean >= 0.5 ? '#26d940' : '#e0261a';
        const [tlx, tly] = toCanvas(corners[v00]);
        const [trx] = toCanvas(corners[v10]);
        const [, bly] = toCanvas(corners[v01]);
        ctx.fillRect(tlx, tly, trx - tlx, bly - tly);
      }
    }
    ctx.restore();
  }

  // Pass corridors (Phase 3) - drawn under the shot line so the shot line
  // reads as the primary cue.
  if (passLines) {
    for (const p of passLines) {
      const [fx, fy] = [vr.x + (p.fromPx[0] / image.width) * vr.w, vr.y + (p.fromPx[1] / image.height) * vr.h];
      const [tx, ty] = [vr.x + (p.toPx[0] / image.width) * vr.w, vr.y + (p.toPx[1] / image.height) * vr.h];
      ctx.strokeStyle = p.clear ? '#2ecc55' : '#ff3b30';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.fillStyle = p.clear ? '#2ecc55' : '#ff3b30';
      ctx.beginPath(); ctx.arc(tx, ty, 5, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Shot lines (Phase 3) - drawn above pass lines so it isn't visually
  // lost in a fan of pass lines.
  if (shotLines) {
    ctx.strokeStyle = SHOT_LINE_COLORS[shotLines.colorKey] || SHOT_LINE_COLORS.open;
    ctx.lineWidth = 2;
    for (const { px1, px2 } of shotLines.corners) {
      const [x1, y1] = [vr.x + (px1[0] / image.width) * vr.w, vr.y + (px1[1] / image.height) * vr.h];
      const [x2, y2] = [vr.x + (px2[0] / image.width) * vr.w, vr.y + (px2[1] / image.height) * vr.h];
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    const { px1, px2 } = shotLines.centre;
    const [x1, y1] = [vr.x + (px1[0] / image.width) * vr.w, vr.y + (px1[1] / image.height) * vr.h];
    const [x2, y2] = [vr.x + (px2[0] / image.width) * vr.w, vr.y + (px2[1] / image.height) * vr.h];
    ctx.save();
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.restore();
  }
  ctx.lineWidth = 1;
  // too (like preview strips), since they're the actual result to check.
  for (const chip of playerChips) {
    const [px, py] = chip.imagePx;
    const cx = vr.x + (px / image.width) * vr.w;
    const cy = vr.y + (py / image.height) * vr.h;
    const dragging = chipDrag && chipDrag.id === chip.id;
    const color = chip.team === 'home' ? '#ff6b4a' : chip.team === 'away' ? '#4a9bff' : '#bdbdbd';
    // Body-silhouette outline (GrabCut result, only computed for the
    // selected chip) - drawn first, under everything else.
    if (chip.outline && chip.outline.length > 2) {
      ctx.strokeStyle = '#ff4fd8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      chip.outline.forEach(([ox, oy], i) => {
        const sx = vr.x + (ox / image.width) * vr.w;
        const sy = vr.y + (oy / image.height) * vr.h;
        if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      });
      ctx.closePath();
      ctx.stroke();
    }
    // World-space footprint circle (foreshortens like a real floor object,
    // unlike the fixed-screen-px dot) - drawn first so the dot sits on top.
    if (chip.ring) {
      ctx.strokeStyle = color;
      ctx.lineWidth = dragging ? 3 : 2;
      ctx.beginPath();
      chip.ring.forEach(([rx, ry], i) => {
        const sx = vr.x + (rx / image.width) * vr.w;
        const sy = vr.y + (ry / image.height) * vr.h;
        if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      });
      ctx.closePath();
      ctx.stroke();
    }
    ctx.fillStyle = color;
    ctx.strokeStyle = '#111';
    ctx.lineWidth = dragging ? 3 : 2;
    ctx.beginPath(); ctx.arc(cx, cy, dragging ? 10 : 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (chip.isCarrier) {
      ctx.strokeStyle = '#ffe14f';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, 13, 0, Math.PI * 2); ctx.stroke();
    }
    if (chip.id === selectedChipId) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, 16, 0, Math.PI * 2); ctx.stroke();
    }
  }
  if (ballMarker) {
    const cx = vr.x + (ballMarker[0] / image.width) * vr.w;
    const cy = vr.y + (ballMarker[1] / image.height) * vr.h;
    const dragging = !!ballDrag;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = dragging ? 3 : 2;
    ctx.beginPath(); ctx.arc(cx, cy, dragging ? 7 : 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (angleBadge != null) {
      const label = `${Math.round(angleBadge)}°`;
      ctx.font = 'bold 13px Consolas, monospace';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(label, cx + 10, cy + 18);
      ctx.fillStyle = '#ffe14f';
      ctx.fillText(label, cx + 10, cy + 18);
    }
  }
  ctx.lineWidth = 1;

  if (!showMarkers) return; // locked photo-view: preview strips only, no cyan calibration crosshairs
  ctx.font = '11px Consolas, monospace';
  let i = 0;
  for (const [key, xy] of placed) {
    const cx = vr.x + (xy[0] / image.width) * vr.w;
    const cy = vr.y + (xy[1] / image.height) * vr.h;
    i++;
    const dragging = markerDrag && markerDrag.key === key;
    ctx.strokeStyle = dragging ? '#ffe14f' : '#4fe0ff';
    ctx.fillStyle = dragging ? '#ffe14f' : '#4fe0ff';
    ctx.beginPath(); ctx.arc(cx, cy, dragging ? 7 : 5, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 9, cy); ctx.lineTo(cx + 9, cy);
    ctx.moveTo(cx, cy - 9); ctx.lineTo(cx, cy + 9);
    ctx.stroke();
    // Outlined text (dark stroke behind the fill) so the label stays
    // legible over any photo background, not just dark ones.
    const label = `#${i} ${labelResolver(key)}`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(label, cx + 10, cy - 8);
    ctx.fillStyle = dragging ? '#ffe14f' : '#4fe0ff';
    ctx.fillText(label, cx + 10, cy - 8);
    ctx.lineWidth = 1;
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
  drawRinkFit(vr);
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
  quad = null;
  quadEnabled = false;
  playerChips = [];
  ballMarker = null;
  ballPlacementMode = false;
  computeBaseRect();
  resetZoom();
  redraw();
  canvas.style.display = 'block';
}

export function clearPhoto() {
  image = null;
  placed.clear();
  previewStrips = [];
  playerChips = [];
  ballMarker = null;
  ballPlacementMode = false;
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
  if (!image) return;
  if (roiMode || roiDrag || quadJustHit || roiJustHit || markerJustHit || chipJustHit || ballJustHit) return; // suppress landmark placement while defining ROI or interacting with the rink outline / an existing marker / chip / ball
  const vr = computeViewRect();
  const { clientX: cx, clientY: cy } = e;
  if (cx < vr.x || cx > vr.x + vr.w || cy < vr.y || cy > vr.y + vr.h) return;
  const imgX = ((cx - vr.x) / vr.w) * image.width;
  const imgY = ((cy - vr.y) / vr.h) * image.height;
  if (ballPlacementMode) {
    if (onBallPlacementClick) onBallPlacementClick(imgX, imgY);
    return;
  }
  if (onClickLandmark) onClickLandmark(imgX, imgY);
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
  quadJustHit = false;
  roiJustHit = false;
  markerJustHit = false;
  markerDragCandidate = null;
  chipJustHit = false;
  chipDragCandidate = null;
  ballJustHit = false;
  ballDragCandidate = null;
  if (e.button === 0 && quadEnabled && quad) {
    const [ix, iy] = clientToImage(e.clientX, e.clientY);
    const hit = hitTestQuad(ix, iy);
    if (hit) {
      e.preventDefault();
      quadJustHit = true;
      quadDrag = { ...hit, startQuad: cloneQuad(quad), startPointer: { x: ix, y: iy } };
      return;
    }
  }
  if (e.button === 0 && !roiMode && !quadEnabled && !ballPlacementMode) {
    if (hitTestBall(e.clientX, e.clientY)) {
      ballDragCandidate = { startX: e.clientX, startY: e.clientY };
      return;
    }
    const hitChipId = hitTestChip(e.clientX, e.clientY);
    if (hitChipId != null) {
      chipDragCandidate = { id: hitChipId, startX: e.clientX, startY: e.clientY };
      return;
    }
  }
  if (e.button === 0 && !roiMode && !quadEnabled) {
    const hitKey = hitTestMarker(e.clientX, e.clientY);
    if (hitKey) {
      // Don't commit to a drag yet - wait for actual movement (see mousemove)
      // so a plain click here still falls through to placing a new landmark.
      markerDragCandidate = { key: hitKey, startX: e.clientX, startY: e.clientY };
      return;
    }
  }
  if (e.button === 0 && roiMode) {
    e.preventDefault();
    roiJustHit = true;
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
  if (ballDragCandidate && image) {
    const dx = e.clientX - ballDragCandidate.startX, dy = e.clientY - ballDragCandidate.startY;
    if (Math.hypot(dx, dy) < 4) return;
    ballDrag = {};
    ballJustHit = true;
    ballDragCandidate = null;
  }
  if (ballDrag && image) {
    ballMarker = clientToImage(e.clientX, e.clientY);
    redraw();
    return;
  }
  if (chipDragCandidate && image) {
    const dx = e.clientX - chipDragCandidate.startX, dy = e.clientY - chipDragCandidate.startY;
    if (Math.hypot(dx, dy) < 4) return;
    chipDrag = { id: chipDragCandidate.id };
    chipJustHit = true;
    chipDragCandidate = null;
  }
  if (chipDrag && image) {
    const chip = playerChips.find((c) => c.id === chipDrag.id);
    if (chip) chip.imagePx = clientToImage(e.clientX, e.clientY);
    redraw();
    return;
  }
  if (markerDragCandidate && image) {
    const dx = e.clientX - markerDragCandidate.startX, dy = e.clientY - markerDragCandidate.startY;
    if (Math.hypot(dx, dy) < 4) return; // not a real drag yet - leave it as a pending click
    markerDrag = { key: markerDragCandidate.key };
    markerJustHit = true;
    markerDragCandidate = null;
  }
  if (markerDrag && image) {
    const [ix, iy] = clientToImage(e.clientX, e.clientY);
    placed.set(markerDrag.key, [ix, iy]);
    redraw();
    return;
  }
  if (quadDrag && image) {
    const [ix, iy] = clientToImage(e.clientX, e.clientY);
    updateQuadDrag(ix, iy);
    redraw();
    return;
  }
  if (!quadDrag && !roiDrag && !panning && image && !quadEnabled && !roiMode) {
    canvas.style.cursor = (hitTestBall(e.clientX, e.clientY) || hitTestChip(e.clientX, e.clientY) != null || hitTestMarker(e.clientX, e.clientY)) ? 'grab' : '';
  }
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
  if (ballDragCandidate) { ballDragCandidate = null; return; }
  if (ballDrag) {
    ballDrag = null;
    if (onBallMoved) onBallMoved(ballMarker);
    return;
  }
  if (chipDragCandidate) {
    // Never moved past the threshold - a plain click, not a drag: toggle
    // selection instead. Reuses chipJustHit to suppress the trailing
    // native 'click' event's landmark-placement handler, same idea as
    // markerDragCandidate below.
    const id = chipDragCandidate.id;
    chipDragCandidate = null;
    chipJustHit = true;
    selectedChipId = selectedChipId === id ? null : id;
    redraw();
    if (onChipSelected) onChipSelected(selectedChipId);
    return;
  }
  if (chipDrag) {
    const id = chipDrag.id;
    chipDrag = null;
    const chip = playerChips.find((c) => c.id === id);
    if (onPlayerChipMoved && chip) onPlayerChipMoved(id, chip.imagePx);
    return;
  }
  if (markerDragCandidate) {
    // Never moved past the threshold - it was a plain click, not a drag.
    // Leave the marker untouched and let the trailing 'click' event
    // through normally (it may place a different, newly-armed landmark).
    markerDragCandidate = null;
    return;
  }
  if (markerDrag) {
    const key = markerDrag.key;
    markerDrag = null;
    if (onMarkerMoved) onMarkerMoved(key, placed.get(key));
    return;
  }
  if (quadDrag) { quadDrag = null; return; }
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
