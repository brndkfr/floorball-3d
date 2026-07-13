"""
Parametric 3D model of an IFF-certified floorball.

Dimensions from the IFF Material Regulations (SPCR 011 / SP-METHOD 1506),
section 2.2 "Ball":

    ball diameter        72 +/- 1 mm
    number of holes      26
    hole diameter        10 +/- 1 mm
    weight               23 +/- 1 g (not modelled - visual geometry only)
    colour               single, non-fluorescent; only white or red are
                          allowed for league play (SPCR 011 5.3.1) - this
                          model uses white, matching a typical match ball.

The regulations specify the hole COUNT and SIZE precisely, but not their
exact layout on the sphere - that's a manufacturing/mould detail the spec
doesn't dimension. The 26 holes here are distributed evenly using a
Fibonacci-sphere spiral, which is a reasonable stand-in, not a reproduction
of any specific manufacturer's hole pattern.

Holes are true openings now: the outer shell's mesh faces are carved away
inside each hole's circular footprint (skipped during sphere generation,
rather than covered by a decal), a short rim tube gives the opening visible
wall thickness, and a smaller, uncarved dark inner sphere sits just inside
the shell so looking into a hole shows a hollow interior instead of empty
space. The carved edge follows the sphere's own triangle grid rather than a
perfect circle, so a fairly fine tessellation is used to keep it looking
round; the rim tube's precise circular edge covers most of the remaining
jaggedness. The fine dimpled surface texture visible on real balls isn't
modelled - the spec's own tolerance for it (embossed pattern <=0.5mm) is far
below anything visible at this geometry scale.

Placed at the rink's centre spot, resting on the floor.

Output: ball.obj + ball.mtl (units = millimetres)
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

def add_carved_uv_sphere(center, radius, holes, hole_angular_radius, mat, stacks=64, slices=96):
    """UV sphere with faces skipped inside each hole's angular footprint -
    a true opening rather than a solid surface with a decal on top."""
    cos_thresh = math.cos(hole_angular_radius)

    def in_a_hole(direction):
        for hd in holes:
            dot = direction[0]*hd[0] + direction[1]*hd[1] + direction[2]*hd[2]
            if dot > cos_thresh:
                return True
        return False

    ring = []
    for s in range(stacks + 1):
        phi = math.pi * s / stacks
        row = []
        y = math.cos(phi)
        r = math.sin(phi)
        for t in range(slices):
            theta = 2 * math.pi * t / slices
            direction = (r * math.cos(theta), y, r * math.sin(theta))
            row.append((add_vert(add(center, scale(direction, radius))), direction))
        ring.append(row)

    for s in range(stacks):
        for t in range(slices):
            t2 = (t + 1) % slices
            i00, d00 = ring[s][t]
            i01, d01 = ring[s][t2]
            i10, d10 = ring[s + 1][t]
            i11, d11 = ring[s + 1][t2]
            avg = norm((d00[0]+d01[0]+d10[0]+d11[0], d00[1]+d01[1]+d10[1]+d11[1], d00[2]+d01[2]+d10[2]+d11[2]))
            if in_a_hole(avg):
                continue
            add_tri(i00, i01, i11, mat)
            add_tri(i00, i11, i10, mat)

def add_rim_tube(surface_pt, out_dir, radius, depth, mat, segments=20):
    """Short cylindrical rim wall giving a carved hole visible wall thickness."""
    inner_pt = add(surface_pt, scale(out_dir, -depth))
    up_ref = (0.0, 1.0, 0.0) if abs(out_dir[1]) < 0.9 else (1.0, 0.0, 0.0)
    right = norm(cross(out_dir, up_ref))
    up = norm(cross(right, out_dir))

    outer_ring, inner_ring = [], []
    for i in range(segments):
        theta = 2 * math.pi * i / segments
        offset = add(scale(right, radius * math.cos(theta)), scale(up, radius * math.sin(theta)))
        outer_ring.append(add_vert(add(surface_pt, offset)))
        inner_ring.append(add_vert(add(inner_pt, offset)))

    for i in range(segments):
        j = (i + 1) % segments
        add_tri(outer_ring[i], outer_ring[j], inner_ring[j], mat)
        add_tri(outer_ring[i], inner_ring[j], inner_ring[i], mat)

def fibonacci_sphere_dirs(n):
    """n evenly-distributed unit direction vectors on a sphere."""
    dirs = []
    golden_angle = math.pi * (3.0 - math.sqrt(5.0))
    for i in range(n):
        y = 1.0 - (i / (n - 1)) * 2.0
        r_at_y = math.sqrt(max(0.0, 1.0 - y * y))
        theta = golden_angle * i
        dirs.append((math.cos(theta) * r_at_y, y, math.sin(theta) * r_at_y))
    return dirs

# ------------------------------------------------------------- dimensions --

BALL_DIAMETER = 72.0
BALL_RADIUS = BALL_DIAMETER / 2
NUM_HOLES = 26
HOLE_RADIUS = 10.0 / 2
HOLE_ANGULAR_RADIUS = HOLE_RADIUS / BALL_RADIUS   # small-angle approximation, radians
RIM_DEPTH = 6.0            # visible wall thickness at each hole, purely visual (not spec'd)
INNER_WALL_GAP = 3.0       # shell-to-hollow-interior gap, purely visual (not spec'd)

# rink placement: centre spot, resting on the floor (y=0 plane)
# local-origin-centered: (0,0,0) is where the ball touches the floor, so the
# viewer can position/move it freely via object.position without fighting
# against a baked-in world coordinate.
BALL_CENTER = (0.0, BALL_RADIUS, 0.0)

# ------------------------------------------------------------------- ball --

hole_dirs = fibonacci_sphere_dirs(NUM_HOLES)

add_carved_uv_sphere(BALL_CENTER, BALL_RADIUS, hole_dirs, HOLE_ANGULAR_RADIUS, 'BallWhite')
add_carved_uv_sphere(BALL_CENTER, BALL_RADIUS - INNER_WALL_GAP, [], 0.0, 'BallInner', stacks=24, slices=32)

for d in hole_dirs:
    surface_pt = add(BALL_CENTER, scale(d, BALL_RADIUS))
    add_rim_tube(surface_pt, d, HOLE_RADIUS, RIM_DEPTH, 'BallWhite')

# --------------------------------------------------------------- export --

out_dir = os.path.dirname(os.path.abspath(__file__))
obj_path = os.path.join(out_dir, 'ball.obj')
mtl_path = os.path.join(out_dir, 'ball.mtl')

with open(mtl_path, 'w') as f:
    f.write("newmtl BallWhite\nKd 0.92 0.92 0.90\nKa 0.2 0.2 0.2\nNs 15\n\n")
    f.write("newmtl BallInner\nKd 0.05 0.05 0.05\nKa 0.01 0.01 0.01\nNs 5\n\n")

with open(obj_path, 'w') as f:
    f.write("# IFF floorball - generated from SPCR 011 / SP-METHOD 1506 section 2.2.\n")
    f.write("# 72mm diameter, 26 x 10mm true holes (evenly distributed - exact layout not specified).\n")
    f.write("# units: millimetres\n")
    f.write("mtllib ball.mtl\n")
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
