// Local-only photo cache (IndexedDB) so a photo used for calibration
// testing doesn't need re-picking via <input type=file> on every reload.
// Deliberately separate from doc.js/storage.js's saveDoc() - never touches
// localStorage or the share-URL payload, IndexedDB has a much bigger quota
// and is purely per-browser/per-origin, so this can't bloat a share link.
const DB_NAME = 'floorball-photo-cache';
const STORE = 'photos';
const KEY = 'last';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// file is the File from <input type=file> (a Blob subclass - stored as-is,
// URL.createObjectURL works on any Blob so no reconstruction needed later).
export async function saveCachedPhoto(file) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ blob: file, name: file.name, size: file.size, lastModified: file.lastModified }, KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('saveCachedPhoto: could not persist to IndexedDB', e);
  }
}

// Returns { blob, name, size, lastModified } or null.
export async function loadCachedPhoto() {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('loadCachedPhoto: could not read IndexedDB', e);
    return null;
  }
}

export async function clearCachedPhoto() {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('clearCachedPhoto: could not clear IndexedDB', e);
  }
}
