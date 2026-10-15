// S-BACK-029 H3: shapes.js disposeObject() freed `material.map` only for
// sprites, but zone and arrow labels are Meshes with a CanvasTexture, so
// every updateShape() / undo / frame switch / opacity-slider tick leaked a
// GPU texture. These tests use duck-typed fakes: the helpers only call
// `traverse` and `dispose`, so no WebGL is needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { disposeMaterial, disposeObject } from '../web/src/dispose.js';
import { coalesceToFrame } from '../web/src/authoring/coalesce.js';

const disposable = (log, name) => ({ name, dispose() { log.push(name); } });

function fakeNode(props, children = []) {
  const node = { ...props, children };
  node.traverse = (cb) => { cb(node); for (const c of node.children) c.traverse(cb); };
  return node;
}

test('disposeMaterial frees the texture maps of a mesh material', () => {
  const log = [];
  const mat = { ...disposable(log, 'mat'), map: disposable(log, 'map'), alphaMap: disposable(log, 'alpha') };
  disposeMaterial(mat);
  assert.deepEqual(log.sort(), ['alpha', 'map', 'mat']);
});

test('disposeMaterial handles material arrays and missing materials', () => {
  const log = [];
  disposeMaterial([{ ...disposable(log, 'a'), map: disposable(log, 'ma') }, null, disposable(log, 'b')]);
  disposeMaterial(undefined);
  assert.deepEqual(log.sort(), ['a', 'b', 'ma']);
});

test('disposeObject frees the label texture of a mesh inside a group (zone / arrow label)', () => {
  const log = [];
  const fill = fakeNode({ isMesh: true, geometry: disposable(log, 'fillGeo'), material: disposable(log, 'fillMat') });
  const label = fakeNode({
    isMesh: true,
    geometry: disposable(log, 'labelGeo'),
    material: { ...disposable(log, 'labelMat'), map: disposable(log, 'labelTex') },
  });
  disposeObject(fakeNode({ type: 'Group' }, [fill, label]));
  assert.ok(log.includes('labelTex'), 'CanvasTexture on the label mesh must be disposed');
  assert.deepEqual(log.sort(), ['fillGeo', 'fillMat', 'labelGeo', 'labelMat', 'labelTex']);
});

test('disposeObject frees a sprite root and its map', () => {
  const log = [];
  disposeObject(fakeNode({ isSprite: true, material: { ...disposable(log, 'mat'), map: disposable(log, 'tex') } }));
  assert.deepEqual(log.sort(), ['mat', 'tex']);
});

test('disposeObject tolerates objects without traverse', () => {
  assert.doesNotThrow(() => disposeObject(null));
  assert.doesNotThrow(() => disposeObject({}));
});

// The inspector's opacity / width sliders fire `input` many times per frame
// while dragging; each call rebuilt the shape (and before H3 leaked its
// label texture). Coalesce to the latest value once per animation frame.
test('coalesceToFrame runs only the latest call, once per frame', () => {
  const frames = [];
  const raf = (cb) => { frames.push(cb); return frames.length; };
  const caf = (id) => { frames[id - 1] = null; };
  const seen = [];
  const set = coalesceToFrame((v) => seen.push(v), raf, caf);
  set(0.1); set(0.2); set(0.3);
  assert.deepEqual(seen, []);
  for (const f of frames) f?.();
  assert.deepEqual(seen, [0.3]);
  set(0.4);
  frames.at(-1)();
  assert.deepEqual(seen, [0.3, 0.4]);
});
