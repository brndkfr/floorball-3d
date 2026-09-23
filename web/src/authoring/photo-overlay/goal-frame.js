// Pure goal-frame fit for detect.js's ROI path, built on what every floorball
// goal shares regardless of camera angle or goalie:
// - two red posts, near-parallel in the image, equal length in the world;
// - a red crossbar joining the post tops (rarely occluded);
// - NO front ground bar - the base frame runs from each post foot back to the
//   rear bar, so a post ends where it widens into that junction (or where a
//   goalie / floor ad takes over);
// - an interior that is not solid red.
// Candidates are post-pair x crossbar combinations from Hough lines; each is
// scored by red support and the winner is snapped onto the tube centres.

const V_TILT = Math.tan(25 * Math.PI / 180); // posts: |dx| <= V_TILT * |dy|
const H_TILT = Math.tan(35 * Math.PI / 180); // bars:  |dy| <= H_TILT * |dx|
const MAX_LINES = 16;
const EDGE_SAMPLES = 40;
const MAX_PAIR_ANGLE = 12 * Math.PI / 180;
const OCCLUDED_FRAC = 0.85; // a post shorter than this x the other is treated as partly hidden

// Line in "major-axis" form: vertical x = a*y + b, horizontal y = a*x + b.
function fitLine(segs, vertical) {
  let sw = 0, su = 0, sv = 0, suu = 0, suv = 0, uMin = Infinity, uMax = -Infinity;
  for (const [x0, y0, x1, y1] of segs) {
    const w = Math.hypot(x1 - x0, y1 - y0) || 1;
    for (const [x, y] of [[x0, y0], [x1, y1]]) {
      const u = vertical ? y : x, v = vertical ? x : y;
      sw += w; su += w * u; sv += w * v; suu += w * u * u; suv += w * u * v;
      uMin = Math.min(uMin, u); uMax = Math.max(uMax, u);
    }
  }
  const den = sw * suu - su * su;
  const a = Math.abs(den) < 1e-9 ? 0 : (sw * suv - su * sv) / den;
  return { a, b: (sv - a * su) / sw, weight: sw / 2, uMin, uMax };
}

const lineAt = (l, u) => l.a * u + l.b;

function clusterLines(segs, vertical, tol) {
  const mid = ([x0, y0, x1, y1]) => [(x0 + x1) / 2, (y0 + y1) / 2];
  const sorted = [...segs].sort((p, q) => (vertical ? mid(p)[0] - mid(q)[0] : mid(p)[1] - mid(q)[1]));
  const clusters = [];
  for (const s of sorted) {
    const [mx, my] = mid(s);
    const u = vertical ? my : mx, v = vertical ? mx : my;
    const home = clusters.find((c) => Math.abs(lineAt(c.line, u) - v) <= tol);
    if (home) { home.segs.push(s); home.line = fitLine(home.segs, vertical); }
    else clusters.push({ segs: [s], line: fitLine([s], vertical) });
  }
  return clusters.map((c) => c.line).sort((p, q) => q.weight - p.weight).slice(0, MAX_LINES);
}

function intersect(v, h) {
  // x = v.a*y + v.b, y = h.a*x + h.b
  const den = 1 - v.a * h.a;
  if (Math.abs(den) < 1e-9) return null;
  const x = (v.a * h.b + v.b) / den;
  return [x, h.a * x + h.b];
}

function lineThrough(p, q) {
  const a = (q[1] - p[1]) / ((q[0] - p[0]) || 1e-9);
  return { a, b: p[1] - a * p[0], weight: 0 };
}

// Fraction of samples along p->q with red within +-r px perpendicular.
function edgeSupport(p, q, redAt, r) {
  const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  let hit = 0;
  for (let i = 0; i <= EDGE_SAMPLES; i++) {
    const t = i / EDGE_SAMPLES, x = p[0] + dx * t, y = p[1] + dy * t;
    for (let o = -r; o <= r; o++) {
      if (redAt(x + nx * o, y + ny * o)) { hit++; break; }
    }
  }
  return hit / (EDGE_SAMPLES + 1);
}

// Horizontal red run through (x, y) along a post: [left, right] or null.
function runAcross(x, y, redAt, r, cap) {
  let seed = null;
  for (let d = 0; d <= r && seed === null; d++) {
    if (redAt(x - d, y)) seed = x - d; else if (redAt(x + d, y)) seed = x + d;
  }
  if (seed === null) return null;
  let lo = seed, hi = seed;
  while (seed - lo < cap && redAt(lo - 1, y)) lo--;
  while (hi - seed < cap && redAt(hi + 1, y)) hi++;
  return [lo, hi];
}

// Walk a post down from its crossbar corner while there is red on the line,
// bridging gaps (glove, legs in front of the post) relative to the length so
// far. Things merging into the post from the mouth side (net, goalie, base
// bar) don't stop the walk; a floor ad under the foot spreads red OUTWARD
// past the tube, so those rows are trimmed off the end.
function postFoot(post, topY, height, redAt, r, outward) {
  const cap = Math.max(8, height * 0.1);
  const y0 = Math.max(0, Math.ceil(topY));
  const runs = [];
  for (let y = y0; y < height; y++) runs.push(runAcross(lineAt(post, y), y, redAt, r, cap));
  const widths = runs.filter(Boolean).map(([lo, hi]) => hi - lo + 1).sort((a, b) => a - b);
  if (widths.length < 5) return null;
  const tube = widths[Math.floor(widths.length * 0.3)]; // biased low: junctions/blobs only widen
  let first = null, last = null, gap = 0, covered = 0;
  for (let i = 0; i < runs.length; i++) {
    if (runs[i]) {
      if (first === null) first = i;
      last = i; gap = 0; covered++;
      continue;
    }
    if (first !== null && ++gap > Math.max(3, height * 0.03, (last - first) * 0.6)) break;
  }
  if (last === null) return null;
  const spreadsOut = (i) => {
    const run = runs[i];
    if (!run) return false;
    const x = lineAt(post, y0 + i);
    return outward > 0 ? run[1] > x + tube * 1.5 : run[0] < x - tube * 1.5;
  };
  while (last > first && (spreadsOut(last) || !runs[last])) { if (runs[last]) covered--; last--; }
  // corners sit on tube centre lines, so stop half a tube above the end cap
  return { y: y0 + last - tube / 2, tube, covered: covered / Math.max(1, last - first + 1) };
}

function interiorRed([tl, tr, br, bl], redAt) {
  let red = 0, n = 0;
  for (let i = 1; i < 10; i++) {
    for (let j = 1; j < 10; j++) {
      const u = 0.2 + 0.6 * (i / 10), v = 0.2 + 0.6 * (j / 10);
      const top = [tl[0] + (tr[0] - tl[0]) * u, tl[1] + (tr[1] - tl[1]) * u];
      const bot = [bl[0] + (br[0] - bl[0]) * u, bl[1] + (br[1] - bl[1]) * u];
      n++; if (redAt(top[0] + (bot[0] - top[0]) * v, top[1] + (bot[1] - top[1]) * v)) red++;
    }
  }
  return red / n;
}

// Re-fit an edge through the centres of the red runs crossing it. When a run
// is much wider than a tube (merged with an ad / spectator / goalie), keep
// the tube-width slice nearest the candidate line.
function snapLine(line, vertical, from, to, redAt, tol, tube = 0) {
  const hits = [];
  for (let i = 0; i <= EDGE_SAMPLES; i++) {
    const u = from + (to - from) * (i / EDGE_SAMPLES);
    const v0 = lineAt(line, u);
    const at = (o) => (vertical ? redAt(v0 + o, u) : redAt(u, v0 + o));
    let seed = null;
    for (let d = 0; d <= tol && seed === null; d++) {
      if (at(-d)) seed = -d; else if (at(d)) seed = d;
    }
    if (seed === null) continue;
    let lo = seed, hi = seed;
    while (lo - 1 >= -3 * tol && at(lo - 1)) lo--;
    while (hi + 1 <= 3 * tol && at(hi + 1)) hi++;
    hits.push([u, v0, lo, hi]);
  }
  if (hits.length < 5) return line;
  if (!tube) {
    const ws = hits.map(([, , lo, hi]) => hi - lo + 1).sort((a, b) => a - b);
    tube = ws[Math.floor(ws.length * 0.3)];
  }
  const pts = hits.map(([u, v0, lo, hi]) => {
    let c = (lo + hi) / 2;
    if (hi - lo + 1 > tube * 1.8) {
      const a = lo + tube / 2, b = hi - tube / 2;
      c = Math.abs(a) <= Math.abs(b) ? a : b;
    }
    return [u, v0 + c];
  });
  const segs = [];
  for (let i = 1; i < pts.length; i++) {
    const [u0, v0] = pts[i - 1], [u1, v1] = pts[i];
    segs.push(vertical ? [v0, u0, v1, u1] : [u0, v0, u1, v1]);
  }
  return fitLine(segs, vertical);
}

// Crossbar corners + post feet for one (L, R, T) candidate.
function frameFor(L, R, T, redAt, height, r) {
  const tl = intersect(L, T), tr = intersect(R, T);
  if (!tl || !tr || tl[0] >= tr[0]) return null;
  const fL = postFoot(L, tl[1], height, redAt, r, -1), fR = postFoot(R, tr[1], height, redAt, r, +1);
  if (!fL || !fR) return null;
  let hL = fL.y - tl[1], hR = fR.y - tr[1];
  if (hL <= 0 || hR <= 0) return null;
  const visible = [hL, hR];
  // World posts are equal length: extend a partly hidden one (goalie, net sag).
  if (hL < hR * OCCLUDED_FRAC) hL = hR;
  else if (hR < hL * OCCLUDED_FRAC) hR = hL;
  const blY = tl[1] + hL, brY = tr[1] + hR;
  return {
    corners: [tl, tr, [lineAt(R, brY), brY], [lineAt(L, blY), blY]],
    visible, tube: Math.min(fL.tube, fR.tube),
  };
}

// segments: [[x0, y0, x1, y1], ...] (Hough on mask edges); redAt(x, y) -> bool.
// Returns { corners: [TL, TR, BR, BL], score } or null.
export function fitGoalFrame({ segments, redAt, width, height, debug = null }) {
  const verts = [], horiz = [];
  for (const s of segments || []) {
    const dx = Math.abs(s[2] - s[0]), dy = Math.abs(s[3] - s[1]);
    if (dy > 0 && dx <= V_TILT * dy) verts.push(s);
    else if (dx > 0 && dy <= H_TILT * dx) horiz.push(s);
  }
  const size = Math.max(width, height);
  const tol = Math.max(6, size * 0.025);
  const r = Math.max(2, Math.round(size * 0.006));
  // Hough clusters can be one tube edge, or several things merged, with a poor
  // slope; re-centre each on its tube before pairing.
  const recentre = (vertical) => (l) => ({
    ...snapLine(l, vertical, l.uMin, l.uMax, redAt, Math.ceil(tol)),
    weight: l.weight,
  });
  const vLines = clusterLines(verts, true, tol).map(recentre(true));
  const hLines = clusterLines(horiz, false, tol).map(recentre(false));
  if (debug) {
    debug.vLines = vLines.map((l) => [Math.round(lineAt(l, height / 2)), Math.round(l.weight)]);
    debug.hLines = hLines.map((l) => [Math.round(lineAt(l, width / 2)), Math.round(l.weight)]);
    debug.cands = [];
  }
  const note = (reason, corners, extra) => debug?.cands.push({ reason, corners: corners?.map((p) => p.map(Math.round)), ...extra });
  if (vLines.length < 2) return null;
  const topOf = (post) => {
    for (let y = 0; y < height; y++) if (runAcross(lineAt(post, y), y, redAt, r, 1)) return [lineAt(post, y), y];
    return null;
  };
  const tops = vLines.map(topOf);

  let best = null;
  for (let i = 0; i < vLines.length; i++) {
    for (let j = 0; j < vLines.length; j++) {
      const L = vLines[i], R = vLines[j];
      if (i === j || lineAt(L, height / 2) >= lineAt(R, height / 2)) continue;
      if (Math.abs(Math.atan(L.a) - Math.atan(R.a)) > MAX_PAIR_ANGLE) continue;
      const bars = [...hLines];
      // Crossbar missing from Hough (washed out over a white board): try the
      // line through the tops of both posts' red.
      if (tops[i] && tops[j]) bars.push(lineThrough(tops[i], tops[j]));
      for (const T of bars) {
        const f = frameFor(L, R, T, redAt, height, r);
        if (!f) { note('noFrame', null, { L: Math.round(lineAt(L, height / 2)), R: Math.round(lineAt(R, height / 2)), T: Math.round(lineAt(T, width / 2)) }); continue; }
        const [tl, tr, br, bl] = f.corners;
        const inside = (p) => p[0] >= -r && p[1] >= -r && p[0] <= width + r && p[1] <= height + r;
        if (!f.corners.every(inside)) { note('outside', f.corners); continue; }
        const postH = (bl[1] - tl[1] + br[1] - tr[1]) / 2, barW = ((tr[0] - tl[0]) + (br[0] - bl[0])) / 2;
        if (postH < height * 0.1) { note('short', f.corners); continue; }
        const aspect = barW / postH;
        if (aspect < 0.25 || aspect > 2.2) { note('aspect', f.corners, { visible: f.visible, tube: f.tube }); continue; }
        const sT = edgeSupport(tl, tr, redAt, r);
        if (sT < 0.25) { note('crossbar', f.corners, { sT }); continue; }
        // Posts hang from the crossbar: right under a real top corner the post
        // is solid red. Under a fake "crossbar" (railing above the goal) it isn't.
        const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
        const hangL = edgeSupport(tl, lerp(tl, bl, 0.15), redAt, r), hangR = edgeSupport(tr, lerp(tr, br, 0.15), redAt, r);
        if (Math.min(hangL, hangR) < 0.75) { note('hang', f.corners, { hangL, hangR }); continue; }
        // A solid red bar spanning the posts in the upper half of the mouth
        // means THAT is the crossbar and T is something above the goal.
        const midL = lerp(tl, bl, 0.5), midR = lerp(tr, br, 0.5);
        const innerBar = hLines.some((H) => {
          if (H === T) return false;
          const a = intersect(L, H), b = intersect(R, H);
          if (!a || !b || a[1] <= tl[1] + f.tube * 2 || b[1] <= tr[1] + f.tube * 2 || a[1] >= midL[1] || b[1] >= midR[1]) return false;
          return edgeSupport(a, b, redAt, r) >= Math.max(0.8, sT);
        });
        if (innerBar) { note('innerBar', f.corners); continue; }
        // Post support = red actually on the post between corner and foot, so a
        // fake crossbar above the real one (railings, ads) doesn't get the real
        // posts' length for free.
        const footL = [lineAt(L, tl[1] + f.visible[0]), tl[1] + f.visible[0]];
        const footR = [lineAt(R, tr[1] + f.visible[1]), tr[1] + f.visible[1]];
        const sL = edgeSupport(tl, footL, redAt, r) * f.visible[0] / (bl[1] - tl[1]);
        const sR = edgeSupport(tr, footR, redAt, r) * f.visible[1] / (br[1] - tr[1]);
        if (Math.max(sL, sR) < 0.8 || Math.min(sL, sR) < 0.3) { note('posts', f.corners, { sL, sR }); continue; }
        if (interiorRed(f.corners, redAt) > 0.85) { note('solid', f.corners); continue; }
        // Crossbar weighted highest - a straight red bar joining both post tops
        // is the cue clutter (railings, spectators, poles) almost never fakes.
        const support = sL + sR + 3 * sT;
        // The goal is the biggest frame in a user-drawn box - prefer size.
        const areaFrac = (barW * postH) / (width * height);
        const score = support * (0.4 + 0.6 * Math.sqrt(Math.min(1, areaFrac)));
        note('ok', f.corners, { score, sL, sR, sT });
        if (!best || score > best.score) best = { ...f, score, L, R, T };
      }
    }
  }
  if (!best) return null;
  return { corners: refine(best, redAt, height, r, Math.ceil(tol)), score: best.score };
}

function refine(best, redAt, height, r, tol) {
  const { L, R, T, tube } = best;
  const [tl, tr, br, bl] = best.corners;
  const shrink = (a, b) => [a + (b - a) * 0.15, b - (b - a) * 0.15];
  const L2 = snapLine(L, true, ...shrink(tl[1], bl[1]), redAt, tol, tube);
  const R2 = snapLine(R, true, ...shrink(tr[1], br[1]), redAt, tol, tube);
  const T2 = snapLine(T, false, ...shrink(tl[0], tr[0]), redAt, tol, tube);
  const f = frameFor(L2, R2, T2, redAt, height, r);
  return f ? f.corners : best.corners;
}
