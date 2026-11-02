import * as THREE from 'three';
import { rng } from './rand.js';
import { toon } from './materials.js';

const leafGeo = new THREE.SphereGeometry(1, 8, 6);
const greens = ['#4f8a3c', '#3f7a35', '#6aa04a', '#2f6a3a', '#7cb356'];
const leafMats = greens.map((c) => toon(c));
const potMats = ['#c4673d', '#d9b38a', '#4a4a52', '#e0d6c4'].map((c) => toon(c));
const potGeo = new THREE.CylinderGeometry(0.5, 0.36, 0.7, 10);

function leaf(r, scale, pos, rot) {
  const m = new THREE.Mesh(leafGeo, leafMats[Math.floor(r() * leafMats.length)]);
  m.scale.set(scale * 0.5, scale * 0.12, scale);
  m.position.copy(pos);
  m.rotation.set(rot.x, rot.y, rot.z);
  return m;
}

// A bushy plant in a pot. size ~1 is about 1m tall.
export function potPlant(seed = 1, size = 1) {
  const r = rng(seed);
  const g = new THREE.Group();
  const pot = new THREE.Mesh(potGeo, potMats[Math.floor(r() * potMats.length)]);
  pot.position.y = 0.35;
  g.add(pot);
  const n = 12 + Math.floor(r() * 8);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const tilt = 0.5 + r() * 0.8;
    const len = 0.7 + r() * 0.6;
    const dir = new THREE.Vector3(Math.sin(a) * Math.sin(tilt), Math.cos(tilt), Math.cos(a) * Math.sin(tilt));
    const pos = dir.clone().multiplyScalar(len * 0.55).add(new THREE.Vector3(0, 0.7, 0));
    const l = leaf(r, len * 0.55, pos, new THREE.Vector3(0, 0, 0));
    l.lookAt(l.position.clone().add(dir));
    g.add(l);
  }
  g.scale.setScalar(size);
  return g;
}

// A hanging plant: pot on a cord with trailing vines. Hangs from y=0 downward.
export function hangingPlant(seed = 1, drop = 1.2) {
  const r = rng(seed);
  const g = new THREE.Group();
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, drop, 4), toon('#2b2622'));
  cord.position.y = -drop / 2;
  g.add(cord);
  const pot = new THREE.Mesh(potGeo, potMats[Math.floor(r() * potMats.length)]);
  pot.scale.setScalar(0.5);
  pot.position.y = -drop - 0.15;
  g.add(pot);
  const top = -drop;
  for (let i = 0; i < 7; i++) {
    const a = r() * Math.PI * 2;
    const reach = 0.15 + r() * 0.2;
    const lenV = 0.3 + r() * 0.6;
    const segs = 6 + Math.floor(lenV * 4);
    for (let s = 0; s < segs; s++) {
      const t = s / segs;
      const pos = new THREE.Vector3(Math.sin(a) * (reach + t * 0.15), top - 0.05 - t * lenV, Math.cos(a) * (reach + t * 0.15));
      const l = leaf(r, 0.09 + r() * 0.05, pos, new THREE.Vector3(r() * 2, r() * 6, r() * 2));
      g.add(l);
    }
  }
  // bushy crown
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2;
    const pos = new THREE.Vector3(Math.sin(a) * 0.2, top + 0.15 + r() * 0.15, Math.cos(a) * 0.2);
    g.add(leaf(r, 0.2 + r() * 0.12, pos, new THREE.Vector3(r() * 1.5, r() * 6, r() * 1.5)));
  }
  return g;
}

// A tall floor plant (fiddle-leaf style): trunk with big leaves up top.
export function treePlant(seed = 1, height = 2.2) {
  const r = rng(seed);
  const g = new THREE.Group();
  const pot = new THREE.Mesh(potGeo, potMats[Math.floor(r() * potMats.length)]);
  pot.scale.set(1.3, 1.3, 1.3);
  pot.position.y = 0.45;
  g.add(pot);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, height, 6), toon('#6b4a2c'));
  trunk.position.y = height / 2 + 0.4;
  g.add(trunk);
  for (let i = 0; i < 22; i++) {
    const a = r() * Math.PI * 2;
    const y = height * (0.45 + r() * 0.55) + 0.4;
    const rad = 0.2 + (1 - (y / (height + 0.4))) * 0.2 + r() * 0.35;
    const pos = new THREE.Vector3(Math.sin(a) * rad, y, Math.cos(a) * rad);
    const l = leaf(r, 0.4 + r() * 0.2, pos, new THREE.Vector3(0, 0, 0));
    l.lookAt(l.position.clone().add(new THREE.Vector3(Math.sin(a), 0.4, Math.cos(a))));
    g.add(l);
  }
  return g;
}

// Flowers for the window boxes outside.
export function flowerBox(seed = 1, width = 1.4) {
  const r = rng(seed);
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(width, 0.28, 0.32), toon('#7a4a2a'));
  g.add(box);
  const redMat = toon('#d63a2f');
  const ball = new THREE.SphereGeometry(0.09, 6, 5);
  for (let i = 0; i < 16; i++) {
    const x = (r() - 0.5) * width * 0.9;
    const leafM = leaf(r, 0.16, new THREE.Vector3(x, 0.2, (r() - 0.5) * 0.15), new THREE.Vector3(r(), r() * 6, r()));
    g.add(leafM);
    if (r() > 0.35) {
      const f = new THREE.Mesh(ball, redMat);
      f.position.set(x + (r() - 0.5) * 0.1, 0.3 + r() * 0.12, (r() - 0.5) * 0.15);
      g.add(f);
    }
  }
  return g;
}
