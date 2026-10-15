// A-BACK-031: 3D player figures (display-only). Pure math for placing the
// figure on its chip, plus the generator's kit mask that decides which
// vertices of the Quaternius body become shirt / shorts.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  figureModelScale,
  figureShouldShow,
  figureSpriteLift,
  FIGURE_MODEL_HEIGHT_M,
  FIGURE_LABEL_HEIGHT_MM,
} = await import('../web/src/authoring/figure-math.js');
const { kitWeights, KIT_LANDMARKS } = await import('../generators/player-figure-kit.mjs');

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('figureModelScale undoes the chip display scale (metres -> mm)', () => {
  // The chip group is scaled by CHIP_DISPLAY_SCALE (5x). A child figure must
  // end up 1000x in world space, so locally 1000 / 5 = 200 - not 1000,
  // which would make a 1.81 m body 9 m tall.
  assert.equal(figureModelScale(5), 200);
  assert.equal(figureModelScale(1), 1000);
  for (const s of [1, 2.5, 5, 8]) {
    assert.ok(close(figureModelScale(s) * s, 1000));
  }
});

test('figure world height is the model height in mm, independent of display scale', () => {
  for (const s of [1, 5]) {
    const worldMm = FIGURE_MODEL_HEIGHT_M * figureModelScale(s) * s;
    assert.ok(close(worldMm, FIGURE_MODEL_HEIGHT_M * 1000));
  }
  assert.ok(FIGURE_MODEL_HEIGHT_M > 1.5 && FIGURE_MODEL_HEIGHT_M < 2.0);
});

test('figureShouldShow: only when enabled and not in top-down', () => {
  assert.equal(figureShouldShow({ enabled: true, topDown: false }), true);
  assert.equal(figureShouldShow({ enabled: true, topDown: true }), false);
  assert.equal(figureShouldShow({ enabled: false, topDown: false }), false);
  assert.equal(figureShouldShow({ enabled: false, topDown: true }), false);
});

test('figureSpriteLift puts the number above the head, in chip-local units', () => {
  const lift = figureSpriteLift(5);
  // local lift * display scale = world mm; must clear the head
  assert.ok(lift * 5 >= FIGURE_MODEL_HEIGHT_M * 1000, `lift ${lift * 5} mm is below the head`);
  assert.ok(close(lift * 5, FIGURE_LABEL_HEIGHT_MM));
  assert.equal(figureSpriteLift(5, false), 0);
});

// Bind-pose (T-pose) points on the Superhero male body, metres, +Y up,
// +Z = facing, +X = the figure's left. Joints from the glTF's skin.
const P = KIT_LANDMARKS;

test('kitWeights: chest, belly and back are shirt', () => {
  assert.deepEqual(kitWeights(0, 1.35, 0.12), [1, 0]);   // chest
  assert.deepEqual(kitWeights(0, 1.10, 0.10), [1, 0]);   // belly
  assert.deepEqual(kitWeights(0, 1.30, -0.12), [1, 0]);  // back
});

test('kitWeights: upper arm is a short sleeve, forearm and hand are skin', () => {
  const midUpper = (P.shoulderX + P.elbowX) / 2;
  assert.deepEqual(kitWeights(midUpper - 0.04, P.shoulderY, 0), [1, 0]);
  assert.deepEqual(kitWeights(-(midUpper - 0.04), P.shoulderY, 0), [1, 0]);
  assert.deepEqual(kitWeights(0.55, P.shoulderY, 0), [0, 0]);   // forearm
  assert.deepEqual(kitWeights(-0.75, P.shoulderY, 0), [0, 0]);  // hand
});

test('kitWeights: hips and upper thighs are shorts, knees and below are skin', () => {
  assert.deepEqual(kitWeights(0, 0.90, 0.10), [0, 1]);        // crotch front
  assert.deepEqual(kitWeights(0.11, 0.75, 0.05), [0, 1]);     // upper thigh
  assert.deepEqual(kitWeights(0.11, P.kneeY, 0.05), [0, 0]);  // knee
  assert.deepEqual(kitWeights(0.11, 0.20, 0.05), [0, 0]);     // shin
});

test('kitWeights: shoulder tops are shirt (neckline is round, not a straight cut)', () => {
  assert.deepEqual(kitWeights(0.15, P.neckY + 0.02, 0), [1, 0]);
  assert.deepEqual(kitWeights(-0.15, P.neckY + 0.02, 0), [1, 0]);
});

test('kitWeights: head and neck stay skin', () => {
  assert.deepEqual(kitWeights(0, 1.70, 0.08), [0, 0]);
  assert.deepEqual(kitWeights(0, P.neckY + 0.02, 0.05), [0, 0]);
});

test('kitWeights never marks a vertex as both shirt and shorts', () => {
  for (let y = 0; y <= 1.85; y += 0.01) {
    for (let x = -0.95; x <= 0.95; x += 0.05) {
      const [shirt, shorts] = kitWeights(x, y, 0);
      assert.ok(!(shirt && shorts), `both at x=${x} y=${y}`);
    }
  }
});
