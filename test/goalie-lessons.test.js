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
const { GOAL_Z, BALL_CARRY_OFFSET, DEFAULT_SHOT_SPEED_MPS } = await import('../web/src/authoring/ball-pose.js');
const { DIRECTOR_SHOTS } = await import('../web/src/director.js');
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

test('zones lesson: the right run goes attention -> danger -> danger -> passing-first -> passing-first at goal A', () => {
  assert.deepEqual(zonesOf('zones').slice(4), ['attention', 'danger', 'danger', 'passing', 'passing']);
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

// 1. Shooting line and area, a showcase: the same shot twice from the same
// spot, first a goal against a goalie off the line, then the KATA build-up
// and the same shot saved.
const LINE_FRAMES = LESSONS.line.frames;
test('line lesson: lesson 1, one shooter at the same spot in every frame, in front of goal A', () => {
  assert.equal(LESSONS.line.n, 1);
  assert.equal(LESSONS.line.goal, 'A');
  const frames = buildLesson('line').frames;
  assert.equal(frames.length, LINE_FRAMES.length);
  const spot = (f) => JSON.stringify(Object.values(f.scheme.players).map((p) => [p.x, p.z]));
  for (const f of frames) assert.equal(spot(f), spot(frames[0]), 'the shooter never moves');
  for (const [i, z] of zonesOf('line').entries()) {
    if (LINE_FRAMES[i].shot) continue;   // after a shot the ball is in the net or in front of the goalie
    assert.ok(z === 'danger' || z === 'slot', `frame ${i}: ${z}`);
  }
});

test('line lesson: wrong first, a goal against a goalie off the shooting line, no KATA applied', () => {
  const doc = buildLesson('line');
  const goalCenter = { x: 0, z: GOAL_Z.A };
  const wrong = LINE_FRAMES.findIndex((f) => f.shot?.scored);
  assert.equal(wrong, 1, 'the goal comes right after the opening frame');
  assert.deepEqual(LINE_FRAMES[0].goalie, [], 'frame 1 applies no KATA dimension');
  const ball = ballOf(doc.frames[wrong]);
  assert.equal(ball.shot.saved, undefined, 'a goal, not a save');
  assert.ok(Math.abs(ball.x) < 800 && ball.z < GOAL_Z.A, 'in the net');
  assert.equal(ball.carrier, undefined);
  const plan = passPlan(doc.frames[0].scheme, doc.frames[wrong].scheme, doc.frames[0].duration);
  assert.equal(plan.kind, 'shot');
  assert.ok(!plan.saved);
  // the goalie never touches the shot line: clear of the path by more than its half width
  const g = doc.frames[0].scheme.goalies.A;
  const from = plan.from, to = plan.to;
  const len = Math.hypot(to.x - from.x, to.z - from.z);
  const across = Math.abs((g.x - from.x) * (to.z - from.z) - (g.z - from.z) * (to.x - from.x)) / len;
  assert.ok(across > 500, `goalie ${across.toFixed(0)} mm off the shot path`);
  // the KATA card reads placement off
  const targets = kataTargets(goalieZoneOf(ballOf(doc.frames[0]), 'A'), 'shot', shotAngleDeg(ballOf(doc.frames[0]), 'A', goalCenter));
  const st = judgeKata(kataOf({ ball: ballOf(doc.frames[0]), goal: 'A', goalCenter, goalie: { x: g.x, z: g.z, yaw: g.angle } }), targets).status;
  assert.equal(st.placement, 'adjust');
});

// The KATA card grades the goalie against the shot's release point, not the
// ball in the net, from the release until the shot keyframe's own time ends
// (decided 2026-11-22): "What went wrong?" reads red.
test('kataBall: from the shot release to the end of the shot keyframe, the release point; else the live ball', async () => {
  const { kataBall } = await import('../web/src/kata.js');
  const doc = buildLesson('line');
  const fr = doc.frames;
  const plan = passPlan(fr[0].scheme, fr[1].scheme, fr[0].duration);
  const live = { x: 1, z: 2 };
  const release = plan.releaseT * fr[0].duration;
  assert.deepEqual(kataBall(fr, release / 2, live), live, 'before the release: the live ball');
  for (const ms of [release + 1, fr[0].duration, startMs(fr, 1) + fr[1].duration / 2, startMs(fr, 2) - 1]) {
    const b = kataBall(fr, ms, live);
    assert.ok(Math.abs(b.x - plan.from.x) < 1e-6 && Math.abs(b.z - plan.from.z) < 1e-6, `${ms} ms: the release point`);
  }
  assert.deepEqual(kataBall(fr, startMs(fr, 2) + 1, live), live, 'after the goal frame: the live ball again');
  assert.deepEqual(kataBall([], 0, live), live);
  assert.deepEqual(kataBall(undefined, 0, live), live);
});

test('line lesson: on the "What went wrong?" frame the KATA card reads placement off, graded from the release point', async () => {
  const { kataBall } = await import('../web/src/kata.js');
  const doc = buildLesson('line');
  const goalCenter = { x: 0, z: GOAL_Z.A };
  const wrong = LINE_FRAMES.findIndex((f) => f.shot?.scored);
  const ms = startMs(doc.frames, wrong);
  const ball = kataBall(doc.frames, ms, ballOf(doc.frames[wrong]));
  const g = doc.frames[wrong].scheme.goalies.A;
  const st = judgeKata(kataOf({ ball, goal: 'A', goalCenter, goalie: { x: g.x, z: g.z, yaw: g.angle } }),
    kataTargets(goalieZoneOf(ball, 'A'), expectedAction(doc.frames, ms), shotAngleDeg(ball, 'A', goalCenter))).status;
  assert.equal(st.placement, 'adjust');
});

test('line lesson: then the same shot from the same spot, saved, with the ball stopping before the goalie', () => {
  const doc = buildLesson('line');
  const saved = LINE_FRAMES.findIndex((f) => f.shot && !f.shot.scored);
  assert.equal(saved, LINE_FRAMES.length - 1, 'the save closes the lesson');
  const ball = ballOf(doc.frames[saved]);
  assert.equal(ball.shot.saved, true);
  const g = doc.frames[saved].scheme.goalies.A;
  assert.ok(Math.abs(ball.z - GOAL_Z.A) > Math.abs(g.z - GOAL_Z.A), 'in front of the goalie');
  assert.ok(Math.hypot(ball.x - g.x, ball.z - g.z) < 700);
  const before = doc.frames[saved - 1], first = doc.frames[0];
  assert.deepEqual(ballOf(before).carrier && [before.scheme.players[ballOf(before).carrier].x, before.scheme.players[ballOf(before).carrier].z],
    [first.scheme.players[ballOf(first).carrier].x, first.scheme.players[ballOf(first).carrier].z], 'released from the same spot as the goal');
});

test('line lesson: both shots fly in slow motion (a lower speed than the default) and are released early', () => {
  const doc = buildLesson('line');
  for (const i of [1, doc.frames.length - 1]) {
    const pass = ballOf(doc.frames[i]).pass;
    assert.ok(pass.speedMps >= 3 && pass.speedMps < DEFAULT_SHOT_SPEED_MPS, `frame ${i}: speed ${pass.speedMps}`);
    assert.ok(pass.releaseT < 0.5);
    const plan = passPlan(doc.frames[i - 1].scheme, doc.frames[i].scheme, doc.frames[i - 1].duration);
    assert.ok(plan.arriveT < 1 && !plan.late, `frame ${i - 1}: the flight fits the frame`);
    assert.ok(plan.needMs > 1000, `frame ${i - 1}: a flight of ${plan.needMs.toFixed(0)} ms is slow enough to follow`);
  }
});

test('line lesson: the quiet screen names a layer on every frame, the line for the line and the area for the area', () => {
  const doc = buildLesson('line');
  for (const [i, f] of doc.frames.entries()) assert.ok(Array.isArray(f.layers), `frame ${i} names its layers`);
  const noteOf = (i) => doc.frames[i].note.en;
  for (const [i, f] of doc.frames.entries()) {
    if (/shooting line/i.test(noteOf(i)) && !/area/i.test(noteOf(i))) assert.ok(f.layers.includes('line'), `frame ${i}`);
    if (/shooting area/i.test(noteOf(i))) assert.deepEqual(f.layers, ['area'], `frame ${i}`);
  }
  assert.deepEqual(doc.frames[0].layers, [], 'the opening shot: caption only');
  assert.ok(doc.frames.every((f) => f.layers.every((n) => n === 'line' || n === 'area')), 'no labels, no inset, no extra layers');
});

test('line lesson: director shots in order, all known, the push in on the save', () => {
  const doc = buildLesson('line');
  for (const f of doc.frames) assert.ok(DIRECTOR_SHOTS.includes(f.cam), f.cam);
  assert.equal(doc.frames.at(-1).cam, 'pushIn');
  assert.equal(doc.frames[0].cam, 'shooterEyes');
  assert.ok(new Set(doc.frames.map((f) => f.cam)).size >= 4, 'a varied set of shots');
});

test('line lesson: the title card holds the task, the recap three bullets, in English and German', () => {
  const doc = buildLesson('line');
  assert.equal(doc.lesson.intro.task.en, 'Watch the goalie: where does it stand, and why?');
  assert.equal(doc.lesson.intro.task.de, 'Schau auf den Goalie: wo steht er, und warum?');
  assert.equal(doc.lesson.recap.bullets.length, 3);
  for (const b of doc.lesson.recap.bullets) assert.ok(b.en && b.de);
  assert.match(doc.lesson.recap.bullets[0].en, /placement/i);
  assert.match(doc.lesson.recap.bullets[1].en, /depth/i);
  assert.match(doc.lesson.recap.bullets[2].en, /axis/i);
  const round = acceptDoc(JSON.parse(JSON.stringify(doc)));
  assert.deepEqual(round.lesson, doc.lesson, 'survives the round trip');
  assert.deepEqual(round.frames.map((f) => f.layers), doc.frames.map((f) => f.layers));
  assert.deepEqual(round.frames.map((f) => f.cam), doc.frames.map((f) => f.cam));
  for (const text of [JSON.stringify(doc.lesson), JSON.stringify(doc.frames.map((f) => f.note))]) assert.ok(!/ß|—/.test(text), 'Swiss spelling, no em-dash');
});

const SHOWCASE = ['line', 'zones'];   // the lessons given the showcase treatment so far
test('showcase lessons carry a task, a recap, layers and a director shot on every frame', () => {
  for (const key of SHOWCASE) {
    const doc = buildLesson(key);
    assert.ok(doc.lesson.intro.task.en && doc.lesson.intro.task.de, key);
    assert.ok(doc.lesson.recap.title.en && doc.lesson.recap.bullets.length >= 3, key);
    for (const b of doc.lesson.recap.bullets) assert.ok(b.en && b.de, key);
    doc.frames.forEach((f, i) => {
      assert.ok(Array.isArray(f.layers), `${key} frame ${i}: layers`);
      assert.ok(DIRECTOR_SHOTS.includes(f.cam), `${key} frame ${i}: cam ${f.cam}`);
    });
    for (const text of [JSON.stringify(doc.lesson), JSON.stringify(doc.frames.map((f) => f.note))]) assert.ok(!/ß|—/.test(text), `${key}: Swiss spelling, no em-dash`);
  }
});

// Lessons 2-4: a wrong run first that ends in a goal ("What went wrong?"),
// the goalie clear of the shot path, then the right run(s).
test('lessons 2-4: the first shot is a goal on a frame that asks what went wrong, past a goalie clear of the shot path', () => {
  for (const key of SHOWCASE.filter((k) => k !== 'line')) {
    const doc = buildLesson(key);
    const specs = LESSONS[key].frames;
    const wrong = specs.findIndex((f) => f.shot?.scored);
    assert.ok(wrong > 0, key);
    assert.ok(specs.slice(0, wrong).every((f) => !f.shot), `${key}: no shot before the goal`);
    assert.match(doc.frames[wrong].note.en, /What went wrong\?/);
    assert.match(doc.frames[wrong].note.de, /Was ist schiefgelaufen\?/);
    const ball = ballOf(doc.frames[wrong]);
    assert.equal(ball.shot.saved, undefined, `${key}: a goal`);
    assert.ok(ball.z < GOAL_Z.A, `${key}: in the net`);
    const plan = passPlan(doc.frames[wrong - 1].scheme, doc.frames[wrong].scheme, doc.frames[wrong - 1].duration);
    assert.equal(plan.kind, 'shot');
    const g = doc.frames[wrong].scheme.goalies.A;
    const len = Math.hypot(plan.to.x - plan.from.x, plan.to.z - plan.from.z);
    const across = Math.abs((g.x - plan.from.x) * (plan.to.z - plan.from.z) - (g.z - plan.from.z) * (plan.to.x - plan.from.x)) / len;
    assert.ok(across > 500, `${key}: goalie ${across.toFixed(0)} mm off the shot path`);
    // the wrong run's goalie reads wrong on the KATA card at the goal
    const goalCenter = { x: 0, z: GOAL_Z.A };
    const ms = startMs(doc.frames, wrong - 1);
    const rel = plan.from;
    const st = judgeKata(kataOf({ ball: rel, goal: 'A', goalCenter, goalie: { x: g.x, z: g.z, yaw: g.angle } }),
      kataTargets(goalieZoneOf(rel, 'A'), expectedAction(doc.frames, ms), shotAngleDeg(rel, 'A', goalCenter))).status;
    assert.ok([st.placement, st.depth, st.axis].includes('adjust'), `${key}: ${JSON.stringify(st)}`);
  }
});

test('zones lesson: the wrong run keeps the goalie centred and deep all the way', () => {
  const doc = buildLesson('zones');
  const wrong = LESSONS.zones.frames.findIndex((f) => f.shot?.scored);
  for (let i = 0; i <= wrong; i++) {
    const g = doc.frames[i].scheme.goalies.A;
    assert.equal(g.x, 0, `frame ${i}`);
    assert.equal(g.z, GOAL_Z.A + 250, `frame ${i}`);
    assert.equal(g.angle, 0, `frame ${i}`);
  }
  assert.equal(goalieZoneOf(ballOf(doc.frames[wrong - 1]), 'A'), 'danger');
  assert.ok(Math.abs(doc.frames.at(wrong + 1).scheme.balls.main.x - 3000) < 1, 'the right run restarts in the attention zone');
});

test('zones lesson: the quiet screen shows the zones on every frame and the line where the caption names it', () => {
  const doc = buildLesson('zones');
  for (const [i, f] of doc.frames.entries()) {
    assert.ok(f.layers.includes('zones'), `frame ${i}`);
    assert.ok(f.layers.every((n) => n === 'zones' || n === 'line'), `frame ${i}`);
    if (/shooting line/i.test(f.note.en)) assert.ok(f.layers.includes('line'), `frame ${i}`);
  }
});

// 4. Behind the goal: the ball goes round behind goal A, post to post, then
// comes out in front on the other side.
test('behind lesson: lesson 4, passing-first round the back of goal A, then out into the danger zone', () => {
  assert.equal(LESSONS.behind.n, 4);
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
      if (spec.shot.scored) return;   // the wrong run ends in a goal
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

test('lessons: the goalie at every keyframe is judged ok on placement, depth and axis', async () => {
  const { kataBall } = await import('../web/src/kata.js');
  for (const key of LESSON_KEYS) {
    const doc = buildLesson(key);
    const goal = LESSONS[key].goal;
    const goalCenter = { x: 0, z: GOAL_Z[goal] };
    doc.frames.forEach((f, i) => {
      const ball = kataBall(doc.frames, startMs(doc.frames, i), f.scheme.balls.main);   // as the live card grades it: a shot from its release point
      const g = f.scheme.goalies[goal];
      assert.ok(g, `${key} frame ${i}: goalie ${goal} placed`);
      if (LESSONS[key].frames[i].shot?.scored) return;   // the goal that goes in: judged off in its own test
      if (key !== 'line' && LESSONS[key].frames[i].goalie) return;   // the wrong run of lessons 2-4: wrong on purpose, judged in its own test
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
// of the three frames after the goal carries a `goalie` hint (the dimensions
// applied so far), the goalie is placed to match, and the frame is marked so
// the live goalie (goalie-track.js) follows it instead of the rules.
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
  assert.deepEqual(pick(statusOf(2)), ['ok', 'adjust', 'adjust']);
  assert.deepEqual(pick(statusOf(3)), ['ok', 'ok', 'adjust']);
  assert.deepEqual(pick(statusOf(4)), ['ok', 'ok', 'ok']);
  assert.deepEqual(LINE_FRAMES.slice(0, 5).map((f) => f.goalie), [[], [], ['placement'], ['placement', 'depth'], ['placement', 'depth', 'axis']]);
  assert.deepEqual(doc.frames.map((f) => f.goalieFixed === true), [true, true, true, true, true, false, false, false]);
  const g2 = doc.frames[2].scheme.goalies.A;
  assert.equal(g2.angle, 0, 'frame 3: knees parallel to the goal line');
  assert.ok(g2.z - GOAL_Z.A < 500, 'frame 3: deep');
  assert.ok(doc.frames[3].scheme.goalies.A.z > g2.z, 'frame 4: stepped forward');
});

test('lessons without a goalie hint carry no goalieFixed', () => {
  for (const key of LESSON_KEYS) {
    buildLesson(key).frames.forEach((f, i) => {
      assert.equal('goalieFixed' in f, !!LESSONS[key].frames[i].goalie, `${key} frame ${i}`);
    });
  }
});
