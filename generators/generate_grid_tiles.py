"""
Optional numbered reference grid overlay - a coaching/positional aid, not an
IFF marking.

Alignment note: the official markings' key coordinates (goal line 3500mm,
crease edges 2850/6850mm depth and +/-2500mm width, goalkeeper-area edges
3500/4500mm depth and +/-1250mm width, face-off dots at x=+/-8500mm) share a
greatest common divisor of only 50mm. A uniform grid that lines up with every
one of those edges would need ~320,000 tiles - not usable for a legible
numbered grid. This layer uses 2m x 2m tiles instead: it aligns exactly with
the rink boundary and the centre line (both round numbers), but the
crease/goal-line/goalkeeper-area edges fall mid-tile rather than on a grid
line. That's a deliberate trade-off, not an oversight.

Unlike the old (removed) tiles layer, this one is a thin outline overlay that
sits on top of the existing blue floor and IFF markings, not a replacement
floor - so it only draws grid lines, not filled tiles.

Constants duplicated from generate_rink.py (must stay in sync with that file):
    RINK_L, RINK_W, HALF_W

Tile numbers are NOT baked in here - baking text glyphs into flat OBJ geometry
isn't practical, so index.html adds one canvas-texture sprite per tile
("column-row", e.g. "3-12") using the same TILE_SIZE/N_COLS/N_ROWS constants.

Output: grid_tiles.obj + grid_tiles.mtl (units = millimetres)
"""

import os

verts = []
tris = []

def add_vert(p):
    verts.append(p)
    return len(verts)

def add_tri(a, b, c, mat):
    tris.append((a, b, c, mat))

def add_quad(p0, p1, p2, p3, mat, double_sided=True):
    i0, i1, i2, i3 = add_vert(p0), add_vert(p1), add_vert(p2), add_vert(p3)
    add_tri(i0, i1, i2, mat)
    add_tri(i0, i2, i3, mat)
    if double_sided:
        j0, j1, j2, j3 = add_vert(p0), add_vert(p1), add_vert(p2), add_vert(p3)
        add_tri(j0, j2, j1, mat)
        add_tri(j0, j3, j2, mat)

def add_rect(x0, x1, z0, z1, y, mat):
    add_quad((x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1), mat)

def add_line(x0, z0, x1, z1, line_w, y, mat):
    hw = line_w / 2
    if x0 == x1:
        add_rect(x0 - hw, x0 + hw, min(z0, z1), max(z0, z1), y, mat)
    else:
        add_rect(min(x0, x1), max(x0, x1), z0 - hw, z0 + hw, y, mat)

# ------------------------------------------------------------- dimensions --

RINK_L    = 40000.0
RINK_W    = 20000.0
HALF_W    = RINK_W / 2
TILE_SIZE = 2000.0   # 2 m x 2 m -> 10 columns x 20 rows

N_COLS = int(RINK_W / TILE_SIZE)
N_ROWS = int(RINK_L / TILE_SIZE)

LINE_W = 25.0
Y_LINE = 2.5   # just above the official markings' y=2.0 mm

# ------------------------------------------------------------------ lines --

for col in range(N_COLS + 1):
    x = -HALF_W + col * TILE_SIZE
    add_line(x, 0.0, x, RINK_L, LINE_W, Y_LINE, 'GridLine')
for row in range(N_ROWS + 1):
    z = row * TILE_SIZE
    add_line(-HALF_W, z, HALF_W, z, LINE_W, Y_LINE, 'GridLine')

# --------------------------------------------------------------- export --

out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'web', 'assets')
obj_path = os.path.join(out_dir, 'grid_tiles.obj')
mtl_path = os.path.join(out_dir, 'grid_tiles.mtl')

with open(mtl_path, 'w') as f:
    f.write("newmtl GridLine\nKd 0.95 0.95 0.85\nd 0.55\nillum 1\n\n")

with open(obj_path, 'w') as f:
    f.write("# Optional numbered reference grid overlay - NOT an IFF marking.\n")
    f.write(f"# {N_COLS} columns x {N_ROWS} rows of {TILE_SIZE:.0f} mm tiles.\n")
    f.write("# Aligns with the rink boundary + centre line; crease/goal-line edges fall mid-tile (see header).\n")
    f.write("# Number labels are added in index.html.\n")
    f.write("mtllib grid_tiles.mtl\n")
    for v in verts:
        f.write(f"v {v[0]:.3f} {v[1]:.3f} {v[2]:.3f}\n")
    cur_mat = None
    for (a, b, c, mat) in tris:
        if mat != cur_mat:
            f.write(f"usemtl {mat}\n")
            cur_mat = mat
        f.write(f"f {a} {b} {c}\n")

print(f"vertices: {len(verts)}  triangles: {len(tris)}")
print(f"grid: {N_COLS} x {N_ROWS} tiles at {TILE_SIZE:.0f} mm each")
print(f"written: {obj_path}")
print(f"written: {mtl_path}")
