// Pure placement math for the 3D player figures (A-BACK-031). three-free so
// it runs under node --test; figures.js applies it to the scene.
//
// The figure is a child of its chip group, and chips.js scales that whole
// group by CHIP_DISPLAY_SCALE (3.5x). glTF is in metres and the scene in mm,
// so the figure's local scale is 1000 / displayScale, which lands at a real
// 1000x in world space. Using 1000 directly would make players ~9 m tall.

// Bind-pose height of Quaternius' Superhero_Male_FullBody (top of head,
// read from the glTF's position accessor max).
export const FIGURE_MODEL_HEIGHT_M = 1.81;

// World height of the number / label sprite above a figure, mm. Estimate:
// just above a 1.81 m head so the number never sits inside it.
export const FIGURE_LABEL_HEIGHT_MM = 2050;

// Under a figure the filled team disc is replaced by a thin team-coloured
// ring on the floor (S-BACK-030 step 8), so the player stands on the floor
// and not on a game piece. World mm, both estimates: a little wider than a
// stance.
export const FIGURE_RING_RADIUS_MM = 300;
const FIGURE_RING_WIDTH_MM = 40;

// The ring's radii in chip-local units (the chip group is scaled).
export function figureRingRadii(displayScale) {
  return {
    inner: (FIGURE_RING_RADIUS_MM - FIGURE_RING_WIDTH_MM) / displayScale,
    outer: FIGURE_RING_RADIUS_MM / displayScale,
  };
}

export function figureModelScale(displayScale) {
  return 1000 / displayScale;
}

// Figures are a perspective-view aid only: top-down keeps plain chips (a
// figure seen from 60 m above is a blob that hides the number).
export function figureShouldShow({ enabled, topDown }) {
  return !!enabled && !topDown;
}

// How far (chip-local units) to raise the chip's sprites while a figure is
// shown, so the number floats above the head instead of at the feet.
export function figureSpriteLift(displayScale, shown = true) {
  return shown ? FIGURE_LABEL_HEIGHT_MM / displayScale : 0;
}
