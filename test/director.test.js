// Director camera (A-BACK-049): named shots computed from the goalie and the
// ball, and the timeline that picks the shot at a play time.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { DIRECTOR_SHOTS, SHOT_LABELS, TRANSITION_MS, shotPose, hasDirector, shotTimeline, shotAt, directorPoseAt } = await import('../web/src/director.js');
const { lessonPose } = await import('../web/src/camera-presets.js');
const { GOAL_Z } = await import('../web/src/authoring/ball-pose.js');

const goal = 'A';
const ball = { x: 4500, z: 10250 };
const goalie = { x: 700, z: GOAL_Z.A + 900 };
const ctx = { goal, ball, goalie };
const forward = (p) => ({ x: Math.sin(p.yaw) * Math.cos(p.pitch), y: Math.sin(p.pitch), z: Math.cos(p.yaw) * Math.cos(p.pitch) });
// cosine between the camera's forward vector and the direction to a world point
const facing = (p, to) => {
  const d = { x: to.x - p.x, y: to.y - p.y, z: to.z - p.z };
  const len = Math.hypot(d.x, d.y, d.z);
  const f = forward(p);
  return (f.x * d.x + f.y * d.y + f.z * d.z) / len;
};

test('director: every shot name has a pose and a label in both languages', () => {
  for (const name of DIRECTOR_SHOTS) {
    const p = shotPose(name, ctx);
    assert.ok(p && ['x', 'y', 'z', 'yaw', 'pitch'].every((k) => Number.isFinite(p[k])), name);
    assert.ok(SHOT_LABELS[name].en && SHOT_LABELS[name].de, name);
  }
  assert.equal(shotPose('nope', ctx), null);
  assert.equal(shotPose('goalieEyes', { goal }), null, 'no actors, no pose');
});

test('director: wide is the lesson camera', () => {
  assert.deepEqual(shotPose('wide', ctx), lessonPose('A'));
  assert.deepEqual(shotPose('wide', { goal: 'B' }), lessonPose('B'));
});

test('director: goalie eyes look at the ball from head height, in front of the goalie centre (clear of the helmet)', () => {
  const p = shotPose('goalieEyes', ctx);
  assert.ok(p.y > 1000 && p.y < 1600);
  const toBall = { x: ball.x - goalie.x, z: ball.z - goalie.z };
  const len = Math.hypot(toBall.x, toBall.z);
  const along = ((p.x - goalie.x) * toBall.x + (p.z - goalie.z) * toBall.z) / len;
  assert.ok(along > 100 && along < 800, `eyes ${along.toFixed(0)} mm in front of the goalie centre, towards the ball`);
  assert.ok(facing(p, { ...ball, y: 150 }) > 0.999);
});

test('director: shooter eyes stand behind the ball and look at the goalie', () => {
  const p = shotPose('shooterEyes', ctx);
  assert.ok(p.z > ball.z, 'further from the goal than the ball');
  assert.ok(facing(p, { ...goalie, y: 600 }) > 0.999);
});

test('director: side knee is a close-up of the goalie, level, at knee height, to the side of the goalie-ball line', () => {
  const p = shotPose('sideKnee', ctx);
  assert.ok(p.y > 300 && p.y < 600);
  assert.ok(Math.abs(p.pitch) < 1e-9, 'level');
  assert.ok(p.x > ball.x || p.x > goalie.x, 'on the +x side for goal A, like the lesson camera');
  assert.ok(Math.hypot(p.x - goalie.x, p.z - goalie.z) < 4000, 'within 4 m of the goalie');
  assert.ok(facing(p, { x: goalie.x, y: p.y, z: goalie.z }) > 0.999, 'looks at the goalie');
  // side view: the line goalie -> ball is across the view, not along it
  const f = forward(p);
  const line = { x: ball.x - goalie.x, z: ball.z - goalie.z };
  const len = Math.hypot(line.x, line.z);
  assert.ok(Math.abs((f.x * line.x + f.z * line.z) / len / Math.hypot(f.x, f.z)) < 0.05, 'perpendicular');
});

test('director: goal B mirrors goal A (side and depth)', () => {
  const gb = { x: -700, z: GOAL_Z.B - 900 };
  const bb = { x: -4500, z: GOAL_Z.B - 10250 };
  const p = shotPose('sideKnee', { goal: 'B', ball: bb, goalie: gb });
  assert.ok(p.x < gb.x, 'on the -x side for goal B');
  const e = shotPose('goalieEyes', { goal: 'B', ball: bb, goalie: gb });
  assert.ok(e.z < gb.z, 'in front of the goalie, towards the ball, for goal B too');
});

test('director: follow ball sits behind the ball looking towards the goal; push in is close to the goalie', () => {
  const f = shotPose('followBall', ctx);
  assert.ok(f.z > ball.z && f.y > 1500);
  assert.ok(f.pitch < 0, 'looks down');
  const saved = { goal, ball: { x: goalie.x + 100, z: goalie.z + 400 }, goalie };   // the save: the ball stops at the goalie
  const near = shotPose('pushIn', saved);
  const far = shotPose('wide', saved);
  const dist = (p) => Math.hypot(p.x - goalie.x, p.y - 500, p.z - goalie.z);
  assert.ok(dist(near) < 4000 && dist(near) < dist(far) / 3);
});

test('director: a shot with the ball on the goalie does not blow up', () => {
  for (const name of DIRECTOR_SHOTS) {
    const p = shotPose(name, { goal, ball: { ...goalie }, goalie });
    assert.ok(p && Number.isFinite(p.yaw) && Number.isFinite(p.x), name);
  }
});

const frames = (cams, ms = 1000) => cams.map((cam) => ({ duration: ms, scheme: { players: {}, shapes: [] }, ...(cam ? { cam } : {}) }));

test('director timeline: hasDirector, and a later first shot starts from the default', () => {
  assert.equal(hasDirector(frames([null, null])), false);
  assert.equal(hasDirector(frames([null, 'sideKnee'])), true);
  assert.equal(hasDirector(frames(['nope'])), false);
  assert.deepEqual(shotTimeline(frames([null, 'sideKnee', null, 'pushIn'])), [{ at: 0, name: 'wide' }, { at: 1000, name: 'sideKnee' }, { at: 3000, name: 'pushIn' }]);
  assert.deepEqual(shotTimeline(frames([null, null])), []);
});

test('director timeline: a shot holds until the next frame names one', () => {
  const f = frames(['goalieEyes', null, 'pushIn', null]);
  assert.deepEqual(shotAt(f, 0), { cur: 'goalieEyes', prev: null, since: 0 });
  assert.deepEqual(shotAt(f, 1500), { cur: 'goalieEyes', prev: null, since: 1500 });
  assert.deepEqual(shotAt(f, 2000), { cur: 'pushIn', prev: 'goalieEyes', since: 0 });
  assert.deepEqual(shotAt(f, 99999), { cur: 'pushIn', prev: 'goalieEyes', since: 97999 });
  assert.equal(shotAt(frames([null]), 0), null);
});

test('director pose: blends from the previous shot over TRANSITION_MS and then follows the new one', () => {
  const f = frames(['wide', 'pushIn', null]);
  const c = { goal, ballAt: () => ball, goalieAt: () => goalie };
  const wide = shotPose('wide', ctx), push = shotPose('pushIn', ctx);
  assert.deepEqual(directorPoseAt(f, 500, c), wide);
  assert.deepEqual(directorPoseAt(f, 1000, c), wide, 'starts where the old shot was');
  const mid = directorPoseAt(f, 1000 + TRANSITION_MS / 2, c);
  assert.ok(Math.abs(mid.x - (wide.x + push.x) / 2) < 1e-6, 'half way');
  assert.ok(Math.abs(mid.y - (wide.y + push.y) / 2) < 1e-6);
  assert.deepEqual(directorPoseAt(f, 1000 + TRANSITION_MS, c), push);
  assert.equal(directorPoseAt(frames([null]), 0, c), null);
});

test('director pose: follows the live ball and goalie (a function of the play time)', () => {
  const f = frames(['goalieEyes']);
  const at = (ms) => directorPoseAt(f, ms, { goal, ballAt: (t) => ({ x: ball.x - t, z: ball.z }), goalieAt: () => goalie });
  assert.notEqual(at(0).yaw, at(800).yaw);
  assert.deepEqual(at(300), at(300), 'same time, same pose');
});

const { directorActive, resumePose, RESUME_MS } = await import('../web/src/director.js');

test('directorActive: the switch or the export, a frame that names a shot, and the 3D camera', () => {
  const withShot = frames(['wide']), without = frames([null]);
  assert.equal(directorActive({ switchOn: true, forced: false, frames: withShot, perspective: true }), true);
  assert.equal(directorActive({ switchOn: false, forced: false, frames: withShot, perspective: true }), false, 'the viewer has the camera');
  assert.equal(directorActive({ switchOn: false, forced: true, frames: withShot, perspective: true }), true, 'the export ignores the switch');
  assert.equal(directorActive({ switchOn: true, forced: true, frames: without, perspective: true }), false, 'no shot, nothing to direct');
  assert.equal(directorActive({ switchOn: true, forced: false, frames: withShot, perspective: false }), false, '2D has no director');
});

test('resumePose: eases from the viewer camera to the director pose, then is the pose', () => {
  const a = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }, b = { x: 100, y: 200, z: 300, yaw: 1, pitch: -0.5 };
  assert.deepEqual(resumePose(a, b, 0), a);
  const mid = resumePose(a, b, RESUME_MS / 2);
  assert.ok(Math.abs(mid.x - 50) < 1e-9 && Math.abs(mid.y - 100) < 1e-9);
  assert.equal(resumePose(a, b, RESUME_MS), b);
  assert.equal(resumePose(a, b, RESUME_MS * 5), b);
});

const { buildLesson } = await import('../web/src/goalie-lessons.js');
const { cachedGoalieTrack, goalieTrackAt, ballAt: trackBallAt } = await import('../web/src/goalie-track.js');

test('director: shooter eyes stay behind the release point during the shot and on the goal, behind the live ball before release', () => {
  const doc = buildLesson('line');
  const fr = doc.frames;
  const track = cachedGoalieTrack(fr, 'A');
  const c = { goal: 'A', ballAt: (ms) => trackBallAt(fr, ms), goalieAt: (ms) => goalieTrackAt(track, ms) };
  const release = fr[0].scheme.balls.main;
  const rel = { x: release.x, z: release.z };
  for (const ms of [500, 1000, 2200, 3000]) {
    const p = directorPoseAt(fr, ms, c);
    assert.ok(Math.hypot(p.x - rel.x, p.z - rel.z) < 1500, `${ms} ms: near the release point`);
    assert.ok(p.z > GOAL_Z.A + 3000, `${ms} ms: nowhere near the goal`);
  }
  const before = directorPoseAt(fr, 0, c);
  const live = c.ballAt(0);
  assert.ok(Math.hypot(before.x - live.x, before.z - live.z) < 1500, 'before release: behind the live ball');
});
