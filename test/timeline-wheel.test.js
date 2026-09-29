import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripWheelAction } from '../web/src/authoring/timeline-wheel.js';

const fits = { scrollWidth: 200, clientWidth: 200 };
const overflows = { scrollWidth: 400, clientWidth: 200 };

test('wheel resizes cards while every card fits in the strip', () => {
  assert.deepEqual(stripWheelAction({ deltaY: -100, ...fits }), { kind: 'resize', dir: 1 });
  assert.deepEqual(stripWheelAction({ deltaY: 100, ...fits }), { kind: 'resize', dir: -1 });
});

test('wheel scrolls the strip once cards overflow, so the last card stays reachable', () => {
  assert.deepEqual(stripWheelAction({ deltaY: 120, ...overflows }), { kind: 'scroll', dx: 120 });
  assert.deepEqual(stripWheelAction({ deltaY: -120, ...overflows }), { kind: 'scroll', dx: -120 });
});

test('horizontal wheel / trackpad delta wins over vertical when scrolling', () => {
  assert.deepEqual(stripWheelAction({ deltaX: 40, deltaY: 5, ...overflows }), { kind: 'scroll', dx: 40 });
});

test('ctrl / cmd + wheel always resizes, even when overflowing', () => {
  assert.deepEqual(stripWheelAction({ deltaY: -100, ctrlKey: true, ...overflows }), { kind: 'resize', dir: 1 });
  assert.deepEqual(stripWheelAction({ deltaY: 100, metaKey: true, ...overflows }), { kind: 'resize', dir: -1 });
});

test('a sub-pixel overflow does not flip the wheel into scroll mode', () => {
  assert.equal(stripWheelAction({ deltaY: 100, scrollWidth: 201, clientWidth: 200 }).kind, 'resize');
});

test('zero delta is a no-op', () => {
  assert.equal(stripWheelAction({ deltaY: 0, ...fits }), null);
  assert.equal(stripWheelAction({ deltaX: 0, deltaY: 0, ...overflows }), null);
});
