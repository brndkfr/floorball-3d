// The two fixed goals and their goalies are layers too: shown / hidden per
// project in doc.hiddenFixed, like the tactical zones in doc.zones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIXED_OBJECTS, sanitizeHiddenFixed, isFixedShown, withFixedShown } from '../web/src/authoring/fixed-objects-model.js';
import { acceptDoc, emptyDoc } from '../web/src/authoring/doc.js';

test('two goals and two goalies, keyed by goal end', () => {
  assert.deepEqual(FIXED_OBJECTS.map((o) => o.key), ['goalA', 'goalB', 'goalieA', 'goalieB']);
  for (const o of FIXED_OBJECTS) assert.match(o.end, /^[AB]$/);
});

test('sanitizeHiddenFixed keeps known keys once, in list order; anything else becomes []', () => {
  assert.deepEqual(sanitizeHiddenFixed(['goalieB', 'goalA', 'goalieB']), ['goalA', 'goalieB']);
  assert.deepEqual(sanitizeHiddenFixed(['goalA', 'nope', 7, null]), ['goalA']);
  assert.deepEqual(sanitizeHiddenFixed(undefined), []);
  assert.deepEqual(sanitizeHiddenFixed('goalA'), []);
});

test('everything is shown until hidden; withFixedShown flips one key only', () => {
  assert.equal(isFixedShown(undefined, 'goalieA'), true);
  assert.equal(isFixedShown([], 'goalA'), true);
  assert.equal(isFixedShown(['goalA'], 'goalA'), false);
  assert.equal(isFixedShown(['goalA'], 'goalB'), true);
  assert.deepEqual(withFixedShown([], 'goalieB', false), ['goalieB']);
  assert.deepEqual(withFixedShown(['goalA', 'goalieB'], 'goalA', true), ['goalieB']);
  assert.deepEqual(withFixedShown(['goalA'], 'goalA', false), ['goalA']);
  assert.deepEqual(withFixedShown(['goalA'], 'nope', false), ['goalA']);
});

test('a loaded project keeps valid hidden keys and drops the rest; old projects show everything', () => {
  const raw = JSON.parse(JSON.stringify(emptyDoc()));
  raw.hiddenFixed = ['goalieA', '<img src=x>', 'goalieA'];
  assert.deepEqual(acceptDoc(raw).hiddenFixed, ['goalieA']);
  const old = JSON.parse(JSON.stringify(emptyDoc()));
  delete old.hiddenFixed;
  assert.deepEqual(acceptDoc(old).hiddenFixed, []);
  assert.deepEqual(emptyDoc().hiddenFixed, []);
});
