import * as THREE from 'three';

// Upright placeholder goalie mesh for Mode B (no ML goalie detection - a
// user-designated chip position stands in for the goalie's floor point).
// NOT a rigged model, just enough volume for insights.js's raycast checks
// and a readable "someone is standing here" shape in the 3D preview.

// Anisotropic on purpose: wider lateral (pad-to-pad) than deep (chest-to-
// back) so rotating the proxy by facingDeg actually changes which shot
// rays hit it. A rotationally-symmetric cylinder would ignore facing.
// Numbers are stance estimates (goalie pads ~380mm each side, torso depth
// ~300mm), not sourced spec.
const WIDTH = 760;
const DEPTH = 300;
const HEIGHT = 1750;

// Group origin sits at the floor-contact point (repo convention: placeable
// objects have local origin at their floor point, see CLAUDE.md).
export function createGoalieProxy(worldFloorPoint, facingDeg = 0) {
  const group = new THREE.Group();
  group.name = 'goalieProxy';

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(WIDTH, HEIGHT, DEPTH),
    new THREE.MeshBasicMaterial({ color: 0x3a6bd1 })
  );
  body.position.y = HEIGHT / 2;
  group.add(body);

  // Small forward-facing box hinting at the goalie's front, purely for 3D
  // preview readability - the raycast doesn't need it.
  const faceHint = new THREE.Mesh(
    new THREE.BoxGeometry(WIDTH * 0.5, HEIGHT * 0.1, 40),
    new THREE.MeshBasicMaterial({ color: 0xffe066 })
  );
  faceHint.position.set(0, HEIGHT * 0.75, DEPTH / 2);
  group.add(faceHint);

  group.position.copy(worldFloorPoint);
  group.rotation.y = THREE.MathUtils.degToRad(facingDeg);
  return group;
}
