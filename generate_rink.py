"""
Parametric 3D model generator for an IFF floorball rink (board + markings).

Dimensions taken from:
  - IFF Material Regulations (SPCR 011 / SP-METHOD 1506), section 2.4 "Rink"
      rink (board) height            500 +/- 10 mm
      rink corner radius            2000 +/- 500 mm
      top edge / joint radii        (not modelled - too fine at this scale)
  - IFF Rules of the Game 2026, sections 101/102 "Rink" / "Markings on the rink"
      rink size                     40 m x 20 m (rounded corners)
      centre line / centre spot     divides rink in half
      goal creases                  4 m x 5 m, centred on the long sides
      goalkeeper areas              1 m x 2.5 m, 0.65 m in front of the
                                     crease's rear limit; their rear line
                                     is also the goal line
      face-off dots                 6 total, on the centre line and on the
                                     imaginary goal-line extensions,
                                     1.5 m from the long sides, <=300 mm dia.

Interpretation note: the rule text gives the goal-crease/goal-line position
only as relative offsets ("2.85 m from the short sides", "0.65 m in front of
the crease's rear limit") - the actual dimensioned drawing (Illustrations of
the Rink) is image-only in the source PDF and did not extract as text. The
values below resolve those offsets the way that is internally consistent:
the goal's own back sits at the crease's near edge (2.85 m from the board),
and the goal's 0.65 m depth places its mouth/goal line at 3.5 m from the
board - exactly matching the goal's own "lower goal depth" figure. This is
a best-effort reconstruction, not a verified official diagram.

Output: rink.obj + rink.mtl (units = millimetres, same scale as the goal model)
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

def add_disk(cx, cz, radius, y, mat, segments=28):
    center = add_vert((cx, y, cz))
    ring = []
    for i in range(segments):
        theta = 2 * math.pi * i / segments
        ring.append(add_vert((cx + radius * math.cos(theta), y, cz + radius * math.sin(theta))))
    for i in range(segments):
        j = (i + 1) % segments
        add_tri(center, ring[i], ring[j], mat)

def add_rect_outline(x0, x1, z0, z1, line_w, y, mat):
    hw = line_w / 2
    add_quad((x0 - hw, y, z0 - hw), (x1 + hw, y, z0 - hw), (x1 + hw, y, z0 + hw), (x0 - hw, y, z0 + hw), mat)  # near edge
    add_quad((x0 - hw, y, z1 - hw), (x1 + hw, y, z1 - hw), (x1 + hw, y, z1 + hw), (x0 - hw, y, z1 + hw), mat)  # far edge
    add_quad((x0 - hw, y, z0 - hw), (x0 + hw, y, z0 - hw), (x0 + hw, y, z1 + hw), (x0 - hw, y, z1 + hw), mat)  # left edge
    add_quad((x1 - hw, y, z0 - hw), (x1 + hw, y, z0 - hw), (x1 + hw, y, z1 + hw), (x1 - hw, y, z1 + hw), mat)  # right edge

def add_line(x0, z0, x1, z1, line_w, y, mat):
    dx, dz = x1 - x0, z1 - z0
    length = math.hypot(dx, dz)
    nx, nz = -dz / length * line_w / 2, dx / length * line_w / 2
    add_quad((x0 + nx, y, z0 + nz), (x1 + nx, y, z1 + nz), (x1 - nx, y, z1 - nz), (x0 - nx, y, z0 - nz), mat)

def rink_board_path(half_w, length, r, arc_segments=12):
    """Closed centreline path (in the y=0 floor plane) of the rounded rink rectangle."""
    pts = []
    pts.append((half_w, 0.0, r))
    pts.append((half_w, 0.0, length - r))
    corners = [
        ((half_w - r, length - r), 0, 90),
        ((-half_w + r, length - r), 90, 180),
        ((-half_w + r, r), 180, 270),
        ((half_w - r, r), 270, 360),
    ]
    for idx, (cxz, a0, a1) in enumerate(corners):
        cx, cz = cxz
        n = arc_segments if idx < 3 else arc_segments - 1
        for i in range(1, n + 1):
            theta = math.radians(a0 + (a1 - a0) * i / arc_segments)
            pts.append((cx + r * math.cos(theta), 0.0, cz + r * math.sin(theta)))
    return pts

# ------------------------------------------------------------- dimensions --

RINK_L   = 40000.0   # rink length (long sides)
RINK_W   = 20000.0   # rink width (short sides)
HALF_W   = RINK_W / 2
BOARD_H  = 500.0      # board height
BOARD_R  = 2000.0     # rink corner radius
LINE_W   = 50.0       # marking line width (upper end of the 4-5 cm spec)
DOT_D    = 300.0      # face-off dot / centre spot max diameter

GOAL_LINE_FROM_BOARD = 3500.0   # derived: crease near edge (2850) + goal depth (650)
CREASE_NEAR          = 2850.0
CREASE_DEPTH         = 4000.0
CREASE_WIDTH         = 5000.0
GK_DEPTH             = 1000.0
GK_WIDTH             = 2500.0
FACEOFF_FROM_SIDE    = 1500.0

Y_MARK = 2.0   # lift markings 2 mm above the floor to avoid z-fighting

# --------------------------------------------------------------- board --

board_path = rink_board_path(HALF_W, RINK_L, BOARD_R, arc_segments=16)
n = len(board_path)
for i in range(n):
    p0 = board_path[i]
    p1 = board_path[(i + 1) % n]
    add_quad((p0[0], 0.0, p0[2]), (p1[0], 0.0, p1[2]),
             (p1[0], BOARD_H, p1[2]), (p0[0], BOARD_H, p0[2]), 'Board')

# ------------------------------------------------------------ markings --

# centre line + centre spot
add_line(-HALF_W, RINK_L / 2, HALF_W, RINK_L / 2, LINE_W, Y_MARK, 'Marking')
add_disk(0.0, RINK_L / 2, DOT_D / 2, Y_MARK, 'Marking')

for end_sign, board_z in ((+1, 0.0), (-1, RINK_L)):
    # end_sign > 0: near the z=0 board: distances measured "into" the rink (+z)
    # end_sign < 0: near the z=RINK_L board: distances measured "into" the rink (-z)
    def into(d):
        return board_z + end_sign * d

    crease_near = into(CREASE_NEAR)
    crease_far = into(CREASE_NEAR + CREASE_DEPTH)
    z0, z1 = sorted((crease_near, crease_far))
    add_rect_outline(-CREASE_WIDTH / 2, CREASE_WIDTH / 2, z0, z1, LINE_W, Y_MARK, 'Marking')

    gk_near = into(GOAL_LINE_FROM_BOARD)
    gk_far = into(GOAL_LINE_FROM_BOARD + GK_DEPTH)
    z0, z1 = sorted((gk_near, gk_far))
    add_rect_outline(-GK_WIDTH / 2, GK_WIDTH / 2, z0, z1, LINE_W, Y_MARK, 'Marking')

    goal_line_z = into(GOAL_LINE_FROM_BOARD)
    add_disk(HALF_W - FACEOFF_FROM_SIDE, goal_line_z, DOT_D / 2, Y_MARK, 'Marking')
    add_disk(-(HALF_W - FACEOFF_FROM_SIDE), goal_line_z, DOT_D / 2, Y_MARK, 'Marking')

add_disk(HALF_W - FACEOFF_FROM_SIDE, RINK_L / 2, DOT_D / 2, Y_MARK, 'Marking')
add_disk(-(HALF_W - FACEOFF_FROM_SIDE), RINK_L / 2, DOT_D / 2, Y_MARK, 'Marking')

# --------------------------------------------------------------- export --

out_dir = os.path.dirname(os.path.abspath(__file__))
obj_path = os.path.join(out_dir, 'rink.obj')
mtl_path = os.path.join(out_dir, 'rink.mtl')

with open(mtl_path, 'w') as f:
    # Board colour is a styling choice (the IFF spec does not mandate one).
    f.write("newmtl Board\nKd 0.03 0.03 0.035\nKa 0.01 0.01 0.01\nNs 40\n\n")
    f.write("newmtl Marking\nKd 0.98 0.98 0.98\nKa 0.2 0.2 0.2\nNs 5\n\n")

with open(obj_path, 'w') as f:
    f.write("# IFF floorball rink 40x20 m - generated from SPCR 011 / Rules of the Game\n")
    f.write("# units: millimetres. Goal-line placement is a best-effort reconstruction - see script header.\n")
    f.write("mtllib rink.mtl\n")
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
print(f"goal line from board: {GOAL_LINE_FROM_BOARD} mm  |  goal-back position: {CREASE_NEAR} mm")
