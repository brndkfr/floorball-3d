// Shape objects: arrows, zones, text labels rendered flat on the rink.
//
// All shapes live at Y ~= 5 mm (above IFF markings at y=2, above the grid
// overlay at y=2.5) so they never z-fight with the rink surface. The scene
// mounts three layer groups (low / mid / high) added to `state.shapesRoot`
// in order; a shape is placed into the group matching its `layer` field.
//
// A single Shape doc entry (see docs/floorball-3d-authoring-plan.md §3.2)
// becomes one Object3D, tagged with `userData.shape = { id, type }` so
// selection.js can round-trip clicks back to the doc.

import * as THREE from 'three';
import { state } from '../state.js';
import { scene } from '../scene.js';
import { ensureDoc, newId } from './doc.js';
import { saveDoc } from './storage.js';
import { reorderAtSlots } from './reorder.js';
import { translateShapeCoords } from './shape-coords.js';

const ARROW_DEFAULT_WIDTH = 80;   // mm; shaft full width
const ARROW_HEAD_LEN_RATIO = 5;   // head_len  = width * this
const ARROW_HEAD_HALF_RATIO = 2;  // head_half = width * this
const ARROW_DASH_PERIOD_RATIO = 12;   // dash period  = width * this (dashed shaft)
const ARROW_DOT_PERIOD_RATIO = 4;     // dot period   = width * this (dotted shaft)
const ARROW_SAMPLES_PER_SEG = 24;     // Catmull-Rom subdivisions per user segment
const SHAPE_Y = 5;               // just above IFF markings + grid overlay

// --- one-time scene setup ---------------------------------------------

state.shapesRoot = new THREE.Group();
scene.add(state.shapesRoot);

const layerGroups = {
  low: new THREE.Group(),
  mid: new THREE.Group(),
  high: new THREE.Group(),
};
// order matters for renderOrder-agnostic overdraw: low added first
state.shapesRoot.add(layerGroups.low, layerGroups.mid, layerGroups.high);

// --- geometry builders ------------------------------------------------

// Sample a user-clicked path into a dense polyline of {x,z} points.
// N=2 -> straight segment; N>=3 with smooth!=false -> Catmull-Rom curve.
function samplePath(points, { smooth = true } = {}) {
  if (points.length < 2) return points.slice();
  if (points.length === 2 || !smooth) return points.slice();
  const v = points.map((p) => new THREE.Vector3(p.x, 0, p.z));
  const curve = new THREE.CatmullRomCurve3(v, false, 'catmullrom', 0.5);
  const total = (points.length - 1) * ARROW_SAMPLES_PER_SEG;
  const sampled = curve.getPoints(total);
  return sampled.map((p) => ({ x: p.x, z: p.z }));
}

// Cumulative arc-length parameterization of a sampled polyline. Returns
// {total, at(s) -> {x,z, tx,tz, nx,nz}} where s in [0, total] mm.
function arcLengthTable(poly) {
  const cum = [0];
  for (let i = 1; i < poly.length; i++) {
    const dx = poly[i].x - poly[i - 1].x, dz = poly[i].z - poly[i - 1].z;
    cum.push(cum[i - 1] + Math.hypot(dx, dz));
  }
  const total = cum[cum.length - 1];
  const at = (s) => {
    s = Math.max(0, Math.min(total, s));
    let lo = 0, hi = cum.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= s) lo = mid; else hi = mid;
    }
    const seg = cum[hi] - cum[lo] || 1;
    const t = (s - cum[lo]) / seg;
    const a = poly[lo], b = poly[hi];
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    const tx = (b.x - a.x) / seg, tz = (b.z - a.z) / seg;
    return { x, z, tx, tz, nx: -tz, nz: tx };
  };
  return { total, at };
}

// Emit a solid ribbon along the polyline (miter joins, clamped).
function buildRibbonSolid(poly, halfW, positions) {
  const n = poly.length;
  const side = new Array(n * 2);
  for (let i = 0; i < n; i++) {
    let mx, mz, scale = 1;
    if (i === 0 || i === n - 1) {
      const j = i === 0 ? 0 : i - 1;
      const k = j + 1;
      const dx = poly[k].x - poly[j].x, dz = poly[k].z - poly[j].z;
      const l = Math.hypot(dx, dz) || 1;
      mx = -dz / l; mz = dx / l;
    } else {
      const d1x = poly[i].x - poly[i - 1].x, d1z = poly[i].z - poly[i - 1].z;
      const l1 = Math.hypot(d1x, d1z) || 1;
      const n1x = -d1z / l1, n1z = d1x / l1;
      const d2x = poly[i + 1].x - poly[i].x, d2z = poly[i + 1].z - poly[i].z;
      const l2 = Math.hypot(d2x, d2z) || 1;
      const n2x = -d2z / l2, n2z = d2x / l2;
      let bx = n1x + n2x, bz = n1z + n2z;
      const bl = Math.hypot(bx, bz) || 1;
      bx /= bl; bz /= bl;
      const dot = Math.max(0.25, bx * n1x + bz * n1z);   // clamp miter to 4x
      mx = bx; mz = bz; scale = 1 / dot;
    }
    side[i * 2]     = { x: poly[i].x + mx * halfW * scale, z: poly[i].z + mz * halfW * scale };
    side[i * 2 + 1] = { x: poly[i].x - mx * halfW * scale, z: poly[i].z - mz * halfW * scale };
  }
  for (let i = 0; i < n - 1; i++) {
    const a = side[i * 2],     b = side[i * 2 + 1];
    const c = side[(i + 1) * 2], d = side[(i + 1) * 2 + 1];
    positions.push(
      a.x, SHAPE_Y, a.z,  c.x, SHAPE_Y, c.z,  d.x, SHAPE_Y, d.z,
      a.x, SHAPE_Y, a.z,  d.x, SHAPE_Y, d.z,  b.x, SHAPE_Y, b.z,
    );
  }
}

// Emit a dashed / dotted ribbon by walking arc-length and stamping short
// rectangles at intervals. `onLen` / `gapLen` are in mm.
function buildRibbonDashed(poly, halfW, positions, onLen, gapLen) {
  const { total, at } = arcLengthTable(poly);
  const period = onLen + gapLen;
  for (let s = 0; s < total; s += period) {
    const e = Math.min(s + onLen, total);
    if (e - s < 1) continue;
    const a = at(s), b = at(e);
    const p1 = { x: a.x + a.nx * halfW, z: a.z + a.nz * halfW };
    const p2 = { x: a.x - a.nx * halfW, z: a.z - a.nz * halfW };
    const p3 = { x: b.x + b.nx * halfW, z: b.z + b.nz * halfW };
    const p4 = { x: b.x - b.nx * halfW, z: b.z - b.nz * halfW };
    positions.push(
      p1.x, SHAPE_Y, p1.z,  p3.x, SHAPE_Y, p3.z,  p4.x, SHAPE_Y, p4.z,
      p1.x, SHAPE_Y, p1.z,  p4.x, SHAPE_Y, p4.z,  p2.x, SHAPE_Y, p2.z,
    );
  }
}

// Emit the arrowhead at the tip in the given `headStyle` ('filled','open','none').
// The head is oriented along the last-segment tangent; caller is responsible
// for having already shortened the shaft polyline so it doesn't overshoot.
function buildArrowHead(tipX, tipZ, tx, tz, halfW, headLen, headStyle, positions) {
  if (headStyle === 'none') return;
  const nx = -tz, nz = tx;                          // perp
  const headHalfW = halfW * ARROW_HEAD_HALF_RATIO;
  const baseX = tipX - tx * headLen;
  const baseZ = tipZ - tz * headLen;
  const hl = { x: baseX + nx * headHalfW, z: baseZ + nz * headHalfW };
  const hr = { x: baseX - nx * headHalfW, z: baseZ - nz * headHalfW };
  if (headStyle === 'filled') {
    positions.push(
      hl.x, SHAPE_Y, hl.z,  tipX, SHAPE_Y, tipZ,  hr.x, SHAPE_Y, hr.z,
    );
    return;
  }
  // 'open' chevron: two thin ribbon-strokes for the two edges (hl -> tip,
  // hr -> tip). Stroke width = halfW (i.e. shaft half-width).
  const stroke = halfW;
  const stroke2 = (a, b) => {
    const dx = b.x - a.x, dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    const ux = dx / l, uz = dz / l;
    const px = -uz, pz = ux;
    const p1 = { x: a.x + px * stroke, z: a.z + pz * stroke };
    const p2 = { x: a.x - px * stroke, z: a.z - pz * stroke };
    const p3 = { x: b.x + px * stroke, z: b.z + pz * stroke };
    const p4 = { x: b.x - px * stroke, z: b.z - pz * stroke };
    positions.push(
      p1.x, SHAPE_Y, p1.z,  p3.x, SHAPE_Y, p3.z,  p4.x, SHAPE_Y, p4.z,
      p1.x, SHAPE_Y, p1.z,  p4.x, SHAPE_Y, p4.z,  p2.x, SHAPE_Y, p2.z,
    );
  };
  stroke2(hl, { x: tipX, z: tipZ });
  stroke2({ x: tipX, z: tipZ }, hr);
}

function buildArrowGeometry(points, width = ARROW_DEFAULT_WIDTH, opts = {}) {
  const { shaftStyle = 'solid', headStyle = 'filled', smooth = true } = opts;
  if (!points || points.length < 2) return new THREE.BufferGeometry();
  const halfW = Math.max(1, width / 2);
  const headHalfW = halfW * ARROW_HEAD_HALF_RATIO;

  const poly = samplePath(points, { smooth });
  // Total arc length; clamp head so a short arrow doesn't invert itself.
  const arc = arcLengthTable(poly);
  const desiredHeadLen = halfW * 2 * ARROW_HEAD_LEN_RATIO;
  const headLen = headStyle === 'none' ? 0 : Math.min(arc.total * 0.9, desiredHeadLen);

  // Truncate the polyline at (total - headLen) so the shaft ends where the
  // head begins. Walk from the end backwards.
  let shaftPoly = poly;
  let tipX = poly[poly.length - 1].x, tipZ = poly[poly.length - 1].z;
  let tanX = 0, tanZ = 1;
  if (headLen > 0 && arc.total > 0) {
    const cutS = arc.total - headLen;
    const cut = arc.at(cutS);
    tipX = poly[poly.length - 1].x; tipZ = poly[poly.length - 1].z;
    // Tangent for the head from the end of the sampled path.
    const last = poly.length - 1;
    const prev = Math.max(0, last - 1);
    const dx = poly[last].x - poly[prev].x, dz = poly[last].z - poly[prev].z;
    const l = Math.hypot(dx, dz) || 1;
    tanX = dx / l; tanZ = dz / l;
    // Rebuild shaft polyline: prefix of samples up to cutS, plus the cut point.
    const trimmed = [];
    let acc = 0;
    for (let i = 0; i < poly.length - 1; i++) {
      trimmed.push(poly[i]);
      const dx2 = poly[i + 1].x - poly[i].x, dz2 = poly[i + 1].z - poly[i].z;
      const seg = Math.hypot(dx2, dz2);
      if (acc + seg >= cutS) {
        trimmed.push({ x: cut.x, z: cut.z });
        break;
      }
      acc += seg;
    }
    shaftPoly = trimmed.length >= 2 ? trimmed : [poly[0], { x: cut.x, z: cut.z }];
  }

  const positions = [];
  if (shaftStyle === 'solid') {
    buildRibbonSolid(shaftPoly, halfW, positions);
  } else if (shaftStyle === 'dashed') {
    const period = Math.max(60, width * ARROW_DASH_PERIOD_RATIO);
    buildRibbonDashed(shaftPoly, halfW, positions, period * 0.6, period * 0.4);
  } else if (shaftStyle === 'dotted') {
    const period = Math.max(30, width * ARROW_DOT_PERIOD_RATIO);
    buildRibbonDashed(shaftPoly, halfW, positions, period * 0.35, period * 0.65);
  }
  buildArrowHead(tipX, tipZ, tanX, tanZ, halfW, headLen, headStyle, positions);
  void headHalfW;   // reserved for future 'open' variants

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  g.computeVertexNormals();
  return g;
}

function buildZoneGeometry(points) {
  if (points.length < 3) return null;
  const shape = new THREE.Shape();
  shape.moveTo(points[0].x, points[0].z);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i].x, points[i].z);
  shape.lineTo(points[0].x, points[0].z);
  const g = new THREE.ShapeGeometry(shape);
  // Shape's local Y (2D) becomes world Z: rotate +90 deg around X, not -90,
  // so that shape-space (px, pz) maps to world (x, 0, +pz).
  g.rotateX(Math.PI / 2);
  g.translate(0, SHAPE_Y - 1, 0);   // slightly under arrows so they draw on top
  return g;
}

// Rebuild `points` for a primitive-kind zone from its parametric fields.
// Kept as an exported helper so shape-handles.js can call it after a drag
// mutation before writing back to the doc. Circles get 48 vertices - fine
// for both rendering and the coverage/trajectory math (they don't consume
// zone points).
const CIRCLE_SEGMENTS = 48;
export function rebuildZonePoints(shape) {
  if (!shape) return;
  const kind = shape.kind || 'polygon';
  if (kind === 'rect') {
    const { x = 0, z = 0, w = 0, h = 0 } = shape;
    shape.points = [
      { x, z },
      { x: x + w, z },
      { x: x + w, z: z + h },
      { x, z: z + h },
    ];
  } else if (kind === 'circle') {
    const { cx = 0, cz = 0, r = 0 } = shape;
    const pts = [];
    for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
      const t = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
      pts.push({ x: cx + Math.cos(t) * r, z: cz + Math.sin(t) * r });
    }
    shape.points = pts;
  } else if (kind === 'triangle') {
    // Isoceles pointing "up" (toward -z) inscribed in { x,z,w,h }. Apex
    // handles are stored explicitly so a rotated triangle only needs to
    // update `points` and can drop back to arbitrary-triangle semantics.
    const { x = 0, z = 0, w = 0, h = 0 } = shape;
    shape.points = [
      { x: x + w / 2, z },        // apex top
      { x: x + w, z: z + h },     // base right
      { x, z: z + h },            // base left
    ];
  }
  // polygon: caller manages points directly.
}

export const TEXT_DEFAULT_SIZE = 1500;
export const TEXT_MIN_SIZE = 200;
export const TEXT_MAX_SIZE = 8000;

function makeTextSprite(text, color, sizeMm = TEXT_DEFAULT_SIZE) {
  const font = 'bold 96px system-ui, sans-serif';
  const padding = 24;
  // measure first so long strings don't get clipped by a fixed-size canvas
  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d');
  mctx.font = font;
  const textWidth = Math.ceil(mctx.measureText(text || ' ').width);
  const height = 128;
  const width = Math.max(height, textWidth + padding * 2);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.lineWidth = 8;
  ctx.strokeText(text, width / 2, height / 2);
  ctx.fillText(text, width / 2, height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 2;
  const worldHeight = sizeMm > 0 ? sizeMm : TEXT_DEFAULT_SIZE;
  sprite.scale.set(worldHeight * (width / height), worldHeight, 1);
  // Tight world-space bbox of just the drawn text (no canvas padding),
  // used by shape-handles.js so the selection rectangle hugs the letters.
  const textWorldW = worldHeight * (textWidth / height);
  const textWorldH = worldHeight * (96 / height); // font-size / canvas height
  sprite.userData.textWorldBbox = { w: textWorldW, h: textWorldH };
  return sprite;
}

// Word-wrap `text` into up to `maxLines` lines, each fitting within `maxPx`
// (measured with the given canvas context). Overflowing words are kept
// whole (no mid-word breaks); a stray very-long word may still exceed maxPx.
function wrapLines(ctx, text, maxPx, maxLines) {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let cur = '';
  for (const w of words) {
    const trial = cur ? cur + ' ' + w : w;
    if (ctx.measureText(trial).width <= maxPx || !cur) {
      cur = trial;
    } else {
      lines.push(cur);
      cur = w;
      if (lines.length >= maxLines - 1) break;
    }
  }
  if (cur) lines.push(cur);
  // Any remaining words after the loop hit the last line (may overflow).
  const consumed = lines.reduce((a, l) => a + l.split(/\s+/).length, 0);
  if (consumed < words.length) {
    lines[lines.length - 1] = lines[lines.length - 1] + ' ' + words.slice(consumed).join(' ');
  }
  return lines;
}

// Build a floor-plane label mesh for a zone: text canvas texture on a
// PlaneGeometry laid flat above the zone fill. Centre / size derived
// from the zone's own geometry so a resize automatically reflows the label.
//
// Typography per shape (all optional):
//   shape.labelBold      - true => bold (default), false => regular
//   shape.labelRotation  - 0 | 90 | -90 (deg); overrides auto-rotate
//   shape.labelSize      - mm; overrides autofit
//   otherwise: auto-rotate 90 deg for tall zones (bboxH > bboxW*1.5),
//   word-wrap onto up to 3 lines, and fit-both autosize into 90% of bbox.
function makeZoneLabelPlane(shape, color) {
  const text = shape.label?.trim();
  if (!text) return null;

  const pts = shape.points || [];
  if (!pts.length) return null;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
  }
  const bboxW = maxX - minX, bboxH = maxZ - minZ;
  let cx, cz;
  if (shape.kind === 'circle') { cx = shape.cx; cz = shape.cz; }
  else if (shape.kind === 'triangle') {
    cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    cz = pts.reduce((a, p) => a + p.z, 0) / pts.length;
  } else {
    cx = (minX + maxX) / 2; cz = (minZ + maxZ) / 2;
  }

  // Auto-rotate: for tall (narrow) zones, run the label vertically so it
  // fills the long axis. User rotation override wins over auto.
  const userRot = shape.labelRotation;
  const rotDeg = userRot === 0 || userRot === 90 || userRot === -90
    ? userRot
    : (bboxH > bboxW * 1.5 ? 90 : 0);
  // For the wrap+fit maths, swap the bbox axes when rotating 90 deg so
  // "along the text baseline" points along the zone's long axis.
  const alongPx = (rotDeg === 90 || rotDeg === -90) ? bboxH : bboxW;
  const acrossPx = (rotDeg === 90 || rotDeg === -90) ? bboxW : bboxH;

  const weight = shape.labelBold === false ? '' : 'bold ';
  const font = `${weight}120px system-ui, sans-serif`;
  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d');
  mctx.font = font;

  // Multi-line wrap: try 1, then 2, then 3 lines and pick the layout with
  // the largest resulting plane. Wrap at 92% of the along-axis to leave
  // padding.
  const wrapBudgetPx = 4000;    // canvas-space cap; scaled to world at the end
  let best = null;
  for (const maxLines of [1, 2, 3]) {
    const lines = wrapLines(mctx, text, wrapBudgetPx, maxLines);
    const widest = Math.max(...lines.map((l) => mctx.measureText(l).width));
    const canvasH = 160 * lines.length + 40;   // ~120px line + margin
    const canvasW = Math.max(canvasH, widest + 60);
    // Fit plane to bbox: 90% of along/across; preserve aspect.
    const maxAlong = Math.max(200, alongPx * 0.9);
    const maxAcross = Math.max(200, acrossPx * 0.9);
    const aspect = canvasW / canvasH;
    let planeAlong = maxAlong;
    let planeAcross = planeAlong / aspect;
    if (planeAcross > maxAcross) {
      planeAcross = maxAcross;
      planeAlong = planeAcross * aspect;
    }
    if (!best || planeAlong * planeAcross > best.area) {
      best = { lines, canvasW, canvasH, planeAlong, planeAcross, area: planeAlong * planeAcross };
    }
  }

  // User size override: fix planeAlong; recompute planeAcross from aspect.
  if (typeof shape.labelSize === 'number' && shape.labelSize > 100) {
    const aspect = best.canvasW / best.canvasH;
    best.planeAlong = shape.labelSize;
    best.planeAcross = best.planeAlong / aspect;
  }

  const canvas = document.createElement('canvas');
  canvas.width = best.canvasW;
  canvas.height = best.canvasH;
  const ctx = canvas.getContext('2d');
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#' + color.getHexString();
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.lineWidth = 10;
  const lineH = best.canvasH / best.lines.length;
  for (let i = 0; i < best.lines.length; i++) {
    const y = lineH * i + lineH / 2;
    ctx.strokeText(best.lines[i], best.canvasW / 2, y);
    ctx.fillText(best.lines[i], best.canvasW / 2, y);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  texture.needsUpdate = true;

  const geom = new THREE.PlaneGeometry(best.planeAlong, best.planeAcross);
  const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = -Math.PI / 2;
  if (rotDeg) mesh.rotation.z = -(rotDeg * Math.PI / 180);
  mesh.position.set(cx, SHAPE_Y + 2, cz);
  mesh.renderOrder = 2;
  mesh.userData.isZoneLabel = true;
  return mesh;
}

// Build a floor-plane label mesh for an arrow: centred on the shaft midpoint
// and rotated along the arrow direction so the text reads along the flow.
// When the arrow points "backwards" in world space, flip 180 deg so the
// text isn't upside-down from the default top-down viewpoint.
function makeArrowLabelPlane(shape, color) {
  const text = shape.label?.trim();
  if (!text) return null;
  const smooth = shape.smooth !== false;
  const poly = samplePath(shape.points, { smooth });
  if (poly.length < 2) return null;
  const arc = arcLengthTable(poly);
  if (arc.total < 1) return null;
  const mid = arc.at(arc.total / 2);
  const midX = mid.x, midZ = mid.z;
  const tx = mid.tx, tz = mid.tz;

  const font = 'bold 120px system-ui, sans-serif';
  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d');
  mctx.font = font;
  const textWidth = Math.ceil(mctx.measureText(text).width);
  const canvasH = 160;
  const canvasW = Math.max(canvasH, textWidth + 40);
  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#' + color.getHexString();
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.lineWidth = 10;
  ctx.strokeText(text, canvasW / 2, canvasH / 2);
  ctx.fillText(text, canvasW / 2, canvasH / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  texture.needsUpdate = true;

  const arrowWidth = shape.width ?? ARROW_DEFAULT_WIDTH;
  const planeH = Math.max(300, arrowWidth * 3);
  const planeW = planeH * (canvasW / canvasH);
  const geom = new THREE.PlaneGeometry(planeW, planeH);
  const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = -Math.PI / 2;

  const yaw = Math.atan2(tz, tx);
  const flip = tx < 0 ? Math.PI : 0;
  mesh.rotation.z = -(yaw + flip);
  mesh.position.set(midX, SHAPE_Y + 2, midZ);
  mesh.renderOrder = 2;
  mesh.userData.isArrowLabel = true;
  return mesh;
}

// --- shape -> Object3D ------------------------------------------------

// Build the visual Object3D for a shape doc entry. Also used by draw-tool.js
// to build the ghost preview (with reduced opacity).
export function buildShapeObject(shape, { ghost = false } = {}) {
  const color = new THREE.Color(shape.color || '#ffb347');
  const opacity = ghost ? 0.35 : (shape.type === 'zone' ? (shape.opacity ?? 0.35) : 0.95);
  if (shape.type === 'arrow' && shape.points.length >= 2) {
    const g = buildArrowGeometry(shape.points, shape.width, {
      shaftStyle: shape.shaftStyle || 'solid',
      headStyle: shape.headStyle || 'filled',
      smooth: shape.smooth !== false,
    });
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, m);
    mesh.renderOrder = 1;
    if (!ghost && shape.label?.trim()) {
      const label = makeArrowLabelPlane(shape, color);
      if (label) {
        const group = new THREE.Group();
        group.add(mesh);
        group.add(label);
        return group;
      }
    }
    return mesh;
  }
  if (shape.type === 'zone' && shape.points.length >= 3) {
    const g = buildZoneGeometry(shape.points);
    if (!g) return null;
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
    const fill = new THREE.Mesh(g, m);
    if (!ghost && shape.label?.trim()) {
      const label = makeZoneLabelPlane(shape, color);
      if (label) {
        // Use a group so selection.js's shape lookup still finds the id via
        // userData on the outer object; the label is a passive child.
        const group = new THREE.Group();
        group.add(fill);
        group.add(label);
        return group;
      }
    }
    return fill;
  }
  if (shape.type === 'text') {
    const sprite = makeTextSprite(shape.text || '', '#' + color.getHexString(), shape.size);
    sprite.position.set(shape.x, SHAPE_Y + 200, shape.z);
    sprite.material.opacity = opacity;
    return sprite;
  }
  return null;
}

// --- CRUD -------------------------------------------------------------

function layerFor(shape) {
  if (shape.layer) return shape.layer;
  if (shape.type === 'zone') return 'low';
  if (shape.type === 'text') return 'high';
  return 'mid';
}

function attachShape(shape) {
  const obj = buildShapeObject(shape);
  if (!obj) return null;
  obj.userData.shape = { id: shape.id, type: shape.type };
  obj.visible = !shape.hidden;
  layerGroups[layerFor(shape)].add(obj);
  state.shapeObjects.push(obj);
  return obj;
}

export function addShape(shape) {
  const doc = ensureDoc();
  if (!doc.scheme.shapes) doc.scheme.shapes = [];
  if (!shape.id) shape.id = newId('s');
  // Primitive zones (rect/circle/triangle) may arrive with just parametric
  // fields; make sure `points` is populated so buildShapeObject can render.
  if (shape.type === 'zone' && shape.kind && shape.kind !== 'polygon' && !shape.points) {
    rebuildZonePoints(shape);
  }
  doc.scheme.shapes.push(shape);
  attachShape(shape);
  saveDoc();
  document.dispatchEvent(new CustomEvent('layers:dirty'));
  import('./history.js').then((h) => h.pushHistory());
  return shape.id;
}

// pushHistory=false lets a bulk caller (multi-select delete) push a single
// combined history entry instead of one per shape.
export function removeShape(id, pushHistory = true) {
  const doc = ensureDoc();
  const idx = doc.scheme.shapes?.findIndex((s) => s.id === id) ?? -1;
  if (idx < 0) return;
  doc.scheme.shapes.splice(idx, 1);
  const oi = state.shapeObjects.findIndex((o) => o.userData.shape && o.userData.shape.id === id);
  if (oi >= 0) {
    const obj = state.shapeObjects[oi];
    obj.parent?.remove(obj);
    disposeObject(obj);
    state.shapeObjects.splice(oi, 1);
  }
  saveDoc();
  document.dispatchEvent(new CustomEvent('layers:dirty'));
  if (pushHistory) import('./history.js').then((h) => h.pushHistory());
}

export function setShapeHidden(id, hidden) {
  const doc = ensureDoc();
  const shape = doc.scheme.shapes?.find((s) => s.id === id);
  if (!shape) return;
  const next = !!hidden;
  if (!!shape.hidden === next) return;
  if (next) shape.hidden = true; else delete shape.hidden;
  const obj = state.shapeObjects.find((o) => o.userData.shape && o.userData.shape.id === id);
  if (obj) obj.visible = !next;
  // When hiding the currently-selected shape, drop the selection: the
  // yellow highlight + edit handles live outside the shape's Object3D
  // graph and would otherwise stay visible over an "invisible" shape.
  if (next && state.selected === obj) {
    import('../selection.js').then((s) => s.deselectAll());
  }
  saveDoc();
  document.dispatchEvent(new CustomEvent('layers:dirty'));
  import('./history.js').then((h) => h.pushHistory());
}

// Fast-path label edit for zones and arrows: mutates the doc + swaps just
// the label child so the inspector's text input keeps focus while the user
// types. Falls back to a full updateShape rebuild if the shape's current
// object isn't a Group yet (i.e. label was empty before).
export function updateShapeLabel(id, label) {
  const doc = ensureDoc();
  const shape = doc.scheme.shapes?.find((s) => s.id === id);
  if (!shape || (shape.type !== 'zone' && shape.type !== 'arrow')) return;
  const trimmed = (label ?? '').trim();
  const next = trimmed ? trimmed.slice(0, 40) : undefined;
  if ((shape.label || undefined) === next) return;
  if (next === undefined) delete shape.label; else shape.label = next;

  const obj = state.shapeObjects.find((o) => o.userData.shape && o.userData.shape.id === id);
  const isGroup = obj?.type === 'Group';
  if (!isGroup) {
    updateShape(id, {});
    return;
  }
  const labelFlag = shape.type === 'zone' ? 'isZoneLabel' : 'isArrowLabel';
  const oldLabel = obj.children.find((c) => c.userData[labelFlag]);
  if (oldLabel) {
    obj.remove(oldLabel);
    oldLabel.geometry?.dispose?.();
    oldLabel.material?.map?.dispose?.();
    oldLabel.material?.dispose?.();
  }
  if (next) {
    const color = new THREE.Color(shape.color || '#ffb347');
    const label3d = shape.type === 'zone'
      ? makeZoneLabelPlane(shape, color)
      : makeArrowLabelPlane(shape, color);
    if (label3d) obj.add(label3d);
  }
  saveDoc();
  document.dispatchEvent(new CustomEvent('layers:dirty'));
  scheduleLabelHistoryPush();
}

let labelHistoryTimer = null;
function scheduleLabelHistoryPush() {
  if (labelHistoryTimer) clearTimeout(labelHistoryTimer);
  labelHistoryTimer = setTimeout(() => {
    labelHistoryTimer = null;
    import('./history.js').then((h) => h.pushHistory());
  }, 400);
}

// Replace the object for `id` in-place: mutate the doc shape, remove the
// old Object3D from its layer group, rebuild, and re-attach. Preserves the
// selection ring by re-selecting if the shape was selected before.
export function updateShape(id, patch) {
  const doc = ensureDoc();
  const shape = doc.scheme.shapes?.find((s) => s.id === id);
  if (!shape) return;
  Object.assign(shape, patch);
  const oi = state.shapeObjects.findIndex((o) => o.userData.shape && o.userData.shape.id === id);
  const wasSelected = oi >= 0 && state.selected === state.shapeObjects[oi];
  if (oi >= 0) {
    const old = state.shapeObjects[oi];
    old.parent?.remove(old);
    disposeObject(old);
    state.shapeObjects.splice(oi, 1);
  }
  const obj = attachShape(shape);
  saveDoc();
  document.dispatchEvent(new CustomEvent('layers:dirty'));
  import('./history.js').then((h) => h.pushHistory());
  if (wasSelected && obj) {
    import('../selection.js').then((s) => s.selectObject(obj));
  }
  return obj;
}

function disposeObject(obj) {
  obj.traverse?.((child) => {
    if (child.isMesh) {
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    }
    if (child.isSprite) {
      child.material?.map?.dispose?.();
      child.material?.dispose?.();
    }
  });
  if (obj.isSprite) {
    obj.material?.map?.dispose?.();
    obj.material?.dispose?.();
  }
}

// Batch-translate several shapes by (dx, dz) and rebuild their objects in one
// pass: a single saveDoc + layers:dirty, and NO history push - the caller
// owns history so a mixed chip + shape drag collapses to one undo step.
// Returns Map<shapeId, newObject3D> so a multi-selection can re-bind to the
// freshly built objects (attachShape creates new Object3D instances).
export function translateShapes(ids, dx, dz) {
  const doc = ensureDoc();
  const remap = new Map();
  if (!dx && !dz) return remap;
  for (const id of ids) {
    const shape = doc.scheme.shapes?.find((s) => s.id === id);
    if (!shape) continue;
    translateShapeCoords(shape, dx, dz);
    const oi = state.shapeObjects.findIndex((o) => o.userData.shape && o.userData.shape.id === id);
    if (oi >= 0) {
      const old = state.shapeObjects[oi];
      old.parent?.remove(old);
      disposeObject(old);
      state.shapeObjects.splice(oi, 1);
    }
    const obj = attachShape(shape);
    if (obj) remap.set(id, obj);
  }
  saveDoc();
  document.dispatchEvent(new CustomEvent('layers:dirty'));
  return remap;
}

// Called from authoring/index.js (initial load) and history.js (undo/redo).
export function rebuildShapesFromDoc() {
  for (const obj of state.shapeObjects) {
    obj.parent?.remove(obj);
    disposeObject(obj);
  }
  state.shapeObjects.length = 0;
  const doc = ensureDoc();
  const shapes = doc.scheme.shapes || [];
  for (const s of shapes) attachShape(s);
  document.dispatchEvent(new CustomEvent('layers:dirty'));
}

// Reorder shapes in-place: the given ids occupy the same absolute slots
// in doc.scheme.shapes, but relatively in the new order. Other shapes
// keep their slot. Then re-attach so the three.js layer group insertion
// order matches, which drives overdraw / renderOrder.
export function reorderShapes(orderedIds) {
  const doc = ensureDoc();
  const shapes = doc.scheme.shapes || [];
  const reordered = reorderAtSlots(shapes, orderedIds, (s) => s.id);
  if (!reordered) return;
  doc.scheme.shapes = reordered;
  rebuildShapesFromDoc();
  saveDoc();
  import('./history.js').then((h) => h.pushHistory());
}

// --- helpers used by draw-tool.js and dock.js -------------------------

export function shapeDataFor(obj) {
  const meta = obj?.userData?.shape;
  if (!meta) return null;
  const doc = ensureDoc();
  return doc.scheme.shapes?.find((s) => s.id === meta.id) || null;
}
