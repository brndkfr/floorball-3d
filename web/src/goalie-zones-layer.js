// Goalie zones on the floor (A-BACK-048): one translucent mesh per zone in
// front of the goal nearer the ball, the ball's zone drawn stronger.
// goalie-zones.js holds the geometry; updateGoalieZones() runs every frame
// from main.js, rebuilds only when the defending end changes, and fires
// `goalieZoneChanged` when the ball's zone does (the Train zone card).

import * as THREE from 'three';
import { scene } from './scene.js';
import { state } from './state.js';
import { zonePolygons, goalieZoneOf, defendingGoal, GOALIE_ZONE_ORDER } from './goalie-zones.js';
import { GOALIE_ZONE_TOKENS } from './tokens.js';
import { markRenderDirty } from './render-dirty.js';
import { quietAllows } from './lesson-view.js';
import './goalie-zones-state.js';   // loads state.goalieZonesShown

const Y = 1.5;              // mm: over the tactical zones (1 mm), under the markings (2 mm)
const OPACITY = 0.18;       // estimate, tuned by eye on the blue floor
const OPACITY_BALL = 0.42;  // the ball's zone
const OPACITY_EDGE = 0.85;  // zone outlines, so the borders read

const group = new THREE.Group();
group.name = 'goalieZones';
group.visible = state.goalieZonesShown;
scene.add(group);
state.goalieZonesLayer = group;

const materials = Object.fromEntries(GOALIE_ZONE_ORDER.map((key) => [key, new THREE.MeshBasicMaterial({
  color: GOALIE_ZONE_TOKENS[key].hex, transparent: true, opacity: OPACITY, depthWrite: false,
  side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
})]));

const edgeMaterials = Object.fromEntries(GOALIE_ZONE_ORDER.map((key) => [key, new THREE.LineBasicMaterial({
  color: GOALIE_ZONE_TOKENS[key].hex, transparent: true, opacity: OPACITY_EDGE, depthWrite: false,
})]));

// Shape space is (x, -z) so rotateX(-90 deg) lands it on the floor at world z.
const toShapePts = (pts) => pts.map(([x, z]) => new THREE.Vector2(x, -z));

let builtFor = null;
function build(goal) {
  for (const m of group.children) m.geometry.dispose();
  group.clear();
  zonePolygons(goal).forEach(({ key, outer, holes }, i) => {
    const shape = new THREE.Shape(toShapePts(outer));
    for (const h of holes || []) shape.holes.push(new THREE.Path(toShapePts(h)));
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, materials[key]);
    mesh.name = key;
    mesh.position.y = Y;
    mesh.renderOrder = i + 1;
    mesh.raycast = () => {};   // never a click target
    group.add(mesh);
    // Outline on top of the fills; the slot's last so it stays readable.
    const edge = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(outer.map(([x, z]) => new THREE.Vector3(x, Y + 0.5, z))),
      edgeMaterials[key],
    );
    edge.name = `${key}-edge`;
    edge.renderOrder = 10 + i;
    edge.raycast = () => {};
    group.add(edge);
  });
  builtFor = goal;
}

function highlight(zone) {
  for (const key of GOALIE_ZONE_ORDER) materials[key].opacity = key === zone ? OPACITY_BALL : OPACITY;
}

// Returns true when something on screen changed (S-BACK-011).
export function updateGoalieZones(ballCenter) {
  let changed = false;
  const on = state.goalieZonesShown && quietAllows(state.quiet, 'zones');   // a quiet lesson frame may hide the zones (A-BACK-049)
  if (group.visible !== on) {
    group.visible = on;
    changed = true;
  }
  if (!ballCenter) return changed;
  const goal = defendingGoal(ballCenter, state.doc?.autoGoalie);
  const zone = goalieZoneOf(ballCenter, goal);
  if (builtFor !== goal) { build(goal); changed = true; }
  const cur = state.goalieZone;
  if (!cur || cur.goal !== goal || cur.zone !== zone) {
    state.goalieZone = { goal, zone };
    highlight(zone);
    window.dispatchEvent(new Event('goalieZoneChanged'));
    changed = true;
  }
  return changed;
}

window.addEventListener('goalieZonesChanged', markRenderDirty);
