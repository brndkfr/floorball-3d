// Border mode: user toggles it on, clicks any board-top point in the
// photo, then clicks the matching spot on a top-down mini-map. The
// mini-map click snaps to the actual board perimeter (straights + 2m
// corner arcs) and commits a new landmark at y=BOARD_H (board top).
// Lets the user calibrate off arbitrary boards when named landmarks
// (centre, crease, posts) aren't in frame.
import { RINK_L, HALF_W } from '../../constants.js';

const BOARD_R = 2000;
const BOARD_H = 500;
// Sized to fit inside #photoPanel's content width (270px panel - 28px
// padding = ~242px) - it was previously wider than the panel and overflowed.
const MAP_W = 230, MAP_H = 137;
const PAD = 18;
// How much of the rink's length to show when zoomed to one goal end - deep
// enough to include the crease + a bit of neutral zone for board landmarks.
const FOCUS_DEPTH = 12000;

const availW = MAP_W - 2 * PAD;
const availH = MAP_H - 2 * PAD;

let container = null;
let canvas = null;
let ctx = null;
let statusEl = null;
let warningEl = null;
let zoomBtn = null;
let enabled = false;
let pendingPhoto = null;         // [imgX, imgY] awaiting minimap click
let onCommitCb = null;           // (key, worldXYZ, photoXY) => void
const committed = new Map();     // key -> { world: [x,y,z] } (mapPx recomputed on redraw since the view can zoom)
let counter = 0;
let focusEnd = null;              // 'A' | 'B' | null - which end the photo shows (see setFocusEnd)
let showWhole = false;            // user override via the zoom toggle button

// Whole rink by default; zoomed to the near-board FOCUS_DEPTH slice at
// whichever end setFocusEnd() was last told about, unless the user
// overrides it with the zoom toggle button.
function viewBounds() {
  if (!showWhole && focusEnd === 'A') return { z0: 0, z1: Math.min(RINK_L, FOCUS_DEPTH) };
  if (!showWhole && focusEnd === 'B') return { z0: Math.max(0, RINK_L - FOCUS_DEPTH), z1: RINK_L };
  return { z0: 0, z1: RINK_L };
}

function computeLayout() {
  const { z0, z1 } = viewBounds();
  const depth = z1 - z0;
  const s = Math.min(availW / depth, availH / (2 * HALF_W));
  const boxW = depth * s, boxH = 2 * HALF_W * s;
  return { z0, z1, scale: s, originX: (MAP_W - boxW) / 2, originY: (MAP_H - boxH) / 2 };
}

export function init(parent) {
  container = document.createElement('div');
  container.style.cssText = 'display:none; margin-top:6px;';
  const header = document.createElement('div');
  header.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:6px; margin-bottom:4px;';
  const label = document.createElement('div');
  label.style.cssText = 'font-size:11px; opacity:0.75;';
  label.textContent = 'top-down rink - click the matching spot after each photo click';
  zoomBtn = document.createElement('button');
  zoomBtn.type = 'button';
  zoomBtn.className = 'dock-btn';
  zoomBtn.style.cssText = 'padding:1px 6px; font-size:9px; flex:none; display:none;';
  zoomBtn.title = 'Board points can only be seen on the visible perimeter - toggle to reach the far end';
  zoomBtn.addEventListener('click', () => {
    showWhole = !showWhole;
    updateZoomBtn();
    redraw();
  });
  header.appendChild(label);
  header.appendChild(zoomBtn);
  container.appendChild(header);
  canvas = document.createElement('canvas');
  canvas.width = MAP_W;
  canvas.height = MAP_H;
  canvas.style.cssText = 'background:#12181f; border:1px solid #2a3444; cursor:crosshair; display:block;';
  container.appendChild(canvas);
  statusEl = document.createElement('div');
  statusEl.style.cssText = 'font-size:11px; opacity:0.7; margin-top:2px; min-height:1em;';
  container.appendChild(statusEl);
  warningEl = document.createElement('div');
  warningEl.style.cssText = 'font-size:10px; color:#ff8080; margin-top:4px; padding:4px 6px; border:1px solid rgba(255,128,128,0.4); border-radius:4px; background:rgba(255,128,128,0.08); display:none;';
  warningEl.textContent = "Board points alone can't fix the pose (they're all the same height) - also click one crease corner or post-top from the list below.";
  container.appendChild(warningEl);
  parent.appendChild(container);
  ctx = canvas.getContext('2d');
  canvas.addEventListener('click', onMapClick);
  redraw();
}

function updateZoomBtn() {
  if (!zoomBtn) return;
  if (!focusEnd) { zoomBtn.style.display = 'none'; return; }
  zoomBtn.style.display = '';
  zoomBtn.textContent = showWhole ? `Zoom to Goal ${focusEnd}` : 'Show whole rink';
}

// Called by photo-overlay.js whenever it knows which goal end the photo is
// framing (the "detect as" dropdown) so the minimap zooms to that end
// instead of showing the full 40m rink at a tiny, hard-to-click scale.
export function setFocusEnd(end) {
  focusEnd = end === 'A' || end === 'B' ? end : null;
  showWhole = false;
  updateZoomBtn();
  redraw();
}

export function setEnabled(on) {
  enabled = !!on;
  if (container) container.style.display = enabled ? 'block' : 'none';
  if (!enabled) pendingPhoto = null;
  updateStatus();
  redraw();
}
export function isEnabled() { return enabled; }
export function setPending(photoXY) {
  pendingPhoto = photoXY ? [photoXY[0], photoXY[1]] : null;
  updateStatus();
}
export function hasPending() { return pendingPhoto !== null; }
export function getPending() { return pendingPhoto ? [...pendingPhoto] : null; }
export function setOnCommit(fn) { onCommitCb = fn; }

// Driven by photo-overlay.js's trySolve(): warns right where the user is
// clicking, not just in the small reprojection-error line below a long
// scrollable landmark list (see docs/plan.md 4.2, coplanar landmark trap).
export function setCoplanarWarning(on) {
  if (warningEl) warningEl.style.display = on ? 'block' : 'none';
}

export function registerCommitted(key, world) {
  committed.set(key, { world });
  redraw();
}
export function unregisterCommitted(key) {
  committed.delete(key);
  redraw();
}
export function clearAll() {
  committed.clear();
  pendingPhoto = null;
  counter = 0;
  focusEnd = null;
  showWhole = false;
  updateZoomBtn();
  redraw();
  updateStatus();
}

function updateStatus() {
  if (!statusEl) return;
  if (!enabled) { statusEl.textContent = ''; return; }
  statusEl.textContent = pendingPhoto
    ? 'Click the matching spot on the mini-map'
    : 'Click a board-top point on the photo';
}

function worldToMap(x, z) {
  const { z0, scale, originX, originY } = computeLayout();
  return [originX + (z - z0) * scale, originY + (x + HALF_W) * scale];
}
function mapToWorld(px, py) {
  const { z0, scale, originX, originY } = computeLayout();
  return [(py - originY) / scale - HALF_W, (px - originX) / scale + z0];
}

function snapToPerimeter(mx, mz) {
  const R = BOARD_R, W = HALF_W, L = RINK_L;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const cand = [];
  // 4 straight segments (interior clamped to the tangent-point range)
  cand.push([-W, clamp(mz, R, L - R)]);
  cand.push([ W, clamp(mz, R, L - R)]);
  cand.push([clamp(mx, -W + R, W - R), 0]);
  cand.push([clamp(mx, -W + R, W - R), L]);
  // 4 corner arcs (centre + quadrant sign of allowed offset direction)
  const arcs = [
    { cx: -W + R, cz: R,     sx: -1, sz: -1 },
    { cx:  W - R, cz: R,     sx:  1, sz: -1 },
    { cx: -W + R, cz: L - R, sx: -1, sz:  1 },
    { cx:  W - R, cz: L - R, sx:  1, sz:  1 },
  ];
  for (const a of arcs) {
    let dx = mx - a.cx;
    let dz = mz - a.cz;
    dx = a.sx < 0 ? Math.min(dx, 0) : Math.max(dx, 0);
    dz = a.sz < 0 ? Math.min(dz, 0) : Math.max(dz, 0);
    let d = Math.hypot(dx, dz);
    if (d === 0) { dx = a.sx / Math.SQRT2; dz = a.sz / Math.SQRT2; d = 1; }
    cand.push([a.cx + R * dx / d, a.cz + R * dz / d]);
  }
  let best = cand[0], bd = Infinity;
  for (const c of cand) {
    const d2 = (c[0] - mx) ** 2 + (c[1] - mz) ** 2;
    if (d2 < bd) { bd = d2; best = c; }
  }
  // Belt-and-suspenders: pin the result inside the rink so a stray candidate
  // can never produce z > RINK_L or |x| > HALF_W in the committed landmark.
  const cx = Math.max(-HALF_W, Math.min(HALF_W, best[0]));
  const cz = Math.max(0, Math.min(RINK_L, best[1]));
  return [cx, cz];
}

function onMapClick(e) {
  if (!enabled || !pendingPhoto) return;
  const rect = canvas.getBoundingClientRect();
  const px = (e.clientX - rect.left) * (canvas.width / rect.width);
  const py = (e.clientY - rect.top) * (canvas.height / rect.height);
  const [wx, wz] = mapToWorld(px, py);
  const [sx, sz] = snapToPerimeter(wx, wz);
  const key = `boardTop_${++counter}`;
  const world = [sx, BOARD_H, sz];
  const photoXY = pendingPhoto;
  pendingPhoto = null;
  updateStatus();
  if (onCommitCb) onCommitCb(key, world, photoXY);
}

function roundRectPath(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.arcTo(x + w, y, x + w, y + r, r);
  c.lineTo(x + w, y + h - r);
  c.arcTo(x + w, y + h, x + w - r, y + h, r);
  c.lineTo(x + r, y + h);
  c.arcTo(x, y + h, x, y + h - r, r);
  c.lineTo(x, y + r);
  c.arcTo(x, y, x + r, y, r);
  c.closePath();
}

function labelIfVisible(text, x, y, align, baseline) {
  if (x < -30 || x > MAP_W + 30 || y < -20 || y > MAP_H + 20) return;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(text, x, y);
}

function redraw() {
  if (!ctx) return;
  ctx.clearRect(0, 0, MAP_W, MAP_H);
  const { z0, z1, scale } = computeLayout();
  const [x0, y0] = worldToMap(-HALF_W, 0);
  const [x1, y1] = worldToMap( HALF_W, RINK_L);
  const rPx = BOARD_R * scale;
  ctx.strokeStyle = '#5fb4ff';
  ctx.lineWidth = 1.5;
  roundRectPath(ctx, x0, y0, x1 - x0, y1 - y0, rPx);
  ctx.stroke();
  // centre line - only drawn when it's actually inside the current view
  const centreZ = RINK_L / 2;
  if (centreZ >= z0 && centreZ <= z1) {
    const [c1x, c1y] = worldToMap(-HALF_W, centreZ);
    const [c2x, c2y] = worldToMap( HALF_W, centreZ);
    ctx.strokeStyle = 'rgba(95,180,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(c1x, c1y);
    ctx.lineTo(c2x, c2y);
    ctx.stroke();
  }
  // committed board-top points - mapPx recomputed here since the view can zoom
  for (const { world } of committed.values()) {
    const [px, py] = worldToMap(world[0], world[2]);
    ctx.fillStyle = '#7ee27a';
    ctx.strokeStyle = '#0a1414';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(px, py, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // Orientation labels so users can't mirror-flip left/right - skipped
  // when zoomed out of view rather than drawn off-canvas.
  ctx.fillStyle = '#e8d34a';
  ctx.font = 'bold 10px system-ui, sans-serif';
  labelIfVisible('Goal A', x0 + 2, y0 + 2, 'left', 'top');
  labelIfVisible('Goal B', x1 - 2, y0 + 2, 'right', 'top');
  const midX = (x0 + x1) / 2;
  labelIfVisible('board L (-x)', midX, y0 - 1, 'center', 'bottom');
  labelIfVisible('board R (+x)', midX, y1 + 1, 'center', 'top');
  // pending-photo indicator (small yellow badge in the corner)
  if (pendingPhoto) {
    ctx.fillStyle = '#e8d34a';
    ctx.beginPath();
    ctx.arc(MAP_W - 8, 8, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}
