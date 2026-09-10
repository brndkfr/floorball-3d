// Runs YOLOv8n-Pose keypoint detection on a photo via ONNX Runtime Web,
// mirroring detect-players.js. Phase 4 (docs/plan.md 4.5) - seeds
// player.facingDeg from shoulder + nose keypoints. Manual overrides from
// Phase 3.5 still win.
// Vendored files (not fetchable at runtime without them present):
//   web/lib/onnxruntime-web/{ort.min.js, ort-wasm-simd-threaded.mjs, .wasm}
//   web/lib/models/yolov8n-pose.onnx
const ORT_SCRIPT_URL = 'lib/onnxruntime-web/ort.min.js';
const MODEL_URL = 'lib/models/yolov8n-pose.onnx';
const INPUT_SIZE = 640;
const IOU_THRESHOLD = 0.5;
const MAX_BOXES = 20;

// COCO 17-keypoint order (YOLOv8-pose default). Indices reused below.
export const KP_NOSE = 0;
export const KP_LEFT_SHOULDER = 5;
export const KP_RIGHT_SHOULDER = 6;
export const KP_LEFT_HIP = 11;
export const KP_RIGHT_HIP = 12;

function debugLog(event, data) {
  console.log(`[detect-pose] ${event}`, data);
  const log = (window.__photoOverlayDebugLog ??= []);
  log.push({ t: Date.now(), event, data });
  if (log.length > 200) log.shift();
}

let ortReadyPromise = null;

function loadOrt() {
  if (ortReadyPromise) return ortReadyPromise;
  ortReadyPromise = new Promise((resolve, reject) => {
    if (window.ort && window.ort.InferenceSession) { resolve(window.ort); return; }
    const script = document.createElement('script');
    script.src = ORT_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      const ort = window.ort;
      if (!ort || !ort.InferenceSession) { reject(new Error('window.ort not available after loading ort.min.js')); return; }
      ort.env.wasm.wasmPaths = new URL('../../../lib/onnxruntime-web/', import.meta.url).toString();
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.simd = true;
      resolve(ort);
    };
    script.onerror = () => reject(new Error(`${ORT_SCRIPT_URL} not found`));
    document.head.appendChild(script);
  });
  return ortReadyPromise;
}

let sessionPromise = null;

function loadSession() {
  if (!sessionPromise) {
    sessionPromise = loadOrt().then((ort) => ort.InferenceSession.create(MODEL_URL));
  }
  return sessionPromise;
}

function letterbox(image, targetSize) {
  const iw = image.naturalWidth || image.width;
  const ih = image.naturalHeight || image.height;
  const scale = Math.min(targetSize / iw, targetSize / ih);
  const nw = Math.round(iw * scale);
  const nh = Math.round(ih * scale);
  const padX = Math.floor((targetSize - nw) / 2);
  const padY = Math.floor((targetSize - nh) / 2);
  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgb(114,114,114)';
  ctx.fillRect(0, 0, targetSize, targetSize);
  ctx.drawImage(image, 0, 0, iw, ih, padX, padY, nw, nh);
  return { canvas, scale, padX, padY, iw, ih };
}

function toNCHW(canvas) {
  const { width, height } = canvas;
  const { data } = canvas.getContext('2d').getImageData(0, 0, width, height);
  const size = width * height;
  const out = new Float32Array(3 * size);
  for (let i = 0; i < size; i++) {
    out[i] = data[i * 4] / 255;
    out[size + i] = data[i * 4 + 1] / 255;
    out[2 * size + i] = data[i * 4 + 2] / 255;
  }
  return out;
}

// YOLOv8-pose output shape: [1, 56, N] where N is the anchor count (8400
// for 640-input). 56 channels = 4 bbox (cx,cy,w,h in 640-space) + 1 person
// confidence + 17 * 3 keypoints (x, y, conf per keypoint, also in 640-space).
function decodeOutput(output, scoreThreshold) {
  const data = output.data;
  const numAnchors = output.dims[2];
  const numChannels = output.dims[1]; // 56
  const numKeypoints = (numChannels - 5) / 3; // 17
  const confRowOffset = 4 * numAnchors;
  const boxes = [];
  for (let j = 0; j < numAnchors; j++) {
    const score = data[confRowOffset + j];
    if (score <= scoreThreshold) continue;
    const cx = data[j];
    const cy = data[numAnchors + j];
    const w = data[2 * numAnchors + j];
    const h = data[3 * numAnchors + j];
    const kps = new Float32Array(numKeypoints * 3);
    for (let k = 0; k < numKeypoints; k++) {
      const base = (5 + k * 3) * numAnchors;
      kps[k * 3] = data[base + j];
      kps[k * 3 + 1] = data[base + numAnchors + j];
      kps[k * 3 + 2] = data[base + 2 * numAnchors + j];
    }
    boxes.push({ cx, cy, w, h, score, kps });
  }
  return boxes;
}

function iou(a, b) {
  const ax2 = a.x + a.w, ay2 = a.y + a.h;
  const bx2 = b.x + b.w, by2 = b.y + b.h;
  const ix1 = Math.max(a.x, b.x), iy1 = Math.max(a.y, b.y);
  const ix2 = Math.min(ax2, bx2), iy2 = Math.min(ay2, by2);
  const iw = Math.max(0, ix2 - ix1), ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  if (inter <= 0) return 0;
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

function nms(boxes, iouThreshold, maxBoxes) {
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const kept = [];
  for (const box of sorted) {
    if (kept.length >= maxBoxes) break;
    if (kept.every((k) => iou(k, box) <= iouThreshold)) kept.push(box);
  }
  return kept;
}

// image is an HTMLImageElement or canvas. Returns
// [{ bbox: [x, y, w, h], score, keypoints: [{x, y, conf}, ...] }] in
// original image px. Keypoint order matches COCO (17 kps).
export async function detectPose(image, { scoreThreshold = 0.35, roi = null, marginFrac = 1 } = {}) {
  const t0 = performance.now();
  const ort = await loadOrt();
  const session = await loadSession();
  const tLoaded = performance.now();

  let srcImage = image, offsetX = 0, offsetY = 0;
  if (roi) {
    const marginX = roi.w * marginFrac, marginY = roi.h * marginFrac;
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

  const { canvas, scale, padX, padY, iw, ih } = letterbox(srcImage, INPUT_SIZE);
  const nchw = toNCHW(canvas);
  const tensor = new ort.Tensor('float32', nchw, [1, 3, INPUT_SIZE, INPUT_SIZE]);

  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];
  const results = await session.run({ [inputName]: tensor });
  const tInferred = performance.now();

  const rawBoxes = decodeOutput(results[outputName], scoreThreshold);

  const scaledBoxes = rawBoxes.map(({ cx, cy, w, h, score, kps }) => {
    const x = (cx - w / 2 - padX) / scale;
    const y = (cy - h / 2 - padY) / scale;
    const bw = w / scale;
    const bh = h / scale;
    const x0 = Math.max(0, x), y0 = Math.max(0, y);
    const x1 = Math.min(iw, x + bw), y1 = Math.min(ih, y + bh);
    const keypoints = [];
    for (let k = 0; k < kps.length / 3; k++) {
      keypoints.push({
        x: (kps[k * 3] - padX) / scale + offsetX,
        y: (kps[k * 3 + 1] - padY) / scale + offsetY,
        conf: kps[k * 3 + 2],
      });
    }
    return {
      x: x0 + offsetX,
      y: y0 + offsetY,
      w: Math.max(0, x1 - x0),
      h: Math.max(0, y1 - y0),
      score,
      keypoints,
    };
  });

  const kept = nms(scaledBoxes, IOU_THRESHOLD, MAX_BOXES);
  const detections = kept.map(({ x, y, w, h, score, keypoints }) => ({
    bbox: [x, y, w, h], score, keypoints,
  }));

  debugLog('detectPose', {
    imageWH: [iw, ih],
    roi,
    rawBoxCount: rawBoxes.length,
    keptBoxCount: detections.length,
    loadMs: Math.round(tLoaded - t0),
    inferenceMs: Math.round(tInferred - tLoaded),
    totalMs: Math.round(performance.now() - t0),
  });

  return detections;
}

// Runs one pose inference per player bbox at max effective resolution
// (crops to bbox + margin before the 640x640 letterbox, so each player
// fills the input tensor). Returns a Map of playerId -> detection (with
// keypoints in ORIGINAL image px, not crop-local). This is the standard
// top-down pose pattern and vastly outperforms a single whole-image pass
// on wide photos with many small people.
export async function detectPoseInBoxes(image, players, { marginFrac = 0.3 } = {}) {
  const map = new Map();
  const t0 = performance.now();
  for (const p of players) {
    if (!p.bbox) continue;
    const [x, y, w, h] = p.bbox;
    // eslint-disable-next-line no-await-in-loop -- ORT WASM is single-threaded, no benefit to Promise.all here
    const dets = await detectPose(image, { scoreThreshold: 0.2, roi: { x, y, w, h }, marginFrac });
    if (!dets.length) continue;
    // Pick the detection whose bbox is closest to the requested one - the
    // pose model may find multiple people in the padded crop (opponents,
    // teammates leaning in) but the intended player usually occupies the
    // largest / most-central bbox.
    const cx = x + w / 2, cy = y + h / 2;
    let best = null, bestScore = -Infinity;
    for (const d of dets) {
      const [dx, dy, dw, dh] = d.bbox;
      const dcx = dx + dw / 2, dcy = dy + dh / 2;
      const dist = Math.hypot(dcx - cx, dcy - cy);
      const areaOverlap = Math.min(dw * dh, w * h) / Math.max(dw * dh, w * h);
      const score = d.score + areaOverlap - dist / Math.max(w, h);
      if (score > bestScore) { bestScore = score; best = d; }
    }
    if (best) map.set(p.id, best);
  }
  debugLog('detectPoseInBoxes', {
    playerCount: players.length,
    matchedCount: map.size,
    totalMs: Math.round(performance.now() - t0),
  });
  return map;
}

// Match pose detections to existing player bboxes by IoU. Returns a Map of
// playerId -> detection (best match). Bboxes with no match above minIou
// are omitted.
export function matchPoseToPlayers(detections, players, { minIou = 0.3 } = {}) {
  const matches = new Map();
  for (const p of players) {
    if (!p.bbox) continue;
    const [x, y, w, h] = p.bbox;
    let best = null, bestScore = 0;
    for (const d of detections) {
      const [dx, dy, dw, dh] = d.bbox;
      const overlap = iou({ x, y, w, h }, { x: dx, y: dy, w: dw, h: dh });
      if (overlap > bestScore) { bestScore = overlap; best = d; }
    }
    if (best && bestScore >= minIou) matches.set(p.id, best);
  }
  return matches;
}
