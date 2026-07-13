"""
First-pass blocky goalie figure, sized for a 10-11 year old, in a kneeling
"butterfly" stance (kit colours per the reference photo - black jersey/pants/
helmet/gloves, dark goalie kit).

There is no technical spec for a human body the way there is for the goal,
rink or ball - every dimension here is a rough, eyeballed estimate for a
child-sized goalie in a butterfly-style ready position, built from simple
primitives (boxes/cylinders/a sphere), NOT an anatomical or photogrammetric
reconstruction. This is explicitly a starting point to react to and refine
(pose, limb articulation, proportions, mask/cage detail, jersey graphics all
still TODO) rather than a finished model.

Local coordinate frame: origin (0,0,0) is the ground contact point centred
between the two leg pads; the figure faces +Z (chest/face pointing toward +Z).

Output: goalie.obj + goalie.mtl (units = millimetres)
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

def add_quad(p0, p1, p2, p3, mat):
    i0, i1, i2, i3 = add_vert(p0), add_vert(p1), add_vert(p2), add_vert(p3)
    add_tri(i0, i1, i2, mat)
    add_tri(i0, i2, i3, mat)

def add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])

def scale(a, s):
    return (a[0] * s, a[1] * s, a[2] * s)

def cross(a, b):
    return (a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0])

def norm(a):
    l = math.sqrt(a[0]**2 + a[1]**2 + a[2]**2)
    return (0.0, 0.0, 0.0) if l < 1e-9 else (a[0]/l, a[1]/l, a[2]/l)

def add_box(center, size, mat):
    sx, sy, sz = size
    hx, hy, hz = sx/2, sy/2, sz/2
    cx, cy, cz = center
    p = {
        'a': (cx-hx, cy-hy, cz-hz), 'b': (cx+hx, cy-hy, cz-hz),
        'c': (cx+hx, cy+hy, cz-hz), 'd': (cx-hx, cy+hy, cz-hz),
        'e': (cx-hx, cy-hy, cz+hz), 'f': (cx+hx, cy-hy, cz+hz),
        'g': (cx+hx, cy+hy, cz+hz), 'h': (cx-hx, cy+hy, cz+hz),
    }
    add_quad(p['a'], p['b'], p['c'], p['d'], mat)  # back
    add_quad(p['f'], p['e'], p['h'], p['g'], mat)  # front
    add_quad(p['e'], p['a'], p['d'], p['h'], mat)  # left
    add_quad(p['b'], p['f'], p['g'], p['c'], mat)  # right
    add_quad(p['d'], p['c'], p['g'], p['h'], mat)  # top
    add_quad(p['e'], p['f'], p['b'], p['a'], mat)  # bottom

def add_oriented_box_y(center, size, angle_deg, mat):
    """Box rotated by angle_deg around the Y (up) axis - used for the splayed leg pads."""
    sx, sy, sz = size
    hx, hy, hz = sx/2, sy/2, sz/2
    corners_local = [
        (-hx,-hy,-hz), (hx,-hy,-hz), (hx,hy,-hz), (-hx,hy,-hz),
        (-hx,-hy,hz), (hx,-hy,hz), (hx,hy,hz), (-hx,hy,hz),
    ]
    a = math.radians(angle_deg)
    cos_a, sin_a = math.cos(a), math.sin(a)
    def rot(p):
        x, y, z = p
        return (x*cos_a + z*sin_a, y, -x*sin_a + z*cos_a)
    w = [add(center, rot(p)) for p in corners_local]
    faces = [(0,1,2,3), (5,4,7,6), (4,0,3,7), (1,5,6,2), (3,2,6,7), (4,5,1,0)]
    for f in faces:
        add_quad(w[f[0]], w[f[1]], w[f[2]], w[f[3]], mat)

def add_cylinder(p0, p1, radius, mat, segments=14):
    tangent = norm((p1[0]-p0[0], p1[1]-p0[1], p1[2]-p0[2]))
    up_ref = (0.0, 1.0, 0.0) if abs(tangent[1]) < 0.9 else (1.0, 0.0, 0.0)
    right = norm(cross(tangent, up_ref))
    up = norm(cross(right, tangent))
    ring0, ring1 = [], []
    for i in range(segments):
        theta = 2 * math.pi * i / segments
        offset = add(scale(right, radius * math.cos(theta)), scale(up, radius * math.sin(theta)))
        ring0.append(add_vert(add(p0, offset)))
        ring1.append(add_vert(add(p1, offset)))
    for i in range(segments):
        j = (i + 1) % segments
        add_tri(ring0[i], ring0[j], ring1[j], mat)
        add_tri(ring0[i], ring1[j], ring1[i], mat)

def add_uv_sphere(center, radius, mat, stacks=20, slices=28):
    ring = []
    for s in range(stacks + 1):
        phi = math.pi * s / stacks
        row = []
        y = radius * math.cos(phi)
        r = radius * math.sin(phi)
        for t in range(slices):
            theta = 2 * math.pi * t / slices
            row.append(add_vert(add(center, (r*math.cos(theta), y, r*math.sin(theta)))))
        ring.append(row)
    for s in range(stacks):
        for t in range(slices):
            t2 = (t + 1) % slices
            add_tri(ring[s][t], ring[s][t2], ring[s+1][t2], mat)
            add_tri(ring[s][t], ring[s+1][t2], ring[s+1][t], mat)

# ------------------------------------------------------------- dimensions --
# All eyeballed for a ~140cm-standing 10-11yo in a kneeling butterfly stance.

PAD_LENGTH, PAD_WIDTH, PAD_THICK = 460.0, 200.0, 60.0
PAD_SPLAY_DEG = 35.0
PAD_CENTER_X, PAD_CENTER_Z = 165.0, 70.0

HIP_SIZE = (220.0, 140.0, 150.0)
HIP_CENTER = (0.0, 150.0, -10.0)

TORSO_SIZE = (240.0, 320.0, 150.0)
TORSO_CENTER = (0.0, 400.0, 0.0)

SHOULDER_Y = 560.0
SHOULDER_HALF_W = 130.0
HAND_OFFSET = (280.0, 690.0, 150.0)   # +/- x
ARM_RADIUS = 35.0
GLOVE_SIZE = (130.0, 140.0, 70.0)

NECK_RADIUS = 45.0
NECK_TOP_Y = 615.0

HEAD_RADIUS = 100.0
HEAD_CENTER = (0.0, NECK_TOP_Y + HEAD_RADIUS, 15.0)
FACE_RADIUS = 55.0
FACE_CENTER = (0.0, HEAD_CENTER[1] - 10.0, HEAD_CENTER[2] + HEAD_RADIUS - 25.0)

# ------------------------------------------------------------------ build --

for side in (-1, 1):
    add_oriented_box_y(
        (side * PAD_CENTER_X, PAD_THICK / 2, PAD_CENTER_Z),
        (PAD_WIDTH, PAD_THICK, PAD_LENGTH),
        side * PAD_SPLAY_DEG,
        'Gear',
    )

add_box(HIP_CENTER, HIP_SIZE, 'Gear')
add_box(TORSO_CENTER, TORSO_SIZE, 'Gear')

for side in (-1, 1):
    shoulder = (side * SHOULDER_HALF_W, SHOULDER_Y, 20.0)
    hand = (side * HAND_OFFSET[0], HAND_OFFSET[1], HAND_OFFSET[2])
    add_cylinder(shoulder, hand, ARM_RADIUS, 'Gear')
    add_box(hand, GLOVE_SIZE, 'Gear')

add_cylinder((0.0, SHOULDER_Y, 20.0), (0.0, NECK_TOP_Y, 20.0), NECK_RADIUS, 'Gear')
add_uv_sphere(HEAD_CENTER, HEAD_RADIUS, 'Gear')
add_uv_sphere(FACE_CENTER, FACE_RADIUS, 'Face')

# --------------------------------------------------------------- export --

out_dir = os.path.dirname(os.path.abspath(__file__))
obj_path = os.path.join(out_dir, 'goalie.obj')
mtl_path = os.path.join(out_dir, 'goalie.mtl')

with open(mtl_path, 'w') as f:
    f.write("newmtl Gear\nKd 0.03 0.03 0.035\nKa 0.01 0.01 0.01\nNs 20\n\n")
    f.write("newmtl Face\nKd 0.85 0.65 0.55\nKa 0.15 0.1 0.08\nNs 10\n\n")

with open(obj_path, 'w') as f:
    f.write("# First-pass blocky goalie figure (10-11yo, butterfly stance) - NOT anatomical.\n")
    f.write("# Local origin = ground contact point between the pads; figure faces +Z.\n")
    f.write("# units: millimetres\n")
    f.write("mtllib goalie.mtl\n")
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
