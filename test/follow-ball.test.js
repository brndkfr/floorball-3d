// A-BACK-040 step 7: in playback the camera's target follows the ball.
// The target is a pure function of the frames and the playback time (the
// mean ball position over the last FOLLOW_WINDOW_MS), so seekTo() and the
// MP4 export give the same picture as live playback.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ballAtTime, followTargetAt, FOLLOW_WINDOW_MS } from '../web/src/authoring/follow-ball.js';
import { BALL_CARRY_OFFSET } from '../web/src/authoring/ball-pose.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// #7 at z 10 m passes to #9 at z 20 m during a 1 s frame; then 1 s more.
const PLAYERS = { a: { x: 0, z: 10000, team: 1, angle: 0 }, b: { x: 0, z: 20000, team: 1, angle: 0 } };
const frame = (carrier, duration) => ({
  duration,
  scheme: { players: PLAYERS, balls: { main: { carrier, x: 0, z: 0 } }, goalies: {} },
});
const FRAMES = [frame('a', 1000), frame('b', 1000), frame('b', 1000)];

test('ballAtTime follows the carrier, then the pass', () => {
  assert.ok(near(ballAtTime(FRAMES, 0).z, 10000 + BALL_CARRY_OFFSET.z));
  assert.ok(near(ballAtTime(FRAMES, 1500).z, 20000 + BALL_CARRY_OFFSET.z));
  const mid = ballAtTime(FRAMES, 800).z;
  assert.ok(mid > 10250 && mid < 20250, `in flight: ${mid}`);
});

test('ballAtTime past the end holds the last frame; no frames, no ball', () => {
  assert.ok(near(ballAtTime(FRAMES, 99999).z, 20000 + BALL_CARRY_OFFSET.z));
  assert.equal(ballAtTime([], 0), null);
  assert.equal(ballAtTime([{ duration: 1000, scheme: { players: {}, balls: {} } }], 0), null);
});

test('followTargetAt is the ball itself while it stands still', () => {
  const t = followTargetAt(FRAMES, 2500);
  assert.ok(near(t.x, 0) && near(t.z, 20250));
  const start = followTargetAt(FRAMES, 0);   // the window is cut at 0
  assert.ok(near(start.z, 10250));
});

test('followTargetAt trails a moving ball (smooth, never ahead of it)', () => {
  for (const ms of [700, 850, 1000]) {
    const ball = ballAtTime(FRAMES, ms).z;
    const target = followTargetAt(FRAMES, ms).z;
    assert.ok(target <= ball + 1e-6, `at ${ms}: target ${target} ahead of ball ${ball}`);
    assert.ok(target >= ballAtTime(FRAMES, ms - FOLLOW_WINDOW_MS).z - 1e-6);
  }
  // and catches up once the ball stops
  assert.ok(near(followTargetAt(FRAMES, 1000 + FOLLOW_WINDOW_MS + 1).z, 20250));
});

test('followTargetAt is deterministic: the same time gives the same target', () => {
  assert.deepEqual(followTargetAt(FRAMES, 777), followTargetAt(FRAMES, 777));
});
