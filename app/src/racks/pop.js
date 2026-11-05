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

// Hover pops are kept modest so a lifted record does not hide its neighbours: it ends at `frac` of its
// distance from the camera (0.8 = 20% closer, ~1.5x the area on screen), drawn `centre` of the way
// toward the middle of the view (a little, so it stays under the cursor).
export const POP_FRAC = 0.8, POP_CENTRE = 0.12;
export function popNear(out, p, cam, fwd, frac = POP_FRAC, centre = POP_CENTRE) {
  return popTo(out, p, cam, fwd, p.distanceTo(cam) * frac, centre);
}
// Out of the rack first, then on to the hover pose (Lajoon: records must not pass through the rack or
// each other). One smooth curve (a cubic Bezier rest -> exit -> target) instead of two straight legs:
// the record leaves along the slot (rest -> exit) and bends round toward the target without stopping
// at a corner. The first control point sits a little past `exit`, so it is properly out of the slot
// before the bend takes it sideways. L is the sleeve's lift (a spring, see Sleeve.step: soft start,
// small overshoot past 1 that the curve carries on smoothly). Returns the share of the turn (rotation
// and growth should follow it), 0 while the record is still leaving its slot. `lead` > 1 lets the
// target's depth (z) arrive sooner than its height, for records that must get in front of something
// before they can come down. `split` (0..1) is how much of the move belongs to leaving the slot.
const ss = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const _a = new THREE.Vector3();
export function stagePath(out, L, rest, exit, target, { split = 0.45, lead = 1 } = {}) {
  const s = Math.max(0, L), t = Math.min(1, s), k = 1 + split * 0.6;   // how far past exit the curve aims first
  _a.copy(exit).sub(rest).multiplyScalar(k).add(rest);                // first control point
  const bez = (u) => {
    const v = 1 - u;
    return [v * v * v, 3 * v * v * u, 3 * v * u * u, u * u * u];
  };
  const [a0, a1, a2, a3] = bez(s);
  out.set(
    rest.x * a0 + _a.x * a1 + exit.x * a2 + target.x * a3,
    rest.y * a0 + _a.y * a1 + exit.y * a2 + target.y * a3,
    0,
  );
  const sz = lead === 1 ? s : s > 1 ? s : 1 - Math.pow(1 - t, lead);
  const [b0, b1, b2, b3] = bez(sz);
  out.z = rest.z * b0 + _a.z * b1 + exit.z * b2 + target.z * b3;
  return ss((t - split * 0.65) / (1 - split * 0.65));
}
export function popTo(out, p, cam, fwd, dist, centre = 0.5) {
  _r.copy(p).sub(cam);
  const len = _r.length() || 1;
  _r.divideScalar(len);
  _d.copy(_r).multiplyScalar(1 - centre).addScaledVector(fwd, centre).normalize();
  return out.copy(cam).addScaledVector(_d, Math.min(len, dist));
}
