// 3D player figures (A-BACK-031): a Quaternius human body on each chip in
// the perspective view. Display-only - the doc, share format, hit-testing
// and all chip math are unchanged; the figure is just another child of
// the chip group, so drag, angle, hide and undo carry over.
//
// Off by default. The GLB and its loaders are fetched the first time the
// toggle is switched on, so boot costs nothing for users who never do.
// tickFigures() (main.js animate) reconciles every chip with the toggle,
// the camera mode and the chip's team each frame - cheap for <= ~30 chips,
// and it means spawn / rebuild / team change / undo need no extra hooks.
//
// Shared resources: SkeletonUtils.clone() shares geometry, and the body
// material is one clone per team. Nothing here is disposed per chip, and
// chips.js's disposeGroup() / updateChipTeam() skip the figure subtree
// (userData.isFigure).

import * as THREE from 'three';
import { CACHE_BUST } from '../constants.js';
import { state } from '../state.js';
import { expectLoad, loaded, failed } from '../status.js';
import { markRenderDirty } from '../render-dirty.js';
import { isTopDown } from './topdown-camera.js';
import { CHIP_DISPLAY_SCALE, TEAM_COLORS, chipDataFor } from './chips.js';
import { figureModelScale, figureShouldShow, figureSpriteLift } from './figure-math.js';

const ASSET = 'player_figure.glb';
const BODY_MATERIAL = /^MI_Superhero_/;
// Shorts: the team colour darkened, so shirt and shorts read as one kit
// but stay distinct. Factor is a look-based estimate.
const SHORTS_DARKEN = 0.35;

// Arms from the bind T-pose down to the sides: a rotation about each
// upper-arm bone's local Z, opposite sign per side (radians). Found by eye
// against the Superhero_Male skin; re-check if the body changes.
const ARM_DOWN = 1.2;
const ARM_POSE = {
  upperarm_l: new THREE.Euler(0, 0, -ARM_DOWN),
  upperarm_r: new THREE.Euler(0, 0, ARM_DOWN),
};

state.figuresEnabled = false;

let prototype = null;
let loading = null;
let SkeletonUtils = null;
const teamMaterials = new Map(); // team -> body material with kit tint

export function figuresLoaded() {
  return !!prototype;
}

export function setFiguresEnabled(on) {
  state.figuresEnabled = !!on;
  if (state.figuresEnabled) loadFigure();
  markRenderDirty();
}

function loadFigure() {
  if (prototype || loading) return loading;
  expectLoad(ASSET);
  loading = Promise.all([
    import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/libs/meshopt_decoder.module.js'),
    import('three/addons/utils/SkeletonUtils.js'),
  ]).then(([{ GLTFLoader }, { MeshoptDecoder }, skel]) => {
    SkeletonUtils = skel;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    return loader.loadAsync('assets/' + ASSET + CACHE_BUST);
  }).then((gltf) => {
    prototype = prepareProto(gltf.scene);
    loaded(ASSET);
    markRenderDirty();
  }).catch((err) => {
    loading = null;
    failed(ASSET, err);
  });
  return loading;
}

function prepareProto(root) {
  root.traverse((node) => {
    const pose = ARM_POSE[node.name];
    if (node.isBone && pose) node.quaternion.multiply(new THREE.Quaternion().setFromEuler(pose));
    if (node.isMesh) {
      // Expose the generator's _KIT attribute under a GLSL-safe name.
      const kit = node.geometry.getAttribute('_kit');
      if (kit) node.geometry.setAttribute('kit', kit);
      node.userData.isBody = BODY_MATERIAL.test(node.material?.name || '');
    }
  });
  root.updateMatrixWorld(true);
  return root;
}

function kitMaterial(base, team) {
  let mat = teamMaterials.get(team);
  if (mat) return mat;
  mat = base.clone();
  const shirt = new THREE.Color(TEAM_COLORS[team] || 0x888888);
  const shorts = shirt.clone().multiplyScalar(SHORTS_DARKEN);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.kitShirt = { value: shirt };
    shader.uniforms.kitShorts = { value: shorts };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 kit;\nvarying vec2 vKit;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKit = kit;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 kitShirt;\nuniform vec3 kitShorts;\nvarying vec2 vKit;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n'
        + 'diffuseColor.rgb = mix(diffuseColor.rgb, kitShirt, clamp(vKit.x, 0.0, 1.0));\n'
        + 'diffuseColor.rgb = mix(diffuseColor.rgb, kitShorts, clamp(vKit.y, 0.0, 1.0));');
  };
  mat.customProgramCacheKey = () => 'player-figure-kit';
  teamMaterials.set(team, mat);
  return mat;
}

function makeFigure(team) {
  const fig = SkeletonUtils.clone(prototype);
  fig.scale.setScalar(figureModelScale(CHIP_DISPLAY_SCALE));
  fig.userData.isFigure = true;
  fig.userData.team = team;
  fig.traverse((node) => {
    if (node.isMesh && node.userData.isBody) node.material = kitMaterial(node.material, team);
  });
  return fig;
}

function removeFigure(group) {
  const fig = group.userData.figure;
  if (!fig) return;
  group.remove(fig);
  // Geometry and materials are shared; only the cloned skeletons own GPU data.
  fig.traverse((node) => { if (node.isSkinnedMesh) node.skeleton.dispose(); });
  group.userData.figure = null;
}

// Per-frame reconcile. Returns true when something changed (main.js then
// renders this frame - S-BACK-011).
export function tickFigures() {
  const show = figureShouldShow({ enabled: state.figuresEnabled, topDown: isTopDown() }) && !!prototype;
  const lift = figureSpriteLift(CHIP_DISPLAY_SCALE, show);
  let changed = false;
  for (const group of state.chipGroups) {
    const team = chipDataFor(group)?.team;
    const fig = group.userData.figure;
    if (show && (!fig || fig.userData.team !== team)) {
      removeFigure(group);
      group.userData.figure = makeFigure(team);
      group.add(group.userData.figure);
      changed = true;
    } else if (!show && fig) {
      removeFigure(group);
      changed = true;
    }
    for (const sprite of group.userData.sprites || []) {
      sprite.userData.baseY ??= sprite.position.y;
      const y = sprite.userData.baseY + lift;
      if (sprite.position.y !== y) {
        sprite.position.y = y;
        changed = true;
      }
    }
  }
  return changed;
}
