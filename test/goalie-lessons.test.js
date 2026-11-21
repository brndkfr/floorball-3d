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
const zonesOf = (key) => buildLesson(key).frames.map((f) => goalieZoneOf(f.scheme.balls.main, LESSONS[key].goal));
const ballOf = (f) => f.scheme.balls.main;

test('lessons: each survives a JSON round-trip through acceptDoc with an en and a de caption on every frame', () => {
  for (const key of LESSON_KEYS) {
    const doc = acceptDoc(JSON.parse(JSON.stringify(buildLesson(key))));
    assert.ok(doc, key);
    assert.equal(doc.frames.length, LESSONS[key].frames.length, key);
    assert.equal(doc.currentFrame, 0);
    doc.frames.forEach((f, i) => assert.ok(f.note?.en && f.note?.de, `${key} frame ${i}: en and de caption`));
  }
});

test('zones lesson: the ball goes attention -> danger -> danger -> passing-first -> passing-first at goal A', () => {
  assert.deepEqual(zonesOf('zones'), ['attention', 'danger', 'danger', 'passing', 'passing']);
});

test('zones lesson: one attacker carries the ball in every frame', () => {
  for (const f of buildLesson('zones').frames) assert.equal(Object.keys(f.scheme.players).length, 1);
});

test("lessons: a carried ball sits at its carrier's stick; every player is inside the boards", () => {
  for (const key of LESSON_KEYS) {
    buildLesson(key).frames.forEach((f, i) => {
      const ball = ballOf(f);
      if (ball.carrier) {
        const p = f.scheme.players[ball.carrier];
        assert.ok(p, `${key} frame ${i}: carrier on the rink`);
        assert.equal(ball.x, p.x + BALL_CARRY_OFFSET.x);
        assert.equal(ball.z, p.z + BALL_CARRY_OFFSET.z);
      }
      for (const p of Object.values(f.scheme.players)) {
        assert.ok(Math.abs(p.x) < HALF_W - 500 && p.z > 500 && p.z < RINK_L - 500, `${key} frame ${i}: inside the boards: ${p.x}, ${p.z}`);
      }
    });
  }
});

test('lessons: every player moves at a believable speed (at most 7 m/s, an estimate)', () => {
  for (const key of LESSON_KEYS) {
    const frames = buildLesson(key).frames;
    for (let i = 0; i + 1 < frames.length; i++) {
      for (const [id, a] of Object.entries(frames[i].scheme.players)) {
        const b = frames[i + 1].scheme.players[id];
        if (!b) continue;
        const mps = Math.hypot(b.x - a.x, b.z - a.z) / frames[i].duration;   // mm / ms = m/s
        assert.ok(mps <= 7, `${key} frame ${i}: ${mps.toFixed(1)} m/s`);
      }
    }
  }
});

// 1. Shooting line and area: the ball stands still while the captions take
// placement, depth and axis one at a time, then moves slowly.
test('line lesson: lesson 1, ball still for the three dimensions, then a slow move, all in front of goal A', () => {
  assert.equal(LESSONS.line.n, 1);
  assert.equal(LESSONS.line.goal, 'A');
  const frames = buildLesson('line').frames;
  assert.ok(frames.length >= 5);
  for (let i = 1; i < 4; i++) assert.deepEqual([ballOf(frames[i]).x, ballOf(frames[i]).z], [ballOf(frames[0]).x, ballOf(frames[0]).z], `frame ${i} still`);
  for (let i = 3; i + 1 < frames.length; i++) {
    const a = ballOf(frames[i]), b = ballOf(frames[i + 1]);
    assert.ok(Math.hypot(b.x - a.x, b.z - a.z) / frames[i].duration <= 3, `frame ${i}: slow`);
  }
  for (const z of zonesOf('line')) assert.ok(z === 'danger' || z === 'slot', z);
});

// 5. Behind the goal: the ball goes round behind goal A, post to post, then
// comes out in front on the other side.
test('behind lesson: lesson 5, passing-first round the back of goal A, then out into the danger zone', () => {
  assert.equal(LESSONS.behind.n, 5);
  assert.equal(LESSONS.behind.goal, 'A');
  const zones = zonesOf('behind');
  assert.equal(zones.at(-1), 'danger');
  assert.ok(zones.slice(0, -1).every((z) => z === 'passing'), zones.join());
  const balls = buildLesson('behind').frames.map(ballOf);
  assert.ok(balls.some((b) => b.z < GOAL_Z.A && b.x > 0) && balls.some((b) => b.z < GOAL_Z.A && b.x < 0), 'behind the goal on both sides');
  // the goalie changes posts when the ball crosses behind the goal
  const goalies = buildLesson('behind').frames.map((f) => f.scheme.goalies.A.x);
  assert.ok(goalies[0] > 0 && goalies.at(-2) < 0, goalies.join());
});

// Lessons with more than one player (3, 4): a cast of named players, each
// frame lists where they stand and who has the ball, or that the carrier
// of the frame before shoots.
const { passPlan } = await import('../web/src/authoring/ball-pose.js');
const castLessons = () => LESSON_KEYS.filter((k) => LESSONS[k].cast);

test('cast lessons: one player per cast member with its team and number in every frame', () => {
  assert.ok(castLessons().length > 0);
  for (const key of castLessons()) {
    const cast = LESSONS[key].cast;
    const frames = buildLesson(key).frames;
    const ids = Object.keys(frames[0].scheme.players);
    assert.equal(ids.length, Object.keys(cast).length, key);
    for (const f of frames) {
      assert.deepEqual(Object.keys(f.scheme.players), ids, `${key}: the same players throughout`);
      const teams = Object.values(f.scheme.players).map((p) => `${p.team}/${p.number}`).sort();
      assert.deepEqual(teams, Object.values(cast).map((c) => `${c.team}/${c.number}`).sort());
    }
  }
});

test('cast lessons: a shot frame is a shot at the lesson goal by the carrier before it', () => {
  for (const key of castLessons()) {
    const goal = LESSONS[key].goal;
    const frames = buildLesson(key).frames;
    LESSONS[key].frames.forEach((spec, i) => {
      if (!spec.shot) return;
      const ball = ballOf(frames[i]);
      assert.equal(ball.carrier, undefined, `${key} frame ${i}: loose after the shot`);
      assert.equal(ball.shot.goal, goal);
      // a lesson shot ends in a save: the ball stops just in front of the goalie, on the shot path
      assert.equal(ball.shot.saved, true, `${key} frame ${i}: saved`);
      const g = frames[i].scheme.goalies[goal];
      const gap = Math.hypot(ball.x - g.x, ball.z - g.z);
      assert.ok(gap > 150 && gap < 700, `${key} frame ${i}: ball ${gap.toFixed(0)} mm from the goalie`);
      assert.ok(Math.abs(ball.z - GOAL_Z[goal]) > Math.abs(g.z - GOAL_Z[goal]), `${key} frame ${i}: ball in front of the goalie`);
      const plan = passPlan(frames[i - 1].scheme, frames[i].scheme, frames[i - 1].duration);
      assert.equal(plan?.kind, 'shot', `${key} frame ${i - 1} -> ${i}`);
    });
  }
});

// 3. Pass or shot: the same 2-on-1 twice. The defender takes the carrier
// (pass expected: back, knees parallel), then the pass lane (shot
// expected: forward, square).
test('passOrShot lesson: lesson 3, the same start twice, read once as a pass and once as a shot', () => {
  assert.equal(LESSONS.passOrShot.n, 3);
  const spec = LESSONS.passOrShot;
  const restart = spec.frames.findIndex((f, i) => i > 0 && JSON.stringify(f.players) === JSON.stringify(spec.frames[0].players));
  assert.ok(restart > 0, 'the opening positions come back');
  const doc = buildLesson('passOrShot');
  const carrierA = (f) => ballOf(f).carrier && f.scheme.players[ballOf(f).carrier].number === spec.cast.a.number;
  const reads = doc.frames.map((f, i) => ({ i, zone: goalieZoneOf(ballOf(f), 'A'), action: expectedAction(doc.frames, startMs(doc.frames, i)), g: f.scheme.goalies.A }))
    .filter(({ i, zone }) => carrierA(doc.frames[i]) && (zone === 'danger' || zone === 'slot'));
  const pass = reads.find((r) => r.action === 'pass' && r.i < restart);
  const shot = reads.find((r) => r.action === 'shot' && r.i > restart);
  assert.ok(pass && shot, JSON.stringify(reads.map(({ i, action }) => [i, action])));
  const depth = (g) => g.z - GOAL_Z.A;
  assert.ok(depth(pass.g) < depth(shot.g), 'back for the pass, forward for the shot');
  assert.equal(pass.g.angle, 0, 'knees parallel for the pass');
  assert.notEqual(shot.g.angle, 0, 'square to the ball for the shot');
});

// Lesson 4 (most dangerous or most likely) was the same 2-on-1 twice with the
// same goalie answers as lesson 3, so its idea lives in lesson 3's last caption.
test('passOrShot lesson: the old options lesson is merged in, its idea closes lesson 3', () => {
  assert.equal(LESSONS.options, undefined);
  assert.deepEqual(LESSON_KEYS, ['line', 'zones', 'passOrShot', 'behind']);
  const last = LESSONS.passOrShot.frames.at(-1).note;
  assert.match(last.en, /likely/i);
  assert.match(last.en, /dangerous/i);
  assert.match(last.de, /wahrscheinlich/i);
  assert.match(last.de, /gefährlich/i);
  for (const l of ['en', 'de']) assert.ok(!/ß|—/.test(last[l]), 'Swiss spelling, no em-dash');
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
      const applied = LESSONS[key].frames[i].goalie ?? ['placement', 'depth', 'axis'];   // a build-up frame applies only some
      for (const dim of ['placement', 'depth', 'axis']) {
        if (!applied.includes(dim)) { assert.equal(status[dim], 'adjust', `${key} frame ${i}: ${dim} not applied yet`); continue; }
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
  assert.equal(new Set(ns).size, ns.length, 'module numbers are unique');
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

// Lesson 1 shows the KATA build-up: placement, then depth, then axis. Each
// of the first three frames carries a `goalie` hint (the dimensions applied
// so far), the goalie is placed to match, and the frame is marked so the
// live goalie (goalie-track.js) follows it instead of the rules.
test('line lesson: the KATA rows turn ok one at a time, placement, depth, axis', () => {
  const doc = buildLesson('line');
  const goalCenter = { x: 0, z: GOAL_Z.A };
  const statusOf = (i) => {
    const f = doc.frames[i];
    const ball = ballOf(f);
    const g = f.scheme.goalies.A;
    const targets = kataTargets(goalieZoneOf(ball, 'A'), expectedAction(doc.frames, startMs(doc.frames, i)), shotAngleDeg(ball, 'A', goalCenter));
    return judgeKata(kataOf({ ball, goal: 'A', goalCenter, goalie: { x: g.x, z: g.z, yaw: g.angle } }), targets).status;
  };
  const pick = (st) => [st.placement, st.depth, st.axis];
  assert.deepEqual(pick(statusOf(0)), ['ok', 'adjust', 'adjust']);
  assert.deepEqual(pick(statusOf(1)), ['ok', 'ok', 'adjust']);
  assert.deepEqual(pick(statusOf(2)), ['ok', 'ok', 'ok']);
  assert.deepEqual(LESSONS.line.frames.slice(0, 3).map((f) => f.goalie), [['placement'], ['placement', 'depth'], ['placement', 'depth', 'axis']]);
  assert.deepEqual(doc.frames.map((f) => f.goalieFixed === true), [true, true, true, false, false]);
  const g0 = doc.frames[0].scheme.goalies.A;
  assert.equal(g0.angle, 0, 'frame 1: knees parallel to the goal line');
  assert.ok(g0.z - GOAL_Z.A < 500, 'frame 1: deep');
  assert.ok(doc.frames[1].scheme.goalies.A.z > g0.z, 'frame 2: stepped forward');
});

test('lessons without a goalie hint carry no goalieFixed', () => {
  for (const key of LESSON_KEYS) {
    buildLesson(key).frames.forEach((f, i) => {
      assert.equal('goalieFixed' in f, !!LESSONS[key].frames[i].goalie, `${key} frame ${i}`);
    });
  }
});
