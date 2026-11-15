// The live shot overlay toggles (A-BACK-045 step 3): state.shotView, loaded
// from and saved to this browser (shot-view.js holds the pure rules). The
// Inspector's Shot section switches them; trajectory.js and coverage.js
// read them. Fires `shotViewChanged` on window after every change.

import { state } from './state.js';
import { parseShotView, toggleShotView, SHOT_VIEW_STORAGE_KEY } from './shot-view.js';

let stored = null;
try { stored = localStorage.getItem(SHOT_VIEW_STORAGE_KEY); } catch { /* storage blocked: defaults */ }
state.shotView = parseShotView(stored);

export function toggleShotOverlay(key) {
  const next = toggleShotView(state.shotView, key);
  if (next === state.shotView) return;
  state.shotView = next;
  try { localStorage.setItem(SHOT_VIEW_STORAGE_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
  window.dispatchEvent(new Event('shotViewChanged'));
}
