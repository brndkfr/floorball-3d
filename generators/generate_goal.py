"""
Parametric 3D model generator for an IFF-certified floorball goal (160 x 115 cm).

All dimensions are taken directly from the official IFF documents:
  - IFF Material Regulations (SPCR 011 / SP-METHOD 1506), section 2.3.2 "Goal Dimensions"
  - IFF Rules of the Game 2026, section 103 "Goal cages"

    goal width (mouth)      1600 +/- 2 mm
    goal height (mouth)     1150 +/- 2 mm
    back bar diameter         20 +/- 2 mm
    goal frame tube diameter  32 +/- 1 mm
    lower goal depth          650 +/- 20 mm
    goal corner (bend) radius 100 +/- 10 mm
    upper goal depth          400 +/- 50 mm
    goal weight (with net)     12 +/- 1.0 kg
    net mesh size max          50 x 50 mm
    net set back from crossbar 200 +/- 25 mm

Anything not covered by the IFF spec (net mesh pattern detail, foot pad size,
exact corner-radius placement, rear width taper) is a simplified, clearly
approximate stand-in so the model can be rendered/viewed - it is not a
manufacturer CAD file.

Output: floorball_goal.obj + floorball_goal.mtl (units = millimetres)
"""

import math
import os

# ---------------------------------------------------------------- geometry --

verts = []          # list of (x, y, z)
tris = []           # list of (i0, i1, i2, material_name)  1-based indices

def add_vert(p):
    verts.append(p)
    return len(verts)

def add_tri(a, b, c, mat):
    tris.append((a, b, c, mat))

def add_quad(p0, p1, p2, p3, mat, double_sided=False):
    i0, i1, i2, i3 = add_vert(p0), add_vert(p1), add_vert(p2), add_vert(p3)
    add_tri(i0, i1, i2, mat)
    add_tri(i0, i2, i3, mat)
    if double_sided:
        j0, j1, j2, j3 = add_vert(p0), add_vert(p1), add_vert(p2), add_vert(p3)
        add_tri(j0, j2, j1, mat)
        add_tri(j0, j3, j2, mat)

def sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])

def add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])

def scale(a, s):
    return (a[0] * s, a[1] * s, a[2] * s)

def cross(a, b):
    return (a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0])

def norm(a):
    l = math.sqrt(a[0]**2 + a[1]**2 + a[2]**2)
    if l < 1e-9:
        return (0.0, 0.0, 0.0)
    return (a[0]/l, a[1]/l, a[2]/l)

def add_cylinder(p0, p1, radius, mat, segments=14):
    """Open tube (no end caps) between p0 and p1."""
    tangent = norm(sub(p1, p0))
    if abs(tangent[1]) < 0.9:
        up_ref = (0.0, 1.0, 0.0)
    else:
        up_ref = (1.0, 0.0, 0.0)
    right = norm(cross(tangent, up_ref))
    up2 = norm(cross(right, tangent))

    ring0, ring1 = [], []
    for i in range(segments):
        theta = 2 * math.pi * i / segments
        offset = add(scale(right, radius * math.cos(theta)), scale(up2, radius * math.sin(theta)))
        ring0.append(add_vert(add(p0, offset)))
        ring1.append(add_vert(add(p1, offset)))

    for i in range(segments):
        j = (i + 1) % segments
        add_tri(ring0[i], ring0[j], ring1[j], mat)
        add_tri(ring0[i], ring1[j], ring1[i], mat)

def add_sphere(center, radius, mat, stacks=8, slices=14):
    """Simple UV sphere, used as a smooth joint blob at tube junctions."""
    ring_idx = []
    for s in range(stacks + 1):
        phi = math.pi * s / stacks
        row = []
        y = radius * math.cos(phi)
        r = radius * math.sin(phi)
        for t in range(slices):
            theta = 2 * math.pi * t / slices
            x = r * math.cos(theta)
            z = r * math.sin(theta)
            row.append(add_vert(add(center, (x, y, z))))
        ring_idx.append(row)

    for s in range(stacks):
        for t in range(slices):
            t2 = (t + 1) % slices
            a = ring_idx[s][t]
            b = ring_idx[s][t2]
            c = ring_idx[s+1][t2]
            d = ring_idx[s+1][t]
            add_tri(a, b, c, mat)
            add_tri(a, c, d, mat)

def add_box(center, size, mat):
    cx, cy, cz = center
    sx, sy, sz = size
    x0, x1 = cx - sx/2, cx + sx/2
    y0, y1 = cy, cy + sy
    z0, z1 = cz - sz/2, cz + sz/2
    p = {
        'a': (x0, y0, z0), 'b': (x1, y0, z0), 'c': (x1, y1, z0), 'd': (x0, y1, z0),
        'e': (x0, y0, z1), 'f': (x1, y0, z1), 'g': (x1, y1, z1), 'h': (x0, y1, z1),
    }
    add_quad(p['a'], p['b'], p['c'], p['d'], mat)          # front
    add_quad(p['f'], p['e'], p['h'], p['g'], mat)          # back
    add_quad(p['e'], p['a'], p['d'], p['h'], mat)          # left
    add_quad(p['b'], p['f'], p['g'], p['c'], mat)          # right
    add_quad(p['d'], p['c'], p['g'], p['h'], mat)          # top
    add_quad(p['e'], p['f'], p['b'], p['a'], mat)          # bottom

def rounded_rect_path(half_w, y0, y1, r, z, arc_segments=8):
    """Closed centreline path of a rounded rectangle in the plane z=const."""
    pts = []
    pts.append((half_w, y0 + r, z))
    pts.append((half_w, y1 - r, z))
    corners = [
        ((half_w - r, y1 - r), 0, 90),     # top-right
        ((-half_w + r, y1 - r), 90, 180),  # top-left
        ((-half_w + r, y0 + r), 180, 270), # bottom-left
        ((half_w - r, y0 + r), 270, 360),  # bottom-right
    ]
    for idx, (cxy, a0, a1) in enumerate(corners):
        cx, cy = cxy
        n = arc_segments if idx < 3 else arc_segments - 1  # skip duplicate closing point
        for i in range(1, n + 1):
            theta = math.radians(a0 + (a1 - a0) * i / arc_segments)
            pts.append((cx + r * math.cos(theta), cy + r * math.sin(theta), z))
    return pts

def build_tube_path(points, radius, mat, closed=False):
    n = len(points)
    end = n if closed else n - 1
    for i in range(end):
        p0 = points[i]
        p1 = points[(i + 1) % n]
        add_cylinder(p0, p1, radius, mat)
    joint_range = range(n) if closed else range(n)
    for i in joint_range:
        add_sphere(points[i], radius, mat, stacks=6, slices=12)

# ------------------------------------------------------------- dimensions --

W        = 1600.0   # goal width (mouth)
H        = 1150.0   # goal height (mouth)
FRAME_D  = 32.0      # main frame tube diameter
BACK_D   = 20.0      # back bar diameter
UPPER_D  = 400.0     # upper goal depth
LOWER_D  = 650.0     # lower goal depth
CORNER_R = 100.0     # goal corner (bend) radius
NET_SETBACK = 200.0  # net attachment distance behind crossbar

FRAME_R = FRAME_D / 2
BACK_R  = BACK_D / 2
HALF_W  = W / 2

FTL = (-HALF_W, H, 0.0)
FTR = ( HALF_W, H, 0.0)
FBL = (-HALF_W, 0.0, 0.0)
FBR = ( HALF_W, 0.0, 0.0)
BTL = (-HALF_W, H, UPPER_D)
BTR = ( HALF_W, H, UPPER_D)
BBL = (-HALF_W, 0.0, LOWER_D)
BBR = ( HALF_W, 0.0, LOWER_D)

# --- front mouth frame: rounded rectangle, 32 mm tube, corner radius 100 mm
front_path = rounded_rect_path(HALF_W, 0.0, H, CORNER_R, 0.0, arc_segments=8)
build_tube_path(front_path, FRAME_R, 'Frame', closed=True)

# --- front-to-back horizontal runs (32 mm) at top (400 mm) and bottom (650 mm)
build_tube_path([FTL, BTL], FRAME_R, 'Frame')
build_tube_path([FTR, BTR], FRAME_R, 'Frame')
build_tube_path([FBL, BBL], FRAME_R, 'Frame')
build_tube_path([FBR, BBR], FRAME_R, 'Frame')

# --- sloped back edges (32 mm) connecting top depth to bottom depth
build_tube_path([BTL, BBL], FRAME_R, 'Frame')
build_tube_path([BTR, BBR], FRAME_R, 'Frame')

# --- back bars (20 mm) closing the rear of the frame
build_tube_path([BTL, BTR], BACK_R, 'Frame')
build_tube_path([BBL, BBR], BACK_R, 'Frame')

# ------------------------------------------------------------------- net --

inset = 20.0
NTL = (-HALF_W + inset, H, NET_SETBACK)
NTR = ( HALF_W - inset, H, NET_SETBACK)

add_quad(FTL, FTR, NTR, NTL, 'Net', double_sided=True)      # top, crossbar -> net attach
add_quad(NTL, NTR, BBR, BBL, 'Net', double_sided=True)      # back / sloped pocket panel
add_quad(FBL, FBR, BBR, BBL, 'Net', double_sided=True)      # bottom (floor) panel
add_quad(FTL, BTL, BBL, FBL, 'Net', double_sided=True)      # left side panel
add_quad(FTR, BTR, BBR, FBR, 'Net', double_sided=True)      # right side panel

# ------------------------------------------------------------------ pads --
# Foot pad size is not specified by the IFF spec - illustrative only.
PAD_SIZE = (160.0, 15.0, 160.0)
for foot in (FBL, FBR, BBL, BBR):
    add_box((foot[0], -PAD_SIZE[1], foot[2]), PAD_SIZE, 'Pad')

# --------------------------------------------------------------- export --

out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'web', 'assets')
obj_path = os.path.join(out_dir, 'floorball_goal.obj')
mtl_path = os.path.join(out_dir, 'floorball_goal.mtl')

with open(mtl_path, 'w') as f:
    f.write("newmtl Frame\nKd 0.78 0.05 0.05\nKa 0.1 0.0 0.0\nNs 40\n\n")
    f.write("newmtl Net\nKd 0.95 0.95 0.95\nd 0.35\nillum 1\n\n")
    f.write("newmtl Pad\nKd 0.95 0.95 0.95\n\n")

with open(obj_path, 'w') as f:
    f.write("# IFF floorball goal 160x115 - generated from SPCR 011 / SP-METHOD 1506\n")
    f.write("# units: millimetres\n")
    f.write("mtllib floorball_goal.mtl\n")
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
