// Station 7, the courtyard: a little market stall, a trestle table under a striped awning with
// wooden crates of records on it, covers toward you. Digging works like at a real stall: point at a record and the ones in front
// of it flip forward over the crate's low front lip (fanned like a pile), the one you point at
// lifts a little and tips back to show its cover. One crate for a few records, up to four for 24.
// Lemon crates, a striped cloth and a painted title board dress the stall.
import * as THREE from 'three';
import { rng } from '../rand.js';
import { createRackCore, addBox, paint, WOOD, SLEEVE } from './common.js';
import { popTo, viewForward } from './pop.js';

const TABLE = 0.72;                 // table top height
const POP = 1.25;                   // a hovered record floats this far from the camera
const CW = 0.4;                     // crate outer width
const SP = 0.05;                    // record to record
const FLOOR = 0.06, LIP = 0.15;     // crate floor top and the low front
const LEAN = 0.2;
const WOODS = ['#c9a06a', '#b88a58', '#d0aa74', '#a87a4a'];
const ss = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();

const crateDepth = (per) => Math.min(0.62, Math.max(0.32, per * SP + 0.16));

// slatted crate (open top, low front) with the given wood; `closed` = a solid empty box to stand on
function buildCrate(parent, Dc, mat, { closed = false, height = LIP + 0.09 } = {}) {
  const g = new THREE.Group();
  parent.add(g);
  if (closed) {
    addBox(g, [CW, 0.26, Dc], mat, [0, 0.13, 0]);
    for (const y of [0.09, 0.18]) addBox(g, [CW + 0.006, 0.012, Dc + 0.006], WOOD.dark, [0, y, 0]);
    return g;
  }
  for (const x of [-0.12, 0.12]) addBox(g, [0.04, 0.03, Dc + 0.02], WOOD.dark, [x, 0.015, 0]);      // runners
  addBox(g, [CW - 0.04, 0.02, Dc], mat, [0, 0.05, 0]);                                              // floor
  for (const s of [-1, 1]) {
    for (const y of [0.105, 0.215]) addBox(g, [0.02, 0.09, Dc], mat, [s * (CW / 2 - 0.01), y, 0]);   // side slats
    addBox(g, [0.03, height + 0.02, 0.03], WOOD.dark, [s * (CW / 2 - 0.015), (height + 0.02) / 2 + 0.03, Dc / 2 - 0.015]);
    addBox(g, [0.03, height + 0.02, 0.03], WOOD.dark, [s * (CW / 2 - 0.015), (height + 0.02) / 2 + 0.03, -Dc / 2 + 0.015]);
  }
  addBox(g, [CW - 0.06, 0.09, 0.02], mat, [0, 0.105, Dc / 2 - 0.01]);                               // low front
  for (const y of [0.105, 0.215]) addBox(g, [CW - 0.06, 0.09, 0.02], mat, [0, y, -Dc / 2 + 0.01]);  // back
  return g;
}

export function createCratesRack({ onPick }) {
  const core = createRackCore({ onPick, sign: { w: 1.1, h: 0.14 }, tag: { w: 0.34, h: 0.1 } });
  const stall = new THREE.Group();
  const rest = new THREE.Matrix4();
  const lemonGeo = new THREE.IcosahedronGeometry(0.052, 1);
  const rp = new THREE.Vector3(), pp = new THREE.Vector3(), fw = new THREE.Vector3();

  // trestle table, awning on four poles, striped cloth on the front, fixed
  function buildStall() {
    const wood = paint('#a87a4a');
    addBox(stall, [2.1, 0.05, 1.3], paint('#c9a06a'), [0, TABLE - 0.025, 0]);
    for (const x of [-0.9, 0.9]) for (const z of [-0.5, 0.5]) addBox(stall, [0.06, TABLE - 0.05, 0.06], wood, [x, (TABLE - 0.05) / 2, z], [0, 0, x * 0.06]);
    for (const x of [-0.9, 0.9]) addBox(stall, [0.05, 0.05, 1.1], wood, [x, 0.2, 0]);
    // cloth hanging over the front edge, painted stripes
    for (let i = 0; i < 10; i++) addBox(stall, [0.21, 0.26, 0.012], paint(i % 2 ? '#f2e8d4' : '#c4673d'), [-0.945 + i * 0.21, TABLE - 0.15, 0.665]);
    // poles, awning stretched from the back (high) to the front (low), valance on the front edge
    for (const [x, z, h] of [[-1.0, -0.62, 2.15], [1.0, -0.62, 2.15], [-1.0, 0.68, 1.9], [1.0, 0.68, 1.9]]) addBox(stall, [0.05, h, 0.05], wood, [x, h / 2, z]);
    const len = Math.hypot(1.3, 0.25), tilt = Math.atan2(0.25, 1.3);
    for (let i = 0; i < 8; i++) {
      const m = addBox(stall, [0.27, 0.025, len], paint(i % 2 ? '#f2e8d4' : '#c4673d'), [-0.945 + i * 0.27, 2.03, 0.03], [tilt, 0, 0]);
      m.castShadow = true;
      addBox(stall, [0.27, 0.12, 0.012], paint(i % 2 ? '#f2e8d4' : '#c4673d'), [-0.945 + i * 0.27, 1.85, 0.7]);
    }
  }

  return core.contract({
    setup(c) {
      c.root.add(stall);
      buildStall();
      stall.userData.fixed = stall.children.length;
      c.tag.mesh.position.set(0.02, SLEEVE / 2 + 0.075, 0.012);
    },

    items(c, items) {
      const n = items.length, r = rng(n * 23 + 11);
      while (stall.children.length > stall.userData.fixed) stall.remove(stall.children[stall.children.length - 1]);
      const nc = n <= 6 ? 1 : n <= 12 ? 2 : n <= 18 ? 3 : 4;
      const per = Math.ceil(n / nc);
      // crate slots: [x, z]
      const slots = [[[0, 0.15]], [[-0.3, 0.15], [0.3, 0.15]],
        [[-0.3, 0.27], [0.3, 0.27], [0, -0.28]], [[-0.3, 0.27], [0.3, 0.27], [-0.3, -0.28], [0.3, -0.28]]][nc - 1];
      const crates = slots.map(([x, z], k) => ({
        x: x + (r() - 0.5) * 0.03, z: z + (r() - 0.5) * 0.04, up: TABLE, yaw: (r() - 0.5) * 0.08,
        Dc: crateDepth(per), start: k * per,
      }));
      crates.forEach((cr, k) => {
        const g = buildCrate(stall, cr.Dc, paint(WOODS[k % WOODS.length]));
        g.position.set(cr.x, cr.up, cr.z);
        g.rotation.y = cr.yaw;
      });
      // records in the crates
      c.sleeves.forEach((s, i) => {
        const cr = crates[Math.min(nc - 1, Math.floor(i / per))];
        s.cr = cr;
        s.k = i - cr.start;                       // 0 = front-most
        s.lx = (r() - 0.5) * 0.015;
        s.lean = LEAN + (r() - 0.5) * 0.08;
        const zb = cr.Dc / 2 - 0.075 - s.k * SP;  // bottom edge
        s.lz = zb - (SLEEVE / 2) * Math.sin(s.lean);
        s.ly = cr.up + FLOOR + (SLEEVE / 2) * Math.cos(s.lean);
        s.roll = (r() - 0.5) * 0.03;
        s.tip = 0;
        const pos = place(cr, s.lx, s.ly, s.lz);
        _q.setFromEuler(_e.set(-s.lean, cr.yaw, 0, 'YXZ'));
        rest.compose(pos, _q, _s);
        c.picker.add(i, rest, [0.16, 0.165, 0.028]);
      });
      // lemon crates at the table ends
      const lem = (x, z, up, yaw, full) => {
        const g = buildCrate(stall, 0.4, paint(WOODS[x > 0 ? 1 : 2]));
        g.position.set(x, up, z);
        g.rotation.y = yaw;
        if (full) for (let q = 0; q < 14; q++) {
          const m = new THREE.Mesh(lemonGeo, paint(q % 3 ? '#e6c23a' : '#d9b02e'));
          const lx = (r() - 0.5) * 0.24, lz = (r() - 0.5) * 0.26, ly = 0.1 + (q > 8 ? 0.07 : 0.0);
          m.position.set(x + lx * Math.cos(yaw) + lz * Math.sin(yaw), up + ly, z - lx * Math.sin(yaw) + lz * Math.cos(yaw));
          m.scale.set(1, 0.82, 1.15);
          m.rotation.y = r() * 3;
          m.castShadow = true;
          stall.add(m);
        }
      };
      lem(0.78, 0.05, TABLE, -0.3, true);
      lem(-0.78, 0.05, TABLE, 0.25, true);
      lem(-0.5, -0.1, 0.0, 0.1, true);           // one more under the table
      // the title board hangs between the back poles
      addBox(stall, [1.5, 0.22, 0.03], paint('#e8d9b8'), [0, 1.38, -0.62]);
      c.sign.mesh.position.set(0, 1.38, -0.62 + 0.018);
    },

    layout(c, dt, camera, hovered) {
      const cam = c.camLocal;
      viewForward(fw, camera, c.root);
      const hs = hovered >= 0 ? c.sleeves[hovered] : null;
      const kt = 1 - Math.exp(-14 * dt);
      c.sleeves.forEach((s) => {
        const cr = s.cr;
        // records in front of the hovered one (same crate) flip forward
        const d = hs && hs.cr === cr ? hs.k - s.k : 0;
        s.tip += ((d > 0 ? 1 : 0) - s.tip) * kt;
        s.dd = d > 0 ? Math.min(d, 6) : s.dd ?? 1;
        const L = s.lift, e = ss(L), t = ss(s.tip);
        // standing pose in crate space
        let ly = s.ly + 0.07 * s.peek + 0.03 * Math.sin(s.bump * Math.PI);
        let lz = s.lz + 0.01 * s.peek;
        let rx = -s.lean;
        // flipped pose: resting on the lip, fanned
        if (t > 0.001) {
          const dd = s.dd;
          const a = 0.92 + 0.07 * dd;
          const py = cr.up + LIP + 0.012 * (6 - dd) + 0.012, pz = cr.Dc / 2 - 0.01;
          const fy = py + 0.065 * Math.cos(a), fz = pz + 0.065 * Math.sin(a);
          ly += (fy - ly) * t; lz += (fz - lz) * t; rx += (a - rx) * t;
        }
        rp.copy(place(cr, s.lx, ly, lz));
        let yaw = cr.yaw, scale = 1;
        if (e > 0.001) {
          // the hovered one floats up out of the crate toward you and faces you
          popTo(pp, rp, cam, fw, POP, 0.5);
          rp.lerp(pp, e);
          const dx = cam.x - rp.x, dz = cam.z - rp.z;
          yaw += (Math.atan2(dx, dz) - cr.yaw) * e;
          rx += (-Math.atan2(cam.y - rp.y, Math.hypot(dx, dz)) - rx) * e;
          scale = 1 + 0.25 * e;
        }
        s.mesh.position.set(rp.x, rp.y + s.drop * 0.7, rp.z);
        s.mesh.scale.setScalar(scale);
        s.mesh.rotation.set(rx, yaw, s.roll * (1 - e) * (1 - t));
      });
    },
  });
}

// crate-space point -> rack space
const _out = new THREE.Vector3();
function place(cr, lx, ly, lz) {
  const c = Math.cos(cr.yaw), s = Math.sin(cr.yaw);
  return _out.set(cr.x + lx * c + lz * s, ly, cr.z - lx * s + lz * c);
}
