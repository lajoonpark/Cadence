// Where a hovered record floats: pulled along the view toward the camera until it is `dist` away
// and drawn part of the way toward the middle of the screen, so it reads big and is never cut off
// by the edge of the frame. All vectors are in the rack's (or the turning part's) local space.
import * as THREE from 'three';

const _r = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Matrix4();

// the camera's viewing direction in `obj`'s space (obj.matrixWorld must be current)
export function viewForward(out, camera, obj) {
  camera.getWorldDirection(out);
  return out.transformDirection(_m.copy(obj.matrixWorld).invert());
}

export function popTo(out, p, cam, fwd, dist, centre = 0.5) {
  _r.copy(p).sub(cam);
  const len = _r.length() || 1;
  _r.divideScalar(len);
  _d.copy(_r).multiplyScalar(1 - centre).addScaledVector(fwd, centre).normalize();
  return out.copy(cam).addScaledVector(_d, Math.min(len, dist));
}
