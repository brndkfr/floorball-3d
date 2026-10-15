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

The blade is perforated in the style of a Fat Pipe blade, traced by eye
from a product photo (not from manufacturer drawings): a closed rim, three
bands along the blade - pill-shaped slots on top, slanted cells in the
middle and bottom bands, with the toe openings following the toe curve -
and a solid heel/neck with two long slanted slots and a small oval. All
hole corners are rounded to >= 2 mm (rule g, blade edge radius).

Stick length is measured like appendix C2 "a": along the shaft axis from the
point where the axis meets the floor to the top of the knob.

Frame: units = millimetres, local origin = the blade's floor-contact point
(the lowest point of the 270 mm bottom-edge arc), floor = y 0. The blade
runs along X (toe at -X, heel at +X), the shaft rises from the heel toward
+X/+Y at the 60 deg lie, and the hook bulges the blade toward +Z, i.e. the
concave forehand faces -Z.

Output: floorball_stick.obj + floorball_stick.mtl

Part colours (defaults below) can be set per run, e.g.
    python generate_stick.py --blade 7ed321 --shaft ffffff --grip 111111
The app can also recolour each stick at runtime: web/src/stick-colors.js.
"""

import argparse
import math
import os

# default part colours (sRGB hex), overridable on the command line
COLORS = {
    'blade': '0f0f12',
    'shaft': 'ebebe6',
    'grip': '141417',
    'grip-line': 'd91a1a',
    'knob': None,           # None = same as the grip
}

def hex_color(v):
    v = v.lstrip('#')
    if len(v) != 6 or any(c not in '0123456789abcdefABCDEF' for c in v):
        raise argparse.ArgumentTypeError(f'expected a hex colour like 7ed321, got {v!r}')
    return v.lower()

parser = argparse.ArgumentParser(description='Generate the IFF floorball stick OBJ/MTL.')
for part, default in COLORS.items():
    parser.add_argument(f'--{part}', type=hex_color, default=default,
                        help=f'{part} colour, hex (default: {default or "grip colour"})')
args = parser.parse_args()

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

# Perforation layout - all estimates traced from a product photo. Band
# positions t are mm up from the bottom edge, s is mm along the blade's
# mid-height arc (0 = above the contact point, negative toward the toe).
RIM_WIDTH = 8.0             # closed frame along the outline
HOLE_MARGIN = 7.0           # holes keep at least this distance from the outline
BANDS = ((8.0, 29.0), (33.0, 50.0))   # bottom + middle band: slanted cells
TOP_BAND = (54.0, 68.0)     # top band: pill slots
CROSS_RIBS = (-58.0, -21.0, 16.0)  # cross rib centres at the blade's mid-height
CROSS_RIB_WIDTH = 4.0
CROSS_RIB_SLANT = 0.45      # s shift per mm of t: ribs lean toward the heel at the top
BAND_HEEL_END = 40.0        # cells stop here; the heel beyond is solid
TOE_OPENING_RADIUS = 30.0   # toe cells end on this circle round the toe-cap centre
TOP_SLOTS = (-68.0, -27.0, 14.0)  # pill slot centres
TOP_SLOT_LENGTH = 36.0
CELL_CORNER_RADIUS = 4.0    # >= 2 mm edge radius
HEEL_SLOTS = (((50.0, 42.0), (92.0, 80.0), 12.0),     # (start, end, width) in side-view XY
              ((78.0, 32.0), (122.0, 82.0), 12.0))
HEEL_OVAL = ((60.0, 22.0), (72.0, 25.0), 7.0)


assert STICK_LENGTH <= 1140
assert SHAFT_DIAMETER <= 35 and KNOB_DIAMETER <= 35
assert abs(GRIP_LINE_AT - 375) <= 20 and 2 <= GRIP_LINE_WIDTH <= 40
assert BLADE_BOTTOM_RADIUS <= 270 and 72 <= BLADE_HEIGHT <= 80
assert BLADE_THICKNESS >= 8 and BLADE_THICKNESS / 2 >= 2 and BLADE_HOOK <= 12
assert CELL_CORNER_RADIUS >= 2

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
    """Ear clipping for a simple CCW polygon (bridged holes allowed, so
    repeated coordinates are fine); returns index triples. Only reflex
    vertices can lie inside an ear, so only those are tested."""
    n = len(poly)
    prv = [(i - 1) % n for i in range(n)]
    nxt = [(i + 1) % n for i in range(n)]
    def cross2(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    def reflex(i):
        return cross2(poly[prv[i]], poly[i], poly[nxt[i]]) <= 1e-12
    def inside(p, a, b, c):
        return cross2(a, b, p) >= 0 and cross2(b, c, p) >= 0 and cross2(c, a, p) >= 0
    refl = {i for i in range(n) if reflex(i)}
    out = []
    remaining, i, stall = n, 0, 0
    while remaining > 3:
        a, b, c = poly[prv[i]], poly[i], poly[nxt[i]]
        ear = i not in refl and not any(
            inside(poly[j], a, b, c) for j in refl
            if j not in (prv[i], nxt[i]) and poly[j] not in (a, b, c))
        if ear:
            out.append((prv[i], i, nxt[i]))
            p, q = prv[i], nxt[i]
            nxt[p], prv[q] = q, p
            refl.discard(i)
            remaining -= 1
            for k in (p, q):
                if reflex(k): refl.add(k)
                else: refl.discard(k)
            i, stall = q, 0
        else:
            i = nxt[i]
            stall += 1
            if stall > remaining:
                raise RuntimeError('triangulation failed - outline self-intersects')
    out.append((prv[i], i, nxt[i]))
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
# Perforations. Holes are built in (s, t) blade coordinates, corners
# filleted, edges subdivided, then mapped onto the curved blade.
RM = R - BLADE_HEIGHT / 2
def st_to_xy(p):
    th, r = p[0] / RM, R - p[1]
    return (r * math.sin(th), R - r * math.cos(th))

def fillet(poly, radius, steps=5):
    """Round every corner of a closed polygon with up to `radius`."""
    out = []
    n = len(poly)
    for i in range(n):
        p, a, b = poly[i], poly[i - 1], poly[(i + 1) % n]
        la, lb = math.dist(p, a), math.dist(p, b)
        u = ((a[0] - p[0]) / la, (a[1] - p[1]) / la)
        w = ((b[0] - p[0]) / lb, (b[1] - p[1]) / lb)
        ang = math.acos(max(-1.0, min(1.0, u[0] * w[0] + u[1] * w[1])))
        d = min(radius / math.tan(ang / 2), 0.5 * la, 0.5 * lb)
        r = d * math.tan(ang / 2)
        bis = v_norm((u[0] + w[0], u[1] + w[1], 0))
        c = (p[0] + bis[0] * r / math.sin(ang / 2), p[1] + bis[1] * r / math.sin(ang / 2))
        p0 = (p[0] + u[0] * d, p[1] + u[1] * d)
        p1 = (p[0] + w[0] * d, p[1] + w[1] * d)
        a0 = math.atan2(p0[1] - c[1], p0[0] - c[0])
        a1 = math.atan2(p1[1] - c[1], p1[0] - c[0])
        da = (a1 - a0 + math.pi) % (2 * math.pi) - math.pi
        for k in range(steps + 1):
            out.append((c[0] + r * math.cos(a0 + da * k / steps), c[1] + r * math.sin(a0 + da * k / steps)))
    return out

def subdivide(poly, step=4.0):
    out = []
    for i in range(len(poly)):
        a, b = poly[i], poly[(i + 1) % len(poly)]
        k = max(1, int(math.dist(a, b) / step))
        out += [(a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k) for j in range(k)]
    return out

def dedupe(poly):
    out = []
    for p in poly:
        if not out or math.dist(p, out[-1]) > 0.05:
            out.append(p)
    if math.dist(out[0], out[-1]) < 0.05:
        out.pop()
    return out

def rib_s(s_mid, t):                                   # slanted cross rib centre at height t
    return s_mid + CROSS_RIB_SLANT * (t - BLADE_HEIGHT / 2)

holes_st = []
s_toe = TOE_ANGLE * RM
for (t0, t1) in BANDS:
    hw = CROSS_RIB_WIDTH / 2
    # toe cell: from the first cross rib to the toe-opening circle
    def toe_phi(t):
        return math.pi - math.asin(max(-1.0, min(1.0, (t - BLADE_HEIGHT / 2) / TOE_OPENING_RADIUS)))
    cell = [(rib_s(CROSS_RIBS[0], t0) - hw, t0), (rib_s(CROSS_RIBS[0], t1) - hw, t1)]
    f_top, f_bot = toe_phi(t1), toe_phi(t0)
    for k in range(9):
        ph = f_top + (f_bot - f_top) * k / 8
        cell.append((s_toe + TOE_OPENING_RADIUS * math.cos(ph),
                     BLADE_HEIGHT / 2 + TOE_OPENING_RADIUS * math.sin(ph)))
    holes_st.append(cell[::-1])
    ribs = list(CROSS_RIBS) + [None]
    for k in range(len(CROSS_RIBS)):
        lo = lambda t, m=CROSS_RIBS[k]: rib_s(m, t) + hw
        hi = (lambda t, m=ribs[k + 1]: rib_s(m, t) - hw) if ribs[k + 1] is not None \
            else (lambda t: rib_s(BAND_HEEL_END, t))
        holes_st.append([(lo(t0), t0), (hi(t0), t0), (hi(t1), t1), (lo(t1), t1)])
holes = [dedupe([st_to_xy(p) for p in subdivide(fillet(h, CELL_CORNER_RADIUS))]) for h in holes_st]
t0, t1 = TOP_BAND
for sc in TOP_SLOTS:                                   # pill slots, top band
    pill = [(sc - TOP_SLOT_LENGTH / 2, t0), (sc + TOP_SLOT_LENGTH / 2, t0),
            (sc + TOP_SLOT_LENGTH / 2, t1), (sc - TOP_SLOT_LENGTH / 2, t1)]
    holes.append(dedupe([st_to_xy(p) for p in subdivide(fillet(pill, (t1 - t0) / 2, 8))]))
for (a, b, w) in HEEL_SLOTS + (HEEL_OVAL,):            # heel slots, side-view XY
    d = v_norm((b[0] - a[0], b[1] - a[1], 0))
    nrm = (-d[1] * w / 2, d[0] * w / 2)
    slot = [(a[0] + nrm[0], a[1] + nrm[1]), (a[0] - nrm[0], a[1] - nrm[1]),
            (b[0] - nrm[0], b[1] - nrm[1]), (b[0] + nrm[0], b[1] + nrm[1])]
    if signed_area(slot) < 0:
        slot.reverse()
    holes.append(dedupe(subdivide(fillet(slot, w / 2, 8))))
for h in holes:                                        # CCW for the checks below
    if signed_area(h) < 0:
        h.reverse()

def point_in_poly(pt, poly):
    x, y = pt
    inside = False
    for i in range(len(poly)):
        (x0, y0), (x1, y1) = poly[i - 1], poly[i]
        if (y0 > y) != (y1 > y) and x < x0 + (y - y0) * (x1 - x0) / (y1 - y0):
            inside = not inside
    return inside

# every hole keeps HOLE_MARGIN from the outline and CROSS_RIB_WIDTH-ish from the others
def seg_dist(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    l2 = dx * dx + dy * dy
    t = 0 if l2 == 0 else max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2))
    return math.dist(p, (a[0] + dx * t, a[1] + dy * t))
def poly_dist(p, poly):
    return min(seg_dist(p, poly[i - 1], poly[i]) for i in range(len(poly)))
for k, h in enumerate(holes):
    for p in h:
        assert point_in_poly(p, outline) and poly_dist(p, outline) >= HOLE_MARGIN - 1e-6, \
            f'hole {k} too close to the blade outline at {p}'
    for j in range(k):
        assert min(poly_dist(p, holes[j]) for p in h) >= 3.0, f'holes {j} and {k} too close'

# Faces: the face outline (rings[0]) with every hole bridged in (Eberly's
# method: holes in order of decreasing max x, each joined to a vertex it
# can see along +x), then ear-clipped.
face = [((verts[i][0], verts[i][1]), rings[-1][i], rings[0][i]) for i in range(len(outline))]
hole_items = []
for h in holes:
    cw = h[::-1]
    fr = [add_vert((x, y, half_t + hook_z(x))) for x, y in cw]
    bk = [add_vert((x, y, -half_t + hook_z(x))) for x, y in cw]
    hole_items.append([(cw[i], fr[i], bk[i]) for i in range(len(cw))])
    wf = [add_vert(verts[i]) for i in fr]             # inner wall, own vertices
    wb = [add_vert(verts[i]) for i in bk]
    for i in range(len(cw)):
        j = (i + 1) % len(cw)
        add_tri(wf[i], wb[i], wb[j], 'Blade')
        add_tri(wf[i], wb[j], wf[j], 'Blade')

def bridge(outer, hole):
    mi = max(range(len(hole)), key=lambda i: hole[i][0][0])
    mx, my = hole[mi][0]
    best, bx = None, float('inf')
    for i in range(len(outer)):
        (x0, y0), (x1, y1) = outer[i][0], outer[(i + 1) % len(outer)][0]
        if (y0 - my) * (y1 - my) > 0 or y0 == y1:
            continue
        x = x0 + (my - y0) * (x1 - x0) / (y1 - y0)
        if mx <= x < bx:
            best, bx = i, x
    pi = best if outer[best][0][0] > outer[(best + 1) % len(outer)][0][0] else (best + 1) % len(outer)
    P, I = outer[pi][0], (bx, my)
    def tri_has(p, a, b, c):
        d1 = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
        d2 = (c[0] - b[0]) * (p[1] - b[1]) - (c[1] - b[1]) * (p[0] - b[0])
        d3 = (a[0] - c[0]) * (p[1] - c[1]) - (a[1] - c[1]) * (p[0] - c[0])
        return (d1 > 0 and d2 > 0 and d3 > 0) or (d1 < 0 and d2 < 0 and d3 < 0)
    cand = [i for i in range(len(outer)) if i != pi and tri_has(outer[i][0], (mx, my), I, P)]
    if cand:
        pi = max(cand, key=lambda i: ((outer[i][0][0] - mx) / (math.dist(outer[i][0], (mx, my)) + 1e-12),
                                      -math.dist(outer[i][0], (mx, my))))
    return outer[:pi + 1] + hole[mi:] + hole[:mi + 1] + outer[pi:]

merged = face
for h in sorted(hole_items, key=lambda h: -max(p[0][0] for p in h)):
    merged = bridge(merged, h)
for (i0, i1, i2) in triangulate([m[0] for m in merged]):
    add_tri(merged[i0][1], merged[i1][1], merged[i2][1], 'Blade')   # +Z face
    add_tri(merged[i0][2], merged[i2][2], merged[i1][2], 'Blade')   # -Z face

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
    for name, color, shininess in (('Blade', args.blade, 30), ('Shaft', args.shaft, 60),
                                   ('Grip', args.grip, 5), ('GripLine', args.grip_line, 40),
                                   ('Knob', args.knob or args.grip, 20)):
        kd = [int(color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
        f.write(f"newmtl {name}\nKd {kd[0]:.3f} {kd[1]:.3f} {kd[2]:.3f}\n"
                f"Ka {kd[0] * 0.2:.3f} {kd[1] * 0.2:.3f} {kd[2] * 0.2:.3f}\nNs {shininess}\n\n")

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
