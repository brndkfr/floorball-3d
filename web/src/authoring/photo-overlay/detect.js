// Classical-CV auto-detection of the goal (red frame) and crease (white
// paint) on a floorball photo, so the user doesn't have to click those
// landmarks manually. Uses opencv.js (already loaded via pnp.js) - no
// extra ML model. HSV ranges below are hand-tuned to typical broadcast
// footage (bright red goals, white crease line, blue-ish floor) and will
// need nudging for very-off-white paint or non-red goal frames.
import { loadOpenCV } from './pnp.js';

// Draws the HTMLImageElement onto an offscreen canvas at a bounded
// max-side so opencv work stays snappy on large photos. Returns
// { mat, scale } - scale is the multiplier to convert back to original
// image pixel coords.
function imageToMat(cv, image, maxSide = 1024) {
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const w = Math.round(image.width * scale);
  const h = Math.round(image.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(image, 0, 0, w, h);
  const mat = cv.imread(canvas);
  return { mat, scale };
}

// Sort 4 corners into [top-left, top-right, bottom-right, bottom-left]
// screen order. Standard perspective-quad ordering trick: TL has smallest
// x+y, BR has largest x+y, TR has largest x-y, BL has smallest x-y.
function orderCorners(pts) {
  const sum = pts.map((p) => p[0] + p[1]);
  const diff = pts.map((p) => p[0] - p[1]);
  return [
    pts[sum.indexOf(Math.min(...sum))],
    pts[diff.indexOf(Math.max(...diff))],
    pts[sum.indexOf(Math.max(...sum))],
    pts[diff.indexOf(Math.min(...diff))],
  ];
}

function contourAreaRect(cv, contour) {
  const rect = cv.minAreaRect(contour);
  const pts = cv.RotatedRect.points(rect);
  return { pts: pts.map((p) => [p.x, p.y]), area: rect.size.width * rect.size.height, rect };
}

// Threshold for saturated red-orange (Hue near 0 wraps in HSV so we OR
// two ranges together). Returns a fresh binary Mat the caller must delete.
function maskRed(cv, hsv) {
  const lo1 = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [0, 90, 70, 0]);
  const hi1 = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [18, 255, 255, 0]);
  const lo2 = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [160, 90, 70, 0]);
  const hi2 = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [180, 255, 255, 0]);
  const m1 = new cv.Mat(), m2 = new cv.Mat(), out = new cv.Mat();
  cv.inRange(hsv, lo1, hi1, m1);
  cv.inRange(hsv, lo2, hi2, m2);
  cv.bitwise_or(m1, m2, out);
  lo1.delete(); hi1.delete(); lo2.delete(); hi2.delete(); m1.delete(); m2.delete();
  return out;
}

// Near-white pixels: low saturation, high value. Deliberately permissive
// on saturation because floor paint under arena lighting picks up a mild
// tint. Caller narrows by spatial mask (search only around the goal).
function maskWhite(cv, hsv) {
  const lo = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [0, 0, 170, 0]);
  const hi = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [180, 70, 255, 0]);
  const out = new cv.Mat();
  cv.inRange(hsv, lo, hi, out);
  lo.delete(); hi.delete();
  return out;
}

// IFF-blue floor: cyan-blue hue band with moderate-to-high saturation.
// Range is intentionally wide to cover different arena lighting; user
// can still adjust if a specific rink uses a different shade.
function maskFloor(cv, hsv) {
  const lo = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [80, 60, 60, 0]);
  const hi = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [115, 255, 255, 0]);
  const out = new cv.Mat();
  cv.inRange(hsv, lo, hi, out);
  lo.delete(); hi.delete();
  return out;
}

// Compute Canny edges of the whole image and return them as an offscreen
// canvas the same aspect as the input, filled with bright cyan on
// transparent so photo-canvas.js can blit it on top of the photo.
// max-side capped for speed: 2048 keeps edges crisp enough at typical
// display sizes while Canny runs in ~150ms even on a 12MP phone shot.
export async function computeEdgeOverlay(image, maxSide = 2048) {
  const cv = await loadOpenCV();
  const { mat: rgba } = imageToMat(cv, image, maxSide);
  const gray = new cv.Mat(), blur = new cv.Mat(), edges = new cv.Mat();
  cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, blur, new cv.Size(3, 3), 0);
  // Fixed thresholds tuned for both dim broadcast + bright phone shots.
  // If a user wants tunable, we can expose two sliders later - starting
  // simple keeps the UI clean.
  cv.Canny(blur, edges, 60, 150);

  const canvas = document.createElement('canvas');
  canvas.width = edges.cols; canvas.height = edges.rows;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(edges.cols, edges.rows);
  const data = img.data;
  const src = edges.data;
  // src is uint8 mask (0 or 255). Paint cyan with alpha=200 on edges,
  // transparent elsewhere.
  for (let i = 0, o = 0; i < src.length; i++, o += 4) {
    if (src[i]) {
      data[o] = 0; data[o + 1] = 255; data[o + 2] = 255; data[o + 3] = 200;
    } else {
      data[o + 3] = 0;
    }
  }
  ctx.putImageData(img, 0, 0);

  rgba.delete(); gray.delete(); blur.delete(); edges.delete();
  return canvas;
}

// Returns { corners: [[x,y] x4] in ORIGINAL image pixels, ordered TL/TR/BR/BL }
// or null if nothing plausible was found. Optional roi (in original image
// px) constrains the search area - use it to eliminate false positives
// from red spectators / ads / referee jerseys outside the goal region.
export async function detectGoal(image, roi = null) {
  const cv = await loadOpenCV();
  const { mat: rgba, scale } = imageToMat(cv, image);
  const rgb = new cv.Mat(), hsv = new cv.Mat();
  cv.cvtColor(rgba, rgb, cv.COLOR_RGBA2RGB);
  cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);

  const mask = maskRed(cv, hsv);
  // Close small gaps (net weave breaks up the frame silhouette), then open
  // to shed thin red audience clothing / sticks.
  const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5));
  cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel);
  cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kernel);

  // ROI in downscaled coords. We filter contours by centroid-inside-ROI
  // rather than pre-masking the mask, because @techstark/opencv-js's
  // binding refuses positional cv.Rect construction on some Chromium
  // builds ("Missing field: 'width'"). Filtering after findContours
  // sidesteps the whole issue and is just as effective for our purpose.
  const roiSmall = roi ? {
    x: roi.x * scale, y: roi.y * scale,
    w: roi.w * scale, h: roi.h * scale,
  } : null;

  const contours = new cv.MatVector(), hierarchy = new cv.Mat();
  cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  let best = null;
  // With a manual ROI, drop the tiny-area and upper-2/3 heuristics - the
  // user has already told us where to look.
  const minArea = roi ? 4 : (mask.rows * mask.cols) * 0.0005;
  // Goal frame is ~1.4x wider than tall (mouth 1.6m x posts 1.15m plus
  // perspective) - anything more than ~2.5:1 is almost certainly a red
  // banner ad rather than the goal frame. Score each candidate by how
  // close its aspect ratio is to the ideal goal aspect, weighted by area,
  // so the largest goal-shaped blob wins - not just the largest red blob.
  const IDEAL_ASPECT = 1.4;
  for (let i = 0; i < contours.size(); i++) {
    const c = contours.get(i);
    const info = contourAreaRect(cv, c);
    if (info.area < minArea) { c.delete(); continue; }
    const cx = info.rect.center.x, cy = info.rect.center.y;
    const bb = cv.boundingRect(c);
    if (roiSmall) {
      const ox = Math.max(0, Math.min(bb.x + bb.width, roiSmall.x + roiSmall.w) - Math.max(bb.x, roiSmall.x));
      const oy = Math.max(0, Math.min(bb.y + bb.height, roiSmall.y + roiSmall.h) - Math.max(bb.y, roiSmall.y));
      const overlap = (ox * oy) / Math.max(1, bb.width * bb.height);
      if (overlap < 0.7) { c.delete(); continue; }
    } else if (cy > mask.rows * 0.75) {
      c.delete(); continue;
    }
    const aspect = bb.width / Math.max(1, bb.height);
    if (aspect > 3 || aspect < 0.3) { c.delete(); continue; }
    // Score inversely to aspect-ratio distance from IDEAL_ASPECT (log so
    // that being 2x off matters roughly the same in either direction),
    // multiplied by area so we still prefer bigger goal-shaped blobs
    // over tiny goal-shaped noise.
    const aspectPenalty = Math.abs(Math.log(aspect / IDEAL_ASPECT));
    const score = info.area / (1 + 3 * aspectPenalty);
    if (!best || score > best.score) best = { ...info, contour: c, cx, cy, score };
    else c.delete();
  }

  const result = best
    ? { corners: orderCorners(best.pts).map(([x, y]) => [x / scale, y / scale]),
        // bbox in downscaled coords, used by crease detection
        _bboxSmall: cv.boundingRect(best.contour) }
    : null;

  if (best) best.contour.delete();
  hierarchy.delete(); contours.delete(); mask.delete(); kernel.delete();
  rgb.delete(); hsv.delete(); rgba.delete();
  return result;
}

// Given goal detection result, search a window around/below the goal for
// the crease outline (white paint on floor). Returns 4 corners in
// TL/TR/BR/BL order or null.
export async function detectCrease(image, goalResult) {
  if (!goalResult) return null;
  const cv = await loadOpenCV();
  const { mat: rgba, scale } = imageToMat(cv, image);
  const rgb = new cv.Mat(), hsv = new cv.Mat();
  cv.cvtColor(rgba, rgb, cv.COLOR_RGBA2RGB);
  cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);

  const white = maskWhite(cv, hsv);

  // Build a spatial ROI centred on the goal, extended downward + sideways.
  // Crease depth (4 m) + width (5 m) is ~3x the goal-mouth width in world
  // units; in screen space we're generous because perspective foreshortens
  // it a lot. We filter contours by their bounding-box overlap with this
  // ROI rather than masking, to avoid the same cv.Rect construction bug
  // that hits detectGoal on some Chromium builds.
  const g = goalResult._bboxSmall;
  const searchRoi = {
    x: Math.max(0, g.x - g.width * 1.2),
    y: Math.max(0, g.y - g.height * 0.3),
    w: g.width * 3.4,
    h: g.height * 3.5,
  };

  // Close gaps: crease line is thin (paint), broadcast sharpening leaves
  // it broken. Then dilate slightly so contour picks up the full outline.
  const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(7, 7));
  cv.morphologyEx(white, white, cv.MORPH_CLOSE, kernel);

  const contours = new cv.MatVector(), hierarchy = new cv.Mat();
  cv.findContours(white, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  // Pick the contour whose bounding box best contains the goal (crease
  // wraps around the goal on 3 sides). Score = area * containment.
  let best = null;
  for (let i = 0; i < contours.size(); i++) {
    const c = contours.get(i);
    const bb = cv.boundingRect(c);
    // Skip contours whose centroid falls outside our search ROI - kills
    // the huge boards/rink contour and any spectator whites.
    const bcx = bb.x + bb.width / 2, bcy = bb.y + bb.height / 2;
    if (bcx < searchRoi.x || bcx > searchRoi.x + searchRoi.w ||
        bcy < searchRoi.y || bcy > searchRoi.y + searchRoi.h) { c.delete(); continue; }
    const overlapX = Math.max(0, Math.min(bb.x + bb.width, g.x + g.width) - Math.max(bb.x, g.x));
    const overlapY = Math.max(0, Math.min(bb.y + bb.height, g.y + g.height) - Math.max(bb.y, g.y));
    const goalArea = g.width * g.height || 1;
    const containment = (overlapX * overlapY) / goalArea;
    const area = cv.contourArea(c);
    const score = area * (0.3 + containment);
    if (containment < 0.4 || area < g.width * g.height * 0.5) { c.delete(); continue; }
    if (!best || score > best.score) best = { contour: c, score };
    else c.delete();
  }

  let corners = null;
  if (best) {
    const info = contourAreaRect(cv, best.contour);
    corners = orderCorners(info.pts).map(([x, y]) => [x / scale, y / scale]);
    best.contour.delete();
  }

  hierarchy.delete(); contours.delete(); white.delete(); kernel.delete();
  rgb.delete(); hsv.delete(); rgba.delete();
  return corners ? { corners } : null;
}
