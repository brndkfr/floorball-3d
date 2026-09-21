import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  shotLineXAtZ,
  shotVerdict,
  coverageGrid,
  passOptions,
  GOALIE_CENTERED_THRESHOLD,
} from '../web/src/insights.js';

// --- shotLineXAtZ ---------------------------------------------------------

test('shotLineXAtZ interpolates linearly between ball and goal', () => {
  const ball = new THREE.Vector3(0, 900, 0);
  const goal = new THREE.Vector3(1000, 900, 10000);
  assert.equal(shotLineXAtZ(ball, goal, 0), 0);
  assert.equal(shotLineXAtZ(ball, goal, 10000), 1000);
  assert.equal(shotLineXAtZ(ball, goal, 5000), 500);
});

test('shotLineXAtZ falls back to ball.x when ball and goal share a Z', () => {
  const ball = new THREE.Vector3(200, 900, 5000);
  const goal = new THREE.Vector3(800, 900, 5000);
  assert.equal(shotLineXAtZ(ball, goal, 5000), 200);
});

// --- shotVerdict -----------------------------------------------------------

function goalieBox({ x, z, halfW = 400, halfH = 900 }) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2, halfH * 2, 300));
  mesh.position.set(x, halfH, z);
  mesh.updateMatrixWorld(true);
  return mesh;
}

test('shotVerdict: square-on shot with no goalie is open and on-target', () => {
  const ball = new THREE.Vector3(0, 900, 0);
  const goal = new THREE.Vector3(0, 900, 10000);
  const v = shotVerdict({ ballWorld: ball, goalCenterWorld: goal, goalieMesh: null });
  assert.equal(v.lineColor, 'open');
  assert.equal(v.onTarget, 'on');
  assert.ok(v.angleDeg < 1);
  assert.ok(Math.abs(v.distance - 10000) < 1);
});

test('shotVerdict: goalie centred on the shot line blocks it as blocked-centred', () => {
  const ball = new THREE.Vector3(0, 900, 0);
  const goal = new THREE.Vector3(0, 900, 10000);
  const goalie = goalieBox({ x: 0, z: 9000 });
  const v = shotVerdict({ ballWorld: ball, goalCenterWorld: goal, goalieMesh: goalie });
  assert.equal(v.lineColor, 'blocked-centred');
});

test('shotVerdict: goalie offset beyond the centred threshold blocks as blocked-off', () => {
  const ball = new THREE.Vector3(0, 900, 0);
  const goal = new THREE.Vector3(0, 900, 10000);
  // offset well past GOALIE_CENTERED_THRESHOLD (200mm), box still wide
  // enough that the shot-line ray (at x=0) still clips it
  const goalie = goalieBox({ x: GOALIE_CENTERED_THRESHOLD + 100, z: 9000, halfW: 400 });
  const v = shotVerdict({ ballWorld: ball, goalCenterWorld: goal, goalieMesh: goalie });
  assert.equal(v.lineColor, 'blocked-off');
});

test('shotVerdict: goalie not intersecting the ray leaves the shot open', () => {
  const ball = new THREE.Vector3(0, 900, 0);
  const goal = new THREE.Vector3(0, 900, 10000);
  const goalie = goalieBox({ x: 5000, z: 9000 }); // far off to the side
  const v = shotVerdict({ ballWorld: ball, goalCenterWorld: goal, goalieMesh: goalie });
  assert.equal(v.lineColor, 'open');
});

test('shotVerdict: an invisible goalie mesh is ignored', () => {
  const ball = new THREE.Vector3(0, 900, 0);
  const goal = new THREE.Vector3(0, 900, 10000);
  const goalie = goalieBox({ x: 0, z: 9000 });
  goalie.visible = false;
  const v = shotVerdict({ ballWorld: ball, goalCenterWorld: goal, goalieMesh: goalie });
  assert.equal(v.lineColor, 'open');
});

test('shotVerdict: a sharp-angle shot reads as near-miss, then off', () => {
  const goal = new THREE.Vector3(0, 900, 10000);
  const nearMiss = shotVerdict({ ballWorld: new THREE.Vector3(9000, 900, 4800), goalCenterWorld: goal, goalieMesh: null });
  assert.equal(nearMiss.onTarget, 'near-miss');
  const off = shotVerdict({ ballWorld: new THREE.Vector3(9000, 900, 9900), goalCenterWorld: goal, goalieMesh: null });
  assert.equal(off.onTarget, 'off');
});

// --- coverageGrid ------------------------------------------------------

test('coverageGrid: no goalie leaves the whole grid open', () => {
  const targetGoalGroup = new THREE.Group();
  targetGoalGroup.position.set(0, 0, 10000);
  targetGoalGroup.updateMatrixWorld(true);
  const ballWorld = new THREE.Vector3(0, 900, 0);
  const { pctBlocked, quadrants } = coverageGrid({ ballWorld, targetGoalGroup, goalieMesh: null });
  assert.equal(pctBlocked, 0);
  for (const k of Object.keys(quadrants)) assert.equal(quadrants[k], 0);
});

test('coverageGrid: a goalie spanning the whole mouth blocks nearly all of it', () => {
  const targetGoalGroup = new THREE.Group();
  targetGoalGroup.position.set(0, 0, 10000);
  targetGoalGroup.updateMatrixWorld(true);
  const ballWorld = new THREE.Vector3(0, 575, 0);
  // oversized box right in front of the goal mouth, covers the full fan of
  // rays from ballWorld to every grid vertex
  const goalie = goalieBox({ x: 0, z: 9500, halfW: 2000, halfH: 2000 });
  const { pctBlocked } = coverageGrid({ ballWorld, targetGoalGroup, goalieMesh: goalie });
  assert.ok(pctBlocked > 95, `expected near-full coverage, got ${pctBlocked}`);
});

// --- passOptions -----------------------------------------------------------

test('passOptions: a lane with no defender in it is clear', () => {
  const players = [
    { id: 'carrier', team: 'home', world: [0, 0, 0] },
    { id: 'mate', team: 'home', world: [1000, 0, 0] },
    { id: 'defender', team: 'away', world: [5000, 0, 5000] }, // nowhere near the lane
  ];
  const opts = passOptions({ ballCarrierId: 'carrier', players, carrierTeam: 'home', goalies: {} });
  assert.equal(opts.length, 1);
  assert.equal(opts[0].toPlayerId, 'mate');
  assert.equal(opts[0].clear, true);
  assert.equal(opts[0].defendersInLane.length, 0);
});

test('passOptions: a defender standing in the corridor blocks the lane', () => {
  const players = [
    { id: 'carrier', team: 'home', world: [0, 0, 0] },
    { id: 'mate', team: 'home', world: [1000, 0, 0] },
    { id: 'defender', team: 'away', world: [500, 0, 0] }, // dead center of the lane
  ];
  const opts = passOptions({ ballCarrierId: 'carrier', players, carrierTeam: 'home', goalies: {} });
  assert.equal(opts[0].clear, false);
  assert.deepEqual(opts[0].defendersInLane, ['defender']);
});

test('passOptions: goalies are excluded from both receivers and defenders', () => {
  const players = [
    { id: 'carrier', team: 'home', world: [0, 0, 0] },
    { id: 'ownGoalie', team: 'home', world: [1000, 0, 0] },
    { id: 'oppGoalie', team: 'away', world: [500, 0, 0] },
  ];
  const opts = passOptions({
    ballCarrierId: 'carrier', players, carrierTeam: 'home',
    goalies: { home: 'ownGoalie', away: 'oppGoalie' },
  });
  assert.equal(opts.length, 0); // ownGoalie excluded as a receiver, oppGoalie excluded as a defender
});
