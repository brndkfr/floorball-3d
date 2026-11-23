// Title card and recap card of a lesson (A-BACK-049).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { sanitizeLessonCards, cardToShow, cardContent } = await import('../web/src/lesson-cards.js');

const lesson = {
  intro: { title: { en: 'Lesson', de: 'Lektion' }, task: { en: 'Watch the goalie', de: 'Schau auf den Goalie' } },
  recap: { bullets: [{ en: 'One', de: 'Eins' }, { en: 'Two', de: 'Zwei' }] },
};

test('sanitizeLessonCards: keeps clean intro and recap, drops anything else', () => {
  assert.deepEqual(sanitizeLessonCards(JSON.parse(JSON.stringify(lesson))), lesson);
  assert.equal(sanitizeLessonCards(undefined), undefined);
  assert.equal(sanitizeLessonCards('x'), undefined);
  assert.equal(sanitizeLessonCards([]), undefined);
  assert.equal(sanitizeLessonCards({ intro: {}, recap: { bullets: [] } }), undefined);
  assert.deepEqual(sanitizeLessonCards({ intro: { task: 'Do it', evil: 1 }, extra: 1 }), { intro: { task: 'Do it' } });
});

test('sanitizeLessonCards: at most 5 bullets, empty ones dropped', () => {
  const r = sanitizeLessonCards({ recap: { bullets: ['a', '', 'b', 'c', 'd', 'e', 'f', 'g'] } });
  assert.deepEqual(r.recap.bullets, ['a', 'b', 'c', 'd', 'e']);
});

test('cardToShow: the intro until the first play, the recap when a stopped play sits at its end', () => {
  const base = { lesson, introPending: true, playing: false, elapsed: 0, total: 10000 };
  assert.equal(cardToShow(base), 'intro');
  assert.equal(cardToShow({ ...base, playing: true }), null, 'playing hides it');
  assert.equal(cardToShow({ ...base, introPending: false }), null);
  assert.equal(cardToShow({ ...base, introPending: false, elapsed: 10000 }), 'recap');
  assert.equal(cardToShow({ ...base, introPending: false, elapsed: 10000, playing: true }), null);
  assert.equal(cardToShow({ ...base, introPending: false, elapsed: 9000 }), null);
});

test('cardToShow: no lesson cards, no card; a lesson with only one of them shows only that one', () => {
  assert.equal(cardToShow({ lesson: undefined, introPending: true, playing: false, elapsed: 0, total: 5 }), null);
  assert.equal(cardToShow({ lesson: { recap: lesson.recap }, introPending: true, playing: false, elapsed: 0, total: 5 }), null);
  assert.equal(cardToShow({ lesson: { intro: lesson.intro }, introPending: false, playing: false, elapsed: 5, total: 5 }), null);
  assert.equal(cardToShow({ lesson, introPending: false, playing: false, elapsed: 0, total: 0 }), null, 'no recap for an empty play');
});

test('cardContent: text in the language, English as the fallback', () => {
  assert.deepEqual(cardContent(lesson, 'intro', 'de'), { title: 'Lektion', text: 'Schau auf den Goalie', bullets: [] });
  assert.deepEqual(cardContent(lesson, 'recap', 'en'), { title: '', text: '', bullets: ['One', 'Two'] });
  assert.equal(cardContent(lesson, 'intro', 'fr').text, 'Watch the goalie');
  assert.equal(cardContent({}, 'intro', 'en'), null);
});
