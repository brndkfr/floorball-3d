import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextAvailableNumber } from '../web/src/authoring/numbering.js';

test('nextAvailableNumber returns 1 for an empty team', () => {
  assert.equal(nextAvailableNumber({}, 1), 1);
});

test('nextAvailableNumber returns the smallest unused number for that team only', () => {
  const players = {
    a: { team: 1, number: '1' },
    b: { team: 1, number: '2' },
    c: { team: 2, number: '1' }, // different team, doesn't block team 1
  };
  assert.equal(nextAvailableNumber(players, 1), 3);
  assert.equal(nextAvailableNumber(players, 2), 2);
});

test('nextAvailableNumber fills a gap rather than always appending', () => {
  const players = {
    a: { team: 1, number: '1' },
    b: { team: 1, number: '3' },
  };
  assert.equal(nextAvailableNumber(players, 1), 2);
});

test('nextAvailableNumber wraps to 1 once 1..25 are all taken', () => {
  const players = {};
  for (let i = 1; i <= 25; i++) players[`p${i}`] = { team: 1, number: String(i) };
  assert.equal(nextAvailableNumber(players, 1), 1);
});
