// Pure shape coordinate math, extracted from shapes.js's translateShapes so
// it's unit-testable without scene.js (S-BACK-009).

// Shift every world-space coordinate a shape carries by (dx, dz) mm, in
// place. Covers all representations: freehand / arrow `points`, rect +
// triangle bbox (`x,z,w,h`), circle centre (`cx,cz`), and text anchor
// (`x,z`). Size fields (`w,h,r`) are left alone - only positions move.
export function translateShapeCoords(shape, dx, dz) {
  if (Array.isArray(shape.points)) {
    for (const p of shape.points) { p.x += dx; p.z += dz; }
  }
  if (typeof shape.x === 'number') shape.x += dx;
  if (typeof shape.z === 'number') shape.z += dz;
  if (typeof shape.cx === 'number') shape.cx += dx;
  if (typeof shape.cz === 'number') shape.cz += dz;
}
