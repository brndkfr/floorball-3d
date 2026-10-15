import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applyStickColors } from '../web/src/stick-colors.js';

// A stick as OBJLoader + MTLLoader return floorball_stick.obj: one mesh with
// one material per part, named after the .mtl entries.
function makeStick() {
  const mats = ['Blade', 'Shaft', 'Grip', 'GripLine', 'Knob'].map((name) => {
    const m = new THREE.MeshPhongMaterial({ color: 0x808080 });
    m.name = name;
    return m;
  });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.BufferGeometry(), mats));
  return { group, mats };
}
const colorOf = (group, name) =>
  group.children[0].material.find((m) => m.name === name).color.getHexString();

test('sets blade, shaft and grip colours by part', () => {
  const { group } = makeStick();
  applyStickColors(group, { blade: '#7ed321', shaft: 0xffffff, grip: '#112233' });
  assert.equal(colorOf(group, 'Blade'), '7ed321');
  assert.equal(colorOf(group, 'Shaft'), 'ffffff');
  assert.equal(colorOf(group, 'Grip'), '112233');
});

test('knob follows the grip unless given its own colour', () => {
  const a = makeStick().group;
  applyStickColors(a, { grip: '#112233' });
  assert.equal(colorOf(a, 'Knob'), '112233');
  const b = makeStick().group;
  applyStickColors(b, { grip: '#112233', knob: '#ff0000' });
  assert.equal(colorOf(b, 'Knob'), 'ff0000');
});

test('parts not mentioned keep their colour', () => {
  const { group } = makeStick();
  applyStickColors(group, { blade: '#7ed321' });
  assert.equal(colorOf(group, 'Shaft'), '808080');
  assert.equal(colorOf(group, 'GripLine'), '808080');
});

test('clones materials so sticks sharing a loaded template stay independent', () => {
  const { group, mats } = makeStick();
  const twin = group.clone();                    // Object3D.clone shares materials
  applyStickColors(group, { blade: '#ff0000' });
  applyStickColors(twin, { blade: '#0000ff' });
  assert.equal(colorOf(group, 'Blade'), 'ff0000');
  assert.equal(colorOf(twin, 'Blade'), '0000ff');
  assert.equal(mats[0].color.getHexString(), '808080', 'template material untouched');
});

test('unknown part names throw (catches typos like "shaf")', () => {
  const { group } = makeStick();
  assert.throws(() => applyStickColors(group, { shaf: '#fff' }), /shaf/);
});
