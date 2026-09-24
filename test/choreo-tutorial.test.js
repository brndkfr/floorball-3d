import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  STEPS, initialTutorial, tutorialReducer, tutorialView, resumeTutorial, stallCue,
} = await import('../web/src/authoring/choreo-tutorial.js');

const run = (events, from = initialTutorial()) => events.reduce(tutorialReducer, from);

test('steps are choreo, move, pass, release, commit, play in that order', () => {
  assert.deepEqual(STEPS, ['choreo', 'move', 'pass', 'release', 'commit', 'play']);
});

test('fresh tutorial starts on the Choreo step with its target', () => {
  const v = tutorialView(initialTutorial());
  assert.equal(v.step, 'choreo');
  assert.equal(v.index, 0);
  assert.equal(v.target, 'choreoButton');
  assert.equal(v.done, false);
  assert.match(v.hint, /Choreo/);
});

test('happy path walks all 6 steps to done', () => {
  const s = run([
    { type: 'choreoStart' },
    { type: 'chipMoved' },
    { type: 'carrierChanged' },
    { type: 'releaseChanged' },
    { type: 'choreoCommit' },
    { type: 'playStart' },
  ]);
  const v = tutorialView(s);
  assert.equal(v.done, true);
  assert.equal(v.step, null);
  assert.deepEqual(v.statuses, { choreo: 'complete', move: 'complete', pass: 'complete', release: 'complete', commit: 'complete', play: 'complete' });
});

test('release step: targets the marker and explains the lane colours', () => {
  const v = tutorialView(run([{ type: 'choreoStart' }, { type: 'chipMoved' }, { type: 'carrierChanged' }]));
  assert.equal(v.step, 'release');
  assert.equal(v.target, 'releaseMarker');
  assert.match(v.hint, /orange diamond/i);
  assert.match(v.hint, /green/i);
  assert.match(v.hint, /red/i);
});

test('release before a pass does not count', () => {
  const v = tutorialView(run([{ type: 'choreoStart' }, { type: 'releaseChanged' }]));
  assert.equal(v.statuses.release, 'pending');
});

test('release can still be set after commit, then play finishes it', () => {
  const s = run([{ type: 'choreoStart' }, { type: 'chipMoved' }, { type: 'carrierChanged' }, { type: 'choreoCommit' }]);
  assert.equal(tutorialView(s).step, 'release');
  const done = run([{ type: 'releaseChanged' }, { type: 'playStart' }], s);
  assert.equal(tutorialView(done).done, true);
});

test('cancel also drops a chosen release point', () => {
  const v = tutorialView(run([{ type: 'choreoStart' }, { type: 'chipMoved' }, { type: 'carrierChanged' }, { type: 'releaseChanged' }, { type: 'choreoCancel' }]));
  assert.equal(v.statuses.release, 'pending');
});

test('move and pass before Choreo do not count', () => {
  const v = tutorialView(run([{ type: 'chipMoved' }, { type: 'carrierChanged' }, { type: 'playStart' }]));
  assert.equal(v.step, 'choreo');
});

test('pass step targets the carrier chip (the carried ball is too small to click)', () => {
  const v = tutorialView(run([{ type: 'choreoStart' }, { type: 'chipMoved' }]));
  assert.equal(v.step, 'pass');
  assert.equal(v.target, 'carrier');
  assert.match(v.hint, /click #7/i);
});

test('pass hint does not say "click #7" when he is already selected (a click would deselect him)', () => {
  const v = tutorialView(run([{ type: 'choreoStart' }, { type: 'chipMoved' }]), { carrierSelected: true });
  assert.doesNotMatch(v.hint, /click #7/i);
  assert.match(v.hint, /already selected/i);
  assert.match(v.hint, /Pass to/);
});

test('passing before dragging completes pass and leaves move active', () => {
  const v = tutorialView(run([{ type: 'choreoStart' }, { type: 'carrierChanged' }]));
  assert.equal(v.step, 'move');
  assert.equal(v.statuses.pass, 'complete');
  assert.equal(v.statuses.commit, 'pending');
  assert.equal(v.statuses.move, 'active');
});

test('cancel drops the in-progress choreo steps', () => {
  const v = tutorialView(run([{ type: 'choreoStart' }, { type: 'chipMoved' }, { type: 'choreoCancel' }]));
  assert.equal(v.step, 'choreo');
  assert.equal(v.statuses.move, 'pending');
});

test('commit without a move and a pass resets to Choreo with a note', () => {
  const v = tutorialView(run([{ type: 'choreoStart' }, { type: 'chipMoved' }, { type: 'choreoCommit' }]));
  assert.equal(v.step, 'choreo');
  assert.equal(v.statuses.commit, 'pending');
  assert.match(v.hint, /without a pass/i);
});

test('the note clears on the next progress', () => {
  const v = tutorialView(run([{ type: 'choreoStart' }, { type: 'choreoCommit' }, { type: 'choreoStart' }]));
  assert.equal(v.step, 'move');
  assert.doesNotMatch(v.hint, /without/i);
});

test('play before commit does not count', () => {
  const v = tutorialView(run([{ type: 'choreoStart' }, { type: 'chipMoved' }, { type: 'carrierChanged' }, { type: 'releaseChanged' }, { type: 'playStart' }]));
  assert.equal(v.step, 'commit');
});

test('unknown events and repeats leave state unchanged', () => {
  const s = run([{ type: 'choreoStart' }]);
  assert.deepEqual(tutorialReducer(s, { type: 'bogus' }), s);
  assert.deepEqual(tutorialView(tutorialReducer(s, { type: 'choreoStart' })).step, 'move');
});

test('reducer does not mutate its input', () => {
  const s = initialTutorial();
  const snap = JSON.stringify(s);
  tutorialReducer(s, { type: 'choreoStart' });
  assert.equal(JSON.stringify(s), snap);
});

test('resume keeps committed progress but drops an unfinished choreo', () => {
  const mid = run([{ type: 'choreoStart' }, { type: 'chipMoved' }, { type: 'carrierChanged' }, { type: 'releaseChanged' }]);
  const resumedMid = tutorialView(resumeTutorial(mid));
  assert.equal(resumedMid.step, 'choreo');
  assert.equal(resumedMid.statuses.release, 'pending');
  const committed = run([{ type: 'choreoStart' }, { type: 'chipMoved' }, { type: 'carrierChanged' }, { type: 'releaseChanged' }, { type: 'choreoCommit' }]);
  assert.equal(tutorialView(resumeTutorial(committed)).step, 'play');
});

test('resume tolerates garbage input', () => {
  assert.equal(tutorialView(resumeTutorial(null)).step, 'choreo');
  assert.equal(tutorialView(resumeTutorial({ completed: ['nope', 42] })).step, 'choreo');
  assert.equal(tutorialView(resumeTutorial('x')).step, 'choreo');
});

test('stallCue: nothing before 8 s, pulse after, static highlight with reduced motion', () => {
  assert.equal(stallCue(7999), null);
  assert.equal(stallCue(8000), 'pulse');
  assert.equal(stallCue(8000, { reducedMotion: true }), 'highlight');
  assert.equal(stallCue(20000, { done: true }), null);
});
