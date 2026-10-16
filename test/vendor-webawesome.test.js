// scripts/vendor-webawesome.mjs copies only the Web Awesome files the app
// needs into web/lib/webawesome/: the chosen components plus everything they
// import, and the theme CSS plus its @imports. The closure walk is pure and
// tested here against a fake file map.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importsOf, closure } from '../scripts/vendor-webawesome.mjs';

test('importsOf finds static JS imports and CSS @imports, relative only', () => {
  const js = `
    import { A } from "../../chunks/chunk.A.js";
    import "../../chunks/chunk.B.js";
    import { x } from 'lit';
    const later = () => import(path);
    export { A };`;
  assert.deepEqual(importsOf('components/x/x.js', js), ['chunks/chunk.A.js', 'chunks/chunk.B.js']);
  const css = `@import url('../layers.css');\n@import url("../color/palettes/default.css");\n@layer x { a { b: c } }`;
  assert.deepEqual(importsOf('styles/themes/default.css', css), ['styles/layers.css', 'styles/color/palettes/default.css']);
});

test('closure follows imports transitively and visits each file once', () => {
  const files = {
    'components/a/a.js': 'import "../../chunks/c1.js"; import "../../chunks/c2.js";',
    'components/b/b.js': 'import "../../chunks/c2.js";',
    'chunks/c1.js': 'import "./c3.js";',
    'chunks/c2.js': 'import "./c3.js";',
    'chunks/c3.js': 'export const z = 1;',
    'chunks/unused.js': '',
  };
  const got = closure(['components/a/a.js', 'components/b/b.js'], (p) => files[p]);
  assert.deepEqual([...got].sort(), ['chunks/c1.js', 'chunks/c2.js', 'chunks/c3.js', 'components/a/a.js', 'components/b/b.js']);
});

test('closure throws on a missing file instead of copying a broken subset', () => {
  assert.throws(() => closure(['a.js'], (p) => (p === 'a.js' ? 'import "./gone.js";' : undefined)), /gone\.js/);
});
