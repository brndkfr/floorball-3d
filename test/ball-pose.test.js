import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  ballPoseAt, passPlan, nearestReleaseT, passFlightPos,
  BALL_CARRY_OFFSET, PASS_FLIGHT_S, DEFAULT_RELEASE_T, DEFAULT_PASS_SPEED_MPS,
  GOAL_Z, DEFAULT_SHOT_SPEED_MPS, SHOT_REST_DEPTH, makeShot, clampAim, padToAim, aimToPad, shotTargetFrame,
} = await import('../web/src/authoring/ball-pose.js');
const { BALL_RADIUS } = await import('../web/src/constants.js');

// --- shots (A-BACK-022) ---

test('shot constants: goals A/B on their goal lines, 25 m/s default', () => {
  assert.deepEqual(GOAL_Z, { A: 3500, B: 36500 });
  assert.equal(DEFAULT_SHOT_SPEED_MPS, 25);
});

test('makeShot: centre aim by default, rest point behind the goal line', () => {
  const b = makeShot('B');
  assert.deepEqual(b.shot, { goal: 'B', aimX: 0, aimY: 575 });
  assert.deepEqual(b.rest, { x: 0, z: 36500 + SHOT_REST_DEPTH });
  const a = makeShot('A', { aimX: 300, aimY: 900 });
  assert.deepEqual(a.rest, { x: 300, z: 3500 - SHOT_REST_DEPTH });
});

test('clampAim keeps the whole ball inside the 1600 x 1150 mouth', () => {
  assert.deepEqual(clampAim({ aimX: 5000, aimY: -10 }), { aimX: 800 - BALL_RADIUS, aimY: BALL_RADIUS });
  assert.deepEqual(clampAim({ aimX: -5000, aimY: 9999 }), { aimX: -(800 - BALL_RADIUS), aimY: 1150 - BALL_RADIUS });
  assert.deepEqual(clampAim({ aimX: NaN, aimY: undefined }), { aimX: 0, aimY: 575 });
});

test('aim pad is seen from the shooter: left of the pad is the shooter\'s left', () => {
  // Shooting at B the shooter faces +z, so his left is +x; at A he faces -z, left is -x.
  assert.deepEqual(padToAim('B', 0, 0), clampAim({ aimX: 800, aimY: 0 }));
  assert.deepEqual(padToAim('A', 0, 1), clampAim({ aimX: -800, aimY: 1150 }));
  for (const g of ['A', 'B']) {
    const { u, v } = aimToPad(g, 250, 700);
    const back = padToAim(g, u, v);
    assert.ok(close(back.aimX, 250) && close(back.aimY, 700), `${g}: ${JSON.stringify(back)}`);
  }
});

// Built lazily: pl/frame are defined further down and tests run after module load.
const shotFrames = (aim, pass) => {
  const shooter = pl('p9', 1, 0, 30000);
  const { shot, rest } = makeShot('B', aim);
  return [
    frame({ p9: shooter }, { x: -1, z: -1, carrier: 'p9' }),
    frame({ p9: shooter }, { x: rest.x, z: rest.z, carrier: null, shot, ...(pass ? { pass } : {}) }),
  ];
};

test('shot plan: flies at 25 m/s from the release to the aim point on the goal line', () => {
  const [fa, fb] = shotFrames({ aimX: 400, aimY: 800 });
  const plan = passPlan(fa, fb, DUR);
  assert.equal(plan.kind, 'shot');
  assert.equal(plan.goal, 'B');
  assert.ok(near(plan.to, { x: 400, z: 36500 }));
  assert.equal(plan.aimY, 800);
  const dist = Math.hypot(400 - plan.from.x, 36500 - plan.from.z);
  assert.ok(Math.abs((plan.arriveT - plan.releaseT) * DUR - dist / 25) < 1);
  assert.ok(plan.restT > plan.arriveT && plan.restT <= 1);
});

test('shot pose: rises to the aim height at the goal line, then rests on the floor in the goal', () => {
  const [fa, fb] = shotFrames({ aimX: 0, aimY: 800 });
  const plan = passPlan(fa, fb, DUR);
  const atLine = ballPoseAt(fa, fb, plan.arriveT, DUR);
  assert.ok(near(atLine, { x: 0, z: 36500 }));
  assert.ok(close(atLine.y, 800 - BALL_RADIUS, 1));
  const before = ballPoseAt(fa, fb, plan.releaseT, DUR);
  assert.equal(before.y, 0);
  const rest = ballPoseAt(fa, fb, 1, DUR);
  assert.ok(near(rest, { x: 0, z: 36500 + SHOT_REST_DEPTH }));
  assert.equal(rest.y, 0);
});

test('every non-shot pose is on the floor (y = 0)', () => {
  const [fa, fb] = staticPass();
  for (const t of [0, 0.5, 0.7, 1]) assert.equal(ballPoseAt(fa, fb, t, DUR).y, 0);
});

test('shot speed comes from pass.speedMps when set', () => {
  const [fa, fb] = shotFrames(undefined, { speedMps: 10 });
  assert.equal(passPlan(fa, fb, DUR).speedMps, 10);
});

test('shotTargetFrame: shoot in the Choreo draft only when it has no pass yet', () => {
  assert.equal(shotTargetFrame({ choreoActive: true, draftCarrierChanged: false }), 'draft');
  assert.equal(shotTargetFrame({ choreoActive: true, draftCarrierChanged: true }), 'new');
  assert.equal(shotTargetFrame({ choreoActive: false, draftCarrierChanged: false }), 'new');
});

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const near = (p, q, eps = 1) => Math.abs(p.x - q.x) <= eps && Math.abs(p.z - q.z) <= eps;
const OFF = BALL_CARRY_OFFSET;
const withOff = (p) => ({ x: p.x + OFF.x, z: p.z + OFF.z });
const frame = (players, ball) => ({ players, balls: ball ? { main: ball } : {} });
const pl = (id, team, x, z) => ({ id, team, number: id, x, z });
const DUR = 1000;

// #7 static at z=10000 passes to #9 static 5000 mm further: 5 m at 15 m/s = 333 ms.
const passer = pl('p7', 1, 0, 10000), receiver = pl('p9', 1, 0, 15000);
const staticPass = (pass) => [
  frame({ p7: passer, p9: receiver }, { x: -1, z: -1, carrier: 'p7' }),
  frame({ p7: passer, p9: receiver }, { x: -1, z: -1, carrier: 'p9', ...(pass ? { pass } : {}) }),
];

test('defaults are the agreed ones', () => {
  assert.equal(DEFAULT_RELEASE_T, 0.5);
  assert.equal(DEFAULT_PASS_SPEED_MPS, 15);
});

test('no ball -> null; loose in both frames -> lerp of stored positions', () => {
  assert.equal(ballPoseAt(frame({}, null), frame({}, null), 0.5, DUR), null);
  const p = ballPoseAt(frame({}, { x: 0, z: 0, carrier: null }), frame({}, { x: 1000, z: 2000, carrier: null }), 0.25, DUR);
  assert.ok(near(p, { x: 250, z: 500 }));
});

test('same carrier in both frames -> ball follows the carrier along its path', () => {
  const fa = frame({ p7: pl('p7', 1, 0, 10000) }, { x: -1, z: -1, carrier: 'p7' });
  const fb = frame({ p7: pl('p7', 1, 2000, 14000) }, { x: -1, z: -1, carrier: 'p7' });
  assert.ok(near(ballPoseAt(fa, fb, 0.5, DUR), withOff({ x: 1000, z: 12000 })));
  assert.equal(passPlan(fa, fb, DUR), null);
});

test('pass: stays with passer until release, flies at pass speed, then stays with receiver', () => {
  const [fa, fb] = staticPass();
  const plan = passPlan(fa, fb, DUR);
  assert.equal(plan.passerId, 'p7');
  assert.equal(plan.receiverId, 'p9');
  assert.ok(close(plan.releaseT, 0.5));
  assert.ok(Math.abs(plan.arriveT - (0.5 + 5000 / 15 / DUR)) < 1e-3, `arriveT ${plan.arriveT}`);
  assert.equal(plan.late, false);
  assert.ok(near(ballPoseAt(fa, fb, 0.25, DUR), withOff(passer)));
  assert.ok(near(ballPoseAt(fa, fb, 0.5, DUR), withOff(passer)));
  const mid = (plan.releaseT + plan.arriveT) / 2;
  assert.ok(near(ballPoseAt(fa, fb, mid, DUR), withOff({ x: 0, z: 12500 })));
  assert.ok(near(ballPoseAt(fa, fb, 0.95, DUR), withOff(receiver)));
});

test('lead pass: aims where a running receiver will be at arrival', () => {
  const fa = frame({ p7: passer, p9: pl('p9', 1, 0, 15000) }, { x: -1, z: -1, carrier: 'p7' });
  const fb = frame({ p7: passer, p9: pl('p9', 1, 4000, 15000) }, { x: -1, z: -1, carrier: 'p9' });
  const plan = passPlan(fa, fb, DUR);
  const receiverAtArrival = withOff({ x: 4000 * plan.arriveT, z: 15000 });
  assert.ok(near(plan.to, receiverAtArrival, 2), JSON.stringify(plan.to));
  const flightMs = Math.hypot(plan.to.x - plan.from.x, plan.to.z - plan.from.z) / DEFAULT_PASS_SPEED_MPS;
  assert.ok(Math.abs((plan.arriveT - plan.releaseT) * DUR - flightMs) < 2);
});

test('a pass too long for the frame arrives at the frame end and is flagged late', () => {
  const fa = frame({ p7: passer, p9: pl('p9', 1, 0, 30000) }, { x: -1, z: -1, carrier: 'p7' });
  const fb = frame({ p7: passer, p9: pl('p9', 1, 0, 30000) }, { x: -1, z: -1, carrier: 'p9' });
  const plan = passPlan(fa, fb, DUR);
  assert.equal(plan.late, true);
  assert.equal(plan.arriveT, 1);
  assert.ok(Math.abs(plan.needMs - 20000 / 15) < 1, `needMs ${plan.needMs}`);
  assert.ok(near(ballPoseAt(fa, fb, 1, DUR), withOff({ x: 0, z: 30000 })));
});

test('stored releaseT / speedMps are used and clamped', () => {
  let plan = passPlan(...staticPass({ releaseT: 0.2, speedMps: 25 }), DUR);
  assert.ok(close(plan.releaseT, 0.2));
  assert.ok(Math.abs(plan.arriveT - (0.2 + 5000 / 25 / DUR)) < 1e-3);
  plan = passPlan(...staticPass({ releaseT: 7, speedMps: 999 }), DUR);
  assert.equal(plan.releaseT, 1);
  assert.equal(plan.speedMps, 40);
  plan = passPlan(...staticPass({ releaseT: -3, speedMps: 0 }), DUR);
  assert.equal(plan.releaseT, 0);
  assert.equal(plan.speedMps, 3);
});

test('loose ball picked up: rolls from the stored spot starting at 0%', () => {
  const fa = frame({ p9: receiver }, { x: 0, z: 12000, carrier: null });
  const fb = frame({ p9: receiver }, { x: 0, z: 12000, carrier: 'p9' });
  const plan = passPlan(fa, fb, DUR);
  assert.equal(plan.releaseT, 0);
  assert.equal(plan.passerId, null);
  assert.ok(near(plan.from, { x: 0, z: 12000 }));
});

test('lane check: a static opponent on the line blocks it, teammates and far opponents do not', () => {
  const [fa, fb] = staticPass();
  const onLine = pl('d4', 2, 100, 12600);
  const offLine = pl('d5', 2, 1500, 12600);
  const mate = pl('m3', 1, 0, 12500);
  for (const f of [fa, fb]) Object.assign(f.players, { d4: onLine, d5: offLine, m3: mate });
  assert.deepEqual(passPlan(fa, fb, DUR).blockedBy, ['d4']);
});

test('lane check is time-aware: an opponent who has left the lane before the ball arrives does not block', () => {
  const [fa, fb] = staticPass();
  fa.players.d4 = pl('d4', 2, 0, 12500);      // on the lane at t=0 ...
  fb.players.d4 = pl('d4', 2, 6000, 12500);   // ... and far away by the time the ball flies
  assert.deepEqual(passPlan(fa, fb, DUR).blockedBy, []);
});

test('nearestReleaseT: projects a floor point onto the passer run', () => {
  const fa = frame({ p7: pl('p7', 1, 0, 10000), p9: receiver }, { x: -1, z: -1, carrier: 'p7' });
  const fb = frame({ p7: pl('p7', 1, 0, 14000), p9: receiver }, { x: -1, z: -1, carrier: 'p9' });
  assert.ok(Math.abs(nearestReleaseT(fa, fb, 'p7', { x: 300, z: 11200 }) - 0.3) < 0.02);
  assert.equal(nearestReleaseT(fa, fb, 'p7', { x: 0, z: 0 }), 0);
  assert.equal(nearestReleaseT(fa, fb, 'p7', { x: 0, z: 99999 }), 1);
});

test('passFlightPos: starts at from, ends at to, eases, and reports done', () => {
  const from = { x: 0, z: 0 }, to = { x: 1000, z: 0 };
  assert.deepEqual(passFlightPos(from, to, 0).pos, { x: 0, z: 0 });
  const mid = passFlightPos(from, to, PASS_FLIGHT_S / 2);
  assert.ok(mid.pos.x > 500 && mid.pos.x < 1000, `ease-out: ${mid.pos.x}`);
  assert.equal(mid.done, false);
  assert.deepEqual(passFlightPos(from, to, PASS_FLIGHT_S * 2), { pos: { x: 1000, z: 0 }, done: true });
});
