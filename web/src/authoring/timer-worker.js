// Background timer for playback. Kept alive as a Web Worker so browser
// tab-visibility throttling doesn't clamp the tick rate down to 1 Hz,
// which would otherwise stutter playback and (later) break recording.

let handle = null;

function start(hz) {
  stop();
  const period = Math.max(4, Math.round(1000 / hz));
  const startedAt = performance.now();
  let last = startedAt;
  handle = setInterval(() => {
    const now = performance.now();
    self.postMessage({ t: 'tick', dt: now - last, now });
    last = now;
  }, period);
}

function stop() {
  if (handle) { clearInterval(handle); handle = null; }
}

self.onmessage = (e) => {
  const { t, hz } = e.data || {};
  if (t === 'start') start(hz || 60);
  else if (t === 'stop') stop();
};
