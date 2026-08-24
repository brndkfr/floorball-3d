// The Dock: single authoring surface at the bottom-center of the viewport.
// See docs/floorball-3d-authoring-plan.md §3.7 for the design rationale.
//
// A1 scope: chip stamp button (with a team-color pip + next-number badge),
// team flip, overflow menu (New / Undo / Redo). Ball, shape tools, play,
// add-keyframe stubs are disabled placeholders until their milestones ship.

import { state } from '../state.js';
import { spawnChip, nextNumber, TEAM_COLORS, rebuildFromDoc } from './chips.js';
import { rebuildShapesFromDoc } from './shapes.js';
import { ensureDoc, emptyDoc } from './doc.js';
import { saveDoc } from './storage.js';
import { undo, redo, pushHistory } from './history.js';
import { enterTopDown, exitTopDown } from './topdown-camera.js';
import { startDrawing, cancelDrawing, handleFloorClick } from './draw-tool.js';

const dockEl = document.getElementById('dock');
if (!dockEl) throw new Error('dock element missing from index.html');

const chipBtn = dockEl.querySelector('[data-dock="chip"]');
const teamBtn = dockEl.querySelector('[data-dock="team"]');
const overflowBtn = dockEl.querySelector('[data-dock="overflow"]');
const overflowMenu = dockEl.querySelector('#dockOverflow');
const statusEl = document.getElementById('dockStatus');
const shapeButtons = dockEl.querySelectorAll('[data-dock-tool]');   // arrow, zone, text

const SHAPE_TOOLS = new Set(['arrow', 'zone', 'text']);

// --- state helpers ----------------------------------------------------

function setActiveTool(tool) {
  const prev = state.activeTool;
  if (prev === tool) tool = null;   // clicking active tool exits it
  state.activeTool = tool;

  // camera swap: any shape tool enters top-down; anything else restores
  if (SHAPE_TOOLS.has(tool)) enterTopDown(); else exitTopDown();

  // draw-tool state: start/stop the click-to-place machine
  if (SHAPE_TOOLS.has(tool)) startDrawing(tool); else cancelDrawing();

  // button highlights
  chipBtn.classList.toggle('active', tool === 'chip');
  shapeButtons.forEach((b) => b.classList.toggle('active', b.dataset.dockTool === tool));
  document.body.classList.toggle('tool-active', !!tool);
  document.body.classList.toggle('tool-chip', tool === 'chip');
  refreshStatus();
}

function refreshStatus() {
  const t = state.currentTeam;
  const n = nextNumber(t);
  const tool = state.activeTool;
  let msg = `Team ${t} - next #${n}`;
  if (tool === 'chip') msg = `chip tool - click the rink to drop Team ${t} #${n} (Esc to exit)`;
  else if (tool === 'arrow') msg = 'arrow tool - click start point, then end point (Esc to exit)';
  else if (tool === 'zone') msg = 'zone tool - click points; click near the first point to close (Esc to exit)';
  else if (tool === 'text') msg = 'text tool - click the rink where the label should go (Esc to exit)';
  statusEl.textContent = msg;
  teamBtn.style.setProperty('--team-color', '#' + TEAM_COLORS[t].toString(16).padStart(6, '0'));
  teamBtn.textContent = `T${t}`;
}

export function refreshDock() {
  refreshStatus();
}

// --- button wiring ----------------------------------------------------

chipBtn.addEventListener('click', () => setActiveTool('chip'));
shapeButtons.forEach((b) => b.addEventListener('click', () => setActiveTool(b.dataset.dockTool)));

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
  const empty = Object.keys(ensureDoc().scheme.players).length === 0 && (ensureDoc().scheme.shapes?.length ?? 0) === 0;
  if (empty) return;
  if (!confirm('Discard the current scheme and start a new one?')) return;
  state.doc = emptyDoc();
  rebuildFromDoc();
  rebuildShapesFromDoc();
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

// --- click-on-rink -> spawn chip / draw shape when a tool is active ---

// Wired from selection.js's pointerup handler via this exported callback;
// keeps the click-vs-drag threshold logic in one place.
export function handleFloorClickForTool(worldPoint) {
  if (state.activeTool === 'chip') {
    spawnChip({ team: state.currentTeam, x: worldPoint.x, z: worldPoint.z });
    refreshStatus();
    return true;
  }
  if (SHAPE_TOOLS.has(state.activeTool)) {
    return handleFloorClick(worldPoint);
  }
  return false;
}

refreshStatus();
