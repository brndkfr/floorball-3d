// The pass lane of a lesson frame (A-BACK-049, lesson-view.js passLaneOf):
// a flat ribbon on the floor from the ball carrier to the free team mate,
// on while the frame's quiet layers name 'lane'. The ends follow the live
// chips, so the lane stays between the players as they move during the
// play. Driven from the playback's pose listeners and quietChanged, so
// playback, scrubbing and the video export (seekTo) all show it. No DOM.

import * as THREE from 'three';
import { scene } from '../scene.js';
import { state } from '../state.js';
import { ensureDoc } from './doc.js';
import { getFrames } from './frames.js';
import { noteFrameAt } from './frame-notes.js';
import { addPoseListener, playbackState } from './playback.js';
import { passLaneOf, quietAllows } from '../lesson-view.js';
import { markRenderDirty } from '../render-dirty.js';

const Y = 5;            // mm: over the zones (1.5), the markings (2) and the KATA marks (4)
const WIDTH = 70;       // mm ribbon width (estimate, reads at 720p from the lesson camera)
const COLOR = 0xffb02e; // amber: distinct from the green KATA marks and the yellow ball trail

const mesh = new THREE.Mesh(
  new THREE.BufferGeometry(),
  new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
);
mesh.name = 'passLane';
mesh.frustumCulled = false;   // the position attribute is rewritten (CLAUDE.md rendering gotchas)
mesh.raycast = () => {};      // never a click target
mesh.renderOrder = 31;
mesh.visible = false;
mesh.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3));
scene.add(mesh);

const live = (id, fallback) => {
  const g = state.chipGroups.find((c) => c.userData.chip?.id === id);
  return g ? { x: g.position.x, z: g.position.z } : fallback;
};

function update() {
  let lane = null;
  if (state.quiet && quietAllows(state.quiet, 'lane') && state.doc && document.body.dataset.mode === 'train') {
    const doc = ensureDoc();
    const pb = playbackState();
    const frames = getFrames();
    const i = pb && (pb.playing || pb.previewing) ? noteFrameAt(frames, pb.elapsed) : doc.currentFrame;
    lane = passLaneOf(frames[i]);
    if (lane) lane = { from: live(lane.ids[0], lane.from), to: live(lane.ids[1], lane.to) };
  }
  const was = mesh.visible;
  mesh.visible = !!lane;
  if (lane) {
    const { from: a, to: b } = lane;
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const nx = (-(b.z - a.z) / len) * (WIDTH / 2), nz = ((b.x - a.x) / len) * (WIDTH / 2);
    const p = [[a.x + nx, a.z + nz], [a.x - nx, a.z - nz], [b.x - nx, b.z - nz], [b.x + nx, b.z + nz]];
    const pos = mesh.geometry.attributes.position;
    [0, 1, 2, 0, 2, 3].forEach((k, n) => pos.setXYZ(n, p[k][0], Y, p[k][1]));
    pos.needsUpdate = true;
  }
  if (was !== mesh.visible || lane) markRenderDirty();
}

addPoseListener(update);
window.addEventListener('quietChanged', update);
