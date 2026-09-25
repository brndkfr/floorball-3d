// Orthographic frustum for the top-down (2D) view that fits the rink into the
// stage: the window minus the shell insets (rail, top bar, docked right
// panel, phone tab bar). The frustum is asymmetric so world (0, 0), the
// point the camera looks at, lands on the stage centre, not the window's.
// `half` is the rink's half-extent (margin included) along screen x / y.
export function stageFrustum({ vw, vh, insets = {}, half }) {
  let { left = 0, right = 0, top = 0, bottom = 0 } = insets;
  if (vw - left - right < 1 || vh - top - bottom < 1) left = right = top = bottom = 0;
  const sw = vw - left - right, sh = vh - top - bottom;
  const perPx = Math.max((2 * half.x) / sw, (2 * half.y) / sh);
  const cx = left + sw / 2, cy = top + sh / 2;
  return {
    left: -cx * perPx,
    right: (vw - cx) * perPx,
    top: cy * perPx,
    bottom: -(vh - cy) * perPx,
  };
}
