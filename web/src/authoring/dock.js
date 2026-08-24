// The Dock: single authoring surface at the bottom-center of the viewport.
// See docs/floorball-3d-authoring-plan.md §3.7 for the design rationale.
//
// A1 scope: chip stamp button (with a team-color pip + next-number badge),
// team flip, overflow menu (New / Undo / Redo). Ball, shape tools, play,
// add-keyframe stubs are disabled placeholders until their milestones ship.

import { state } from '../state.js';
import { spawnChip, nextNumber, TEAM_COLORS, rebuildFromDoc } from './chips.js';
import { rebuildShapesFromDoc, updateShape } from './shapes.js';
import { ensureDoc, emptyDoc } from './doc.js';
import { saveDoc, saveNamedSlot, loadNamedSlot, listSlots, deleteSlot, downloadDocJson, readDocFromFile } from './storage.js';
import { encodeShareUrl } from './share.js';
import { undo, redo, pushHistory } from './history.js';
import { enterTopDown, exitTopDown } from './topdown-camera.js';
import { startDrawing, cancelDrawing, handleFloorClick, tryCommitZone, drawPointCount } from './draw-tool.js';

const dockEl = document.getElementById('dock');
if (!dockEl) throw new Error('dock element missing from index.html');

const chipBtn = dockEl.querySelector('[data-dock="chip"]');
const teamBtn = dockEl.querySelector('[data-dock="team"]');
const overflowBtn = dockEl.querySelector('[data-dock="overflow"]');
const overflowMenu = dockEl.querySelector('#dockOverflow');
const colorBtn = dockEl.querySelector('[data-dock="color"]');
const palette = document.getElementById('dockPalette');
const statusEl = document.getElementById('dockStatus');
const shapeButtons = dockEl.querySelectorAll('[data-dock-tool]');   // arrow, zone, text

const SHAPE_TOOLS = new Set(['arrow', 'zone', 'text']);
const PALETTE_COLORS = ['#ffb347', '#ff5b5b', '#5bd1ff', '#7ee06b', '#c07bff', '#ffffff', '#1a120a'];

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
  else if (tool === 'zone') {
    const n = drawPointCount();
    if (n === 0) msg = 'zone tool - click corners of the area (Esc to exit)';
    else if (n < 3) msg = `zone tool - ${n}/3+ corners placed; keep clicking (Esc to exit)`;
    else msg = `zone tool - ${n} corners; press Enter or double-click to finish (Esc to exit)`;
  }
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

// --- A3: named slots, JSON import/export, share URL -------------------

const slotsPopover = document.getElementById('dockSlots');
const fileInput = document.getElementById('dockImportFile');

function loadDocInto(doc) {
  state.doc = doc;
  rebuildFromDoc();
  rebuildShapesFromDoc();
  saveDoc();
  pushHistory();
  refreshStatus();
}

function renderSlotsPopover() {
  const names = listSlots();
  slotsPopover.innerHTML = '';
  if (names.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'slots-empty';
    empty.textContent = 'no saved schemes yet';
    slotsPopover.appendChild(empty);
    return;
  }
  for (const name of names) {
    const row = document.createElement('div');
    row.className = 'slots-row';
    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'slots-load';
    label.textContent = name;
    label.title = 'Load this scheme';
    label.addEventListener('click', () => {
      const doc = loadNamedSlot(name);
      if (!doc) { alert(`Could not load "${name}".`); return; }
      loadDocInto(doc);
      slotsPopover.classList.remove('open');
    });
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'slots-delete';
    del.title = 'Delete';
    del.textContent = '\u00d7';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm(`Delete saved scheme "${name}"?`)) return;
      deleteSlot(name);
      renderSlotsPopover();
    });
    row.appendChild(label);
    row.appendChild(del);
    slotsPopover.appendChild(row);
  }
}

overflowMenu.querySelector('[data-action="save"]').addEventListener('click', () => {
  overflowMenu.classList.remove('open');
  const suggested = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const name = prompt('Save scheme as:', suggested);
  if (!name) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  if (listSlots().includes(trimmed) && !confirm(`Overwrite existing "${trimmed}"?`)) return;
  if (saveNamedSlot(trimmed)) refreshStatus();
});

overflowMenu.querySelector('[data-action="load"]').addEventListener('click', (e) => {
  e.stopPropagation();
  overflowMenu.classList.remove('open');
  renderSlotsPopover();
  slotsPopover.classList.toggle('open');
});
document.addEventListener('click', (e) => {
  if (!slotsPopover.contains(e.target)) slotsPopover.classList.remove('open');
});

overflowMenu.querySelector('[data-action="export"]').addEventListener('click', () => {
  overflowMenu.classList.remove('open');
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  downloadDocJson(ensureDoc(), `floorball-scheme-${stamp}.json`);
});

overflowMenu.querySelector('[data-action="import"]').addEventListener('click', () => {
  overflowMenu.classList.remove('open');
  fileInput.value = '';
  fileInput.click();
});
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const doc = await readDocFromFile(file);
  if (!doc) { alert('Could not read that file - is it a valid floorball-3d scheme JSON?'); return; }
  loadDocInto(doc);
});

overflowMenu.querySelector('[data-action="share"]').addEventListener('click', async () => {
  overflowMenu.classList.remove('open');
  const url = await encodeShareUrl(ensureDoc());
  if (!url) {
    // Scene too large for a URL fragment - fall back to JSON download and
    // tell the user, so a shareable artifact still exists.
    alert('This scheme is too large for a share URL (~32 KB max). Downloading JSON instead - share the file.');
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    downloadDocJson(ensureDoc(), `floorball-scheme-${stamp}.json`);
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    statusEl.textContent = 'share link copied to clipboard';
    setTimeout(refreshStatus, 2000);
  } catch (e) {
    // Clipboard API blocked (e.g. non-HTTPS, no user gesture chain) -
    // fall back to showing the URL for manual copy.
    prompt('Share URL (copy manually):', url);
  }
});

// --- keyboard: Esc exits tool mode, Ctrl+Z / Ctrl+Y for undo/redo -----

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.activeTool) {
    setActiveTool(null);
    return;
  }
  if (event.key === 'Enter' && state.activeTool === 'zone') {
    if (tryCommitZone()) { event.preventDefault(); refreshStatus(); return; }
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
    const consumed = handleFloorClick(worldPoint);
    refreshStatus();
    return consumed;
  }
  return false;
}

window.addEventListener('dblclick', () => {
  if (state.activeTool === 'zone' && tryCommitZone()) refreshStatus();
});

// --- color palette ----------------------------------------------------

function buildPalette() {
  palette.innerHTML = '';
  for (const c of PALETTE_COLORS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.style.background = c;
    b.dataset.color = c;
    b.title = c;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      applyColor(c);
      palette.classList.remove('open');
    });
    palette.appendChild(b);
  }
}

function refreshPaletteSwatch() {
  colorBtn.style.setProperty('--draw-color', state.drawColor);
  palette.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('active', b.dataset.color?.toLowerCase() === state.drawColor.toLowerCase());
  });
}

function applyColor(c) {
  state.drawColor = c;
  refreshPaletteSwatch();
  const sel = state.selected;
  const shapeIdx = state.shapeObjects.indexOf(sel);
  if (shapeIdx >= 0) {
    const id = sel.userData?.shape?.id;
    if (id) {
      const obj = updateShape(id, { color: c });
      if (obj) import('../selection.js').then((s) => s.selectObject(obj));
    }
  }
}

colorBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  overflowMenu.classList.remove('open');
  palette.classList.toggle('open');
});
document.addEventListener('click', (e) => {
  if (!palette.contains(e.target) && e.target !== colorBtn) {
    palette.classList.remove('open');
  }
});

buildPalette();
refreshPaletteSwatch();

refreshStatus();
