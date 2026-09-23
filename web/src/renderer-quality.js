// Pure device-capability heuristic for the WebGL renderer's quality
// settings (S-BACK-011). Kept module-scope + arg-driven so it can be
// unit-tested; scene.js calls it once at boot with real `navigator` /
// `window` values and passes the result to `new THREE.WebGLRenderer`.
//
// Tiers:
//   'low'  - antialias off, pixelRatio 1. Cheap enough for a phone / weak
//            integrated GPU / battery-conscious use.
//   'high' - antialias on, pixelRatio min(dpr, 2). Default on any device
//            that clears the low-tier heuristic.
//
// User override wins over the heuristic. Pass 'low' | 'high' | 'auto'
// (default 'auto'); scene.js reads it from `localStorage` (key
// `floorball.renderQuality`) so a power user can force a specific tier
// on their machine without editing code.
export function pickRendererQuality({
  hardwareConcurrency,
  deviceMemory,
  devicePixelRatio,
  override,
} = {}) {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  if (override === 'low') return { tier: 'low', antialias: false, pixelRatio: 1 };
  if (override === 'high') return { tier: 'high', antialias: true, pixelRatio: Math.min(dpr, 2) };
  const cores = Number.isFinite(hardwareConcurrency) && hardwareConcurrency > 0 ? hardwareConcurrency : 4;
  const mem = Number.isFinite(deviceMemory) && deviceMemory > 0 ? deviceMemory : 4;
  const weak = cores <= 4 || mem <= 2;
  return weak
    ? { tier: 'low', antialias: false, pixelRatio: 1 }
    : { tier: 'high', antialias: true, pixelRatio: Math.min(dpr, 2) };
}
