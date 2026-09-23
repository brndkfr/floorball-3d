// Persist the authoring Doc to localStorage.
//
// A-GAP-003: named projects. Each project is stored under its own key
// (`floorball-3d:project:<id>`); a small pointer key
// (`floorball-3d:currentProjectId`) selects the one being edited. The
// legacy single-doc key (`floorball-3d:doc`) and the earlier named-slot
// keys (`floorball-3d:slot:<name>`) are migrated once by
// `migrateLegacyStorage()` and then deleted.
//
// This module stays free of DOM globals so it keeps loading standalone in
// Node for tests; save-status-ui.js is the DOM-touching side-effect module
// that turns save status into a visible badge + beforeunload guard.

import { ensureDoc, acceptDoc, emptyDoc, emptyMeta, newId } from './doc.js';
import { markRenderDirty } from '../render-dirty.js';

const LEGACY_DOC_KEY = 'floorball-3d:doc';
const LEGACY_SLOT_PREFIX = 'floorball-3d:slot:';
const PROJECT_PREFIX = 'floorball-3d:project:';
const CURRENT_KEY = 'floorball-3d:currentProjectId';
const MIGRATION_FLAG = 'floorball-3d:migrated:v1';
const HISTORY_PREFIX = 'floorball-3d:history:';

// --- save status ------------------------------------------------------

let lastSaveStatus = { ok: true, at: null, error: null };
const listeners = [];

export function getSaveStatus() {
  return lastSaveStatus;
}

export function onSaveStatusChange(cb) {
  listeners.push(cb);
}

function setSaveStatus(status) {
  lastSaveStatus = status;
  for (const cb of listeners) cb(status);
}

// --- project CRUD -----------------------------------------------------

function projectKey(id) {
  return PROJECT_PREFIX + id;
}

export function getCurrentProjectId() {
  try {
    return localStorage.getItem(CURRENT_KEY);
  } catch {
    return null;
  }
}

export function setCurrentProjectId(id) {
  try {
    if (id) localStorage.setItem(CURRENT_KEY, id);
    else localStorage.removeItem(CURRENT_KEY);
  } catch (e) {
    console.warn('setCurrentProjectId: could not persist', e);
  }
}

// Returns a shallow index of every persisted project, newest first.
// Loads and re-parses each doc - fine for the handful of projects a user
// realistically keeps locally; if that ever grows we can maintain a
// sidecar index instead.
export function listProjects() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(PROJECT_PREFIX)) continue;
    try {
      const doc = JSON.parse(localStorage.getItem(k));
      const meta = doc?.meta;
      if (!meta?.id) continue;
      out.push({
        id: meta.id,
        name: meta.name || 'Untitled',
        createdAt: meta.createdAt || 0,
        modifiedAt: meta.modifiedAt || 0,
      });
    } catch {
      // skip corrupt entry
    }
  }
  out.sort((a, b) => (b.modifiedAt || 0) - (a.modifiedAt || 0));
  return out;
}

export function loadProject(id) {
  if (!id) return null;
  try {
    const raw = localStorage.getItem(projectKey(id));
    if (!raw) return null;
    return acceptDoc(JSON.parse(raw));
  } catch (e) {
    console.warn('loadProject: could not read', e);
    return null;
  }
}

// Writes the doc under its own meta.id, bumping modifiedAt. The
// save-status listeners are only notified for the currently-edited
// project - background writes (rename of another project, migration)
// shouldn't flip the badge to "save failed".
export function saveProject(doc = ensureDoc(), { touchModified = true, notifyStatus = null } = {}) {
  if (!doc?.meta?.id) return false;
  if (touchModified) doc.meta.modifiedAt = Date.now();
  const isCurrent = doc.meta.id === getCurrentProjectId();
  const notify = notifyStatus ?? isCurrent;
  try {
    localStorage.setItem(projectKey(doc.meta.id), JSON.stringify(doc));
    if (notify) setSaveStatus({ ok: true, at: Date.now(), error: null });
    return true;
  } catch (e) {
    console.warn('saveProject: could not persist', e);
    if (notify) setSaveStatus({ ok: false, at: Date.now(), error: e });
    return false;
  }
}

export function deleteProject(id) {
  try {
    localStorage.removeItem(projectKey(id));
  } catch (e) {
    console.warn('deleteProject: could not remove', e);
  }
  deleteHistoryState(id);
}

// --- undo/redo stack persistence (S-BACK-012) --------------------------
//
// One entry per project, storing history-stack.js's serialized
// { stack, cursor }. Kept as its own key rather than folded into the
// project doc itself so a corrupt/oversized history blob can never stop
// the doc load path; failures here are swallowed (undo persistence
// degrading to memory-only for the session is fine, unlike a doc save
// failure which needs the visible save-status badge).

export function saveHistoryState(id, data) {
  if (!id) return false;
  try {
    localStorage.setItem(HISTORY_PREFIX + id, JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn('saveHistoryState: could not persist', e);
    return false;
  }
}

export function loadHistoryState(id) {
  if (!id) return null;
  try {
    const raw = localStorage.getItem(HISTORY_PREFIX + id);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn('loadHistoryState: could not read', e);
    return null;
  }
}

export function deleteHistoryState(id) {
  try {
    localStorage.removeItem(HISTORY_PREFIX + id);
  } catch (e) {
    console.warn('deleteHistoryState: could not remove', e);
  }
}

export function renameProject(id, newName) {
  const doc = loadProject(id);
  if (!doc) return false;
  doc.meta.name = newName;
  return saveProject(doc);
}

// Creates a fresh empty project with the given name, saves it, and
// returns its id. Does NOT change the current project pointer.
export function createProject(name = 'Untitled') {
  const doc = emptyDoc();
  doc.meta = emptyMeta(name);
  saveProject(doc, { notifyStatus: false });
  return doc.meta.id;
}

// Deep-clones an existing project, gives the clone a new id + name.
export function duplicateProject(id, newName) {
  const doc = loadProject(id);
  if (!doc) return null;
  const clone = JSON.parse(JSON.stringify(doc));
  const now = Date.now();
  clone.meta = { id: newId('proj'), name: newName, createdAt: now, modifiedAt: now };
  const accepted = acceptDoc(clone);
  if (!accepted) return null;
  saveProject(accepted, { notifyStatus: false });
  return accepted.meta.id;
}

// Accepts an untrusted doc (share link, imported file) and persists it
// as a new local project with a fresh id. Returns the accepted doc (with
// the scheme accessor installed) or null if the input can't be accepted.
export function adoptDocAsProject(rawDoc, { name } = {}) {
  const accepted = acceptDoc(rawDoc);
  if (!accepted) return null;
  const now = Date.now();
  accepted.meta.id = newId('proj');
  if (name) accepted.meta.name = name;
  accepted.meta.createdAt = now;
  accepted.meta.modifiedAt = now;
  saveProject(accepted, { touchModified: false, notifyStatus: false });
  return accepted;
}

// --- current-project convenience (used by every mutating module) ------

// Saves the in-memory doc to its own project slot. This is the entry
// point every mutating module (chips.js, shapes.js, ...) calls, so its
// signature has to stay identical to the pre-A-GAP-003 version.
export function saveDoc() {
  const doc = ensureDoc();
  if (!getCurrentProjectId()) setCurrentProjectId(doc.meta.id);
  saveProject(doc);
  // S-BACK-011: near-every doc mutation (chips/shapes/cones/balls/frames/
  // undo) funnels through here - single choke point for "the live 3D
  // scene needs a redraw" that doesn't require main.js's animate() to
  // separately track every mutation site.
  markRenderDirty();
}

// Loads the current project's doc, or null if none exists. Used only by
// the bootstrap in index.js.
export function loadDoc() {
  const id = getCurrentProjectId();
  if (!id) return null;
  return loadProject(id);
}

// --- one-time migration from the legacy single-doc + slot layout -----

// Idempotent: runs once per browser (guarded by MIGRATION_FLAG), moves
// the singleton doc and any named slots into first-class projects, then
// removes the legacy keys.
export function migrateLegacyStorage() {
  try {
    if (localStorage.getItem(MIGRATION_FLAG)) return;
  } catch {
    return;
  }
  let currentId = null;

  try {
    const raw = localStorage.getItem(LEGACY_DOC_KEY);
    if (raw) {
      const accepted = acceptDoc(JSON.parse(raw));
      if (accepted) {
        if (!accepted.meta.name || accepted.meta.name === 'Untitled') {
          accepted.meta.name = 'My scheme';
        }
        saveProject(accepted, { touchModified: false, notifyStatus: false });
        currentId = accepted.meta.id;
      }
      localStorage.removeItem(LEGACY_DOC_KEY);
    }
  } catch (e) {
    console.warn('migrateLegacyStorage: legacy doc migration failed', e);
  }

  const slotKeys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(LEGACY_SLOT_PREFIX)) slotKeys.push(k);
  }
  for (const key of slotKeys) {
    const name = key.slice(LEGACY_SLOT_PREFIX.length);
    try {
      const accepted = acceptDoc(JSON.parse(localStorage.getItem(key)));
      if (accepted) {
        accepted.meta.name = name;
        saveProject(accepted, { touchModified: false, notifyStatus: false });
      }
    } catch (e) {
      console.warn('migrateLegacyStorage: slot migration failed for', name, e);
    }
    localStorage.removeItem(key);
  }

  if (currentId) setCurrentProjectId(currentId);
  try {
    localStorage.setItem(MIGRATION_FLAG, '1');
  } catch {
    // Non-fatal: worst case migration re-runs on next load and is a no-op
    // because the legacy keys are gone.
  }
}

// --- JSON file I/O ----------------------------------------------------

export function downloadDocJson(doc = ensureDoc(), filename = 'floorball-scheme.json') {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Reads a File (from <input type="file">) and returns the parsed doc, or
// null on any failure. Legacy v1 exports are migrated to the current v2
// shape by acceptDoc.
export async function readDocFromFile(file) {
  try {
    const text = await file.text();
    return acceptDoc(JSON.parse(text));
  } catch (e) {
    console.warn('readDocFromFile: parse failed', e);
    return null;
  }
}
