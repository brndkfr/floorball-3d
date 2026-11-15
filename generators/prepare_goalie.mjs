// Builds web/assets/goalie_02.glb (S-BACK-026, first slice) from the
// vendored Meshy export in generators/vendor/meshy/ (OBJ + MTL + a 2048 px
// PNG, ~5.9 MB that every boot fetched). Third-party asset, so this script
// is the "generator": never hand-edit the .glb, change this file and re-run.
//
//   node generators/prepare_goalie.mjs
//
// Steps:
//   - read the OBJ (generators/obj-mesh.mjs; gltf-transform has no OBJ
//     reader). Vertices stay in the export's own units ([-1, 1] box), so
//     goalie.js keeps its GOALIE_02_SCALE and floor shift unchanged
//   - texture to WebP at TEXTURE_PX (EXT_texture_webp; three's GLTFLoader
//     reads it)
//   - material: metallic 0, roughness 0.7 (the MTL's Phong specular has no
//     PBR equivalent; matte reads closer to fabric and plastic pads)
//   - meshopt-compress (decoded in the browser by meshopt_decoder.module.js)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { prune, dedup, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { parseObjMesh } from './obj-mesh.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(ROOT, 'generators/vendor/meshy');
const OUT = path.join(ROOT, 'web/assets/goalie_02.glb');

const TEXTURE_PX = 1024;
const WEBP_QUALITY = 82;
const ROUGHNESS = 0.7;

const mesh = parseObjMesh(fs.readFileSync(path.join(SRC, 'goalie_02.obj'), 'utf8'));
const mtl = fs.readFileSync(path.join(SRC, 'goalie_02.mtl'), 'utf8');
const textureFile = /^map_Kd\s+(.+)$/m.exec(mtl)?.[1].trim();
if (!textureFile) throw new Error('goalie_02.mtl has no map_Kd');

const webp = await sharp(path.join(SRC, textureFile))
  .resize(TEXTURE_PX, TEXTURE_PX, { fit: 'fill' })
  .webp({ quality: WEBP_QUALITY })
  .toBuffer();

const doc = new Document();
doc.createExtension(EXTTextureWebP).setRequired(true);
const buffer = doc.createBuffer();
const accessor = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);

const texture = doc.createTexture('goalie_02').setImage(new Uint8Array(webp)).setMimeType('image/webp').setURI('goalie_02.webp');
const material = doc.createMaterial('goalie_02')
  .setBaseColorTexture(texture)
  .setMetallicFactor(0)
  .setRoughnessFactor(ROUGHNESS);

const prim = doc.createPrimitive()
  .setAttribute('POSITION', accessor('VEC3', mesh.positions))
  .setAttribute('NORMAL', accessor('VEC3', mesh.normals))
  .setAttribute('TEXCOORD_0', accessor('VEC2', mesh.uvs))
  .setIndices(accessor('SCALAR', mesh.indices))
  .setMaterial(material);
const node = doc.createNode('goalie_02').setMesh(doc.createMesh('goalie_02').addPrimitive(prim));
doc.createScene('goalie_02').addChild(node);
doc.getRoot().setDefaultScene(doc.getRoot().listScenes()[0]);

await doc.transform(
  prune(),
  dedup(),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
await io.write(OUT, doc);
const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
console.log(`goalie_02.glb: ${kb} KB (${mesh.positions.length / 3} vertices, ${mesh.indices.length / 3} triangles, texture ${TEXTURE_PX} px WebP ${(webp.length / 1024).toFixed(0)} KB)`);
