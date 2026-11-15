// Minimal OBJ reader for generators/prepare_goalie.mjs (S-BACK-026):
// gltf-transform has no OBJ import. One mesh, one material; reads v, vt, vn
// and f (triangles or polygons, fan-split; 1-based or negative indices).
// Each distinct v/vt/vn corner becomes one glTF vertex. V is flipped,
// because OBJ texture v runs up and glTF v runs down.

export function parseObjMesh(text) {
  const v = [], vt = [], vn = [];
  const positions = [], normals = [], uvs = [], indices = [];
  const corners = new Map();
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const at = (list, s) => {
    const i = Number(s);
    return i < 0 ? list.length + i : i - 1;
  };

  const corner = (token) => {
    let index = corners.get(token);
    if (index !== undefined) return index;
    const [pi, ti, ni] = token.split('/');
    const p = v[at(v, pi)];
    const t = ti ? vt[at(vt, ti)] : [0, 0];
    const n = ni ? vn[at(vn, ni)] : [0, 0, 0];
    index = positions.length / 3;
    positions.push(p[0], p[1], p[2]);
    uvs.push(t[0], 1 - t[1]);
    normals.push(n[0], n[1], n[2]);
    for (let k = 0; k < 3; k++) {
      if (p[k] < min[k]) min[k] = p[k];
      if (p[k] > max[k]) max[k] = p[k];
    }
    corners.set(token, index);
    return index;
  };

  for (const raw of text.split('\n')) {
    const parts = raw.trim().split(/\s+/);
    const nums = () => parts.slice(1).map(Number);
    switch (parts[0]) {
      case 'v': v.push(nums().slice(0, 3)); break;
      case 'vt': vt.push(nums().slice(0, 2)); break;
      case 'vn': vn.push(nums().slice(0, 3)); break;
      case 'f': {
        const ids = parts.slice(1).map(corner);
        for (let i = 1; i + 1 < ids.length; i++) indices.push(ids[0], ids[i], ids[i + 1]);
        break;
      }
      default: break;
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: positions.length / 3 > 65535 ? new Uint32Array(indices) : new Uint16Array(indices),
    bounds: { min, max },
  };
}
