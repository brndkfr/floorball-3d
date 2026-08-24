"""
Parametric 3D player chip for the authoring tool - a shallow disc that sits
on the rink surface and represents one player. Not a real-world object, so
no IFF spec applies; the size is chosen to be visually clear from both the
first-person and top-down cameras without dominating small tactical shapes.

Team colour is applied per instance in JS (chips.js), so the material here
is a neutral white base. A number label is drawn as a canvas-texture sprite
child at runtime, not baked into the geometry (same pattern as the grid
overlay's tile labels).

Constants:
    CHIP_RADIUS      100 mm (200 mm diameter - roughly a hockey puck's
                     footprint at rink scale)
    CHIP_HEIGHT       20 mm
    SLICES            48 (round enough to look circular at any camera angle)

Output: player_chip.obj + player_chip.mtl (units = millimetres)
"""

import math
import os

CHIP_RADIUS = 100.0
CHIP_HEIGHT = 20.0
SLICES = 48

verts = []
tris = []

def add_vert(p):
    verts.append(p)
    return len(verts)

def add_tri(a, b, c, mat):
    tris.append((a, b, c, mat))

# Top and bottom centre vertices for the two disc caps.
top_c = add_vert((0.0, CHIP_HEIGHT, 0.0))
bot_c = add_vert((0.0, 0.0, 0.0))

top_ring = []
bot_ring = []
for i in range(SLICES):
    theta = 2 * math.pi * i / SLICES
    x = CHIP_RADIUS * math.cos(theta)
    z = CHIP_RADIUS * math.sin(theta)
    top_ring.append(add_vert((x, CHIP_HEIGHT, z)))
    bot_ring.append(add_vert((x, 0.0, z)))

for i in range(SLICES):
    j = (i + 1) % SLICES
    # top cap (CCW seen from above)
    add_tri(top_c, top_ring[j], top_ring[i], 'Chip')
    # bottom cap (CCW seen from below)
    add_tri(bot_c, bot_ring[i], bot_ring[j], 'Chip')
    # side wall
    add_tri(top_ring[i], top_ring[j], bot_ring[j], 'Chip')
    add_tri(top_ring[i], bot_ring[j], bot_ring[i], 'Chip')

out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'web', 'assets')
obj_path = os.path.join(out_dir, 'player_chip.obj')
mtl_path = os.path.join(out_dir, 'player_chip.mtl')

with open(mtl_path, 'w') as f:
    f.write("newmtl Chip\nKd 1.0 1.0 1.0\nKa 0.2 0.2 0.2\nKs 0.1 0.1 0.1\nNs 20\nillum 2\n\n")

with open(obj_path, 'w') as f:
    f.write("# Authoring-tool player chip - not an IFF object.\n")
    f.write(f"# {CHIP_RADIUS*2:.0f} mm diameter x {CHIP_HEIGHT:.0f} mm tall disc.\n")
    f.write("# Team colour is applied per instance in JS; the number label is a canvas-texture sprite child.\n")
    f.write("mtllib player_chip.mtl\n")
    for v in verts:
        f.write(f"v {v[0]:.3f} {v[1]:.3f} {v[2]:.3f}\n")
    cur_mat = None
    for (a, b, c, mat) in tris:
        if mat != cur_mat:
            f.write(f"usemtl {mat}\n")
            cur_mat = mat
        f.write(f"f {a} {b} {c}\n")

print(f"vertices: {len(verts)}  triangles: {len(tris)}")
print(f"chip: {CHIP_RADIUS*2:.0f} mm diameter x {CHIP_HEIGHT:.0f} mm tall")
print(f"written: {obj_path}")
print(f"written: {mtl_path}")
