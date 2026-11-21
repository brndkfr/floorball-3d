// A-BACK-049: pause on captions. Playback holds at the start of a frame
// that has a note for a reading time, then moves on. Pure stepping logic in
// caption-hold.js so it is testable without rAF.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { captionHoldMs, captionHolds, stepWithHolds, HOLD_MIN_MS, HOLD_MAX_MS } =
  await import('../web/src/authoring/caption-hold.js');

test('captionHoldMs: no text no hold; longer text holds longer, within bounds', () => {
  assert.equal(captionHoldMs(''), 0);
  assert.equal(captionHoldMs(undefined), 0);
  assert.equal(captionHoldMs('Shot'), HOLD_MIN_MS);
  const mid = captionHoldMs('x'.repeat(80));
  assert.ok(mid > HOLD_MIN_MS && mid < HOLD_MAX_MS, String(mid));
  assert.ok(captionHoldMs('x'.repeat(120)) > mid);
  assert.equal(captionHoldMs('x'.repeat(280)), HOLD_MAX_MS);
});

const frames = [
  { duration: 1000, note: { en: 'Start here', de: 'Hier beginnen' } },
  { duration: 1000 },
  { duration: 1000, note: 'Own words' },
  { duration: 1000 },
];

test('captionHolds: one hold per noted frame at its start time, in the app language', () => {
  const holds = captionHolds(frames, 'de');
  assert.deepEqual(holds.map((h) => h.at), [0, 2000]);
  assert.equal(holds[0].ms, captionHoldMs('Hier beginnen'));
  assert.equal(holds[1].ms, captionHoldMs('Own words'));
  assert.deepEqual(captionHolds([], 'en'), []);
  assert.deepEqual(captionHolds([{ duration: 1000 }, { duration: 1000 }], 'en'), []);
});

const holds = [{ at: 0, ms: 2000 }, { at: 2000, ms: 2000 }];
const start = { elapsed: 0, holdLeft: 0, heldAt: -1 };

test('stepWithHolds: holds at a noted frame start before moving on', () => {
  let s = stepWithHolds(start, 500, 1, holds);
  assert.equal(s.elapsed, 0, 'held at frame 0');
  assert.equal(s.holdLeft, 1500);
  s = stepWithHolds(s, 1500, 1, holds);
  assert.equal(s.elapsed, 0);
  assert.equal(s.holdLeft, 0);
  s = stepWithHolds(s, 500, 1, holds);
  assert.equal(s.elapsed, 500, 'the same hold does not fire twice');
});

test('stepWithHolds: a step that crosses a hold stops on it and keeps the rest for the hold', () => {
  const s = stepWithHolds({ elapsed: 1800, holdLeft: 0, heldAt: 0 }, 500, 1, holds);
  assert.equal(s.elapsed, 2000);
  assert.equal(s.heldAt, 2000);
  assert.equal(s.holdLeft, 2000 - 300, 'the 300 ms past the frame start count as hold time');
});

test('stepWithHolds: speed scales play time, not reading time', () => {
  let s = stepWithHolds(start, 1000, 0.25, holds);
  assert.equal(s.elapsed, 0);
  assert.equal(s.holdLeft, 1000, 'hold counts wall time');
  s = stepWithHolds(s, 2000, 0.25, holds);
  assert.equal(s.holdLeft, 0);
  assert.equal(s.elapsed, 250, 'leftover 1000 ms wall at 0.25x is 250 ms of play');
});

test('stepWithHolds: no holds means plain play', () => {
  assert.deepEqual(stepWithHolds(start, 700, 2, []), { elapsed: 1400, holdLeft: 0, heldAt: -1 });
});
