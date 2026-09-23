// Classical-CV auto-detection of the goal (red frame) and crease (white
// paint) on a floorball photo, so the user doesn't have to click those
// landmarks manually. Uses opencv.js (already loaded via pnp.js) - no
// extra ML model. HSV ranges below are hand-tuned to typical broadcast
// footage (bright red goals, white crease line, blue-ish floor) and will
// need nudging for very-off-white paint or non-red goal frames.
import { loadOpenCV } from './pnp.js';
import { scoreGoalCandidate, redHueRanges, workingScale, RED_MIN_SAT, RED_MIN_VAL } from './detect-score.js';
import { cornersFromPosts } from './detect-posts.js';
import { fitGoalFrame } from './goal-frame.js';

// Draws the HTMLImageElement onto an offscreen canvas at a bounded
// max-side so opencv work stays snappy on large photos. Returns
// { mat, scale } - scale is the multiplier to convert back to original
// image pixel coords.
function imageToMat(cv, image, maxSide = 1024, allowUpscale = false) {
  const scale = workingScale(image.width, image.height, { maxSide, allowUpscale });
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

// Fraction of the candidate's inner-60% bounding box (skip 20% margin on
// each side) that is still red in the mask. A real goal frame is hollow
// in the middle - net / floor / ice, mostly NOT red - so this is low
// (0.15-0.5). A solid sponsor banner or a row of red spectator chairs
// packs its whole bbox with red pixels, so this is high (>0.75). See
// scoreGoalCandidate in detect-score.js. Iterating mask.data directly
// avoids the @techstark/opencv-js `new cv.Rect(x, y, w, h)` throw
// (CLAUDE.md photo-overlay gotcha) and is fast for small windows.
function computeInteriorRedFraction(mask, bb) {
  const insetX = Math.floor(bb.width * 0.2);
  const insetY = Math.floor(bb.height * 0.2);
  const x0 = Math.max(0, bb.x + insetX);
  const y0 = Math.max(0, bb.y + insetY);
  const x1 = Math.min(mask.cols, bb.x + bb.width - insetX);
  const y1 = Math.min(mask.rows, bb.y + bb.height - insetY);
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0 || h <= 0) return 0;
  const data = mask.data, stride = mask.cols;
  let redCount = 0;
  for (let y = y0; y < y1; y++) {
    const rowStart = y * stride;
    for (let x = x0; x < x1; x++) {
      if (data[rowStart + x]) redCount++;
    }
  }
  return redCount / (w * h);
}

// Threshold for saturated red-orange (Hue near 0 wraps in HSV so we OR
// two ranges together). Returns a fresh binary Mat the caller must delete.
function maskRed(cv, hsv, scoped = false) {
  const [[l1, h1], [l2, h2]] = redHueRanges({ scoped });
  const lo1 = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [l1, RED_MIN_SAT, RED_MIN_VAL, 0]);
  const hi1 = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [h1, 255, 255, 0]);
  const lo2 = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [l2, RED_MIN_SAT, RED_MIN_VAL, 0]);
  const hi2 = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [h2, 255, 255, 0]);
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
export async function detectGoal(image, roi = null, { debug = null } = {}) {
  const cv = await loadOpenCV();
  // With an ROI, crop to it (plus a margin) BEFORE downscaling, instead of
  // filtering contours after downscaling the WHOLE photo. A zoomed-in ROI
  // on a large phone photo (e.g. 3072x4080) was getting squeezed down to a
  // literal handful of pixels by the flat maxSide=1024 whole-image cap -
  // at that scale the fixed 5x5 morphology kernel erased the (now
  // wafer-thin) goal frame entirely, leaving only small red
  // artifacts/reflections to win the aspect-ratio scoring (observed: an
  // 11x7px downscaled "goal"). Cropping first keeps the goal at a much
  // higher effective resolution, fixing both the erosion and the
  // false-positive problem at once - no separate post-hoc ROI-overlap
  // contour filter needed any more.
  let srcImage = image, offsetX = 0, offsetY = 0;
  if (roi) {
    const marginX = roi.w * 0.25, marginY = roi.h * 0.25;
    offsetX = Math.max(0, roi.x - marginX);
    offsetY = Math.max(0, roi.y - marginY);
    const cropW = Math.min(image.width - offsetX, roi.w + marginX * 2);
    const cropH = Math.min(image.height - offsetY, roi.h + marginY * 2);
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = Math.max(1, Math.round(cropW));
    cropCanvas.height = Math.max(1, Math.round(cropH));
    cropCanvas.getContext('2d').drawImage(
      image, offsetX, offsetY, cropW, cropH, 0, 0, cropCanvas.width, cropCanvas.height
    );
    srcImage = cropCanvas;
  }
  const { mat: rgba, scale } = imageToMat(cv, srcImage, roi ? 2048 : 1024, !!roi);
  const rgb = new cv.Mat(), hsv = new cv.Mat();
  cv.cvtColor(rgba, rgb, cv.COLOR_RGBA2RGB);
  cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);

  const mask = maskRed(cv, hsv, !!roi);
  // Close small gaps (net weave breaks up the frame silhouette), then open
  // to shed thin red audience clothing / sticks.
  const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5));
  cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel);
  cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kernel);

  let postCorners = null;
  if (roi) {
    // Hough on a filled blob gets eaten by short diagonals across thick
    // posts - run it on the mask's edges instead.
    const edges = new cv.Mat(), lines = new cv.Mat();
    cv.Canny(mask, edges, 50, 150);
    cv.HoughLinesP(edges, lines, 1, Math.PI / 180, 30, Math.round(mask.rows * 0.05), Math.round(mask.rows * 0.03));
    // this opencv.js build returns lines as a 1xN Mat, so walk the flat data
    const d = lines.data32S, segs = [];
    for (let i = 0; i + 3 < d.length; i += 4) segs.push([d[i], d[i + 1], d[i + 2], d[i + 3]]);
    edges.delete(); lines.delete();
    const md = mask.data, mc = mask.cols, mr = mask.rows;
    const redAt = (x, y) => {
      const xi = Math.round(x), yi = Math.round(y);
      return xi >= 0 && yi >= 0 && xi < mc && yi < mr && md[yi * mc + xi] > 0;
    };
    postCorners = fitGoalFrame({ segments: segs, redAt, width: mc, height: mr, debug })?.corners
      || cornersFromPosts(segs);
  }

  const contours = new cv.MatVector(), hierarchy = new cv.Mat();
  // RETR_CCOMP (not EXTERNAL): keeps a 2-level hierarchy (shapes + their
  // holes) so text can be told apart from a real goal frame - see below.
  cv.findContours(mask, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);
  // hierarchy is a 1xNx4 Mat: [next, previous, firstChild, parent] per contour.
  const hierData = hierarchy.data32S;
  const parentOf = (i) => hierData[i * 4 + 3];

  let best = null;
  // Relative to the working mat's own area either way - self-scaling
  // whether or not we cropped, so no more special-cased near-zero floor.
  const minArea = (mask.rows * mask.cols) * 0.0005;
  for (let i = 0; i < contours.size(); i++) {
    if (parentOf(i) !== -1) continue; // a hole (letter stroke, gap), not a candidate shape
    const c = contours.get(i);
    const info = contourAreaRect(cv, c);
    if (info.area < minArea) { c.delete(); continue; }
    const cx = info.rect.center.x, cy = info.rect.center.y;
    const bb = cv.boundingRect(c);
    // Reject stuff in the bottom quarter of frame only when searching the
    // WHOLE photo (spectators/floor clutter) - meaningless for a tight
    // goal crop, which legitimately may fill most of its own frame.
    if (!roi && cy > mask.rows * 0.75) { c.delete(); continue; }
    const aspect = bb.width / Math.max(1, bb.height);
    if (aspect > 3 || aspect < 0.3) { c.delete(); continue; }
    // Sponsor-banner text (e.g. white lettering on a red board) shows up
    // as MANY small holes punched into one solid blob under hierarchical
    // contour detection - a real goal frame has at most one big hole (the
    // net/mouth interior), never a scatter of small letter-shaped ones.
    // Reject candidates that look text-laden rather than frame-shaped.
    let holeCount = 0, maxHoleArea = 0;
    for (let j = 0; j < contours.size(); j++) {
      if (parentOf(j) !== i) continue;
      const hc = contours.get(j);
      const ha = cv.contourArea(hc);
      if (ha > maxHoleArea) maxHoleArea = ha;
      holeCount++;
      hc.delete();
    }
    if (holeCount >= 4 && maxHoleArea < info.area * 0.2) { c.delete(); continue; }
    // Hollow-frame scoring: a real goal is a frame around empty net, so
    // its bbox interior in the red mask is mostly NOT red. Chairs /
    // solid banners fill their interior with red and get penalised or
    // rejected outright (scoreGoalCandidate returns 0 above 0.75).
    const interiorRedFraction = computeInteriorRedFraction(mask, bb);
    const score = scoreGoalCandidate({ area: info.area, aspect, interiorRedFraction });
    if (score <= 0) { c.delete(); continue; }
    if (!best || score > best.score) best = { ...info, contour: c, cx, cy, score };
    else c.delete();
  }

  let result = null;
  let workCorners = postCorners;
  if (!workCorners && best) {
    // `cv.minAreaRect` fits the smallest rectangle enclosing the WHOLE red
    // blob - at a rounded corner joint (a ball/fillet wider than the
    // straight tube), that bounding-rect corner sits at the ball's outer
    // tangent, not its centre, which is the actual world-space corner we
    // want. Verified via a pixel-level crop test: ~4% of the goal's own
    // size, consistently biased outward/diagonally away from the frame's
    // centre. Shrink each corner toward the quad's own centroid to
    // compensate - a plain average correction, not geometry-perfect, but
    // corrects the dominant systematic error instead of none at all.
    const CORNER_INSET_FRAC = 0.07;
    const cx0 = best.pts.reduce((s, p) => s + p[0], 0) / best.pts.length;
    const cy0 = best.pts.reduce((s, p) => s + p[1], 0) / best.pts.length;
    const insetPts = best.pts.map(([x, y]) => [
      x + (cx0 - x) * CORNER_INSET_FRAC,
      y + (cy0 - y) * CORNER_INSET_FRAC,
    ]);
    workCorners = orderCorners(insetPts);
  }
  if (workCorners) {
    const corners = workCorners.map(([x, y]) => [x / scale + offsetX, y / scale + offsetY]);
    const xs = corners.map((p) => p[0]), ys = corners.map((p) => p[1]);
    result = {
      corners,
      // ORIGINAL image px, always - detectCrease rescales this into its
      // own working-mat space itself rather than assuming a shared scale
      // (detectGoal's mat may now be a crop, detectCrease's never is).
      bbox: { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) },
    };
  }

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

  // Crop to the search window (in ORIGINAL image px) BEFORE detecting,
  // same fix as detectGoal and for the same reason: filtering contours
  // AFTER running on the whole photo only checked each contour's
  // CENTROID against the window, not its extent - a big white sponsor
  // banner (e.g. text merged into one blob by the MORPH_CLOSE below) can
  // have its centroid land inside the window while its actual corners
  // sprawl across most of the photo width. Cropping first makes that
  // impossible: there are no banner pixels left in the working mat.
  const gb = goalResult.bbox;
  const win = {
    x: Math.max(0, gb.x - gb.width * 1.2),
    y: Math.max(0, gb.y - gb.height * 0.3),
    w: gb.width * 3.4,
    h: gb.height * 3.5,
  };
  win.w = Math.min(win.w, image.width - win.x);
  win.h = Math.min(win.h, image.height - win.y);
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = Math.max(1, Math.round(win.w));
  cropCanvas.height = Math.max(1, Math.round(win.h));
  cropCanvas.getContext('2d').drawImage(
    image, win.x, win.y, win.w, win.h, 0, 0, cropCanvas.width, cropCanvas.height
  );

  const { mat: rgba, scale } = imageToMat(cv, cropCanvas);
  const rgb = new cv.Mat(), hsv = new cv.Mat();
  cv.cvtColor(rgba, rgb, cv.COLOR_RGBA2RGB);
  cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);

  const white = maskWhite(cv, hsv);

  // Goal bbox converted into this crop's own working-mat scale, for the
  // containment/area scoring below.
  const g = {
    x: (gb.x - win.x) * scale, y: (gb.y - win.y) * scale,
    width: gb.width * scale, height: gb.height * scale,
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
    corners = orderCorners(info.pts).map(([x, y]) => [x / scale + win.x, y / scale + win.y]);
    best.contour.delete();
  }

  hierarchy.delete(); contours.delete(); white.delete(); kernel.delete();
  rgb.delete(); hsv.delete(); rgba.delete();
  return corners ? { corners } : null;
}
