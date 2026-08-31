// Border mode: user toggles it on, clicks any board-top point in the
// photo, then clicks the matching spot on a top-down mini-map. The
// mini-map click snaps to the actual board perimeter (straights + 2m
// corner arcs) and commits a new landmark at y=BOARD_H (board top).
// Lets the user calibrate off arbitrary boards when named landmarks
// (centre, crease, posts) aren't in frame.
import { RINK_L, HALF_W } from '../../constants.js';

const BOARD_R = 2000;
const BOARD_H = 500;
const MAP_W = 320, MAP_H = 190;
const PAD = 18;

const availW = MAP_W - 2 * PAD;
const availH = MAP_H - 2 * PAD;
const scale = Math.min(availW / RINK_L, availH / (2 * HALF_W));
const rinkW_px = RINK_L * scale;
const rinkH_px = 2 * HALF_W * scale;
const originX = (MAP_W - rinkW_px) / 2;
const originY = (MAP_H - rinkH_px) / 2;

let container = null;
let canvas = null;
let ctx = null;
let statusEl = null;
let enabled = false;
let pendingPhoto = null;         // [imgX, imgY] awaiting minimap click
let onCommitCb = null;           // (key, worldXYZ, photoXY) => void
const committed = new Map();     // key -> { world: [x,y,z], mapPx: [px, py] }
let counter = 0;

export function init(parent) {
  container = document.createElement('div');
  container.style.cssText = 'display:none; margin-top:6px;';
  const label = document.createElement('div');
  label.style.cssText = 'font-size:11px; opacity:0.75; margin-bottom:4px;';
  label.textContent = 'top-down rink - click the matching spot after each photo click';
  container.appendChild(label);
  canvas = document.createElement('canvas');
  canvas.width = MAP_W;
  canvas.height = MAP_H;
  canvas.style.cssText = 'background:#12181f; border:1px solid #2a3444; cursor:crosshair; display:block;';
  container.appendChild(canvas);
  statusEl = document.createElement('div');
  statusEl.style.cssText = 'font-size:11px; opacity:0.7; margin-top:2px; min-height:1em;';
  container.appendChild(statusEl);
  parent.appendChild(container);
  ctx = canvas.getContext('2d');
  canvas.addEventListener('click', onMapClick);
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

export function registerCommitted(key, world) {
  const mapPx = worldToMap(world[0], world[2]);
  committed.set(key, { world, mapPx });
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
  return [originX + z * scale, originY + (x + HALF_W) * scale];
}
function mapToWorld(px, py) {
  return [(py - originY) / scale - HALF_W, (px - originX) / scale];
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

function redraw() {
  if (!ctx) return;
  ctx.clearRect(0, 0, MAP_W, MAP_H);
  const [x0, y0] = worldToMap(-HALF_W, 0);
  const [x1, y1] = worldToMap( HALF_W, RINK_L);
  const rPx = BOARD_R * scale;
  ctx.strokeStyle = '#5fb4ff';
  ctx.lineWidth = 1.5;
  roundRectPath(ctx, x0, y0, x1 - x0, y1 - y0, rPx);
  ctx.stroke();
  // centre line
  const [c1x, c1y] = worldToMap(-HALF_W, RINK_L / 2);
  const [c2x, c2y] = worldToMap( HALF_W, RINK_L / 2);
  ctx.strokeStyle = 'rgba(95,180,255,0.35)';
  ctx.beginPath();
  ctx.moveTo(c1x, c1y);
  ctx.lineTo(c2x, c2y);
  ctx.stroke();
  // committed board-top points
  for (const { mapPx } of committed.values()) {
    ctx.fillStyle = '#7ee27a';
    ctx.strokeStyle = '#0a1414';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(mapPx[0], mapPx[1], 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // Orientation labels so users can't mirror-flip left/right.
  ctx.fillStyle = '#e8d34a';
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('Goal A', x0 + 2, y0 + 2);
  ctx.textAlign = 'right';
  ctx.fillText('Goal B', x1 - 2, y0 + 2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  const midX = (x0 + x1) / 2;
  ctx.fillText('board L (-x)', midX, y0 - 1);
  ctx.textBaseline = 'top';
  ctx.fillText('board R (+x)', midX, y1 + 1);
  // pending-photo indicator (small yellow badge in the corner)
  if (pendingPhoto) {
    ctx.fillStyle = '#e8d34a';
    ctx.beginPath();
    ctx.arc(MAP_W - 8, 8, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}
