// The Dock: single authoring surface at the bottom-center of the viewport.
// See docs/floorball-3d-authoring-plan.md §3.7 for the design rationale.
//
// A1 scope: chip stamp button (with a team-color pip + next-number badge),
// team flip, overflow menu (New / Undo / Redo). Ball, shape tools, play,
// add-keyframe stubs are disabled placeholders until their milestones ship.

import { state } from '../state.js';
import { spawnChip, nextNumber, TEAM_COLORS } from './chips.js';
import { updateShape } from './shapes.js';
import { spawnCone } from './cones.js';
import { spawnBall } from './balls.js';
import { ensureDoc } from './doc.js';
import { saveDoc, downloadDocJson, readDocFromFile, createProject, adoptDocAsProject, setCurrentProjectId } from './storage.js';
import { openLibraryDialog, switchToProject, onProjectChanged, currentProjectName } from './library-dialog.js';
import { encodeShareUrl } from './share.js';
import { undo, redo } from './history.js';
import { enterTopDown, exitTopDown, isTopDown } from './topdown-camera.js';
import { startDrawing, cancelDrawing, handleFloorClick, tryCommitZone, tryCommitArrow, drawPointCount } from './draw-tool.js';
import { snapToNearestDot } from './faceoff-snap.js';
import { showAlert, showPrompt } from './dialog.js';

const dockEl = document.getElementById('dock');
if (!dockEl) throw new Error('dock element missing from index.html');

const chipBtn = dockEl.querySelector('[data-dock="chip"]');
const teamBtn = dockEl.querySelector('[data-dock="team"]');
const viewBtn = dockEl.querySelector('[data-dock="view"]');
const rotateBtn = dockEl.querySelector('[data-dock="rotate"]');
const overflowBtn = dockEl.querySelector('[data-dock="overflow"]');
const overflowMenu = dockEl.querySelector('#dockOverflow');
const projectBtn = dockEl.querySelector('[data-dock="project"]');
const projectNameEl = document.getElementById('dockProjectName');
const colorBtn = dockEl.querySelector('[data-dock="color"]');
const palette = document.getElementById('dockPalette');
const statusEl = document.getElementById('dockStatus');
const shapeButtons = dockEl.querySelectorAll('[data-dock-tool]');   // arrow, zone, text

const SHAPE_TOOLS = new Set(['arrow', 'arrow-curved', 'zone', 'zone-rect', 'zone-circle', 'zone-triangle', 'text']);
const PALETTE_COLORS = ['#ffb347', '#ff5b5b', '#5bd1ff', '#7ee06b', '#c07bff', '#ffffff', '#1a120a'];

// --- state helpers ----------------------------------------------------

function setActiveTool(tool) {
  const prev = state.activeTool;
  if (prev === tool) tool = null;   // clicking active tool exits it
  state.activeTool = tool;

  // draw-tool state: start/stop the click-to-place machine
  if (SHAPE_TOOLS.has(tool)) startDrawing(tool); else cancelDrawing();

  // button highlights
  chipBtn.classList.toggle('active', tool === 'chip');
  shapeButtons.forEach((b) => b.classList.toggle('active', b.dataset.dockTool === tool));
  document.body.classList.toggle('tool-active', !!tool);
  document.body.classList.toggle('tool-chip', tool === 'chip');
  refreshStatus();
  for (const cb of toolSubs) { try { cb(state.activeTool); } catch (e) { console.error(e); } }
}

const toolSubs = new Set();
export function onToolChanged(cb) { toolSubs.add(cb); return () => toolSubs.delete(cb); }
export function activateTool(tool) { setActiveTool(tool); }

function refreshStatus() {
  const t = state.currentTeam;
  const n = nextNumber(t);
  const tool = state.activeTool;
  let msg = `Team ${t} - next #${n}`;
  if (tool === 'chip') msg = `chip tool - click the rink to drop Team ${t} #${n} (Esc to exit)`;
  else if (tool === 'arrow') msg = 'arrow tool - click start point, then end point (Esc to exit)';
  else if (tool === 'arrow-curved') {
    const n = drawPointCount();
    if (n === 0) msg = 'curved arrow - click waypoints; press Enter, double-click or right-click to finish (Esc to exit)';
    else if (n === 1) msg = 'curved arrow - click more waypoints; press Enter / double-click / right-click to finish';
    else msg = `curved arrow - ${n} waypoints; press Enter or double-click to finish (Esc to exit)`;
  }
  else if (tool === 'zone') {
    const n = drawPointCount();
    if (n === 0) msg = 'zone tool - click corners of the area (Esc to exit)';
    else if (n < 3) msg = `zone tool - ${n}/3+ corners placed; keep clicking (Esc to exit)`;
    else msg = `zone tool - ${n} corners; press Enter or double-click to finish (Esc to exit)`;
  }
  else if (tool === 'text') msg = 'text tool - click the rink where the label should go (Esc to exit)';
  else if (tool === 'zone-rect') msg = 'rectangle - drag on the rink to draw (or click for a default size, Esc to exit)';
  else if (tool === 'zone-circle') msg = 'circle - drag on the rink to draw (or click for a default size, Esc to exit)';
  else if (tool === 'zone-triangle') msg = 'triangle - drag on the rink to draw (or click for a default size, Esc to exit)';
  else if (tool === 'ball') msg = 'ball tool - click the rink to drop an extra ball (Esc to exit)';
  else if (tool === 'cone-full') msg = 'cone tool - click the rink to drop a full cone (Esc to exit)';
  else if (tool === 'cone-disc') msg = 'disc tool - click the rink to drop a flat disc marker (Esc to exit)';
  else if (tool === 'cone-pole') msg = 'pole tool - click the rink to drop a disc + 150cm rod (Esc to exit)';
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

function refreshViewButton() {
  const td = isTopDown();
  viewBtn.textContent = td ? '2D' : '3D';
  viewBtn.title = td ? 'Top-down view - click to switch to first-person 3D' : 'First-person 3D view - click to switch to top-down 2D';
  viewBtn.classList.toggle('active', td);
}
viewBtn.addEventListener('click', () => {
  if (isTopDown()) exitTopDown(); else enterTopDown();
  refreshViewButton();
  // Path handles are 2D-only; nudge them to re-evaluate visibility.
  import('./path-handles.js').then((m) => m.rebuild());
});
refreshViewButton();

rotateBtn.addEventListener('click', async () => {
  const s = await import('../scene.js');
  s.setTopDownRotationSteps(s.getTopDownRotationSteps() + 1);
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

overflowMenu.querySelector('[data-action="new"]').addEventListener('click', async () => {
  overflowMenu.classList.remove('open');
  const suggested = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const name = await showPrompt('New project name:', suggested);
  if (!name) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  const id = createProject(trimmed);
  switchToProject(id);
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

// --- Projects: rename, library, import, export, share -----------------

const fileInput = document.getElementById('dockImportFile');

async function renameCurrentProject() {
  const doc = ensureDoc();
  const current = doc.meta?.name || 'Untitled';
  const next = await showPrompt('Rename project to:', current);
  if (next == null) return;
  const trimmed = next.trim();
  if (!trimmed || trimmed === current) return;
  doc.meta.name = trimmed;
  saveDoc();
  refreshProjectName();
}

// Rename / Library moved out of the overflow menu into the app-shell
// topbar + left rail (see index.html #appTopbar, #appRail). The overflow
// buttons no longer exist in the DOM, so we only bind if they're present.
overflowMenu.querySelector('[data-action="rename"]')?.addEventListener('click', async () => {
  overflowMenu.classList.remove('open');
  await renameCurrentProject();
});

overflowMenu.querySelector('[data-action="library"]')?.addEventListener('click', () => {
  overflowMenu.classList.remove('open');
  openLibraryDialog();
});

// Topbar project name doubles as the rename button.
projectBtn?.addEventListener('click', async (e) => {
  e.stopPropagation();
  await renameCurrentProject();
});
document.getElementById('appTopbarProjectName')?.addEventListener('click', async (e) => {
  e.stopPropagation();
  await renameCurrentProject();
});
document.querySelector('#appRail button[data-mode="library"]')?.addEventListener('click', () => {
  openLibraryDialog();
});

function refreshProjectName() {
  if (projectNameEl) projectNameEl.textContent = currentProjectName();
}
onProjectChanged(refreshProjectName);
refreshProjectName();

overflowMenu.querySelector('[data-action="export"]').addEventListener('click', () => {
  overflowMenu.classList.remove('open');
  const doc = ensureDoc();
  const safeName = (doc.meta?.name || 'floorball-scheme').replace(/[^\w.-]+/g, '-').slice(0, 60) || 'floorball-scheme';
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  downloadDocJson(doc, `${safeName}-${stamp}.json`);
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
  if (!doc) { await showAlert('Could not read that file - is it a valid floorball-3d scheme JSON?'); return; }
  const importedName = doc.meta?.name || file.name.replace(/\.json$/i, '') || 'Imported scheme';
  const adopted = adoptDocAsProject(doc, { name: importedName });
  if (!adopted) { await showAlert('Could not import that scheme.'); return; }
  setCurrentProjectId(adopted.meta.id);
  switchToProject(adopted.meta.id);
  refreshStatus();
});

overflowMenu.querySelector('[data-action="share"]').addEventListener('click', async () => {
  overflowMenu.classList.remove('open');
  const url = await encodeShareUrl(ensureDoc());
  if (!url) {
    // Scene too large for a URL fragment - fall back to JSON download and
    // tell the user, so a shareable artifact still exists.
    await showAlert('This scheme is too large for a share URL (~32 KB max). Downloading JSON instead - share the file.');
    const doc = ensureDoc();
    const safeName = (doc.meta?.name || 'floorball-scheme').replace(/[^\w.-]+/g, '-').slice(0, 60) || 'floorball-scheme';
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    downloadDocJson(doc, `${safeName}-${stamp}.json`);
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    statusEl.textContent = 'share link copied to clipboard';
    setTimeout(refreshStatus, 2000);
  } catch (e) {
    // Clipboard API blocked (e.g. non-HTTPS, no user gesture chain) -
    // fall back to a read-only dialog with the URL pre-selected for manual
    // copy, instead of the browser's own prompt() chrome.
    await showPrompt('Share URL (copy manually):', url);
  }
});

overflowMenu.querySelector('[data-action="export-video"]').addEventListener('click', async () => {
  overflowMenu.classList.remove('open');
  const mod = await import('./export-dialog.js');
  mod.openExportDialog();
});

// --- keyboard: Esc exits tool mode, Ctrl+Z / Ctrl+Y for undo/redo -----

window.addEventListener('keydown', (event) => {
  // Skip everything while a text field is focused so typing a chip label
  // doesn't cancel the active tool or trigger undo/redo.
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;

  if (event.key === 'Escape' && state.activeTool) {
    setActiveTool(null);
    return;
  }
  if (event.key === 'Enter' && state.activeTool === 'zone') {
    if (tryCommitZone()) { event.preventDefault(); refreshStatus(); return; }
  }
  if (event.key === 'Enter' && state.activeTool === 'arrow-curved') {
    if (tryCommitArrow()) { event.preventDefault(); refreshStatus(); return; }
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
    // A7: pull the click toward the nearest face-off dot if within snap
    // range so rounded-position tactical schemes stay tidy.
    const snap = snapToNearestDot(worldPoint.x, worldPoint.z);
    spawnChip({ team: state.currentTeam, x: snap.x, z: snap.z });
    refreshStatus();
    return true;
  }
  if (state.activeTool === 'ball') {
    // Ball tool spawns extra balls (multi-ball). The primary ball
    // (state.ballGroup, boot-loaded) stays selectable via left-click.
    spawnBall({ x: worldPoint.x, z: worldPoint.z });
    refreshStatus();
    return true;
  }
  if (state.activeTool === 'cone-full' || state.activeTool === 'cone-disc' || state.activeTool === 'cone-pole') {
    const kind = state.activeTool === 'cone-full' ? 'full'
      : state.activeTool === 'cone-pole' ? 'pole'
      : 'disc';
    spawnCone({ kind, x: worldPoint.x, z: worldPoint.z });
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
  else if (state.activeTool === 'arrow-curved' && tryCommitArrow()) refreshStatus();
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
