// Station 5, the stacks: a floor-to-vault library shelf against the right wall with a rolling
// ladder. Records stand spines out over five levels among a few hundred painted filler spines;
// yours stand a little proud of the row. Hover one and it slides out of the row, then turns to face
// you. The shelf of 3 puts one record on each of three comfortable levels, the shelf of 24 fills all
// five; the fillers make it a library either way.
import * as THREE from 'three';
import { rng } from '../rand.js';
import { createRackCore, addBox, instancedBoxes, WOOD, paint, SLEEVE } from './common.js';
import { popTo, viewForward } from './pop.js';

const FW = 3.7, FH = 2.95, FD = 0.36;
const ZR = -0.195;                          // rear plane (the wall is at local z -0.25, its skirting at -0.2)
const ZC = ZR + FD / 2;                     // shelf centre in z
const BOARD = [0.10, 0.64, 1.18, 1.72, 2.26]; // top of each level's board
const REAL_Z = 0.1;                         // yours stand face-out in front of the filler spines (they stop at z 0.055)
const LEAN = 0.12;
const POP = 1.4;                            // a hovered record floats this far from the camera
const X0 = -1.62, X1 = 1.02;                // where the real records may stand (ladder lives at x 1.5)
const DIV = [-0.62, 0.62];                  // upright dividers
const ss = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const HUES = [0.04, 0.12, 0.58, 0.33, 0.95, 0.07, 0.5, 0.75];
const col = new THREE.Color();

function buildUnit(g) {
  const wood = paint('#9a6a3c'), back = paint('#6f4a2b'), board = WOOD.top, trim = WOOD.light;
  addBox(g, [FW, FH - 0.1, 0.02], back, [0, 0.1 + (FH - 0.1) / 2, ZR + 0.01]);
  for (const s of [-1, 1]) addBox(g, [0.05, FH, FD], wood, [s * (FW / 2 - 0.025), FH / 2, ZC]);
  for (const x of DIV) addBox(g, [0.03, FH - 0.3, 0.16], wood, [x, 0.1 + (FH - 0.3) / 2, ZR + 0.1]);
  addBox(g, [FW, 0.1, FD + 0.02], WOOD.dark, [0, 0.05, ZC + 0.01]);               // plinth
  BOARD.slice(1).forEach((y) => addBox(g, [FW, 0.04, FD], board, [0, y - 0.02, ZC]));
  addBox(g, [FW + 0.06, 0.17, FD + 0.04], trim, [0, 2.865, ZC + 0.01]);          // cornice
  addBox(g, [FW + 0.03, 0.03, FD + 0.02], wood, [0, 2.765, ZC + 0.01]);
  // brass rail the ladder rolls on, on three brackets under the cornice
  const brass = paint('#c9a85a');
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, FW - 0.2, 8), brass);
  rail.rotation.z = Math.PI / 2;
  rail.position.set(0, 2.7, 0.25);
  rail.castShadow = true;
  g.add(rail);
  for (const x of [-1.5, 0, 1.5]) addBox(g, [0.025, 0.07, 0.075], brass, [x, 2.73, 0.21]);
  // the ladder, leaning from the rail down to the floor
  const lw = paint('#7a5634'), x = 1.5, top = [0.27, 2.72], foot = [0.78, 0];
  const len = Math.hypot(top[1] - foot[1], top[0] - foot[0]);
  const tilt = -Math.atan2(foot[0] - top[0], top[1] - foot[1]);
  for (const s of [-1, 1]) addBox(g, [0.04, len, 0.035], lw, [x + s * 0.23, (top[1] + foot[1]) / 2, (top[0] + foot[0]) / 2], [tilt, 0, 0]);
  for (let y = 0.3; y < 2.7; y += 0.3) addBox(g, [0.46, 0.03, 0.035], lw, [x, y, foot[0] + (top[0] - foot[0]) * (y / top[1])]);
  for (const s of [-1, 1]) addBox(g, [0.05, 0.06, 0.07], WOOD.deep, [x + s * 0.23, 2.7, 0.25]); // rail hooks
}

export function createTallRack({ onPick }) {
  const core = createRackCore({ onPick, sign: { w: 1.25, h: 0.15 } });
  const rp = new THREE.Vector3(), sp = new THREE.Vector3(), pp = new THREE.Vector3(), fw = new THREE.Vector3();
  const rest = new THREE.Matrix4();
  const fillers = new THREE.Group();

  return core.contract({
    setup(c) {
      buildUnit(c.root);
      c.root.add(fillers);
      c.sign.mesh.position.set(0, 2.865, ZC + 0.01 + (FD + 0.04) / 2 + 0.004);
      c.tag.mesh.position.set(0.02, -SLEEVE / 2 - 0.03, 0.011);
    },

    items(c, items) {
      const n = items.length, r = rng(n * 17 + 5);
      const k = Math.min(BOARD.length, n);
      const used = [2, 3, 1, 4, 0].slice(0, k).sort((a, b) => b - a); // top to bottom
      let i = 0;
      const reserved = BOARD.map(() => []);
      used.forEach((lv, j) => {
        const m = Math.floor(n / k) + (j < n % k ? 1 : 0);
        for (let q = 0; q < m; q++, i++) {
          const s = c.sleeves[i];
          let x = X0 + ((X1 - X0) * (q + 0.5)) / m + (r() - 0.5) * 0.08 + (lv % 2 ? 0.05 : -0.05);
          for (const d of DIV) if (Math.abs(x - d) < 0.1) x = d + (x > d ? 0.11 : -0.11);
          s.x = x; s.lv = lv;
          s.yc = BOARD[lv] + SLEEVE / 2 + 0.004;
          s.z0 = REAL_Z;
          s.yaw = (r() - 0.5) * 0.08;
          s.roll = (r() - 0.5) * 0.03;
          rest.makeTranslation(x, s.yc, REAL_Z);
          c.picker.add(i, rest, [0.16, 0.165, 0.05]);
        }
      });
      // filler library: painted spines packed along every level, gaps where yours stand
      fillers.clear();
      const list = [];
      BOARD.forEach((y, lv) => {
        let x = -FW / 2 + 0.06;
        while (x < FW / 2 - 0.06 && list.length < 1100) {
          const hit = reserved[lv].find((q) => x + 0.02 > q[0] && x < q[1]);
          if (hit) { x = hit[1]; continue; }
          if (DIV.some((d) => Math.abs(x - d) < 0.03)) { x += 0.05; continue; }
          if (r() < 0.025) { x += 0.04 + r() * 0.08; continue; }
          const t = 0.012 + r() * 0.02, h = 0.27 + r() * 0.04, dd = 0.2 + r() * 0.03;
          const c0 = col.setHSL(HUES[Math.floor(r() * HUES.length)] + (r() - 0.5) * 0.05, 0.28 + r() * 0.38, 0.3 + r() * 0.4).getStyle();
          list.push({ p: [x + t / 2, y + h / 2 + 0.002, ZR + 0.02 + dd / 2], s: [t, h, dd], r: [0, 0, x > 1.2 && r() < 0.2 ? 0.18 : 0], c: c0 });
          x += t + 0.003;
        }
      });
      const m = instancedBoxes(list);
      m.castShadow = false;
      fillers.add(m);
    },

    layout(c, dt, camera, hovered) {
      const cam = c.camLocal;
      viewForward(fw, camera, c.root);
      c.sleeves.forEach((s) => {
        const L = s.lift;
        const p1 = ss(L / 0.4), p2 = ss((L - 0.3) / 0.7);
        const bump = 0.04 * Math.sin(s.bump * Math.PI);
        rp.set(s.x, s.yc + 0.02 * s.peek, s.z0 + 0.1 * s.peek);
        sp.set(s.x, s.yc + 0.03, 0.34 + bump);        // first it slides out of the row...
        popTo(pp, sp, cam, fw, POP, 0.5);             // ...then floats up close to you
        rp.lerp(sp, p1).lerp(pp, p2);
        rp.y += s.drop * 0.7;
        const dx = cam.x - rp.x, dz = cam.z - rp.z;
        const tyaw = Math.atan2(dx, dz);
        const tpitch = -Math.atan2(cam.y - rp.y, Math.hypot(dx, dz));
        s.mesh.position.copy(rp);
        s.mesh.scale.setScalar(1 + 0.3 * p2);
        s.mesh.rotation.set(-LEAN * (1 - p2) + tpitch * p2, s.yaw * (1 - p2) + tyaw * p2, s.roll * (1 - p2));
      });
    },
  });
}
