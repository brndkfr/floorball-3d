// Wraps `fn` so a burst of calls (a slider's `input` events) runs it once per
// animation frame with the latest arguments (S-BACK-029 H3). `raf` / `caf`
// are injectable for Node tests.
export function coalesceToFrame(fn, raf = requestAnimationFrame, caf = cancelAnimationFrame) {
  let pending = 0;
  return (...args) => {
    if (pending) caf(pending);
    pending = raf(() => {
      pending = 0;
      fn(...args);
    });
  };
}
