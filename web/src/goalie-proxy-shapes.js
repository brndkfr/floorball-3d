// Kneeling proxy for the detailed goalie (goalie_02, A-BACK-042 step 2):
// what goal coverage tests its rays against (goalie-proxy-math.js) instead
// of the ~10k-triangle mesh. Goalie-local mm: floor origin, facing +Z, +X
// the goalie's left (the frame of goalie.js's wrapper group).
//
// Estimates, not measurements: fitted on 2026-11-15 by coordinate descent
// so the proxy blocks the same rays as the mesh (plus its 1.02 outline,
// which the raycast also hit) from 56 ball positions in front of goal A,
// then checked on the 12 baseline positions
// (test-e2e/goalie-coverage-baseline.json): worst 2.5 points off there.
// Replaced by a bone-driven proxy when A-BACK-042 swaps the mesh.

const P = (x, y, z) => Object.freeze({ x, y, z });
const box = (name, min, max) => Object.freeze({ type: 'box', name, min, max });
const capsule = (name, a, b, r) => Object.freeze({ type: 'capsule', name, a, b, r });

export const DETAILED_GOALIE_PROXY = Object.freeze([
  box('padL', P(-520, 0, -350), P(-20, 235, -130)),
  box('padR', P(-20, 80, -320), P(580, 245, 30)),
  box('hips', P(-220, 200, -140), P(320, 810, 105)),
  capsule('torso', P(210, 355, -55), P(95, 910, 35), 230),
  capsule('head', P(90, 1150, 180), P(90, 1250, 190), 120),
  capsule('upperArmL', P(-100, 955, 30), P(-280, 680, 120), 85),
  capsule('foreArmL', P(-160, 810, -40), P(-340, 820, 290), 75),
  capsule('upperArmR', P(330, 950, 20), P(415, 660, 80), 85),
  capsule('foreArmR', P(370, 680, 280), P(490, 780, 410), 75),
]);
