import * as THREE from 'three';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { CACHE_BUST, RINK_L, HALF_W, GRID_TILE_SIZE, GRID_N_COLS, GRID_N_ROWS, GOAL_LINE_FROM_BOARD } from './constants.js';
import { state } from './state.js';
import { scene } from './scene.js';
import { bindLayerToggle, makeLabelSprite } from './utils.js';
import { expectLoad, loaded, failed } from './status.js';

// --- layer: rink (board + IFF markings) ---
const rinkCheckbox = document.getElementById('rinkCheckbox');
let rinkGroup = null;
bindLayerToggle(rinkCheckbox, () => rinkGroup);

expectLoad('rink.obj');
const rinkMtlLoader = new MTLLoader();
rinkMtlLoader.load(
  'assets/rink.mtl' + CACHE_BUST,
  (materials) => {
    materials.preload();
    if (materials.materials.Board) materials.materials.Board.side = THREE.DoubleSide;
    if (materials.materials.Marking) materials.materials.Marking.side = THREE.DoubleSide;

    const objLoader = new OBJLoader();
    objLoader.setMaterials(materials);
    objLoader.load(
      'assets/rink.obj' + CACHE_BUST,
      (object) => {
        object.visible = rinkCheckbox.checked;
        rinkGroup = object;
        scene.add(object);
        loaded('rink.obj');
      },
      undefined,
      (err) => failed('rink.obj', err)
    );
  },
  undefined,
  (err) => failed('rink.mtl', err)
);

// --- layer: goals (loaded once, two oriented instances, one toggle) ---
const goalsCheckbox = document.getElementById('goalsCheckbox');
let goalsGroup = null;
bindLayerToggle(goalsCheckbox, () => goalsGroup);

expectLoad('floorball_goal.obj');
const goalMtlLoader = new MTLLoader();
goalMtlLoader.load(
  'assets/floorball_goal.mtl' + CACHE_BUST,
  (materials) => {
    materials.preload();
    if (materials.materials.Net) {
      materials.materials.Net.side = THREE.DoubleSide;
      materials.materials.Net.transparent = true;
      materials.materials.Net.depthWrite = false;
    }
    if (materials.materials.Frame) materials.materials.Frame.side = THREE.DoubleSide;

    const objLoader = new OBJLoader();
    objLoader.setMaterials(materials);
    objLoader.load(
      'assets/floorball_goal.obj' + CACHE_BUST,
      (object) => {
        // clone the pristine (untransformed) object before mutating either copy
        const goalB = object.clone();

        // goal at the z=0 end: mouth faces +Z (into the rink) -> flipped 180 deg
        object.position.set(0, 0, GOAL_LINE_FROM_BOARD);
        object.rotation.y = Math.PI;

        // goal at the z=RINK_L end: mouth faces -Z (into the rink) -> no flip
        goalB.position.set(0, 0, RINK_L - GOAL_LINE_FROM_BOARD);
        goalB.rotation.y = 0;

        goalsGroup = new THREE.Group();
        goalsGroup.add(object, goalB);
        goalsGroup.visible = goalsCheckbox.checked;
        scene.add(goalsGroup);
        state.goalInstances.push(object, goalB);

        loaded('floorball_goal.obj');
      },
      undefined,
      (err) => failed('floorball_goal.obj', err)
    );
  },
  undefined,
  (err) => failed('floorball_goal.mtl', err)
);

// --- layer: floorball (72mm, white - see generate_ball.py for the spec source) ---
const ballCheckbox = document.getElementById('ballCheckbox');
bindLayerToggle(ballCheckbox, () => state.ballGroup);

expectLoad('ball.obj');
const ballMtlLoader = new MTLLoader();
ballMtlLoader.load(
  'assets/ball.mtl' + CACHE_BUST,
  (materials) => {
    materials.preload();

    const objLoader = new OBJLoader();
    objLoader.setMaterials(materials);
    objLoader.load(
      'assets/ball.obj' + CACHE_BUST,
      (object) => {
        // ball.obj is local-origin-centred (floor contact point = 0,0,0);
        // this sets its actual rink position - defaults to a spot inside
        // the crease, off to one side, matching the default camera framing
        // in scene.js (an elevated shot of the goal/crease/ball together)
        object.position.set(-1700, 0, 5300);
        object.visible = ballCheckbox.checked;
        state.ballGroup = object;
        scene.add(object);
        loaded('ball.obj');
      },
      undefined,
      (err) => failed('ball.obj', err)
    );
  },
  undefined,
  (err) => failed('ball.mtl', err)
);

// --- layer: optional numbered grid overlay (not an IFF marking, see script header) ---
const gridTilesCheckbox = document.getElementById('gridTilesCheckbox');
let gridTilesGroup = null;
bindLayerToggle(gridTilesCheckbox, () => gridTilesGroup);

expectLoad('grid_tiles.obj');
const gridTilesMtlLoader = new MTLLoader();
gridTilesMtlLoader.load(
  'assets/grid_tiles.mtl' + CACHE_BUST,
  (materials) => {
    materials.preload();
    if (materials.materials.GridLine) {
      materials.materials.GridLine.side = THREE.DoubleSide;
      materials.materials.GridLine.transparent = true;
      materials.materials.GridLine.depthWrite = false;
    }

    const objLoader = new OBJLoader();
    objLoader.setMaterials(materials);
    objLoader.load(
      'assets/grid_tiles.obj' + CACHE_BUST,
      (object) => {
        const group = new THREE.Group();
        group.add(object);

        for (let col = 0; col < GRID_N_COLS; col++) {
          for (let row = 0; row < GRID_N_ROWS; row++) {
            const x = -HALF_W + (col + 0.5) * GRID_TILE_SIZE;
            const z = (row + 0.5) * GRID_TILE_SIZE;
            const label = makeLabelSprite(`${col + 1}-${row + 1}`);
            label.position.set(x, 3, z);
            group.add(label);
          }
        }

        group.visible = gridTilesCheckbox.checked;
        gridTilesGroup = group;
        scene.add(group);
        loaded('grid_tiles.obj');
      },
      undefined,
      (err) => failed('grid_tiles.obj', err)
    );
  },
  undefined,
  (err) => failed('grid_tiles.mtl', err)
);

// --- layer: Swiss Way tactical zone overlay (not an IFF spec, see script header) ---
const tacticalCheckbox = document.getElementById('tacticalCheckbox');
const legendEl = document.getElementById('legend');
let tacticalGroup = null;
bindLayerToggle(tacticalCheckbox, () => tacticalGroup);

expectLoad('tactical_zones.obj');
const tacticalMtlLoader = new MTLLoader();
tacticalMtlLoader.load(
  'assets/tactical_zones.mtl' + CACHE_BUST,
  (materials) => {
    materials.preload();
    for (const name of ['SlotNear', 'SlotHigh', 'Pocket', 'Playmaker', 'ZentralLine']) {
      const m = materials.materials[name];
      if (m) {
        m.side = THREE.DoubleSide;
        m.transparent = true;
        m.depthWrite = false;
      }
    }

    const objLoader = new OBJLoader();
    objLoader.setMaterials(materials);
    objLoader.load(
      'assets/tactical_zones.obj' + CACHE_BUST,
      (object) => {
        object.visible = tacticalCheckbox.checked;
        tacticalGroup = object;
        scene.add(object);
        legendEl.style.display = 'block';
        loaded('tactical_zones.obj');
      },
      undefined,
      (err) => failed('tactical_zones.obj', err)
    );
  },
  undefined,
  (err) => failed('tactical_zones.mtl', err)
);
