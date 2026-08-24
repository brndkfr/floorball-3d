// Persist the authoring Doc to localStorage. A1 shipped a single-slot key;
// A3 adds named slots (unlimited, one localStorage entry each) and JSON
// import/export. Share URLs live in share.js since they're async-only.

import { ensureDoc, acceptDoc } from './doc.js';

const KEY = 'floorball-3d:doc';
const SLOT_PREFIX = 'floorball-3d:slot:';

export function saveDoc() {
  try {
    localStorage.setItem(KEY, JSON.stringify(ensureDoc()));
  } catch (e) {
    // localStorage can be full or disabled (private mode on some browsers).
    // Silently drop; the in-memory doc is still authoritative for this
    // session, and the next save attempt will retry.
    console.warn('saveDoc: could not persist to localStorage', e);
  }
}

export function loadDoc() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return acceptDoc(JSON.parse(raw));
  } catch (e) {
    console.warn('loadDoc: could not read localStorage', e);
    return null;
  }
}

// --- named slots ------------------------------------------------------

export function listSlots() {
  const names = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(SLOT_PREFIX)) names.push(k.slice(SLOT_PREFIX.length));
  }
  return names.sort((a, b) => a.localeCompare(b));
}

export function saveNamedSlot(name, doc = ensureDoc()) {
  try {
    localStorage.setItem(SLOT_PREFIX + name, JSON.stringify(doc));
    return true;
  } catch (e) {
    console.warn('saveNamedSlot: could not persist', e);
    return false;
  }
}

export function loadNamedSlot(name) {
  try {
    const raw = localStorage.getItem(SLOT_PREFIX + name);
    if (!raw) return null;
    return acceptDoc(JSON.parse(raw));
  } catch (e) {
    console.warn('loadNamedSlot: could not read localStorage', e);
    return null;
  }
}

export function deleteSlot(name) {
  localStorage.removeItem(SLOT_PREFIX + name);
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
