// Pure parts of the shot verdict display (A-BACK-045 step 5): the words the
// Inspector's verdict card and the chip on the rink share, and where a
// projected point lands on the page. three-free.

export const VERDICT_TITLES = Object.freeze({
  open: 'Open shot',
  'blocked-off': 'Blocked off-centre',
  'blocked-centred': 'Centred block',
});

// { key, pctBlocked } (shot-readout.js) -> { key, title, pct } or null.
export function verdictWords(readout) {
  if (!readout) return null;
  return { key: readout.key, title: VERDICT_TITLES[readout.key] ?? readout.key, pct: `${Math.round(readout.pctBlocked)}%` };
}

const EDGE = 1.1;   // NDC: a little past the canvas edge still shows

// Normalised device coordinates (Vector3.project) -> page px inside the
// canvas `rect` (getBoundingClientRect), or null when behind the camera or
// well outside the canvas.
export function ndcToPage(ndc, rect) {
  if (ndc.z > 1 || Math.abs(ndc.x) > EDGE || Math.abs(ndc.y) > EDGE) return null;
  return {
    left: rect.left + ((ndc.x + 1) / 2) * rect.width,
    top: rect.top + ((1 - ndc.y) / 2) * rect.height,
  };
}
