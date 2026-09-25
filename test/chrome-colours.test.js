// Broadcast recolour (S-BACK-021): UI chrome built in JS (inline styles and
// injected <style> blocks) must use the --fb-* tokens like app.css does, not
// the old tactical-HUD literals. Content colours (shape / arrow defaults,
// the dock's colour swatches, 3D markers) are data and are not listed here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CHROME_MODULES = [
  'authoring/inspector.js', 'authoring/library-dialog.js', 'help.js',
  'authoring/export-dialog.js', 'authoring/choreo-tutorial-ui.js',
  'authoring/dialog.js', 'authoring/choreograph.js',
];
// Old HUD cyan / amber / warm text, glass backgrounds and the Consolas face.
const OLD = /#4fe0ff|#ffb347|#dff9ff|#f7e6cf|rgba\(\s*79,\s*224,\s*255|rgba\(\s*255,\s*179,\s*71|rgba\(\s*20,\s*16,\s*10|Consolas/i;

for (const f of CHROME_MODULES) {
  test(`${f} styles its chrome with Broadcast tokens`, () => {
    const src = readFileSync(new URL(`../web/src/${f}`, import.meta.url), 'utf8');
    const hits = src.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => OLD.test(l));
    assert.deepEqual(hits.map(([n, l]) => `${n}: ${l.trim().slice(0, 90)}`), []);
  });
}

test('index.html has no inline old-HUD colours (styles belong in app.css)', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  const hits = html.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => OLD.test(l));
  assert.deepEqual(hits.map(([n, l]) => `${n}: ${l.trim().slice(0, 90)}`), []);
});

// Design canvas: dialog titles are sentence case in the text colour, not the
// old HUD's uppercase brand-blue caps. One shared class keeps them alike.
const DIALOGS = ['authoring/library-dialog.js', 'authoring/export-dialog.js', 'help.js', 'authoring/choreo-tutorial-ui.js'];
for (const f of DIALOGS) {
  test(`${f} titles its dialog with .fb-dialog-title`, () => {
    const src = readFileSync(new URL(`../web/src/${f}`, import.meta.url), 'utf8');
    assert.match(src, /fb-dialog-title/);
    assert.doesNotMatch(src, /h2 \{[^}]*uppercase/, 'heading rule still uppercases');
  });
}

test('app.css defines .fb-dialog-title in sentence case', () => {
  const css = readFileSync(new URL('../web/src/app.css', import.meta.url), 'utf8');
  const rule = css.match(/\.fb-dialog-title\s*\{([^}]*)\}/);
  assert.ok(rule, '.fb-dialog-title rule missing');
  assert.doesNotMatch(rule[1], /uppercase/);
  assert.match(rule[1], /var\(--fb-text-1\)/);
});
