// S-BACK-018: coverage-based e2e test selection (pure logic in scripts/e2e-impact/impact.mjs).

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { classifyPath, parseDiff, isInertTopLevelHunk, coverageToLines, buildMap, selectTests } =
  await import('../scripts/e2e-impact/impact.mjs');

// --- classifyPath ---

test('classifyPath: app modules, specs, full-run triggers and ignorable files', () => {
  assert.equal(classifyPath('web/src/authoring/actors.js'), 'src');
  assert.equal(classifyPath('test-e2e/shots.spec.js'), 'spec');
  for (const p of ['test-e2e/fixtures.js', 'web/index.html', 'web/lib/three/three.module.js', 'web/assets/ball.obj',
    'playwright.config.js', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'scripts/serve-static.mjs']) {
    assert.equal(classifyPath(p), 'full', p);
  }
  for (const p of ['docs/plan.md', 'README.md', 'CLAUDE.md', 'test/ball-tool.test.js', 'generators/generate_ball.py',
    'scripts/build.mjs', 'scripts/e2e-impact/select.mjs', '.github/workflows/deploy-pages.yml', '.gitignore']) {
    assert.equal(classifyPath(p), 'ignore', p);
  }
});

// --- parseDiff ---

const DIFF = [
  'diff --git a/web/src/a.js b/web/src/a.js',
  'index 111..222 100644',
  '--- a/web/src/a.js',
  '+++ b/web/src/a.js',
  '@@ -3 +3 @@ function f() {',
  '-  return 1;',
  '+  return 2;',
  '@@ -10,0 +11,2 @@',
  '+// note',
  '+',
  'diff --git a/web/src/new.js b/web/src/new.js',
  'new file mode 100644',
  'index 000..333',
  '--- /dev/null',
  '+++ b/web/src/new.js',
  '@@ -0,0 +1 @@',
  '+export const x = 1;',
  'diff --git a/web/src/gone.js b/web/src/gone.js',
  'deleted file mode 100644',
  '--- a/web/src/gone.js',
  '+++ /dev/null',
  '@@ -1 +0,0 @@',
  '-export const y = 2;',
].join('\r\n');

test('parseDiff: statuses, old-side hunk positions and line contents (CRLF tolerant)', () => {
  const files = parseDiff(DIFF);
  assert.deepEqual(files.map((f) => [f.path, f.status]), [
    ['web/src/a.js', 'modified'], ['web/src/new.js', 'added'], ['web/src/gone.js', 'deleted'],
  ]);
  assert.deepEqual(files[0].hunks, [
    { oldStart: 3, oldCount: 1, removed: ['  return 1;'], added: ['  return 2;'] },
    { oldStart: 10, oldCount: 0, removed: [], added: ['// note', ''] },
  ]);
});

// --- isInertTopLevelHunk ---

const known = new Set(['web/src/authoring/balls.js', 'web/src/state.js']);
const inert = (removed, added, path = 'web/src/authoring/actors.js') =>
  isInertTopLevelHunk({ removed, added }, { path, known });

test('isInertTopLevelHunk: comments, blank lines and whole function declarations are inert', () => {
  assert.equal(inert([], ['// hello', '']), true);
  assert.equal(inert([], ['export function f({ x }) {', '  return x;', '}', '', 'async function g() {', '  await 1;', '}']), true);
  assert.equal(inert(['function old() { return 1; }'], []), true);
});

test('isInertTopLevelHunk: imports of already-loaded modules or packages are inert, new modules are not', () => {
  assert.equal(inert(["import { a } from './balls.js';"], ["import { a, b } from './balls.js';"]), true);
  assert.equal(inert([], ['import {', '  x,', "} from '../state.js';"]), true);
  assert.equal(inert([], ["import * as THREE from 'three';"]), true);
  assert.equal(inert([], ["import { z } from './brand-new.js';"]), false);
  assert.equal(inert([], ["import './side-effect.js';"]), false);
});

test('isInertTopLevelHunk: module-init statements and bare indented lines are not inert', () => {
  assert.equal(inert([], ["window.addEventListener('x', f);"]), false);
  assert.equal(inert(['const LIMIT = 3;'], ['const LIMIT = 4;']), false);
  assert.equal(inert(['  a: 1,'], ['  a: 2,']), false);   // inside a top-level object literal
  assert.equal(inert([], ['export function f() {', '  return 1;']), false);   // unterminated
});

// --- coverageToLines ---

test('coverageToLines: V8 function ranges become 1-based line spans with top-level and hit flags', () => {
  const source = 'const a = 1;\r\nfunction f() {\r\n  return a;\r\n}\r\nfunction g() {}\r\n';
  const fStart = source.indexOf('function f');
  const fEnd = source.indexOf('}') + 1;
  const gStart = source.indexOf('function g');
  const fns = [
    { functionName: '', ranges: [{ startOffset: 0, endOffset: source.length, count: 1 }] },
    { functionName: 'f', ranges: [{ startOffset: fStart, endOffset: fEnd, count: 2 }] },
    { functionName: 'g', ranges: [{ startOffset: gStart, endOffset: gStart + 15, count: 0 }] },
  ];
  assert.deepEqual(coverageToLines(source, fns), [
    { s: 1, e: 5, top: true, hit: true },
    { s: 2, e: 4, top: false, hit: true },
    { s: 5, e: 5, top: false, hit: false },
  ]);
});

// --- buildMap + selectTests ---

// a.js: top 1-40, f 5-10 (run by t0), g 20-30 (run by t1), h 22-24 nested in g (run by nobody).
function sampleMap() {
  const a = (hitF, hitG) => [
    { s: 1, e: 40, top: true, hit: true },
    { s: 5, e: 10, top: false, hit: hitF },
    { s: 20, e: 30, top: false, hit: hitG },
    { s: 22, e: 24, top: false, hit: false },
  ];
  return buildMap('abc123', [
    { test: { file: 'test-e2e/one.spec.js', line: 12, title: 't0' }, files: { 'web/src/a.js': a(true, false) } },
    { test: { file: 'test-e2e/two.spec.js', line: 7, title: 't1' }, files: { 'web/src/a.js': a(false, true), 'web/src/b.js': [{ s: 1, e: 9, top: true, hit: true }] } },
    { test: { file: 'test-e2e/a11y.spec.js', line: 67, title: 'own context' }, files: {} },
  ]);
}

const mod = (path, hunks) => ({ path, status: 'modified', hunks });
const hunk = (oldStart, oldCount, removed = [], added = []) => ({ oldStart, oldCount, removed, added });

test('buildMap: indexes functions per file and records which tests hit them', () => {
  const map = sampleMap();
  assert.equal(map.sha, 'abc123');
  assert.deepEqual(map.tests.map((t) => t.covered), [true, true, false]);
  assert.deepEqual(map.files['web/src/a.js'].fns, [[1, 40, 1], [5, 10, 0], [20, 30, 0], [22, 24, 0]]);
  assert.deepEqual(map.files['web/src/a.js'].hits, [[0, 1], [0], [1], []]);
});

test('selectTests: a change inside f runs only the test that executed f (+ bootstrap + uncovered tests)', () => {
  const r = selectTests(sampleMap(), [mod('web/src/a.js', [hunk(7, 1, ['  x;'], ['  y;'])])]);
  assert.equal(r.full, null);
  assert.deepEqual(r.targets, ['test-e2e/a11y.spec.js:67', 'test-e2e/bootstrap.spec.js', 'test-e2e/one.spec.js:12']);
});

test('selectTests: a change in an unexecuted nested function falls back to the nearest executed parent', () => {
  const r = selectTests(sampleMap(), [mod('web/src/a.js', [hunk(23, 1, ['  x;'], ['  y;'])])]);
  assert.ok(r.targets.includes('test-e2e/two.spec.js:7'));
  assert.ok(!r.targets.includes('test-e2e/one.spec.js:12'));
});

test('selectTests: a function no test executed is reported as uncovered', () => {
  const map = sampleMap();
  map.files['web/src/a.js'].hits[2] = [];   // nobody ran g either
  const r = selectTests(map, [mod('web/src/a.js', [hunk(25, 1, ['  x;'], ['  y;'])])]);
  assert.equal(r.full, null);
  assert.deepEqual(r.uncovered, ['web/src/a.js:25']);
});

test('selectTests: module-init changes force a full run, inert top-level hunks do not', () => {
  const init = selectTests(sampleMap(), [mod('web/src/a.js', [hunk(15, 0, [], ["window.addEventListener('x', f);"])])]);
  assert.match(init.full, /web\/src\/a\.js:15/);
  const fn = selectTests(sampleMap(), [mod('web/src/a.js', [hunk(15, 0, [], ['export function k() {', '  return 1;', '}'])])]);
  assert.equal(fn.full, null);
});

test('selectTests: full-run paths, deleted modules; edited specs run whole; docs are ignored', () => {
  assert.match(selectTests(sampleMap(), [{ path: 'web/index.html', status: 'modified', hunks: [] }]).full, /web\/index\.html/);
  assert.match(selectTests(sampleMap(), [{ path: 'web/src/a.js', status: 'deleted', hunks: [] }]).full, /deleted/);
  const r = selectTests(sampleMap(), [
    { path: 'test-e2e/shots.spec.js', status: 'modified', hunks: [] },
    { path: 'docs/plan.md', status: 'modified', hunks: [] },
  ]);
  assert.equal(r.full, null);
  assert.ok(r.targets.includes('test-e2e/shots.spec.js'));
  assert.equal(r.targets.filter((t) => t.startsWith('test-e2e/one')).length, 0);
});

test('selectTests: a module no test ever loaded is uncovered; a new module is only noted', () => {
  const r = selectTests(sampleMap(), [
    mod('web/src/never.js', [hunk(3, 1, ['x'], ['y'])]),
    { path: 'web/src/fresh.js', status: 'added', hunks: [] },
  ]);
  assert.equal(r.full, null);
  assert.deepEqual(r.uncovered, ['web/src/never.js (no test loads it)']);
  assert.deepEqual(r.notes, ['web/src/fresh.js is new: runs through the changed code that imports it']);
});
