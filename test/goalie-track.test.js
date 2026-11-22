// Live goalie for lessons (A-BACK-049 / first step of A-BACK-051): during
// playback the goalie follows the app's rules at every moment, not only at
// keyframes, moving at a believable speed.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { goalieTrack, goalieTrackAt, ballAt, GOALIE_MOVE, FIXED_LEAD_MS } = await import('../web/src/goalie-track.js');
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
    // a KATA build-up (frames with a partial `goalie` hint) is wrong on purpose until its last step
    const buildUp = LESSONS[key].frames.findLastIndex((f) => f.goalie && f.goalie.length < 3) + 1;
    const from = doc.frames.slice(0, buildUp).reduce((s, f) => s + f.duration, 0);
    let ok = 0, n = 0;
    for (let t = from; t <= end; t += 50, n++) if (allOk(judgeAt(doc.frames, goal, t, goalieTrackAt(track, t)))) ok++;
    assert.ok(ok / n >= 0.85, `${key}: ok ${(100 * ok / n).toFixed(1)}% of the time`);
    let t = from;
    for (const [i, f] of doc.frames.entries()) {
      if (i >= buildUp) assert.ok(allOk(judgeAt(doc.frames, goal, t, goalieTrackAt(track, t))), `${key} keyframe ${i}`);
      if (i >= buildUp) t += f.duration;
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

// A frame with `goalieFixed` carries a goalie pose that is part of the
// lesson (the KATA build-up): the track goes to that pose, not to the rules'.
test('goalieTrack: a frame marked goalieFixed is followed instead of the rules', () => {
  const doc = buildLesson('line');
  const track = goalieTrack(doc.frames, 'A');
  const pose = (f) => { const g = f.scheme.goalies.A; return { x: g.x, z: g.z, yaw: g.angle }; };
  const near = (a, b, msg) => assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 5 && Math.abs(wrap(a.yaw - b.yaw)) < 0.01, `${msg}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
  // A fixed pose belongs to its frame's caption: reached by the keyframe and
  // held through the frame; the move to the next one starts FIXED_LEAD_MS
  // before the next keyframe (decided 2026-11-22: "What went wrong?" stays
  // wrong while it is on screen).
  let acc = 0;
  for (let k = 1; k < doc.frames.length; k++) {
    acc += doc.frames[k - 1].duration;
    if (!doc.frames[k].goalieFixed) continue;
    near(goalieTrackAt(track, acc), pose(doc.frames[k]), `keyframe ${k}`);
    if (k + 1 < doc.frames.length) near(goalieTrackAt(track, acc + doc.frames[k].duration - FIXED_LEAD_MS - 40), pose(doc.frames[k]), `frame ${k} held`);
  }
  const wrong = doc.frames.findIndex((f) => f.scheme.balls.main.shot && !f.scheme.balls.main.shot.saved);
  const wStart = doc.frames.slice(0, wrong).reduce((s, f) => s + f.duration, 0);
  near(goalieTrackAt(track, wStart + doc.frames[wrong].duration / 2), pose(doc.frames[wrong]), 'still off the line in the middle of "What went wrong?"');
  // and the rules would have put the goalie square and forward already at the start
  assert.notDeepEqual(pose(doc.frames[0]), pose(doc.frames[2]));
  // without the mark the same frames get the rules' pose
  const plain = doc.frames.map((f) => { const c = structuredClone(f); delete c.goalieFixed; return c; });
  const ruled = goalieTrack(plain, 'A');
  const g = goalieTrackAt(ruled, 2400);
  assert.ok(Math.abs(wrap(g.yaw - pose(doc.frames[1]).yaw)) > 0.1 || Math.hypot(g.x - pose(doc.frames[1]).x, g.z - pose(doc.frames[1]).z) > 5);
});

test('goalieTrack: frames without goalieFixed follow the rules exactly as before', () => {
  const doc = buildLesson('zones');
  const a = goalieTrack(doc.frames, 'A');
  const b = goalieTrack(doc.frames.map((f) => ({ ...f })), 'A');
  assert.deepEqual(a.samples, b.samples);
  assert.ok(doc.frames.every((f) => !('goalieFixed' in f)));
});
