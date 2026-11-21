// A-BACK-035: frame notes. A caption per frame (`frames[i].note`), shown
// during playback and burned into the video export. Own notes are a string;
// shipped lessons (A-BACK-049) store { en, de } (A-BACK-052).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { NOTE_MAX, sanitizeNote, noteText, noteFrameAt, wrapCaption, captionBox } = await import('../web/src/authoring/frame-notes.js');

test('sanitizeNote: trimmed one-line text up to the limit; empty or junk means no note', () => {
  assert.equal(NOTE_MAX, 280);
  assert.equal(sanitizeNote('  Weak-side D slides to the slot  '), 'Weak-side D slides to the slot');
  assert.equal(sanitizeNote('a\nb\tc\u0007d'), 'a b c d');
  assert.equal(sanitizeNote('x'.repeat(400)).length, 280);
  for (const bad of ['', '   ', null, undefined, 42, [], true]) assert.equal(sanitizeNote(bad), undefined, String(bad));
});

test('sanitizeNote: per-language notes keep en / de strings only', () => {
  assert.deepEqual(sanitizeNote({ en: ' Shot ', de: 'Schuss', fr: 'Tir', x: 1 }), { en: 'Shot', de: 'Schuss' });
  assert.deepEqual(sanitizeNote({ de: 'Nur Deutsch' }), { de: 'Nur Deutsch' });
  assert.equal(sanitizeNote({ en: '', de: 7 }), undefined);
});

test('noteText: a plain note in any language; per-language notes fall back to English, then German', () => {
  assert.equal(noteText('Pass to the slot', 'de'), 'Pass to the slot');
  assert.equal(noteText({ en: 'Shot', de: 'Schuss' }, 'de'), 'Schuss');
  assert.equal(noteText({ en: 'Shot', de: 'Schuss' }, 'fr'), 'Shot');
  assert.equal(noteText({ de: 'Schuss' }, 'en'), 'Schuss');
  assert.equal(noteText(undefined, 'en'), '');
});

test('noteFrameAt: the frame whose move is playing; the last frame at and after the end', () => {
  const frames = [{ duration: 1000 }, { duration: 2000 }, { duration: 500 }];
  assert.equal(noteFrameAt(frames, 0), 0);
  assert.equal(noteFrameAt(frames, 999), 0);
  assert.equal(noteFrameAt(frames, 1000), 1);
  assert.equal(noteFrameAt(frames, 2999), 1);
  assert.equal(noteFrameAt(frames, 3000), 2);
  assert.equal(noteFrameAt(frames, 99999), 2);
  assert.equal(noteFrameAt([], 0), -1);
});

// measure: 10 px per character
const measure = (s) => s.length * 10;

test('wrapCaption: whole words per line, at most three lines, an ellipsis when it does not fit', () => {
  assert.deepEqual(wrapCaption('Weak-side D slides', 200, measure), ['Weak-side D slides']);
  assert.deepEqual(wrapCaption('Weak-side D slides to the slot', 120, measure), ['Weak-side D', 'slides to', 'the slot']);
  const long = wrapCaption('one two three four five six seven eight nine ten', 100, measure);
  assert.equal(long.length, 3);
  assert.ok(long[2].endsWith('…'));
  assert.ok(measure(long[2]) <= 100);
  assert.deepEqual(wrapCaption('', 100, measure), []);
  assert.deepEqual(wrapCaption('Supercalifragilistic', 100, measure), ['Supercali…']);   // a word wider than the line is cut
});

test('captionBox: centred near the bottom, sized to the lines', () => {
  const b = captionBox({ w: 1280, h: 720 }, { lines: 2, lineW: 600, fontPx: 25 });
  assert.equal(b.fontPx, 25);
  assert.ok(Math.abs(b.x + b.w / 2 - 640) < 1, 'centred');
  assert.ok(b.y + b.h < 720 && b.y + b.h > 720 - 80, 'near the bottom');
  assert.ok(b.w > 600 && b.h > 2 * 25);
});
