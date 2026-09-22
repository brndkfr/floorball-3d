// High-contrast contour-only overlay for the rink + goal meshes, for
// photos where the solid overlay disappears against similar-coloured
// backgrounds (light floor + white board, red goal frame on a red-heavy
// broadcast still, etc.). Toggles by hiding each tagged Mesh's material
// and adding an EdgesGeometry LineSegments sibling in its place; state
// is fully reversible on disable.
//
// A-BACK-005. Owned by photo-overlay.js - callers should also disable on
// exitPhoto so a re-entry doesn't leave the scene in a mixed state.

import * as THREE from 'three';
import { scene } from '../../scene.js';

const OUTLINE_COLOR = 0x00ffff;   // bright cyan, matches the calibration preview strips
const EDGE_ANGLE_DEG = 20;         // silhouette-only; low enough to keep faceoff-circle chords, high enough to drop tessellation seams

// One record per swapped mesh: keep enough to restore exactly.
const swapped = [];

function collectSourceGroups() {
  const found = [];
  scene.traverse((obj) => {
    if (obj.userData?.wireframeSource) found.push(obj);
  });
  return found;
}

export function isWireframeActive() {
  return swapped.length > 0;
}

export function enableWireframeOverlay() {
  if (swapped.length) return;
  const groups = collectSourceGroups();
  for (const group of groups) {
    // Snapshot children first: adding LineSegments during traverse would
    // otherwise recurse into the freshly-added lines and stack-overflow
    // (see CLAUDE.md's traverse gotcha).
    const meshes = [];
    group.traverse((n) => { if (n.isMesh && n.geometry) meshes.push(n); });
    for (const mesh of meshes) {
      const edges = new THREE.EdgesGeometry(mesh.geometry, EDGE_ANGLE_DEG);
      const lines = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: OUTLINE_COLOR, transparent: true, opacity: 0.95 })
      );
      lines.userData.wireframeOverlay = true;
      lines.renderOrder = 999;
      mesh.add(lines);
      swapped.push({ mesh, prevVisible: mesh.visible, lines, edges });
      mesh.visible = false;
      // Keep the parent group visible so the outline stays in the scene
      // even if the underlying Mesh gets hidden by us.
    }
    // Force the group visible while wireframe is on so the layer toggle
    // being off doesn't hide the outline the user just asked for.
    if (!group.userData._wireframePrevVisible && group.userData._wireframePrevVisible !== false) {
      group.userData._wireframePrevVisible = group.visible;
    }
    group.visible = true;
  }
}

export function disableWireframeOverlay() {
  if (!swapped.length) return;
  for (const rec of swapped) {
    rec.mesh.remove(rec.lines);
    rec.lines.material.dispose();
    rec.edges.dispose();
    rec.mesh.visible = rec.prevVisible;
  }
  swapped.length = 0;
  for (const group of collectSourceGroups()) {
    if ('_wireframePrevVisible' in group.userData) {
      group.visible = group.userData._wireframePrevVisible;
      delete group.userData._wireframePrevVisible;
    }
  }
}
