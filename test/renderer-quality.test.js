import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickRendererQuality } from '../web/src/renderer-quality.js';

test('default high-end desktop (8 cores, 8 GB, dpr 2) -> high tier with antialias', () => {
  const q = pickRendererQuality({ hardwareConcurrency: 8, deviceMemory: 8, devicePixelRatio: 2 });
  assert.equal(q.tier, 'high');
  assert.equal(q.antialias, true);
  assert.equal(q.pixelRatio, 2);
});

test('low-end phone (4 cores, 2 GB, dpr 3) -> low tier (weak by memory)', () => {
  const q = pickRendererQuality({ hardwareConcurrency: 4, deviceMemory: 2, devicePixelRatio: 3 });
  assert.equal(q.tier, 'low');
  assert.equal(q.antialias, false);
  assert.equal(q.pixelRatio, 1);
});

test('4-core CPU alone is enough to drop to low tier (weak by cores)', () => {
  const q = pickRendererQuality({ hardwareConcurrency: 4, deviceMemory: 16, devicePixelRatio: 2 });
  assert.equal(q.tier, 'low');
});

test('6 cores + 4 GB (mid-range laptop) -> high tier', () => {
  const q = pickRendererQuality({ hardwareConcurrency: 6, deviceMemory: 4, devicePixelRatio: 1 });
  assert.equal(q.tier, 'high');
  assert.equal(q.pixelRatio, 1);
});

test('high tier caps pixelRatio at 2 even on a 4x-dpr display', () => {
  const q = pickRendererQuality({ hardwareConcurrency: 12, deviceMemory: 16, devicePixelRatio: 4 });
  assert.equal(q.pixelRatio, 2);
});

test("override 'low' forces low tier on a beefy machine", () => {
  const q = pickRendererQuality({ hardwareConcurrency: 16, deviceMemory: 32, devicePixelRatio: 2, override: 'low' });
  assert.equal(q.tier, 'low');
  assert.equal(q.antialias, false);
  assert.equal(q.pixelRatio, 1);
});

test("override 'high' forces high tier on a weak device", () => {
  const q = pickRendererQuality({ hardwareConcurrency: 2, deviceMemory: 1, devicePixelRatio: 3, override: 'high' });
  assert.equal(q.tier, 'high');
  assert.equal(q.antialias, true);
  assert.equal(q.pixelRatio, 2);
});

test('missing inputs fall back to safe defaults (treated as 4 cores / 4 GB / dpr 1)', () => {
  const q = pickRendererQuality({});
  // 4 cores fails the > 4 test -> low tier
  assert.equal(q.tier, 'low');
});

test('deviceMemory not reported (Firefox) still respects hardwareConcurrency', () => {
  const q = pickRendererQuality({ hardwareConcurrency: 8, deviceMemory: undefined, devicePixelRatio: 1 });
  assert.equal(q.tier, 'high');
});
