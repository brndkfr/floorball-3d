// Back-projects photo pixel coordinates onto the rink floor (y=0 plane)
// through the solved photoCamera, for Phase 2 (YOLO player auto-detect).
// See docs/phase-2-plan.md T2.
import * as THREE from 'three';
import { RINK_L, HALF_W } from '../../constants.js';

const OUT_OF_BOUNDS_MARGIN = 2000; // mm; drops spectators/bench, see phase-2-plan.md T2

const _floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _ndc = new THREE.Vector3();
const _hit = new THREE.Vector3();
const _ray = new THREE.Ray();

// pxX/pxY are original image pixels (+Y down); imageWH = [imgW, imgH].
// Returns [x, 0, z] world mm, or null if the ray points above the horizon
// (does not intersect the floor plane in front of the camera).
export function backProjectFoot(pxX, pxY, camera, imageWH) {
  const [imgW, imgH] = imageWH;
  const ndcX = (2 * pxX) / imgW - 1;
  const ndcY = 1 - (2 * pxY) / imgH;
  _ndc.set(ndcX, ndcY, 0.5).unproject(camera);
  _ray.origin.copy(camera.position);
  _ray.direction.copy(_ndc).sub(camera.position).normalize();
  if (_ray.intersectPlane(_floorPlane, _hit) === null) return null;
  return [_hit.x, 0, _hit.z];
}

// Same as backProjectFoot but intersects a horizontal plane at y=worldY.
// Used for pose keypoints (shoulders ~1400mm, nose ~1650mm above the
// player's foot) - we still get a floor-parallel XZ position for facing
// math without pretending the shoulders sit on the floor.
const _planeAtHeight = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
export function backProjectToHeight(pxX, pxY, camera, imageWH, worldY) {
  const [imgW, imgH] = imageWH;
  const ndcX = (2 * pxX) / imgW - 1;
  const ndcY = 1 - (2 * pxY) / imgH;
  _ndc.set(ndcX, ndcY, 0.5).unproject(camera);
  _ray.origin.copy(camera.position);
  _ray.direction.copy(_ndc).sub(camera.position).normalize();
  _planeAtHeight.constant = -worldY; // plane y=worldY -> ax+by+cz+d=0 with n=(0,1,0), d=-worldY
  if (_ray.intersectPlane(_planeAtHeight, _hit) === null) return null;
  return [_hit.x, worldY, _hit.z];
}

// YOLO bbox is [x, y, w, h] in original image px; foot = bottom-center,
// assuming the player is standing on the floor.
export function footPixel([x, y, w, h]) {
  return [x + w / 2, y + h];
}

// boxes = [{ bbox: [x,y,w,h], score, ... }]. Returns [{ ...box, id, world }]
// (any extra fields on box, e.g. team-cluster.js's `team`, pass through),
// dropping boxes whose foot is above the horizon or lands outside the rink
// extents (+margin) - both are treated as false positives, not real players.
export function backProjectPlayers(boxes, camera, imageWH, { margin = OUT_OF_BOUNDS_MARGIN } = {}) {
  const players = [];
  let nextId = 0;
  for (const box of boxes) {
    const [px, py] = footPixel(box.bbox);
    const world = backProjectFoot(px, py, camera, imageWH);
    if (!world) continue;
    const [x, , z] = world;
    if (Math.abs(x) > HALF_W + margin || z < -margin || z > RINK_L + margin) continue;
    players.push({ ...box, id: nextId++, world });
  }
  return players;
}
