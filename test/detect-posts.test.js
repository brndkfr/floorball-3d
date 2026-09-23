import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cornersFromPosts } from '../web/src/authoring/photo-overlay/detect-posts.js';

const near = (a, b, tol = 2) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol;
const assertCorners = (got, want, tol) => {
  assert.ok(got, 'expected corners, got null');
  got.forEach((p, i) => assert.ok(near(p, want[i], tol), `corner ${i}: got ${p} want ${want[i]}`));
};

test('two full vertical posts give TL/TR/BR/BL at their ends', () => {
  const segs = [[100, 50, 100, 200], [300, 40, 302, 190]];
  assertCorners(cornersFromPosts(segs), [[100, 50], [300, 40], [302, 190], [100, 200]]);
});

test('a post broken into pieces is merged into one', () => {
  const segs = [[100, 50, 100, 110], [101, 120, 101, 200], [300, 40, 300, 190]];
  assertCorners(cornersFromPosts(segs), [[100, 50], [300, 40], [300, 190], [101, 200]]);
});

test('bottom-occluded post (goalie in front) is extended to the other post length', () => {
  // right post only visible from 40 to 90; left post spans 150px
  const segs = [[100, 50, 100, 200], [300, 40, 300, 90]];
  assertCorners(cornersFromPosts(segs), [[100, 50], [300, 40], [300, 190], [100, 200]], 3);
});

test('top-occluded post is extended upward', () => {
  const segs = [[100, 50, 100, 200], [300, 130, 300, 190]];
  assertCorners(cornersFromPosts(segs), [[100, 50], [300, 40], [300, 190], [100, 200]], 3);
});

test('short back-frame vertical between the posts is ignored', () => {
  const segs = [[100, 50, 100, 200], [180, 90, 180, 150], [300, 40, 300, 190]];
  assertCorners(cornersFromPosts(segs), [[100, 50], [300, 40], [300, 190], [100, 200]]);
});

test('horizontal bars are ignored', () => {
  const segs = [[100, 50, 300, 40], [100, 200, 300, 190], [100, 50, 100, 200], [300, 40, 300, 190]];
  assertCorners(cornersFromPosts(segs), [[100, 50], [300, 40], [300, 190], [100, 200]]);
});

test('occluded post extends along the full post direction, not its own noisy tilt', () => {
  // visible right-post stub leans 5px over 50px; the full left post is plumb
  const segs = [[100, 50, 100, 200], [300, 40, 305, 90]];
  assertCorners(cornersFromPosts(segs), [[100, 50], [300, 40], [300, 190], [100, 200]], 3);
});

test('only one post found returns null', () => {
  assert.equal(cornersFromPosts([[100, 50, 100, 200], [102, 60, 102, 190]]), null);
  assert.equal(cornersFromPosts([]), null);
});

test('posts closer together than minSepFrac of their length return null', () => {
  assert.equal(cornersFromPosts([[100, 50, 100, 200], [120, 50, 120, 200]]), null);
});
