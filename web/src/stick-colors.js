// Recolour a loaded floorball_stick.obj (generators/generate_stick.py).
// The OBJ carries one material per part, named after its .mtl entry; this
// maps friendly part keys onto those names.
//
// Every stick is usually a clone of one loaded template, and Object3D.clone()
// shares materials - so a mesh gets its own copy of a material the first time
// it is recoloured, and later calls on the same mesh reuse that copy.

const PARTS = {
  blade: 'Blade',
  shaft: 'Shaft',
  grip: 'Grip',
  gripLine: 'GripLine',
  knob: 'Knob',
};

// material -> the mesh that owns it (a per-stick copy made here)
const owner = new WeakMap();

export function applyStickColors(stick, colors) {
  for (const key of Object.keys(colors)) {
    if (!(key in PARTS)) {
      throw new Error(`applyStickColors: unknown stick part "${key}" (expected ${Object.keys(PARTS).join(', ')})`);
    }
  }
  const byName = {};
  for (const [key, name] of Object.entries(PARTS)) {
    if (colors[key] !== undefined) byName[name] = colors[key];
  }
  // the knob is part of the grip unless it has its own colour
  if (byName.Knob === undefined && colors.grip !== undefined) byName.Knob = colors.grip;

  stick.traverse((node) => {
    if (!node.isMesh) return;
    const list = Array.isArray(node.material) ? node.material : [node.material];
    const next = list.map((m) => {
      if (byName[m.name] === undefined) return m;
      let mine = m;
      if (owner.get(m) !== node) {
        mine = m.clone();
        owner.set(mine, node);
      }
      mine.color.set(byName[m.name]);
      return mine;
    });
    node.material = Array.isArray(node.material) ? next : next[0];
  });
}
