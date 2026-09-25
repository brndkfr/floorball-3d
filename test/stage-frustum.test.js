// The top-down (2D) view fits the rink into the stage, the part of the window
// the shell leaves free (rail, top bar, docked right panel, phone tab bar),
// and puts the rink centre on the stage centre. The old fit used the whole
// window, so the docked panel covered the right end of the rink.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stageFrustum } from '../web/src/ui/stage-frustum.js';

const HALF = { x: 21500, y: 11000 };   // rink half-extent on screen x / y, with margin

// World x at screen pixel px, for a frustum over a vw-wide window.
const worldX = (f, vw, px) => f.left + (f.right - f.left) * (px / vw);
const worldY = (f, vh, py) => f.top - (f.top - f.bottom) * (py / vh);

test('no insets: symmetric fit, same as the old whole-window fit', () => {
  const f = stageFrustum({ vw: 1600, vh: 900, insets: {}, half: HALF });
  const aspect = 1600 / 900;
  const halfH = Math.max(HALF.y, HALF.x / aspect);
  assert.ok(Math.abs(f.top - halfH) < 1e-6);
  assert.ok(Math.abs(f.bottom + halfH) < 1e-6);
  assert.ok(Math.abs(f.right - halfH * aspect) < 1e-6);
  assert.ok(Math.abs(f.left + halfH * aspect) < 1e-6);
});

test('docked shell: rink centre (world 0,0) lands on the stage centre', () => {
  const insets = { left: 64, top: 52, right: 320, bottom: 0 };
  const vw = 1440, vh = 900;
  const f = stageFrustum({ vw, vh, insets, half: HALF });
  const cx = 64 + (vw - 64 - 320) / 2, cy = 52 + (vh - 52) / 2;
  assert.ok(Math.abs(worldX(f, vw, cx)) < 1e-6);
  assert.ok(Math.abs(worldY(f, vh, cy)) < 1e-6);
});

test('docked shell: the whole rink (with margin) is inside the stage', () => {
  const insets = { left: 64, top: 52, right: 320, bottom: 0 };
  for (const [vw, vh] of [[1440, 900], [1920, 1080], [1280, 1000], [1200, 600]]) {
    const f = stageFrustum({ vw, vh, insets, half: HALF });
    assert.ok(worldX(f, vw, 64) <= -HALF.x + 1e-6, `${vw}x${vh} left edge`);
    assert.ok(worldX(f, vw, vw - 320) >= HALF.x - 1e-6, `${vw}x${vh} right edge`);
    assert.ok(worldY(f, vh, 52) >= HALF.y - 1e-6, `${vw}x${vh} top edge`);
    assert.ok(worldY(f, vh, vh) <= -HALF.y + 1e-6, `${vw}x${vh} bottom edge`);
  }
});

test('world units per pixel are the same on both axes (no stretch)', () => {
  const f = stageFrustum({ vw: 1440, vh: 900, insets: { left: 64, top: 52, right: 320 }, half: HALF });
  assert.ok(Math.abs((f.right - f.left) / 1440 - (f.top - f.bottom) / 900) < 1e-9);
});

test('a stage squeezed to nothing falls back to the whole window', () => {
  const f = stageFrustum({ vw: 300, vh: 200, insets: { left: 200, right: 200 }, half: HALF });
  assert.ok(Number.isFinite(f.left) && f.right > f.left && f.top > f.bottom);
  assert.ok(Math.abs(f.left + f.right) < 1e-6);
});
