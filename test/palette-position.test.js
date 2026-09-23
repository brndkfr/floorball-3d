import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampPalettePos, parseStoredPos } from '../web/src/authoring/palette-position.js';

const size = { w: 80, h: 400 };
const viewport = { w: 1200, h: 800 };
const reserved = { top: 40, left: 52, right: 0, bottom: 0 };

test('clampPalettePos leaves an in-bounds position untouched', () => {
  const p = clampPalettePos({ x: 200, y: 120 }, size, viewport, reserved);
  assert.deepEqual(p, { x: 200, y: 120 });
});

test('clampPalettePos snaps to the reserved top-left corner', () => {
  const p = clampPalettePos({ x: -100, y: -100 }, size, viewport, reserved);
  assert.deepEqual(p, { x: 52, y: 40 });
});

test('clampPalettePos snaps to the bottom-right, accounting for palette size', () => {
  const p = clampPalettePos({ x: 9999, y: 9999 }, size, viewport, reserved);
  assert.deepEqual(p, { x: 1200 - 80, y: 800 - 400 });
});

test('clampPalettePos degenerates gracefully when the palette is bigger than the free area', () => {
  const tiny = { w: 100, h: 100 };
  const huge = { w: 200, h: 200 };
  const p = clampPalettePos({ x: 500, y: 500 }, huge, tiny, { top: 10, left: 10 });
  assert.deepEqual(p, { x: 10, y: 10 });
});

test('parseStoredPos returns null on garbage', () => {
  assert.equal(parseStoredPos(null), null);
  assert.equal(parseStoredPos(''), null);
  assert.equal(parseStoredPos('not json'), null);
  assert.equal(parseStoredPos('{"x":"nope"}'), null);
  assert.equal(parseStoredPos('[]'), null);
});

test('parseStoredPos accepts a valid {x,y}', () => {
  assert.deepEqual(parseStoredPos('{"x":123,"y":45}'), { x: 123, y: 45 });
});
