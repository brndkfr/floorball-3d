// GitHub Pages: CI (.github/workflows/deploy-pages.yml) builds every push and
// PR without any write access; publishing (.github/workflows/pages.yml) runs
// with Pages write access and must never run branch code - branch previews
// come in only as the `site` artifact their own CI run built. CodeQL flags the
// other shape (checking out and building a PR in a privileged run) as cache
// poisoning, so this pins the split. Line-based: the repo has no JS YAML
// parser and this doesn't justify adding one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../.github/workflows/${f}`, import.meta.url), 'utf8')
  .split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
const ci = read('deploy-pages.yml');
const pages = read('pages.yml');

test('CI has no write access and no privileged triggers', () => {
  assert.match(ci, /^name: CI$/m);
  assert.match(ci, /^permissions:\n {2}contents: read\n/m);
  assert.doesNotMatch(ci, /pages: write|id-token: write|pull_request_target|workflow_run/);
});

test('CI hands the built site over as the `site` artifact', () => {
  assert.match(ci, /name: site\n {10}path: dist/);
});

test('publishing runs after CI and on label changes', () => {
  assert.match(pages, /workflow_run:\n {4}workflows: \[CI\]\n {4}types: \[completed\]/);
  assert.match(pages, /pull_request_target:\n {4}types: \[labeled, unlabeled, closed\]/);
  assert.match(pages, /github\.event\.workflow_run\.conclusion == 'success'/);
});

test('publishing checks out main only, never PR code, and uses no cache', () => {
  const checkouts = pages.split('uses: actions/checkout').slice(1);
  assert.equal(checkouts.length, 1);
  assert.match(checkouts[0], /^@v\d+\n\s+with:\n\s+ref: main\n\s+persist-credentials: false/);
  assert.doesNotMatch(pages, /pull_request\.head|workflow_run\.head_sha|cache: pnpm/);
});

test('previews are open, labelled, same-repo PRs, taken from green CI artifacts', () => {
  assert.match(pages, /--state open --label preview/);
  assert.match(pages, /select\(\.isCrossRepository \| not\)/);
  assert.match(pages, /--event pull_request --status success/);
  assert.match(pages, /gh run download "\$run" [^\n]*--name site --dir "main\/dist\/preview\/\$slug"/);
});

test('publishes serialise without cancelling each other', () => {
  assert.match(pages, /group: pages-publish\n {6}cancel-in-progress: false/);
});
