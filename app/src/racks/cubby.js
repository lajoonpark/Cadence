// Station 1, the cubby shelf on the hall's right wall (under the gallery): a painted square-cube
// cabinet. Each cube holds a few records stood on their spines and ONE sleeve leaning face-out;
// that one is the item. Hover a cube and its sleeve slides out of the cube toward you, turns to
// face you and grows a little. The cabinet is sized to the shelf (a shelf of 3 is a small 3x2
// cabinet, 24 records fill 6x4).
import * as THREE from 'three';
import { rng } from '../rand.js';
import { createRackCore, addBox, instancedBoxes, paint, WOOD, SLEEVE, THICK } from './common.js';

const PITCH = 0.43;      // cube centre to centre
const INNER = 0.4;       // clear opening
const BOARD = 0.03;
const DEPTH = 0.36;
const BACK = -0.19;      // local z of the cabinet's back (the wall is at -0.2)
const LEG = 0.16;
const SPINES = ['#c4673d', '#e8b23a', '#3f6e6a', '#b84a3a', '#6a86a0', '#f2e8d4', '#6a3a4a', '#8aa05a', '#d08a8a', '#4a5a8a'];

function gridFor(n) {
  const cols = Math.min(6, Math.max(2, Math.ceil(Math.sqrt(n * 1.5))));
  const rows = Math.max(2, Math.ceil(n / cols));
  return { cols, rows };
}

export function createCubbyRack({ onPick }) {
  const core = createRackCore({ onPick, sign: { w: 1.1, h: 0.14 }, tag: { w: 0.34, h: 0.1 } });
  const cab = new THREE.Group();
  const rest = new THREE.Matrix4();
  const tmp = new THREE.Vector3();

  function buildCabinet(cols, rows, filled, r) {
    cab.removeFromParent();
    cab.clear();
    const W = cols * PITCH + BOARD, H = rows * PITCH + BOARD;
    const painted = paint('#cf9f66'), inner = paint('#7a5634'), plinth = paint('#8a5a32');
    // carcass: sides, shelves, dividers, back, top overhang, a low plinth on legs
    for (const s of [-1, 1]) addBox(cab, [BOARD, H, DEPTH], painted, [s * (W - BOARD) / 2, LEG + H / 2, BACK + DEPTH / 2]);
    for (let j = 0; j <= rows; j++) addBox(cab, [W, BOARD, DEPTH], painted, [0, LEG + BOARD / 2 + j * PITCH, BACK + DEPTH / 2]);
    for (let i = 1; i < cols; i++) addBox(cab, [BOARD, H, DEPTH], painted, [-W / 2 + BOARD / 2 + i * PITCH, LEG + H / 2, BACK + DEPTH / 2]);
    addBox(cab, [W - 0.02, H, 0.02], inner, [0, LEG + H / 2, BACK + 0.01]);
    addBox(cab, [W + 0.1, 0.045, DEPTH + 0.06], WOOD.top, [0, LEG + H + 0.022, BACK + DEPTH / 2 + 0.01]);
    addBox(cab, [W - 0.04, LEG - 0.02, DEPTH - 0.06], plinth, [0, (LEG - 0.02) / 2 + 0.02, BACK + DEPTH / 2]);
    // each cube's back is its own wash of colour; the covers pop against it
    const backs = [], bodies = [], spines = [], sides = [];
    const WASH = ['#7a5634', '#5e6a58', '#8a5a4a', '#4f5a74', '#7a6a3a'];
    // fillers: records standing on their spines, a few in each cube, more in the empty ones
    // (paper-coloured sides, painted spines)
    const PAPER_TONES = ['#e9dcc0', '#dccaa4', '#f0e6cf', '#d8c39a'];
    for (let k = 0; k < cols * rows; k++) {
      const col = k % cols, row = (k / cols) | 0;
      const cx = -W / 2 + BOARD + INNER / 2 + col * PITCH;
      const floor = LEG + BOARD + (rows - 1 - row) * PITCH;
      backs.push({ p: [cx, floor + INNER / 2, BACK + 0.022], s: [INNER, INNER, 0.004], c: WASH[(r() * WASH.length) | 0] });
      const isHero = k < filled;
      const n = isHero ? 3 + ((r() * 2) | 0) : 7 + ((r() * 5) | 0);
      const side = r() < 0.5 ? -1 : 1;
      sides.push(side);
      let x = cx + side * (INNER / 2 - 0.02);
      for (let q = 0; q < n; q++) {
        const t = 0.012 + r() * 0.01;
        const lean = q === n - 1 && !isHero ? 0.22 * -side : (r() - 0.5) * 0.03;
        const depth = isHero ? 0.2 : 0.3;  // behind a hero they stand further back, out of its way
        const z = isHero ? BACK + 0.03 + depth / 2 : BACK + 0.2;
        bodies.push({ p: [x, floor + 0.155, z], s: [t, 0.31, depth], r: [0, 0, lean], c: PAPER_TONES[(r() * 4) | 0] });
        spines.push({ p: [x, floor + 0.155, z + depth / 2 - 0.003], s: [t + 0.002, 0.31, 0.008], r: [0, 0, lean], c: SPINES[(r() * SPINES.length) | 0] });
        x -= side * (t + 0.004);
      }
    }
    cab.add(instancedBoxes(backs), instancedBoxes(bodies), instancedBoxes(spines));
    core.root.add(cab);
    cab.userData = { W, H, sides };
  }

  return core.contract({
    setup(c) {
      c.tag.mesh.position.set(0.02, -SLEEVE / 2 - 0.035, THICK / 2 + 0.004);
      c.tag.mesh.rotation.z = 0.03;
    },

    items(c, items) {
      const n = items.length;
      const { cols, rows } = gridFor(n);
      const r = rng(n * 17 + 5);
      buildCabinet(cols, rows, n, r);
      const { W, H, sides } = cab.userData;
      const sg = c.sign.mesh;
      sg.position.set(0, LEG + H + 0.045 + 0.1, BACK + DEPTH * 0.55);
      sg.rotation.x = -0.18;
      c.sleeves.forEach((s, i) => {
        const col = i % cols, row = (i / cols) | 0;
        const cx = -W / 2 + BOARD + INNER / 2 + col * PITCH;
        const floor = LEG + BOARD + (rows - 1 - row) * PITCH;
        // hero sleeve leans on the back, shifted off the little stack of spines
        const lean = 0.15 + (r() - 0.5) * 0.04;
        s.cx = cx - sides[i] * 0.04 + (r() - 0.5) * 0.02;
        s.cy = floor + (SLEEVE / 2) * Math.cos(lean) + THICK / 2;
        s.cz = BACK + 0.012 + (SLEEVE / 2) * Math.sin(lean);
        s.lean = lean;
        s.roll = (r() - 0.5) * 0.04;
        // kept inside the frame: the bottom row would otherwise lift its card and tag off the screen
        s.hover = new THREE.Vector3(cx * 0.9, Math.min(1.75, Math.max(0.7, floor + INNER / 2 + 0.03)), BACK + DEPTH + 0.13);
        rest.makeTranslation(cx, floor + INNER / 2, BACK + DEPTH + 0.02);
        c.picker.add(i, rest, [PITCH / 2, PITCH / 2, 0.05]);
      });
    },

    layout(c, dt) {
      const cam = c.camLocal;
      c.sleeves.forEach((s) => {
        const L = s.lift, m = s.mesh;
        const p = tmp.copy(s.hover);
        // a little further out and up while it is the playing (empty) sleeve
        m.position.set(
          s.cx + (p.x - s.cx) * L,
          s.cy + (p.y - s.cy) * L + s.drop * 0.7 + 0.025 * s.peek + 0.05 * Math.sin(s.bump * Math.PI),
          s.cz + (p.z - s.cz) * L + 0.06 * s.peek,
        );
        // face the camera when lifted: tip the top toward you or away to match its eye line
        const face = -Math.atan2(cam.y - m.position.y, Math.max(0.3, cam.z - m.position.z));
        m.rotation.set(-s.lean * (1 - L) + face * L, 0, s.roll * (1 - L));
        m.scale.setScalar(1 + 0.2 * L);
      });
    },
  });
}
