// The Broadcast redesign's third-party assets are copied into web/lib by
// scripts (vendor-webawesome.mjs, vendor-fonts.mjs), never hand-edited.
// These tests pin what the app relies on: every @font-face points at a file
// that exists and covers the weights the design uses, and the Web Awesome
// subset contains every component the app loads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { COMPONENTS, ENTRY } from '../scripts/vendor-webawesome.mjs';

const web = (p) => new URL(`../web/${p}`, import.meta.url);

test('fonts.css declares Archivo 400-700 and IBM Plex Mono 400/500, all files present', () => {
  const css = readFileSync(web('lib/fonts/fonts.css'), 'utf8');
  const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, b]) => ({
    family: b.match(/font-family:\s*'([^']+)'/)[1],
    weight: Number(b.match(/font-weight:\s*(\d+)/)[1]),
    url: b.match(/url\('([^']+)'\)/)[1],
    swap: /font-display:\s*swap/.test(b),
  }));
  const have = (f) => faces.filter((x) => x.family === f).map((x) => x.weight).sort();
  assert.deepEqual(have('Archivo'), [400, 500, 600, 700]);
  assert.deepEqual(have('IBM Plex Mono'), [400, 500]);
  for (const f of faces) {
    assert.ok(f.swap, `${f.family} ${f.weight} needs font-display: swap`);
    assert.ok(existsSync(new URL(f.url, web('lib/fonts/fonts.css'))), `${f.url} missing`);
  }
  assert.ok(existsSync(web('lib/fonts/OFL.txt')), 'font licence must ship with the fonts');
});

test('the Web Awesome subset holds every component the app loads', () => {
  assert.ok(existsSync(web(`lib/webawesome/${ENTRY}`)));
  for (const c of COMPONENTS) assert.ok(existsSync(web(`lib/webawesome/components/${c}/${c}.js`)), `${c} missing - run pnpm run vendor:webawesome`);
  const loader = readFileSync(web('src/ui/webawesome.js'), 'utf8');
  for (const [, c] of loader.matchAll(/lib\/webawesome\/components\/([\w-]+)\//g)) {
    assert.ok(COMPONENTS.includes(c), `web/src/ui/webawesome.js loads ${c}, add it to COMPONENTS`);
  }
});

test('the default icon library resolves locally, never to fontawesome.com', () => {
  const loader = readFileSync(web('src/ui/webawesome.js'), 'utf8');
  assert.match(loader, /registerIconLibrary\(\s*'default'/);
  assert.doesNotMatch(loader, /fontawesome\.com/);
});
