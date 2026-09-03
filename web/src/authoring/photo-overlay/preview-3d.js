// Mode-B Step 4 "View in 3D": drops the photo-reconstructed positions
// (players, ball, goalies) into the shared 3D scene using the top-down
// authoring camera, then cleanly reverses everything on exit. See
// docs/phase-3-plan.md T7.
//
// Deliberately does NOT use chips.js's spawnChip - that mutates
// state.doc.scheme.players and calls saveDoc(), which would bake Mode-B
// players into the Mode-A authoring doc. Instead this module builds
// lightweight preview meshes directly into a private group and removes
// them on exit; state.doc is untouched (T7 acceptance criterion).
import * as THREE from 'three';
import { scene, renderer } from '../../scene.js';
import { state } from '../../state.js';
import { CHIP_HEIGHT, CHIP_RADIUS, CHIP_DISPLAY_SCALE } from '../chips.js';
import { enterTopDown, exitTopDown, isTopDown } from '../topdown-camera.js';
import { createGoalieProxy } from './goalie-proxy.js';

const TEAM_COLORS = { home: 0x2fbf4e, away: 0xd94b2f };

let previewGroup = null;
let savedBallPos = null;
let savedTargetGoal = null;
// Photo-mode state we override so the 3D preview is actually visible:
// during Step 4, setCalibrating(true) hides the WebGL canvas and the
// photo-canvas + fitToPhotoRect may have letterboxed its inline styles.
let savedCanvasStyle = null;
let savedPhotoCanvasDisplay = null;
let savedSceneBackground = null;

function makeNumberSprite(number) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 6;
  ctx.strokeText(String(number), size / 2, size / 2 + 4);
  ctx.fillText(String(number), size / 2, size / 2 + 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 1;
  sprite.scale.set(110 * CHIP_DISPLAY_SCALE, 110 * CHIP_DISPLAY_SCALE, 1);
  sprite.position.set(0, CHIP_HEIGHT * CHIP_DISPLAY_SCALE + 60, 0);
  return sprite;
}

function makePreviewChip(player) {
  const group = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(CHIP_RADIUS * CHIP_DISPLAY_SCALE, CHIP_RADIUS * CHIP_DISPLAY_SCALE, CHIP_HEIGHT * CHIP_DISPLAY_SCALE, 40),
    new THREE.MeshBasicMaterial({ color: TEAM_COLORS[player.team] || 0x888888 }),
  );
  disc.position.y = (CHIP_HEIGHT * CHIP_DISPLAY_SCALE) / 2;
  group.add(disc);
  // Ring around auto-detected goalies so it's obvious which chip is
  // wired into photo.goalies for the coverage raycast.
  if (player.role === 'goalie') {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry((CHIP_RADIUS + 40) * CHIP_DISPLAY_SCALE, (CHIP_RADIUS + 80) * CHIP_DISPLAY_SCALE, 48),
      new THREE.MeshBasicMaterial({ color: 0x4fe0ff, side: THREE.DoubleSide, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 4;
    group.add(ring);
  }
  group.add(makeNumberSprite(player.id));
  group.position.set(player.world[0], 0, player.world[2]);
  return group;
}

function disposeGroup(g) {
  g.traverse((n) => {
    if (n.isMesh) {
      n.geometry?.dispose();
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      for (const m of mats) { m?.map?.dispose(); m?.dispose(); }
    }
    if (n.isSprite) {
      n.material?.map?.dispose();
      n.material?.dispose();
    }
  });
}

export function isPhotoPreview3D() {
  return previewGroup !== null;
}

// frame = state.doc.frames[currentFrame] with a populated frame.photo.
// No-op if the preview is already active or frame.photo is missing key
// fields (T4 caller already gates on ball + targetGoal via updateStep4).
export function enterPhotoPreview3D(frame) {
  if (previewGroup) return;
  const photo = frame?.photo;
  if (!photo?.players || !photo?.ball) return;

  previewGroup = new THREE.Group();
  previewGroup.name = 'photoPreview3D';
  scene.add(previewGroup);

  for (const p of photo.players) {
    previewGroup.add(makePreviewChip(p));
  }

  const goalieIds = new Set(Object.values(photo.goalies || {}).filter((v) => typeof v === 'number'));
  for (const id of goalieIds) {
    const chip = photo.players.find((p) => p.id === id);
    if (!chip) continue;
    const proxy = createGoalieProxy(new THREE.Vector3().fromArray(chip.world), chip.facingDeg ?? 0);
    proxy.userData.previewOwned = true;
    previewGroup.add(proxy);
  }

  if (state.ballGroup) {
    savedBallPos = state.ballGroup.position.clone();
    state.ballGroup.position.set(photo.ball[0], photo.ball[1] || 0, photo.ball[2]);
  }

  savedTargetGoal = state.targetGoal;
  if (photo.targetGoal && state.goalInstances) {
    state.targetGoal = photo.targetGoal === 'B' ? state.goalInstances[1] : state.goalInstances[0];
  }

  // Force the WebGL canvas visible + full-window and hide the photo
  // canvas; otherwise the caller's Step-4 setCalibrating(true) state
  // leaves the 3D scene invisible under the photo overlay.
  const domEl = renderer.domElement;
  savedCanvasStyle = {
    display: domEl.style.display,
    position: domEl.style.position,
    left: domEl.style.left,
    top: domEl.style.top,
    width: domEl.style.width,
    height: domEl.style.height,
    opacity: domEl.style.opacity,
    pointerEvents: domEl.style.pointerEvents,
  };
  domEl.style.display = '';
  domEl.style.position = 'relative';
  domEl.style.left = '';
  domEl.style.top = '';
  domEl.style.width = '';
  domEl.style.height = '';
  domEl.style.opacity = '';
  domEl.style.pointerEvents = 'auto';
  const photoCanvasEl = document.getElementById('photo-canvas');
  if (photoCanvasEl) {
    savedPhotoCanvasDisplay = photoCanvasEl.style.display;
    photoCanvasEl.style.display = 'none';
  }
  // scene.background is nulled during isPhoto() so the renderer stays
  // transparent over the photo - restore a solid clear for the preview.
  savedSceneBackground = scene.background;
  if (!scene.background) scene.background = new THREE.Color(0x0f1116);
  renderer.setClearColor(0x0f1116, 1);
  // Re-run scene.js's own window-resize handler to restore full-window
  // renderer sizing / aspect after fitToPhotoRect may have shrunk it.
  window.dispatchEvent(new Event('resize'));

  if (!isTopDown()) enterTopDown();
}

export function exitPhotoPreview3D() {
  if (!previewGroup) return;
  if (isTopDown()) exitTopDown();

  scene.remove(previewGroup);
  disposeGroup(previewGroup);
  previewGroup = null;

  if (savedBallPos && state.ballGroup) state.ballGroup.position.copy(savedBallPos);
  savedBallPos = null;

  state.targetGoal = savedTargetGoal;
  savedTargetGoal = null;

  const domEl = renderer.domElement;
  if (savedCanvasStyle) {
    for (const [k, v] of Object.entries(savedCanvasStyle)) domEl.style[k] = v;
    savedCanvasStyle = null;
  }
  const photoCanvasEl = document.getElementById('photo-canvas');
  if (photoCanvasEl && savedPhotoCanvasDisplay !== null) {
    photoCanvasEl.style.display = savedPhotoCanvasDisplay;
    savedPhotoCanvasDisplay = null;
  }
  if (savedSceneBackground !== null) {
    scene.background = savedSceneBackground;
    savedSceneBackground = null;
  }
  renderer.setClearColor(0x000000, 1);
  window.dispatchEvent(new Event('resize'));
}
