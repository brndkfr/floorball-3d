// Pure helpers for the timeline transport (A-BACK-038): playback speeds,
// time formatting, seconds <-> ms for frame durations, and the per-frame
// menu. No DOM, so test/transport-math.test.js covers all of it.

// Slow motion is what a coach needs to explain a play; above 2x nothing
// is readable. Keys 1-4 pick these in order.
export const SPEEDS = [0.25, 0.5, 1, 2];

export function normalizeSpeed(n) {
  if (!Number.isFinite(n)) return 1;
  let best = SPEEDS[0];
  for (const s of SPEEDS) if (Math.abs(s - n) < Math.abs(best - n)) best = s;
  return best;
}

export function nextSpeed(s) {
  const i = SPEEDS.indexOf(normalizeSpeed(s));
  return SPEEDS[(i + 1) % SPEEDS.length];
}

export function speedForKey(key) {
  const k = Number(key);
  return Number.isInteger(k) && k >= 1 && k <= SPEEDS.length ? SPEEDS[k - 1] : null;
}

export function speedLabel(s) { return s + 'x'; }

const pad2 = (n) => String(n).padStart(2, '0');

// mm:ss.t, truncated (not rounded) so the readout never runs ahead of
// the scene.
export function formatTimecode(ms) {
  const tenths = Math.floor(Math.max(0, ms) / 100);
  return `${pad2(Math.floor(tenths / 600))}:${pad2(Math.floor(tenths / 10) % 60)}.${tenths % 10}`;
}

// Frame duration in seconds: one decimal at least, two when the 50 ms
// grid needs it (1.25).
export function formatSeconds(ms) {
  const s = (ms / 1000).toFixed(2);
  return s.endsWith('0') ? s.slice(0, -1) : s;
}

// Seconds typed by the user (comma or dot decimal) -> ms on the 50 ms
// grid setFrameDuration() expects; null when it isn't a positive number.
export function parseSecondsInput(str) {
  const n = Number(String(str).trim().replace(',', '.'));
  if (!String(str).trim() || !Number.isFinite(n) || n <= 0) return null;
  return Math.max(50, Math.round((n * 1000) / 50) * 50);
}

// A frame's duration is the transition to the next frame, so the last
// frame's value is never played (playback.js totalDuration()).
export function durationEditable(index, count) { return index < count - 1; }

export function frameMenuItems({ count, hasCamera }) {
  return [
    { action: 'dup', label: 'Duplicate' },
    { action: 'ins-before', label: 'Insert blank before' },
    { action: 'ins-after', label: 'Insert blank after' },
    { action: 'cam', label: hasCamera ? 'Clear camera keyframe' : 'Set camera to current view' },
    { action: 'del', label: 'Delete frame', danger: true, disabled: count <= 1 },
  ];
}

// --- Variant A time track (A-BACK-038 step 3) ---------------------------
// Frame segments are as wide as their duration (pxPerSec), with a minimum
// so a 0.2 s frame still holds its number and menu. The last frame has no
// duration (playback ends on it) and gets a fixed end cap. Time <-> x maps
// through the segments, so the playhead and the ruler stay on the cards
// even where a segment is clamped.

export function layoutTrack(durations, { pxPerSec, minW = 72, endW = 56 }) {
  const segs = [];
  let x = 0, t = 0;
  durations.forEach((d, i) => {
    if (i === durations.length - 1) { segs.push({ x, w: endW, startMs: t, endMs: t }); return; }
    const w = Math.max(minW, (d / 1000) * pxPerSec);
    segs.push({ x, w, startMs: t, endMs: t + d });
    x += w; t += d;
  });
  return segs;
}

export function timeToX(ms, segs) {
  for (const s of segs) {
    if (s.endMs > s.startMs && ms < s.endMs) {
      return s.x + (Math.max(ms, s.startMs) - s.startMs) / (s.endMs - s.startMs) * s.w;
    }
  }
  return segs.length ? segs[segs.length - 1].x : 0;
}

export function xToTime(x, segs) {
  for (const s of segs) {
    if (s.endMs > s.startMs && x < s.x + s.w) {
      const f = Math.max(0, x - s.x) / s.w;
      return Math.round((s.startMs + f * (s.endMs - s.startMs)) / 10) * 10;
    }
  }
  return segs.length ? segs[segs.length - 1].startMs : 0;
}

export function rulerTicks(segs, stepMs = 500) {
  const total = segs.length ? segs[segs.length - 1].startMs : 0;
  const ticks = [];
  for (let t = 0; t <= total; t += stepMs) {
    ticks.push({ x: timeToX(t, segs), label: t % 1000 === 0 ? `${t / 1000}s` : '' });
  }
  return ticks;
}

// Dragging a segment's right edge by dx px changes its duration at the
// track's scale, on the same 50 ms grid as typed durations.
export function durationFromDrag(startMs, dxPx, pxPerSec) {
  return Math.max(50, Math.round((startMs + (dxPx / pxPerSec) * 1000) / 50) * 50);
}

export function clampZoom(pxPerSec) { return Math.min(Math.max(pxPerSec, 30), 480); }
