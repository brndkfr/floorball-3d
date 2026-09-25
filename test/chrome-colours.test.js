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
