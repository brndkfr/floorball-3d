// GitHub Pages: CI (.github/workflows/deploy-pages.yml) builds every push and
// PR without any write access; publishing (.github/workflows/pages.yml) runs
// with Pages write access and must never run branch code - branch previews
// come in only as the `site` artifact their own CI run built. CodeQL flags the
// other shape (checking out and building a PR in a privileged run) as cache
// poisoning, so this pins the split. Line-based: the repo has no JS YAML
// parser and this doesn't justify adding one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

// CRLF on Windows checkouts (core.autocrlf) would break the \n-anchored regexes.
const read = (f) => readFileSync(new URL(`../.github/workflows/${f}`, import.meta.url), 'utf8')
  .split(/\r?\n/).filter((l) => !l.trim().startsWith('#')).join('\n');
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
  assert.match(checkouts[0], /^@[0-9a-f]{40} # v[\d.]+\n\s+with:\n\s+ref: main\n\s+persist-credentials: false/);
  assert.doesNotMatch(pages, /pull_request\.head|workflow_run\.head_sha|cache: pnpm/);
});

test('previews are open, labelled, same-repo PRs, taken from green CI artifacts', () => {
  assert.match(pages, /--state open --label preview/);
  assert.match(pages, /select\(\.isCrossRepository \| not\)/);
  assert.match(pages, /--event pull_request --status success/);
  assert.match(pages, /gh run download "\$run" [^\n]*--name site --dir "main\/dist\/preview\/\$slug"/);
});

// S-BACK-029 H1: a fork PR can reuse a same-repo branch name, and its
// pull_request CI run then carries that head_branch. Resolving the artifact
// by branch name could publish fork code on the production origin, so the
// run is pinned to the labelled PR's head commit and must come from this repo.
test('preview artifacts are resolved by PR head commit, never by branch name', () => {
  assert.match(pages, /--json headRefName,headRefOid,isCrossRepository/);
  assert.match(pages, /while read -r branch sha; do/);
  assert.match(pages, /gh run list [^\n]*\\\n\s+--commit "\$sha" --event pull_request --status success/);
  assert.doesNotMatch(pages, /--branch "\$branch"/);
});

test('a preview run from another repository is skipped', () => {
  assert.match(pages, /gh api "repos\/\$GITHUB_REPOSITORY\/actions\/runs\/\$run" --jq '\.head_repository\.full_name'/);
  assert.match(pages, /\[ "\$repo" = "\$GITHUB_REPOSITORY" \] \|\| \{[^\n]*continue; \}/);
});

test('publishes serialise without cancelling each other', () => {
  assert.match(pages, /group: pages-publish\n {6}cancel-in-progress: false/);
});

// S-BACK-029 M7 / L6: supply-chain hardening of every workflow.
const codeql = read('codeql.yml');
const all = { 'deploy-pages.yml': ci, 'pages.yml': pages, 'codeql.yml': codeql };

test('every action is pinned to a full commit SHA with its version as a comment', () => {
  for (const [file, text] of Object.entries(all)) {
    const uses = [...text.matchAll(/uses:\s*(\S+)(.*)$/gm)];
    assert.ok(uses.length > 0, file);
    for (const [, ref, rest] of uses) {
      assert.match(ref, /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/, `${file}: ${ref} is not pinned to a SHA`);
      assert.match(rest, /^\s+# v\d+\.\d+\.\d+/, `${file}: ${ref} lacks a "# vX.Y.Z" comment`);
    }
  }
});

test('no checkout keeps the GitHub token for later steps', () => {
  for (const [file, text] of Object.entries(all)) {
    for (const block of text.split('uses: actions/checkout').slice(1)) {
      assert.match(block.split(/\n\s*- /)[0], /persist-credentials: false/, `${file}: checkout without persist-credentials: false`);
    }
  }
});

test('CodeQL runs the security-extended suite and ignores only paths that exist', () => {
  assert.match(codeql, /queries: security-extended/);
  const cfg = readFileSync(new URL('../.github/codeql/codeql-config.yml', import.meta.url), 'utf8');
  const ignored = [...cfg.matchAll(/^\s+-\s+(\S+)\s*$/gm)].map((m) => m[1]);
  assert.ok(ignored.length > 0);
  for (const p of ignored) assert.ok(existsSync(new URL(`../${p}`, import.meta.url)), `codeql-config ignores missing path ${p}`);
});

test('Dependabot watches GitHub Actions and npm', () => {
  const url = new URL('../.github/dependabot.yml', import.meta.url);
  assert.ok(existsSync(url), '.github/dependabot.yml missing');
  const dep = readFileSync(url, 'utf8');
  assert.match(dep, /package-ecosystem: "?github-actions"?/);
  assert.match(dep, /package-ecosystem: "?npm"?/);
});
