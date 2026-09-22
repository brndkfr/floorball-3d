import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Set up a stub `window` before importing the module - the module reads
// `window.matchMedia` inside its exported function, so import order does
// not matter, but we need `globalThis.window` to exist by call time.
const originalWindow = globalThis.window;

beforeEach(() => {
  delete globalThis.window;
});

afterEach(() => {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
});

async function loadHelper() {
  const url = new URL('../web/src/reduced-motion.js', import.meta.url).href
    + '?t=' + Math.random();
  return await import(url);
}

test('prefersReducedMotion returns false when window is undefined', async () => {
  const { prefersReducedMotion } = await loadHelper();
  assert.equal(prefersReducedMotion(), false);
});

test('prefersReducedMotion returns false when matchMedia is missing', async () => {
  globalThis.window = {};
  const { prefersReducedMotion } = await loadHelper();
  assert.equal(prefersReducedMotion(), false);
});

test('prefersReducedMotion returns false when the media query does not match', async () => {
  globalThis.window = {
    matchMedia: (q) => ({ matches: false, media: q }),
  };
  const { prefersReducedMotion } = await loadHelper();
  assert.equal(prefersReducedMotion(), false);
});

test('prefersReducedMotion returns true when the media query matches', async () => {
  globalThis.window = {
    matchMedia: (q) => ({ matches: q === '(prefers-reduced-motion: reduce)', media: q }),
  };
  const { prefersReducedMotion } = await loadHelper();
  assert.equal(prefersReducedMotion(), true);
});

test('prefersReducedMotion re-reads matchMedia on every call (not cached)', async () => {
  let matches = false;
  globalThis.window = {
    matchMedia: () => ({ matches }),
  };
  const { prefersReducedMotion } = await loadHelper();
  assert.equal(prefersReducedMotion(), false);
  matches = true;
  assert.equal(prefersReducedMotion(), true);
});

test('prefersReducedMotion swallows matchMedia exceptions', async () => {
  globalThis.window = {
    matchMedia: () => { throw new Error('nope'); },
  };
  const { prefersReducedMotion } = await loadHelper();
  assert.equal(prefersReducedMotion(), false);
});
