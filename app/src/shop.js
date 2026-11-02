import * as THREE from 'three';
import { plankTexture, concreteTexture } from './textures.js';
import { toon, glow } from './materials.js';
import { rng } from './rand.js';
import { potPlant, hangingPlant, treePlant } from './plants.js';

export const ROOM = { halfW: 6, front: -0.5, back: -15, height: 4.3 };

function plankMat(rx, ry, horizontal) {
  return toon('#ffffff', { map: plankTexture(rx, ry, horizontal) });
}

function shelfUnit(seed, w = 2.6) {
  const r = rng(seed);
  const g = new THREE.Group();
  const wood = plankMat(1, 1, true);
  const H = 2.6, D = 0.6;
  for (const x of [-w / 2, w / 2]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.08, H, D), wood);
    side.position.set(x, H / 2, 0);
    g.add(side);
  }
  const spineColors = ['#d9552b', '#e8b23a', '#2f6a8a', '#8a4a7a', '#4f8a3c', '#e8d6b0', '#2a2a2a', '#c4673d'];
  const spineGeo = new THREE.BoxGeometry(0.045, 0.34, 0.34);
  for (let l = 0; l < 4; l++) {
    const y = 0.15 + l * 0.62;
    const board = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, D), wood);
    board.position.set(0, y, 0);
    g.add(board);
    if (l < 3) {
      const n = Math.floor((w - 0.2) / 0.06);
      for (let i = 0; i < n; i++) {
        if (r() < 0.12) continue;
        const sp = new THREE.Mesh(spineGeo, toon(spineColors[Math.floor(r() * spineColors.length)]));
        sp.position.set(-w / 2 + 0.14 + i * 0.06, y + 0.2, 0.05 + (r() - 0.5) * 0.04);
        sp.rotation.z = (r() - 0.5) * 0.08;
        g.add(sp);
      }
    }
  }
  const back = new THREE.Mesh(new THREE.BoxGeometry(w, H, 0.04), toon('#c9a77c'));
  back.position.set(0, H / 2, -D / 2);
  g.add(back);
  return g;
}

function pendant(x, z, hang = 1.4) {
  const g = new THREE.Group();
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, hang, 4), toon('#222'));
  cord.position.y = -hang / 2;
  g.add(cord);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.4, 14, 1, true), toon('#2c2a2a', { side: THREE.DoubleSide }));
  shade.position.y = -hang - 0.1;
  g.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), glow('#ffe2a8'));
  bulb.position.y = -hang - 0.12;
  g.add(bulb);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), new THREE.MeshBasicMaterial({ color: '#ffb85a', transparent: true, opacity: 0.16, depthWrite: false }));
  halo.position.y = -hang - 0.15;
  g.add(halo);
  const light = new THREE.PointLight('#ffb866', 12, 10, 1.6);
  light.position.y = -hang - 0.3;
  g.add(light);
  g.position.set(x, ROOM.height, z);
  return g;
}

export function buildShop() {
  const root = new THREE.Group();
  const { halfW, front, back, height } = ROOM;
  const depth = front - back;
  const cz = (front + back) / 2;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2, depth), toon('#ffffff', { map: concreteTexture(6, 8) }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, cz);
  root.add(floor);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2, depth), plankMat(5, 2, false));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, height, cz);
  root.add(ceiling);
  // beams
  for (let i = 0; i < 5; i++) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2, 0.25, 0.3), toon('#8a5a32'));
    beam.position.set(0, height - 0.12, front - 1.5 - i * 3.1);
    root.add(beam);
  }

  const plaster = toon('#efe3cf');
  const wallL = new THREE.Mesh(new THREE.PlaneGeometry(depth, height), plaster);
  wallL.rotation.y = Math.PI / 2;
  wallL.position.set(-halfW, height / 2, cz);
  root.add(wallL);
  const wallR = new THREE.Mesh(new THREE.PlaneGeometry(depth, height), plaster);
  wallR.rotation.y = -Math.PI / 2;
  wallR.position.set(halfW, height / 2, cz);
  root.add(wallR);
  const wallB = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2, height), plaster);
  wallB.position.set(0, height / 2, back);
  root.add(wallB);
  const wallF = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2, height), plaster);
  wallF.rotation.y = Math.PI;
  wallF.position.set(0, height / 2, front);
  root.add(wallF);

  // wainscot of wood along the lower walls
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, depth), plankMat(1, 6, true));
    w.position.set(s * (halfW - 0.05), 0.5, cz);
    root.add(w);
  }

  // record shelves along both walls
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const u = shelfUnit(100 + i + (s > 0 ? 10 : 0));
      u.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
      u.position.set(s * (halfW - 0.4), 0, front - 4 - i * 3.0);
      root.add(u);
    }
  }

  // central crate bins (rack of vinyls to flip through)
  for (let i = 0; i < 2; i++) {
    const bin = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 0.7), plankMat(1, 1, true));
    bin.position.set(i ? 2.2 : -2.2, 0.4, front - 7.5 - i * 1.5);
    root.add(bin);
    const r = rng(300 + i);
    const cols = ['#d9552b', '#e8b23a', '#2f6a8a', '#8a4a7a', '#4f8a3c', '#e8d6b0'];
    for (let k = 0; k < 14; k++) {
      const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.55, 0.62), toon(cols[Math.floor(r() * cols.length)]));
      sleeve.position.set(bin.position.x - 0.9 + k * 0.136, 0.95, bin.position.z + (r() - 0.5) * 0.04);
      sleeve.rotation.x = (r() - 0.5) * 0.3;
      root.add(sleeve);
    }
  }

  // counter and stools at the back
  const counter = new THREE.Mesh(new THREE.BoxGeometry(6.4, 1.1, 0.9), plankMat(3, 1, false));
  counter.position.set(0, 0.55, back + 2.0);
  root.add(counter);
  const top = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.1, 1.1), toon('#9a6a3c'));
  top.position.set(0, 1.15, back + 2.0);
  root.add(top);
  for (let i = -2; i <= 2; i++) {
    const stool = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.07, 12), toon('#2a2a2c'));
    seat.position.y = 0.75;
    stool.add(seat);
    for (const [dx, dz] of [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.75, 5), toon('#1c1c1e'));
      leg.position.set(dx, 0.37, dz);
      stool.add(leg);
    }
    stool.position.set(i * 1.2, 0, back + 3.0);
    root.add(stool);
  }
  const blanket = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.6), toon('#b84a3a'));
  blanket.position.set(-4.2, 0.9, back + 1.0);
  root.add(blanket);
  const blanketStripe = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.04, 0.6), toon('#f0e6d0'));
  blanketStripe.position.set(-4.2, 0.98, back + 1.0);
  root.add(blanketStripe);

  // lamps
  const lampSpots = [[-2.8, -3], [2.8, -3], [-2.2, -8], [2.2, -8], [0, -12.5]];
  for (const [x, z] of lampSpots) root.add(pendant(x, z));

  // plants everywhere
  const hangSpots = [[-4.5, -2.5], [4.5, -2.5], [-2.0, -3.2], [-1.6, -5.5], [1.8, -5.8], [-4.8, -7], [4.8, -7.5], [-1.6, -9.5], [-3.5, -11], [3.6, -11.2], [-5.2, -4.5], [5.2, -4.6]];
  hangSpots.forEach(([x, z], i) => {
    const p = hangingPlant(500 + i, 0.45 + (i % 4) * 0.2);
    p.position.set(x, height, z);
    root.add(p);
  });
  const shelfTop = [[-5.55, -4.5], [-5.55, -7.5], [5.55, -4.5], [5.55, -10.5], [-5.55, -10.5]];
  shelfTop.forEach(([x, z], i) => {
    const p = potPlant(600 + i, 0.7);
    p.position.set(x * 0.92, 2.6, z);
    root.add(p);
  });
  const trees = [[-5.2, -1.6], [5.2, -1.6], [-5.2, -13.5], [5.2, -13.5], [-3.6, -9.8]];
  trees.forEach(([x, z], i) => {
    const t = treePlant(700 + i, 1.7 + (i % 3) * 0.4);
    t.position.set(x, 0, z);
    root.add(t);
  });
  const counterPlants = [[-2.8, 1.2], [2.6, 1.2], [0.2, 1.2]];
  counterPlants.forEach(([x, y], i) => {
    const p = potPlant(800 + i, 0.55);
    p.position.set(x, y, back + 2.0);
    root.add(p);
  });

  return root;
}
