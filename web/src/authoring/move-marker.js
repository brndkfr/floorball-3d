// "Go here" flash marker for RTS-style right-click move commands.
// A brief expanding + fading ring at the click point so the gesture has
// a visible receipt. Same idiom as the chip-drop ring in chips.js.

import * as THREE from 'three';
import { scene } from '../scene.js';

const rings = [];   // { mesh, elapsed, dur, fromScale, toScale, fromOpacity }

export function spawnMoveMarker(x, z, { color = 0x7ee06b } = {}) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(160, 220, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, 6, z);
  ring.frustumCulled = false;
  ring.renderOrder = 4;
  scene.add(ring);
  rings.push({ mesh: ring, elapsed: 0, dur: 0.45, fromScale: 1.0, toScale: 3.2, fromOpacity: 0.95 });
}

// Returns whether anything was actively animating this frame (S-BACK-011).
export function updateMoveMarkers(dt) {
  const wasActive = rings.length > 0;
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.elapsed += dt;
    const t = Math.min(r.elapsed / r.dur, 1);
    const s = r.fromScale + (r.toScale - r.fromScale) * t;
    r.mesh.scale.set(s, s, s);
    r.mesh.material.opacity = r.fromOpacity * (1 - t);
    if (t >= 1) {
      scene.remove(r.mesh);
      r.mesh.geometry.dispose();
      r.mesh.material.dispose();
      rings.splice(i, 1);
    }
  }
  return wasActive;
}
