// Inspector fields in the design-canvas style (S-BACK-021): uppercase 10 px
// labels over 32 px controls on surf-2, brand-coloured sliders. The look
// lives in app.css; inspector.js used to paint every select / input inline
// with the old translucent-white HUD field, which overrode the stylesheet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../web/src/${p}`, import.meta.url), 'utf8');

test('inspector.js does not paint its fields inline', () => {
  const src = read('authoring/inspector.js');
  const hits = src.split('\n').map((l, i) => [i + 1, l.trim()])
    .filter(([, l]) => /\.style\.cssText\s*=\s*'(flex:1;|width:56px;|width:36px; height:26px;|margin-left:6px; padding:2px 8px)/.test(l));
  assert.deepEqual(hits.map(([n, l]) => `${n}: ${l.slice(0, 80)}`), []);
  assert.doesNotMatch(src, /color-mix\(in srgb, var\(--fb-text-1\) 7%/);
});

test('app.css styles Inspector controls with the Broadcast field look', () => {
  const css = read('app.css');
  const rule = (sel) => {
    const m = css.match(new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^{]*\\{([^}]*)\\}`));
    assert.ok(m, `${sel} rule missing`);
    return m[1];
  };
  const field = rule('#inspector select');
  assert.match(field, /var\(--fb-control-h\)/);
  assert.match(field, /var\(--fb-surf-2\)/);
  assert.match(field, /var\(--fb-radius-1\)/);
  assert.match(rule('#inspector input[type="range"]'), /accent-color:\s*var\(--fb-brand\)/);
  const label = rule('#inspector .ins-label');
  assert.match(label, /var\(--fb-text-3\)/);
  assert.match(label, /uppercase/);
});
