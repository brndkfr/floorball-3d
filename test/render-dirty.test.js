// S-BACK-011 (partial): main animate() loop dirty-check. render-dirty.js is
// the one-shot flag choke points call (saveDoc, layer-visibility toggles)
// to force the next frame to actually render, since those mutations happen
// outside what animate() polls per frame (camera pose, selection identity,
// in-flight animation subsystems).
import { test } from 'node:test';
import assert from 'node:assert/strict';
// Each test imports a fresh module instance so the shared `dirty` flag
// doesn't leak state between tests (node's test runner shares the module
// cache within a file otherwise).
async function freshModule() {
  return import(`../web/src/render-dirty.js?t=${Date.now()}-${Math.random()}`);
}

test('starts dirty: the very first frame always renders', async () => {
  const { consumeRenderDirty } = await freshModule();
  assert.equal(consumeRenderDirty(), true);
});

test('consumeRenderDirty is edge-triggered: false after being consumed once', async () => {
  const { consumeRenderDirty } = await freshModule();
  assert.equal(consumeRenderDirty(), true); // initial dirty
  assert.equal(consumeRenderDirty(), false);
  assert.equal(consumeRenderDirty(), false);
});

test('markRenderDirty re-arms the flag for the next consume', async () => {
  const { consumeRenderDirty, markRenderDirty } = await freshModule();
  consumeRenderDirty(); // clear the initial dirty state
  assert.equal(consumeRenderDirty(), false);
  markRenderDirty();
  assert.equal(consumeRenderDirty(), true);
  assert.equal(consumeRenderDirty(), false);
});

test('multiple markRenderDirty calls before a consume collapse to one dirty frame', async () => {
  const { consumeRenderDirty, markRenderDirty } = await freshModule();
  consumeRenderDirty();
  markRenderDirty();
  markRenderDirty();
  markRenderDirty();
  assert.equal(consumeRenderDirty(), true);
  assert.equal(consumeRenderDirty(), false);
});
