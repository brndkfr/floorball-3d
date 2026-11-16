// A-BACK-048: the goalie zone model on the floor. Borders are estimates read
// off the J+S / swiss unihockey module's diagram (depth measured from the
// end board of the defending goal): passing-first < 4 m, slot a trapezoid
// 3.8 to 10.9 m deep, half-width 2.4 m widening to 3.75 m, danger < 16 m,
// attention 16 to 26.6 m, awareness beyond. Mirrored for goal B.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { GOALIE_ZONE_ORDER, GOALIE_ZONE_BOUNDS, goalieZoneOf, depthFromEnd, slotHalfWidthAt, defendingGoal, zonePolygons } = await import('../web/src/goalie-zones.js');
const { RINK_L, HALF_W } = await import('../web/src/constants.js');

test('the five floor zones, drawn back to front', () => {
  assert.deepEqual(GOALIE_ZONE_ORDER, ['awareness', 'attention', 'danger', 'passing', 'slot']);
  assert.deepEqual(GOALIE_ZONE_BOUNDS, {
    passingDepth: 4000, dangerDepth: 16000, attentionDepth: 26600,
    slot: { near: 3800, far: 10900, halfNear: 2400, halfFar: 3750 },
  });
  assert.ok(Object.isFrozen(GOALIE_ZONE_BOUNDS) && Object.isFrozen(GOALIE_ZONE_BOUNDS.slot));
});

test("Plan's choice is stored as 1 / 0 per browser, off unless it says 1", async () => {
  const { GOALIE_ZONES_STORAGE_KEY, parseGoalieZonesShown } = await import('../web/src/goalie-zones.js');
  assert.equal(GOALIE_ZONES_STORAGE_KEY, 'floorball3d.goalieZones');
  assert.equal(parseGoalieZonesShown('1'), true);
  for (const v of ['0', null, undefined, '', 'true']) assert.equal(parseGoalieZonesShown(v), false, String(v));
});

test('depth is measured from the defending goal\'s end board', () => {
  assert.equal(depthFromEnd(3000, 'A'), 3000);
  assert.equal(depthFromEnd(RINK_L - 3000, 'B'), 3000);
});

test('the slot widens linearly from the near to the far edge', () => {
  assert.equal(slotHalfWidthAt(3800), 2400);
  assert.equal(slotHalfWidthAt(10900), 3750);
  assert.equal(slotHalfWidthAt((3800 + 10900) / 2), (2400 + 3750) / 2);
});

const SAMPLES_A = [
  [{ x: 0, z: 2000 }, 'passing'],       // behind the goal
  [{ x: 8000, z: 3000 }, 'passing'],    // beside the goal, near the corner
  [{ x: 0, z: 5000 }, 'slot'],
  [{ x: 2300, z: 3900 }, 'slot'],       // near edge, inside
  [{ x: 2500, z: 3900 }, 'passing'],    // near edge, just outside, still < 4 m
  [{ x: 2500, z: 4100 }, 'danger'],     // just outside the slot past 4 m
  [{ x: 3700, z: 10800 }, 'slot'],      // far edge, inside
  [{ x: 3800, z: 10800 }, 'danger'],    // far edge, just outside
  [{ x: 0, z: 11000 }, 'danger'],       // past the slot
  [{ x: 9000, z: 15000 }, 'danger'],
  [{ x: 0, z: 16000 }, 'attention'],    // a border belongs to the zone further out
  [{ x: -6000, z: 20000 }, 'attention'],
  [{ x: 0, z: 26600 }, 'awareness'],
  [{ x: 0, z: 35000 }, 'awareness'],
];

test('zone of sample points, goal A', () => {
  for (const [p, want] of SAMPLES_A) assert.equal(goalieZoneOf(p, 'A'), want, JSON.stringify(p));
});

test('goal B is the mirror of goal A, and both sides of the rink match', () => {
  for (const [p, want] of SAMPLES_A) {
    assert.equal(goalieZoneOf({ x: p.x, z: RINK_L - p.z }, 'B'), want, `B ${JSON.stringify(p)}`);
    assert.equal(goalieZoneOf({ x: -p.x, z: p.z }, 'A'), want, `-x ${JSON.stringify(p)}`);
  }
});

test('the defending goal is the one nearer the ball', () => {
  assert.equal(defendingGoal({ x: 0, z: 9000 }), 'A');
  assert.equal(defendingGoal({ x: 0, z: RINK_L - 9000 }), 'B');
});

// Even-odd point in polygon on [x, z] pairs.
function inside([px, pz], poly) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}

test('zonePolygons: one per zone, inside the rink, and they agree with goalieZoneOf', () => {
  for (const goal of ['A', 'B']) {
    const polys = zonePolygons(goal);
    assert.deepEqual(polys.map((p) => p.key), GOALIE_ZONE_ORDER);
    for (const { outer } of polys) {
      for (const [x, z] of outer) {
        assert.ok(x >= -HALF_W && x <= HALF_W, `x ${x}`);
        assert.ok(z >= 0 && z <= RINK_L, `z ${z}`);
      }
    }
    // Sample a grid; each point's zone is the front-most polygon that holds it
    // (the slot is drawn over danger and passing).
    for (let x = -HALF_W + 250; x < HALF_W; x += 500) {
      for (let z = 250; z < RINK_L; z += 500) {
        const front = [...polys].reverse().find((p) => inside([x, z], p.outer) && !(p.holes || []).some((h) => inside([x, z], h)));
        assert.ok(front, `no polygon at ${x},${z} (${goal})`);
        assert.equal(front.key, goalieZoneOf({ x, z }, goal), `${x},${z} (${goal})`);
      }
    }
  }
});
