// The compact KATA box burned into a lesson's video (A-BACK-049): three
// rows, Placement, Depth, Axis, each with a status dot. Pure layout and
// colour so it is Node-testable; export.js draws it on the canvas.

// Same colours as the Train card's dots (tokens.css: --vector-shot-blocked-*)
// and its dimmed 'free' / 'pending' grey.
export const KATA_DOT_COLORS = Object.freeze({ ok: '#2ecc55', adjust: '#ffd21a', free: '#8a919c', pending: '#8a919c' });
export const KATA_BOX_DIMS = Object.freeze(['placement', 'depth', 'axis']);

export const kataDotColor = (status) => KATA_DOT_COLORS[status] ?? KATA_DOT_COLORS.pending;

// The box in a w x h picture. `fontPx` sizes the rows, `labelW` is the
// widest label in px, `avoidTop` the y of the top of the caption box (or
// null): the KATA box sits bottom-left and, when there is a caption, ends
// a gap above it, so the two never overlap whatever the width.
export function kataBoxLayout({ w, h }, { fontPx, labelW, avoidTop = null, rows = KATA_BOX_DIMS.length }) {
  const padX = Math.round(fontPx * 0.8), padY = Math.round(fontPx * 0.5);
  const rowH = Math.round(fontPx * 1.5);
  const dot = Math.round(fontPx * 0.55);
  const gap = Math.round(fontPx * 0.6);
  const bw = Math.round(2 * padX + dot + gap + labelW), bh = rows * rowH + 2 * padY;
  const margin = Math.round(h * 0.05);
  const bottom = avoidTop == null ? h - margin : Math.min(h - margin, avoidTop - Math.round(fontPx * 0.6));
  return { x: margin, y: bottom - bh, w: bw, h: bh, padX, padY, rowH, dot, gap, fontPx };
}
