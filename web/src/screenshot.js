// Screenshot, whole app (S-BACK-032): a PNG of the visible stage in any
// mode. The 3D view is rendered once on demand (no preserveDrawingBuffer:
// render and copy in the same task), the Analyze photo canvas is drawn when
// it shows, and the HTML labels over the rink (zone tags, the Train hint
// pill, the shot verdict chip) are painted on top from the page itself, so
// the picture matches the screen. Floating cards and the app chrome are
// not in it. screenshot-math.js holds the pure parts; ui/screenshot-menu.js
// the button, the menu and P. Also the core of the MCP screenshot tool
// (S-BACK-034).

import { renderer, scene } from './scene.js';
import { state } from './state.js';
import { stageCrop, applyTextTransform, shotFileName } from './screenshot-math.js';

// Labels over the rink that belong in the picture.
const OVERLAYS = ['#zoneLabels .zl-tag', '#trainHint', '#goalieLabel'];
// Bars at the bottom of the stage (Plan recorder, Present bar).
const BOTTOM_BARS = ['#timeline', '#dock', '#presentBar'];

const shown = (el) => !!el && (el.checkVisibility
  ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
  : el.offsetParent !== null);
const rectOf = (el) => {
  if (!shown(el)) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};
const $ = (sel) => document.querySelector(sel);

export function currentStageCrop() {
  const vh = window.innerHeight;
  return stageCrop({
    vw: window.innerWidth,
    vh,
    rail: rectOf($('#appRail')),
    topbar: rectOf($('#appTopbar')),
    panels: ['#rightPanel', '#photoPanel', '#panelStrip'].map((s) => rectOf($(s))),
    bars: BOTTOM_BARS.map((s) => rectOf($(s))).filter((r) => r && r.y > vh / 2),
  });
}

export function currentModeName() {
  return document.documentElement.classList.contains('presenting') ? 'present' : (document.body.dataset.mode || '');
}

function drawCanvas(ctx, canvas) {
  if (!shown(canvas)) return;
  const r = canvas.getBoundingClientRect();
  ctx.drawImage(canvas, r.left, r.top, r.width, r.height);
}

const visibleColor = (c) => c && c !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(c);

function roundRect(ctx, r, radius) {
  const rad = Math.min(radius, r.width / 2, r.height / 2);
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(r.left, r.top, r.width, r.height, rad) : ctx.rect(r.left, r.top, r.width, r.height);
}

// Paints one label: every box with a background or a left border, then
// every word at the spot the page shows it, in the page's font and colour.
function paintElement(ctx, root) {
  const boxes = [root, ...root.querySelectorAll('*')];
  for (const el of boxes) {
    if (!shown(el)) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (visibleColor(cs.backgroundColor)) {
      ctx.fillStyle = cs.backgroundColor;
      roundRect(ctx, r, parseFloat(cs.borderTopLeftRadius) || 0);
      ctx.fill();
    }
    const bl = parseFloat(cs.borderLeftWidth) || 0;
    if (bl > 0 && cs.borderLeftStyle !== 'none' && visibleColor(cs.borderLeftColor)) {
      ctx.fillStyle = cs.borderLeftColor;
      ctx.fillRect(r.left, r.top, bl, r.height);
    }
  }
  // Zone tag stem (a ::after the DOM cannot hand us).
  if (root.matches('.zl-tag')) {
    const r = root.getBoundingClientRect();
    ctx.fillStyle = getComputedStyle(root).getPropertyValue('--zl-color').trim() || '#ffffff';
    ctx.fillRect(r.left + r.width / 2 - 1, r.bottom, 2, 14);
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || !shown(parent)) continue;
    const cs = getComputedStyle(parent);
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
    ctx.fillStyle = cs.color;
    ctx.textBaseline = 'middle';
    const text = node.textContent;
    for (const m of text.matchAll(/\S+/g)) {
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      const wr = range.getBoundingClientRect();
      if (wr.width < 1) continue;
      ctx.fillText(applyTextTransform(m[0], cs.textTransform), wr.left, wr.top + wr.height / 2);
    }
  }
}

// The stage as a canvas, in device pixels. clean: no labels.
export async function captureStage({ clean = false } = {}) {
  const crop = currentStageCrop();
  const gl = renderer.domElement;
  const glRect = gl.getBoundingClientRect();
  const scale = glRect.width > 0 ? gl.width / glRect.width : (window.devicePixelRatio || 1);
  const out = document.createElement('canvas');
  out.width = Math.round(crop.w * scale);
  out.height = Math.round(crop.h * scale);
  const ctx = out.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, -crop.x * scale, -crop.y * scale);   // draw in screen CSS px
  ctx.fillStyle = getComputedStyle(document.body).backgroundColor || '#0d0f12';
  ctx.fillRect(crop.x, crop.y, crop.w, crop.h);

  drawCanvas(ctx, $('#photo-canvas'));
  if (shown(gl)) {
    renderer.render(scene, state.activeCamera);   // fresh frame, copied in the same task
    drawCanvas(ctx, gl);
  }
  if (!clean) {
    await document.fonts?.ready;
    for (const sel of OVERLAYS) for (const el of document.querySelectorAll(sel)) if (shown(el)) paintElement(ctx, el);
  }
  return out;
}

const toBlob = (canvas) => new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('screenshot: no image'))), 'image/png'));

export async function screenshotBlob(opts) {
  return toBlob(await captureStage(opts));
}

// Saves a PNG; returns the file name.
export async function saveScreenshot({ clean = false } = {}) {
  const blob = await screenshotBlob({ clean });
  const name = shotFileName(new Date(), currentModeName());
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}

export async function copyScreenshot({ clean = false } = {}) {
  const blob = screenshotBlob({ clean });   // a promise: keeps the click's user activation for clipboard.write
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}
