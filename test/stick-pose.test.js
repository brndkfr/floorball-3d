// A-BACK-034: stick in the figures' hands. Pure placement + two-bone IK
// math (three-free), applied by figures.js after the gait clips pose the
// skeleton. Units: mm, figure-local frame (+Z forward, +Y up, +X the
// figure's left - three.js's right-handed frame with the figure facing +Z).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STICK_HAND_DEFAULT, stickHand, stickPlacement, gripPoints, twoBoneElbow,
  STICK_LIE_DEG, STICK_LENGTH_MM, STICK_AXIS_FLOOR_X, setHandInFrames, HAND_SPACING_MM, bottomGripWithin, MIN_HAND_SPACING_MM,
} from '../web/src/authoring/stick-pose.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const near = (a, b, eps = 1e-6) => dist(a, b) <= eps;

test('players are left-handed unless their chip says otherwise', () => {
  assert.equal(STICK_HAND_DEFAULT, 'L');
  assert.equal(stickHand({}), 'L');
  assert.equal(stickHand({ hand: 'R' }), 'R');
  assert.equal(stickHand({ hand: 'x' }), 'L');
  assert.equal(stickHand(null), 'L');
});

test('stick constants match generate_stick.py', () => {
  assert.equal(STICK_LIE_DEG, 60);
  assert.equal(STICK_LENGTH_MM, 920);
  // FLOOR_POINT x = R sin(HEEL_ANGLE) with R = 270, HEEL_ANGLE = 0.30
  assert.ok(Math.abs(STICK_AXIS_FLOOR_X - 270 * Math.sin(0.30)) < 1e-9);
});

test('the blade sits on the floor in front of the figure, on the stick side', () => {
  for (const hand of ['L', 'R']) {
    const p = stickPlacement(hand);
    assert.equal(p.position.y, 0, 'blade contact point on the floor');
    assert.ok(p.position.z > 200, `blade in front: z ${p.position.z}`);
    const side = hand === 'L' ? 1 : -1; // +X is the figure's left
    assert.ok(p.position.x * side > 0, `${hand}: blade on the ${hand === 'L' ? 'left' : 'right'}`);
  }
});

test('left and right placements mirror each other', () => {
  const l = stickPlacement('L'), r = stickPlacement('R');
  assert.ok(Math.abs(l.position.x + r.position.x) < 1e-9);
  assert.equal(l.position.z, r.position.z);
  const gl = gripPoints('L'), gr = gripPoints('R');
  for (const k of ['top', 'bottom']) {
    assert.ok(Math.abs(gl[k].x + gr[k].x) < 1e-9 && Math.abs(gl[k].y - gr[k].y) < 1e-9 && Math.abs(gl[k].z - gr[k].z) < 1e-9, k);
  }
  // The generated stick is a left stick; a right-handed player gets it mirrored.
  assert.equal(l.mirror, false);
  assert.equal(r.mirror, true);
});

test('grip points lie on the shaft: top hand at the knob end, bottom hand lower', () => {
  for (const hand of ['L', 'R']) {
    const { top, bottom, topHand, bottomHand } = gripPoints(hand);
    const rise = HAND_SPACING_MM * Math.sin(STICK_LIE_DEG * Math.PI / 180);
    assert.ok(Math.abs(top.y - bottom.y - rise) < 1e-9, 'grips one hand spacing apart along the shaft');
    assert.ok(top.y < 1100 && bottom.y > 300, `grip heights plausible: ${top.y}, ${bottom.y}`);
    // Both grips on one straight line through the blade's axis-floor point.
    const p = stickPlacement(hand);
    const a = { x: top.x - bottom.x, y: top.y - bottom.y, z: top.z - bottom.z };
    const lie = Math.atan2(a.y, Math.hypot(a.x, a.z)) * 180 / Math.PI;
    assert.ok(Math.abs(lie - STICK_LIE_DEG) < 1e-6, `shaft lie ${lie}`);
    assert.ok(dist(top, p.position) < STICK_LENGTH_MM + STICK_AXIS_FLOOR_X);
    // Left-handed: blade on the left, left hand low, right hand on top.
    assert.equal(bottomHand, hand === 'L' ? 'l' : 'r');
    assert.equal(topHand, hand === 'L' ? 'r' : 'l');
  }
});

test('twoBoneElbow: reachable target keeps both bone lengths', () => {
  const shoulder = { x: 0, y: 1400, z: 0 };
  const target = { x: 100, y: 1100, z: 200 }; // 374 mm away, arm reaches 494
  const elbow = twoBoneElbow(shoulder, target, 250, 244, { x: 0, y: -1, z: -1 });
  assert.ok(Math.abs(dist(shoulder, elbow) - 250) < 1e-6);
  assert.ok(Math.abs(dist(elbow, target) - 244) < 1e-6);
});

test('twoBoneElbow: the elbow bends toward the pole', () => {
  const shoulder = { x: 0, y: 0, z: 0 };
  const target = { x: 0, y: 0, z: 400 };
  const down = twoBoneElbow(shoulder, target, 250, 250, { x: 0, y: -1, z: 0 });
  const out = twoBoneElbow(shoulder, target, 250, 250, { x: 1, y: 0, z: 0 });
  assert.ok(down.y < -1 && Math.abs(down.x) < 1e-6);
  assert.ok(out.x > 1 && Math.abs(out.y) < 1e-6);
});

test('twoBoneElbow: an out-of-reach target straightens the arm toward it', () => {
  const shoulder = { x: 0, y: 0, z: 0 };
  const elbow = twoBoneElbow(shoulder, { x: 0, y: 0, z: 2000 }, 250, 244, { x: 0, y: -1, z: 0 });
  assert.ok(near(elbow, { x: 0, y: 0, z: 250 }));
});

test('twoBoneElbow: a target at the shoulder does not produce NaN', () => {
  const s = { x: 1, y: 2, z: 3 };
  const e = twoBoneElbow(s, s, 250, 244, { x: 0, y: -1, z: 0 });
  assert.ok([e.x, e.y, e.z].every(Number.isFinite));
});

// Handedness is a property of the player, but players are stored per frame:
// setting it on one frame only would flip the stick mid-play.
test('setHandInFrames sets the hand on every frame that has the player', () => {
  const frames = [
    { scheme: { players: { p_1: { id: 'p_1' }, p_2: { id: 'p_2' } } } },
    { scheme: { players: { p_1: { id: 'p_1' } } } },
    { scheme: { players: {} } },
  ];
  assert.equal(setHandInFrames(frames, 'p_1', 'R'), true);
  assert.equal(frames[0].scheme.players.p_1.hand, 'R');
  assert.equal(frames[1].scheme.players.p_1.hand, 'R');
  assert.equal(frames[0].scheme.players.p_2.hand, undefined);
  assert.equal(setHandInFrames(frames, 'p_1', 'R'), false, 'no change');
  // The default is not stored, so existing docs stay byte-identical.
  assert.equal(setHandInFrames(frames, 'p_1', 'L'), true);
  assert.ok(!('hand' in frames[0].scheme.players.p_1) && !('hand' in frames[1].scheme.players.p_1));
  assert.equal(setHandInFrames(frames, 'p_1', 'x'), false, 'invalid hand ignored');
});

// When the body can't reach the planned bottom grip (the clips are
// asymmetric), the bottom hand slides up the shaft like a real player's,
// but never closer than MIN_HAND_SPACING_MM to the top hand.
test('bottomGripWithin keeps the planned grip when it is in reach', () => {
  const { bottom } = gripPoints('L');
  const shoulder = { x: bottom.x, y: bottom.y + 300, z: bottom.z };
  const g = bottomGripWithin('L', shoulder, 494);
  assert.ok(dist(g, bottom) < 1e-6);
});

test('bottomGripWithin slides up the shaft to the lowest reachable point', () => {
  const { top, bottom } = gripPoints('R');
  // Shoulder straight above the top grip: the planned bottom is out of reach.
  const shoulder = { x: top.x, y: top.y + 380, z: top.z };
  const reach = 494;
  assert.ok(dist(shoulder, bottom) > reach);
  const g = bottomGripWithin('R', shoulder, reach);
  assert.ok(Math.abs(dist(shoulder, g) - reach) < 1, `on the reach sphere: ${dist(shoulder, g)}`);
  assert.ok(g.y > bottom.y && g.y < top.y, 'between the planned grips');
});

test('bottomGripWithin stops MIN_HAND_SPACING_MM below the top grip', () => {
  const { top } = gripPoints('L');
  const g = bottomGripWithin('L', { x: top.x, y: top.y + 5000, z: top.z }, 494);
  const along = dist(top, g);
  assert.ok(Math.abs(along - MIN_HAND_SPACING_MM) < 1e-6, `spacing ${along}`);
});
