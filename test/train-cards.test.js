// A-BACK-054 layout A: the Train cards (zone, KATA) float over the stage and
// collapse to their header; which ones are collapsed is remembered per
// browser. Pure rules here, train-mode.js does the DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { TRAIN_CARDS, TRAIN_CARDS_STORAGE_KEY, parseTrainCards, toggleTrainCard } = await import('../web/src/train-cards.js');

test('two cards, both open by default, stored under their own key', () => {
  assert.deepEqual(TRAIN_CARDS, ['zone', 'kata']);
  assert.equal(TRAIN_CARDS_STORAGE_KEY, 'floorball3d.trainCards');
  assert.deepEqual(parseTrainCards(null), { zone: false, kata: false });
});

test('parseTrainCards keeps stored booleans, drops anything else', () => {
  assert.deepEqual(parseTrainCards(JSON.stringify({ kata: true })), { zone: false, kata: true });
  assert.deepEqual(parseTrainCards(JSON.stringify({ zone: 'yes', extra: true })), { zone: false, kata: false });
  for (const bad of ['', 'nope', '[]', '42', 'null']) assert.deepEqual(parseTrainCards(bad), { zone: false, kata: false }, bad);
});

test('toggleTrainCard flips one card and returns a new object; unknown cards change nothing', () => {
  const a = toggleTrainCard({ zone: false, kata: false }, 'zone');
  assert.deepEqual(a, { zone: true, kata: false });
  assert.deepEqual(toggleTrainCard(a, 'zone'), { zone: false, kata: false });
  assert.equal(toggleTrainCard(a, 'inset'), a);
});
