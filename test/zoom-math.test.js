// A-BACK-040 step 8: one zoom feel for the 2D wheel, the 3D wheel and pinch.
// Pure math (three-free); topdown-camera.js, scene.js and touch-controls.js
// apply it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  wheelDeltaPx, zoomFactor, pinchWheelDelta, zoomOrthoAt, WHEEL_LINE_PX, PINCH_WHEEL_BOOST,
} from '../web/src/zoom-math.js';
import { dollyBy } from '../web/src/orbit-math.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const RIG = { tx: 0, tz: 20000, yaw: 0.4, pitch: -0.7, dist: 20000 };

test('wheelDeltaPx passes pixels through and turns lines and pages into pixels', () => {
  assert.equal(wheelDeltaPx({ deltaY: -120, deltaMode: 0 }), -120);
  assert.equal(wheelDeltaPx({ deltaY: 3, deltaMode: 1 }), 3 * WHEEL_LINE_PX);
  assert.equal(wheelDeltaPx({ deltaY: 1, deltaMode: 2 }, 900), 900);
  assert.equal(wheelDeltaPx({ deltaY: -100 }), -100);   // no deltaMode: pixels
});

test('wheelDeltaPx boosts a touchpad pinch (wheel with ctrlKey)', () => {
  assert.equal(wheelDeltaPx({ deltaY: -4, deltaMode: 0, ctrlKey: true }), -4 * PINCH_WHEEL_BOOST);
  assert.ok(PINCH_WHEEL_BOOST > 1);
});

test('zoomFactor: wheel up (negative) zooms in, steps compose, 0 does nothing', () => {
  assert.equal(zoomFactor(0), 1);
  assert.ok(zoomFactor(-100) > 1.1 && zoomFactor(-100) < 1.25);   // one mouse notch, ~16 %
  assert.ok(zoomFactor(100) < 1);
  assert.ok(near(zoomFactor(-100) * zoomFactor(100), 1));
  // ten small touchpad events zoom exactly as much as one big one
  assert.ok(near(zoomFactor(-30) ** 10, zoomFactor(-300)));
});

test('the 3D dolly uses the same rate: distance shrinks by the 2D zoom factor', () => {
  for (const d of [-300, -40, 120]) {
    assert.ok(near(RIG.dist / dollyBy(RIG, d).dist, zoomFactor(d), 1e-9));
  }
});

test('pinchWheelDelta: fingers twice as far apart zoom in 2x, together zoom out', () => {
  assert.ok(near(zoomFactor(pinchWheelDelta(100, 200)), 2, 1e-9));
  assert.ok(near(zoomFactor(pinchWheelDelta(200, 100)), 0.5, 1e-9));
  assert.equal(pinchWheelDelta(150, 150), 0);
  assert.equal(pinchWheelDelta(0, 150), 0);   // no start distance: no jump
});

// World floor point under normalised device coords (ndcX, ndcY) of an
// orthographic top-down camera, as three.js projects it.
function floorAt(view, ndcX, ndcY) {
  const lx = (view.left + view.right) / 2 + (ndcX * (view.right - view.left)) / 2 / view.zoom;
  const ly = (view.top + view.bottom) / 2 + (ndcY * (view.top - view.bottom)) / 2 / view.zoom;
  return {
    x: view.x + view.rightAxis.x * lx + view.upAxis.x * ly,
    z: view.z + view.rightAxis.z * lx + view.upAxis.z * ly,
  };
}

// The 2D view's four rotations (scene.js UPS): camera up and right on the floor.
const ROTATIONS = [
  { upAxis: { x: 0, z: -1 }, rightAxis: { x: 1, z: 0 } },
  { upAxis: { x: 1, z: 0 }, rightAxis: { x: 0, z: 1 } },
  { upAxis: { x: 0, z: 1 }, rightAxis: { x: -1, z: 0 } },
  { upAxis: { x: -1, z: 0 }, rightAxis: { x: 0, z: -1 } },
];
// An off-centre frustum, as stageFrustum makes when a panel is docked.
const FRUSTUM = { left: -24000, right: 19000, top: 12500, bottom: -11000 };

test('zoomOrthoAt keeps the floor point under the cursor in place, in every 2D rotation', () => {
  for (const axes of ROTATIONS) {
    const view = { x: 1200, z: 19000, zoom: 1.3, ...FRUSTUM, ...axes };
    const before = floorAt(view, 0.6, -0.35);
    for (const factor of [1.5, 0.7]) {
      const next = zoomOrthoAt(view, factor, 0.6, -0.35);
      assert.ok(near(next.zoom, view.zoom * factor));
      const after = floorAt({ ...view, ...next }, 0.6, -0.35);
      assert.ok(near(after.x, before.x, 1e-6) && near(after.z, before.z, 1e-6), JSON.stringify({ axes, factor }));
    }
  }
});

test('zoomOrthoAt clamps the zoom and still keeps the point under the cursor', () => {
  const view = { x: 0, z: 20000, zoom: 7, ...FRUSTUM, ...ROTATIONS[1] };
  const before = floorAt(view, -0.4, 0.5);
  const next = zoomOrthoAt(view, 4, -0.4, 0.5, { min: 0.5, max: 8 });
  assert.equal(next.zoom, 8);
  const after = floorAt({ ...view, ...next }, -0.4, 0.5);
  assert.ok(near(after.x, before.x, 1e-6) && near(after.z, before.z, 1e-6));
  assert.equal(zoomOrthoAt({ ...view, zoom: 0.5 }, 0.1, 0, 0, { min: 0.5, max: 8 }).zoom, 0.5);
});

test('zoomOrthoAt at the window centre of a centred frustum does not move the camera', () => {
  const view = { x: 500, z: 18000, zoom: 1, left: -20000, right: 20000, top: 11000, bottom: -11000, ...ROTATIONS[0] };
  const next = zoomOrthoAt(view, 2, 0, 0);
  assert.ok(near(next.x, 500) && near(next.z, 18000));
});
