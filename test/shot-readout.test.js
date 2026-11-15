// A-BACK-045 step 4: one readout for the Inspector's verdict card and the
// verdict chip on the rink: which goal, the shooting-line verdict and the
// % of the goal mouth blocked. Both come from the goalie's proxy
// (A-BACK-042), so the verdict and the coverage agree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

const { shotReadout } = await import('../web/src/shot-readout.js');
const { GOAL_LINE_FROM_BOARD, RINK_L, BALL_RADIUS } = await import('../web/src/constants.js');

// Goals as layers.js places them; a goalie with a simple box proxy, 600 mm
// wide and 1000 mm tall, half a metre in front of the goal line.
function scene() {
  const goalA = new THREE.Group();
  goalA.position.set(0, 0, GOAL_LINE_FROM_BOARD);
  goalA.rotation.y = Math.PI;
  const goalB = new THREE.Group();
  goalB.position.set(0, 0, RINK_L - GOAL_LINE_FROM_BOARD);
  const goalie = (z, rotY) => {
    const g = new THREE.Group();
    g.position.set(0, 0, z);
    g.rotation.y = rotY;
    g.userData.proxy = [{ type: 'box', min: { x: -300, y: 0, z: -200 }, max: { x: 300, y: 1000, z: 200 } }];
    return g;
  };
  const goalieA = goalie(GOAL_LINE_FROM_BOARD + 500, 0);
  const goalieB = goalie(RINK_L - GOAL_LINE_FROM_BOARD - 500, Math.PI);
  for (const o of [goalA, goalB, goalieA, goalieB]) o.updateMatrixWorld(true);
  return { goalA, goalB, goalieA, goalieB };
}
const ball = (x, z) => new THREE.Vector3(x, BALL_RADIUS, z);
const move = (g, x) => { g.position.x = x; g.updateMatrixWorld(true); };

test('a goalie on the line, squared up: blocked-centred, part of the mouth covered', () => {
  const s = scene();
  const r = shotReadout({ ballWorld: ball(0, GOAL_LINE_FROM_BOARD + 6000), goal: s.goalA, goalie: s.goalieA });
  assert.equal(r.goal, 'A');
  assert.equal(r.key, 'blocked-centred');
  assert.ok(r.pctBlocked > 10 && r.pctBlocked < 90, `pct ${r.pctBlocked}`);
});

test('a goalie in the way but off the line: blocked-off; out of the way: open', () => {
  const s = scene();
  const b = ball(0, GOAL_LINE_FROM_BOARD + 6000);
  move(s.goalieA, 250);   // box still covers x = 0, 250 mm off the line
  assert.equal(shotReadout({ ballWorld: b, goal: s.goalA, goalie: s.goalieA }).key, 'blocked-off');
  move(s.goalieA, 1500);
  const open = shotReadout({ ballWorld: b, goal: s.goalA, goalie: s.goalieA });
  assert.equal(open.key, 'open');
  assert.ok(open.pctBlocked < 1, `pct ${open.pctBlocked}`);
});

test('goal B works the same way round (turned goalie)', () => {
  const s = scene();
  const r = shotReadout({ ballWorld: ball(0, RINK_L - GOAL_LINE_FROM_BOARD - 6000), goal: s.goalB, goalie: s.goalieB });
  assert.equal(r.goal, 'B');
  assert.equal(r.key, 'blocked-centred');
  const a = shotReadout({ ballWorld: ball(0, GOAL_LINE_FROM_BOARD + 6000), goal: s.goalA, goalie: s.goalieA });
  assert.ok(Math.abs(r.pctBlocked - a.pctBlocked) < 0.5, `B ${r.pctBlocked} vs A ${a.pctBlocked}`);
});

test('a hidden or missing goalie leaves the shot open', () => {
  const s = scene();
  s.goalieA.visible = false;
  const b = ball(0, GOAL_LINE_FROM_BOARD + 6000);
  assert.deepEqual(
    { key: shotReadout({ ballWorld: b, goal: s.goalA, goalie: s.goalieA }).key, pct: shotReadout({ ballWorld: b, goal: s.goalA, goalie: s.goalieA }).pctBlocked },
    { key: 'open', pct: 0 },
  );
  assert.equal(shotReadout({ ballWorld: b, goal: s.goalA, goalie: null }).key, 'open');
});
