// S-BACK-026 first slice: the detailed goalie ships as one meshopt GLB with a
// WebP texture (generators/prepare_goalie.mjs) instead of OBJ + MTL + a 5 MB
// PNG. The raw Meshy export lives in generators/vendor/meshy/ (never deployed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const { parseObjMesh } = await import('../generators/obj-mesh.mjs');

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const GLB = ROOT + 'web/assets/goalie_02.glb';
const VENDOR = ROOT + 'generators/vendor/meshy/';
const MAX_GLB_KB = 600;   // estimate from the plan; the OBJ + PNG were ~5.9 MB

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

test('the raw export is vendored, not deployed', () => {
  for (const f of ['goalie_02.obj', 'goalie_02.mtl', 'goalie_02_texture.png', 'README.md']) {
    assert.ok(existsSync(VENDOR + f), `generators/vendor/meshy/${f} missing`);
  }
  for (const f of ['goalie_02.obj', 'goalie_02.mtl', 'goalie_02_texture.png']) {
    assert.ok(!existsSync(ROOT + 'web/assets/' + f), `web/assets/${f} should be gone (shipped as goalie_02.glb)`);
  }
});

test(`goalie_02.glb is under ${MAX_GLB_KB} KB`, () => {
  const kb = statSync(GLB).size / 1024;
  assert.ok(kb < MAX_GLB_KB, `${kb.toFixed(0)} KB`);
});

test('goalie_02.glb has the same bounding box as the OBJ (goalie.js scales it the same way)', async () => {
  await MeshoptDecoder.ready;
  const doc = await io.read(GLB);
  const b = getBounds(doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]);
  const ref = parseObjMesh(readFileSync(VENDOR + 'goalie_02.obj', 'utf8')).bounds;
  for (let k = 0; k < 3; k++) {
    const span = ref.max[k] - ref.min[k];
    assert.ok(Math.abs(b.min[k] - ref.min[k]) < span * 0.005, `min[${k}] ${b.min[k]} vs ${ref.min[k]}`);
    assert.ok(Math.abs(b.max[k] - ref.max[k]) < span * 0.005, `max[${k}] ${b.max[k]} vs ${ref.max[k]}`);
  }
});

test('goalie_02.glb: one WebP texture of at most 1024 px, matte, not metallic', async () => {
  await MeshoptDecoder.ready;
  const doc = await io.read(GLB);
  const root = doc.getRoot();
  const textures = root.listTextures();
  assert.equal(textures.length, 1);
  assert.equal(textures[0].getMimeType(), 'image/webp');
  const [w, h] = textures[0].getSize();
  assert.ok(w <= 1024 && h <= 1024, `${w} x ${h}`);
  for (const m of root.listMaterials()) {
    assert.equal(m.getMetallicFactor(), 0);
    assert.ok(Math.abs(m.getRoughnessFactor() - 0.7) < 1e-6);
  }
});

test('goalie.js loads the GLB, not the OBJ', () => {
  const src = readFileSync(ROOT + 'web/src/goalie.js', 'utf8');
  assert.match(src, /goalie_02\.glb/);
  assert.doesNotMatch(src, /goalie_02\.(obj|mtl)/);
});
