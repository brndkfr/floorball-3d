// Goalie lessons (A-BACK-049): shipped plays built in code. The goalie in
// every frame must stand where the app's own rules say (the KATA card would
// read all ok at each keyframe), so a lesson never teaches something the
// Train readout then marks as wrong.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { LESSONS, LESSON_KEYS, buildLesson } = await import('../web/src/goalie-lessons.js');
const { acceptDoc } = await import('../web/src/authoring/doc.js');
const { goalieZoneOf } = await import('../web/src/goalie-zones.js');
const { kataOf, kataTargets, judgeKata, expectedAction, shotAngleDeg } = await import('../web/src/kata.js');
const { GOAL_Z, BALL_CARRY_OFFSET } = await import('../web/src/authoring/ball-pose.js');
const { HALF_W, RINK_L } = await import('../web/src/constants.js');

const startMs = (frames, i) => frames.slice(0, i).reduce((s, f) => s + f.duration, 0);

test('zones lesson: listed, and survives a JSON round-trip through acceptDoc with its notes', () => {
  assert.ok(LESSON_KEYS.includes('zones'));
  const doc = acceptDoc(JSON.parse(JSON.stringify(buildLesson('zones'))));
  assert.ok(doc);
  assert.equal(doc.frames.length, LESSONS.zones.frames.length);
  assert.equal(doc.currentFrame, 0);
  for (const f of doc.frames) {
    assert.ok(f.note?.en && f.note?.de, 'every frame has an en and a de caption');
  }
});

test('zones lesson: the ball goes attention -> danger -> danger -> passing-first -> passing-first at goal A', () => {
  const doc = buildLesson('zones');
  const zones = doc.frames.map((f) => goalieZoneOf(f.scheme.balls.main, 'A'));
  assert.deepEqual(zones, ['attention', 'danger', 'danger', 'passing', 'passing']);
});

test('zones lesson: one attacker carries the ball in every frame, the ball at the carrier\'s stick', () => {
  const doc = buildLesson('zones');
  for (const f of doc.frames) {
    const players = Object.values(f.scheme.players);
    assert.equal(players.length, 1);
    const p = players[0];
    const ball = f.scheme.balls.main;
    assert.equal(ball.carrier, p.id);
    assert.equal(ball.x, p.x + BALL_CARRY_OFFSET.x);
    assert.equal(ball.z, p.z + BALL_CARRY_OFFSET.z);
    assert.ok(Math.abs(p.x) < HALF_W - 500 && p.z > 500 && p.z < RINK_L - 500, `inside the boards: ${p.x}, ${p.z}`);
  }
});

test('zones lesson: the carrier moves at a believable speed (at most 7 m/s, an estimate)', () => {
  const doc = buildLesson('zones');
  for (let i = 0; i + 1 < doc.frames.length; i++) {
    const a = doc.frames[i].scheme.balls.main, b = doc.frames[i + 1].scheme.balls.main;
    const mps = Math.hypot(b.x - a.x, b.z - a.z) / doc.frames[i].duration;   // mm / ms = m/s
    assert.ok(mps <= 7, `frame ${i}: ${mps.toFixed(1)} m/s`);
  }
});

test('lessons: the goalie at every keyframe is judged ok on placement, depth and axis', () => {
  for (const key of LESSON_KEYS) {
    const doc = buildLesson(key);
    const goal = LESSONS[key].goal;
    const goalCenter = { x: 0, z: GOAL_Z[goal] };
    doc.frames.forEach((f, i) => {
      const ball = f.scheme.balls.main;
      const g = f.scheme.goalies[goal];
      assert.ok(g, `${key} frame ${i}: goalie ${goal} placed`);
      const zone = goalieZoneOf(ball, goal);
      const action = expectedAction(doc.frames, startMs(doc.frames, i));
      const k = kataOf({ ball, goal, goalCenter, goalie: { x: g.x, z: g.z, yaw: g.angle } });
      const { status } = judgeKata(k, kataTargets(zone, action, shotAngleDeg(ball, goal, goalCenter)));
      for (const dim of ['placement', 'depth', 'axis']) {
        assert.ok(status[dim] === 'ok' || status[dim] === 'free', `${key} frame ${i} (${zone}, ${action}): ${dim} ${status[dim]}`);
      }
    });
  }
});

test('buildLesson: the name follows the language, an unknown one falls back to English', () => {
  assert.equal(buildLesson('zones', 'en').meta.name, LESSONS.zones.title.en);
  assert.equal(buildLesson('zones', 'de').meta.name, LESSONS.zones.title.de);
  assert.equal(buildLesson('zones', 'fr').meta.name, LESSONS.zones.title.en);
});

test('buildLesson: unknown key returns null; each call is a fresh doc', () => {
  assert.equal(buildLesson('nope'), null);
  const a = buildLesson('zones'), b = buildLesson('zones');
  assert.notEqual(a, b);
  assert.notEqual(a.meta.id, b.meta.id);
});

test('buildLesson: lesson docs switch on the live goalie at their goal, also after a round-trip', () => {
  for (const key of LESSON_KEYS) {
    const doc = acceptDoc(JSON.parse(JSON.stringify(buildLesson(key))));
    assert.equal(doc.autoGoalie, LESSONS[key].goal);
  }
});

// Lessons shelf in the Library (A-BACK-049): one row per shipped lesson, in
// the module's order, titled in the app language with its length.
test('lessonShelf: every shipped lesson once, ordered by its module number, with frames and seconds', async () => {
  const { lessonShelf } = await import('../web/src/goalie-lessons.js');
  const shelf = lessonShelf('en');
  assert.deepEqual(shelf.map((r) => r.key).sort(), [...LESSON_KEYS].sort());
  const ns = shelf.map((r) => r.n);
  assert.deepEqual(ns, [...ns].sort((a, b) => a - b));
  const zones = shelf.find((r) => r.key === 'zones');
  assert.deepEqual(zones, {
    key: 'zones', n: 2, title: 'Through the zones',
    frames: LESSONS.zones.frames.length,
    seconds: LESSONS.zones.frames.reduce((s, f) => s + f.ms, 0) / 1000,
  });
});

test('lessonShelf: titles follow the language, unknown languages fall back to English', async () => {
  const { lessonShelf } = await import('../web/src/goalie-lessons.js');
  assert.equal(lessonShelf('de').find((r) => r.key === 'zones').title, 'Durch die Zonen');
  assert.equal(lessonShelf('fr').find((r) => r.key === 'zones').title, 'Through the zones');
});
