// Analyze step 1 drop zone (S-BACK-021, gaps canvas): a drop may carry
// several files or none that are images; take the first image, ignore the rest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstImageFile } from '../web/src/authoring/photo-overlay/photo-drop.js';

const f = (name, type) => ({ name, type });

test('first image wins over earlier non-images', () => {
  const pick = firstImageFile([f('notes.txt', 'text/plain'), f('a.jpg', 'image/jpeg'), f('b.png', 'image/png')]);
  assert.equal(pick.name, 'a.jpg');
});

test('no image, empty or missing list gives null', () => {
  assert.equal(firstImageFile([f('clip.mp4', 'video/mp4')]), null);
  assert.equal(firstImageFile([]), null);
  assert.equal(firstImageFile(null), null);
  assert.equal(firstImageFile(undefined), null);
});

test('works on an array-like FileList', () => {
  const list = { 0: f('x.webp', 'image/webp'), length: 1 };
  assert.equal(firstImageFile(list).name, 'x.webp');
});
