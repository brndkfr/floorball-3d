import * as THREE from 'three';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { CACHE_BUST, GOAL_LINE_FROM_BOARD } from './constants.js';
import { state } from './state.js';
import { scene, renderer } from './scene.js';
import { loaded, failed } from './status.js';
import { selectObject } from './selection.js';

// --- layer: goalie - switchable between two models. `state.goalieGroup`
// always points at whichever one is currently active, so every other piece
// of code (selection, WASD/Q-E movement, coverage raycasting, the floating
// label, trajectory targeting) keeps working unchanged regardless of which
// model is on screen. ---
const goalieCheckbox = document.getElementById('goalieCheckbox');
const goalieModelSelect = document.getElementById('goalieModelSelect');
goalieCheckbox.addEventListener('change', () => {
  if (state.goalieGroup) state.goalieGroup.visible = goalieCheckbox.checked;
});

function loadGoalieModel(mtlUrl, objUrl, onReady) {
  const mtlLoader = new MTLLoader();
  mtlLoader.load(
    mtlUrl + CACHE_BUST,
    (materials) => {
      materials.preload();
      // Anisotropic filtering defaults to off in three.js - without it, a
      // textured surface viewed at a shallow angle (e.g. the goalie's
      // jersey seen from floor-level, especially once zoomed in) looks
      // blocky/pixelated even though the source texture itself is fine.
      const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
      for (const mat of Object.values(materials.materials)) {
        if (mat.map) mat.map.anisotropy = maxAnisotropy;
      }
      const objLoader = new OBJLoader();
      objLoader.setMaterials(materials);
      objLoader.load(
        objUrl + CACHE_BUST,
        (object) => { onReady(object); loaded(objUrl); },
        undefined,
        (err) => failed(objUrl, err)
      );
    },
    undefined,
    (err) => failed(mtlUrl, err)
  );
}

// Outline-around-the-body effect for the shooting-line aura (see
// trajectory.js): for every mesh in the given model, add a slightly-larger,
// back-face-only, unlit clone as a CHILD of that mesh. Rendering only back
// faces means the enlarged clone is invisible everywhere the original mesh
// covers it, and only pokes out right at the silhouette edge, as seen from
// the camera - a standard cheap "toon outline" technique that needs no
// post-processing pipeline. Parenting under the original mesh means it
// automatically follows that mesh's position/rotation/scale with no
// per-frame sync needed. Built once per model (right after it loads), then
// toggled/recoloured per frame by trajectory.js.
const GOALIE_OUTLINE_SCALE = 1.02; // how much larger than the wrapped mesh - keep small or the effect reads as a halo, not an outline

function buildOutlineMeshes(rootObject) {
  // Collect the original meshes first, in a read-only pass - traverse()
  // calls its callback on a node BEFORE reading that node's children, so
  // adding a child mesh to `child` from inside the callback (as this used
  // to do directly) makes traverse pick up and re-traverse the newly-added
  // outline too, recursively outlining its own outline forever until the
  // call stack overflows. Two passes (collect, then augment) avoids that.
  const originalMeshes = [];
  rootObject.traverse((child) => {
    if (child.isMesh) originalMeshes.push(child);
  });

  const outlineMeshes = [];
  for (const child of originalMeshes) {
    const outline = new THREE.Mesh(
      child.geometry,
      new THREE.MeshBasicMaterial({ color: 0xffd21a, side: THREE.BackSide, transparent: true, opacity: 0.85, depthWrite: false })
    );
    outline.scale.setScalar(GOALIE_OUTLINE_SCALE);
    outline.visible = false;
    outline.frustumCulled = false; // moves/reparents with the model, same reasoning as trajectory.js's lines
    child.add(outline);
    outlineMeshes.push(outline);
  }
  return outlineMeshes;
}

export function activateGoalieModel(key) {
  const next = state.goalieModels[key];
  if (!next || next === state.goalieGroup) return;
  const prev = state.goalieGroup;
  if (prev) {
    next.position.copy(prev.position);
    next.rotation.copy(prev.rotation);
    prev.visible = false;
  }
  state.goalieGroup = next;
  state.goalieGroup.visible = goalieCheckbox.checked;
  state.activeGoalieKey = key;
  if (state.selected === prev && prev) selectObject(state.goalieGroup); // keep the ring/controls following
}

// model 1: the first-pass blocky figure (see generate_goalie.py)
loadGoalieModel('assets/goalie.mtl', 'assets/goalie.obj', (object) => {
  // local-origin-centred (ground contact point = 0,0,0), faces +Z by default
  // - matches goal A's mouth orientation, so it needs no extra rotation
  object.position.set(0, 0, GOAL_LINE_FROM_BOARD + 500);
  object.visible = false;
  state.goalieModels.blocky = object;
  state.goalieOutlinesByModel.blocky = buildOutlineMeshes(object);
  scene.add(object);
  // "Detailed" is the intended default - this only fills in as a placeholder
  // if blocky's (much smaller) files happen to finish loading first, so
  // something is on screen immediately. Detailed unconditionally activates
  // itself below once it's ready, overriding this regardless of order.
  if (!state.goalieGroup) activateGoalieModel('blocky');
});

// model 2: user-supplied detailed/textured model (goalie_02.*). Its raw
// export is normalised to roughly a [-1,1] unit bounding box (Y-span = 2.0),
// centred vertically on its own origin rather than floor-anchored -
// GOALIE_02_SCALE and the Y shift below convert that into our mm-scale,
// floor-origin convention. Facing direction is a guess (no rotation offset
// yet) - flag if it turns out to face the wrong way and we'll add a yaw
// correction.
//
// Scale derived anthropometrically: reference person is an adult male,
// 180cm (1800mm) standing height, depicted kneeling (butterfly stance).
// Kneeling height (floor to top of head, upright on both knees) is
// approximately 75.5% of standing stature per standard ergonomic
// anthropometry -> 1800 * 0.755 = ~1359mm. The model's raw Y-span is 2.0
// units, so scale = 1359 / 2.0 = ~680mm per unit.
const GOALIE_02_SCALE = 680; // -> ~1360mm kneeling height (180cm standing male, butterfly stance)
loadGoalieModel('assets/goalie_02.mtl', 'assets/goalie_02.obj', (object) => {
  object.scale.setScalar(GOALIE_02_SCALE);
  object.position.y = GOALIE_02_SCALE; // shifts local y=-1 (bottom, pre-scale) up to y=0
  const wrapper = new THREE.Group();
  wrapper.add(object);
  wrapper.position.set(0, 0, GOAL_LINE_FROM_BOARD + 500);
  wrapper.visible = false;
  state.goalieModels.detailed = wrapper;
  state.goalieOutlinesByModel.detailed = buildOutlineMeshes(object);
  scene.add(wrapper);
  activateGoalieModel('detailed'); // always wins as the default, overriding blocky's placeholder activation above if needed
});

goalieModelSelect.addEventListener('change', () => {
  activateGoalieModel(goalieModelSelect.value);
});
