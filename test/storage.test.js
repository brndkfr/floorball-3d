import { test } from 'node:test';
import assert from 'node:assert/strict';

// storage.js calls the browser localStorage global directly - stub it
// before importing so the module (otherwise pure/DOM-free) loads in Node.
class FakeLocalStorage {
  constructor() { this._data = new Map(); this.failNextWrites = false; }
  setItem(k, v) {
    if (this.failNextWrites) {
      const err = new DOMException('QuotaExceededError', 'QuotaExceededError');
      throw err;
    }
    this._data.set(k, String(v));
  }
  getItem(k) { return this._data.has(k) ? this._data.get(k) : null; }
  removeItem(k) { this._data.delete(k); }
  key(i) { return Array.from(this._data.keys())[i] ?? null; }
  get length() { return this._data.size; }
}

const fakeStorage = new FakeLocalStorage();
globalThis.localStorage = fakeStorage;

const { saveDoc, loadDoc, getSaveStatus, onSaveStatusChange } = await import('../web/src/authoring/storage.js');
const { state } = await import('../web/src/state.js');

test('saveDoc persists and reports ok status on success', () => {
  fakeStorage.failNextWrites = false;
  state.doc = null; // force ensureDoc() to build a fresh doc
  saveDoc();
  const status = getSaveStatus();
  assert.equal(status.ok, true);
  assert.equal(status.error, null);
  assert.ok(typeof status.at === 'number');
  assert.ok(loadDoc() !== null);
});

test('saveDoc reports a failed status (not just console.warn) on a quota error', () => {
  fakeStorage.failNextWrites = true;
  saveDoc();
  const status = getSaveStatus();
  assert.equal(status.ok, false);
  assert.ok(status.error instanceof Error);
  fakeStorage.failNextWrites = false;
});

test('saveDoc recovers to ok status once storage is writable again', () => {
  fakeStorage.failNextWrites = true;
  saveDoc();
  assert.equal(getSaveStatus().ok, false);
  fakeStorage.failNextWrites = false;
  saveDoc();
  assert.equal(getSaveStatus().ok, true);
});

test('onSaveStatusChange listeners fire on every save attempt', () => {
  const seen = [];
  onSaveStatusChange((status) => seen.push(status.ok));
  fakeStorage.failNextWrites = false;
  saveDoc();
  fakeStorage.failNextWrites = true;
  saveDoc();
  fakeStorage.failNextWrites = false;
  assert.deepEqual(seen, [true, false]);
});
