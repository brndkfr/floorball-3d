import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreGoalCandidate,
  SOLID_RED_REJECT,
  IDEAL_ASPECT,
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
