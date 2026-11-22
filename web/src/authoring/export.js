// Video / image export (A6). Capabilities are probed at export time, not
// at boot - browsers gain and lose codecs across versions, so a static
// check would go stale. The three sinks:
//
//   MP4  - WebCodecs VideoEncoder + mp4-muxer (vendored at
//          web/lib/mp4-muxer/, resolved via index.html's importmap).
//          Off-screen drive at max speed; playback isn't real-time-bounded
//          so long animations finish quickly.
//   WebM - canvas.captureStream() + MediaRecorder. Real-time; the
//          animation has to actually play back at wall-clock speed.
//   PNG  - Snapshot the current renderer output. No animation involved.
//
// The dialog (export-dialog.js) picks the best available format by
// default and lets the user override.

import * as THREE from 'three';
import { scene, renderer, camera, topDownCamera } from '../scene.js';
import { state, getBallWorldCenter } from '../state.js';
import { seekTo, playbackState, totalDuration } from './playback.js';
import { currentCaptionText } from './frame-caption.js';
import { wrapCaption, captionBox } from './frame-notes.js';
import { exportPlan } from './export-plan.js';
import { captionPauseOn } from './caption-hold.js';
import { ensureDoc } from './doc.js';
import { getFrames } from './frames.js';
import { cardContent } from '../lesson-cards.js';
import { updateGoalieZones } from '../goalie-zones-layer.js';
import { updateKataReadout } from '../kata-readout.js';
import { kataBoxLayout, kataDotColor, KATA_BOX_DIMS } from '../kata-box.js';
import { text } from '../i18n.js';

const WEBM_MIME = 'video/webm;codecs=vp9';

// H.264 profile+level string. Baseline profile (0x42) is universally
// playable; the level byte scales with resolution + fps. Numbers per
// ITU-T H.264 Annex A macroblocks-per-second math.
function h264CodecFor(width, height, fps) {
  const mbs = Math.ceil(width / 16) * Math.ceil(height / 16) * fps;
  // 3.1 = 108000 MB/s (up to 720p30), 3.2 = 216000, 4.0 = 245760,
  // 4.1 = 245760 (higher max bitrate), 4.2 = 522240 (up to 1080p60).
  let level = '1F';                           // 3.1
  if (mbs > 108000) level = '20';             // 3.2
  if (mbs > 216000) level = '28';             // 4.0
  if (mbs > 245760) level = '29';             // 4.1
  if (mbs > 245760 * 2) level = '2A';         // 4.2 (1080p60)
  if (mbs > 589824) level = '32';             // 5.0 (1440p60)
  return 'avc1.42E0' + level;
}

// --- capability probes ------------------------------------------------

export async function probeMp4() {
  if (typeof VideoEncoder === 'undefined') return false;
  try {
    // Probe a common 1080p60 combination since that's the default the
    // dialog offers - a probe that passes here also passes for smaller
    // resolutions we'd fall back to.
    const support = await VideoEncoder.isConfigSupported({
      codec: h264CodecFor(1920, 1080, 60),
      width: 1920, height: 1080, bitrate: 8_000_000, framerate: 60,
    });
    return !!support?.supported;
  } catch { return false; }
}

export function probeWebm() {
  return typeof MediaRecorder !== 'undefined'
      && typeof HTMLCanvasElement.prototype.captureStream === 'function'
      && MediaRecorder.isTypeSupported(WEBM_MIME);
}

// --- shared frame driver ---------------------------------------------

function bitrateFor(width, height, fps) {
  // Very loose "quality" heuristic - ~0.1 bit per pixel per second.
  return Math.round(width * height * fps * 0.1);
}

function saveRendererState() {
  state.directorForced = true;   // the export always uses a lesson's director camera, whatever the switch says (A-BACK-049)
  return {
    width: renderer.domElement.width,
    height: renderer.domElement.height,
    pixelRatio: renderer.getPixelRatio(),
    aspect: camera.aspect,
  };
}

function applyRendererSize(width, height, cam) {
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  if (cam.isPerspectiveCamera) {
    cam.aspect = width / height;
    cam.updateProjectionMatrix();
  }
}

function restoreRendererState(s) {
  state.directorForced = false;
  renderer.setPixelRatio(s.pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  if (camera.isPerspectiveCamera) {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
}

function pickCamera() {
  return state.activeCamera === topDownCamera ? topDownCamera : camera;
}

// --- frame note burn-in (A-BACK-035) ------------------------------------
// Every exported picture is the 3D frame plus the current frame note as a
// caption (currentCaptionText: the frame whose move is on screen). One 2D
// canvas is reused; without a note it is a plain copy of the 3D frame.

const composite = document.createElement('canvas');

function drawCaption(ctx, w, h, text) {   // returns the caption box, or null
  const fontPx = Math.max(14, Math.round(h * 0.035));
  ctx.font = `600 ${fontPx}px Archivo, Helvetica Neue, Arial, sans-serif`;
  const padX = Math.round(fontPx * 0.8);
  const lines = wrapCaption(text, w * 0.8 - 2 * padX, (s) => ctx.measureText(s).width);
  if (!lines.length) return null;
  const lineW = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const box = captionBox({ w, h }, { lines: lines.length, lineW, fontPx });
  ctx.fillStyle = 'rgba(13, 15, 18, 0.82)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(box.x, box.y, box.w, box.h, Math.round(fontPx * 0.4)); else ctx.rect(box.x, box.y, box.w, box.h);
  ctx.fill();
  ctx.fillStyle = '#f2f4f7';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((l, k) => ctx.fillText(l, w / 2, box.y + box.padY + box.lineH * (k + 0.5)));
  return box;
}

// A lesson's KATA card, compact, bottom-left of the picture (A-BACK-049):
// Placement, Depth, Axis with the same status dots as the Train card. The
// main loop does not tick during an export, so seekFrame() refreshes the
// readout first. Canvas drawing, not unit-testable (layout is: kata-box.js).
function drawKataBox(ctx, w, h, avoidTop) {
  const judged = state.kataReadout?.judged;
  if (!judged) return;
  const fontPx = Math.max(12, Math.round(h * 0.03));
  ctx.font = `600 ${fontPx}px Archivo, Helvetica Neue, Arial, sans-serif`;
  const labels = KATA_BOX_DIMS.map((d) => text(`goalie.kata.${d}`, state.lang).replace(/\s*\(.*\)$/, ''));
  const labelW = Math.max(...labels.map((l) => ctx.measureText(l).width));
  const L = kataBoxLayout({ w, h }, { fontPx, labelW, avoidTop });
  ctx.fillStyle = 'rgba(13, 15, 18, 0.82)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(L.x, L.y, L.w, L.h, Math.round(fontPx * 0.4)); else ctx.rect(L.x, L.y, L.w, L.h);
  ctx.fill();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  KATA_BOX_DIMS.forEach((d, k) => {
    const cy = L.y + L.padY + L.rowH * (k + 0.5);
    ctx.fillStyle = kataDotColor(judged.status[d]);
    ctx.beginPath();
    ctx.arc(L.x + L.padX + L.dot / 2, cy, L.dot / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2f4f7';
    ctx.fillText(labels[k], L.x + L.padX + L.dot + L.gap, cy);
  });
}

// seekTo plus what the main loop would have ticked for a lesson: the
// goalie zones and the KATA readout at this play time.
function seekFrame(ms) {
  seekTo(ms);
  if (ensureDoc().autoGoalie) {
    updateGoalieZones(getBallWorldCenter());
    updateKataReadout();
  }
}

// A lesson's title or recap card (A-BACK-049, lesson-cards.js) over the
// middle of the picture, as the Train stage shows it: title, task or bullets.
function drawCard(ctx, w, h, which) {
  const doc = ensureDoc();
  const c = cardContent(doc.lesson, which, state.lang);
  if (!c) return;
  if (!c.title && which === 'intro') c.title = doc.meta?.name ?? '';   // as the Train card (lesson-cards-ui.js)
  const fontPx = Math.max(14, Math.round(h * 0.034));
  const font = (weight, px) => `${weight} ${px}px Archivo, Helvetica Neue, Arial, sans-serif`;
  const measure = (s) => ctx.measureText(s).width;
  const boxW = Math.min(w * 0.62, fontPx * 30);
  const pad = Math.round(fontPx * 1.1);
  const inner = boxW - 2 * pad;
  const titlePx = Math.round(fontPx * 1.3);
  const lineH = Math.round(fontPx * 1.45);
  ctx.font = font(700, titlePx);
  const titleLines = wrapCaption(c.title, inner, measure, 2);
  ctx.font = font(400, fontPx);
  const textLines = c.text ? wrapCaption(c.text, inner, measure, 4) : [];
  const bulletLines = c.bullets.map((b) => wrapCaption(b, inner - fontPx * 1.2, measure, 3));
  const gap = Math.round(fontPx * 0.7);
  const bodyLines = textLines.length + bulletLines.reduce((n, l) => n + l.length, 0);
  const boxH = 2 * pad + titleLines.length * Math.round(titlePx * 1.3) + (bodyLines ? gap : 0) + bodyLines * lineH + Math.max(0, bulletLines.length - 1) * Math.round(gap / 2);
  const x = Math.round((w - boxW) / 2), y = Math.round((h - boxH) / 2);
  ctx.fillStyle = 'rgba(19, 23, 29, 0.92)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = Math.max(1, Math.round(fontPx / 14));
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, boxW, boxH, Math.round(fontPx * 0.5)); else ctx.rect(x, y, boxW, boxH);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#f2f4f7';
  let cy = y + pad;
  ctx.font = font(700, titlePx);
  for (const l of titleLines) { ctx.fillText(l, x + pad, cy); cy += Math.round(titlePx * 1.3); }
  if (bodyLines) cy += gap;
  ctx.font = font(400, fontPx);
  for (const l of textLines) { ctx.fillText(l, x + pad, cy); cy += lineH; }
  bulletLines.forEach((lines, k) => {
    if (k) cy += Math.round(gap / 2);
    ctx.fillText('•', x + pad, cy);
    for (const l of lines) { ctx.fillText(l, x + pad + fontPx * 1.2, cy); cy += lineH; }
  });
}

// The 3D canvas as rendered just now, with the caption burned in, or a
// lesson card instead of the caption on the plan's card frames.
function composeFrame(card = null) {
  const gl = renderer.domElement;
  if (composite.width !== gl.width || composite.height !== gl.height) {
    composite.width = gl.width;
    composite.height = gl.height;
  }
  const ctx = composite.getContext('2d');
  ctx.clearRect(0, 0, composite.width, composite.height);
  ctx.drawImage(gl, 0, 0);
  if (card) { drawCard(ctx, composite.width, composite.height, card); return composite; }
  const note = currentCaptionText();
  const box = note ? drawCaption(ctx, composite.width, composite.height, note) : null;
  if (ensureDoc().autoGoalie) drawKataBox(ctx, composite.width, composite.height, box ? box.y : null);
  return composite;
}

// What each video frame shows (export-plan.js): holds on captions when the
// Hold switch is on for this play (lessons by default), the lesson's cards.
export function planFor(fps, startMs, endMs) {
  const doc = ensureDoc();
  return exportPlan({ frames: getFrames(), lang: state.lang, fps, startMs, endMs, holds: captionPauseOn(state.captionPause, doc), lesson: doc.lesson });
}

// --- MP4 (WebCodecs + mp4-muxer) -------------------------------------

export async function exportMp4({ width, height, fps, startMs = 0, endMs, onProgress, isCancelled }) {
  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
  const cam = pickCamera();
  const savedRenderer = saveRendererState();
  applyRendererSize(width, height, cam);

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width, height, frameRate: fps },
    fastStart: 'in-memory',
  });
  let encoderError = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { encoderError = e; console.error('VideoEncoder error', e); },
  });
  const codec = h264CodecFor(width, height, fps);
  encoder.configure({
    codec, width, height, bitrate: bitrateFor(width, height, fps), framerate: fps,
  });

  const plan = planFor(fps, startMs, endMs);
  const totalFrames = plan.length;
  const frameDurationUs = Math.round(1_000_000 / fps);

  for (let i = 0; i < totalFrames; i++) {
    if (isCancelled?.()) break;
    if (encoderError) {
      restoreRendererState(savedRenderer);
      try { encoder.close(); } catch {}
      throw encoderError;
    }
    seekFrame(plan[i].playMs);
    renderer.render(scene, cam);
    const bitmap = await createImageBitmap(composeFrame(plan[i].card));   // with the frame note (A-BACK-035) or a lesson card
    const frame = new VideoFrame(bitmap, {
      timestamp: i * frameDurationUs,
      duration: frameDurationUs,
    });
    encoder.encode(frame, { keyFrame: i % Math.max(1, fps) === 0 });
    frame.close();
    bitmap.close();
    if (encoder.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 0));
    onProgress?.(i / totalFrames);
  }
  if (encoderError) {
    restoreRendererState(savedRenderer);
    try { encoder.close(); } catch {}
    throw encoderError;
  }
  await encoder.flush();
  muxer.finalize();
  const buffer = muxer.target.buffer;
  encoder.close();
  restoreRendererState(savedRenderer);
  return new Blob([buffer], { type: 'video/mp4' });
}

// --- WebM (MediaRecorder + captureStream) ----------------------------

export function exportWebm({ fps, startMs = 0, endMs, onProgress, isCancelled }) {
  return new Promise((resolve, reject) => {
    const cam = pickCamera();
    const savedRenderer = saveRendererState();
    composeFrame();   // sizes the composite before the stream starts
    const stream = composite.captureStream(fps);   // with the frame note (A-BACK-035)
    const chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType: WEBM_MIME, videoBitsPerSecond: bitrateFor(renderer.domElement.width, renderer.domElement.height, fps) });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      restoreRendererState(savedRenderer);
      resolve(new Blob(chunks, { type: 'video/webm' }));
    };
    recorder.onerror = (e) => { restoreRendererState(savedRenderer); reject(e); };
    recorder.start();

    // Real-time driver - MediaRecorder samples the canvas at the stream's
    // fps, so we advance elapsed by wall-clock time and let the recorder
    // pick up whatever we've rendered on each rAF.
    // The plan (export-plan.js) is walked by wall-clock time: frame i is due
    // at i / fps seconds.
    const plan = planFor(fps, startMs, endMs);
    const startWall = performance.now();
    function tick() {
      if (isCancelled?.()) { recorder.stop(); return; }
      const i = Math.floor((performance.now() - startWall) * fps / 1000);
      if (i >= plan.length) {
        const last = plan.at(-1) ?? { playMs: endMs, card: null };
        seekFrame(last.playMs);
        renderer.render(scene, cam);
        composeFrame(last.card);
        setTimeout(() => recorder.stop(), 100);   // drain the stream
        onProgress?.(1);
        return;
      }
      seekFrame(plan[i].playMs);
      renderer.render(scene, cam);
      composeFrame(plan[i].card);
      onProgress?.(i / plan.length);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

// --- PNG (current frame) ---------------------------------------------

export function exportPng({ width, height } = {}) {
  const cam = pickCamera();
  const savedRenderer = saveRendererState();
  if (width && height) applyRendererSize(width, height, cam);
  renderer.render(scene, cam);
  const dataUrl = composeFrame().toDataURL('image/png');   // with the frame note (A-BACK-035)
  restoreRendererState(savedRenderer);
  return dataUrl;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function totalDurationMs() { return totalDuration(); }
