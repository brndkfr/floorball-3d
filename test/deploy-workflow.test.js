// .github/workflows/deploy-pages.yml publishes branch previews next to the
// live site. It builds branch code from a pull_request_target run, so the
// safety rails matter more than the plumbing; this pins them. (Line-based:
// the repo has no JS YAML parser and this doesn't justify adding one.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const yml = readFileSync(new URL('../.github/workflows/deploy-pages.yml', import.meta.url), 'utf8');

// Text of one job: from "  name:" to the next two-space-indented key.
function job(name) {
  const lines = yml.split('\n');
  const start = lines.indexOf(`  ${name}:`);
  assert.ok(start >= 0, `job ${name} missing`);
  let end = start + 1;
  while (end < lines.length && !/^ {2}[A-Za-z]/.test(lines[end])) end++;
  return lines.slice(start, end).filter((l) => !l.trim().startsWith('#')).join('\n');
}

test('workflow-wide token is read-only', () => {
  assert.match(yml, /^permissions:\n {2}contents: read\n\n/m);
});

test('previews come only from open, labelled, same-repo PRs', () => {
  const plan = job('plan');
  assert.match(plan, /--state open --label preview/);
  assert.match(plan, /select\(\.isCrossRepository \| not\)/);
});

test('branch code is built read-only, without credentials or the shared cache', () => {
  const b = job('build-preview');
  assert.match(b, /ref: \$\{\{ matrix\.preview\.sha \}\}/);
  assert.match(b, /persist-credentials: false/);
  assert.match(b, /permissions:\n {6}contents: read\n/);
  assert.doesNotMatch(b, /pages:|id-token:|secrets\./);
  assert.doesNotMatch(b, /cache: pnpm/);
  assert.match(b, /BUILD_SHA: \$\{\{ matrix\.preview\.sha \}\}/);
});

test('the root rebuilt on a preview refresh is main, also without the cache', () => {
  const r = job('build-root');
  assert.match(r, /ref: main/);
  assert.doesNotMatch(r, /cache: pnpm/);
});

test('only the deploy job can write to Pages, and it runs no checked-out code', () => {
  for (const name of ['build', 'plan', 'build-root', 'build-preview']) {
    assert.doesNotMatch(job(name), /pages: write|id-token: write/, `${name} must not write to Pages`);
  }
  const d = job('deploy');
  assert.match(d, /pages: write/);
  assert.doesNotMatch(d, /actions\/checkout|pnpm /);
  assert.match(d, /site\/preview\//);
});

test('deploys serialise without cancelling each other', () => {
  assert.match(job('deploy'), /group: pages-deploy\n {6}cancel-in-progress: false/);
});
