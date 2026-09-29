// Wheel behaviour for the timeline strip, kept pure so it is Node-testable.
// Plain wheel resizes cards only while they all fit; once the strip
// overflows it scrolls instead, otherwise the last cards (and their x)
// end up clipped with no way to reach them but a thin scrollbar.
// Ctrl / Cmd + wheel always resizes.

const OVERFLOW_SLACK_PX = 2;   // ignore sub-pixel rounding overflow

export function stripWheelAction({ deltaX = 0, deltaY = 0, ctrlKey = false, metaKey = false, scrollWidth, clientWidth }) {
  const overflows = scrollWidth - clientWidth > OVERFLOW_SLACK_PX;
  if (overflows && !ctrlKey && !metaKey) {
    const dx = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
    return dx ? { kind: 'scroll', dx } : null;
  }
  if (!deltaY) return null;
  return { kind: 'resize', dir: deltaY < 0 ? 1 : -1 };
}
