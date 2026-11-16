// Screenshot, whole app (S-BACK-032): the pure parts, Node-tested.
// screenshot.js does the DOM and canvas work.

const pad = (n) => String(n).padStart(2, '0');

// floorball-<mode>-YYYY-MM-DD-HH-MM-SS.png in local time; the mode is
// reduced to letters and digits so it is always a safe file name.
export function shotFileName(date, mode) {
  const m = String(mode || '').replace(/[^a-z0-9]/gi, '');
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  return `floorball-${m ? `${m}-` : ''}${stamp}.png`;
}

// The visible stage: the window minus the parts of the shell that are on
// screen right now. Rects are { x, y, w, h } in CSS px, null when hidden.
//   rail    left rail (desktop) or bottom tab bar (phone: wider than tall)
//   topbar  top bar
//   panels  side panels; only ones docked on the right half count
//   bars    bottom bars (the recorder); their top edge ends the stage
// Falls back to the whole window when the result would be empty.
export function stageCrop({ vw, vh, rail, topbar, panels = [], bars = [] }) {
  const real = (r) => r && r.w > 0 && r.h > 0;
  let left = 0, top = 0, right = vw, bottom = vh;
  if (real(rail)) {
    if (rail.w >= rail.h) bottom = Math.min(bottom, rail.y);   // phone tab bar
    else left = Math.max(left, rail.x + rail.w);
  }
  if (real(topbar)) top = Math.max(top, topbar.y + topbar.h);
  for (const p of panels) if (real(p) && p.x >= vw / 2) right = Math.min(right, p.x);
  for (const b of bars) if (real(b)) bottom = Math.min(bottom, b.y);
  const w = right - left, h = bottom - top;
  if (w < 1 || h < 1) return { x: 0, y: 0, w: vw, h: vh };
  return { x: left, y: top, w, h };
}

// A screen rect in image pixels: relative to the crop, times the scale.
export function toImageRect(r, crop, scale) {
  return { x: (r.x - crop.x) * scale, y: (r.y - crop.y) * scale, w: r.w * scale, h: r.h * scale };
}

// What CSS text-transform shows, for painting text the way it looks.
export function applyTextTransform(text, transform) {
  if (transform === 'uppercase') return text.toUpperCase();
  if (transform === 'lowercase') return text.toLowerCase();
  if (transform === 'capitalize') return text.replace(/(^|\s)(\S)/g, (_, s, c) => s + c.toUpperCase());
  return text;
}
