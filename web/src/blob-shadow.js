// Soft blob shadows under figures, goalies and balls in the 3D view
// (S-BACK-030 step 3): one dark radial-gradient quad on the floor per
// actor, so nobody floats. Cheap enough for every device.
//
// The quads live in their own group, not inside the actors: coverage.js
// raycasts the goalie mesh, selection.js raycasts and boxes every
// selectable, and a quad parented there would be hit and measured too.
// tickBlobShadows() (main.js, once per frame) moves a pooled quad under
// each actor. Hidden in the top-down view and while photo-locked.

import * as THREE from 'three';
import { scene, camera } from './scene.js';
import { state } from './state.js';
import { BALL_RADIUS } from './constants.js';
import { blobAt } from './blob-shadow-math.js';

const SHADOW_Y = 3;   // mm above the floor, under the selection rings (4) and shapes (5)

const group = new THREE.Group();
group.name = 'blobShadows';
scene.add(group);

let texture = null;
function blobTexture() {
  if (texture) return texture;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.6)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  texture = new THREE.CanvasTexture(canvas);
  return texture;
}

const quadGeo = new THREE.PlaneGeometry(2, 2);   // unit radius, scaled per actor
quadGeo.rotateX(-Math.PI / 2);

const pool = [];
function quad(i) {
  if (!pool[i]) {
    const mat = new THREE.MeshBasicMaterial({
      map: blobTexture(), color: 0x000000, transparent: true, depthWrite: false,
      // the floor is 3 mm below: without the offset the two fight at a distance
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const m = new THREE.Mesh(quadGeo, mat);
    m.raycast = () => {};   // never selectable, never in the way of a click
    m.renderOrder = 1;
    m.visible = false;
    group.add(m);
    pool[i] = m;
  }
  return pool[i];
}

function shown(obj) {
  for (let o = obj; o; o = o.parent) if (!o.visible) return false;
  return true;
}

let lastKey = '';

// Returns true when a shadow moved, appeared or went, so main.js renders.
export function tickBlobShadows() {
  let n = 0;
  let key = '';
  const place = (kind, x, z, heightMm) => {
    const { radius, opacity } = blobAt(kind, heightMm);
    const m = quad(n++);
    m.position.set(x, SHADOW_Y, z);
    m.scale.set(radius, 1, radius);
    m.material.opacity = opacity;
    m.visible = true;
    key += `${x.toFixed(0)},${z.toFixed(0)},${heightMm.toFixed(0)},${kind[0]};`;
  };

  if (state.activeCamera === camera) {
    for (const g of state.chipGroups) {
      if (g.userData.figure && shown(g)) place('figure', g.position.x, g.position.z, 0);
    }
    for (const letter of ['A', 'B']) {
      const g = state.goalies[letter];
      if (g && shown(g)) place('goalie', g.position.x, g.position.z, 0);
    }
    const ball = state.ballGroup;
    if (ball && shown(ball)) place('ball', ball.position.x, ball.position.z, ball.position.y);
    // extra balls are meshes centred on the ball, one radius above the floor
    for (const b of state.extraBalls) {
      if (shown(b)) place('ball', b.position.x, b.position.z, b.position.y - BALL_RADIUS);
    }
  }
  for (let i = n; i < pool.length; i++) pool[i].visible = false;

  const changed = key !== lastKey;
  lastKey = key;
  return changed;
}

// For tests and the look-shots: what is drawn right now.
export function blobShadowCount() {
  return pool.filter((m) => m.visible).length;
}
