// A-BACK-042 step 2: coverage through the kneeling proxy stays within 5
// points of the mesh baseline (test-e2e/goalie-coverage-baseline.json) at
// each of its 12 ball positions. Same grid and ray setup as insights.js
// coverageGrid, written out three-free: goal A at z = GOAL_LINE_FROM_BOARD,
// turned 180 deg; goalie at GOAL_LINE_FROM_BOARD + 500, unturned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { rayHitsProxy } = await import('../web/src/goalie-proxy-math.js');
const { DETAILED_GOALIE_PROXY } = await import('../web/src/goalie-proxy-shapes.js');
const { GOAL_LINE_FROM_BOARD, BALL_RADIUS } = await import('../web/src/constants.js');

const baseline = JSON.parse(readFileSync(new URL('../test-e2e/goalie-coverage-baseline.json', import.meta.url), 'utf8'));
const COLS = 16, ROWS = 12, CW = 1600 / COLS, CH = 1150 / ROWS;
const GOALIE_Z = GOAL_LINE_FROM_BOARD + 500;

function proxyCoverage(ballX, ballDz) {
  // goalie-local: subtract the goalie's position (no rotation at goal A)
  const o = { x: ballX, y: BALL_RADIUS, z: GOAL_LINE_FROM_BOARD + ballDz - GOALIE_Z };
  const blocked = [];
  for (let r = 0; r <= ROWS; r++) {
    for (let c = 0; c <= COLS; c++) {
      const g = { x: 800 - c * CW, y: r * CH, z: GOAL_LINE_FROM_BOARD - GOALIE_Z };
      const d = { x: g.x - o.x, y: g.y - o.y, z: g.z - o.z };
      const dist = Math.hypot(d.x, d.y, d.z);
      blocked.push(rayHitsProxy(o, { x: d.x / dist, y: d.y / dist, z: d.z / dist }, dist - 1, DETAILED_GOALIE_PROXY) ? 1 : 0);
    }
  }
  let area = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = r * (COLS + 1) + c;
      area += (blocked[v] + blocked[v + 1] + blocked[v + COLS + 1] + blocked[v + COLS + 2]) / 4;
    }
  }
  return (area / (COLS * ROWS)) * 100;
}

test('the kneeling proxy covers the goal within 5 points of the mesh at every baseline position', () => {
  assert.equal(baseline.positions.length, 12);
  for (const p of baseline.positions) {
    const pct = proxyCoverage(p.x, p.dz);
    assert.ok(Math.abs(pct - p.pct) <= 5, `${p.name}: proxy ${pct.toFixed(2)} vs mesh ${p.pct}`);
  }
});

test('the proxy is made of valid shapes', () => {
  assert.ok(DETAILED_GOALIE_PROXY.length >= 3);
  for (const s of DETAILED_GOALIE_PROXY) {
    if (s.type === 'capsule') assert.ok(s.r > 0, s.name);
    else {
      assert.equal(s.type, 'box', s.name);
      for (const k of ['x', 'y', 'z']) assert.ok(s.min[k] < s.max[k], `${s.name} ${k}`);
    }
  }
  assert.ok(Object.isFrozen(DETAILED_GOALIE_PROXY));
});
