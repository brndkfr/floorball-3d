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
import { state } from '../state.js';
import { seekTo, playbackState, totalDuration } from './playback.js';

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

  const totalMs = endMs - startMs;
  const totalFrames = Math.max(1, Math.floor(totalMs * fps / 1000));
  const frameDurationUs = Math.round(1_000_000 / fps);

  for (let i = 0; i < totalFrames; i++) {
    if (isCancelled?.()) break;
    if (encoderError) {
      restoreRendererState(savedRenderer);
      try { encoder.close(); } catch {}
      throw encoderError;
    }
    const elapsed = startMs + (i * 1000 / fps);
    seekTo(elapsed);
    renderer.render(scene, cam);
    const bitmap = await createImageBitmap(renderer.domElement);
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
    const stream = renderer.domElement.captureStream(fps);
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
    const totalMs = endMs - startMs;
    const startWall = performance.now();
    function tick() {
      if (isCancelled?.()) { recorder.stop(); return; }
      const now = performance.now();
      const elapsed = startMs + (now - startWall);
      if (elapsed >= endMs) {
        seekTo(endMs);
        renderer.render(scene, cam);
        setTimeout(() => recorder.stop(), 100);   // drain the stream
        onProgress?.(1);
        return;
      }
      seekTo(elapsed);
      renderer.render(scene, cam);
      onProgress?.((elapsed - startMs) / totalMs);
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
  const dataUrl = renderer.domElement.toDataURL('image/png');
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
