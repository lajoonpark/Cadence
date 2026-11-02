// Station 2, the gallery's left wing: records leaning against the wall on a low painted plinth,
// face out, in up to three tiers of overlapping sleeves (a run of about 2.7 m for 24 records).
// The back tier stands on the top step with its upper edge resting on the wall; each tier in front
// is lower and lies back further, leaning on the one behind, so every cover shows from above.
// Hover lifts a record out over the run and turns it toward you.
import * as THREE from 'three';
import { rng } from '../rand.js';
import { createRackCore, addBox, paint, WOOD, THICK } from './common.js';

const WALL = -0.2;       // local z of the wall face
const PER_ROW = 8;
const TILTS = { 1: [0.2], 2: [0.2, 0.75], 3: [0.18, 0.6, 1.0] };
const STEP_Y = { 1: [0.1], 2: [0.15, 0], 3: [0.16, 0.08, 0] };   // height each tier stands at
const WASH = ['#4f7a74', '#b4503a', '#d9a64a'];
// a little bigger than a real LP so covers read from the rail; bigger still when there are few
const sizeFor = (n) => (n <= 3 ? 0.5 : n <= 8 ? 0.42 : 0.36);

export function createFloorleanRack({ onPick }) {
  let sz = sizeFor(24);
  const core = createRackCore({ onPick, sign: { w: 1.4, h: 0.19 }, tag: { w: 0.36, h: 0.106 }, sleeve: (n) => { sz = sizeFor(n); return { size: sz, thick: 0.016 }; } });
  const deco = new THREE.Group();
  const rest = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);

  // the plinth: nested steps against the wall, one per tier that stands above the floor
  function plinth(width, feet, ys) {
    deco.removeFromParent();
    deco.clear();
    feet.forEach((f, k) => {
      if (ys[k] <= 0) return;
      const d = f + 0.07 - WALL;
      addBox(deco, [width, ys[k] - 0.02, d], paint(WASH[k % 3]), [0, (ys[k] - 0.02) / 2, WALL + d / 2]);
      addBox(deco, [width + 0.04, 0.02, d + 0.03], WOOD.pale, [0, ys[k] - 0.01, WALL + d / 2 + 0.015]);
    });
    core.root.add(deco);
  }

  return core.contract({
    setup(c) {
      c.tag.mesh.rotation.z = 0.035;
      c.sign.mesh.position.set(0, 0.84, WALL + 0.012);
    },

    items(c, items) {
      const n = items.length;
      c.tag.mesh.position.set(0.02, -sz / 2 - 0.03, THICK / 2 + 0.004);
      const rows = Math.min(3, Math.ceil(n / PER_ROW));
      const perRow = Math.ceil(n / rows);
      const tilts = TILTS[rows], ys = STEP_Y[rows];
      const r = rng(n * 13 + 1);
      const pitch = perRow <= 4 ? sz + 0.12 : Math.min(0.34, 2.7 / perRow);
      const half = sz / 2;
      // each tier's top edge touches the face of the tier behind it (the first one touches the wall)
      const feet = [];
      tilts.forEach((t, k) => {
        if (k === 0) feet.push(WALL + 0.008 + sz * Math.sin(t));
        else {
          const topY = ys[k] + sz * Math.cos(t);
          const pt = tilts[k - 1];
          feet.push(feet[k - 1] - (topY - ys[k - 1]) * Math.tan(pt) + THICK * 1.2 + sz * Math.sin(t));
        }
      });
      const widest = (perRow - 1) * pitch + sz;
      plinth(widest + 0.3, feet, ys);
      c.sleeves.forEach((s, i) => {
        const row = Math.floor(i / perRow), col = i % perRow;
        const inRow = row === rows - 1 ? n - row * perRow : perRow;
        const t = tilts[row] + (r() - 0.5) * 0.03;
        // later sleeves in a tier overlap the earlier one a touch more forward, like a fanned hand of cards
        const x = (col - (inRow - 1) / 2) * pitch + (r() - 0.5) * 0.012;
        const foot = feet[row] + col * 0.011;
        s.tilt = t; s.rx = x;
        s.ry = ys[row] + half * Math.cos(t) + 0.008;
        s.rz = foot - half * Math.sin(t);
        s.roll = (r() - 0.5) * 0.04;
        s.yawRest = (r() - 0.5) * 0.06;
        s.frontZ = feet[rows - 1];
        e.set(-t, s.yawRest, s.roll, 'YXZ');
        q.setFromEuler(e);
        rest.compose(v.set(s.rx, s.ry, s.rz), q, one);
        c.picker.add(i, rest, [half + 0.012, half + 0.012, THICK / 2 + 0.016]);
      });
    },

    layout(c, dt) {
      const cam = c.camLocal;
      c.sleeves.forEach((s) => {
        const L = s.lift, m = s.mesh;
        const hx = s.rx * 0.9, hy = 0.42, hz = s.frontZ + 0.3;
        m.position.set(
          s.rx + (hx - s.rx) * L,
          s.ry + (hy - s.ry) * L + s.drop * 0.7 + 0.03 * s.peek + 0.06 * Math.sin(s.bump * Math.PI),
          s.rz + (hz - s.rz) * L + 0.05 * s.peek,
        );
        // turn the face toward the camera (it is looking down onto the run)
        const face = -Math.atan2(cam.y - m.position.y, Math.max(0.3, cam.z - m.position.z));
        m.rotation.set(-s.tilt * (1 - L) + face * L, s.yawRest * (1 - L), s.roll * (1 - L));
        m.scale.setScalar(1 + 0.18 * L);
      });
    },
  });
}
