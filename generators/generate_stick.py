"""
Parametric 3D model generator for an IFF-legal floorball stick (shaft + blade).

Limits taken from the IFF Material Regulations SPCR 011 (2024 edition),
section 2.1.3 "Stick Dimensions" and drawings B1 (stick) / B2 (blade):

    a) stick length                    max 1140 mm
    b) shaft curve radius              min 6 mm
    c) shaft diameter                  max 35 mm
    d) length to grip line marking     375 +/- 20 mm
    e) grip line width                 2 .. 40 mm
    f) blade bottom edge radius        max 270 mm
    g) blade edge radius               min 2 mm
    h) blade length                    max 270 mm
    i) blade thickness                 min 8 mm
    j) blade height                    72 .. 80 mm
    k) blade penetration depth         max 20 mm (50 mm cup on the toe)
    l) blade concavity depth (hook)    max 12 mm
       lie angle shaft-to-floor        60 deg (drawings B1/B2)

The chosen values below sit inside those limits. Everything the regulations
leave open - the default stick length, shaft diameter, grip binding length,
socket width, the exact banana outline of the blade, colours - is an
estimate of a typical junior/senior stick, not a manufacturer CAD file.
The blade is solid (no perforations) to keep the mesh small.

Stick length is measured like appendix C2 "a": along the shaft axis from the
point where the axis meets the floor to the top of the knob.

Frame: units = millimetres, local origin = the blade's floor-contact point
(the lowest point of the 270 mm bottom-edge arc), floor = y 0. The blade
runs along X (toe at -X, heel at +X), the shaft rises from the heel toward
+X/+Y at the 60 deg lie, and the hook bulges the blade toward +Z, i.e. the
concave forehand faces -Z.

Output: floorball_stick.obj + floorball_stick.mtl
"""

import math
import os

# ------------------------------------------------------------- dimensions --

STICK_LENGTH = 920.0        # estimate: typical U14 / junior stick ("92"), max 1140
LIE_DEG = 60.0              # shaft-to-floor angle from drawings B1/B2
SHAFT_DIAMETER = 28.0       # estimate, max 35
KNOB_LENGTH = 22.0          # estimate
KNOB_DIAMETER = 31.0        # estimate, max 35
GRIP_LENGTH = 300.0         # estimate: binding below the knob
GRIP_EXTRA_RADIUS = 1.2     # estimate: binding tape thickness
GRIP_LINE_AT = 375.0        # spec: 375 +/- 20 from the floor along the shaft
GRIP_LINE_WIDTH = 20.0      # spec: 2 .. 40

BLADE_BOTTOM_RADIUS = 270.0 # spec: max 270 (flattest legal rocker)
BLADE_HEIGHT = 76.0         # spec: 72 .. 80
BLADE_THICKNESS = 9.0       # spec: min 8; edges fully rounded (radius 4.5 >= 2)
BLADE_HOOK = 10.0           # spec: concavity max 12
TOE_ANGLE = -0.42           # rad along the bottom arc; sets blade length (~265)
HEEL_ANGLE = 0.30           # rad along the bottom arc where the neck starts
SOCKET_HEIGHT = 115.0       # estimate: height of the blade socket centre above the floor
SOCKET_WIDTH = 22.0         # estimate: blade neck width where it enters the shaft
SOCKET_INSERT = 15.0        # shaft overlaps the socket by this much

assert STICK_LENGTH <= 1140
assert SHAFT_DIAMETER <= 35 and KNOB_DIAMETER <= 35
assert abs(GRIP_LINE_AT - 375) <= 20 and 2 <= GRIP_LINE_WIDTH <= 40
assert BLADE_BOTTOM_RADIUS <= 270 and 72 <= BLADE_HEIGHT <= 80
assert BLADE_THICKNESS >= 8 and BLADE_THICKNESS / 2 >= 2 and BLADE_HOOK <= 12

# ---------------------------------------------------------------- geometry --

verts = []          # (x, y, z)
tris = []           # (i0, i1, i2, material) 0-based

def add_vert(p):
    verts.append(p)
    return len(verts) - 1

def add_tri(a, b, c, mat):
    tris.append((a, b, c, mat))

def v_add(a, b): return tuple(x + y for x, y in zip(a, b))
def v_sub(a, b): return tuple(x - y for x, y in zip(a, b))
def v_scale(a, s): return tuple(x * s for x in a)
def v_cross(a, b): return (a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0])
def v_norm(a):
    l = math.sqrt(sum(x * x for x in a))
    return (0.0, 0.0, 0.0) if l < 1e-12 else tuple(x / l for x in a)

lie = math.radians(LIE_DEG)
AXIS = (math.cos(lie), math.sin(lie), 0.0)            # shaft direction
ACROSS = (math.sin(lie), -math.cos(lie), 0.0)         # in-plane, perpendicular to the shaft
SIDE = (0.0, 0.0, 1.0)

# Blade outline, side view (XY). Bottom edge: arc of BLADE_BOTTOM_RADIUS
# centred straight above the contact point; top edge: concentric arc
# BLADE_HEIGHT further in, so the height is measured perpendicular to the
# bottom edge as in drawing B2.
R = BLADE_BOTTOM_RADIUS
RT = R - BLADE_HEIGHT

def bottom(t): return (R * math.sin(t), R - R * math.cos(t))
def top(t): return (RT * math.sin(t), R - RT * math.cos(t))
def tangent(t): return (math.cos(t), math.sin(t))

def bezier(p0, p1, p2, p3, n):
    out = []
    for i in range(1, n + 1):
        s = i / n
        m = 1 - s
        out.append(tuple(m*m*m*a + 3*m*m*s*b + 3*m*s*s*c + s*s*s*d
                         for a, b, c, d in zip(p0, p1, p2, p3)))
    return out

# shaft axis: through the socket centre, meeting the floor at FLOOR_POINT
bh = bottom(HEEL_ANGLE)
socket_s = SOCKET_HEIGHT / AXIS[1]                    # axis distance floor -> socket
FLOOR_POINT = (bh[0] + 0.0, 0.0)
SOCKET = (FLOOR_POINT[0] + AXIS[0] * socket_s, SOCKET_HEIGHT)
half_w = SOCKET_WIDTH / 2
socket_r = (SOCKET[0] + ACROSS[0] * half_w, SOCKET[1] + ACROSS[1] * half_w)
socket_l = (SOCKET[0] - ACROSS[0] * half_w, SOCKET[1] - ACROSS[1] * half_w)

outline = []
N_ARC = 90
for i in range(N_ARC + 1):                            # bottom edge, toe -> heel
    t = TOE_ANGLE + (HEEL_ANGLE - TOE_ANGLE) * i / N_ARC
    outline.append(bottom(t))
ht = tangent(HEEL_ANGLE)
outline += bezier(bh, (bh[0] + 22 * ht[0], bh[1] + 22 * ht[1]),       # heel curve up into the socket
                  (socket_r[0] - 55 * AXIS[0], socket_r[1] - 55 * AXIS[1]), socket_r, 24)
outline += bezier(socket_r, socket_r, socket_l, socket_l, 4)[1:]      # socket end (straight)
th = top(HEEL_ANGLE)
outline += bezier(socket_l, (socket_l[0] - 40 * AXIS[0], socket_l[1] - 40 * AXIS[1]),
                  (th[0] + 20 * ht[0], th[1] + 20 * ht[1]), th, 20)
for i in range(1, N_ARC + 1):                         # top edge, heel -> toe
    t = HEEL_ANGLE + (TOE_ANGLE - HEEL_ANGLE) * i / N_ARC
    outline.append(top(t))
mid_r = (R + RT) / 2                                  # rounded toe, semicircle
toe_c = (mid_r * math.sin(TOE_ANGLE), R - mid_r * math.cos(TOE_ANGLE))
radial = (-math.sin(TOE_ANGLE), math.cos(TOE_ANGLE))  # points from bottom to top edge
back = (-math.cos(TOE_ANGLE), -math.sin(TOE_ANGLE))   # points out past the toe
for i in range(1, 24):
    a = math.pi * i / 24
    outline.append((toe_c[0] + BLADE_HEIGHT / 2 * (math.cos(a) * radial[0] + math.sin(a) * back[0]),
                    toe_c[1] + BLADE_HEIGHT / 2 * (math.cos(a) * radial[1] + math.sin(a) * back[1])))

# drop near-duplicate points (curve joins)
clean = []
for p in outline:
    if not clean or math.dist(p, clean[-1]) > 0.05:
        clean.append(p)
if math.dist(clean[0], clean[-1]) < 0.05:
    clean.pop()
outline = clean

def signed_area(poly):
    return 0.5 * sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1]
                     for i in range(len(poly)))
if signed_area(outline) < 0:
    outline.reverse()                                 # make it CCW

def inset_normals(poly):
    """Per-vertex inward miter normals of a CCW polygon."""
    n = len(poly)
    out = []
    for i in range(n):
        p0, p1, p2 = poly[i - 1], poly[i], poly[(i + 1) % n]
        e0 = v_norm((p1[0] - p0[0], p1[1] - p0[1], 0))
        e1 = v_norm((p2[0] - p1[0], p2[1] - p1[1], 0))
        n0 = (-e0[1], e0[0])                          # left of edge = inside for CCW
        n1 = (-e1[1], e1[0])
        m = v_norm((n0[0] + n1[0], n0[1] + n1[1], 0))
        c = m[0] * n1[0] + m[1] * n1[1]
        k = 1.0 / max(c, 0.5)                         # miter length, clamped
        out.append((m[0] * k, m[1] * k))
    return out

x_heel, x_toe = bh[0], min(p[0] for p in outline)
def hook_z(x):
    """Concavity: parabola from heel (0) to toe (0), BLADE_HOOK deep in between."""
    if x >= x_heel:
        return 0.0
    u = (x_heel - x) / (x_heel - x_toe)
    return BLADE_HOOK * 4 * u * (1 - u)

def triangulate(poly):
    """Ear clipping for a simple CCW polygon; returns index triples."""
    idx = list(range(len(poly)))
    out = []
    def cross2(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    def inside(p, a, b, c):
        return cross2(a, b, p) >= 0 and cross2(b, c, p) >= 0 and cross2(c, a, p) >= 0
    guard = 0
    while len(idx) > 3 and guard < 100000:
        guard += 1
        for k in range(len(idx)):
            i0, i1, i2 = idx[k - 1], idx[k], idx[(k + 1) % len(idx)]
            a, b, c = poly[i0], poly[i1], poly[i2]
            if cross2(a, b, c) <= 1e-9:
                continue
            if any(inside(poly[j], a, b, c) for j in idx if j not in (i0, i1, i2)):
                continue
            out.append((i0, i1, i2))
            idx.pop(k)
            break
        else:
            raise RuntimeError('triangulation failed - outline self-intersects')
    out.append(tuple(idx))
    return out

# Blade solid: rings around the outline sweep the fully rounded edge from the
# -Z face over the rim to the +Z face; both faces are the inset outline.
half_t = BLADE_THICKNESS / 2
inward = inset_normals(outline)
N_EDGE = 8
rings = []
for k in range(N_EDGE + 1):
    phi = -math.pi / 2 + math.pi * k / N_EDGE
    ins = half_t * (1 - math.cos(phi))
    z = half_t * math.sin(phi)
    ring = []
    for p, m in zip(outline, inward):
        x, y = p[0] + m[0] * ins, p[1] + m[1] * ins
        ring.append(add_vert((x, y, z + hook_z(x))))
    rings.append(ring)
n = len(outline)
for k in range(N_EDGE):
    a, b = rings[k], rings[k + 1]
    for i in range(n):
        j = (i + 1) % n
        add_tri(a[i], a[j], b[j], 'Blade')
        add_tri(a[i], b[j], b[i], 'Blade')
face_poly = [(verts[i][0], verts[i][1]) for i in rings[0]]
for (i0, i1, i2) in triangulate(face_poly):
    add_tri(rings[-1][i0], rings[-1][i1], rings[-1][i2], 'Blade')   # +Z face
    add_tri(rings[0][i0], rings[0][i2], rings[0][i1], 'Blade')      # -Z face

# Shaft parts: tubes along the axis, s = distance from FLOOR_POINT.
def axis_point(s):
    return (FLOOR_POINT[0] + AXIS[0] * s, AXIS[1] * s, 0.0)

def add_tube(s0, s1, radius, mat, segs=28, cap0=False, cap1=False):
    def ring(s):
        c = axis_point(s)
        return [add_vert(v_add(c, v_add(v_scale(ACROSS, radius * math.cos(2 * math.pi * i / segs)),
                                        v_scale(SIDE, radius * math.sin(2 * math.pi * i / segs)))))
                for i in range(segs)]
    r0, r1 = ring(s0), ring(s1)
    for i in range(segs):
        j = (i + 1) % segs
        add_tri(r0[i], r1[i], r1[j], mat)
        add_tri(r0[i], r1[j], r0[j], mat)
    for cap, s, flip in ((cap0, s0, True), (cap1, s1, False)):
        if not cap:
            continue
        rr = ring(s)                                  # separate verts -> flat cap normal
        c = add_vert(axis_point(s))
        for i in range(segs):
            j = (i + 1) % segs
            add_tri(c, rr[j], rr[i], mat) if flip else add_tri(c, rr[i], rr[j], mat)

shaft_r = SHAFT_DIAMETER / 2
shaft_top = STICK_LENGTH - KNOB_LENGTH
grip_bottom = shaft_top - GRIP_LENGTH
shaft_bottom = socket_s - SOCKET_INSERT
add_tube(shaft_bottom, grip_bottom, shaft_r, 'Shaft', cap0=True)
add_tube(grip_bottom, shaft_top, shaft_r, 'Shaft')
add_tube(grip_bottom, shaft_top, shaft_r + GRIP_EXTRA_RADIUS, 'Grip', cap0=True)
add_tube(GRIP_LINE_AT - GRIP_LINE_WIDTH / 2, GRIP_LINE_AT + GRIP_LINE_WIDTH / 2, shaft_r + 0.3, 'GripLine')
add_tube(shaft_top, STICK_LENGTH, KNOB_DIAMETER / 2, 'Knob', cap0=True, cap1=True)

# ------------------------------------------------------------------ normals --

normals = [[0.0, 0.0, 0.0] for _ in verts]
for (a, b, c, _) in tris:
    fn = v_cross(v_sub(verts[b], verts[a]), v_sub(verts[c], verts[a]))
    for i in (a, b, c):
        normals[i][0] += fn[0]; normals[i][1] += fn[1]; normals[i][2] += fn[2]
normals = [v_norm(tuple(nv)) for nv in normals]

# --------------------------------------------------------------- export --

out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'web', 'assets')
obj_path = os.path.join(out_dir, 'floorball_stick.obj')
mtl_path = os.path.join(out_dir, 'floorball_stick.mtl')

with open(mtl_path, 'w') as f:
    f.write("newmtl Blade\nKd 0.06 0.06 0.07\nKa 0.02 0.02 0.02\nNs 30\n\n")
    f.write("newmtl Shaft\nKd 0.92 0.92 0.90\nKa 0.2 0.2 0.2\nNs 60\n\n")
    f.write("newmtl Grip\nKd 0.08 0.08 0.09\nKa 0.02 0.02 0.02\nNs 5\n\n")
    f.write("newmtl GripLine\nKd 0.85 0.10 0.10\nKa 0.1 0.0 0.0\nNs 40\n\n")
    f.write("newmtl Knob\nKd 0.08 0.08 0.09\nKa 0.02 0.02 0.02\nNs 20\n")

with open(obj_path, 'w') as f:
    f.write("# IFF floorball stick - generated from SPCR 011 section 2.1.3 / drawings B1-B2.\n")
    f.write(f"# stick length {STICK_LENGTH:.0f}, lie {LIE_DEG:.0f} deg, blade {BLADE_HEIGHT:.0f} high, "
            f"{BLADE_THICKNESS:.0f} thick, hook {BLADE_HOOK:.0f}, bottom radius {R:.0f}.\n")
    f.write("# units: millimetres, origin = blade floor-contact point\n")
    f.write("mtllib floorball_stick.mtl\n")
    for v in verts:
        f.write(f"v {v[0]:.3f} {v[1]:.3f} {v[2]:.3f}\n")
    for nv in normals:
        f.write(f"vn {nv[0]:.4f} {nv[1]:.4f} {nv[2]:.4f}\n")
    cur = None
    for (a, b, c, mat) in tris:
        if mat != cur:
            f.write(f"usemtl {mat}\n")
            cur = mat
        f.write(f"f {a+1}//{a+1} {b+1}//{b+1} {c+1}//{c+1}\n")

span = max(p[0] for p in outline if p[1] < 80) - min(p[0] for p in outline)
print(f"blade span (y<80): {span:.1f} mm   toe lift: {bottom(TOE_ANGLE)[1]:.1f} mm")
print(f"vertices: {len(verts)}  triangles: {len(tris)}")
print(f"written: {obj_path}")
print(f"written: {mtl_path}")
