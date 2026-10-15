// GPU resource disposal for rebuilt Object3D graphs (S-BACK-029 H3).
// Duck-typed (only `traverse` / `dispose` are called) so it is testable in
// Node without WebGL. Texture maps must be freed on every material, not only
// on sprites: zone and arrow labels are Meshes carrying a CanvasTexture.

const MAP_KEYS = ['map', 'alphaMap', 'aoMap', 'normalMap'];

export function disposeMaterial(material) {
  for (const m of Array.isArray(material) ? material : [material]) {
    if (!m) continue;
    for (const key of MAP_KEYS) m[key]?.dispose?.();
    m.dispose?.();
  }
}

// Frees geometry, materials and their textures for `obj` and all children.
// Sprites share one geometry; disposing it is harmless (three re-uploads on
// next use).
export function disposeObject(obj) {
  obj?.traverse?.((child) => {
    child.geometry?.dispose?.();
    disposeMaterial(child.material);
  });
}
