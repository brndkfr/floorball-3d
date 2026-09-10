// Turns pose keypoints (image px) into a world-space facing angle in
// degrees, matching Phase 3.5's convention:
//   facingDeg = atan2(dx, dz), 0° points down +z, 90° points down +x.
// The torso has TWO parallel lines in the pose model - shoulders and hips.
// Whichever has the larger image-space L/R separation is a more reliable
// "which side of the body faces the camera" cue (since a small pixel gap
// is dominated by noise + the keypoint model's per-side uncertainty).
// The image-space anatomical L/R order is the primary disambiguation:
// when a player faces AWAY from the camera, their anatomical LEFT
// appears on the image RIGHT (u_L > u_R). Nose is a last-resort tiebreaker.
import { backProjectToHeight } from './back-project.js';
import { KP_NOSE, KP_LEFT_SHOULDER, KP_RIGHT_SHOULDER, KP_LEFT_HIP, KP_RIGHT_HIP } from './detect-pose.js';

// Rough anthropometric offsets above the standing player's foot. Not
// sourced spec - estimated for adult unihockey players (~1.80m tall).
const SHOULDER_HEIGHT_MM = 1400;
const HIP_HEIGHT_MM = 900;
const NOSE_HEIGHT_MM = 1650;

const MIN_TORSO_CONF = 0.5;
const MIN_NOSE_CONF = 0.35;
// Below this pixel L/R separation, image-order alone barely carries any
// sign information (player is close to edge-on to the camera).
const EDGE_ON_PX = 8;

// Returns { facingDeg, quality, cue } or null if the pose is too
// uncertain. `cue` names which rule fired (shoulders / hips / nose /
// hybrid) - useful when debugging wrong-way arrows on real photos.
export function facingFromKeypoints(keypoints, camera, imageWH) {
  const shoulders = torsoLine(
    keypoints[KP_LEFT_SHOULDER], keypoints[KP_RIGHT_SHOULDER],
    SHOULDER_HEIGHT_MM, camera, imageWH,
  );
  const hips = torsoLine(
    keypoints[KP_LEFT_HIP], keypoints[KP_RIGHT_HIP],
    HIP_HEIGHT_MM, camera, imageWH,
  );

  // Pick the torso line with the larger image-space L/R separation - that
  // one's sign is least dominated by pixel noise. If both are edge-on,
  // require the nose.
  let primary = null, primaryTag = null, secondary = null, secondaryTag = null;
  if (shoulders && hips) {
    if (Math.abs(shoulders.pxSep) >= Math.abs(hips.pxSep)) {
      primary = shoulders; primaryTag = 'shoulders';
      secondary = hips; secondaryTag = 'hips';
    } else {
      primary = hips; primaryTag = 'hips';
      secondary = shoulders; secondaryTag = 'shoulders';
    }
  } else if (shoulders) {
    primary = shoulders; primaryTag = 'shoulders';
  } else if (hips) {
    primary = hips; primaryTag = 'hips';
  } else {
    return null;
  }

  const nose = keypoints[KP_NOSE];
  const noseReliable = !!(nose && nose.conf >= MIN_NOSE_CONF);
  const primaryReliable = Math.abs(primary.pxSep) >= EDGE_ON_PX;

  let signedPerpX, signedPerpZ, cue;
  if (primaryReliable) {
    ({ perpX: signedPerpX, perpZ: signedPerpZ } = orientedPerp(primary, camera));
    cue = primaryTag;
    // If the secondary torso line agrees, upgrade the cue label; if it
    // disagrees, note it (but trust the primary - larger pxSep = less noisy).
    if (secondary && Math.abs(secondary.pxSep) >= EDGE_ON_PX) {
      const secOriented = orientedPerp(secondary, camera);
      const secAgrees = secOriented.perpX * signedPerpX + secOriented.perpZ * signedPerpZ > 0;
      cue = secAgrees ? `${primaryTag}+${secondaryTag}` : `${primaryTag}(${secondaryTag}-disagrees)`;
    }
  } else if (noseReliable) {
    // Both torso lines edge-on: use nose relative to torso midpoint.
    const noseWorld = backProjectToHeight(nose.x, nose.y, camera, imageWH, NOSE_HEIGHT_MM);
    if (!noseWorld) return null;
    const toNoseX = noseWorld[0] - primary.midX;
    const toNoseZ = noseWorld[2] - primary.midZ;
    // Perpendicular either way, pick the one aligned with the nose.
    if (toNoseX * primary.perpX + toNoseZ * primary.perpZ > 0) {
      signedPerpX = primary.perpX; signedPerpZ = primary.perpZ;
    } else {
      signedPerpX = -primary.perpX; signedPerpZ = -primary.perpZ;
    }
    cue = 'nose';
  } else {
    return null; // edge-on and no reliable nose - refuse to guess
  }

  const facingDeg = Math.atan2(signedPerpX, signedPerpZ) * 180 / Math.PI;
  return {
    facingDeg,
    quality: primary.conf,
    cue,
  };
}

// Back-projects a left/right keypoint pair onto a horizontal plane at
// worldY and returns { midX, midZ, perpX, perpZ, pxSep, conf }, or null
// if the pair is too low-confidence or degenerate in world XZ.
function torsoLine(leftKp, rightKp, worldY, camera, imageWH) {
  if (!leftKp || !rightKp) return null;
  if (leftKp.conf < MIN_TORSO_CONF || rightKp.conf < MIN_TORSO_CONF) return null;
  const lw = backProjectToHeight(leftKp.x, leftKp.y, camera, imageWH, worldY);
  const rw = backProjectToHeight(rightKp.x, rightKp.y, camera, imageWH, worldY);
  if (!lw || !rw) return null;
  const sx = rw[0] - lw[0];
  const sz = rw[2] - lw[2];
  const len = Math.hypot(sx, sz);
  if (len < 1) return null;
  return {
    midX: (lw[0] + rw[0]) / 2,
    midZ: (lw[2] + rw[2]) / 2,
    perpX: sz / len,
    perpZ: -sx / len,
    pxSep: leftKp.x - rightKp.x,
    conf: Math.min(leftKp.conf, rightKp.conf),
  };
}

// Returns whichever of the two candidate perpendiculars agrees with the
// image-space L/R order + camera direction rule. COCO anatomical L: when
// a player faces the camera, their L shoulder is on the camera's RIGHT
// (image high-x, LS.x > RS.x → pxSep > 0). So pxSep > 0 → facing TOWARD.
function orientedPerp(line, camera) {
  const camAwayX = line.midX - camera.position.x;
  const camAwayZ = line.midZ - camera.position.z;
  const perpDotAway = line.perpX * camAwayX + line.perpZ * camAwayZ;
  const facesAway = line.pxSep < 0;
  if (facesAway === (perpDotAway > 0)) {
    return { perpX: line.perpX, perpZ: line.perpZ };
  }
  return { perpX: -line.perpX, perpZ: -line.perpZ };
}


