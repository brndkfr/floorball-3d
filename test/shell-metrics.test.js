// Broadcast shell (S-BACK-021): 64 px rail + 52 px top bar. The size lives in
// web/src/ui/shell-metrics.js for JS (floating panels keep clear of it) and
// as --shell-rail / --shell-topbar in app.css; this test keeps them in step
// and stops any module from hard-coding the old 52 / 40 px shell again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SHELL, SHELL_RESERVED } from '../web/src/ui/shell-metrics.js';

const read = (p) => readFileSync(new URL(`../web/src/${p}`, import.meta.url), 'utf8');

test('shell size matches the Broadcast design', () => {
  assert.deepEqual(SHELL, { rail: 64, topbar: 52, gap: 8 });
  assert.deepEqual(SHELL_RESERVED, { top: 60, left: 72, right: 8, bottom: 8 });
});

test('app.css uses the same shell size', () => {
  const css = read('app.css');
  assert.match(css, /--shell-rail:\s*64px/);
  assert.match(css, /--shell-topbar:\s*52px/);
});

test('the floating tool palette reserves the shell via SHELL_RESERVED, not literals', () => {
  const src = read('authoring/tool-palette.js');
  assert.doesNotMatch(src, /reserved:\s*\{\s*top:/, 'tool-palette.js hard-codes reserved edges');
  assert.match(src, /SHELL_RESERVED/);
});

test('Inspector and Layers are docked in the right panel, not floating', () => {
  for (const f of ['authoring/inspector.js', 'authoring/layers-panel.js']) {
    assert.doesNotMatch(read(f), /makeFloatable/, `${f} should no longer float`);
  }
});
