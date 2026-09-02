// Runs YOLOv8n person detection on a photo via ONNX Runtime Web (WASM,
// self-hosted - no CDN at runtime). See docs/phase-2-plan.md T1.
// Vendored files (not fetchable at runtime without them present):
//   web/lib/onnxruntime-web/{ort.min.js, ort-wasm-simd-threaded.jsep.{mjs,wasm}}
//   web/lib/models/yolov8n.onnx
const ORT_SCRIPT_URL = 'lib/onnxruntime-web/ort.min.js';
const MODEL_URL = 'lib/models/yolov8n.onnx';
const INPUT_SIZE = 640;
const PERSON_CLASS_INDEX = 0;
const IOU_THRESHOLD = 0.5;
const MAX_BOXES = 20;

function debugLog(event, data) {
  console.log(`[detect-players] ${event}`, data);
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
      // Self-hosted WASM runtime - must be set before the first session is created.
      ort.env.wasm.wasmPaths = new URL('../../../lib/onnxruntime-web/', import.meta.url).toString();
      ort.env.wasm.numThreads = 1; // no cross-origin isolation on static Pages
      ort.env.wasm.simd = true;
      resolve(ort);
    };
    script.onerror = () => reject(new Error(`${ORT_SCRIPT_URL} not found - see docs/phase-2-plan.md §3.1`));
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

// Scales+pads image onto a square grey canvas; returns the canvas plus the
// transform needed to map 640-space boxes back to original image px.
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

// Canvas RGBA (interleaved, row-major) -> NCHW float32 in [0,1].
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

// output0 is [1,84,8400] flattened row-major: 4 box channels + 80 class
// channels, each a row of 8400 values. Returns raw boxes in 640-space.
function decodeOutput(output, scoreThreshold) {
  const data = output.data;
  const numAnchors = output.dims[2];
  const numChannels = output.dims[1];
  const personRowOffset = (4 + PERSON_CLASS_INDEX) * numAnchors;
  const boxes = [];
  for (let j = 0; j < numAnchors; j++) {
    const score = data[personRowOffset + j];
    if (score <= scoreThreshold) continue;
    const cx = data[j];
    const cy = data[numAnchors + j];
    const w = data[2 * numAnchors + j];
    const h = data[3 * numAnchors + j];
    boxes.push({ cx, cy, w, h, score });
  }
  return { boxes, numChannels };
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

// image is an HTMLImageElement (or canvas/bitmap ort can draw from).
// Optional roi ({x,y,w,h} in ORIGINAL image px) crops to that area (plus a
// margin) BEFORE the 640x640 letterbox resize, same idea as detect.js's
// detectGoal ROI crop: a wide/tall photo squeezes distant, small players
// down to a handful of px once downscaled whole, which yolov8n-nano simply
// can't see. Cropping first keeps them at a much higher effective
// resolution. marginFrac expands the roi by that fraction of its own
// width/height on EACH side (so 1 = roi tripled), since players stand
// around/in front of the goal, not just on the clicked landmark points.
// Returns [{ bbox: [x, y, w, h], score }] in original image px.
export async function detectPlayers(image, { scoreThreshold = 0.35, roi = null, marginFrac = 1 } = {}) {
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

  const { boxes: rawBoxes } = decodeOutput(results[outputName], scoreThreshold);

  // Undo letterbox: 640-space (cx,cy,w,h) -> cropped-image px, then add the
  // crop offset back to get ORIGINAL (un-cropped) image px.
  const scaledBoxes = rawBoxes.map(({ cx, cy, w, h, score }) => {
    const x = (cx - w / 2 - padX) / scale;
    const y = (cy - h / 2 - padY) / scale;
    const bw = w / scale;
    const bh = h / scale;
    const x0 = Math.max(0, x), y0 = Math.max(0, y);
    const x1 = Math.min(iw, x + bw), y1 = Math.min(ih, y + bh);
    return { x: x0 + offsetX, y: y0 + offsetY, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0), score };
  });

  const kept = nms(scaledBoxes, IOU_THRESHOLD, MAX_BOXES);
  const boxes = kept.map(({ x, y, w, h, score }) => ({ bbox: [x, y, w, h], score }));

  debugLog('detectPlayers', {
    imageWH: [iw, ih],
    roi,
    rawBoxCount: rawBoxes.length,
    keptBoxCount: boxes.length,
    loadMs: Math.round(tLoaded - t0),
    inferenceMs: Math.round(tInferred - tLoaded),
    totalMs: Math.round(performance.now() - t0),
  });

  return boxes;
}
