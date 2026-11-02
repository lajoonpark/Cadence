// Fitting the case on screen: project its key points and nudge until they fill a rectangle of
// normalised device coordinates. Used to put the suitcase in a corner of the shop view (move the
// object) and to frame it in the small window (move the camera).
import * as THREE from 'three';

const v = new THREE.Vector3();

// Bounds of points (in `object`'s space) as the camera sees them, in NDC.
export function ndcBounds(points, object, camera) {
  object.updateWorldMatrix(true, false);
  camera.updateMatrixWorld();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of points) {
    v.copy(p).applyMatrix4(object.matrixWorld).project(camera);
    x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x);
    y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
  }
  return { x0, x1, y0, y1 };
}

// Moves `object` along its view ray (keeping its orientation) until its points sit in `rect`, with
// the bottom-left corner of their bounds on the rect's corner. `camera` is the camera that looks at it.
export function fitObject({ object, points, camera, rect, depth = 8 }) {
  const th = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  let cx = (rect.x0 + rect.x1) / 2, cy = (rect.y0 + rect.y1) / 2;
  const at = (d) => object.position.set(cx * th * camera.aspect * d, cy * th * d, -d);
  for (let i = 0; i < 8; i++) {
    at(depth);
    const b = ndcBounds(points, object, camera);
    const k = Math.max((b.x1 - b.x0) / (rect.x1 - rect.x0), (b.y1 - b.y0) / (rect.y1 - rect.y0));
    depth *= k;
    cx += rect.x0 - b.x0;
    cy += rect.y0 - b.y0;
  }
  at(depth);
  return depth;
}

// Moves the camera back along `dir` from `target` until the points fill `rect` (centred in it).
export function fitCamera({ camera, object, points, dir, target, rect, distance = 20 }) {
  const t = target.clone();
  const mid = { x: (rect.x0 + rect.x1) / 2, y: (rect.y0 + rect.y1) / 2 };
  const th = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const right = new THREE.Vector3(), up = new THREE.Vector3();
  for (let i = 0; i < 10; i++) {
    camera.position.copy(t).addScaledVector(dir, distance);
    camera.lookAt(t);
    camera.updateMatrixWorld();
    const b = ndcBounds(points, object, camera);
    const k = Math.max((b.x1 - b.x0) / (rect.x1 - rect.x0), (b.y1 - b.y0) / (rect.y1 - rect.y0));
    distance *= k;
    // slide the target so the bounds' centre lands on the rect's centre
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    up.setFromMatrixColumn(camera.matrixWorld, 1);
    t.addScaledVector(right, ((b.x0 + b.x1) / 2 - mid.x) * th * camera.aspect * distance);
    t.addScaledVector(up, ((b.y0 + b.y1) / 2 - mid.y) * th * distance);
  }
  camera.position.copy(t).addScaledVector(dir, distance);
  camera.lookAt(t);
  camera.updateMatrixWorld();
  return distance;
}
