// Frame notes (A-BACK-035): a caption per frame, `frames[i].note`, shown
// during playback (frame-caption.js) and burned into the video export
// (export.js). Pure so it is Node-testable; doc.js cleans notes on load.
//
// A note is a string (the coach's own words, one language) or, for the
// lessons shipped with the app (A-BACK-049), { en, de } (A-BACK-052).

export const NOTE_MAX = 280;
const LANGS = ['en', 'de'];

function cleanText(s) {
  if (typeof s !== 'string') return undefined;
  const t = s.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX).trim();
  return t || undefined;
}

// A clean note, or undefined for "no note".
export function sanitizeNote(raw) {
  if (typeof raw === 'string') return cleanText(raw);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out = {};
  for (const l of LANGS) {
    const t = cleanText(raw[l]);
    if (t) out[l] = t;
  }
  return Object.keys(out).length ? out : undefined;
}

export function noteText(note, lang) {
  if (typeof note === 'string') return note;
  if (!note || typeof note !== 'object') return '';
  return note[lang] ?? note.en ?? note.de ?? '';
}

// Index of the frame whose move plays at `elapsedMs` (frame i's duration
// is the move from frame i to i + 1); the last frame at and after the end.
export function noteFrameAt(frames, elapsedMs) {
  if (!frames?.length) return -1;
  let acc = 0;
  for (let i = 0; i < frames.length - 1; i++) {
    acc += frames[i].duration;
    if (elapsedMs < acc) return i;
  }
  return frames.length - 1;
}

// Greedy word wrap with a measure(text) -> px callback. At most `maxLines`;
// what does not fit ends the last line with an ellipsis.
export function wrapCaption(text, maxWidth, measure, maxLines = 3) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  let i = 0;
  for (; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i];
    if (measure(next) <= maxWidth) { line = next; continue; }
    if (line) { lines.push(line); line = ''; i--; } else { lines.push(words[i]); }   // an over-wide word is cut below
    if (lines.length === maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  const cut = i < words.length;   // words left over
  const fit = (s) => {
    let t = s;
    while (t && measure(`${t}…`) > maxWidth) t = t.slice(0, -1);
    return `${t.trimEnd()}…`;
  };
  return lines.map((l, k) => {
    const last = k === lines.length - 1;
    if (measure(l) > maxWidth) return fit(l);
    return last && cut ? fit(l) : l;
  });
}

// Where the caption box goes in a w x h picture: centred, near the bottom.
export function captionBox({ w, h }, { lines, lineW, fontPx }) {
  const padX = Math.round(fontPx * 0.8), padY = Math.round(fontPx * 0.5);
  const lineH = Math.round(fontPx * 1.3);
  const bw = Math.round(lineW + 2 * padX), bh = Math.round(lines * lineH + 2 * padY);
  const margin = Math.round(h * 0.05);
  return { x: Math.round((w - bw) / 2), y: h - margin - bh, w: bw, h: bh, fontPx, lineH, padX, padY };
}
