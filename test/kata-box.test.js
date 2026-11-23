// The KATA box of the lesson video (A-BACK-049): layout and dot colours.
// The canvas drawing itself (export.js drawKataBox) is not testable in Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { kataBoxLayout, kataDotColor, KATA_BOX_DIMS } = await import('../web/src/kata-box.js');

test('kata box: dots are green ok, yellow adjust, grey free and pending, grey for anything unknown', () => {
  assert.equal(kataDotColor('ok'), '#2ecc55');
  assert.equal(kataDotColor('adjust'), '#ffd21a');
  assert.equal(kataDotColor('free'), kataDotColor('pending'));
  assert.equal(kataDotColor(undefined), kataDotColor('pending'));
  assert.deepEqual(KATA_BOX_DIMS, ['placement', 'depth', 'axis']);
});

test('kata box: bottom-left, inside the picture, three rows tall', () => {
  const L = kataBoxLayout({ w: 1280, h: 720 }, { fontPx: 25, labelW: 120 });
  assert.equal(L.x, 36);
  assert.equal(L.y + L.h, 720 - 36);
  assert.ok(L.w > 120 && L.h >= 3 * L.rowH);
  assert.ok(L.x + L.w < 1280 / 2);
});

test('kata box: with a caption it ends above the caption box, never overlapping it', () => {
  const caption = { y: 560 };
  const L = kataBoxLayout({ w: 1280, h: 720 }, { fontPx: 25, labelW: 120, avoidTop: caption.y });
  assert.ok(L.y + L.h < caption.y);
  const none = kataBoxLayout({ w: 1280, h: 720 }, { fontPx: 25, labelW: 120, avoidTop: 700 });
  assert.equal(none.y + none.h, 720 - 36, 'a caption lower than the margin does not push it up');
});
