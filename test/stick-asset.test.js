import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Checks the generated stick (generators/generate_stick.py) against the IFF
// Material Regulations SPCR 011 section 2.1.3 / appendix B1-B2 limits.

const ASSETS = fileURLToPath(new URL('../web/assets/', import.meta.url));

function parseObj(text) {
  const verts = [];
  const byMat = new Map();
  const trisByMat = new Map();
  let mat = null;
  let mtllib = null;
  for (const line of text.split('\n')) {
    const p = line.trim().split(/\s+/);
    if (p[0] === 'v') verts.push(p.slice(1, 4).map(Number));
    else if (p[0] === 'mtllib') mtllib = p[1];
    else if (p[0] === 'usemtl') {
      mat = p[1];
      if (!byMat.has(mat)) { byMat.set(mat, new Set()); trisByMat.set(mat, []); }
    } else if (p[0] === 'f') {
      const idx = p.slice(1).map((i) => Number(i.split('/')[0]) - 1);
      for (const i of idx) byMat.get(mat).add(i);
      trisByMat.get(mat).push(idx);
    }
  }
  const pts = (m) => [...(byMat.get(m) ?? [])].map((i) => verts[i]);
  const tris = (m) => (trisByMat.get(m) ?? []).map((t) => t.map((i) => verts[i]));
  return { verts, mtllib, mats: [...byMat.keys()], pts, tris };
}

const obj = parseObj(readFileSync(ASSETS + 'floorball_stick.obj', 'utf8'));
const mtl = readFileSync(ASSETS + 'floorball_stick.mtl', 'utf8');
const blade = obj.pts('Blade');
const shaft = obj.pts('Shaft');
const extent = (pts, k) => Math.max(...pts.map((v) => v[k])) - Math.min(...pts.map((v) => v[k]));

test('obj references its mtl and every material is defined', () => {
  assert.equal(obj.mtllib, 'floorball_stick.mtl');
  for (const m of obj.mats) assert.match(mtl, new RegExp(`^newmtl ${m}$`, 'm'), m);
  for (const m of ['Blade', 'Shaft', 'Grip', 'GripLine', 'Knob']) assert.ok(obj.mats.includes(m), m);
});

test('local origin is the floor-contact point of the blade', () => {
  const minY = Math.min(...obj.verts.map((v) => v[1]));
  assert.ok(Math.abs(minY) < 0.5, `lowest point y=${minY}`);
  const low = blade.filter((v) => v[1] < 0.5);
  assert.ok(low.length > 0);
  // a 270 mm arc stays within 0.5 mm of the floor for +/-16 mm around its bottom
  for (const v of low) assert.ok(Math.abs(v[0]) < 20, `contact x=${v[0]}`);
});

test('whole stick stays within the 1140 mm max stick length', () => {
  const far = Math.max(...obj.verts.map((v) => Math.hypot(...v)));
  assert.ok(far <= 1140, `farthest point ${far}`);
});

test('blade length <= 270 mm (horizontal span, appendix B2 "h")', () => {
  // The neck/socket rising into the shaft is excluded: only blade vertices
  // below the shaft socket count, like the B2 drawing's floor-parallel span.
  const lowBlade = blade.filter((v) => v[1] < 80);
  const span = extent(lowBlade, 0);
  assert.ok(span <= 270, `span ${span}`);
  assert.ok(span >= 230, `span ${span} - implausibly short blade`);
});

test('blade height 72-80 mm at the contact point', () => {
  const slice = blade.filter((v) => Math.abs(v[0]) < 3);
  const h = extent(slice, 1);
  assert.ok(h >= 72 && h <= 80, `height ${h}`);
});

test('blade thickness >= 8 mm', () => {
  const slice = blade.filter((v) => Math.abs(v[0]) < 3);
  const t = extent(slice, 2);
  assert.ok(t >= 8, `thickness ${t}`);
});

test('shaft: 60 deg lie, diameter <= 35 mm', () => {
  // principal axis of the shaft vertices (power iteration on the covariance)
  const mean = [0, 1, 2].map((k) => shaft.reduce((a, v) => a + v[k], 0) / shaft.length);
  const d = shaft.map((v) => v.map((x, k) => x - mean[k]));
  let ax = [1, 1, 0];
  for (let it = 0; it < 50; it++) {
    const next = [0, 0, 0];
    for (const v of d) {
      const dot = v[0] * ax[0] + v[1] * ax[1] + v[2] * ax[2];
      for (let k = 0; k < 3; k++) next[k] += dot * v[k];
    }
    const l = Math.hypot(...next);
    ax = next.map((x) => x / l);
  }
  if (ax[1] < 0) ax = ax.map((x) => -x);
  const lie = Math.atan2(ax[1], Math.hypot(ax[0], ax[2])) * 180 / Math.PI;
  assert.ok(Math.abs(lie - 60) < 0.5, `lie ${lie}`);
  const n = [-Math.sin(Math.PI / 3), Math.cos(Math.PI / 3)];
  const across = shaft.map((v) => [v[0] * n[0] + v[1] * n[1], 0, v[2]]);
  assert.ok(extent(across, 0) <= 35, `shaft diameter (in plane) ${extent(across, 0)}`);
  assert.ok(extent(across, 2) <= 35, `shaft diameter (z) ${extent(across, 2)}`);
});

// --- perforated blade -------------------------------------------------------

// Does any Blade triangle, projected onto the XY side view, cover (x, y)?
// Triangles that project to (near) zero area are vertical walls - skip them.
const bladeTris = obj.tris('Blade').filter(([a, b, c]) =>
  Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) > 1e-6);
function covered(x, y) {
  for (const [a, b, c] of bladeTris) {
    const d1 = (x - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (y - b[1]);
    const d2 = (x - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (y - c[1]);
    const d3 = (x - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (y - a[1]);
    const neg = d1 < 0 || d2 < 0 || d3 < 0;
    const pos = d1 > 0 || d2 > 0 || d3 > 0;
    if (!(neg && pos)) return true;
  }
  return false;
}
// side-view point on the 270 mm bottom-edge arc's family of concentric arcs
const R = 270;
const onArc = (r, t) => [r * Math.sin(t), R - r * Math.cos(t)];

test('blade is a lattice: open holes between the ribs', () => {
  let open = 0, total = 0;
  for (let t = -0.32; t <= 0.12; t += 0.01) {
    for (let r = R - 66; r <= R - 10; r += 4) {
      total++;
      if (!covered(...onArc(r, t))) open++;
    }
  }
  const frac = open / total;
  assert.ok(frac > 0.25 && frac < 0.8, `open fraction ${frac.toFixed(2)}`);
});

test('blade rim along the bottom edge is closed', () => {
  for (let t = -0.38; t <= 0.28; t += 0.01) {
    const [x, y] = onArc(R - 3, t);
    assert.ok(covered(x, y), `gap in the rim at x=${x.toFixed(1)}`);
  }
});
