// A-BACK-040 step 4: camera presets for the 3D view. Pure table (three-free):
// each preset is a camera pose { x, y, z, yaw, pitch } in the project's
// convention (yaw 0 looks along +Z, pitch < 0 looks down); ui/camera-menu.js
// blends the camera there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRESETS, presetPose, presetForKey, lerpPose, easeInOut,
} from '../web/src/camera-presets.js';
import { rigToCamera } from '../web/src/orbit-math.js';
import { RINK_L, HALF_W, GOAL_LINE_FROM_BOARD } from '../web/src/constants.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const FIT = { tx: 0, tz: RINK_L / 2, yaw: -Math.PI / 2, pitch: -0.7, dist: 42000 };
const CTX = { fit: FIT, chip: null };

// Angle (rad) between the pose's look direction and the direction to p.
function offAxis(pose, p) {
  const f = { x: Math.sin(pose.yaw) * Math.cos(pose.pitch), y: Math.sin(pose.pitch), z: Math.cos(pose.yaw) * Math.cos(pose.pitch) };
  const d = { x: p.x - pose.x, y: p.y - pose.y, z: p.z - pose.z };
  const len = Math.hypot(d.x, d.y, d.z);
  return Math.acos((f.x * d.x + f.y * d.y + f.z * d.z) / len);
}
const MOUTH_A = { x: 0, y: 575, z: GOAL_LINE_FROM_BOARD };
const MOUTH_B = { x: 0, y: 575, z: RINK_L - GOAL_LINE_FROM_BOARD };
const CENTRE = { x: 0, y: 0, z: RINK_L / 2 };

test('the menu offers six presets with Shift+1..6, Stand first', () => {
  assert.deepEqual(PRESETS.map((p) => p.id), ['stand', 'goal-a', 'goal-b', 'corner', 'bench', 'player']);
  PRESETS.forEach((p, i) => assert.equal(p.key, String(i + 1)));
  for (const p of PRESETS) assert.ok(p.label.length > 0);
});

test('presetForKey reads Shift + the digit key (code, not the shifted character)', () => {
  assert.equal(presetForKey({ shiftKey: true, code: 'Digit2' }), 'goal-a');
  assert.equal(presetForKey({ shiftKey: true, code: 'Numpad6' }), 'player');
  assert.equal(presetForKey({ shiftKey: false, code: 'Digit2' }), null);   // 1..4 are playback speeds
  assert.equal(presetForKey({ shiftKey: true, ctrlKey: true, code: 'Digit2' }), null);
  assert.equal(presetForKey({ shiftKey: true, code: 'Digit7' }), null);
});

test('Stand is the fitted default view', () => {
  const pose = presetPose('stand', CTX);
  const cam = rigToCamera(FIT);
  for (const k of ['x', 'y', 'z', 'yaw', 'pitch']) assert.ok(near(pose[k], cam[k]), k);
});

test('Behind goal A: outside the end board, above the goal, looking at the goal mouth', () => {
  const pose = presetPose('goal-a', CTX);
  assert.ok(pose.z < 0, 'behind the board');
  assert.ok(pose.y > 1150 + 1000, 'well above the crossbar');
  assert.ok(Math.abs(pose.x) < 1);
  assert.ok(offAxis(pose, MOUTH_A) < 0.45, 'goal mouth near the middle of the view');
  assert.ok(offAxis(pose, CENTRE) < 0.6, 'and the play in front of it');
});

test('Behind goal B mirrors goal A', () => {
  const a = presetPose('goal-a', CTX), b = presetPose('goal-b', CTX);
  assert.ok(b.z > RINK_L);
  assert.ok(near(b.z, RINK_L - a.z) && near(b.y, a.y) && near(b.pitch, a.pitch));
  assert.ok(offAxis(b, MOUTH_B) < 0.45);
});

test('Corner: outside both boards, high, looking into the rink', () => {
  const pose = presetPose('corner', CTX);
  assert.ok(Math.abs(pose.x) > HALF_W && pose.z < 0);
  assert.ok(pose.y > 4000);
  assert.ok(offAxis(pose, { x: 0, y: 0, z: RINK_L * 0.4 }) < 0.3);
});

test('Bench side: across the rink from the Stand side, low, looking at the centre', () => {
  const stand = presetPose('stand', CTX), bench = presetPose('bench', CTX);
  assert.ok(Math.abs(bench.x) > HALF_W);
  assert.ok(Math.sign(bench.x) !== Math.sign(stand.x), 'the other long side');
  assert.ok(bench.y < stand.y);
  assert.ok(offAxis(bench, CENTRE) < 0.05);
});

test('Player eye: at the selected chip, eye height, looking where it faces', () => {
  assert.equal(presetPose('player', CTX), null);   // nothing selected
  const pose = presetPose('player', { ...CTX, chip: { x: 2000, z: 15000, angle: Math.PI / 2 } });
  assert.ok(Math.hypot(pose.x - 2000, pose.z - 15000) < 300);
  assert.ok(pose.y > 1400 && pose.y < 1900);
  assert.ok(near(pose.yaw, Math.PI / 2));
  assert.ok(pose.pitch < 0 && pose.pitch > -0.3, 'a little down, not at the feet');
});

test('every preset looks down and stays inside setCameraLook\'s pitch clamp', () => {
  const ctx = { ...CTX, chip: { x: 0, z: 10000, angle: 0 } };
  for (const p of PRESETS) {
    const pose = presetPose(p.id, ctx);
    assert.ok(pose.pitch < 0 && pose.pitch > -1.4, p.id);
  }
  assert.equal(presetPose('nope', CTX), null);
});

test('lerpPose blends position and angles, yaw the short way round', () => {
  const a = { x: 0, y: 1000, z: 0, yaw: 3.0, pitch: -0.2 };
  const b = { x: 1000, y: 3000, z: 2000, yaw: -3.0, pitch: -0.6 };
  assert.deepEqual(lerpPose(a, b, 0), a);
  const end = lerpPose(a, b, 1);
  assert.ok(near(end.x, 1000) && near(end.y, 3000) && near(Math.cos(end.yaw), Math.cos(-3.0)) && near(end.pitch, -0.6));
  const mid = lerpPose(a, b, 0.5);
  assert.ok(near(mid.x, 500) && near(mid.pitch, -0.4));
  assert.ok(Math.abs(Math.cos(mid.yaw) - Math.cos(Math.PI)) < 1e-6, 'through PI, not through 0');
});

test('easeInOut runs 0 to 1, symmetric', () => {
  assert.equal(easeInOut(0), 0);
  assert.equal(easeInOut(1), 1);
  assert.ok(near(easeInOut(0.5), 0.5));
  assert.ok(easeInOut(0.25) < 0.25 && easeInOut(0.75) > 0.75);
  assert.equal(easeInOut(-1), 0);
  assert.equal(easeInOut(2), 1);
});

// A-BACK-054 layout A: Train frames the defending goal end from high up in
// the rink, looking back at the goal, so the goalie is seen from the front
// and the ball sits between the camera and the goal (the shooter's side).
test('trainPose: high in the rink in front of the defending goal, looking down at it; mirrored for B', async () => {
  const { trainPose } = await import('../web/src/camera-presets.js');
  const a = trainPose('A');
  assert.ok(a.z > GOAL_LINE_FROM_BOARD + 8000 && a.z < RINK_L / 2, `in front of goal A (${a.z})`);
  assert.ok(a.y > 6000, 'high up');
  assert.ok(a.pitch < -0.5 && a.pitch > -1.2, `looks down (${a.pitch})`);
  assert.ok(near(Math.abs(a.yaw), Math.PI), 'faces -z, toward goal A');
  assert.ok(near(a.x, 0));
  const b = trainPose('B');
  assert.ok(near(b.z, RINK_L - a.z) && near(b.y, a.y) && near(b.pitch, a.pitch));
  assert.ok(near(b.yaw, 0), 'faces +z, toward goal B');
});

// Focus goalie (KATA marks): close in front of the defending goalie, looking
// back at it and the goal, so the target band and rays read.
test('trainFocusPose: a few metres in front of the goalie, low, looking at goalie and goal; mirrored for B', async () => {
  const { trainFocusPose } = await import('../web/src/camera-presets.js');
  const gA = { x: 600, z: GOAL_LINE_FROM_BOARD + 1000 };
  const a = trainFocusPose('A', gA);
  assert.ok(a.z > gA.z + 3000 && a.z < gA.z + 9000, `in front of the goalie (${a.z})`);
  assert.ok(a.y > 2500 && a.y < 6500, `low-ish (${a.y})`);
  assert.ok(near(Math.abs(a.yaw), Math.PI, 0.25), `faces -z (${a.yaw})`);
  assert.ok(a.pitch < -0.35 && a.pitch > -1.0, `looks down (${a.pitch})`);
  assert.ok(a.x > 0 && a.x <= gA.x, 'leans toward the goalie side');
  const b = trainFocusPose('B', { x: 600, z: RINK_L - gA.z });
  assert.ok(near(b.z, RINK_L - a.z) && near(b.y, a.y) && near(b.pitch, a.pitch) && near(b.x, a.x));
  assert.ok(near(Math.abs(b.yaw), Math.abs(Math.PI - Math.abs(a.yaw)), 1e-9));
});

// Lessons (A-BACK-049): the whole attack must stay in view, from the
// attention zone (26.6 m out) to behind the goal, along the wide stage, so
// the camera stands high over the side board of the defending half and
// looks straight across it. Goal B is goal A turned half round the centre.
test('lessonPose: high over the side board, looking across the defending half; turned half round for B', async () => {
  const { lessonPose } = await import('../web/src/camera-presets.js');
  const a = lessonPose('A');
  assert.ok(a.x > HALF_W, `outside the side board (${a.x})`);
  assert.ok(a.z > GOAL_LINE_FROM_BOARD + 5000 && a.z < RINK_L / 2, `level with the defending half of A (${a.z})`);
  assert.ok(a.y > 8000, `high up (${a.y})`);
  assert.ok(a.pitch < -0.4 && a.pitch > -1.0, `looks down (${a.pitch})`);
  assert.ok(near(a.yaw, -Math.PI / 2), `faces -x, across the rink (${a.yaw})`);
  const b = lessonPose('B');
  assert.ok(near(b.x, -a.x) && near(b.z, RINK_L - a.z) && near(b.y, a.y) && near(b.pitch, a.pitch));
  assert.ok(near(b.yaw, Math.PI / 2), 'faces +x');
});
