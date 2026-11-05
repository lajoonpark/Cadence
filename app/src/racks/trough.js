// Station 0, the crate-digging table in the hall: sleeves stand in a long trough leaning in a row
// with their spines to you; slide the cursor along it and the one under it lifts out with a neighbour
// each side, fanned like a hand of cards, all three facing you. The one under the cursor wears the
// paper tag with the name. Click to play it.
import * as THREE from 'three';
import { rng } from '../rand.js';
import { createRackCore, addBox, WOOD, SLEEVE, THICK, smooth } from './common.js';

export const RACK_POS = new THREE.Vector3(0, 0, -5.6);
const TABLE_H = 0.78;
const LEN = 2.1;               // trough length
const BASE = TABLE_H + 0.03;   // sleeves stand on the trough floor
const REST_YAW = 1.3;          // mostly edge-on, a sliver of cover showing
const LIFT = 0.3, FORWARD = 0.22, TILT_BACK = -0.26;
const FAN = 3, FAN_GAP = 0.27; // records up at once, and how far apart they stand
const RISE = SLEEVE + 0.05;    // straight up this far first, clear of the row, before it turns and fans out
const ss = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

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
  let fan = -1;          // the record the fan of three is built around (-1: none up)

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

    // Three up at once: the record under the cursor comes up with one neighbour each side, fanned out
    // like a hand of cards, so each is a big target. The fan stays put while the cursor is on any of
    // its three (the one under it is the hovered one, with the tag); it moves only when the cursor goes
    // back down to the row.
    pick(c, pointer, camera) {
      const i = c.picker.pick(pointer, camera, c.root);
      fan = i >= 0 ? i : -1;
      return i;
    },

    layout(c, dt, camera, hovered) {
      const n = c.sleeves.length;
      const kPush = smooth(10, dt);
      if (hovered < 0) fan = -1;            // cursor off the rack (or the rack not active)
      else if (fan < 0 || fan >= n) fan = hovered; // held by ?hover= for screenshots
      // the fan: three neighbours around the anchor, kept inside the row
      const first = fan < 0 ? -1 : Math.max(0, Math.min(n - FAN, fan - 1));
      const centre = first < 0 ? -1 : first + (Math.min(FAN, n) - 1) / 2;
      const members = [];
      if (first >= 0) for (let k = 0; k < Math.min(FAN, n); k++) members.push(first + k);
      c.held = members;
      const fanX = first < 0 ? 0 : members.reduce((a, j) => a + c.sleeves[j].x, 0) / members.length;
      c.sleeves.forEach((s, i) => {
        const inFan = members.includes(i);
        s.fanA = (s.fanA ?? 0) + ((inFan ? 1 : 0) - (s.fanA ?? 0)) * kPush;
        s.held = s.fanA;
        const k = inFan ? i - centre : 0;
        if (inFan) s.slot = k;
        const slot = s.slot ?? 0;
        // the rest of the row stays put: the fan rises straight up out of it, so nothing needs to make
        // room (rows leaning away by different amounts ran into each other)
        s.pushed = 0;
        const F = s.fanA, L = s.lift, m = s.mesh;
        const fx = fanX + slot * FAN_GAP;                 // where it stands in the fan
        // pulled straight up out of the row first (still edge-on, so it slides past its neighbours),
        // then it turns, steps forward and settles into the fan; down the same way
        // (the three spread apart and step forward before they turn and settle, so they never turn into each
        // other or come down onto the row)
        const up = ss(F / 0.4), spread = ss((F - 0.3) / 0.35), T = ss((F - 0.45) / 0.55);
        const fanY = LIFT * (1 - 0.12 * Math.abs(slot));
        m.position.set(
          (s.x + s.pushed) * (1 - spread) + fx * spread,
          BASE + SLEEVE / 2 + RISE * up + (fanY - RISE) * T + 0.04 * L + 0.045 * s.peek + 0.06 * Math.sin(s.bump * Math.PI) + s.drop * 0.7,
          -0.02 + (FORWARD + 0.05 * L - 0.03 * Math.abs(slot)) * spread, // in front of the row before it comes down
        );
        m.rotation.set(TILT_BACK * T, s.yaw * (1 - T) - slot * 0.12 * T, s.roll * (1 - T) - s.pushed * 1.6 * (1 - up) - slot * 0.09 * T);
      });
    },
  });
}
