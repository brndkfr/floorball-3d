import { test } from 'node:test';
import assert from 'node:assert/strict';

// frame-thumb.js probes for `document` at import time and no-ops if it
// isn't present. In Node with no DOM, getFrameThumb() must return '' for
// every input rather than throw - covers the case where a future dev
// imports the module from a test fixture or storybook harness by mistake.
const mod = await import('../web/src/authoring/frame-thumb.js');

test('getFrameThumb returns empty string without a DOM', () => {
  const frame = {
    id: 'f_a',
    scheme: { players: { p_a: { team: 1, x: 0, z: 20000 } }, balls: {}, shapes: [] },
  };
  assert.equal(mod.getFrameThumb(frame, 64, 32), '');
});

test('getFrameThumb rejects degenerate sizes', () => {
  const frame = { id: 'f_a', scheme: { players: {}, balls: {}, shapes: [] } };
  assert.equal(mod.getFrameThumb(frame, 0, 32), '');
  assert.equal(mod.getFrameThumb(frame, 64, 1), '');
});

test('getFrameThumb tolerates missing / malformed input without throwing', () => {
  assert.equal(mod.getFrameThumb(null, 64, 32), '');
  assert.equal(mod.getFrameThumb({ id: 'f_b' }, 64, 32), '');
  assert.equal(mod.getFrameThumb({ id: 'f_c', scheme: null }, 64, 32), '');
});

test('invalidateFrameThumbs is a safe no-op with no cache entries', () => {
  assert.doesNotThrow(() => mod.invalidateFrameThumbs());
});
