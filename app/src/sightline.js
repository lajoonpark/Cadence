// How far the camera may slide at a station before scenery gets in the way.
// main.js slides the camera left (or down) so lifted records clear the suitcase (racks/common.js
// clearShift). A metre sideways can put a shelf's upright, a pillar or a wall between the camera and
// the rack. Measured once per station: rays from the station's own view hit the rack/room at a grid
// of points; a slide is allowed only if (almost) all of those points are still visible from the slid
// camera, and the camera does not pass through anything on the way.
// Records (mesh.userData.sleeve) never count as obstacles: they move, and they are what you look at.
import * as THREE from 'three';

const GRID_X = [-0.6, -0.3, 0, 0.3, 0.6];
const GRID_Y = [-0.3, 0, 0.3, 0.55];   // NDC; the bottom-left is the suitcase anyway
const STEPS = [1, 0.85, 0.7, 0.55, 0.4, 0.25, 0.1];
const SLACK = 0.25;    // metres: a hit this far short of the point means something is in the way
const ALLOW = 1;       // grid points that may be hidden (a lamp cord, a leaf)
const NEAR = 0.15;     // the camera's near plane plus a little: keep that much off any surface

const ray = new THREE.Raycaster();
const _s = new THREE.Sphere(), _o = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3();

function solid(o) {
  if (!o.isMesh || !o.geometry) return false;
  const m = Array.isArray(o.material) ? o.material[0] : o.material;
  return !!m && m.visible !== false && !(m.transparent && m.opacity < 0.35);
}

function sphereOf(o) {
  if (o.isInstancedMesh) {
    if (!o.boundingSphere) o.computeBoundingSphere();
    return _s.copy(o.boundingSphere).applyMatrix4(o.matrixWorld);
  }
  if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
  return _s.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
}

// visible solid meshes whose bounds reach the ball (centre, radius); skips `skip` subtrees and records
function gather(root, skip, centre, radius, out = []) {
  if (!root.visible || root.userData.sleeve || skip.includes(root)) return out;
  if (solid(root) && sphereOf(root).center.distanceTo(centre) < radius + _s.radius) out.push(root);
  for (const c of root.children) gather(c, skip, centre, radius, out);
  return out;
}

function firstHit(list, origin, dir, far) {
  ray.set(origin, dir);
  ray.near = 0;
  ray.far = far;
  const hit = ray.intersectObjects(list, false)[0];
  return hit ? hit.distance : Infinity;
}

// view = an object at the station's camera pose (looks down its -z); camera gives fov / aspect.
// Returns { left, down }: metres the camera may slide each way (up to max).
export function measureRoom(scene, view, camera, { skip = [], max = 1 } = {}) {
  scene.updateMatrixWorld();
  const origin = view.getWorldPosition(new THREE.Vector3());
  const q = view.getWorldQuaternion(new THREE.Quaternion());
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  const list = gather(scene, skip, _p.copy(origin).addScaledVector(fwd, 2.5), 5);
  const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const points = [];
  for (const gy of GRID_Y) for (const gx of GRID_X) {
    _d.set(gx * tanH * camera.aspect, gy * tanH, -1).normalize().applyQuaternion(q);
    const d = firstHit(list, origin, _d, 12);
    if (d < Infinity) points.push(origin.clone().addScaledVector(_d, d));
  }
  const room = (axis) => {
    const back = axis.clone().negate(); // left = -right, down = -up
    for (const f of STEPS) {
      const s = f * max;
      if (firstHit(list, origin, back, s + NEAR) < s + NEAR) continue; // it would go through something
      _o.copy(origin).addScaledVector(back, s);
      let hidden = 0;
      for (const p of points) {
        const dist = _d.subVectors(p, _o).length();
        _d.divideScalar(dist);
        if (firstHit(list, _o, _d, dist - SLACK) < dist - SLACK && ++hidden > ALLOW) break;
      }
      if (hidden <= ALLOW) return s;
    }
    return 0;
  };
  return {
    left: room(new THREE.Vector3(1, 0, 0).applyQuaternion(q)),
    down: room(new THREE.Vector3(0, 1, 0).applyQuaternion(q)),
  };
}

// The shift to use for what the records need (want = rack.clearShift: right / up in metres, x / y the
// rack's own choice) in the room there is. Sideways first, as before; down when sideways is blocked
// and down fits; otherwise as far as possible the way that leaves the least overlap.
export function fitShift(want, room, max, out) {
  out.x = out.y = 0;
  if (!want || (!want.x && !want.y)) return out;
  if (!room) { out.x = Math.min(max, want.x); out.y = Math.min(max, want.y); return out; }
  const r = want.right ?? want.x, u = want.up ?? want.y;
  const L = Math.min(max, room.left), D = Math.min(max, room.down);
  if (r <= L) out.x = r;
  else if (u <= D) out.y = u;
  else if (r - L <= u - D) out.x = L;
  else out.y = D;
  return out;
}
