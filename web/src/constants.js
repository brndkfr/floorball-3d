import * as THREE from 'three';

// cache-bust every asset fetch so edited .obj/.mtl files are never served stale
export const CACHE_BUST = `?t=${Date.now()}`;

// rink is 40000 x 20000 mm, running along +Z, centred on X=0
export const RINK_L = 40000, RINK_W = 20000, HALF_W = RINK_W / 2;
export const GRID_TILE_SIZE = 2000; // must match generate_grid_tiles.py
export const GRID_N_COLS = RINK_W / GRID_TILE_SIZE, GRID_N_ROWS = RINK_L / GRID_TILE_SIZE;

// Goal-line placement (derived from the rink spec, see generate_rink.py):
// goal back sits 2850 mm from the board, goal mouth (goal line) at 3500 mm.
export const GOAL_LINE_FROM_BOARD = 3500;

// Ball's local origin is its floor-contact point (see generate_ball.py).
export const BALL_RADIUS = 36; // matches generate_ball.py's BALL_RADIUS

// Goal mouth corners/centre in the goal's own local space (matches
// generate_goal.py: width 1600mm -> +/-800, height 0-1150). localToWorld()
// applies each goal instance's actual position/rotation, so this works for
// either goal without needing to special-case the 180deg-flipped one.
export const GOAL_MOUTH_CORNERS_LOCAL = [
  new THREE.Vector3(-800, 0, 0),
  new THREE.Vector3(800, 0, 0),
  new THREE.Vector3(-800, 1150, 0),
  new THREE.Vector3(800, 1150, 0),
];
export const GOAL_CENTER_LOCAL = new THREE.Vector3(0, 575, 0); // mouth centre: x=0 (mid-width), y=575 (mid-height)
