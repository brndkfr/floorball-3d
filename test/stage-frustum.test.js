// The top-down (2D) view fits the rink into the stage, the part of the window
// the shell leaves free (rail, top bar, docked right panel, phone tab bar),
// and puts the rink centre on the stage centre. The old fit used the whole
// window, so the docked panel covered the right end of the rink.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stageFrustum, clampToStage } from '../web/src/ui/stage-frustum.js';

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

// The chip popover hangs above its chip (anchor = bottom centre of the card).
// It is clamped into the stage too: in the 3D view the canvas runs under the
// docked right panel, so a chip near the right edge put the popover under
// the panel, where nothing in it could be clicked.
const DESKTOP = { left: 64, top: 52, right: 320, bottom: 0 };

test('clampToStage keeps a popover clear of the docked right panel', () => {
  const p = clampToStage({ x: 960, y: 190, cardW: 98, cardH: 24, vw: 1280, vh: 720, insets: DESKTOP });
  assert.ok(p.x + 98 / 2 <= 1280 - 320, `card right edge ${p.x + 49} must stay left of the panel at 960`);
  assert.equal(p.y, 190);
});

test('clampToStage keeps a popover clear of the rail and the top bar', () => {
  const p = clampToStage({ x: 10, y: 5, cardW: 120, cardH: 80, vw: 1280, vh: 720, insets: DESKTOP });
  assert.ok(p.x - 60 >= 64, 'card left edge must stay right of the rail');
  assert.ok(p.y - 80 >= 52, 'card top must stay below the top bar');
});

test('clampToStage leaves a popover inside the stage where it is', () => {
  assert.deepEqual(clampToStage({ x: 500, y: 300, cardW: 120, cardH: 80, vw: 1280, vh: 720, insets: DESKTOP }), { x: 500, y: 300 });
});

test('clampToStage keeps the phone tab bar clear', () => {
  const p = clampToStage({ x: 200, y: 840, cardW: 120, cardH: 80, vw: 390, vh: 844, insets: { left: 0, top: 52, right: 0, bottom: 56 } });
  assert.ok(p.y <= 844 - 56, 'card bottom must stay above the tab bar');
});

test('clampToStage falls back to the window when the insets leave no room', () => {
  const p = clampToStage({ x: 5, y: 5, cardW: 120, cardH: 80, vw: 300, vh: 200, insets: { left: 200, right: 200 } });
  assert.ok(p.x - 60 >= 0 && p.x + 60 <= 300);
});
