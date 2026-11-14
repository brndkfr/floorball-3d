// A-BACK-040: orbit rig for the 3D camera. Pure math (three-free); scene.js,
// selection.js and controls.js apply it to the perspective camera.
// Convention as everywhere else: yaw 0 looks along +Z, pitch < 0 looks
// down, and at yaw 0 the camera's right is world -X (the +PI offset in
// scene.js's setCameraLook, see CLAUDE.md "Coordinate conventions").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rigToCamera, cameraToRig, orbitBy, panBy, panGrab, panKeys, dollyBy, clampRig, lerpRig,
  fitRigToRink, projectToScreen, screenToFloor, ORBIT_LIMITS,
} from '../web/src/orbit-math.js';
import { RINK_L, HALF_W } from '../web/src/constants.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const deg = (d) => (d * Math.PI) / 180;
const RIG = { tx: 1000, tz: 15000, yaw: 0.7, pitch: deg(-35), dist: 12000 };

test('rigToCamera puts the camera behind and above the target, looking at it', () => {
  const c = rigToCamera({ tx: 0, tz: 10000, yaw: 0, pitch: deg(-30), dist: 10000 });
  assert.ok(near(c.x, 0));
  assert.ok(near(c.y, 5000, 1e-3));                 // dist * sin(30)
  assert.ok(near(c.z, 10000 - 10000 * Math.cos(deg(30)), 1e-3));
  assert.equal(c.yaw, 0);
  assert.ok(near(c.pitch, deg(-30)));
});

test('cameraToRig is the inverse of rigToCamera', () => {
  const r = cameraToRig(rigToCamera(RIG));
  for (const k of ['tx', 'tz', 'yaw', 'pitch', 'dist']) assert.ok(near(r[k], RIG[k], 1e-6), k);
});

test('cameraToRig keeps the camera position when it looks at or above the horizon', () => {
  // The walker / "view from ball" can look up; an orbit rig cannot. The
  // pitch is pulled to the shallowest allowed, the position stays.
  const cam = { x: 2000, y: 1600, z: 8000, yaw: 1.2, pitch: 0.3 };
  const r = cameraToRig(cam);
  assert.ok(near(r.pitch, ORBIT_LIMITS.maxPitch));
  const back = rigToCamera(r);
  assert.ok(near(back.x, cam.x, 1e-3) && near(back.y, cam.y, 1e-3) && near(back.z, cam.z, 1e-3));
  assert.equal(r.yaw, cam.yaw);
});

test('orbitBy turns around the target: target and distance stay', () => {
  const r = orbitBy(RIG, 120, 40);
  assert.equal(r.tx, RIG.tx);
  assert.equal(r.tz, RIG.tz);
  assert.equal(r.dist, RIG.dist);
  // same signs as the old look-drag: right -> yaw down, down -> pitch down
  assert.ok(r.yaw < RIG.yaw);
  assert.ok(r.pitch < RIG.pitch);
});

test('orbitBy never tips over the top or under the floor', () => {
  assert.ok(near(orbitBy(RIG, 0, 1e6).pitch, ORBIT_LIMITS.minPitch));
  assert.ok(near(orbitBy(RIG, 0, -1e6).pitch, ORBIT_LIMITS.maxPitch));
});

test('panBy: dragging right moves the target to the camera\'s left (+X at yaw 0)', () => {
  const base = { tx: 0, tz: 20000, yaw: 0, pitch: deg(-45), dist: 10000 };
  const r = panBy(base, 100, 0, { viewportH: 900, fovDeg: 45 });
  assert.ok(r.tx > 0);            // camera right is -X at yaw 0
  assert.ok(near(r.tz, base.tz));
  assert.equal(r.dist, base.dist);
});

test('panBy keeps the grabbed floor point under the cursor', () => {
  const view = { vw: 1440, vh: 900, fovDeg: 45 };
  const base = { tx: 0, tz: 20000, yaw: 0.4, pitch: deg(-50), dist: 15000 };
  const before = projectToScreen(base, { x: 0, y: 0, z: 20000 }, view);
  const r = panBy(base, 80, 0, { viewportH: view.vh, fovDeg: view.fovDeg });
  const after = projectToScreen(r, { x: 0, y: 0, z: 20000 }, view);
  assert.ok(near(after.x - before.x, 80, 0.5));
  assert.ok(near(after.y - before.y, 0, 0.5));
});

test('panGrab keeps a floor point grabbed anywhere on screen under the cursor', () => {
  const view = { vw: 1440, vh: 900, viewportH: 900, fovDeg: 70 };
  const base = { tx: 9000, tz: 20000, yaw: -1.4, pitch: deg(-27), dist: 7000 };
  const grabbed = { x: 3000, y: 0, z: 24000 };       // far from the window centre
  const from = projectToScreen(base, grabbed, view);
  const r = panGrab(base, from.x, from.y, from.x + 90, from.y + 40, view);
  const after = projectToScreen(r, grabbed, view);
  assert.ok(near(after.x, from.x + 90, 0.01) && near(after.y, from.y + 40, 0.01), `${after.x - from.x}, ${after.y - from.y}`);
  assert.equal(r.yaw, base.yaw);
  assert.equal(r.pitch, base.pitch);
  assert.equal(r.dist, base.dist);
});

test('panGrab still pans when the drag starts or ends over the horizon', () => {
  const view = { vw: 1440, vh: 900, viewportH: 900, fovDeg: 70 };
  const base = { tx: 0, tz: 20000, yaw: 0, pitch: deg(-10), dist: 10000 };
  const r = panGrab(base, 700, 10, 760, 10, view);    // sky
  assert.ok(Number.isFinite(r.tx) && Number.isFinite(r.tz));
  assert.ok(r.tx > base.tx);                           // same direction as panBy
  assert.ok(Math.hypot(r.tx - base.tx, r.tz - base.tz) < 5000);
});

test('panKeys: forward goes where the camera looks, right goes to its right', () => {
  const base = { tx: 0, tz: 20000, yaw: 0, pitch: deg(-45), dist: 10000 };
  const f = panKeys(base, 1, 0, 1000);
  assert.ok(near(f.tx, 0) && near(f.tz, 21000));
  const r = panKeys(base, 0, 1, 1000);
  assert.ok(near(r.tx, -1000) && near(r.tz, 20000));   // matches controls.js: rightX = -cos(yaw)
});

test('dollyBy: wheel up moves closer, wheel down away, within limits', () => {
  assert.ok(dollyBy(RIG, -100).dist < RIG.dist);
  assert.ok(dollyBy(RIG, 100).dist > RIG.dist);
  assert.equal(dollyBy(RIG, -1e9).dist, ORBIT_LIMITS.minDist);
  assert.equal(dollyBy(RIG, 1e9).dist, ORBIT_LIMITS.maxDist);
});

test('dollyBy keeps the pivot (floor point under the cursor) where it is on screen', () => {
  const view = { vw: 1440, vh: 900, fovDeg: 45 };
  const base = { tx: 0, tz: 20000, yaw: -1.1, pitch: deg(-40), dist: 20000 };
  const pivot = { x: 3000, z: 16000 };
  const before = projectToScreen(base, { x: pivot.x, y: 0, z: pivot.z }, view);
  const after = projectToScreen(dollyBy(base, -300, pivot), { x: pivot.x, y: 0, z: pivot.z }, view);
  assert.ok(near(after.x, before.x, 0.5) && near(after.y, before.y, 0.5));
});

test('clampRig keeps the target near the rink', () => {
  const r = clampRig({ tx: 1e6, tz: -1e6, yaw: 0, pitch: deg(-30), dist: 5000 });
  assert.equal(r.tx, HALF_W + ORBIT_LIMITS.targetMargin);
  assert.equal(r.tz, -ORBIT_LIMITS.targetMargin);
  const far = clampRig({ tx: 0, tz: 1e6, yaw: 0, pitch: deg(-30), dist: 5000 });
  assert.equal(far.tz, RINK_L + ORBIT_LIMITS.targetMargin);
});

test('lerpRig goes the short way round in yaw', () => {
  const a = { tx: 0, tz: 0, yaw: deg(170), pitch: deg(-20), dist: 1000 };
  const b = { tx: 100, tz: 200, yaw: deg(-170), pitch: deg(-40), dist: 3000 };
  const m = lerpRig(a, b, 0.5);
  assert.ok(near(Math.abs(m.yaw), Math.PI, 1e-9));   // through 180, not through 0
  assert.ok(near(m.tx, 50) && near(m.tz, 100) && near(m.dist, 2000) && near(m.pitch, deg(-30)));
  assert.deepEqual(lerpRig(a, b, 0), a);
  const end = lerpRig(a, b, 1);
  assert.ok(near(end.dist, b.dist) && near(Math.cos(end.yaw), Math.cos(b.yaw)) && near(Math.sin(end.yaw), Math.sin(b.yaw)));
});

test('projectToScreen: the target is at the window centre', () => {
  const p = projectToScreen(RIG, { x: RIG.tx, y: 0, z: RIG.tz }, { vw: 1440, vh: 900, fovDeg: 45 });
  assert.ok(near(p.x, 720, 1e-6) && near(p.y, 450, 1e-6));
});

test('pitch limits stay inside setCameraLook\'s clamp', () => {
  // scene.js clamps the applied pitch to +-1.4 rad. A rig pitch outside
  // that would be cut on the way to the camera and the target would drift.
  assert.ok(ORBIT_LIMITS.minPitch >= -1.4);
  assert.ok(ORBIT_LIMITS.maxPitch <= 1.4);
});

test('screenToFloor is the inverse of projectToScreen on the floor', () => {
  const view = { vw: 1440, vh: 900, fovDeg: 70 };
  const rig = { tx: 2000, tz: 18000, yaw: -1.2, pitch: deg(-35), dist: 14000 };
  for (const p of [{ x: 0, z: 20000 }, { x: -6000, z: 9000 }, { x: 8000, z: 31000 }]) {
    const s = projectToScreen(rig, { x: p.x, y: 0, z: p.z }, view);
    const back = screenToFloor(rig, s.x, s.y, view);
    assert.ok(back && near(back.x, p.x, 0.01) && near(back.z, p.z, 0.01), JSON.stringify(back));
  }
});

test('screenToFloor: no pivot above the horizon or far outside the rink', () => {
  const view = { vw: 1440, vh: 900, fovDeg: 70 };
  const rig = { tx: 0, tz: 20000, yaw: 0, pitch: deg(-10), dist: 10000 };
  assert.equal(screenToFloor(rig, 720, 0, view), null);       // top edge looks at the sky
  // just under the horizon the floor point is hundreds of metres away
  const horizonY = 450 - Math.tan(deg(10)) * (450 / Math.tan(deg(35)));
  assert.equal(screenToFloor(rig, 720, horizonY + 2, view), null);
});

test('fitRigToRink: the whole rink is inside the stage and fills it', () => {
  const insets = { left: 64, top: 52, right: 320, bottom: 170 };
  for (const [vw, vh] of [[1440, 900], [1920, 1080], [1024, 768], [820, 1180]]) {
    const view = { vw, vh, fovDeg: 45 };
    const rig = fitRigToRink({ ...view, insets });
    const xs = [], ys = [];
    for (const x of [-HALF_W, HALF_W]) for (const z of [0, RINK_L]) for (const y of [0, 500]) {
      const p = projectToScreen(rig, { x, y, z }, view);
      xs.push(p.x); ys.push(p.y);
    }
    const label = `${vw}x${vh}`;
    assert.ok(Math.min(...xs) >= insets.left - 0.5, `${label} left`);
    assert.ok(Math.max(...xs) <= vw - insets.right + 0.5, `${label} right`);
    assert.ok(Math.min(...ys) >= insets.top - 0.5, `${label} top`);
    assert.ok(Math.max(...ys) <= vh - insets.bottom + 0.5, `${label} bottom`);
    // fills it: the rink spans most of the stage in at least one direction
    const fillX = (Math.max(...xs) - Math.min(...xs)) / (vw - insets.left - insets.right);
    const fillY = (Math.max(...ys) - Math.min(...ys)) / (vh - insets.top - insets.bottom);
    assert.ok(Math.max(fillX, fillY) > 0.85, `${label} fill ${fillX.toFixed(2)} / ${fillY.toFixed(2)}`);
    // and it is centred on the stage, not on the window
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    assert.ok(Math.abs(cx - (insets.left + (vw - insets.left - insets.right) / 2)) < 4, `${label} centred`);
  }
});

test('fitRigToRink falls back to the whole window when the insets leave no room', () => {
  const rig = fitRigToRink({ vw: 300, vh: 200, fovDeg: 45, insets: { left: 200, right: 200, top: 0, bottom: 0 } });
  assert.ok(Number.isFinite(rig.dist) && rig.dist > 0);
});
