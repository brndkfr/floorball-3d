// Whether the goalie zones show on the floor (A-BACK-048): state.goalieZonesShown.
// Plan's choice is remembered per browser (off by default, Layers panel row);
// Train turns them on without touching that choice and gives it back on the
// way out (train-mode.js). Fires `goalieZonesChanged` on window.

import { state } from './state.js';
import { GOALIE_ZONES_STORAGE_KEY, parseGoalieZonesShown, GOALIE_ZONE_LABELS_STORAGE_KEY, parseGoalieZoneLabelsShown } from './goalie-zones.js';

let stored = null;
try { stored = localStorage.getItem(GOALIE_ZONES_STORAGE_KEY); } catch { /* storage blocked: off */ }
let planChoice = parseGoalieZonesShown(stored);
state.goalieZonesShown = planChoice;

// remember: true for Plan's own toggle; Train passes false.
export function setGoalieZonesShown(on, { remember = true } = {}) {
  const v = !!on;
  if (remember) {
    planChoice = v;
    try { localStorage.setItem(GOALIE_ZONES_STORAGE_KEY, v ? '1' : '0'); } catch { /* storage blocked */ }
  }
  if (v === state.goalieZonesShown) return;
  state.goalieZonesShown = v;
  window.dispatchEvent(new Event('goalieZonesChanged'));
}

export const restorePlanGoalieZones = () => setGoalieZonesShown(planChoice, { remember: false });

// The zone labels (standing tags) have their own stored choice, on by
// default; they only show while the zones do. Fires `goalieZoneLabelsChanged`.
let storedLabels = null;
try { storedLabels = localStorage.getItem(GOALIE_ZONE_LABELS_STORAGE_KEY); } catch { /* storage blocked: on */ }
state.goalieZoneLabelsShown = parseGoalieZoneLabelsShown(storedLabels);

export function setGoalieZoneLabelsShown(on) {
  const v = !!on;
  try { localStorage.setItem(GOALIE_ZONE_LABELS_STORAGE_KEY, v ? '1' : '0'); } catch { /* storage blocked */ }
  if (v === state.goalieZoneLabelsShown) return;
  state.goalieZoneLabelsShown = v;
  window.dispatchEvent(new Event('goalieZoneLabelsChanged'));
}
