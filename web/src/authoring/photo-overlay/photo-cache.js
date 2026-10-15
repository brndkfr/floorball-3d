// Local-only photo cache (IndexedDB) so a photo used for calibration
// testing doesn't need re-picking via <input type=file> on every reload.
// Deliberately separate from doc.js/storage.js's saveDoc() - never touches
// localStorage or the share-URL payload, IndexedDB has a much bigger quota
// and is purely per-browser/per-origin, so this can't bloat a share link.
const DB_NAME = 'floorball-photo-cache';
const STORE = 'photos';
const KEY = 'last';

// S-BACK-029 M9: a match photo of a youth team is personal data of minors,
// and IndexedDB is readable by any page on the same origin. Keep it only as
// long as the re-pick convenience is worth it (estimate: one training /
// match week), then drop it. Records without `savedAt` predate this and are
// treated as expired.
export const PHOTO_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function makeCacheRecord(file, now) {
  return { blob: file, name: file.name, size: file.size, lastModified: file.lastModified, savedAt: now };
}

export function isCacheRecordExpired(record, now) {
  const at = record?.savedAt;
  if (typeof at !== 'number' || !Number.isFinite(at)) return true;
  return at > now || now - at > PHOTO_CACHE_MAX_AGE_MS;
}

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
      tx.objectStore(STORE).put(makeCacheRecord(file, Date.now()), KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('saveCachedPhoto: could not persist to IndexedDB', e);
  }
}

// Returns { blob, name, size, lastModified, savedAt } or null. An expired
// record is deleted, not returned.
export async function loadCachedPhoto() {
  try {
    const db = await openDb();
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    if (record && isCacheRecordExpired(record, Date.now())) {
      await clearCachedPhoto();
      return null;
    }
    return record;
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
