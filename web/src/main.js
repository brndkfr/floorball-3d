import * as THREE from 'three';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

// cache-bust every asset fetch so edited .obj/.mtl files are never served stale
const CACHE_BUST = `?t=${Date.now()}`;

const statusEl = document.getElementById('status');
let pending = 7; // rink + goals + ball + 2x goalie models + grid tiles + tactical zones
function loaded(name) {
  pending--;
  statusEl.textContent = `loaded ${name}`;
  if (pending <= 0) setTimeout(() => statusEl.style.display = 'none', 1500);
}
function failed(name, err) {
  console.error(`Failed to load ${name}`, err);
  statusEl.textContent = `failed to load ${name} - see console`;
}

// HUD panels collapse to just their header via the icon button in the corner
document.querySelectorAll('.hud-toggle').forEach((btn) => {
  btn.addEventListener('click', () => {
    const panel = document.getElementById(btn.dataset.panel);
    const collapsed = panel.classList.toggle('collapsed');
    btn.textContent = collapsed ? '+' : '−';
  });
});

// helper: wire a checkbox to a layer object/group once it's loaded
function bindLayerToggle(checkbox, getObject) {
  checkbox.addEventListener('change', () => {
    const obj = getObject();
    if (obj) obj.visible = checkbox.checked;
  });
}

// canvas-texture text sprite, used for the grid overlay's "col-row" tile labels
function makeLabelSprite(text, size = 550) {
  const w = 160, h = 100;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 46px system-ui, sans-serif';
  ctx.fillStyle = '#1b1b1f';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, depthWrite: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(size * (w / h), size, 1);
  return sprite;
}

// rink is 40000 x 20000 mm, running along +Z, centred on X=0
const RINK_L = 40000, RINK_W = 20000, HALF_W = RINK_W / 2;
const GRID_TILE_SIZE = 2000; // must match generate_grid_tiles.py
const GRID_N_COLS = RINK_W / GRID_TILE_SIZE, GRID_N_ROWS = RINK_L / GRID_TILE_SIZE;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b1b1f);
scene.fog = new THREE.Fog(0x1b1b1f, 35000, 90000);

// --- first-person "walk the rink" camera: no OrbitControls. Position is
// free-walked with WASD/arrows (eye height fixed, floor-plane movement
// only); look direction is yaw/pitch, turned by holding the left mouse
// button and dragging (a plain click, i.e. no drag, still selects objects -
// see the pointerdown/pointerup handlers further down).
const DEFAULT_FOV = 70;
const camera = new THREE.PerspectiveCamera(DEFAULT_FOV, window.innerWidth / window.innerHeight, 50, 200000);
const EYE_HEIGHT = 1600; // mm, roughly adult standing eye height
const DEFAULT_CAMERA_POSITION = new THREE.Vector3(0, EYE_HEIGHT, 3000);
const DEFAULT_YAW = 0;   // facing +Z, i.e. looking down the rink's length
const DEFAULT_PITCH = 0;
const MIN_FOV = 20, MAX_FOV = 90; // narrower FOV reads as "zoomed in"
const ZOOM_SENSITIVITY = 0.05; // degrees of FOV per unit of wheel deltaY

let camYaw = DEFAULT_YAW;
let camPitch = DEFAULT_PITCH;
camera.rotation.order = 'YXZ';
camera.position.copy(DEFAULT_CAMERA_POSITION);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// Every other object in this scene (goal, goalie) treats local +Z as
// "forward" (yaw 0). Three.js cameras default to looking down -Z, so we add
// a fixed 180deg offset when actually applying rotation.y - that keeps
// camYaw consistent with the rest of the codebase (and with the forward/
// right vectors used for WASD walking below) while still pointing the
// camera the right way on screen.
function setCameraLook(yaw, pitch) {
  camYaw = yaw;
  camPitch = THREE.MathUtils.clamp(pitch, -1.4, 1.4); // ~-80deg..+80deg, avoids flipping over
  camera.rotation.set(camPitch, camYaw + Math.PI, 0);
}
setCameraLook(camYaw, camPitch);

// lighting
scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3a40, 1.15));
const key = new THREE.DirectionalLight(0xffffff, 1.1);
key.position.set(15000, 26000, 10000);
scene.add(key);
const fill = new THREE.DirectionalLight(0xffffff, 0.35);
fill.position.set(-18000, 12000, 30000);
scene.add(fill);

// blue floor, sized a bit larger than the rink so it reads as a floor border
// around the boards, like a real hall floor around the court
const surroundFloor = new THREE.Mesh(
  new THREE.PlaneGeometry(RINK_W + 6000, RINK_L + 6000),
  new THREE.MeshStandardMaterial({ color: 0x1a59ad, roughness: 0.85, metalness: 0.0 })
);
surroundFloor.rotation.x = -Math.PI / 2;
surroundFloor.position.set(0, -5, RINK_L / 2);
scene.add(surroundFloor);

// --- layer: grey scene-reference grid (generic three.js helper) ---
const gridCheckbox = document.getElementById('gridCheckbox');
const sceneGrid = new THREE.GridHelper(Math.max(RINK_W, RINK_L) + 6000, 50, 0x9a9a9a, 0xb9bdb8);
sceneGrid.position.set(0, -4, RINK_L / 2); // just above the floor (y=-5) so it's visible on top when shown
sceneGrid.visible = gridCheckbox.checked;
scene.add(sceneGrid);
gridCheckbox.addEventListener('change', () => { sceneGrid.visible = gridCheckbox.checked; });

// --- layer: rink (board + IFF markings) ---
const rinkCheckbox = document.getElementById('rinkCheckbox');
let rinkGroup = null;
bindLayerToggle(rinkCheckbox, () => rinkGroup);

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
// Goal-line placement (derived from the rink spec, see generate_rink.py):
//   goal back sits 2850 mm from the board, goal mouth (goal line) at 3500 mm.
const GOAL_LINE_FROM_BOARD = 3500;

const goalsCheckbox = document.getElementById('goalsCheckbox');
let goalsGroup = null;
const goalInstances = []; // individual goal objects, for click-to-select
bindLayerToggle(goalsCheckbox, () => goalsGroup);

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
        goalInstances.push(object, goalB);

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
let ballGroup = null;
bindLayerToggle(ballCheckbox, () => ballGroup);

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
        // this sets its actual rink position (default: centre spot)
        object.position.set(0, 0, RINK_L / 2);
        object.visible = ballCheckbox.checked;
        ballGroup = object;
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

// --- layer: goalie - switchable between two models. `goalieGroup` always
// points at whichever one is currently active, so every other piece of code
// (selection, WASD/Q-E movement, coverage raycasting, the floating label,
// trajectory targeting) keeps working unchanged regardless of which model
// is on screen. ---
const goalieCheckbox = document.getElementById('goalieCheckbox');
const goalieModelSelect = document.getElementById('goalieModelSelect');
let goalieGroup = null;
const goalieModels = {}; // key -> loaded wrapper Group
bindLayerToggle(goalieCheckbox, () => goalieGroup);

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
// computeShotLineColor / updateTrajectory further down): for every mesh in
// the given model, add a slightly-larger, back-face-only, unlit clone as a
// CHILD of that mesh. Rendering only back faces means the enlarged clone is
// invisible everywhere the original mesh covers it, and only pokes out
// right at the silhouette edge, as seen from the camera - a standard
// cheap "toon outline" technique that needs no post-processing pipeline.
// Parenting under the original mesh means it automatically follows that
// mesh's position/rotation/scale with no per-frame sync needed. Built once
// per model (right after it loads), then toggled/recoloured per frame.
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
    outline.frustumCulled = false; // moves/reparents with the model, same reasoning as trajectoryLines
    child.add(outline);
    outlineMeshes.push(outline);
  }
  return outlineMeshes;
}

const goalieOutlinesByModel = {}; // key -> array of outline meshes for that model, from buildOutlineMeshes()
let activeGoalieKey = null;

function activateGoalieModel(key) {
  const next = goalieModels[key];
  if (!next || next === goalieGroup) return;
  const prev = goalieGroup;
  if (prev) {
    next.position.copy(prev.position);
    next.rotation.copy(prev.rotation);
    prev.visible = false;
  }
  goalieGroup = next;
  goalieGroup.visible = goalieCheckbox.checked;
  activeGoalieKey = key;
  if (selected === prev && prev) selectObject(goalieGroup); // keep the ring/controls following
}

// model 1: the first-pass blocky figure (see generate_goalie.py)
loadGoalieModel('assets/goalie.mtl', 'assets/goalie.obj', (object) => {
  // local-origin-centred (ground contact point = 0,0,0), faces +Z by default
  // - matches goal A's mouth orientation, so it needs no extra rotation
  object.position.set(0, 0, GOAL_LINE_FROM_BOARD + 500);
  object.visible = false;
  goalieModels.blocky = object;
  goalieOutlinesByModel.blocky = buildOutlineMeshes(object);
  scene.add(object);
  // "Detailed" is the intended default - this only fills in as a placeholder
  // if blocky's (much smaller) files happen to finish loading first, so
  // something is on screen immediately. Detailed unconditionally activates
  // itself below once it's ready, overriding this regardless of order.
  if (!goalieGroup) activateGoalieModel('blocky');
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
  goalieModels.detailed = wrapper;
  goalieOutlinesByModel.detailed = buildOutlineMeshes(object);
  scene.add(wrapper);
  activateGoalieModel('detailed'); // always wins as the default, overriding blocky's placeholder activation above if needed
});

goalieModelSelect.addEventListener('change', () => {
  activateGoalieModel(goalieModelSelect.value);
});

// --- layer: optional numbered grid overlay (not an IFF marking, see script header) ---
const gridTilesCheckbox = document.getElementById('gridTilesCheckbox');
let gridTilesGroup = null;
bindLayerToggle(gridTilesCheckbox, () => gridTilesGroup);

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

// --- coordinate readout: hover to preview, click to pin a coordinate ---
const coordXEl = document.getElementById('coordX');
const coordZEl = document.getElementById('coordZ');
const coordTileEl = document.getElementById('coordTile');
const coordClickEl = document.getElementById('coordClick');

const raycaster = new THREE.Raycaster();
const mouseNDC = new THREE.Vector2();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // y = 0, the markings' reference plane
const hitPoint = new THREE.Vector3();

function tileLabelFor(x, z) {
  const col = Math.floor((x + HALF_W) / GRID_TILE_SIZE) + 1;
  const row = Math.floor(z / GRID_TILE_SIZE) + 1;
  if (col < 1 || col > GRID_N_COLS || row < 1 || row > GRID_N_ROWS) return 'off rink';
  return `${col}-${row}`;
}

function pointerToWorld(event) {
  mouseNDC.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouseNDC.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouseNDC, camera);
  return raycaster.ray.intersectPlane(floorPlane, hitPoint) ? hitPoint : null;
}

renderer.domElement.addEventListener('pointermove', (event) => {
  const p = pointerToWorld(event);
  if (p) {
    coordXEl.textContent = p.x.toFixed(0);
    coordZEl.textContent = p.z.toFixed(0);
    coordTileEl.textContent = tileLabelFor(p.x, p.z);
  }

  if (isLooking) {
    setCameraLook(camYaw - (event.clientX - lastLookX) * LOOK_SENSITIVITY, camPitch - (event.clientY - lastLookY) * LOOK_SENSITIVITY);
    lastLookX = event.clientX;
    lastLookY = event.clientY;
  }
});

// --- selection + ball placement ---
const selectedLabelEl = document.getElementById('selectedLabel');
let selected = null; // the currently selected THREE.Object3D (ballGroup or a goal instance), or null

const selectionRing = new THREE.Mesh(
  new THREE.RingGeometry(0.85, 1.0, 48),
  new THREE.MeshBasicMaterial({ color: 0xffd21a, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false })
);
selectionRing.rotation.x = -Math.PI / 2;
selectionRing.visible = false;
scene.add(selectionRing);


function labelFor(obj) {
  if (obj === ballGroup) return 'ball';
  if (obj === goalieGroup) return 'goalie';
  const i = goalInstances.indexOf(obj);
  if (i === 0) return 'goal A (z=0 end)';
  if (i === 1) return 'goal B (z=40000 end)';
  return 'object';
}

function selectObject(obj) {
  selected = obj;
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.x, size.z) / 2 + 120;
  selectionRing.scale.set(radius, radius, 1);
  selectionRing.position.set(center.x, 4, center.z);
  selectionRing.visible = true;
  selectedLabelEl.textContent = labelFor(obj);
}

function deselectAll() {
  selected = null;
  selectionRing.visible = false;
  selectedLabelEl.textContent = '-';
}

// Ball's local origin is its floor-contact point (see generate_ball.py), so
// its world centre is a cheap fixed offset from position - computed once per
// frame in animate() and shared by updateTrajectory/updateCoverage below,
// instead of each calling its own Box3.setFromObject(ballGroup) (which was
// both redundant work done twice and needless geometry traversal to begin
// with, since the offset is already known).
const BALL_RADIUS = 36; // matches generate_ball.py's BALL_RADIUS
const ballWorldCenter = new THREE.Vector3();
function getBallWorldCenter() {
  if (!ballGroup) return null;
  return ballWorldCenter.set(ballGroup.position.x, ballGroup.position.y + BALL_RADIUS, ballGroup.position.z);
}

// --- ball-to-goal trajectory lines ---
// Goal mouth corners in the goal's own local space (matches generate_goal.py:
// width 1600mm -> +/-800, height 0-1150). localToWorld() below applies each
// goal instance's actual position/rotation, so this works for either goal
// without needing to special-case the 180deg-flipped one.
const trajectoryCheckbox = document.getElementById('trajectoryCheckbox');
const targetGoalLabelEl = document.getElementById('targetGoalLabel');
let targetGoal = null;

const GOAL_MOUTH_CORNERS_LOCAL = [
  new THREE.Vector3(-800, 0, 0),
  new THREE.Vector3(800, 0, 0),
  new THREE.Vector3(-800, 1150, 0),
  new THREE.Vector3(800, 1150, 0),
];
const GOAL_CENTER_LOCAL = new THREE.Vector3(0, 575, 0); // mouth centre: x=0 (mid-width), y=575 (mid-height)

const trajectoryGeometry = new THREE.BufferGeometry();
trajectoryGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(GOAL_MOUTH_CORNERS_LOCAL.length * 2 * 3), 3));
const trajectoryLines = new THREE.LineSegments(
  trajectoryGeometry,
  new THREE.LineBasicMaterial({ color: 0xffe066 })
);
trajectoryLines.visible = false;
// We mutate the position buffer directly every frame (needsUpdate = true
// only re-uploads it to the GPU, it does NOT refresh the cached bounding
// sphere three.js uses for frustum culling) - disable culling for this
// object entirely so a stale bounding sphere never makes it vanish from an
// unexpected camera angle.
trajectoryLines.frustumCulled = false;
scene.add(trajectoryLines);

// dotted "shooting line" - ball centre straight to the goal mouth centre,
// distinct from the 4 solid corner lines above so it reads as the one shot
// that matters rather than another trajectory option.
const shootingLineGeometry = new THREE.BufferGeometry();
shootingLineGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2 * 3), 3));
const shootingLine = new THREE.LineSegments(
  shootingLineGeometry,
  new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 120, gapSize: 80 })
);
shootingLine.visible = false;
shootingLine.frustumCulled = false; // same reasoning as trajectoryLines above
scene.add(shootingLine);

// Shooting-line colour: a coaching cue for where the goalie should stand,
// not just whether the shot is blocked.
//   red    - nothing between ball and goal centre: a fully open shot
//   yellow - the goalie's mesh IS in the way, but it isn't lined up with
//            the shot at its own depth - blocking with an edge/limb rather
//            than being squarely positioned
//   green  - at the depth the goalie has chosen, its lateral (X) position
//            matches where the ball->goal-centre line actually passes - the
//            "squared up" position a real goalie is coached to find
// Only the goalie is checked for obstruction (matches updateCoverage's
// scope). "Centred" is judged purely by lateral (X) offset at the goalie's
// own Z, not full 3D distance to the line - an earlier version compared
// against the goalie's full 3D position using a fixed torso-height point,
// but the line's own height only ranges from the ball (~floor level) to the
// goal centre (575mm), well below a realistic torso height - so even a
// laterally-perfect goalie always had a large, depth-dependent leftover
// vertical gap, making "green" nearly unreachable. Lateral-only avoids that
// and matches how goalies are actually coached (slide sideways to the shot
// line at whatever depth you've chosen), so the align button below can
// reach it exactly.
const SHOT_OPEN_COLOR = new THREE.Color(0xff3b30);
const SHOT_BLOCKED_OFFCENTER_COLOR = new THREE.Color(0xffd21a);
const SHOT_BLOCKED_CENTERED_COLOR = new THREE.Color(0x2ecc55);
const GOALIE_CENTERED_THRESHOLD = 200; // mm of lateral (X) offset still counted as "centred" - an estimate, not a sourced number

const shootingLineRaycaster = new THREE.Raycaster();
const shotDirScratch = new THREE.Vector3();

// Where does the ball->goalCenter line sit in X at a given Z? (linear
// interpolation along the line) - shared by the colour check and the
// "align goalie to shot line" button, so both agree on the same target.
function shotLineXAtZ(ballCenter, goalCenter, z) {
  const dz = goalCenter.z - ballCenter.z;
  if (Math.abs(dz) < 1e-6) return ballCenter.x; // degenerate: ball and goal centre share a Z, no meaningful line
  const t = (z - ballCenter.z) / dz;
  return ballCenter.x + t * (goalCenter.x - ballCenter.x);
}

function computeShotLineColor(ballCenter, goalCenter) {
  if (!goalieGroup || !goalieGroup.visible) return SHOT_OPEN_COLOR;

  const toGoal = shotDirScratch.copy(goalCenter).sub(ballCenter);
  const dist = toGoal.length();
  if (dist < 1) return SHOT_OPEN_COLOR;

  shootingLineRaycaster.set(ballCenter, toGoal.clone().normalize());
  shootingLineRaycaster.far = dist - 1;
  if (shootingLineRaycaster.intersectObject(goalieGroup, true).length === 0) return SHOT_OPEN_COLOR;

  const lineX = shotLineXAtZ(ballCenter, goalCenter, goalieGroup.position.z);
  const lateralOffset = Math.abs(goalieGroup.position.x - lineX);

  return lateralOffset <= GOALIE_CENTERED_THRESHOLD ? SHOT_BLOCKED_CENTERED_COLOR : SHOT_BLOCKED_OFFCENTER_COLOR;
}

const trajectoryScratchCorner = new THREE.Vector3();
const shootingLineScratchCenter = new THREE.Vector3();
const goalieOutlineCheckbox = document.getElementById('goalieOutlineCheckbox');

function setGoalieOutlineVisible(visible, color) {
  const outlines = goalieOutlinesByModel[activeGoalieKey];
  if (!outlines) return;
  for (const outline of outlines) {
    outline.visible = visible;
    if (visible) outline.material.color.copy(color);
  }
}

function updateTrajectory(ballCenter) {
  if (!trajectoryCheckbox.checked || !ballCenter || !targetGoal) {
    trajectoryLines.visible = false;
    shootingLine.visible = false;
    setGoalieOutlineVisible(false);
    return;
  }
  const positions = trajectoryGeometry.attributes.position.array;
  let idx = 0;
  for (const corner of GOAL_MOUTH_CORNERS_LOCAL) {
    const worldCorner = targetGoal.localToWorld(trajectoryScratchCorner.copy(corner));
    positions[idx++] = ballCenter.x; positions[idx++] = ballCenter.y; positions[idx++] = ballCenter.z;
    positions[idx++] = worldCorner.x; positions[idx++] = worldCorner.y; positions[idx++] = worldCorner.z;
  }
  trajectoryGeometry.attributes.position.needsUpdate = true;
  trajectoryLines.visible = true;

  const goalCenter = targetGoal.localToWorld(shootingLineScratchCenter.copy(GOAL_CENTER_LOCAL));
  const shootingPositions = shootingLineGeometry.attributes.position.array;
  shootingPositions[0] = ballCenter.x; shootingPositions[1] = ballCenter.y; shootingPositions[2] = ballCenter.z;
  shootingPositions[3] = goalCenter.x; shootingPositions[4] = goalCenter.y; shootingPositions[5] = goalCenter.z;
  shootingLineGeometry.attributes.position.needsUpdate = true;
  shootingLine.computeLineDistances(); // required for LineDashedMaterial - recomputes the dash pattern from the new endpoints
  const shotColor = computeShotLineColor(ballCenter, goalCenter);
  shootingLine.material.color.copy(shotColor);
  shootingLine.visible = true;

  const showOutline = goalieOutlineCheckbox.checked && goalieGroup && goalieGroup.visible && shotColor !== SHOT_OPEN_COLOR;
  setGoalieOutlineVisible(showOutline, shotColor);
}

// --- goal coverage: what fraction of the goal mouth does the goalie block? ---
// Samples a grid of points across the goal opening; for each, casts a ray
// from the ball to that point and checks whether the goalie's mesh sits in
// the way. Red = open lane to the goal, green = covered. The percentage
// readout is the actual answer to "how much is covered" - the coloring is
// just there so you can see *where*.
const coverageCheckbox = document.getElementById('coverageCheckbox');
const coveragePctEl = document.getElementById('coveragePct');
const COVERAGE_COLS = 16, COVERAGE_ROWS = 12; // sample grid resolution across the goal mouth
const CELL_W = 1600 / COVERAGE_COLS, CELL_H = 1150 / COVERAGE_ROWS;

// Shared-vertex grid (one extra row/col of vertices vs. cells) rather than
// one independent flat-colored quad per cell - lets three.js interpolate
// color smoothly across each cell instead of showing hard block edges,
// using roughly the same number of raycast samples (vertices, not cells).
const COVERAGE_VCOLS = COVERAGE_COLS + 1, COVERAGE_VROWS = COVERAGE_ROWS + 1;
const COVERAGE_VERTEX_COUNT = COVERAGE_VCOLS * COVERAGE_VROWS;

const coveragePositions = new Float32Array(COVERAGE_VERTEX_COUNT * 3);
const coverageColors = new Float32Array(COVERAGE_VERTEX_COUNT * 3);
const coverageIndex = [];
{
  for (let r = 0; r < COVERAGE_VROWS; r++) {
    for (let c = 0; c < COVERAGE_VCOLS; c++) {
      const vi = r * COVERAGE_VCOLS + c;
      coveragePositions.set([-800 + c * CELL_W, r * CELL_H, 0], vi * 3);
    }
  }
  for (let r = 0; r < COVERAGE_ROWS; r++) {
    for (let c = 0; c < COVERAGE_COLS; c++) {
      const v00 = r * COVERAGE_VCOLS + c, v10 = v00 + 1, v01 = v00 + COVERAGE_VCOLS, v11 = v01 + 1;
      coverageIndex.push(v00, v10, v11, v00, v11, v01);
    }
  }
}
const coverageGeometry = new THREE.BufferGeometry();
coverageGeometry.setAttribute('position', new THREE.BufferAttribute(coveragePositions, 3));
coverageGeometry.setAttribute('color', new THREE.BufferAttribute(coverageColors, 3));
coverageGeometry.setIndex(coverageIndex);
const coverageMesh = new THREE.Mesh(
  coverageGeometry,
  new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })
);
coverageMesh.position.set(0, 0, 2); // just off the goal mouth plane, avoids z-fighting with the frame
coverageMesh.visible = false;
coverageMesh.frustumCulled = false; // reparented between goals + defensive, same reasoning as trajectoryLines

const coverageRaycaster = new THREE.Raycaster();
let currentCoveragePct = null; // shared with the floating goalie label below

// Raycasting 221 samples against a 10k-triangle detailed goalie mesh every
// single animation frame (60/sec) regardless of whether anything moved was
// the single largest per-frame cost in the app. Nothing here needs to be
// recomputed unless the ball, the target goal, or the goalie's identity/
// pose/visibility actually changed since the last frame - so track that
// and skip the raycasting pass entirely on unchanged frames.
const blockedAt = new Float32Array(COVERAGE_VERTEX_COUNT); // 0 = open, 1 = blocked, per grid vertex, reused every call
const coverageScratchPt = new THREE.Vector3();
const coverageScratchDir = new THREE.Vector3();
const lastCoverageState = {
  ballX: NaN, ballY: NaN, ballZ: NaN, targetGoal: null,
  goalieRef: null, goalieX: NaN, goalieY: NaN, goalieZ: NaN, goalieRotY: NaN, goalieVisible: null,
};

function coverageInputsChanged(ballCenter) {
  const s = lastCoverageState;
  const gx = goalieGroup ? goalieGroup.position.x : NaN;
  const gy = goalieGroup ? goalieGroup.position.y : NaN;
  const gz = goalieGroup ? goalieGroup.position.z : NaN;
  const grot = goalieGroup ? goalieGroup.rotation.y : NaN;
  const gvis = goalieGroup ? goalieGroup.visible : null;
  const bx = ballCenter ? ballCenter.x : NaN, by = ballCenter ? ballCenter.y : NaN, bz = ballCenter ? ballCenter.z : NaN;

  const changed = s.ballX !== bx || s.ballY !== by || s.ballZ !== bz || s.targetGoal !== targetGoal ||
    s.goalieRef !== goalieGroup || s.goalieX !== gx || s.goalieY !== gy || s.goalieZ !== gz ||
    s.goalieRotY !== grot || s.goalieVisible !== gvis;

  if (changed) {
    s.ballX = bx; s.ballY = by; s.ballZ = bz; s.targetGoal = targetGoal;
    s.goalieRef = goalieGroup; s.goalieX = gx; s.goalieY = gy; s.goalieZ = gz;
    s.goalieRotY = grot; s.goalieVisible = gvis;
  }
  return changed;
}

function updateCoverage(ballCenter) {
  if (!coverageCheckbox.checked || !targetGoal) {
    coverageMesh.visible = false;
    coveragePctEl.textContent = '-';
    currentCoveragePct = null;
    return;
  }
  if (coverageMesh.parent !== targetGoal) targetGoal.add(coverageMesh);
  coverageMesh.visible = true;

  if (!coverageInputsChanged(ballCenter)) return; // nothing moved - reuse the colors/percentage from last pass

  for (let i = 0; i < COVERAGE_VERTEX_COUNT; i++) {
    coverageScratchPt.set(coveragePositions[i * 3], coveragePositions[i * 3 + 1], coveragePositions[i * 3 + 2]);
    const worldPt = targetGoal.localToWorld(coverageScratchPt);

    let blocked = 0;
    if (ballCenter && goalieGroup && goalieGroup.visible) {
      coverageScratchDir.copy(worldPt).sub(ballCenter);
      const dist = coverageScratchDir.length();
      coverageScratchDir.normalize();
      coverageRaycaster.set(ballCenter, coverageScratchDir);
      coverageRaycaster.far = dist - 1;
      if (coverageRaycaster.intersectObject(goalieGroup, true).length > 0) blocked = 1;
    }
    blockedAt[i] = blocked;
    const color = blocked ? [0.15, 0.85, 0.25] : [0.85, 0.15, 0.15];
    coverageColors.set(color, i * 3);
  }
  coverageGeometry.attributes.color.needsUpdate = true;

  // % blocked = mean of each cell's 4 corner samples, so a cell straddling
  // the covered/open boundary contributes fractionally instead of an
  // all-or-nothing vote - matches the smooth-shaded look above.
  let blockedArea = 0;
  for (let r = 0; r < COVERAGE_ROWS; r++) {
    for (let c = 0; c < COVERAGE_COLS; c++) {
      const v00 = r * COVERAGE_VCOLS + c, v10 = v00 + 1, v01 = v00 + COVERAGE_VCOLS, v11 = v01 + 1;
      blockedArea += (blockedAt[v00] + blockedAt[v10] + blockedAt[v01] + blockedAt[v11]) / 4;
    }
  }
  currentCoveragePct = Math.round((blockedArea / (COVERAGE_COLS * COVERAGE_ROWS)) * 100);
  coveragePctEl.textContent = `${currentCoveragePct}% blocked`;
}

// Floating label above the goalie's head showing the same percentage, so you
// don't have to glance at the side panel while nudging its position around.
const goalieLabelEl = document.getElementById('goalieLabel');
const labelProjection = new THREE.Vector3();

function updateGoalieLabel() {
  if (!goalieGroup || !goalieGroup.visible || currentCoveragePct === null) {
    goalieLabelEl.style.display = 'none';
    return;
  }
  labelProjection.set(goalieGroup.position.x, 850, goalieGroup.position.z).project(camera);
  if (labelProjection.z > 1) { // behind the camera
    goalieLabelEl.style.display = 'none';
    return;
  }
  goalieLabelEl.style.left = `${(labelProjection.x * 0.5 + 0.5) * window.innerWidth}px`;
  goalieLabelEl.style.top = `${(-labelProjection.y * 0.5 + 0.5) * window.innerHeight}px`;
  goalieLabelEl.textContent = `${currentCoveragePct}% blocked`;
  goalieLabelEl.style.display = 'block';
}

// aims setCameraLook() at a world point from a given position, matching the
// yaw=0-means-+Z convention used throughout (see setCameraLook above)
function lookAtFrom(fromPos, targetPos) {
  const dx = targetPos.x - fromPos.x, dy = targetPos.y - fromPos.y, dz = targetPos.z - fromPos.z;
  const yaw = Math.atan2(dx, dz);
  const pitch = Math.atan2(dy, Math.hypot(dx, dz));
  setCameraLook(yaw, pitch);
}

// --- camera shortcuts: jump to the ball's exact vantage point (same origin
// the coverage raycasts use), and back to the default overview ---
document.getElementById('viewFromBallBtn').addEventListener('click', () => {
  if (!ballGroup || !targetGoal) {
    coveragePctEl.textContent = 'select/target a goal and place the ball first';
    return;
  }
  const ballCenter = new THREE.Box3().setFromObject(ballGroup).getCenter(new THREE.Vector3());
  const goalCenter = targetGoal.localToWorld(new THREE.Vector3(0, 575, 0));

  // Pull back slightly from the ball, away from the goal, instead of sitting
  // exactly on top of it. The trajectory lines start at the ball's centre -
  // a camera placed exactly there looks almost straight down each line's
  // length, foreshortening them to nearly nothing. Standing just behind the
  // ball keeps it (and the full length of every line) visibly in front of
  // the camera instead of right at the eye point.
  const awayFromGoal = ballCenter.clone().sub(goalCenter).setY(0).normalize();
  const viewPoint = ballCenter.clone().addScaledVector(awayFromGoal, 200);
  viewPoint.y = ballCenter.y + 60; // a touch of height so the lines aren't edge-on with the floor either

  camera.position.copy(viewPoint);
  lookAtFrom(viewPoint, goalCenter);
});

document.getElementById('resetViewBtn').addEventListener('click', () => {
  camera.position.copy(DEFAULT_CAMERA_POSITION);
  setCameraLook(DEFAULT_YAW, DEFAULT_PITCH);
  camera.fov = DEFAULT_FOV;
  camera.updateProjectionMatrix();
});

// Snaps the goalie's lateral (X) position onto the shot line at whatever
// depth (Z) it's currently standing - the same target the shooting-line
// colour check uses, so this reliably turns the line green rather than
// leaving it to imprecise arrow-key nudging.
document.getElementById('alignGoalieBtn').addEventListener('click', () => {
  const ballCenter = getBallWorldCenter();
  if (!ballCenter || !targetGoal || !goalieGroup || !goalieGroup.visible) {
    coveragePctEl.textContent = 'need a ball, a targeted goal, and a visible goalie first';
    return;
  }
  const goalCenter = targetGoal.localToWorld(GOAL_CENTER_LOCAL.clone());
  goalieGroup.position.x = shotLineXAtZ(ballCenter, goalCenter, goalieGroup.position.z);
  if (selected === goalieGroup) selectObject(goalieGroup); // keep the ring following if it's selected
});

// --- scroll-wheel zoom: narrows/widens the FOV rather than dollying the
// camera position, so it works the same whether you're walking, or have
// something selected, without pushing through walls/objects ---
renderer.domElement.addEventListener('wheel', (event) => {
  event.preventDefault();
  camera.fov = THREE.MathUtils.clamp(camera.fov + event.deltaY * ZOOM_SENSITIVITY, MIN_FOV, MAX_FOV);
  camera.updateProjectionMatrix();
}, { passive: false });

// --- keyboard controls: arrow keys/WASD move the selected ball, Escape
// deselects, Tab/Shift+Tab cycles selection - game-style input on top of
// the mouse-driven selection/placement above ---
const clock = new THREE.Clock();
const keysPressed = new Set();
const BALL_SPEED = 4000; // mm/second
const BALL_RADIUS_FOR_CLAMP = BALL_RADIUS; // same value, see the getBallWorldCenter() comment above
const WALK_SPEED = 2500; // mm/second, first-person camera walking
const WALK_BOUNDARY_MARGIN = 3000; // mm past the boards you're still allowed to walk
const MOVE_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D', 'q', 'e', 'Q', 'E'];

function cycleSelection(direction) {
  const cycle = [ballGroup, goalieGroup, ...goalInstances].filter(Boolean);
  if (cycle.length === 0) return;
  const idx = selected ? cycle.indexOf(selected) : -1;
  const obj = cycle[(idx + direction + cycle.length) % cycle.length];
  selectObject(obj);
  if (goalInstances.includes(obj)) {
    targetGoal = obj;
    targetGoalLabelEl.textContent = labelFor(obj);
  }
}

// Goalie movement is fully free - no line-lock, no clamp beyond the rink
// itself, same control feel as the ball. Rotation is manual too (Q/E) rather
// than auto-facing the ball, so the two don't fight over control each frame.
const GOALIE_SPEED = 3000; // mm/second
const GOALIE_RADIUS_FOR_CLAMP = 400; // rough footprint half-width, keeps it off the boards
const GOALIE_ROTATE_SPEED = 2.2; // radians/second
const GOALIE_FINE_FACTOR = 0.2; // hold Shift to move/rotate the goalie at this fraction of normal speed
let shiftHeld = false;

function handleKeyboardMovement(dt) {
  if (selected === ballGroup && ballGroup) {
    let dx = 0, dz = 0;
    // Signs match the camera's default forward (+Z)/right (-X) directions
    // (see forwardX/rightX below) - not raw world axes - so Up/Right feel
    // like "away from"/"to the right of" the viewer at the default view.
    if (keysPressed.has('ArrowUp') || keysPressed.has('w') || keysPressed.has('W')) dz += 1;
    if (keysPressed.has('ArrowDown') || keysPressed.has('s') || keysPressed.has('S')) dz -= 1;
    if (keysPressed.has('ArrowLeft') || keysPressed.has('a') || keysPressed.has('A')) dx += 1;
    if (keysPressed.has('ArrowRight') || keysPressed.has('d') || keysPressed.has('D')) dx -= 1;
    if (dx === 0 && dz === 0) return;
    const len = Math.hypot(dx, dz);
    const dist = BALL_SPEED * dt;
    ballGroup.position.x = THREE.MathUtils.clamp(ballGroup.position.x + (dx / len) * dist, -HALF_W + BALL_RADIUS_FOR_CLAMP, HALF_W - BALL_RADIUS_FOR_CLAMP);
    ballGroup.position.z = THREE.MathUtils.clamp(ballGroup.position.z + (dz / len) * dist, BALL_RADIUS_FOR_CLAMP, RINK_L - BALL_RADIUS_FOR_CLAMP);
    selectObject(ballGroup); // keep the ring (and coordinate readout logic) following
  } else if (selected === goalieGroup && goalieGroup) {
    let dx = 0, dz = 0;
    // Same forward(+Z)/right(-X) convention as the ball block above.
    if (keysPressed.has('ArrowUp') || keysPressed.has('w') || keysPressed.has('W')) dz += 1;
    if (keysPressed.has('ArrowDown') || keysPressed.has('s') || keysPressed.has('S')) dz -= 1;
    if (keysPressed.has('ArrowLeft') || keysPressed.has('a') || keysPressed.has('A')) dx += 1;
    if (keysPressed.has('ArrowRight') || keysPressed.has('d') || keysPressed.has('D')) dx -= 1;
    if (dx !== 0 || dz !== 0) {
      const len = Math.hypot(dx, dz);
      const dist = GOALIE_SPEED * (shiftHeld ? GOALIE_FINE_FACTOR : 1) * dt;
      goalieGroup.position.x = THREE.MathUtils.clamp(goalieGroup.position.x + (dx / len) * dist, -HALF_W + GOALIE_RADIUS_FOR_CLAMP, HALF_W - GOALIE_RADIUS_FOR_CLAMP);
      goalieGroup.position.z = THREE.MathUtils.clamp(goalieGroup.position.z + (dz / len) * dist, GOALIE_RADIUS_FOR_CLAMP, RINK_L - GOALIE_RADIUS_FOR_CLAMP);
      selectObject(goalieGroup); // keep the ring following
    }
    let rot = 0;
    if (keysPressed.has('q') || keysPressed.has('Q')) rot -= 1;
    if (keysPressed.has('e') || keysPressed.has('E')) rot += 1;
    if (rot !== 0) goalieGroup.rotation.y += rot * GOALIE_ROTATE_SPEED * (shiftHeld ? GOALIE_FINE_FACTOR : 1) * dt;
  } else {
    // nothing selected - WASD/arrows walk the camera instead (first-person
    // exploration). Forward/right are derived from the current look yaw, so
    // movement is always relative to where you're facing, not world axes.
    let f = 0, r = 0;
    if (keysPressed.has('ArrowUp') || keysPressed.has('w') || keysPressed.has('W')) f += 1;
    if (keysPressed.has('ArrowDown') || keysPressed.has('s') || keysPressed.has('S')) f -= 1;
    if (keysPressed.has('ArrowRight') || keysPressed.has('d') || keysPressed.has('D')) r += 1;
    if (keysPressed.has('ArrowLeft') || keysPressed.has('a') || keysPressed.has('A')) r -= 1;
    if (f === 0 && r === 0) return;
    const len = Math.hypot(f, r);
    const dist = (WALK_SPEED * dt) / len;
    const forwardX = Math.sin(camYaw), forwardZ = Math.cos(camYaw);
    // Right must be derived from the camera's ACTUAL applied rotation
    // (camYaw + PI, see setCameraLook above), not naively from camYaw alone -
    // that PI offset flips the apparent left/right too. This was the bug:
    // the previous formula used camYaw directly and ended up pointing left.
    const rightX = -Math.cos(camYaw), rightZ = Math.sin(camYaw);
    camera.position.x = THREE.MathUtils.clamp(camera.position.x + (forwardX * f + rightX * r) * dist, -HALF_W - WALK_BOUNDARY_MARGIN, HALF_W + WALK_BOUNDARY_MARGIN);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z + (forwardZ * f + rightZ * r) * dist, -WALK_BOUNDARY_MARGIN, RINK_L + WALK_BOUNDARY_MARGIN);
  }
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'Shift') shiftHeld = true;
  if (MOVE_KEYS.includes(event.key)) {
    keysPressed.add(event.key);
    event.preventDefault();
  } else if (event.key === 'Escape') {
    deselectAll();
  } else if (event.key === 'Tab' && document.activeElement.tagName !== 'INPUT') {
    event.preventDefault();
    cycleSelection(event.shiftKey ? -1 : 1);
  }
});

window.addEventListener('keyup', (event) => {
  if (event.key === 'Shift') shiftHeld = false;
  keysPressed.delete(event.key);
});

// pointerdown/pointerup with a movement threshold, instead of the native
// 'click' event, so we can tell a genuine click (select/place) apart from a
// look-drag (hold + drag to turn the camera) - both start as a plain
// mousedown on the canvas, and only the total movement distinguishes them.
let downX = 0, downY = 0;
let isLooking = false, lastLookX = 0, lastLookY = 0;
const CLICK_MOVE_THRESHOLD = 5; // pixels
const LOOK_SENSITIVITY = 0.0035; // radians per pixel of drag

renderer.domElement.addEventListener('pointerdown', (event) => {
  downX = event.clientX;
  downY = event.clientY;
  isLooking = true;
  lastLookX = event.clientX;
  lastLookY = event.clientY;
});

window.addEventListener('pointerup', (event) => {
  isLooking = false;
  const dx = event.clientX - downX;
  const dy = event.clientY - downY;
  if (Math.hypot(dx, dy) > CLICK_MOVE_THRESHOLD) return; // was a look-drag, not a click

  mouseNDC.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouseNDC.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouseNDC, camera);

  const selectables = [...goalInstances];
  if (ballGroup) selectables.push(ballGroup);
  if (goalieGroup) selectables.push(goalieGroup);

  const hits = raycaster.intersectObjects(selectables, true);
  if (hits.length > 0) {
    let obj = hits[0].object;
    while (obj.parent && !selectables.includes(obj)) obj = obj.parent;
    if (goalInstances.includes(obj)) {
      // clicking a goal always (re)designates it as the trajectory target,
      // independent of the selection ring toggle below - so you can pick a
      // goal once, then freely select/move the ball without losing it
      targetGoal = obj;
      targetGoalLabelEl.textContent = labelFor(obj);
    }
    if (selected === obj) {
      deselectAll();
    } else {
      selectObject(obj);
    }
    return;
  }

  const p = pointerToWorld(event);
  if (!p) return;
  coordClickEl.textContent = `x=${p.x.toFixed(0)}, z=${p.z.toFixed(0)} (tile ${tileLabelFor(p.x, p.z)})`;

  if (selected === ballGroup) {
    ballGroup.position.x = p.x;
    ballGroup.position.z = p.z;
    selectObject(ballGroup); // refresh the ring position under the moved ball
  } else if (selected === goalieGroup) {
    goalieGroup.position.x = p.x;
    goalieGroup.position.z = p.z;
    selectObject(goalieGroup); // refresh the ring position under the moved goalie
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  handleKeyboardMovement(dt);
  const ballCenter = getBallWorldCenter(); // computed once, shared by both calls below
  updateTrajectory(ballCenter);
  updateCoverage(ballCenter);
  updateGoalieLabel();
  renderer.render(scene, camera);
}
animate();
