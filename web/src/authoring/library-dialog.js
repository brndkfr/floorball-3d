// Library modal (A-GAP-003). Lists every persisted project with load /
// rename / duplicate / delete row actions, plus a "New project" header
// button. Rebuilds `state.doc` in place when a different project is
// loaded and re-seeds the history stack.

import { state } from '../state.js';
import {
  listProjects,
  loadProject,
  deleteProject,
  renameProject,
  duplicateProject,
  createProject,
  setCurrentProjectId,
  getCurrentProjectId,
  saveDoc,
} from './storage.js';
import { rebuildFromDoc } from './chips.js';
import { rebuildShapesFromDoc } from './shapes.js';
import { rebuildConesFromDoc } from './cones.js';
import { rebuildBallsFromDoc } from './balls.js';
import { rebuildGoalsFromDoc } from './goals.js';
import { initHistory } from './history.js';
import { applyActorsFromScheme } from './actors.js';
import { showAlert, showConfirm, showPrompt } from './dialog.js';

let styleInjected = false;
function ensureStyle() {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    dialog.library-dialog {
      max-width:min(560px, 94vw); width:560px;
      background:var(--fb-surf-1); color:var(--fb-text-1);
      border:1px solid var(--fb-line-strong); border-radius:10px;
      padding:0; font-family:var(--fb-font);
    }
    dialog.library-dialog::backdrop { background:rgba(0,0,0,0.55); }
    .library-header {
      display:flex; align-items:center; justify-content:space-between;
      padding:14px 18px; border-bottom:1px solid var(--fb-brand-quiet);
    }
    .library-header h2 {
      margin:0; font-size:14px; letter-spacing:0.08em;
      text-transform:uppercase; color:var(--fb-brand); font-weight:600;
    }
    .library-header-actions { display:flex; gap:8px; }
    .library-header-actions button {
      background:transparent; color:var(--fb-text-1);
      border:1px solid var(--fb-line-strong); border-radius:6px;
      padding:4px 12px; font-family:inherit; font-size:11px; cursor:pointer;
    }
    .library-header-actions button:hover { background:var(--fb-brand-quiet); }
    .library-body {
      max-height:60vh; overflow-y:auto; padding:4px 0;
    }
    .library-empty {
      padding:24px 18px; text-align:center; opacity:0.7; font-size:12px;
      letter-spacing:0.05em; text-transform:uppercase;
    }
    .library-row {
      display:grid;
      grid-template-columns:1fr auto;
      align-items:center; gap:8px;
      padding:10px 18px;
      border-bottom:1px solid var(--fb-brand-quiet);
    }
    .library-row:last-child { border-bottom:none; }
    .library-row.current { background:var(--fb-brand-quiet); }
    .library-info { min-width:0; }
    .library-name {
      font-size:13px; color:var(--fb-text-1); overflow:hidden;
      text-overflow:ellipsis; white-space:nowrap;
    }
    .library-row.current .library-name { color:var(--fb-brand); font-weight:600; }
    .library-modified {
      font-size:10.5px; opacity:0.65;
      letter-spacing:0.05em; text-transform:uppercase; margin-top:2px;
    }
    .library-actions { display:flex; gap:4px; }
    .library-actions button {
      background:transparent; color:var(--fb-text-1);
      border:1px solid var(--fb-line-strong); border-radius:6px;
      padding:4px 10px; font-family:inherit; font-size:11px;
      letter-spacing:0.05em; cursor:pointer;
    }
    .library-actions button:hover { background:var(--fb-brand-quiet); }
    .library-actions button.primary { border-color:var(--fb-brand); color:var(--fb-brand); }
    .library-actions button.danger:hover { background:rgba(255,80,80,0.2); color:#fff; border-color:#ff8080; }
    .library-footer {
      padding:12px 18px; border-top:1px solid var(--fb-brand-quiet);
      display:flex; justify-content:flex-end;
    }
    .library-footer button {
      background:transparent; color:var(--fb-text-1);
      border:1px solid var(--fb-line-strong); border-radius:6px;
      padding:5px 14px; font-family:inherit; font-size:12px; cursor:pointer;
    }
  `;
  document.head.appendChild(style);
}

function formatWhen(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const dateStr = d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${dateStr} ${timeStr}`;
}

// Callback invoked whenever a project is loaded / renamed / created /
// deleted so the dock can refresh its project-name label without
// re-parsing localStorage on every render.
const changeListeners = new Set();
export function onProjectChanged(cb) {
  changeListeners.add(cb);
  return () => changeListeners.delete(cb);
}
function fireProjectChanged() {
  for (const cb of changeListeners) {
    try { cb(); } catch (e) { console.error(e); }
  }
}
export { fireProjectChanged as notifyProjectChanged };

// Loads the given project id into `state.doc`, rebuilds every visual
// module, and re-seeds the history stack so undo can't reach across
// project boundaries.
export function switchToProject(id) {
  const doc = loadProject(id);
  if (!doc) return false;
  state.doc = doc;
  setCurrentProjectId(id);
  rebuildFromDoc();
  rebuildShapesFromDoc();
  rebuildConesFromDoc();
  rebuildBallsFromDoc();
  rebuildGoalsFromDoc();
  applyActorsFromScheme();   // else the old project's ball/goalie mesh positions get written into this one
  initHistory();
  fireProjectChanged();
  return true;
}

async function newProjectFlow() {
  const suggested = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const name = await showPrompt('New project name:', suggested);
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  const id = createProject(trimmed);
  switchToProject(id);
  return id;
}

let openDialog = null;

function render(dialog) {
  const body = dialog.querySelector('.library-body');
  const currentId = getCurrentProjectId();
  const projects = listProjects();

  body.innerHTML = '';
  if (projects.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'library-empty';
    empty.textContent = 'no saved projects yet';
    body.appendChild(empty);
    return;
  }
  for (const p of projects) {
    const row = document.createElement('div');
    row.className = 'library-row' + (p.id === currentId ? ' current' : '');
    row.dataset.id = p.id;

    const info = document.createElement('div');
    info.className = 'library-info';
    const name = document.createElement('div');
    name.className = 'library-name';
    name.textContent = p.name;
    const modified = document.createElement('div');
    modified.className = 'library-modified';
    modified.textContent = p.id === currentId
      ? `current - modified ${formatWhen(p.modifiedAt)}`
      : `modified ${formatWhen(p.modifiedAt)}`;
    info.appendChild(name);
    info.appendChild(modified);

    const actions = document.createElement('div');
    actions.className = 'library-actions';

    const loadBtn = document.createElement('button');
    loadBtn.type = 'button';
    loadBtn.className = 'primary';
    loadBtn.textContent = p.id === currentId ? 'Current' : 'Load';
    loadBtn.disabled = p.id === currentId;
    loadBtn.addEventListener('click', () => {
      if (p.id === currentId) return;
      switchToProject(p.id);
      render(dialog);
    });

    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.textContent = 'Rename';
    renameBtn.addEventListener('click', async () => {
      const next = await showPrompt('Rename project to:', p.name);
      if (next == null) return;
      const trimmed = next.trim();
      if (!trimmed || trimmed === p.name) return;
      renameProject(p.id, trimmed);
      // If we renamed the current project, refresh its in-memory meta too.
      if (p.id === currentId) {
        state.doc.meta.name = trimmed;
      }
      fireProjectChanged();
      render(dialog);
    });

    const dupBtn = document.createElement('button');
    dupBtn.type = 'button';
    dupBtn.textContent = 'Duplicate';
    dupBtn.addEventListener('click', async () => {
      const next = await showPrompt('Duplicate as:', `${p.name} (copy)`);
      if (next == null) return;
      const trimmed = next.trim();
      if (!trimmed) return;
      const newId = duplicateProject(p.id, trimmed);
      if (!newId) { await showAlert('Could not duplicate this project.'); return; }
      render(dialog);
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'danger';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', async () => {
      if (!(await showConfirm(`Delete "${p.name}"? This can't be undone.`))) return;
      deleteProject(p.id);
      if (p.id === currentId) {
        // Deleted the active project - fall back to the newest remaining
        // one, or create a fresh empty one if none left.
        const remaining = listProjects();
        if (remaining.length > 0) {
          switchToProject(remaining[0].id);
        } else {
          const id = createProject('Untitled');
          switchToProject(id);
        }
      }
      render(dialog);
    });

    actions.appendChild(loadBtn);
    actions.appendChild(renameBtn);
    actions.appendChild(dupBtn);
    actions.appendChild(delBtn);

    row.appendChild(info);
    row.appendChild(actions);
    body.appendChild(row);
  }
}

export function openLibraryDialog() {
  ensureStyle();
  if (openDialog) return;

  const dialog = document.createElement('dialog');
  dialog.className = 'library-dialog';
  dialog.innerHTML = `
    <div class="library-header">
      <h2>Library</h2>
      <div class="library-header-actions">
        <button type="button" data-action="tutorial" title="Guided play in its own tutorial project">Guided play</button>
        <button type="button" class="library-new">New project&hellip;</button>
      </div>
    </div>
    <div class="library-body"></div>
    <form method="dialog" class="library-footer">
      <button type="submit" value="close">Close</button>
    </form>
  `;
  document.body.appendChild(dialog);
  openDialog = dialog;

  dialog.querySelector('.library-new').addEventListener('click', async () => {
    await newProjectFlow();
    render(dialog);
  });
  // choreo-tutorial-ui.js's delegated [data-action="tutorial"] listener starts it; just get out of the way.
  dialog.querySelector('[data-action="tutorial"]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    dialog.remove();
    openDialog = null;
  }, { once: true });

  render(dialog);
  dialog.showModal();
}

// Small helper the dock uses to render the current project's name.
export function currentProjectName() {
  return state.doc?.meta?.name || 'Untitled';
}
