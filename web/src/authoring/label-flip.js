// Pure math for camera-aware flipping of floor-plane labels (arrow / zone).
//
// Floor labels lie flat on the rink; their text reads along a fixed world
// direction baked in at build time. When the camera orbits so that its
// "right" no longer aligns with the label's reading direction, the text
// appears mirrored. We fix that by flipping the label 180 deg in the
// floor plane whenever the camera's right vector points against the
// label's reading direction.
//
// Both inputs are 2D vectors in the world XZ plane. Neither has to be
// normalized - only the sign of the dot product matters.
export function shouldFlipFloorLabel(textDirXZ, camRightXZ) {
  const d = textDirXZ.x * camRightXZ.x + textDirXZ.z * camRightXZ.z;
  return d < 0;
}
