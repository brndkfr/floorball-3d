// Builds web/assets/player_figure.glb (A-BACK-031) from the vendored
// Quaternius body in generators/vendor/quaternius/universal-base-characters/.
// Third-party asset, so this script is the "generator": never hand-edit
// the .glb, change this file and re-run it.
//
//   node generators/prepare_player_figure.mjs [path/to/Body.gltf]
//
// Steps:
//   - drop normal / roughness maps (two are missing from the zip, and at
//     rink distance they cost MBs for no visible gain)
//   - drop unused UV sets and vertex colours (GLTFLoader turns COLOR_0
//     into vertexColors, which would darken the body)
//   - add a _KIT vec2 attribute (shirt, shorts) from player-figure-kit.mjs
//     to the body, which figures.js tints with the team colour
//   - shrink textures to JPEG (body 512 px, eyes / eyebrows 128 px)
//   - meshopt-compress (decoded in the browser by meshopt_decoder.module.js)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO, Accessor } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { kitWeights } from './player-figure-kit.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEFAULT_SRC = path.join(ROOT, 'generators/vendor/quaternius/universal-base-characters/Superhero_Male_FullBody.gltf');
const OUT = path.join(ROOT, 'web/assets/player_figure.glb');

const BODY_MATERIAL = /^MI_Superhero_/;
const TEXTURE_SIZE = { body: 512, other: 128 };
const JPEG_QUALITY = 82;

const src = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_SRC;
const dir = path.dirname(src);
const json = JSON.parse(fs.readFileSync(src, 'utf8'));

// Strip the map references before loading, so missing files never get read.
for (const m of json.materials) {
  delete m.normalTexture;
  if (m.pbrMetallicRoughness) {
    delete m.pbrMetallicRoughness.metallicRoughnessTexture;
    m.pbrMetallicRoughness.metallicFactor = 0;
    m.pbrMetallicRoughness.roughnessFactor = 0.85;
  }
}
const usedImages = new Set();
for (const m of json.materials) {
  const t = m.pbrMetallicRoughness?.baseColorTexture?.index;
  if (t != null) usedImages.add(json.textures[t].source);
}
const resources = {};
for (const b of json.buffers) resources[b.uri] = fs.readFileSync(path.join(dir, b.uri));
json.images.forEach((im, i) => {
  // Unused images become empty stubs; prune() drops them below.
  resources[im.uri] = usedImages.has(i) ? fs.readFileSync(path.join(dir, im.uri)) : new Uint8Array(0);
});

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.readJSON({ json, resources });
const root = doc.getRoot();
const buffer = root.listBuffers()[0];

const KEEP = new Set(['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']);
let kitVerts = [0, 0];
for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    for (const semantic of prim.listSemantics()) {
      if (!KEEP.has(semantic)) prim.setAttribute(semantic, null);
    }
    if (!BODY_MATERIAL.test(prim.getMaterial()?.getName() || '')) continue;
    const pos = prim.getAttribute('POSITION');
    const kit = new Float32Array(pos.getCount() * 2);
    const p = [0, 0, 0];
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, p);
      const [shirt, shorts] = kitWeights(p[0], p[1], p[2]);
      kit[i * 2] = shirt;
      kit[i * 2 + 1] = shorts;
      kitVerts[0] += shirt;
      kitVerts[1] += shorts;
    }
    prim.setAttribute('_KIT', doc.createAccessor('kit').setType(Accessor.Type.VEC2).setArray(kit).setBuffer(buffer));
  }
}
if (kitVerts[0] === 0 || kitVerts[1] === 0) {
  throw new Error(`kit mask is empty (shirt ${kitVerts[0]}, shorts ${kitVerts[1]}) - body material not found or landmarks off`);
}

for (const mat of root.listMaterials()) {
  const tex = mat.getBaseColorTexture();
  if (!tex) continue;
  const size = BODY_MATERIAL.test(mat.getName()) ? TEXTURE_SIZE.body : TEXTURE_SIZE.other;
  const jpeg = await sharp(Buffer.from(tex.getImage()))
    .resize(size, size, { fit: 'fill' })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
  tex.setImage(new Uint8Array(jpeg)).setMimeType('image/jpeg').setURI(`${mat.getName()}.jpg`);
}

await doc.transform(
  prune(),
  dedup(),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);

await io.write(OUT, doc);
const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
console.log(`player_figure.glb: ${kb} KB (shirt verts ${kitVerts[0]}, shorts verts ${kitVerts[1]})`);
