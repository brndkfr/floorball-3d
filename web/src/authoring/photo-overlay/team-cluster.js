// Jersey-colour k-means team clustering (Phase 2 T3). See docs/phase-2-plan.md.
const JERSEY_HEIGHT_FRAC = 0.4;   // upper 40% of the bbox = jersey region
const SAMPLE_MARGIN_FRAC = 0.15;  // skip outer 15% margin of that region
const GRID_N = 12;                // 12x12 sample grid
const ACHROMATIC_CHROMA = 12;     // Lab chroma below this = "no real colour"
const KMEANS_ITERATIONS = 8;

function srgbToLinear(c) {
  const cs = c / 255;
  return cs <= 0.04045 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

function rgbToXyz(r, g, b) {
  const rl = srgbToLinear(r), gl = srgbToLinear(g), bl = srgbToLinear(b);
  return [
    rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375,
    rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750,
    rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041,
  ];
}

const D65 = { x: 0.95047, y: 1, z: 1.08883 };

function labF(t) {
  const delta = 6 / 29;
  return t > delta ** 3 ? Math.cbrt(t) : t / (3 * delta * delta) + 4 / 29;
}

// Rough sRGB -> CIE Lab (D65) - good enough for clustering, not colour-managed.
function rgbToLab(r, g, b) {
  const [x, y, z] = rgbToXyz(r, g, b);
  const fx = labF(x / D65.x), fy = labF(y / D65.y), fz = labF(z / D65.z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

// Draws the jersey sub-region downscaled onto a GRID_N x GRID_N canvas (the
// browser's bilinear resample acts as the sample grid) and averages it.
// Returns [L, a, b], or null if the box is too small/degenerate to sample.
function sampleJerseyLab(image, bbox) {
  const [bx, by, bw, bh] = bbox;
  const jerseyH = bh * JERSEY_HEIGHT_FRAC;
  const marginX = bw * SAMPLE_MARGIN_FRAC;
  const marginY = jerseyH * SAMPLE_MARGIN_FRAC;
  const sx = bx + marginX, sy = by + marginY;
  const sw = bw - 2 * marginX, sh = jerseyH - 2 * marginY;
  if (sw <= 0 || sh <= 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = GRID_N;
  canvas.height = GRID_N;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, GRID_N, GRID_N);
  const { data } = ctx.getImageData(0, 0, GRID_N, GRID_N);
  let sumR = 0, sumG = 0, sumB = 0;
  const n = GRID_N * GRID_N;
  for (let i = 0; i < n; i++) {
    sumR += data[i * 4];
    sumG += data[i * 4 + 1];
    sumB += data[i * 4 + 2];
  }
  return rgbToLab(sumR / n, sumG / n, sumB / n);
}

// White/black/grey jersey (goalie, referee) - not a real team colour, don't
// force it into a cluster (worse UX than a visible "unknown" chip).
function isAchromatic([L, a, b]) {
  const chroma = Math.hypot(a, b);
  return chroma < ACHROMATIC_CHROMA && (L > 80 || L < 20);
}

function distSq(a, b) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

// Deterministic k=2 k-means (no RNG): seeds with the two mutually most
// distant points so the result is reproducible across runs on the same input.
function kmeans2(points, iterations) {
  let maxDist = -1, seedI = 0, seedJ = Math.min(1, points.length - 1);
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const d = distSq(points[i], points[j]);
      if (d > maxDist) { maxDist = d; seedI = i; seedJ = j; }
    }
  }
  const centroids = [points[seedI].slice(), points[seedJ].slice()];
  const assignments = new Array(points.length).fill(0);
  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < points.length; i++) {
      assignments[i] = distSq(points[i], centroids[0]) <= distSq(points[i], centroids[1]) ? 0 : 1;
    }
    for (let c = 0; c < 2; c++) {
      const members = points.filter((_, i) => assignments[i] === c);
      if (members.length === 0) continue; // keep previous centroid rather than producing NaN
      const sum = members.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]], [0, 0, 0]);
      centroids[c] = sum.map((v) => v / members.length);
    }
  }
  return { assignments, centroids };
}

// boxes = [{ bbox: [x,y,w,h], ... }]. Returns boxes with a `team` field
// added: 'home' | 'away' | 'unknown' (achromatic/degenerate jersey sample).
export function assignTeams(image, boxes) {
  const samples = boxes.map((b) => sampleJerseyLab(image, b.bbox));
  const teams = new Array(boxes.length).fill('unknown');
  const clusterableIdx = [];
  const clusterablePoints = [];
  samples.forEach((lab, i) => {
    if (!lab || isAchromatic(lab)) return;
    clusterableIdx.push(i);
    clusterablePoints.push(lab);
  });

  if (clusterablePoints.length === 1) {
    teams[clusterableIdx[0]] = 'home';
  } else if (clusterablePoints.length >= 2) {
    const { assignments, centroids } = kmeans2(clusterablePoints, KMEANS_ITERATIONS);
    // Warmer cluster (more red/yellow: a* + b* higher) is arbitrarily 'home' -
    // user can flip via the "Flip teams" button.
    const warmth = centroids.map(([, a, b]) => a + b);
    const homeCluster = warmth[0] >= warmth[1] ? 0 : 1;
    clusterableIdx.forEach((idx, k) => {
      teams[idx] = assignments[k] === homeCluster ? 'home' : 'away';
    });
  }

  return boxes.map((b, i) => ({ ...b, team: teams[i] }));
}
