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

// Clamps a card anchored at its bottom centre (x, y) into the stage, the
// window minus the shell insets, with a small margin. Used by the chip
// popover: in the 3D view the canvas also runs under the docked panels, so
// a chip near an edge would otherwise put its popover under them. Falls back
// to the whole window when the insets leave no room.
export function clampToStage({ x, y, cardW, cardH, vw, vh, insets = {}, margin = 8 }) {
  let { left = 0, right = 0, top = 0, bottom = 0 } = insets;
  if (vw - left - right < cardW + 2 * margin || vh - top - bottom < cardH + 2 * margin) left = right = top = bottom = 0;
  return {
    x: Math.max(left + cardW / 2 + margin, Math.min(vw - right - cardW / 2 - margin, x)),
    y: Math.max(top + cardH + margin, Math.min(vh - bottom - margin, y)),
  };
}

// The shell insets as the CSS sets them for the current breakpoint
// (--shell-rail, --shell-topbar, --right-panel, --tabbar; 0 when unset).
export function readShellInsets() {
  const css = getComputedStyle(document.documentElement);
  const px = (name) => parseFloat(css.getPropertyValue(name)) || 0;
  return { left: px('--shell-rail'), top: px('--shell-topbar'), right: px('--right-panel'), bottom: px('--tabbar') };
}
