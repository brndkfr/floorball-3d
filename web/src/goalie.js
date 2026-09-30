import * as THREE from 'three';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { CACHE_BUST, GOAL_LINE_FROM_BOARD, RINK_L } from './constants.js';
import { state } from './state.js';
import { scene, renderer } from './scene.js';
import { expectLoad, loaded, failed } from './status.js';
import { selectObject } from './selection.js';
import { markRenderDirty } from './render-dirty.js';

// --- layer: goalie - one instance per goal end (A-BACK-024), each
// switchable between two models. `state.goalies.A` / `state.goalies.B`
// always point at whichever model is currently active for that end, so
// every other piece of code (selection, WASD/Q-E movement, coverage
// raycasting, the floating label, trajectory targeting) keeps working
// unchanged regardless of which model is on screen. Both ends share the
// same model choice (one dropdown), but position/rotation/visibility are
// independent per goal. ---
const goalieCheckboxA = document.getElementById('goalieCheckboxA');
const goalieCheckboxB = document.getElementById('goalieCheckboxB');
const goalieModelSelect = document.getElementById('goalieModelSelect');
goalieCheckboxA.addEventListener('change', () => {
  if (state.goalies.A) state.goalies.A.visible = goalieCheckboxA.checked;
  markRenderDirty(); // S-BACK-011
});
goalieCheckboxB.addEventListener('change', () => {
  if (state.goalies.B) state.goalies.B.visible = goalieCheckboxB.checked;
  markRenderDirty(); // S-BACK-011
});

function loadGoalieModel(mtlUrl, objUrl, onReady) {
  expectLoad(objUrl);
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
// per-frame sync needed. Built once per instance (right after it's created),
// then toggled/recoloured per frame by trajectory.js. Each goal end gets its
// own outline meshes (own materials) so the two goalies can be highlighted
// independently - built fresh per instance rather than shared/cloned.
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

// Builds goal B's instance from goal A's pristine (outline-free, un-positioned
// by this point) instance via a deep clone - shares geometry/materials for the
// body (no per-instance body tinting needed), but outlines are built fresh
// per instance (see buildOutlineMeshes) so their materials stay independent.
function mirrorForGoalB(instanceA) {
  const instanceB = instanceA.clone(true);
  instanceB.position.set(0, 0, RINK_L - GOAL_LINE_FROM_BOARD - 500);
  instanceB.rotation.y = Math.PI; // goal B's mouth faces -Z; goalie faces back toward +Z's shooter, i.e. flipped from A
  return instanceB;
}

export function activateGoalieModel(key) {
  const nextModels = state.goalieModels[key];
  if (!nextModels?.A || nextModels.A === state.goalies.A) return;
  const prevA = state.goalies.A, prevB = state.goalies.B;
  const wasSelectedA = state.selected === prevA;
  const wasSelectedB = state.selected === prevB;
  if (prevA) { nextModels.A.position.copy(prevA.position); nextModels.A.rotation.copy(prevA.rotation); prevA.visible = false; }
  if (prevB) { nextModels.B.position.copy(prevB.position); nextModels.B.rotation.copy(prevB.rotation); prevB.visible = false; }
  state.goalies.A = nextModels.A;
  state.goalies.B = nextModels.B;
  state.goalies.A.visible = goalieCheckboxA.checked;
  state.goalies.B.visible = goalieCheckboxB.checked;
  state.activeGoalieKey = key;
  if (wasSelectedA) selectObject(state.goalies.A); // keep the ring/controls following
  else if (wasSelectedB) selectObject(state.goalies.B);
}

// model 1: the first-pass blocky figure (see generate_goalie.py)
loadGoalieModel('assets/goalie.mtl', 'assets/goalie.obj', (object) => {
  // local-origin-centred (ground contact point = 0,0,0), faces +Z by default
  // - matches goal A's mouth orientation, so it needs no extra rotation
  object.position.set(0, 0, GOAL_LINE_FROM_BOARD + 500);
  object.visible = false;
  const instanceB = mirrorForGoalB(object);
  instanceB.visible = false;
  state.goalieModels.blocky = { A: object, B: instanceB };
  state.goalieOutlinesByModel.blocky = { A: buildOutlineMeshes(object), B: buildOutlineMeshes(instanceB) };
  scene.add(object, instanceB);
  // "Detailed" is the intended default - this only fills in as a placeholder
  // if blocky's (much smaller) files happen to finish loading first, so
  // something is on screen immediately. Detailed unconditionally activates
  // itself below once it's ready, overriding this regardless of order.
  if (!state.goalies.A) activateGoalieModel('blocky');
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
  const wrapperB = mirrorForGoalB(wrapper);
  wrapperB.visible = false;
  state.goalieModels.detailed = { A: wrapper, B: wrapperB };
  state.goalieOutlinesByModel.detailed = { A: buildOutlineMeshes(wrapper), B: buildOutlineMeshes(wrapperB) };
  scene.add(wrapper, wrapperB);
  activateGoalieModel('detailed'); // always wins as the default, overriding blocky's placeholder activation above if needed
});

goalieModelSelect.addEventListener('change', () => {
  activateGoalieModel(goalieModelSelect.value);
});
