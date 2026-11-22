// The ball trail of a lesson shot (A-BACK-049, ball-trail.js) as a few
// fading spheres behind the ball. Driven from the playback's pose
// listeners, so playback, scrubbing and the video export (seekTo) all
// show it. Lesson docs (autoGoalie) only. No DOM.

import * as THREE from 'three';
import { scene } from '../scene.js';
import { ensureDoc } from './doc.js';
import { getFrames } from './frames.js';
import { addPoseListener } from './playback.js';
import { trailPoints, TRAIL } from '../ball-trail.js';

const COUNT = Math.floor(TRAIL.lengthMs / TRAIL.stepMs);   // the ball itself is age 0, drawn by the ball mesh
const R0 = 55, R1 = 22;   // sphere radius mm, newest to oldest; estimates, chosen by eye so it reads at 720p
const COLOR = 0xffe14d;   // bright yellow, readable on the blue floor

const group = new THREE.Group();
group.name = 'ballTrail';
const dots = Array.from({ length: COUNT }, (_, i) => {
  const mat = new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0.8, depthWrite: false });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), mat);
  m.scale.setScalar(R0 + (R1 - R0) * (i / Math.max(1, COUNT - 1)));
  m.frustumCulled = false;
  m.visible = false;
  m.renderOrder = 5;
  group.add(m);
  return m;
});
scene.add(group);

function update(elapsed) {
  const pts = ensureDoc().autoGoalie ? trailPoints(getFrames(), elapsed) : [];
  const behind = pts.slice(1);
  dots.forEach((m, i) => {
    const p = behind[i];
    m.visible = !!p;
    if (!p) return;
    m.position.set(p.x, p.y, p.z);
    m.material.opacity = 0.85 * (1 - i / COUNT);
  });
}

addPoseListener(update);
