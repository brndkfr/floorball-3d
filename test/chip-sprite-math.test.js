// S-BACK-030 step 8: chip number / label sprites keep a readable on-screen
// size in the 3D view, neither ballooning next to the camera nor shrinking
// to a dot across the rink. Pure math (three-free); chips.js applies it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spriteScaleFor, spritePx, SPRITE_PX } from '../web/src/authoring/chip-sprite-math.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const VIEW = { fovDeg: 45, viewportH: 900 };
const WORLD_MM = 385;   // 110 mm chip-local x 3.5 display scale

test('spritePx: on-screen height of a world size at a distance', () => {
  // focal = 450 / tan(22.5 deg) = 1086.4 px
  assert.ok(near(spritePx(WORLD_MM, 10000, VIEW), 385 * 1086.396 / 10000, 1e-2));
  assert.ok(spritePx(WORLD_MM, 5000, VIEW) > spritePx(WORLD_MM, 10000, VIEW));
});

test('spriteScaleFor leaves a sprite alone while its size is in range', () => {
  // ~42 px at 10 m would be too big; ~28 px at 15 m is inside
  const d = 15000;
  const px = spritePx(WORLD_MM, d, VIEW);
  assert.ok(px > SPRITE_PX.min && px < SPRITE_PX.max, `px ${px}`);
  assert.equal(spriteScaleFor(WORLD_MM, d, VIEW), 1);
});

test('spriteScaleFor shrinks a sprite next to the camera to the max size', () => {
  const k = spriteScaleFor(WORLD_MM, 1500, VIEW);
  assert.ok(k < 1);
  assert.ok(near(spritePx(WORLD_MM * k, 1500, VIEW), SPRITE_PX.max, 1e-9));
});

test('spriteScaleFor grows a sprite across the rink to the min size', () => {
  const k = spriteScaleFor(WORLD_MM, 45000, VIEW);
  assert.ok(k > 1);
  assert.ok(near(spritePx(WORLD_MM * k, 45000, VIEW), SPRITE_PX.min, 1e-9));
});

test('spriteScaleFor works in pixels: a taller window gives the same on-screen clamp', () => {
  const tall = { fovDeg: 45, viewportH: 1800 };
  const k = spriteScaleFor(WORLD_MM, 1500, tall);
  assert.ok(near(spritePx(WORLD_MM * k, 1500, tall), SPRITE_PX.max, 1e-9));
});

test('spriteScaleFor is a no-op for a sprite at or behind the camera', () => {
  assert.equal(spriteScaleFor(WORLD_MM, 0, VIEW), 1);
  assert.equal(spriteScaleFor(WORLD_MM, -200, VIEW), 1);
  assert.equal(spriteScaleFor(WORLD_MM, NaN, VIEW), 1);
});

test('the on-screen range keeps the number legible and smaller than a close-up figure', () => {
  assert.ok(SPRITE_PX.min >= 16);
  assert.ok(SPRITE_PX.max <= 48 && SPRITE_PX.max > SPRITE_PX.min);
});
