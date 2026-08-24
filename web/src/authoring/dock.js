// The Dock: single authoring surface at the bottom-center of the viewport.
// See docs/floorball-3d-authoring-plan.md §3.7 for the design rationale.
//
// A1 scope: chip stamp button (with a team-color pip + next-number badge),
// team flip, overflow menu (New / Undo / Redo). Ball, shape tools, play,
// add-keyframe stubs are disabled placeholders until their milestones ship.

import { state } from '../state.js';
import { spawnChip, nextNumber, TEAM_COLORS, rebuildFromDoc } from './chips.js';
import { ensureDoc, emptyDoc } from './doc.js';
import { saveDoc } from './storage.js';
import { undo, redo, pushHistory } from './history.js';

const dockEl = document.getElementById('dock');
if (!dockEl) throw new Error('dock element missing from index.html');

const chipBtn = dockEl.querySelector('[data-dock="chip"]');
const teamBtn = dockEl.querySelector('[data-dock="team"]');
const overflowBtn = dockEl.querySelector('[data-dock="overflow"]');
const overflowMenu = dockEl.querySelector('#dockOverflow');
const statusEl = document.getElementById('dockStatus');

// --- state helpers ----------------------------------------------------

function setActiveTool(tool) {
  state.activeTool = tool;
  chipBtn.classList.toggle('active', tool === 'chip');
  document.body.classList.toggle('tool-chip', tool === 'chip');
  refreshStatus();
}

function refreshStatus() {
  const t = state.currentTeam;
  const n = nextNumber(t);
  statusEl.textContent = state.activeTool === 'chip'
    ? `chip tool - click the rink to drop Team ${t} #${n} (Esc to exit)`
    : `Team ${t} - next #${n}`;
  teamBtn.style.setProperty('--team-color', '#' + TEAM_COLORS[t].toString(16).padStart(6, '0'));
  teamBtn.textContent = `T${t}`;
}

export function refreshDock() {
  refreshStatus();
}

// --- button wiring ----------------------------------------------------

chipBtn.addEventListener('click', () => {
  setActiveTool(state.activeTool === 'chip' ? null : 'chip');
});

teamBtn.addEventListener('click', () => {
  state.currentTeam = state.currentTeam === 1 ? 2 : 1;
  refreshStatus();
});

// overflow menu (New / Undo / Redo) - simple toggle-visibility popover
overflowBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  overflowMenu.classList.toggle('open');
});
document.addEventListener('click', (e) => {
  if (!overflowMenu.contains(e.target) && e.target !== overflowBtn) {
    overflowMenu.classList.remove('open');
  }
});

overflowMenu.querySelector('[data-action="new"]').addEventListener('click', () => {
  overflowMenu.classList.remove('open');
  if (Object.keys(ensureDoc().scheme.players).length === 0) return;
  if (!confirm('Discard the current scheme and start a new one?')) return;
  state.doc = emptyDoc();
  rebuildFromDoc();
  saveDoc();
  pushHistory();
  refreshStatus();
});

overflowMenu.querySelector('[data-action="undo"]').addEventListener('click', () => {
  overflowMenu.classList.remove('open');
  undo();
  refreshStatus();
});

overflowMenu.querySelector('[data-action="redo"]').addEventListener('click', () => {
  overflowMenu.classList.remove('open');
  redo();
  refreshStatus();
});

// --- keyboard: Esc exits tool mode, Ctrl+Z / Ctrl+Y for undo/redo -----

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.activeTool) {
    setActiveTool(null);
    return;
  }
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    undo();
    refreshStatus();
  } else if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z'))) {
    event.preventDefault();
    redo();
    refreshStatus();
  }
});

// --- click-on-rink -> spawn chip when in chip tool --------------------

// Wired from selection.js's pointerup handler via this exported callback;
// keeps the click-vs-drag threshold logic in one place.
export function handleFloorClickForTool(worldPoint) {
  if (state.activeTool !== 'chip') return false;
  spawnChip({ team: state.currentTeam, x: worldPoint.x, z: worldPoint.z });
  refreshStatus();
  return true;
}

refreshStatus();
