// On-screen size clamp for chip number / label / role sprites in the 3D
// view (S-BACK-030 step 8). Pure math, three-free so it runs under
// node --test; chips.js applies it every frame.
//
// A sprite is drawn with perspective, so its 385 mm (110 mm x the 3.5x
// chip display scale) balloons next to the camera and shrinks to a dot
// across the rink. spriteScaleFor() returns the factor that brings it back
// into SPRITE_PX; inside the range it returns 1 and the sprite keeps its
// real size.

// Sprite height on screen, px. Estimates: the number glyph is about two
// thirds of the sprite, so 18 px keeps it readable (~12 px digits) and
// 40 px stops it covering a close-up figure's head.
export const SPRITE_PX = Object.freeze({ min: 18, max: 40 });

const focalPx = (viewportH, fovDeg) => (viewportH / 2) / Math.tan((fovDeg * Math.PI) / 360);

// On-screen height (px) of `worldMm` at `distanceMm` in front of a
// perspective camera with vertical FOV `fovDeg` in a `viewportH` px view.
export function spritePx(worldMm, distanceMm, { fovDeg, viewportH }) {
  return (worldMm * focalPx(viewportH, fovDeg)) / distanceMm;
}

export function spriteScaleFor(worldMm, distanceMm, view, range = SPRITE_PX) {
  if (!(distanceMm > 0)) return 1;
  const px = spritePx(worldMm, distanceMm, view);
  if (px < range.min) return range.min / px;
  if (px > range.max) return range.max / px;
  return 1;
}
