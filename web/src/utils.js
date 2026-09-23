import * as THREE from 'three';
import { markRenderDirty } from './render-dirty.js';

// wire a checkbox to a layer object/group once it's loaded
export function bindLayerToggle(checkbox, getObject) {
  checkbox.addEventListener('change', () => {
    const obj = getObject();
    if (obj) obj.visible = checkbox.checked;
    markRenderDirty(); // S-BACK-011: a visibility flip isn't a doc mutation, so saveDoc()'s hook doesn't see it
  });
}

// canvas-texture text sprite, used for the grid overlay's "col-row" tile labels
export function makeLabelSprite(text, size = 550) {
  const w = 160, h = 100;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 46px system-ui, sans-serif';
  ctx.fillStyle = '#1b1b1f';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, depthWrite: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(size * (w / h), size, 1);
  return sprite;
}
