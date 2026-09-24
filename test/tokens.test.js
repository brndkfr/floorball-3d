// Design tokens (S-BACK-019). Three hand-maintained CSS files carry the
// redesign's foundation and nothing but this test keeps them honest:
// - web/src/tokens.css mirrors the domain colours in tokens.js (read by
//   three.js) and holds the Broadcast `--fb-*` palette, dark by default and
//   light under :root[data-theme="light"];
// - web/src/theme-broadcast.css maps Web Awesome's `--wa-*` variables onto
//   `--fb-*` and must never carry a literal colour;
// - web/index.html loads the extracted app.css + both token files instead
//   of an inline <style>.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as tokens from '../web/src/tokens.js';

const read = (p) => readFileSync(new URL(`../web/${p}`, import.meta.url), 'utf8');
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

// Custom properties declared directly inside every block whose selector is
// exactly `selector`, merged in source order like the cascade would (no
// nesting support needed for these files). null when there is no such block.
function block(css, selector) {
  const src = stripComments(css);
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const blocks = [...src.matchAll(new RegExp(`(^|[}\\s])${esc}\\s*\\{([^}]*)\\}`, 'g'))];
  if (!blocks.length) return null;
  const out = {};
  for (const m of blocks) {
    for (const [, name, value] of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[name] = value.trim();
  }
  return out;
}

// Broadcast palette from the design canvas Foundations sheet
// (docs/plan.md section 2, "Design system").
const FB_DARK = {
  '--fb-ink': '#0d0f12', '--fb-surf-1': '#15181c', '--fb-surf-2': '#1c2025', '--fb-surf-3': '#242a31',
  '--fb-line': '#262b31', '--fb-line-strong': '#333a42',
  '--fb-text-1': '#f2f4f7', '--fb-text-2': '#a4acb8', '--fb-text-3': '#6b7480',
  '--fb-brand': '#2e6bff', '--fb-brand-quiet': '#16203a', '--fb-danger': '#e5533d',
};
const FB_LIGHT = {
  '--fb-ink': '#f4f6f8', '--fb-surf-1': '#ffffff', '--fb-surf-2': '#eef0f3', '--fb-surf-3': '#e3e6ea',
  '--fb-line': '#dfe3e8', '--fb-line-strong': '#c6ccd3',
  '--fb-text-1': '#12151a', '--fb-text-2': '#59616c', '--fb-text-3': '#88919c',
  '--fb-brand': '#2e6bff', '--fb-brand-quiet': '#e6eeff', '--fb-danger': '#d6402b',
};
const FB_SHARED = ['--fb-radius-1', '--fb-radius-2', '--fb-control-h', '--fb-accent-bar', '--fb-font', '--fb-mono'];

test('tokens.css domain colours match tokens.js', () => {
  const root = block(read('src/tokens.css'), ':root');
  const domain = Object.entries(root).filter(([k]) => !k.startsWith('--fb-'));
  assert.ok(domain.length >= 5, 'expected the team / vector tokens in :root');
  const resolve = (v) => {
    const ref = v.match(/^var\((--[\w-]+)\)$/);
    return ref ? resolve(root[ref[1]]) : v.toLowerCase();
  };
  for (const [name, value] of domain) {
    const jsName = name.slice(2).replace(/-/g, '_').toUpperCase();
    assert.ok(tokens[jsName], `${name} has no ${jsName} export in tokens.js`);
    assert.equal(resolve(value), tokens[jsName].css, `${name} differs from tokens.js ${jsName}`);
  }
});

test('tokens.css defines the Broadcast palette, dark by default', () => {
  const root = block(read('src/tokens.css'), ':root');
  for (const [name, value] of Object.entries(FB_DARK)) assert.equal(root[name]?.toLowerCase(), value, name);
  for (const name of FB_SHARED) assert.ok(root[name], `${name} missing from :root`);
});

test('tokens.css redefines every Broadcast colour for the light theme', () => {
  const light = block(read('src/tokens.css'), ':root[data-theme="light"]');
  assert.ok(light, 'no :root[data-theme="light"] block');
  assert.deepEqual(Object.keys(light).sort(), Object.keys(FB_LIGHT).sort(), 'light block must redefine exactly the colour tokens');
  for (const [name, value] of Object.entries(FB_LIGHT)) assert.equal(light[name].toLowerCase(), value, name);
});

test('theme-broadcast.css maps Web Awesome variables onto --fb-* only', () => {
  const css = stripComments(read('src/theme-broadcast.css'));
  assert.match(css, /@layer\s+wa-theme-overrides\s*\{/, 'must live in the wa-theme-overrides cascade layer');
  const defined = new Set(Object.keys(block(read('src/tokens.css'), ':root')));
  const decls = [...css.matchAll(/(--wa-[\w-]+)\s*:\s*([^;]+);/g)].map(([, n, v]) => [n, v.trim()]);
  const names = new Set(decls.map(([n]) => n));
  for (const required of [
    '--wa-color-surface-default', '--wa-color-surface-raised', '--wa-color-surface-lowered', '--wa-color-surface-border',
    '--wa-color-text-normal', '--wa-color-text-quiet', '--wa-color-brand-fill-loud', '--wa-color-focus',
    '--wa-font-family-body', '--wa-font-family-heading', '--wa-font-family-code',
    '--wa-border-radius-s', '--wa-border-radius-m', '--wa-border-radius-l', '--wa-form-control-height',
  ]) assert.ok(names.has(required), `${required} not mapped`);
  for (const [name, value] of decls) {
    const ref = value.match(/^var\((--fb-[\w-]+)\)$/);
    assert.ok(ref, `${name}: ${value} - only var(--fb-*) references allowed`);
    assert.ok(defined.has(ref[1]), `${name} references undefined ${ref[1]}`);
  }
});

test('index.html loads its stylesheets in cascade order instead of an inline <style>', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /<style[\s>]/i, 'inline <style> should live in src/app.css');
  const hrefs = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]);
  // Web Awesome's stock theme must come before theme-broadcast.css, which
  // overrides it; fonts are self-hosted (scripts/vendor-fonts.mjs).
  assert.deepEqual(hrefs, [
    './lib/fonts/fonts.css', './lib/webawesome/styles/themes/default.css',
    './src/app.css', './src/tokens.css', './src/theme-broadcast.css',
  ]);
  assert.match(html, /<script type="module" src="src\/ui\/webawesome\.js"><\/script>/, 'Web Awesome loader must be loaded');
  assert.match(read('src/app.css'), /--hud-accent:\s*#4fe0ff/, 'app.css should carry the moved HUD styles');
});
