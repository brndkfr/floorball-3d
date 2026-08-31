// Lazy-loads OpenCV.js and wraps cv.solvePnP so the rest of photo-overlay/
// only deals with plain arrays/THREE types. OpenCV.js is NOT bundled in
// this repo (it's a multi-MB WASM build) - drop the official build at
// web/lib/opencv.js yourself; see docs/photo-overlay-plan.md.
import * as THREE from 'three';

let cvReadyPromise = null;

export function loadOpenCV() {
  if (cvReadyPromise) return cvReadyPromise;
  cvReadyPromise = new Promise((resolve, reject) => {
    if (window.cv && window.cv.solvePnP) { resolve(window.cv); return; }
    const script = document.createElement('script');
    script.src = 'lib/opencv.js';
    script.async = true;
    // This build (techstark/opencv-js) assigns `window.cv` as a PROMISE
    // (Emscripten's MODULARIZE pattern) that resolves with the real module
    // once the WASM runtime is up - it does NOT reliably call the classic
    // Module.onRuntimeInitialized hook the official opencv.js tutorials
    // use, which left this stuck pending forever when we waited on that
    // instead. Await window.cv itself (falling back to using it directly
    // if some other build ever makes it non-thenable).
    script.onload = async () => {
      try {
        const cv = (window.cv && typeof window.cv.then === 'function') ? await window.cv : window.cv;
        resolve(cv);
      } catch (err) {
        reject(err);
      }
    };
    script.onerror = () => reject(new Error('web/lib/opencv.js not found - see docs/photo-overlay-plan.md'));
    document.head.appendChild(script);
  });
  return cvReadyPromise;
}

// r/t are OpenCV world->camera extrinsics: row-major 3x3 rotation (X right,
// Y down, Z forward into the scene) and a 3x1 translation. Three.js cameras
// are Y-up and look down -Z, so the camera's world-space basis is R^T with
// its local Y/Z axes flipped - see docs/photo-overlay-plan.md Phase 1 step 4.
function composePose(r, t, fy, imgH) {
  const Rt = [
    [r[0], r[3], r[6]],
    [r[1], r[4], r[7]],
    [r[2], r[5], r[8]],
  ];
  const pos = new THREE.Vector3(
    -(Rt[0][0] * t[0] + Rt[0][1] * t[1] + Rt[0][2] * t[2]),
    -(Rt[1][0] * t[0] + Rt[1][1] * t[1] + Rt[1][2] * t[2]),
    -(Rt[2][0] * t[0] + Rt[2][1] * t[1] + Rt[2][2] * t[2]),
  );
  const m = new THREE.Matrix4().set(
    Rt[0][0], -Rt[0][1], -Rt[0][2], pos.x,
    Rt[1][0], -Rt[1][1], -Rt[1][2], pos.y,
    Rt[2][0], -Rt[2][1], -Rt[2][2], pos.z,
    0, 0, 0, 1,
  );
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(m);
  const fov = THREE.MathUtils.radToDeg(2 * Math.atan(imgH / (2 * fy)));
  return { position: pos, quaternion, fov };
}

// Mean pixel distance between each clicked landmark and where the solved
// pose would actually project its world point - the calibration-quality
// number shown in the panel. Plain pinhole projection with optional k1
// radial distortion (matches what solvePnP was given). Returns
// { mean, perPoint: number[] } in input order.
function reprojectionError(points, r, t, fx, fy, cx, cy, k1) {
  const perPoint = new Array(points.length);
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const [X, Y, Z] = p.world;
    const xc = r[0] * X + r[1] * Y + r[2] * Z + t[0];
    const yc = r[3] * X + r[4] * Y + r[5] * Z + t[1];
    const zc = r[6] * X + r[7] * Y + r[8] * Z + t[2];
    let xn = xc / zc, yn = yc / zc;
    if (k1) {
      const r2 = xn * xn + yn * yn;
      const s = 1 + k1 * r2;
      xn *= s; yn *= s;
    }
    const u = fx * xn + cx;
    const v = fy * yn + cy;
    const e = Math.hypot(u - p.image[0], v - p.image[1]);
    perPoint[i] = e;
    sum += e;
  }
  return { mean: sum / points.length, perPoint };
}

// points: [{ world:[x,y,z] mm, image:[px,py] }, ...], >=4 required (>=6
// recommended - see landmarks.js's MIN_LANDMARKS). Returns
// { position, quaternion, fov, reprojErrorPx } (THREE-ready) or throws.
export async function solveCameraPose(points, intrinsics, imgW, imgH) {
  const cv = await loadOpenCV();
  const n = points.length;
  const objMat = cv.matFromArray(n, 1, cv.CV_64FC3, points.flatMap((p) => p.world));
  const imgMat = cv.matFromArray(n, 1, cv.CV_64FC2, points.flatMap((p) => p.image));
  const { fx, fy, cx, cy, k1 = 0 } = intrinsics;
  const K = cv.matFromArray(3, 3, cv.CV_64F, [fx, 0, cx, 0, fy, cy, 0, 0, 1]);
  const dist = cv.matFromArray(5, 1, cv.CV_64F, [k1, 0, 0, 0, 0]);
  const rvec = new cv.Mat(), tvec = new cv.Mat(), R = new cv.Mat();
  try {
    const ok = cv.solvePnP(objMat, imgMat, K, dist, rvec, tvec, false, cv.SOLVEPNP_ITERATIVE);
    if (!ok) throw new Error('solvePnP did not converge - check landmark placement');
    // Levenberg-Marquardt refinement seeded with the iterative-PnP result.
    // Consistently sharpens the pose on real photos where landmark clicks
    // are noisy - especially helps when landmarks are spread far apart
    // (goal cluster + far boards). Guarded because not every opencv.js
    // build exposes the calib3d refinement helpers.
    if (typeof cv.solvePnPRefineLM === 'function') {
      try {
        const criteria = new cv.TermCriteria(
          cv.TermCriteria_EPS + cv.TermCriteria_MAX_ITER, 50, 1e-6,
        );
        cv.solvePnPRefineLM(objMat, imgMat, K, dist, rvec, tvec, criteria);
      } catch (err) {
        console.warn('solvePnPRefineLM failed, keeping unrefined pose:', err);
      }
    }
    cv.Rodrigues(rvec, R);
    const r = Array.from(R.data64F), t = Array.from(tvec.data64F);
    const pose = composePose(r, t, fy, imgH);
    const errs = reprojectionError(points, r, t, fx, fy, cx, cy, k1);
    pose.reprojErrorPx = errs.mean;
    pose.perPointErrorPx = errs.perPoint;
    // Reusable projector so photo-overlay.js can draw a live wireframe of the
    // world's reference geometry onto the photo canvas using the SAME
    // intrinsics + extrinsics as the solver - guarantees the preview matches
    // what Enter Photo View will show.
    pose.projectWorld = (X, Y, Z) => {
      const xc = r[0]*X + r[1]*Y + r[2]*Z + t[0];
      const yc = r[3]*X + r[4]*Y + r[5]*Z + t[1];
      const zc = r[6]*X + r[7]*Y + r[8]*Z + t[2];
      if (zc <= 0) return null; // behind camera
      let xn = xc / zc, yn = yc / zc;
      if (k1) {
        const r2 = xn * xn + yn * yn;
        const s = 1 + k1 * r2;
        xn *= s; yn *= s;
      }
      return [fx * xn + cx, fy * yn + cy];
    };
    return pose;
  } finally {
    objMat.delete(); imgMat.delete(); K.delete(); dist.delete();
    rvec.delete(); tvec.delete(); R.delete();
  }
}
