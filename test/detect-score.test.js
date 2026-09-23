import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreGoalCandidate,
  SOLID_RED_REJECT,
  IDEAL_ASPECT,
  isRedHsv,
  redHueRanges,
  workingScale,
  MAX_UPSCALE,
} from '../web/src/authoring/photo-overlay/detect-score.js';

test('solid-red candidate above SOLID_RED_REJECT is rejected (score = 0)', () => {
  // aspect and area are ideal, but the interior is nearly all red - it's
  // a spectator-chair band / solid sponsor banner, not a goal frame.
  const s = scoreGoalCandidate({ area: 10_000, aspect: IDEAL_ASPECT, interiorRedFraction: 0.9 });
  assert.equal(s, 0);
});

test('hollow candidate at ideal aspect wins over solid one with the same area + aspect', () => {
  const hollow = scoreGoalCandidate({ area: 10_000, aspect: IDEAL_ASPECT, interiorRedFraction: 0.25 });
  const solid = scoreGoalCandidate({ area: 10_000, aspect: IDEAL_ASPECT, interiorRedFraction: 0.7 });
  assert.ok(hollow > solid, `hollow ${hollow} should beat semi-solid ${solid}`);
  assert.ok(solid > 0, 'a semi-solid candidate below the reject threshold should still get a score');
});

test('at the reject edge (SOLID_RED_REJECT), the hollow bonus is at its minimum (0.5x)', () => {
  const atEdge = scoreGoalCandidate({ area: 1000, aspect: IDEAL_ASPECT, interiorRedFraction: SOLID_RED_REJECT });
  const fullyHollow = scoreGoalCandidate({ area: 1000, aspect: IDEAL_ASPECT, interiorRedFraction: 0.1 });
  // fullyHollow gets multiplier 1.0, atEdge gets 0.5 -> ratio is 2.
  assert.ok(Math.abs(atEdge / fullyHollow - 0.5) < 1e-9, `expected 0.5x at reject edge, got ${atEdge / fullyHollow}`);
});

test('aspect penalty still applies: a hollow but too-wide candidate loses to a mildly less hollow but ideal-aspect one', () => {
  // A very wide hollow blob (aspect 3) vs a mildly hollow ideal-aspect blob:
  // the ideal-aspect one should win despite being less hollow.
  const wideHollow = scoreGoalCandidate({ area: 10_000, aspect: 3.0, interiorRedFraction: 0.15 });
  const idealSemiHollow = scoreGoalCandidate({ area: 10_000, aspect: IDEAL_ASPECT, interiorRedFraction: 0.55 });
  assert.ok(idealSemiHollow > wideHollow, `ideal-aspect ${idealSemiHollow} should beat wide-hollow ${wideHollow}`);
});

test('degenerate inputs return 0', () => {
  assert.equal(scoreGoalCandidate({ area: 0, aspect: IDEAL_ASPECT, interiorRedFraction: 0.2 }), 0);
  assert.equal(scoreGoalCandidate({ area: 100, aspect: 0, interiorRedFraction: 0.2 }), 0);
  assert.equal(scoreGoalCandidate({ area: -1, aspect: IDEAL_ASPECT, interiorRedFraction: 0.2 }), 0);
});

test('bigger area beats smaller area at the same aspect and hollowness', () => {
  const big = scoreGoalCandidate({ area: 20_000, aspect: IDEAL_ASPECT, interiorRedFraction: 0.3 });
  const small = scoreGoalCandidate({ area: 5_000, aspect: IDEAL_ASPECT, interiorRedFraction: 0.3 });
  assert.ok(big > small);
});

// HSV samples (OpenCV 0-180 hue scale) read off a real broadcast frame: a
// thin red goal post over the blue floor blends toward magenta.
const THIN_POST_PX = [[155, 153, 110], [159, 114, 146], [161, 107, 172], [157, 102, 172], [161, 112, 168]];
const BLUE_FLOOR_PX = [[108, 213, 141], [113, 175, 131], [120, 108, 130]];

test('isRedHsv: thin magenta-shifted goal post counts as red inside a user ROI', () => {
  for (const [h, s, v] of THIN_POST_PX) assert.ok(isRedHsv(h, s, v, { scoped: true }), `${h}/${s}/${v}`);
});

test('isRedHsv: whole-image search keeps the strict red band (no magenta)', () => {
  assert.equal(isRedHsv(155, 153, 110, { scoped: false }), false);
  assert.ok(isRedHsv(5, 200, 200, { scoped: false }));
  assert.ok(isRedHsv(170, 200, 200, { scoped: false }));
});

test('isRedHsv: blue floor is never red', () => {
  for (const [h, s, v] of BLUE_FLOOR_PX) {
    assert.equal(isRedHsv(h, s, v, { scoped: true }), false);
    assert.equal(isRedHsv(h, s, v, { scoped: false }), false);
  }
});

test('redHueRanges: scoped ranges are a superset of the whole-image ranges', () => {
  const strict = redHueRanges({ scoped: false });
  const scoped = redHueRanges({ scoped: true });
  for (const [lo, hi] of strict) {
    assert.ok(scoped.some(([l, h]) => l <= lo && h >= hi), `strict ${lo}-${hi} not covered`);
  }
});

test('workingScale: whole image is only ever downscaled', () => {
  assert.equal(workingScale(4000, 3000), 1024 / 4000);
  assert.equal(workingScale(800, 600), 1);
});

test('workingScale: a small ROI crop is upscaled so thin posts survive morphology', () => {
  assert.equal(workingScale(256, 200, { allowUpscale: true }), 4);
  assert.equal(workingScale(512, 300, { allowUpscale: true }), 2);
  // capped - a tiny crop is not blown up into a blurry mess
  assert.equal(workingScale(50, 40, { allowUpscale: true }), MAX_UPSCALE);
  // big crops still downscale
  assert.equal(workingScale(2048, 1000, { allowUpscale: true }), 0.5);
});
