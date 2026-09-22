// Per-frame top-down thumbnail for the timeline strip (A-GAP-002).
//
// Draws a lightweight 2D-canvas snapshot of the frame's scheme (rink
// outline + centre line + chips + shapes) and caches the resulting data
// URL keyed by frame id. The cache entry stores a JSON hash of the scheme
// alongside the requested pixel size, so a timeline re-render on a pure
// selection change or a playback transport event returns the cached URL,
// while any content mutation (which restringifies to a different hash)
// or a resize (wheel over the strip) invalidates it lazily on the next
// getFrameThumb() call. `framesChanged` is only fired on user events,
// never on the render animate() loop, so a full stringify per card is
// fine here - see docs/plan.md A-GAP-002.
//
// Landscape orientation (rink long axis horizontal, z -> screen x,
// world x -> screen y) matches the intuitive floorball diagram layout
// and keeps the thumb wider than tall at typical card widths (40..120 px).

import { RINK_L, RINK_W, HALF_W } from '../constants.js';
import { TEAM_HOME, TEAM_AWAY } from '../tokens.js';

const cache = new Map(); // frameId -> { hash, url }

const scratch = typeof document !== 'undefined' ? document.createElement('canvas') : null;

function hexColor(hex) {
  return '#' + (hex >>> 0).toString(16).padStart(6, '0');
}
function teamCss(team) {
  if (team === 1 || team === 'home') return hexColor(TEAM_HOME.hex);
  if (team === 2 || team === 'away') return hexColor(TEAM_AWAY.hex);
  return '#888888';
}

function withAlpha(cssColor, a) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(cssColor);
  if (!m) return cssColor;
  let hex = m[1];
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function drawShape(ctx, s, sx, sy) {
  const color = s.color || '#ffb347';
  const pts = Array.isArray(s.points) ? s.points : null;
  if (s.type === 'zone' && pts && pts.length >= 3) {
    ctx.fillStyle = withAlpha(color, 0.28);
    ctx.strokeStyle = withAlpha(color, 0.80);
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.moveTo(sx(pts[0].z), sy(pts[0].x));
    for (let i = 1; i < pts.length; i++) ctx.lineTo(sx(pts[i].z), sy(pts[i].x));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    return;
  }
  if (s.type === 'arrow' && pts && pts.length >= 2) {
    ctx.strokeStyle = withAlpha(color, 0.95);
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx(pts[0].z), sy(pts[0].x));
    for (let i = 1; i < pts.length; i++) ctx.lineTo(sx(pts[i].z), sy(pts[i].x));
    ctx.stroke();
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    const ax = sx(a.z), ay = sy(a.x);
    const bx = sx(b.z), by = sy(b.x);
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const hx = dx / len, hy = dy / len;
    const headLen = 4;
    const px = -hy, py = hx;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx - hx * headLen + px * headLen * 0.5, by - hy * headLen + py * headLen * 0.5);
    ctx.moveTo(bx, by);
    ctx.lineTo(bx - hx * headLen - px * headLen * 0.5, by - hy * headLen - py * headLen * 0.5);
    ctx.stroke();
    return;
  }
  if (s.type === 'text' && typeof s.x === 'number' && typeof s.z === 'number') {
    ctx.fillStyle = withAlpha(color, 0.85);
    ctx.beginPath();
    ctx.arc(sx(s.z), sy(s.x), 1.25, 0, Math.PI * 2);
    ctx.fill();
  }
}

function draw(canvas, scheme) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);

  const inset = 1.5;
  const rw = w - 2 * inset;
  const rh = h - 2 * inset;
  const sx = (z) => inset + (z / RINK_L) * rw;
  const sy = (x) => inset + ((x + HALF_W) / RINK_W) * rh;

  // rink field
  ctx.fillStyle = 'rgba(120,140,120,0.14)';
  ctx.fillRect(inset, inset, rw, rh);

  // outline
  ctx.strokeStyle = 'rgba(255,179,71,0.55)';
  ctx.lineWidth = 1;
  roundRectPath(ctx, inset, inset, rw, rh, Math.min(rw, rh) * 0.12);
  ctx.stroke();

  // centre line
  ctx.strokeStyle = 'rgba(255,179,71,0.35)';
  ctx.beginPath();
  ctx.moveTo(sx(RINK_L / 2), inset);
  ctx.lineTo(sx(RINK_L / 2), h - inset);
  ctx.stroke();

  const shapes = Array.isArray(scheme?.shapes) ? scheme.shapes : [];
  for (const s of shapes) drawShape(ctx, s, sx, sy);

  const players = scheme?.players || {};
  const chipR = Math.max(1.4, Math.min(w, h) * 0.055);
  ctx.lineWidth = 0.6;
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  for (const id of Object.keys(players)) {
    const p = players[id];
    if (!p || typeof p.x !== 'number' || typeof p.z !== 'number') continue;
    ctx.fillStyle = teamCss(p.team);
    ctx.beginPath();
    ctx.arc(sx(p.z), sy(p.x), chipR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function schemeHash(scheme) {
  try { return JSON.stringify(scheme); } catch { return ''; }
}

// Returns a PNG data URL. Cached per frame id + hash + size; safe to call
// on every timeline re-render (framesChanged / playbackChanged / wheel
// resize) - the cache handles unchanged frames without redrawing.
export function getFrameThumb(frame, w, h) {
  if (!frame || !scratch || w < 2 || h < 2) return '';
  const iw = Math.round(w), ih = Math.round(h);
  const hash = iw + 'x' + ih + '|' + schemeHash(frame.scheme);
  const cached = cache.get(frame.id);
  if (cached && cached.hash === hash) return cached.url;
  scratch.width = iw;
  scratch.height = ih;
  draw(scratch, frame.scheme);
  const url = scratch.toDataURL('image/png');
  cache.set(frame.id, { hash, url });
  return url;
}

export function invalidateFrameThumbs() {
  cache.clear();
}
