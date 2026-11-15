// S-BACK-022: which browser the local e2e run uses. On Windows the bundled
// Playwright Chromium is x64 only and renders WebGL in software
// (SwiftShader); on an ARM64 machine both run under emulation and the suite
// times out under load. Edge is Chromium, ships natively and uses the GPU.
// CI always keeps the bundled Chromium, so CI stays the real gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localBrowserChannel, EDGE_PATHS } from '../scripts/e2e-browser.mjs';

const has = (...paths) => (p) => paths.includes(p);

test('CI always uses the bundled Chromium', () => {
  assert.equal(localBrowserChannel({ ci: true, platform: 'win32', env: {}, exists: has(...EDGE_PATHS) }), undefined);
});

test('locally on Windows with Edge installed, Edge is used', () => {
  assert.equal(localBrowserChannel({ ci: false, platform: 'win32', env: {}, exists: has(EDGE_PATHS[0]) }), 'msedge');
  assert.equal(localBrowserChannel({ ci: false, platform: 'win32', env: {}, exists: has(EDGE_PATHS[1]) }), 'msedge');
});

test('without Edge, or off Windows, the bundled Chromium stays', () => {
  assert.equal(localBrowserChannel({ ci: false, platform: 'win32', env: {}, exists: has() }), undefined);
  assert.equal(localBrowserChannel({ ci: false, platform: 'linux', env: {}, exists: has(...EDGE_PATHS) }), undefined);
  assert.equal(localBrowserChannel({ ci: false, platform: 'darwin', env: {}, exists: () => true }), undefined);
});

test('PW_CHANNEL overrides: "chromium" forces the bundled one, anything else is passed on', () => {
  const edge = has(...EDGE_PATHS);
  assert.equal(localBrowserChannel({ ci: false, platform: 'win32', env: { PW_CHANNEL: 'chromium' }, exists: edge }), undefined);
  assert.equal(localBrowserChannel({ ci: false, platform: 'linux', env: { PW_CHANNEL: 'chrome' }, exists: edge }), 'chrome');
  assert.equal(localBrowserChannel({ ci: true, platform: 'win32', env: { PW_CHANNEL: 'msedge' }, exists: edge }), undefined);
});
