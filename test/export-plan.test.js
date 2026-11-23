// The video export's frame plan (A-BACK-049, lesson 1 review 2026-11-22):
// which play time each video frame shows, holding on captions like the app's
// Hold, running through the last frame's caption, with the lesson's title
// and recap card at both ends.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { exportPlan, INTRO_MS, RECAP_MS } = await import('../web/src/authoring/export-plan.js');
const { captionHolds } = await import('../web/src/authoring/caption-hold.js');
const { buildLesson } = await import('../web/src/goalie-lessons.js');

const plain = (n, ms = 1000) => Array.from({ length: n }, () => ({ duration: ms, scheme: {} }));
const total = (frames) => frames.slice(0, -1).reduce((s, f) => s + f.duration, 0);

test('exportPlan: without holds or cards, the same frames as before: i / fps from 0 up to the end', () => {
  const frames = plain(3);
  const plan = exportPlan({ frames, lang: 'en', fps: 30, endMs: total(frames), holds: false });
  assert.equal(plan.length, 60);
  plan.forEach((p, i) => { assert.ok(Math.abs(p.playMs - i * 1000 / 30) < 1e-9); assert.equal(p.card, null); });
});

test('exportPlan: with holds, each noted frame freezes at its start for its reading time, the last one too', () => {
  const doc = buildLesson('line');
  const fps = 30;
  const end = total(doc.frames);
  const plan = exportPlan({ frames: doc.frames, lang: 'en', fps, endMs: end, holds: true });
  const holds = captionHolds(doc.frames, 'en');
  const playMs = end + holds.reduce((s, h) => s + h.ms, 0);
  assert.ok(Math.abs(plan.length - playMs * fps / 1000) <= 2, `${plan.length} frames for ${playMs} ms`);
  for (const h of holds) {
    const still = plan.filter((p) => p.playMs === h.at).length;
    assert.ok(Math.abs(still - h.ms * fps / 1000) <= 2, `hold at ${h.at}: ${still} frames`);
  }
  assert.equal(plan.at(-1).playMs, end, 'it ends on the last keyframe, after its caption hold');
  for (let i = 1; i < plan.length; i++) assert.ok(plan[i].playMs >= plan[i - 1].playMs, 'play time never goes back');
});

test('exportPlan: a lesson with cards opens on its title card and closes on its recap', () => {
  const doc = buildLesson('line');
  const fps = 30;
  const end = total(doc.frames);
  const plan = exportPlan({ frames: doc.frames, lang: 'en', fps, endMs: end, holds: true, lesson: doc.lesson });
  const intro = plan.filter((p) => p.card === 'intro');
  const recap = plan.filter((p) => p.card === 'recap');
  assert.equal(intro.length, Math.round(INTRO_MS * fps / 1000));
  assert.equal(recap.length, Math.round(RECAP_MS * fps / 1000));
  assert.ok(intro.every((p) => p.playMs === 0));
  assert.ok(recap.every((p) => p.playMs === end));
  assert.equal(plan[0].card, 'intro');
  assert.equal(plan.at(-1).card, 'recap');
  const firstPlay = plan.findIndex((p) => p.card === null);
  assert.equal(firstPlay, intro.length, 'the cards sit at the ends, the play in between');
});

test('exportPlan: a lesson without cards gets none; an empty play gives no frames', () => {
  const doc = buildLesson('line');
  delete doc.lesson;   // every shipped lesson has cards now: strip them
  const plan = exportPlan({ frames: doc.frames, lang: 'en', fps: 30, endMs: total(doc.frames), holds: true, lesson: doc.lesson });
  assert.ok(plan.every((p) => p.card === null));
  assert.deepEqual(exportPlan({ frames: [], lang: 'en', fps: 30, endMs: 0, holds: true }), []);
});
