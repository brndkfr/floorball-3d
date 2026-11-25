// Ball trail (A-BACK-049): the recent positions of a ball in flight after a shot.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { trailPoints, TRAIL } = await import('../web/src/ball-trail.js');
const { buildLesson } = await import('../web/src/goalie-lessons.js');

const fr = buildLesson('line').frames;

test('trail: empty before the release and in a frame without a shot', () => {
  assert.deepEqual(trailPoints(fr, 0), []);
  assert.deepEqual(trailPoints(fr, 100), [], 'the shot is released at 0.15 of the frame');
  assert.deepEqual(trailPoints(fr, 6000), [], 'the build-up has no shot');
  assert.deepEqual(trailPoints([], 0), []);
});

test('trail: in flight it runs back from the ball, newest first, never before the release', () => {
  const t = trailPoints(fr, 1500);
  assert.ok(t.length >= 2);
  assert.equal(t[0].age, 0);
  assert.ok(t.every((p, i) => i === 0 || p.age > t[i - 1].age));
  assert.ok(t.at(-1).age <= TRAIL.lengthMs);
  assert.ok(t.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z) && p.y > 0));
  const early = trailPoints(fr, 0.15 * fr[0].duration + 60);
  assert.ok(early.length >= 1 && early.length <= 2, 'only the few ms since the release');
});

test('trail: the points trail behind the flight (further from the goal than the ball)', () => {
  const t = trailPoints(fr, 2000);
  for (let i = 1; i < t.length; i++) assert.ok(t[i].z > t[i - 1].z, 'goal A is at low z, the ball flies towards it');
});

test('trail: the saved shot of the second half gives one too, and none once it rests', () => {
  const start = fr.slice(0, 6).reduce((s, f) => s + f.duration, 0);
  assert.ok(trailPoints(fr, start + 1000).length >= 2);
  assert.deepEqual(trailPoints(fr, start + fr[6].duration + 100), []);
});

// At 720p the ball is a few pixels: the trail is long (most of a second of a
// slow shot) and the view draws it with thick spheres.
test('trail: long enough to follow a slow shot, with enough points for a smooth line', () => {
  assert.ok(TRAIL.lengthMs >= 700, `${TRAIL.lengthMs} ms`);
  const t = trailPoints(fr, 1800);
  assert.ok(t.length >= 10, `${t.length} points in the middle of the flight`);
  assert.ok(t.at(-1).age >= 600);
});
