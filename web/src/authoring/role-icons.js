// Shared 2D-canvas glyphs for the three player roles (Option A: shield /
// bullseye / chevron). One draw function keeps the popover buttons and the
// floating 3D badge above each chip visually identical.

export const ROLE_COLORS = {
  defender: '#3b5bdb',
  center: '#7048e8',
  wing: '#0ca678',
};

// Draw a role glyph filling a size x size canvas. When `withBackground` is
// true (the default) a filled circle in the role colour with a thin white
// border is rendered first, and the glyph is stroked/filled in white on top.
// When false, glyph is drawn in the role colour directly - used for the
// popover buttons where the button's own background already carries colour.
export function drawRoleGlyph(ctx, role, size, { withBackground = true } = {}) {
  ctx.clearRect(0, 0, size, size);
  const bg = ROLE_COLORS[role];
  if (!bg) return;
  const fg = withBackground ? '#ffffff' : bg;
  const s = size;
  if (withBackground) {
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s / 2 - Math.max(2, s * 0.05), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(2, s * 0.05);
    ctx.stroke();
  }
  ctx.strokeStyle = fg;
  ctx.fillStyle = fg;
  ctx.lineWidth = Math.max(2, s * 0.08);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (role === 'defender') {
    // Shield outline
    const cx = s / 2, cy = s / 2;
    const w = s * 0.44, h = s * 0.5;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, cy - h / 2 + 2);
    ctx.lineTo(cx + w / 2, cy - h / 2 + 2);
    ctx.lineTo(cx + w / 2, cy);
    ctx.quadraticCurveTo(cx + w / 2, cy + h / 2, cx, cy + h / 2 + 4);
    ctx.quadraticCurveTo(cx - w / 2, cy + h / 2, cx - w / 2, cy);
    ctx.closePath();
    ctx.stroke();
  } else if (role === 'center') {
    // Bullseye: outer ring + filled inner dot
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.1, 0, Math.PI * 2);
    ctx.fill();
  } else if (role === 'wing') {
    // Double chevron pointing right
    for (const off of [-s * 0.12, s * 0.08]) {
      ctx.beginPath();
      ctx.moveTo(s / 2 + off - s * 0.1, s / 2 - s * 0.18);
      ctx.lineTo(s / 2 + off + s * 0.1, s / 2);
      ctx.lineTo(s / 2 + off - s * 0.1, s / 2 + s * 0.18);
      ctx.stroke();
    }
  }
}
