// Title card and recap card of a lesson (A-BACK-049): the lesson starts
// with a card holding its task and ends with a card holding what to take
// away. Pure and DOM-free so it is Node-testable (test/lesson-cards.test.js);
// authoring/lesson-cards-ui.js shows them in Train.
//
// A lesson doc carries them as `doc.lesson`:
//   { intro: { title?, task },  recap: { title?, bullets: [..] } }
// every text a note ({ en, de } or a string, frame-notes.js). Docs without
// `lesson` (old docs, the other lessons, the coach's own plays) show none.

import { sanitizeNote, noteText } from './authoring/frame-notes.js';

export const RECAP_BULLETS_MAX = 5;

// A clean `lesson` for a doc from outside (acceptDoc), undefined for none.
export function sanitizeLessonCards(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out = {};
  const task = sanitizeNote(raw.intro?.task);
  if (task) {
    out.intro = { task };
    const title = sanitizeNote(raw.intro?.title);
    if (title) out.intro.title = title;
  }
  const bullets = Array.isArray(raw.recap?.bullets)
    ? raw.recap.bullets.map(sanitizeNote).filter(Boolean).slice(0, RECAP_BULLETS_MAX)
    : [];
  if (bullets.length) {
    out.recap = { bullets };
    const title = sanitizeNote(raw.recap?.title);
    if (title) out.recap.title = title;
  }
  return out.intro || out.recap ? out : undefined;
}

// Which card is on: 'intro' until the lesson is first played (`introPending`,
// set when it is opened), 'recap' when a stopped play sits at its end, else
// null. `total` is the play length in ms.
export function cardToShow({ lesson, introPending, playing, elapsed, total }) {
  if (!lesson || playing) return null;
  if (lesson.intro && introPending) return 'intro';
  if (lesson.recap && total > 0 && elapsed >= total) return 'recap';
  return null;
}

// What the card says in `lang`: { title, text, bullets }.
export function cardContent(lesson, which, lang) {
  const c = lesson?.[which];
  if (!c) return null;
  return {
    title: noteText(c.title, lang),
    text: which === 'intro' ? noteText(c.task, lang) : '',
    bullets: which === 'recap' ? (c.bullets ?? []).map((b) => noteText(b, lang)) : [],
  };
}
