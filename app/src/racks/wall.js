// Station 4, the lounge record wall: covers faced out on painted picture ledges, one to three rows
// depending on how many records there are, hung a little irregularly like a real shop wall. Hover
// one and it leaves its ledge toward you, turns to look at you and the vinyl peeks out the top.
import * as THREE from 'three';
import { rng } from '../rand.js';
import { createRackCore, addBox, paint, WOOD, SLEEVE } from './common.js';
import { popNear, viewForward, stagePath } from './pop.js';

const WALL_Z = -0.08;       // the plaster is here (rack origin is 0.08 in front of it)
const LEAN = 0.1;           // covers lean back against the wall
const REST_Z = 0.005;       // centre of a resting cover
const ROWS_Y = { 1: [1.35], 2: [1.85, 1.2], 3: [2.1, 1.5, 0.9] }; // top row first
// few records get big covers, so a single ledge doesn't leave a bare wall
const sizeFor = (n) => (n <= 3 ? 0.62 : n <= 5 ? 0.46 : SLEEVE);
const rowsFor = (n) => (n <= 5 ? 1 : n <= 12 ? 2 : 3);
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();

export function createWallRack({ onPick }) {
  const core = createRackCore({ onPick, sign: { w: 1.2, h: 0.15 }, tag: { w: 0.46, h: 0.135 }, sleeve: (n) => ({ size: sizeFor(n) }) });
  const rp = new THREE.Vector3(), pp = new THREE.Vector3(), fw = new THREE.Vector3(), xp = new THREE.Vector3();
  const ledges = new THREE.Group();
  const rest = new THREE.Matrix4();
  const potGeo = new THREE.CylinderGeometry(0.035, 0.028, 0.06, 10);
  const leafGeo = new THREE.IcosahedronGeometry(0.045, 0);

  function ledge(y, xc, w, withPot) {
    addBox(ledges, [w, 0.03, 0.11], WOOD.light, [xc, y - 0.015, -0.02]);
    addBox(ledges, [w, 0.026, 0.012], WOOD.top, [xc, y + 0.013, 0.029]);
    for (const s of [-1, 1]) addBox(ledges, [0.03, 0.07, 0.09], WOOD.dark, [xc + s * (w / 2 - 0.16), y - 0.065, -0.03]);
    if (withPot) {
      const px = xc + withPot * (w / 2 - 0.07);
      const pot = new THREE.Mesh(potGeo, paint('#c4673d'));
      pot.position.set(px, y + 0.03, -0.02);
      const leaf = new THREE.Mesh(leafGeo, paint('#5d8a52'));
      leaf.position.set(px, y + 0.09, -0.02);
      leaf.scale.set(1, 1.2, 1);
      pot.castShadow = leaf.castShadow = true;
      ledges.add(pot, leaf);
    }
  }

  return core.contract({
    setup(c) {
      c.root.add(ledges);
      c.tag.mesh.position.set(0.02, -SLEEVE / 2 - 0.03, 0.012);
    },

    items(c, items) {
      const n = items.length, r = rng(n * 13 + 7);
      ledges.clear();
      const rows = rowsFor(n), ys = ROWS_Y[rows];
      const per = ys.map((_, k) => Math.floor(n / rows) + (k < n % rows ? 1 : 0));
      const SZ = sizeFor(n);
      const pitch = Math.min(SZ * 1.18, 2.7 / Math.max(...per));
      let i = 0;
      ys.forEach((y0, row) => {
        const m = per[row];
        const w = m * pitch + 0.3 + (SZ - SLEEVE) * 0.4;
        const xc = (r() - 0.5) * 0.16;
        const y = y0 + (r() - 0.5) * 0.03;
        ledge(y, xc, w, row === 0 && rows > 1 ? 1 : row === rows - 1 && rows === 1 ? -1 : 0);
        for (let q = 0; q < m; q++, i++) {
          const s = c.sleeves[i];
          s.x = xc - ((m - 1) * pitch) / 2 + q * pitch + (r() - 0.5) * 0.014;
          s.yc = y + (SZ / 2) * Math.cos(LEAN) + 0.002;
          s.tilt = -LEAN + (r() - 0.5) * 0.05;
          s.yaw = (r() - 0.5) * 0.07;
          s.roll = (r() - 0.5) * 0.05;
          s.push = 0;
          _q.setFromEuler(_e.set(s.tilt, 0, 0));
          rest.compose(new THREE.Vector3(s.x, s.yc, REST_Z), _q, _s);
          c.picker.add(i, rest, [Math.min(SZ / 2, pitch / 2), SZ / 2 + 0.01, 0.05]);
        }
      });
      c.tag.mesh.position.y = -SZ / 2 - 0.03;
      const top = ys[0];
      c.sign.mesh.position.set(0, top + SZ + 0.33 + (SZ - SLEEVE) * 0.5, WALL_Z + 0.012);
    },

    layout(c, dt, camera, hovered) {
      const cam = c.camLocal;
      const k = 1 - Math.exp(-10 * dt);
      viewForward(fw, camera, c.root);
      c.sleeves.forEach((s, i) => {
        const d = hovered < 0 ? 0 : i - hovered;
        const want = d === 0 || hovered < 0 || Math.abs(d) > 1 || c.sleeves[i].yc !== c.sleeves[hovered].yc ? 0 : Math.sign(d) * 0.025;
        s.push += (want - s.push) * k;
        const L = s.lift, e = L * L * (3 - 2 * L);
        rp.set(s.x + s.push, s.yc + 0.05 * s.peek + 0.03 * Math.sin(s.bump * Math.PI), REST_Z + 0.03 * s.peek);
        // off the wall first (straight out, still flat), then toward you and turning
        xp.copy(rp); xp.z += 0.07;
        popNear(pp, xp, cam, fw);
        const T = stagePath(_p, L, rp, xp, pp, { split: 0.35 });
        rp.copy(_p);
        const e2 = T;
        rp.y += s.drop * 0.7;
        const dx = cam.x - rp.x, dz = cam.z - rp.z;
        const tyaw = Math.atan2(dx, dz);
        const tpitch = -Math.atan2(cam.y - rp.y, Math.hypot(dx, dz));
        s.mesh.position.copy(rp);
        s.mesh.scale.setScalar(1 + 0.06 * e2);
        s.mesh.rotation.set(s.tilt + (tpitch - s.tilt) * e2, s.yaw + (tyaw - s.yaw) * e2, s.roll * (1 - e2));
      });
    },
  });
}
