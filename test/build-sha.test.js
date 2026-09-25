// scripts/build.mjs stamps `?v=<sha>` on asset URLs so each deploy busts the
// cache. Branch previews are built inside a workflow run whose GITHUB_SHA is
// main's (pull_request_target / push to main), and GITHUB_* can't be
// overridden, so an explicit BUILD_SHA must win - else a preview keeps the
// same ?v= across its own pushes and browsers serve stale assets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commitSha } from '../scripts/build-sha.mjs';

const git = () => 'fedcba9876543210fedcba';

test('BUILD_SHA wins over GITHUB_SHA and git', () => {
  assert.equal(commitSha({ BUILD_SHA: '0123456789abcdef0123', GITHUB_SHA: 'aaaaaaaaaaaaaaaa' }, git), '0123456789ab');
});

test('GITHUB_SHA next, then git, each cut to 12 chars', () => {
  assert.equal(commitSha({ GITHUB_SHA: 'aaaaaaaaaaaaaaaaaaaa' }, git), 'aaaaaaaaaaaa');
  assert.equal(commitSha({}, git), 'fedcba987654');
});

test('no env and no git gives "dev"', () => {
  assert.equal(commitSha({}, () => { throw new Error('not a repo'); }), 'dev');
});

test('an empty BUILD_SHA is ignored', () => {
  assert.equal(commitSha({ BUILD_SHA: '', GITHUB_SHA: 'bbbbbbbbbbbbbbbb' }, git), 'bbbbbbbbbbbb');
});
