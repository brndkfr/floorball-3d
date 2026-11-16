// Goalie zone model on the floor (A-BACK-048). Pure, three-free and
// DOM-free so it is Node-testable; goalie-zones-layer.js draws it.
//
// The zones of the J+S / swiss unihockey module "Goalies - Positionierung"
// (defensive transition and defence). ESTIMATES: the borders are read off
// the module's diagram by eye, not given as numbers there. Depth is
// measured from the end board behind the defending goal (goal line at
// GOAL_LINE_FROM_BOARD = 3.5 m), x across the rink (0 = centre).
// The fifth zone of the module, the defensive transition (counter), is a
// game phase, not a place, so it has a card (i18n.js) but no polygon.

import { RINK_L, HALF_W } from './constants.js';
import { nearestGoal } from './authoring/ball-pose.js';

export const GOALIE_ZONE_ORDER = ['awareness', 'attention', 'danger', 'passing', 'slot'];   // back to front

export const GOALIE_ZONE_BOUNDS = Object.freeze({
  passingDepth: 4000,      // behind and beside the goal: up to 0.5 m in front of the goal line
  dangerDepth: 16000,
  attentionDepth: 26600,   // reaches 6.6 m past the centre line; awareness is the rest
  slot: Object.freeze({ near: 3800, far: 10900, halfNear: 2400, halfFar: 3750 }),
});

const B = GOALIE_ZONE_BOUNDS;

// Whether Plan shows the zones is a per-browser view choice (off by
// default); Train always starts with them on (goalie-zones-state.js).
export const GOALIE_ZONES_STORAGE_KEY = 'floorball3d.goalieZones';
export const parseGoalieZonesShown = (stored) => stored === '1';

// Zone labels (standing tags, A-BACK-048 follow-up): on by default.
export const GOALIE_ZONE_LABELS_STORAGE_KEY = 'floorball3d.goalieZoneLabels';
export const parseGoalieZoneLabelsShown = (stored) => stored !== '0';

export const depthFromEnd = (z, goal) => (goal === 'B' ? RINK_L - z : z);

export function slotHalfWidthAt(d) {
  const { near, far, halfNear, halfFar } = B.slot;
  return halfNear + ((d - near) / (far - near)) * (halfFar - halfNear);
}

// Which zone the ball {x, z} is in, seen from `goal` ('A' | 'B'). A point on
// a border belongs to the zone further from the goal.
export function goalieZoneOf({ x, z }, goal) {
  const d = depthFromEnd(z, goal);
  if (d >= B.slot.near && d < B.slot.far && Math.abs(x) < slotHalfWidthAt(d)) return 'slot';
  if (d < B.passingDepth) return 'passing';
  if (d < B.dangerDepth) return 'danger';
  if (d < B.attentionDepth) return 'attention';
  return 'awareness';
}

// The goal the zones are drawn in front of: the one nearer the ball.
export const defendingGoal = ({ z }) => nearestGoal(z);

// Floor polygons for `goal`, in GOALIE_ZONE_ORDER, as [x, z] world points:
// { key, outer, holes? }. The slot is drawn over danger (which has a hole
// for it) and over the strip of passing-first it overlaps.
export function zonePolygons(goal) {
  const toZ = (d) => (goal === 'B' ? RINK_L - d : d);
  const band = (d0, d1) => [[-HALF_W, toZ(d0)], [HALF_W, toZ(d0)], [HALF_W, toZ(d1)], [-HALF_W, toZ(d1)]];
  const trapezoid = (d0, d1) => {
    const h0 = slotHalfWidthAt(d0), h1 = slotHalfWidthAt(d1);
    return [[-h0, toZ(d0)], [h0, toZ(d0)], [h1, toZ(d1)], [-h1, toZ(d1)]];
  };
  return [
    { key: 'awareness', outer: band(B.attentionDepth, RINK_L) },
    { key: 'attention', outer: band(B.dangerDepth, B.attentionDepth) },
    { key: 'danger', outer: band(B.passingDepth, B.dangerDepth), holes: [trapezoid(B.passingDepth, B.slot.far)] },
    { key: 'passing', outer: band(0, B.passingDepth) },
    { key: 'slot', outer: trapezoid(B.slot.near, B.slot.far) },
  ];
}

// Where each zone's tag stands, in front of `goal` (world x, z in mm): two
// beside the goal for passing-first and two out wide for danger, so one
// stays in view whichever way the camera turns. Spots picked by eye.
const TAG_SPOTS = [
  ['passing', -6000, 2000], ['passing', 6000, 2000],
  ['slot', 0, 7000],
  ['danger', -6500, 10000], ['danger', 6500, 10000],
  ['attention', 0, 21000],
  ['awareness', 0, 33000],
];
export function zoneLabelAnchors(goal) {
  return TAG_SPOTS.map(([key, x, d]) => ({ key, x, z: goal === 'B' ? RINK_L - d : d }));
}

// Depth range of a zone from the end board, for its tag.
const m = (mm) => `${mm / 1000}`;
export function zoneDepthText(key) {
  switch (key) {
    case 'passing': return `0 – ${m(B.passingDepth)} m`;
    case 'slot': return `${m(B.slot.near)} – ${m(B.slot.far)} m`;
    case 'danger': return `${m(B.passingDepth)} – ${m(B.dangerDepth)} m`;
    case 'attention': return `${m(B.dangerDepth)} – ${m(B.attentionDepth)} m`;
    case 'awareness': return `${m(B.attentionDepth)} m +`;
    default: return '';
  }
}
