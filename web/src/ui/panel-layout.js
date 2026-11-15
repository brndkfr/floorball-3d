// Panel layout state (A-BACK-044): the right panel open or as a 40 px icon
// strip, which panel sections are folded, the scene recorder open or
// folded to its transport bar, and what Present mode hides. Pure (no DOM)
// so test/panel-layout.test.js can pin it; ui/panels.js applies it and
// keeps it in localStorage. Only the >= 1200 px layout uses the strip;
// below that the panel is a drawer (decisions/002), unchanged.

export const SECTIONS = Object.freeze(['inspector', 'layersPanel', 'viewPanel', 'coords']);   // element ids in #rightPanel
export const PANEL_STRIP_PX = 40;   // mirrored in app.css (html.panel-strip --right-panel)

export const DEFAULT_PANEL_STATE = Object.freeze({
  panel: 'open',      // 'open' | 'strip'
  timeline: 'open',   // 'open' | 'bar'
  folded: Object.freeze({ inspector: false, layersPanel: false, viewPanel: false, coords: true }),
});

// Shell roots Present mode hides (ids), leaving the stage and a small
// transport. Mirrored in app.css (html.presenting); panels.spec.js checks
// each is hidden.
export const PRESENT_HIDES = Object.freeze([
  'appRail', 'appTopbar', 'rightPanel', 'panelStrip', 'toolPalette', 'dock', 'dockStatus', 'timeline',
  'touchControls', 'goalieLabel', 'chipPopover', 'crosshair', 'saveStatus', 'status',
]);

export function parsePanelState(raw) {
  let v;
  try { v = JSON.parse(raw); } catch { return DEFAULT_PANEL_STATE; }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return DEFAULT_PANEL_STATE;
  const folded = { ...DEFAULT_PANEL_STATE.folded };
  for (const id of SECTIONS) if (typeof v.folded?.[id] === 'boolean') folded[id] = v.folded[id];
  return {
    panel: v.panel === 'strip' ? 'strip' : 'open',
    timeline: v.timeline === 'bar' ? 'bar' : 'open',
    folded,
  };
}

export const togglePanel = (s) => ({ ...s, panel: s.panel === 'open' ? 'strip' : 'open' });
export const toggleTimeline = (s) => ({ ...s, timeline: s.timeline === 'open' ? 'bar' : 'open' });

export function toggleFold(s, id) {
  if (!SECTIONS.includes(id)) return s;
  return { ...s, folded: { ...s.folded, [id]: !s.folded[id] } };
}

// A strip icon: open the panel at that section, unfolded.
export function openAt(s, id) {
  return { ...s, panel: 'open', folded: { ...s.folded, [id]: false } };
}
