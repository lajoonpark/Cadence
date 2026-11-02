// Station 0, the crate-digging table in the hall: sleeves stand in a long trough leaning in a row
// with their spines to you; slide the cursor along it and the one under it lifts out, turns to face
// you and shows its cover and a paper tag with the name. Click to play it.
import * as THREE from 'three';
import { rng } from '../rand.js';
import { createRackCore, addBox, WOOD, SLEEVE, THICK, smooth } from './common.js';

export const RACK_POS = new THREE.Vector3(0, 0, -5.6);
const TABLE_H = 0.78;
const LEN = 2.1;               // trough length
const BASE = TABLE_H + 0.03;   // sleeves stand on the trough floor
const REST_YAW = 1.3;          // mostly edge-on, a sliver of cover showing
const LIFT = 0.3, FORWARD = 0.22, TILT_BACK = -0.26;

function buildTable(g) {
  const { dark: wood, top, light: trough } = WOOD;
  addBox(g, [2.4, 0.05, 0.62], top, [0, TABLE_H - 0.025, 0]);
  for (const x of [-1.1, 1.1]) for (const z of [-0.24, 0.24]) addBox(g, [0.07, TABLE_H - 0.05, 0.07], wood, [x, (TABLE_H - 0.05) / 2, z]);
  addBox(g, [2.3, 0.1, 0.02], wood, [0, TABLE_H - 0.1, 0.29]); // apron (the sign hangs here)
  addBox(g, [2.25, 0.03, 0.5], wood, [0, 0.18, 0]);            // low shelf
  // the trough: floor, a low lip in front, a taller back and rounded ends
  addBox(g, [LEN, 0.03, 0.42], trough, [0, TABLE_H + 0.015, -0.02]);
  addBox(g, [LEN, 0.07, 0.02], trough, [0, TABLE_H + 0.05, 0.19]);
  addBox(g, [LEN, 0.17, 0.02], trough, [0, TABLE_H + 0.1, -0.23]);
  for (const s of [-1, 1]) addBox(g, [0.025, 0.22, 0.44], trough, [s * (LEN / 2 + 0.012), TABLE_H + 0.11, -0.02]);
}

export function createTroughRack({ onPick }) {
  const core = createRackCore({ onPick, sign: { w: 1.2, h: 0.15 } });
  const rest = new THREE.Matrix4();

  return core.contract({
    setup(c) {
      buildTable(c.root);
      c.sign.mesh.position.set(0, TABLE_H - 0.1, 0.302);
      c.tag.mesh.position.set(0.02, -SLEEVE / 2 - 0.03, THICK / 2 + 0.004);
      c.tag.mesh.rotation.z = 0.035;
    },

    items(c, items) {
      const n = items.length;
      const spacing = Math.min(0.085, (LEN - 0.3) / Math.max(1, n - 1));
      const x0 = -((n - 1) * spacing) / 2 - 0.03;
      const r = rng(n * 31 + (c.shelf?.title?.length ?? 0));
      c.sleeves.forEach((s, i) => {
        s.x = x0 + i * spacing + (r() - 0.5) * 0.01;
        s.yaw = REST_YAW + (r() - 0.5) * 0.08;
        s.roll = (r() - 0.5) * 0.05;
        // thin slab in front of the row (like reading x off the front plane), a little past the ends
        const a = i === 0 ? -0.12 : 0, b = i === n - 1 ? 0.12 : 0;
        const y0 = BASE - 0.05, y1 = BASE + SLEEVE + LIFT + 0.12;
        rest.makeTranslation(s.x + (b + a) / 2, (y0 + y1) / 2, 0.06);
        c.picker.add(i, rest, [spacing / 2 + (b - a) / 2, (y1 - y0) / 2, 0.04]);
      });
    },

    layout(c, dt, camera, hovered) {
      const kPush = smooth(10, dt);
      c.sleeves.forEach((s, i) => {
        const d = hovered < 0 ? 0 : i - hovered;
        // neighbours lean away to make room, fading out over a few slots
        const push = d === 0 || hovered < 0 ? 0 : Math.sign(d) * 0.065 * Math.max(0, 1 - (Math.abs(d) - 1) / 4);
        s.pushed = (s.pushed ?? 0) + (push - (s.pushed ?? 0)) * kPush;
        const L = s.lift, m = s.mesh;
        m.position.set(
          s.x + s.pushed,
          BASE + SLEEVE / 2 + LIFT * L + 0.045 * s.peek + 0.06 * Math.sin(s.bump * Math.PI) + s.drop * 0.7,
          -0.02 + FORWARD * L,
        );
        m.rotation.set(TILT_BACK * L, s.yaw * (1 - L), s.roll * (1 - L) - s.pushed * 1.6);
      });
    },
  });
}
