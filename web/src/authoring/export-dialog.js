// Export dialog (A6). Modal with format / resolution / fps / range,
// progress bar and cancel. Detects codec support at open time so the
// dropdown never offers a format that will fail on encode.

import { probeMp4, probeWebm, exportMp4, exportWebm, exportPng, downloadBlob, totalDurationMs } from './export.js';
import { installFocusTrap } from '../focus-trap.js';

const overlay = document.createElement('div');
overlay.id = 'exportOverlay';
overlay.setAttribute('role', 'dialog');
overlay.setAttribute('aria-modal', 'true');
overlay.setAttribute('aria-label', 'Export animation');
overlay.style.cssText = `
  position:fixed; inset:0; z-index:30;
  background:rgba(0,0,0,0.55); display:none;
  align-items:center; justify-content:center;
  font-family:'Consolas','Courier New',monospace;
`;
overlay.innerHTML = `
  <div style="min-width:380px; max-width:92vw; background:rgba(20,16,10,0.96);
              border:1px solid rgba(255,179,71,0.5); border-radius:12px;
              padding:18px 22px; color:#f7e6cf;
              box-shadow:0 12px 32px rgba(0,0,0,0.5);">
    <div style="font-size:14px; letter-spacing:0.06em; text-transform:uppercase;
                margin-bottom:14px; color:#ffb347;">Export animation</div>
    <div class="ex-row"><label>Format</label><select data-x="format"></select></div>
    <div class="ex-row"><label>Resolution</label><select data-x="res">
      <option value="1280x720">720p (1280&times;720)</option>
      <option value="1920x1080" selected>1080p (1920&times;1080)</option>
      <option value="2560x1440">1440p (2560&times;1440)</option>
    </select></div>
    <div class="ex-row"><label>FPS</label><select data-x="fps">
      <option value="30">30</option>
      <option value="60" selected>60</option>
    </select></div>
    <div class="ex-row"><label>Range</label><select data-x="range">
      <option value="all" selected>Whole animation</option>
      <option value="current">Current frame only (PNG)</option>
    </select></div>
    <div class="ex-msg" style="min-height:16px; margin-top:6px; font-size:11px; color:#f7e6cf; opacity:0.7;"></div>
    <div class="ex-progress" style="display:none; margin-top:12px;">
      <div style="height:6px; background:rgba(255,179,71,0.15); border-radius:3px; overflow:hidden;">
        <div class="ex-bar" style="height:100%; width:0%; background:#ffb347; transition:width 60ms linear;"></div>
      </div>
      <div class="ex-pct" style="font-size:11px; margin-top:4px; opacity:0.75;">0%</div>
    </div>
    <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:16px;">
      <button data-x="cancel" style="background:transparent; color:#f7e6cf; border:1px solid rgba(255,179,71,0.35); padding:6px 14px; border-radius:6px; font-family:inherit; cursor:pointer;">Cancel</button>
      <button data-x="go" style="background:#ffb347; color:#1a120a; border:none; padding:6px 16px; border-radius:6px; font-family:inherit; font-weight:700; cursor:pointer;">Export</button>
    </div>
  </div>
`;
document.body.appendChild(overlay);

// tiny row styling injected once
const css = document.createElement('style');
css.textContent = `
  #exportOverlay .ex-row { display:flex; align-items:center; gap:10px; margin:6px 0; }
  #exportOverlay .ex-row label { flex:0 0 92px; font-size:11px; text-transform:uppercase; letter-spacing:0.05em; opacity:0.75; }
  #exportOverlay select { flex:1; background:rgba(0,0,0,0.35); color:#f7e6cf; border:1px solid rgba(255,179,71,0.35); border-radius:5px; padding:4px 6px; font-family:inherit; font-size:12px; }
  #exportOverlay button:hover { filter:brightness(1.1); }
  #exportOverlay button[disabled] { opacity:0.5; cursor:not-allowed; }
`;
document.head.appendChild(css);

const formatSel = overlay.querySelector('[data-x="format"]');
const resSel = overlay.querySelector('[data-x="res"]');
const fpsSel = overlay.querySelector('[data-x="fps"]');
const rangeSel = overlay.querySelector('[data-x="range"]');
const goBtn = overlay.querySelector('[data-x="go"]');
const cancelBtn = overlay.querySelector('[data-x="cancel"]');
const msgEl = overlay.querySelector('.ex-msg');
const progWrap = overlay.querySelector('.ex-progress');
const barEl = overlay.querySelector('.ex-bar');
const pctEl = overlay.querySelector('.ex-pct');

let cancelled = false;
let running = false;
let releaseTrap = null;

async function refreshFormats() {
  formatSel.innerHTML = '';
  const options = [];
  if (await probeMp4()) options.push({ v: 'mp4', label: 'MP4 (H.264)' });
  if (probeWebm()) options.push({ v: 'webm', label: 'WebM (VP9)' });
  options.push({ v: 'png', label: 'PNG (still image)' });
  for (const o of options) {
    const opt = document.createElement('option');
    opt.value = o.v; opt.textContent = o.label;
    formatSel.appendChild(opt);
  }
}

export async function openExportDialog() {
  cancelled = false;
  running = false;
  progWrap.style.display = 'none';
  msgEl.textContent = '';
  goBtn.disabled = true;
  overlay.style.display = 'flex';
  releaseTrap = installFocusTrap(overlay, {
    onEscape: () => { if (!running) closeDialog(); },
  });
  await refreshFormats();
  goBtn.disabled = false;
  const total = totalDurationMs();
  msgEl.textContent = total < 50 ? 'no keyframes to animate yet - PNG only'
    : `animation length ${(total / 1000).toFixed(1)} s`;
}

function closeDialog() {
  overlay.style.display = 'none';
  releaseTrap?.();
  releaseTrap = null;
}

cancelBtn.addEventListener('click', () => {
  if (running) { cancelled = true; msgEl.textContent = 'cancelling...'; return; }
  closeDialog();
});

goBtn.addEventListener('click', async () => {
  if (running) return;
  running = true;
  cancelled = false;
  goBtn.disabled = true;
  const [w, h] = resSel.value.split('x').map(Number);
  const fps = +fpsSel.value;
  const format = formatSel.value;
  const range = rangeSel.value;

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  progWrap.style.display = 'block';
  barEl.style.width = '0%'; pctEl.textContent = '0%';
  const onProgress = (p) => { const pct = Math.round(p * 100); barEl.style.width = pct + '%'; pctEl.textContent = pct + '%'; };
  const isCancelled = () => cancelled;

  try {
    if (format === 'png' || range === 'current') {
      const dataUrl = exportPng({ width: w, height: h });
      const a = document.createElement('a');
      a.href = dataUrl; a.download = `floorball-${stamp}.png`; a.click();
      msgEl.textContent = 'saved';
    } else if (format === 'mp4') {
      const endMs = totalDurationMs();
      if (endMs < 50) { msgEl.textContent = 'no animation to export - add frames first'; return; }
      msgEl.textContent = 'encoding...';
      const blob = await exportMp4({ width: w, height: h, fps, startMs: 0, endMs, onProgress, isCancelled });
      if (!cancelled) { downloadBlob(blob, `floorball-${stamp}.mp4`); msgEl.textContent = `saved (${(blob.size / 1024 / 1024).toFixed(1)} MB)`; }
      else msgEl.textContent = 'cancelled';
    } else if (format === 'webm') {
      const endMs = totalDurationMs();
      if (endMs < 50) { msgEl.textContent = 'no animation to export - add frames first'; return; }
      msgEl.textContent = 'recording (real-time)...';
      const blob = await exportWebm({ fps, startMs: 0, endMs, onProgress, isCancelled });
      if (!cancelled) { downloadBlob(blob, `floorball-${stamp}.webm`); msgEl.textContent = `saved (${(blob.size / 1024 / 1024).toFixed(1)} MB)`; }
      else msgEl.textContent = 'cancelled';
    }
  } catch (e) {
    console.error(e);
    msgEl.textContent = 'export failed: ' + (e?.message || e);
  } finally {
    running = false;
    goBtn.disabled = false;
  }
});
