// Extracts the gait clips the player figures use (A-BACK-032) from the
// Quaternius Universal Animation Library download into a small vendored
// file, so the 7.6 MB source GLB does not have to live in the repo.
//
//   node generators/extract_gait_clips.mjs "<download>/Unreal-Godot/UAL1_Standard.glb"
//
// Writes generators/vendor/quaternius/universal-animation-library/gait_clips.glb
// (skeleton + the clips below, no mesh). prepare_player_figure.mjs then
// retargets them onto the body. Use the non-_RM file: the chip moves the
// figure, so root motion must stay off.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import { GAIT_CLIPS } from '../web/src/authoring/figure-gait.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'generators/vendor/quaternius/universal-animation-library/gait_clips.glb');

const src = process.argv[2];
if (!src) throw new Error('usage: node generators/extract_gait_clips.mjs <UAL1_Standard.glb>');

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
const root = doc.getRoot();
const keep = new Set(Object.values(GAIT_CLIPS).map((c) => c.name));

for (const anim of root.listAnimations()) {
  if (keep.has(anim.getName())) continue;
  // dispose() alone leaves the samplers (and their accessors) alive
  for (const s of anim.listSamplers()) s.dispose();
  for (const c of anim.listChannels()) c.dispose();
  anim.dispose();
}
const found = root.listAnimations().map((a) => a.getName());
for (const name of keep) if (!found.includes(name)) throw new Error(`clip ${name} not in ${src}`);

// Mesh is the mannequin body; only the joints and clips are needed.
for (const node of root.listNodes()) node.setMesh(null).setSkin(null);
for (const mesh of root.listMeshes()) mesh.dispose();
await doc.transform(prune({ keepLeaves: true }));

await io.write(OUT, doc);
console.log(`gait_clips.glb: ${found.join(', ')}`);
