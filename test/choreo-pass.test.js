import { test } from 'node:test';
import assert from 'node:assert/strict';

const { passPreview } = await import('../web/src/authoring/choreo-pass.js');

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const A = { x: 0, z: 0 };
const B = { x: 3000, z: 4000 };   // 5000 mm from A

test('no arrow when the carrier did not change', () => {
  assert.equal(passPreview({ startCarrier: 'p1', carrier: 'p1', from: A, to: B, trim: 500 }), null);
});

test('no arrow when the ball stayed loose (null -> null)', () => {
  assert.equal(passPreview({ startCarrier: null, carrier: null, from: A, to: B, trim: 500 }), null);
});

test('carrier A -> carrier B trims both ends by the chip radius', () => {
  const out = passPreview({ startCarrier: 'p1', carrier: 'p2', from: A, to: B, trim: 500 });
  assert.ok(out);
  assert.ok(close(out.from.x, 300) && close(out.from.z, 400), JSON.stringify(out.from));
  assert.ok(close(out.to.x, 2700) && close(out.to.z, 3600), JSON.stringify(out.to));
});

test('carrier -> loose ball trims only the start', () => {
  const out = passPreview({ startCarrier: 'p1', carrier: null, from: A, to: B, trim: 500 });
  assert.ok(close(out.from.x, 300) && close(out.from.z, 400));
  assert.ok(close(out.to.x, 3000) && close(out.to.z, 4000));
});

test('loose ball -> carrier trims only the end', () => {
  const out = passPreview({ startCarrier: null, carrier: 'p2', from: A, to: B, trim: 500 });
  assert.ok(close(out.from.x, 0) && close(out.from.z, 0));
  assert.ok(close(out.to.x, 2700) && close(out.to.z, 3600));
});

test('no arrow when the trimmed length is below the minimum', () => {
  const near = { x: 0, z: 1200 };
  assert.equal(passPreview({ startCarrier: 'p1', carrier: 'p2', from: A, to: near, trim: 500, minLen: 300 }), null);
  assert.ok(passPreview({ startCarrier: 'p1', carrier: 'p2', from: A, to: near, trim: 500, minLen: 100 }));
});

test('no arrow when an endpoint is missing or not finite', () => {
  assert.equal(passPreview({ startCarrier: 'p1', carrier: 'p2', from: null, to: B, trim: 0 }), null);
  assert.equal(passPreview({ startCarrier: 'p1', carrier: 'p2', from: A, to: { x: NaN, z: 0 }, trim: 0 }), null);
});
