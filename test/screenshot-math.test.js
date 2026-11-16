// S-BACK-032: screenshot of what is on screen, whole app. Pure parts: the
// file name, the visible stage (window minus the shell that is actually on
// screen in this mode), screen rects mapped into the image, and the text
// transforms the label painter needs.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { shotFileName, stageCrop, toImageRect, applyTextTransform } = await import('../web/src/screenshot-math.js');

test('shotFileName: app, mode and local time, file-system safe', () => {
  const d = new Date(2026, 10, 16, 9, 5, 7);   // local time
  assert.equal(shotFileName(d, 'train'), 'floorball-train-2026-11-16-09-05-07.png');
  assert.equal(shotFileName(d, ''), 'floorball-2026-11-16-09-05-07.png');
  assert.equal(shotFileName(d, 'plan/../x'), 'floorball-planx-2026-11-16-09-05-07.png');
});

const R = (x, y, w, h) => ({ x, y, w, h });

test('stageCrop: desktop Plan = window minus rail, top bar, right panel and recorder', () => {
  const c = stageCrop({ vw: 1440, vh: 900, rail: R(0, 0, 64, 900), topbar: R(64, 0, 1376, 52), panels: [R(1080, 52, 360, 848)], bars: [R(64, 680, 1016, 220)] });
  assert.deepEqual(c, { x: 64, y: 52, w: 1016, h: 628 });
});

test('stageCrop: Train (no side panel, no recorder) is everything right of the rail and under the top bar', () => {
  assert.deepEqual(stageCrop({ vw: 1440, vh: 900, rail: R(0, 0, 64, 900), topbar: R(64, 0, 1376, 52), panels: [], bars: [] }), { x: 64, y: 52, w: 1376, h: 848 });
});

test('stageCrop: phone, the rail is a tab bar at the bottom', () => {
  assert.deepEqual(stageCrop({ vw: 390, vh: 844, rail: R(0, 786, 390, 58), topbar: R(0, 0, 390, 52), panels: [], bars: [] }), { x: 0, y: 52, w: 390, h: 734 });
});

test('stageCrop: Present (shell hidden) is the whole window; nonsense falls back to the window', () => {
  assert.deepEqual(stageCrop({ vw: 1280, vh: 720, rail: null, topbar: null, panels: [], bars: [] }), { x: 0, y: 0, w: 1280, h: 720 });
  assert.deepEqual(stageCrop({ vw: 800, vh: 600, rail: R(0, 0, 900, 600), topbar: null, panels: [], bars: [] }), { x: 0, y: 0, w: 800, h: 600 });
});

test('stageCrop: a panel on the left half is not a right panel; empty rects are ignored', () => {
  const c = stageCrop({ vw: 1440, vh: 900, rail: R(0, 0, 64, 900), topbar: R(64, 0, 1376, 52), panels: [R(84, 72, 300, 200), R(1200, 52, 0, 0)], bars: [] });
  assert.deepEqual(c, { x: 64, y: 52, w: 1376, h: 848 });
});

test('toImageRect: screen rect to image pixels, relative to the crop and scaled', () => {
  assert.deepEqual(toImageRect(R(100, 80, 50, 20), { x: 64, y: 52, w: 1000, h: 600 }, 2), { x: 72, y: 56, w: 100, h: 40 });
});

test('applyTextTransform: what CSS text-transform would show', () => {
  assert.equal(applyTextTransform('Passing-first zone', 'uppercase'), 'PASSING-FIRST ZONE');
  assert.equal(applyTextTransform('SLOT', 'lowercase'), 'slot');
  assert.equal(applyTextTransform('full alert!', 'capitalize'), 'Full Alert!');
  assert.equal(applyTextTransform('Slot', 'none'), 'Slot');
  assert.equal(applyTextTransform('Slot', undefined), 'Slot');
});
