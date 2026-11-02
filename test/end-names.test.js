// The UI names the goal ends Home / Away; code and saved data keep 'A' / 'B'.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { endName, goalName } from '../web/src/end-names.js';
import { LANDMARK_LABELS } from '../web/src/authoring/photo-overlay/landmarks.js';

test('end A is Home, end B is Away', () => {
  assert.equal(endName('A'), 'Home');
  assert.equal(endName('B'), 'Away');
});

test('a fixed goal is named by its label, falling back to the end name', () => {
  assert.equal(goalName({}, 'A'), 'Home');
  assert.equal(goalName(undefined, 'B'), 'Away');
  assert.equal(goalName({ goals: { fixed: { A: { label: 'Jets' } } } }, 'A'), 'Jets');
  assert.equal(goalName({ goals: { fixed: { A: { label: 'Jets' } } } }, 'B'), 'Away');
  assert.equal(goalName({ goals: { fixed: { B: { label: '  ' } } } }, 'B'), 'Away');
});

test('photo landmarks say Home / Away goal, never Goal A / B', () => {
  for (const [key, label] of Object.entries(LANDMARK_LABELS)) {
    assert.doesNotMatch(label, /\bGoal [AB]\b/, `${key}: ${label}`);
    if (key.startsWith('goalA_')) assert.match(label, /\bHome goal\b/, `${key}: ${label}`);
    if (key.startsWith('goalB_')) assert.match(label, /\bAway goal\b/, `${key}: ${label}`);
  }
});
