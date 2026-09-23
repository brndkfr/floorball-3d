// Pure position math for the floating tool palette. Keeps drag / clamp /
// persistence logic out of tool-palette.js so it's node-testable.

// Clamp a top-left position to a viewport, given the palette size and the
// reserved edges (topbar + rail). Returns a fresh {x, y}.
export function clampPalettePos(pos, size, viewport, reserved = {}) {
  const rTop = reserved.top | 0;
  const rLeft = reserved.left | 0;
  const rRight = reserved.right | 0;
  const rBottom = reserved.bottom | 0;
  const minX = rLeft;
  const minY = rTop;
  const maxX = Math.max(minX, viewport.w - size.w - rRight);
  const maxY = Math.max(minY, viewport.h - size.h - rBottom);
  const x = Math.min(maxX, Math.max(minX, pos.x));
  const y = Math.min(maxY, Math.max(minY, pos.y));
  return { x, y };
}

// Parse a persisted position blob; returns null if invalid so callers can
// fall back to the default anchor.
export function parseStoredPos(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  let obj;
  try { obj = JSON.parse(raw); } catch { return null; }
  if (!obj || typeof obj !== 'object') return null;
  const x = Number(obj.x);
  const y = Number(obj.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}
