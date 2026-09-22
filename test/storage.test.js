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

const {
  saveDoc,
  loadDoc,
  getSaveStatus,
  onSaveStatusChange,
  listProjects,
  loadProject,
  createProject,
  duplicateProject,
  renameProject,
  deleteProject,
  getCurrentProjectId,
  setCurrentProjectId,
  adoptDocAsProject,
  migrateLegacyStorage,
} = await import('../web/src/authoring/storage.js');
const { state } = await import('../web/src/state.js');
const { emptyDoc, emptyMeta } = await import('../web/src/authoring/doc.js');

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

// --- A-GAP-003 project APIs ------------------------------------------

function resetStorage() {
  fakeStorage._data.clear();
  fakeStorage.failNextWrites = false;
  state.doc = null;
}

test('saveDoc assigns a project id, listProjects reflects it, loadDoc round-trips', () => {
  resetStorage();
  saveDoc();
  const currentId = getCurrentProjectId();
  assert.ok(currentId, 'saveDoc must set a current project id');
  const projects = listProjects();
  assert.equal(projects.length, 1);
  assert.equal(projects[0].id, currentId);
  const loaded = loadDoc();
  assert.ok(loaded);
  assert.equal(loaded.meta.id, currentId);
});

test('createProject + setCurrentProjectId switches the current doc', () => {
  resetStorage();
  saveDoc();
  const firstId = getCurrentProjectId();
  const secondId = createProject('Second scheme');
  assert.notEqual(secondId, firstId);
  // createProject does not change current
  assert.equal(getCurrentProjectId(), firstId);
  setCurrentProjectId(secondId);
  const loaded = loadDoc();
  assert.equal(loaded.meta.id, secondId);
  assert.equal(loaded.meta.name, 'Second scheme');
});

test('renameProject updates meta.name', () => {
  resetStorage();
  saveDoc();
  const id = getCurrentProjectId();
  assert.equal(renameProject(id, 'Renamed'), true);
  assert.equal(loadProject(id).meta.name, 'Renamed');
});

test('duplicateProject clones content under a new id, leaves the original alone', () => {
  resetStorage();
  const originalId = createProject('Original');
  const original = loadProject(originalId);
  original.frames[0].scheme.players.p_test = { team: 'T1', x: 0, z: 0 };
  // resave the mutated original
  fakeStorage._data.set(`floorball-3d:project:${originalId}`, JSON.stringify(original));
  const dupId = duplicateProject(originalId, 'Copy');
  assert.ok(dupId);
  assert.notEqual(dupId, originalId);
  const dup = loadProject(dupId);
  assert.equal(dup.meta.name, 'Copy');
  assert.equal(dup.meta.id, dupId);
  assert.ok(dup.frames[0].scheme.players.p_test);
  // original still exists and hasn't been renamed
  assert.equal(loadProject(originalId).meta.name, 'Original');
});

test('deleteProject removes just that entry from listProjects', () => {
  resetStorage();
  const a = createProject('A');
  const b = createProject('B');
  assert.equal(listProjects().length, 2);
  deleteProject(a);
  const remaining = listProjects();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, b);
});

test('adoptDocAsProject gives an untrusted doc a fresh id and persists it', () => {
  resetStorage();
  // Simulate an imported doc that carries an existing meta.id (e.g. a
  // previously exported project). adoptDocAsProject must NOT reuse it -
  // otherwise re-importing your own export would overwrite the current
  // project in place.
  const imported = emptyDoc();
  const originalId = imported.meta.id;
  const adopted = adoptDocAsProject(imported, { name: 'Imported' });
  assert.ok(adopted);
  assert.notEqual(adopted.meta.id, originalId);
  assert.equal(adopted.meta.name, 'Imported');
  assert.equal(loadProject(adopted.meta.id).meta.name, 'Imported');
});

test('migrateLegacyStorage moves the singleton doc and slot keys into projects, then no-ops', () => {
  resetStorage();
  // Seed a legacy singleton and two named slots (simulating pre-A-GAP-003).
  const legacyDoc = emptyDoc();
  delete legacyDoc.meta; // legacy shape had no meta
  fakeStorage._data.set('floorball-3d:doc', JSON.stringify(legacyDoc));
  const slotA = emptyDoc(); delete slotA.meta;
  const slotB = emptyDoc(); delete slotB.meta;
  fakeStorage._data.set('floorball-3d:slot:PlayA', JSON.stringify(slotA));
  fakeStorage._data.set('floorball-3d:slot:PlayB', JSON.stringify(slotB));

  migrateLegacyStorage();

  const projects = listProjects();
  const names = projects.map((p) => p.name).sort();
  assert.deepEqual(names, ['My scheme', 'PlayA', 'PlayB']);
  // Legacy keys gone
  assert.equal(fakeStorage.getItem('floorball-3d:doc'), null);
  assert.equal(fakeStorage.getItem('floorball-3d:slot:PlayA'), null);
  assert.equal(fakeStorage.getItem('floorball-3d:slot:PlayB'), null);
  // Current pointer set to the migrated singleton
  const currentId = getCurrentProjectId();
  assert.ok(currentId);
  assert.equal(loadProject(currentId).meta.name, 'My scheme');

  // Re-running does nothing.
  const beforeCount = listProjects().length;
  migrateLegacyStorage();
  assert.equal(listProjects().length, beforeCount);
});

test('emptyMeta generates unique ids', () => {
  const a = emptyMeta();
  const b = emptyMeta();
  assert.notEqual(a.id, b.id);
});
