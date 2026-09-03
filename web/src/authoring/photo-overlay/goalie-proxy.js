import * as THREE from 'three';

// Upright placeholder goalie mesh for Mode B (no ML goalie detection - a
// user-designated chip position stands in for the goalie's floor point).
// NOT a rigged model, just enough volume for insights.js's raycast checks
// and a readable "someone is standing here" shape in the 3D preview.

const RADIUS = 250; // mm - estimate, not a sourced number (see CLAUDE.md)
const HEIGHT = 1750; // mm - estimate, approximates a standing goalie's height

// Group origin sits at the floor-contact point (repo convention: placeable
// objects have local origin at their floor point, see CLAUDE.md).
export function createGoalieProxy(worldFloorPoint, facingDeg = 0) {
  const group = new THREE.Group();
  group.name = 'goalieProxy';

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(RADIUS, RADIUS, HEIGHT, 16),
    new THREE.MeshBasicMaterial({ color: 0x3a6bd1 })
  );
  body.position.y = HEIGHT / 2;
  group.add(body);

  // Small forward-facing box hinting at the goalie's front, purely for 3D
  // preview readability - the raycast doesn't need it.
  const faceHint = new THREE.Mesh(
    new THREE.BoxGeometry(RADIUS, RADIUS * 0.6, 40),
    new THREE.MeshBasicMaterial({ color: 0xffe066 })
  );
  faceHint.position.set(0, HEIGHT * 0.75, RADIUS);
  group.add(faceHint);

  group.position.copy(worldFloorPoint);
  group.rotation.y = THREE.MathUtils.degToRad(facingDeg);
  return group;
}
