// S-BACK-026 first slice: generators/prepare_goalie.mjs turns the vendored
// goalie OBJ into a GLB. gltf-transform has no OBJ reader, so the parse is a
// small pure helper (generators/obj-mesh.mjs), tested here.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { parseObjMesh } = await import('../generators/obj-mesh.mjs');

// A unit quad as two triangles that share an edge (same v/vt/vn on it).
const QUAD = `
# comment
mtllib x.mtl
o Quad
v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
vt 0 0
vt 1 0
vt 1 1
vt 0 1
vn 0 0 1
usemtl M
s 0
f 1/1/1 2/2/1 3/3/1
f 1/1/1 3/3/1 4/4/1
`;

test('parseObjMesh: one vertex per distinct v/vt/vn corner, triangles as indices', () => {
  const m = parseObjMesh(QUAD);
  assert.equal(m.positions.length, 4 * 3);
  assert.equal(m.normals.length, 4 * 3);
  assert.equal(m.uvs.length, 4 * 2);
  assert.deepEqual([...m.indices], [0, 1, 2, 0, 2, 3]);
  assert.deepEqual([...m.positions.slice(6, 9)], [1, 1, 0]);
  assert.deepEqual([...m.normals.slice(0, 3)], [0, 0, 1]);
});

test('parseObjMesh: V is flipped (OBJ v goes up, glTF v goes down)', () => {
  const m = parseObjMesh(QUAD);
  assert.deepEqual([...m.uvs.slice(0, 2)], [0, 1]);   // vt 0 0
  assert.deepEqual([...m.uvs.slice(4, 6)], [1, 0]);   // vt 1 1
});

test('parseObjMesh: a corner with a different uv on the same position is its own vertex', () => {
  const m = parseObjMesh(`v 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvt 0.5 0.5\nvn 0 0 1\nf 1/1/1 2/1/1 3/1/1\nf 1/2/1 3/1/1 2/1/1\n`);
  assert.equal(m.positions.length / 3, 4);
  assert.deepEqual([...m.indices], [0, 1, 2, 3, 2, 1]);
});

test('parseObjMesh: quads are split into two triangles, negative indices count from the end', () => {
  const m = parseObjMesh(`v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nvt 0 0\nvn 0 0 1\nf -4/1/1 -3/1/1 -2/1/1 -1/1/1\n`);
  assert.deepEqual([...m.indices], [0, 1, 2, 0, 2, 3]);
});

test('parseObjMesh: bounds of the positions', () => {
  const m = parseObjMesh(QUAD);
  assert.deepEqual(m.bounds, { min: [0, 0, 0], max: [1, 1, 0] });
});
