// Live goalie for lessons (A-BACK-049 / first step of A-BACK-051): during
// playback the goalie follows the app's rules at every moment, not only at
// keyframes, moving at a believable speed.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { goalieTrack, goalieTrackAt, ballAt, GOALIE_MOVE } = await import('../web/src/goalie-track.js');
const { buildLesson } = await import('../web/src/goalie-lessons.js');
const { goalieZoneOf } = await import('../web/src/goalie-zones.js');
const { kataOf, kataTargets, judgeKata, expectedAction, shotAngleDeg } = await import('../web/src/kata.js');
const { GOAL_Z } = await import('../web/src/authoring/ball-pose.js');

const total = (frames) => frames.reduce((s, f) => s + f.duration, 0) - frames.at(-1).duration;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function judgeAt(frames, goal, ms, g) {
  const ball = ballAt(frames, ms);
  const goalCenter = { x: 0, z: GOAL_Z[goal] };
  const targets = kataTargets(goalieZoneOf(ball, goal), expectedAction(frames, ms), shotAngleDeg(ball, goal, goalCenter));
  const k = kataOf({ ball, goal, goalCenter, goalie: g });
  return judgeKata(k, targets).status;
}
const allOk = (s) => ['placement', 'depth', 'axis'].every((d) => s[d] === 'ok' || s[d] === 'free');

test('ballAt: the ball at a keyframe is the stored one, and clamps past the end', () => {
  const doc = buildLesson('zones');
  let t = 0;
  for (const f of doc.frames) {
    const b = ballAt(doc.frames, t);
    assert.ok(Math.hypot(b.x - f.scheme.balls.main.x, b.z - f.scheme.balls.main.z) < 1, `at ${t}`);
    t += f.duration;
  }
  const last = doc.frames.at(-1).scheme.balls.main;
  const after = ballAt(doc.frames, 1e9);
  assert.deepEqual([after.x, after.z], [last.x, last.z]);
});

test('goalieTrack: starts at the first frame\'s stored goalie', () => {
  const doc = buildLesson('zones');
  const track = goalieTrack(doc.frames, 'A');
  const g = doc.frames[0].scheme.goalies.A;
  assert.deepEqual(track.samples[0], { x: g.x, z: g.z, yaw: g.angle });
});

test('goalieTrack: never faster than the move and turn limits', () => {
  const doc = buildLesson('zones');
  const { samples, stepMs } = goalieTrack(doc.frames, 'A');
  const maxStep = GOALIE_MOVE.maxMps * stepMs + 1e-6;              // m/s * ms = mm
  const maxTurn = (GOALIE_MOVE.maxTurnDps * Math.PI / 180) * stepMs / 1000 + 1e-9;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    assert.ok(Math.hypot(b.x - a.x, b.z - a.z) <= maxStep, `sample ${i} moves too far`);
    assert.ok(Math.abs(wrap(b.yaw - a.yaw)) <= maxTurn, `sample ${i} turns too far`);
  }
});

test('goalieTrack: covers the whole play', () => {
  const doc = buildLesson('zones');
  const { samples, stepMs } = goalieTrack(doc.frames, 'A');
  assert.ok((samples.length - 1) * stepMs >= total(doc.frames));
});

test('zones lesson with the live goalie: judged ok at least 90% of the time, and at every keyframe', () => {
  const doc = buildLesson('zones');
  const track = goalieTrack(doc.frames, 'A');
  const end = total(doc.frames);
  let ok = 0, n = 0;
  for (let t = 0; t <= end; t += 50, n++) if (allOk(judgeAt(doc.frames, 'A', t, goalieTrackAt(track, t)))) ok++;
  assert.ok(ok / n >= 0.9, `ok ${(100 * ok / n).toFixed(0)}% of the time`);
  let t = 0;
  for (const [i, f] of doc.frames.entries()) {
    assert.ok(allOk(judgeAt(doc.frames, 'A', t, goalieTrackAt(track, t))), `keyframe ${i}`);
    t += f.duration;
  }
});

// Every shipped lesson (A-BACK-049): lessons with a pass or a shot have
// fast ball moments the goalie cannot keep up with (at most 3 m/s), so the
// bar is 85% (an estimate) there; every keyframe is still ok.
test('every lesson with the live goalie: judged ok at least 85% of the time, and at every keyframe', async () => {
  const { LESSON_KEYS, LESSONS } = await import('../web/src/goalie-lessons.js');
  for (const key of LESSON_KEYS) {
    const goal = LESSONS[key].goal;
    const doc = buildLesson(key);
    const track = goalieTrack(doc.frames, goal);
    const end = total(doc.frames);
    let ok = 0, n = 0;
    for (let t = 0; t <= end; t += 50, n++) if (allOk(judgeAt(doc.frames, goal, t, goalieTrackAt(track, t)))) ok++;
    assert.ok(ok / n >= 0.85, `${key}: ok ${(100 * ok / n).toFixed(1)}% of the time`);
    let t = 0;
    for (const [i, f] of doc.frames.entries()) {
      assert.ok(allOk(judgeAt(doc.frames, goal, t, goalieTrackAt(track, t))), `${key} keyframe ${i}`);
      t += f.duration;
    }
  }
});

test('goalieTrackAt: interpolates between samples and clamps at both ends', () => {
  const track = { stepMs: 100, samples: [{ x: 0, z: 0, yaw: 0 }, { x: 100, z: 200, yaw: 0.2 }] };
  assert.deepEqual(goalieTrackAt(track, -50), { x: 0, z: 0, yaw: 0 });
  const mid = goalieTrackAt(track, 50);
  assert.ok(Math.abs(mid.x - 50) < 1e-9 && Math.abs(mid.z - 100) < 1e-9 && Math.abs(mid.yaw - 0.1) < 1e-9);
  assert.deepEqual(goalieTrackAt(track, 500), { x: 100, z: 200, yaw: 0.2 });
});

test('cachedGoalieTrack: same play gives the same track; moving the ball or a duration rebuilds it', async () => {
  const { cachedGoalieTrack } = await import('../web/src/goalie-track.js');
  const doc = buildLesson('zones');
  const a = cachedGoalieTrack(doc.frames, 'A');
  assert.equal(cachedGoalieTrack(doc.frames, 'A'), a);
  assert.deepEqual(a, goalieTrack(doc.frames, 'A'));
  doc.frames[1].scheme.balls.main.x += 500;
  const b = cachedGoalieTrack(doc.frames, 'A');
  assert.notEqual(b, a);
  doc.frames[0].duration += 500;
  assert.notEqual(cachedGoalieTrack(doc.frames, 'A'), b);
});
