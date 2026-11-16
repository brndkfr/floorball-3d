// Which shot overlays are on (A-BACK-045 step 2): the ball-to-goal corner
// lines, the shooting line (ball to goal centre, in the verdict colour)
// and goal coverage. A view setting, remembered per browser
// (localStorage `floorball3d.shotView`), not part of the doc. The goalie
// glow has no toggle: it comes with the shooting line (decision 5 in
// docs/items/A-BACK-045-shot-panel.md). three-free.

export const SHOT_VIEW_KEYS = Object.freeze(['lines', 'shotLine', 'coverage']);
export const DEFAULT_SHOT_VIEW = Object.freeze({ lines: false, shotLine: false, coverage: false });
export const SHOT_VIEW_STORAGE_KEY = 'floorball3d.shotView';

export function parseShotView(raw) {
  let v;
  try { v = JSON.parse(raw); } catch { return DEFAULT_SHOT_VIEW; }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return DEFAULT_SHOT_VIEW;
  const out = { ...DEFAULT_SHOT_VIEW };
  for (const k of SHOT_VIEW_KEYS) if (typeof v[k] === 'boolean') out[k] = v[k];
  return out;
}

export function toggleShotView(view, key) {
  if (!SHOT_VIEW_KEYS.includes(key)) return view;
  return { ...view, [key]: !view[key] };
}

export const outlineShown = (view) => !!view.shotLine;
export const anyShotOverlay = (view) => SHOT_VIEW_KEYS.some((k) => !!view[k]);

// Train mode (A-BACK-054 follow-up): the corner lines and the shooting
// line come on with Train, on top of Plan's choice; Train's Lines switch
// turns both together. Plan's stored choice is never touched.
export const trainShotView = (planView) => ({ ...planView, lines: true, shotLine: true });
export const trainLinesOn = (view) => !!view.lines && !!view.shotLine;
export const withTrainLines = (view, on) => ({ ...view, lines: !!on, shotLine: !!on });
