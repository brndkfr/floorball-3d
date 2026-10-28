import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SPEEDS, normalizeSpeed, nextSpeed, speedForKey, speedLabel,
  formatTimecode, formatSeconds, parseSecondsInput,
  durationEditable, frameMenuItems,
} from '../web/src/authoring/transport-math.js';

test('speeds are slow motion up to double, 1x included', () => {
  assert.deepEqual(SPEEDS, [0.25, 0.5, 1, 2]);
});

test('normalizeSpeed snaps any value to the nearest allowed speed', () => {
  assert.equal(normalizeSpeed(1), 1);
  assert.equal(normalizeSpeed(0.3), 0.25);
  assert.equal(normalizeSpeed(9), 2);   // old 1..9 range
  assert.equal(normalizeSpeed(NaN), 1);
  assert.equal(normalizeSpeed(undefined), 1);
});

test('nextSpeed cycles through the speeds and wraps', () => {
  assert.equal(nextSpeed(0.25), 0.5);
  assert.equal(nextSpeed(1), 2);
  assert.equal(nextSpeed(2), 0.25);
  assert.equal(nextSpeed(5), 0.25);     // 5 snaps to 2 first
});

test('keys 1-4 pick a speed, anything else does not', () => {
  assert.equal(speedForKey('1'), 0.25);
  assert.equal(speedForKey('3'), 1);
  assert.equal(speedForKey('4'), 2);
  assert.equal(speedForKey('5'), null);
  assert.equal(speedForKey('0'), null);
  assert.equal(speedForKey('a'), null);
});

test('speedLabel', () => {
  assert.equal(speedLabel(0.25), '0.25x');
  assert.equal(speedLabel(1), '1x');
});

test('formatTimecode is mm:ss.t, truncating to tenths', () => {
  assert.equal(formatTimecode(0), '00:00.0');
  assert.equal(formatTimecode(3449), '00:03.4');
  assert.equal(formatTimecode(8000), '00:08.0');
  assert.equal(formatTimecode(65_250), '01:05.2');
  assert.equal(formatTimecode(-5), '00:00.0');
});

test('formatSeconds shows at least one decimal, more only when needed', () => {
  assert.equal(formatSeconds(1000), '1.0');
  assert.equal(formatSeconds(1500), '1.5');
  assert.equal(formatSeconds(1250), '1.25');
  assert.equal(formatSeconds(50), '0.05');
});

test('parseSecondsInput turns seconds into ms, snapped to 50 ms, min 50', () => {
  assert.equal(parseSecondsInput('1.5'), 1500);
  assert.equal(parseSecondsInput('1,5'), 1500);   // comma decimal (de-CH)
  assert.equal(parseSecondsInput('2'), 2000);
  assert.equal(parseSecondsInput('0.33'), 350);
  assert.equal(parseSecondsInput('0.01'), 50);
  assert.equal(parseSecondsInput(''), null);
  assert.equal(parseSecondsInput('abc'), null);
  assert.equal(parseSecondsInput('0'), null);
  assert.equal(parseSecondsInput('-1'), null);
});

test('the last frame has no duration: playback ends on it', () => {
  assert.equal(durationEditable(0, 3), true);
  assert.equal(durationEditable(1, 3), true);
  assert.equal(durationEditable(2, 3), false);
  assert.equal(durationEditable(0, 1), false);
});

test('frame menu: delete comes last, marked danger, disabled on the only frame', () => {
  const items = frameMenuItems({ count: 3, hasCamera: false });
  assert.deepEqual(items.map((m) => m.action), ['dup', 'ins-before', 'ins-after', 'cam', 'del']);
  const del = items.at(-1);
  assert.equal(del.danger, true);
  assert.equal(del.disabled, false);
  assert.equal(frameMenuItems({ count: 1, hasCamera: false }).at(-1).disabled, true);
});

test('frame menu: camera entry says what it will do', () => {
  const cam = (hasCamera) => frameMenuItems({ count: 2, hasCamera }).find((m) => m.action === 'cam').label;
  assert.equal(cam(false), 'Set camera to current view');
  assert.equal(cam(true), 'Clear camera keyframe');
});
