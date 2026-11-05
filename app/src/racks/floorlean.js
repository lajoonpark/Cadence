// Station 2, the gallery's left wing: records leaning against the wall on a low painted plinth,
// face out, in up to three tiers of overlapping sleeves (a run of about 2.7 m for 24 records).
// The back tier stands on the top step with its upper edge resting on the wall; each tier in front
// is lower and lies back further, leaning on the one behind, so every cover shows from above.
// Hover lifts a record out over the run and turns it toward you.
import * as THREE from 'three';
import { rng } from '../rand.js';
import { createRackCore, addBox, paint, WOOD, THICK } from './common.js';
import { stagePath } from './pop.js';

const FLICK = 0.5;        // rad a front-tier record tips forward to let the one behind it out

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
  const restP = new THREE.Vector3(), exitP = new THREE.Vector3(), hoverP = new THREE.Vector3();
  let tierTop = [];         // per tier: the top edge height of its records when tipped forward

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
      tierTop = tilts.map((t, k) => ys[k] + sz * Math.cos(Math.max(0, t - FLICK)));
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
        s.row = row; s.lastRow = row === rows - 1;
        e.set(-t, s.yawRest, s.roll, 'YXZ');
        q.setFromEuler(e);
        rest.compose(v.set(s.rx, s.ry, s.rz), q, one);
        c.picker.add(i, rest, [half + 0.012, half + 0.012, THICK / 2 + 0.016]);
      });
    },

    // A back-tier record is boxed in by the tier in front (whose tops rest on its face): those records
    // tip forward on their feet, like flicking through a bin, it rises straight up out from behind them
    // (leaning back a little more so its face stays off their top edges), comes forward over them and
    // only then turns to you. A front-tier record just lifts and turns.
    layout(c, dt, camera, hovered) {
      const cam = c.camLocal;
      const h = c.sleeves[hovered];
      const kf = 1 - Math.exp(-12 * dt);
      c.sleeves.forEach((s) => {
        const half = s.size / 2;
        const want = h && h !== s && s.row > h.row && Math.abs(s.rx - h.rx) < sz * 0.95 ? 1 : 0;
        s.flick = (s.flick ?? 0) + (want - (s.flick ?? 0)) * kf;
        const L = s.lift, m = s.mesh;
        // at rest (or tipped forward about its foot)
        const t = s.tilt - FLICK * s.flick;
        const fy = s.ry - half * Math.cos(s.tilt), fz = s.rz + half * Math.sin(s.tilt);
        restP.set(s.rx, fy + half * Math.cos(t) + 0.03 * s.peek + 0.06 * Math.sin(s.bump * Math.PI), fz - half * Math.sin(t) + 0.05 * s.peek);
        hoverP.set(s.rx, s.ry + (0.42 - s.ry) * 0.6, s.frontZ + 0.14);
        // out: up until its bottom edge clears the tops in front, drawn back as far as the wall allows
        const up = s.lastRow ? 0.04 : Math.max(0.04, tierTop[s.row + 1] + 0.03 + half * Math.cos(s.tilt) - s.ry);
        exitP.set(s.rx, restP.y + up, Math.max(WALL + 0.012 + half * Math.sin(s.tilt), restP.z - up * Math.tan(s.tilt)));
        // (a back-tier one waits a moment for the tier in front to tip out of its way)
        const T = stagePath(m.position, s.lastRow ? L : Math.max(0, (L - 0.15) / 0.85), restP, exitP, hoverP, { lead: s.lastRow ? 1 : 1.8 });
        m.position.y += s.drop * 0.7;
        // turn the face toward the camera (it is looking down onto the run)
        const face = -Math.atan2(cam.y - m.position.y, Math.max(0.3, cam.z - m.position.z));
        m.rotation.set(-t * (1 - T) + face * T, s.yawRest * (1 - T), s.roll * (1 - T));
        m.scale.setScalar(1 + 0.05 * T);
      });
    },
  });
}
