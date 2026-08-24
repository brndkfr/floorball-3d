// Persist the authoring Doc to localStorage. A1-scope: single slot, no named
// slots or share URLs yet (those arrive in A3).

import { state } from '../state.js';
import { ensureDoc, DOC_VERSION } from './doc.js';

const KEY = 'floorball-3d:doc';

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
    const doc = JSON.parse(raw);
    if (!doc || doc.version !== DOC_VERSION) return null;
    return doc;
  } catch (e) {
    console.warn('loadDoc: could not read localStorage', e);
    return null;
  }
}
