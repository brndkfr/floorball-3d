// Rough body-silhouette outline for one detected player via GrabCut,
// seeded with its YOLO bounding box. Deliberately on-demand (called once
// per selection from photo-overlay.js, not for every detected player) -
// grabCut is iterative and not cheap enough to run automatically for a
// whole roster of detections.
import { loadOpenCV } from './pnp.js';

const CROP_MARGIN_FRAC = 0.25; // extra border around bbox so grabCut has background to learn from
const GRABCUT_ITER = 5;

// bbox is [x, y, w, h] in ORIGINAL image px (detect-players.js's format).
// Returns [[x,y], ...] (closed polygon, ORIGINAL image px) or null if the
// segmentation didn't converge on anything plausible (too small/too big
// relative to the crop - grabCut failing to separate fg/bg on a cluttered
// background looks like one of those two failure modes).
export async function segmentPlayer(image, bbox) {
  const cv = await loadOpenCV();
  const [bx, by, bw, bh] = bbox;
  const marginX = bw * CROP_MARGIN_FRAC, marginY = bh * CROP_MARGIN_FRAC;
  const offsetX = Math.max(0, bx - marginX);
  const offsetY = Math.max(0, by - marginY);
  const cropW = Math.min(image.width - offsetX, bw + marginX * 2);
  const cropH = Math.min(image.height - offsetY, bh + marginY * 2);
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = Math.max(1, Math.round(cropW));
  cropCanvas.height = Math.max(1, Math.round(cropH));
  cropCanvas.getContext('2d').drawImage(
    image, offsetX, offsetY, cropW, cropH, 0, 0, cropCanvas.width, cropCanvas.height
  );

  const rgba = cv.imread(cropCanvas);
  const rgb = new cv.Mat();
  cv.cvtColor(rgba, rgb, cv.COLOR_RGBA2RGB);
  rgba.delete();

  const bgdModel = new cv.Mat();
  const fgdModel = new cv.Mat();
  // rect is the bbox re-expressed in CROP-local coordinates (it's inset by
  // the margin added around it above).
  const rect = new cv.Rect({
    x: Math.round(bx - offsetX),
    y: Math.round(by - offsetY),
    width: Math.round(Math.min(bw, cropCanvas.width - (bx - offsetX))),
    height: Math.round(Math.min(bh, cropCanvas.height - (by - offsetY))),
  });

  // GC_INIT_WITH_RECT lets grabCut freely decide fg/bg from color alone -
  // on a player wearing mostly light/white gear against white ice, only
  // the highest-contrast sub-region (typically the dark helmet/visor)
  // survives as "foreground", discarding the rest of the body entirely
  // (verified: outline landed on just the helmet, confirmed by an
  // annotated crop screenshot). Seed with GC_INIT_WITH_MASK instead: a
  // strong "the whole bbox IS probably the player" prior (soft, not
  // locked - iterations can still refine it), rather than letting
  // grabCut's own rect-mode shrink logic decide from scratch.
  const mask = new cv.Mat(rgb.rows, rgb.cols, cv.CV_8UC1, new cv.Scalar(cv.GC_PR_BGD));
  cv.rectangle(mask, new cv.Point(rect.x, rect.y), new cv.Point(rect.x + rect.width, rect.y + rect.height), new cv.Scalar(cv.GC_PR_FGD), -1);

  let outline = null;
  try {
    cv.grabCut(rgb, mask, rect, bgdModel, fgdModel, GRABCUT_ITER, cv.GC_INIT_WITH_MASK);

    // mask values: 0=GC_BGD, 1=GC_FGD, 2=GC_PR_BGD, 3=GC_PR_FGD - both FGD
    // and "probable" FGD count as foreground for our purposes.
    const bin = new cv.Mat(mask.rows, mask.cols, cv.CV_8UC1);
    const src = mask.data, dst = bin.data;
    for (let i = 0; i < src.length; i++) dst[i] = (src[i] === 1 || src[i] === 3) ? 255 : 0;

    const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5));
    cv.morphologyEx(bin, bin, cv.MORPH_CLOSE, kernel);
    kernel.delete();

    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(bin, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    hierarchy.delete();
    bin.delete();

    let best = null, bestArea = 0;
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      const area = cv.contourArea(c);
      if (area > bestArea) { if (best) best.delete(); bestArea = area; best = c; }
      else c.delete();
    }
    contours.delete();

    const cropArea = rgb.rows * rgb.cols;
    if (best && bestArea > cropArea * 0.03 && bestArea < cropArea * 0.9) {
      const approx = new cv.Mat();
      const peri = cv.arcLength(best, true);
      cv.approxPolyDP(best, approx, Math.max(1, peri * 0.01), true);
      const pts = approx.data32S;
      outline = [];
      for (let i = 0; i < pts.length; i += 2) {
        outline.push([pts[i] + offsetX, pts[i + 1] + offsetY]);
      }
      approx.delete();
    }
    if (best) best.delete();
  } finally {
    rgb.delete(); mask.delete(); bgdModel.delete(); fgdModel.delete();
  }
  return outline;
}
