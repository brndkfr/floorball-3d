"""
"Swiss Way" tactical zone overlay - naher/hoher Slot, Tasche, Playmaker Position.

IMPORTANT: unlike generate_goal.py / generate_rink.py, these zones are NOT an
IFF technical specification. They come from Swiss Unihockey's coaching lexicon
(https://www.swissunihockey.ch/de/trainer/lexikon/s), which defines them only
in words and a single schematic diagram ("Spielpositionen.png") with no
measurements:

    Slot (naher)  - "Raum zentral vor dem Tor (+/- Torraum)"
    Slot (hoher)  - "Raum zentral vor dem Tor, aber mehr Entfernung als naher Slot"

The numbers below are a proportional reconstruction from that schematic,
anchored to the one thing we DO know precisely - the goal crease footprint
(naher Slot is explicitly defined as "+/- Torraum", i.e. roughly the crease).
Treat every distance here as an illustrative estimate, not a sourced spec.

Constants duplicated from generate_rink.py (must stay in sync with that file):
    RINK_L, RINK_W, HALF_W, GOAL_LINE_FROM_BOARD

Output: tactical_zones.obj + tactical_zones.mtl (units = millimetres)
"""

import math
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

def add_disk(cx, cz, radius, y, mat, segments=24):
    center = add_vert((cx, y, cz))
    ring = []
    for i in range(segments):
        theta = 2 * math.pi * i / segments
        ring.append(add_vert((cx + radius * math.cos(theta), y, cz + radius * math.sin(theta))))
    for i in range(segments):
        j = (i + 1) % segments
        add_tri(center, ring[i], ring[j], mat)

def add_polygon(points_xz, y, mat, double_sided=True):
    """Fan-triangulated flat polygon from a list of (x, z) points."""
    idxs = [add_vert((x, y, z)) for (x, z) in points_xz]
    for i in range(1, len(idxs) - 1):
        add_tri(idxs[0], idxs[i], idxs[i + 1], mat)
        if double_sided:
            add_tri(idxs[0], idxs[i + 1], idxs[i], mat)

def add_rect(x0, x1, z0, z1, y, mat):
    add_quad((x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1), mat)

def add_dashed_line(x0, z0, x1, z1, dash, gap, line_w, y, mat):
    dx, dz = x1 - x0, z1 - z0
    length = math.hypot(dx, dz)
    ux, uz = dx / length, dz / length
    nx, nz = -uz * line_w / 2, ux * line_w / 2
    pos = 0.0
    period = dash + gap
    while pos < length:
        seg_end = min(pos + dash, length)
        sx0, sz0 = x0 + ux * pos, z0 + uz * pos
        sx1, sz1 = x0 + ux * seg_end, z0 + uz * seg_end
        add_quad((sx0 + nx, y, sz0 + nz), (sx1 + nx, y, sz1 + nz),
                  (sx1 - nx, y, sz1 - nz), (sx0 - nx, y, sz0 - nz), mat)
        pos += period

# ------------------------------------------------------------- dimensions --

RINK_L = 40000.0
RINK_W = 20000.0
HALF_W = RINK_W / 2
GOAL_LINE_FROM_BOARD = 3500.0

# naher Slot: a 6-point hexagon confirmed via the on-screen coordinate picker
# (board-relative x, distance-from-board pairs). Snaps to real references:
# the goal posts (+/-800mm, at the goal line z=3500mm) for the near corners,
# the goal crease's far edge (z=6850mm) for the "knee" bend, and the grid
# overlay's tile corners (+/-4000mm, z=10000mm) for the far corners.
NAHER_HEX_D = [
    (-800.0, 3500.0),    # left goal post
    (-4000.0, 6850.0),   # left knee (crease far edge)
    (-4000.0, 10000.0),  # left far corner (grid corner)
    (4000.0, 10000.0),   # right far corner (grid corner)
    (4000.0, 6850.0),    # right knee (mirrored)
    (800.0, 3500.0),     # right goal post
]

# hoher Slot: a rectangle confirmed via the on-screen coordinate picker,
# touching naher Slot's far edge exactly (board-relative)
HOHER_X          = 4000.0    # half-width, matches naher Slot's far-corner x
HOHER_Z_NEAR     = 10000.0   # touches naher Slot's far edge - no gap
HOHER_Z_FAR      = 16000.0

TASCHE_DEPTH     = 7000.0
TASCHE_X_INNER   = 4000.0
TASCHE_X_OUTER   = HALF_W - 500.0

# Playmaker position area - unlike the other zones, this one was confirmed
# directly via the on-screen coordinate picker (not estimated from the
# schematic). Board-relative (measured from the rink's own short side, not
# from the goal line): inner edge sits on the goalkeeper area's width edge
# (1250mm), outer edge ~5965mm, spanning from the board itself out to the
# goalkeeper area's far depth edge (4500mm).
PLAYMAKER_X_INNER = 1250.0
PLAYMAKER_X_OUTER = 5965.0
PLAYMAKER_Z_NEAR  = 0.0
PLAYMAKER_Z_FAR   = 4500.0

Y_FILL = 1.0        # sit just under the official markings (y=2.0 mm in rink.obj)
Y_FILL_PLAYMAKER = 1.15   # slightly above Y_FILL - avoids z-fighting where it overlaps the Pocket zone

# ---------------------------------------------------------- zentrallinie --

add_dashed_line(-HALF_W, RINK_L / 2, HALF_W, RINK_L / 2, 400.0, 300.0, 60.0, Y_FILL, 'ZentralLine')

# -------------------------------------------------- per-goal tactical zones --

for end_sign, board_z in ((+1, 0.0), (-1, RINK_L)):
    def into(d):
        return board_z + end_sign * d

    goal_line_z = into(GOAL_LINE_FROM_BOARD)

    def depth_z(d):
        """Position at distance d in front of the goal line, toward centre ice."""
        return goal_line_z + end_sign * d

    # naher Slot: the confirmed hexagon, mirrored to this goal end
    hex_pts = [(x, into(d)) for (x, d) in NAHER_HEX_D]
    add_polygon(hex_pts, Y_FILL, 'SlotNear')

    # hoher Slot: the confirmed rectangle, touching naher Slot's far edge
    hz0, hz1 = sorted((into(HOHER_Z_NEAR), into(HOHER_Z_FAR)))
    add_rect(-HOHER_X, HOHER_X, hz0, hz1, Y_FILL, 'SlotHigh')

    # Tasche (pocket) zones, left/right of the slot
    tz0, tz1 = sorted((goal_line_z, depth_z(TASCHE_DEPTH)))
    add_rect(TASCHE_X_INNER, TASCHE_X_OUTER, tz0, tz1, Y_FILL, 'Pocket')
    add_rect(-TASCHE_X_OUTER, -TASCHE_X_INNER, tz0, tz1, Y_FILL, 'Pocket')

    # Playmaker position areas (board-relative, see constants above)
    pz0, pz1 = sorted((into(PLAYMAKER_Z_NEAR), into(PLAYMAKER_Z_FAR)))
    add_rect(PLAYMAKER_X_INNER, PLAYMAKER_X_OUTER, pz0, pz1, Y_FILL_PLAYMAKER, 'Playmaker')
    add_rect(-PLAYMAKER_X_OUTER, -PLAYMAKER_X_INNER, pz0, pz1, Y_FILL_PLAYMAKER, 'Playmaker')

# --------------------------------------------------------------- export --

out_dir = os.path.dirname(os.path.abspath(__file__))
obj_path = os.path.join(out_dir, 'tactical_zones.obj')
mtl_path = os.path.join(out_dir, 'tactical_zones.mtl')

with open(mtl_path, 'w') as f:
    f.write("newmtl SlotNear\nKd 0.95 0.45 0.40\nd 0.35\nillum 1\n\n")
    f.write("newmtl SlotHigh\nKd 1.0 0.55 0.05\nd 0.5\nillum 1\n\n")
    f.write("newmtl Pocket\nKd 0.25 0.45 0.75\nd 0.25\nillum 1\n\n")
    f.write("newmtl Playmaker\nKd 0.15 0.75 0.35\nd 0.30\nillum 1\n\n")
    f.write("newmtl ZentralLine\nKd 0.95 0.85 0.15\nd 0.90\nillum 1\n\n")

with open(obj_path, 'w') as f:
    f.write("# Swiss Way tactical zones (naher/hoher Slot, Tasche, Playmaker) - NOT an IFF spec.\n")
    f.write("# Proportional estimate from the swissunihockey.ch coaching lexicon schematic.\n")
    f.write("# units: millimetres, same coordinate system as rink.obj\n")
    f.write("mtllib tactical_zones.mtl\n")
    for v in verts:
        f.write(f"v {v[0]:.3f} {v[1]:.3f} {v[2]:.3f}\n")
    cur_mat = None
    for (a, b, c, mat) in tris:
        if mat != cur_mat:
            f.write(f"usemtl {mat}\n")
            cur_mat = mat
        f.write(f"f {a} {b} {c}\n")

print(f"vertices: {len(verts)}  triangles: {len(tris)}")
print(f"written: {obj_path}")
print(f"written: {mtl_path}")
