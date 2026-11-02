import * as THREE from 'three';
import { stoneTexture, cobbleTexture, stickerTexture } from './textures.js';
import { toon, glow } from './materials.js';
import { flowerBox } from './plants.js';

const STREET_HALF = 3.4;     // street is 6.8 wide
const STREET_LEN = 26;       // from z=0 (shop) to z=26

function stoneMat(rx, ry) {
  return toon('#ffffff', { map: stoneTexture(rx, ry) });
}

function lamp(x, y, z, side) {
  const g = new THREE.Group();
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.05), toon('#222'));
  arm.position.x = side * -0.25;
  g.add(arm);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), glow('#ffd58a'));
  bulb.position.x = side * -0.5;
  bulb.position.y = -0.1;
  g.add(bulb);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffb54a', transparent: true, opacity: 0.22, depthWrite: false }));
  halo.position.copy(bulb.position);
  g.add(halo);
  g.position.set(x, y, z);
  return g;
}

function sideWall(side) {
  const g = new THREE.Group();
  const x = side * (STREET_HALF + 2);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 9, STREET_LEN), stoneMat(3, 7));
  wall.position.set(x, 4.5, STREET_LEN / 2);
  g.add(wall);

  const faceX = side * STREET_HALF;
  // windows with shutters and flower boxes in bays along the wall
  for (let i = 0; i < 5; i++) {
    const z = 3.5 + i * 4.6;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.7, 1.2), toon('#3a2a22'));
    frame.position.set(faceX - side * 0.05, 5.1, z);
    g.add(frame);
    const pane = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.4, 0.9), glow(i % 2 ? '#ffcf84' : '#6e5a4c'));
    pane.position.set(faceX - side * 0.1, 5.1, z);
    g.add(pane);
    for (const s of [-1, 1]) {
      const sh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.6, 0.55), toon(i % 2 ? '#7a4a30' : '#5d6f52'));
      sh.position.set(faceX - side * 0.14, 5.1, z + s * 0.9);
      g.add(sh);
    }
    const fb = flowerBox(40 + i + (side > 0 ? 10 : 0), 1.5);
    fb.rotation.y = Math.PI / 2;
    fb.position.set(faceX - side * 0.3, 4.1, z);
    g.add(fb);
  }

  // ground-floor arched alcoves with warm stalls
  for (let i = 0; i < 3; i++) {
    const z = 5 + i * 7 + (side > 0 ? 1.5 : 0);
    const alcove = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.4, 2.2), glow('#2a1a12'));
    alcove.position.set(faceX + side * 0.0, 1.2, z);
    g.add(alcove);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.5, 14, 1, false, 0, Math.PI), glow('#2a1a12'));
    top.rotation.set(0, 0, Math.PI / 2);
    top.rotation.order = 'YXZ';
    top.rotation.y = Math.PI / 2;
    top.position.set(faceX, 2.4, z);
    g.add(top);
    const warm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.8, 1.7), glow(i % 2 ? '#e8a24a' : '#f2c46d'));
    warm.position.set(faceX - side * 0.28, 1.0, z);
    g.add(warm);
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 1.3), toon('#a8743a'));
    crate.position.set(faceX - side * 0.5, 0.25, z);
    g.add(crate);
    const fruitColors = ['#d9552b', '#e8b23a', '#7cb356'];
    for (let k = 0; k < 6; k++) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.11, 7, 6), toon(fruitColors[(i + k) % 3]));
      f.position.set(faceX - side * 0.5 + (k % 2) * 0.2 - 0.1, 0.6, z - 0.5 + (k / 5) * 1.0);
      g.add(f);
    }
  }

  g.add(lamp(faceX, 3.4, 9.5, side));
  g.add(lamp(faceX, 3.4, 17.5, side));
  g.add(lamp(faceX, 3.4, 4.2, side));
  return g;
}

function archBridge(z) {
  // One outline with the archway carved out of the bottom edge (no hole touching the boundary).
  const shape = new THREE.Shape();
  const w = STREET_HALF + 0.01, h = 9;
  const r = w - 0.5, base = 2.4;
  shape.moveTo(-w, 0);
  shape.lineTo(-r, 0);
  shape.lineTo(-r, base);
  shape.absarc(0, base, r, Math.PI, 0, true);
  shape.lineTo(r, 0);
  shape.lineTo(w, 0);
  shape.lineTo(w, h);
  shape.lineTo(-w, h);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 2.4, bevelEnabled: false });
  const tex = stoneTexture(2, 3);
  const m = new THREE.Mesh(geo, toon('#ffffff', { map: tex }));
  // extrude UVs are in world units; scale them so the texture reads as blocks
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.18, uv.getY(i) * 0.18);
  m.position.set(0, 0, z);
  const g = new THREE.Group();
  g.add(m);
  const win = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.3, 0.12), glow('#ffcf84'));
  win.position.set(0, 7.4, z + 2.45);
  g.add(win);
  return g;
}

function scooter(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 1.4), toon(color));
  body.position.y = 0.65;
  g.add(body);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.6), toon('#2a2220'));
  seat.position.set(0, 1.05, -0.2);
  g.add(seat);
  const front = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.9, 0.3), toon(color));
  front.position.set(0, 0.8, 0.65);
  g.add(front);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.07, 0.07), toon('#222'));
  bar.position.set(0, 1.3, 0.65);
  g.add(bar);
  const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.16, 12);
  const wheelMat = toon('#1c1a1c');
  for (const z of [-0.55, 0.65]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(0, 0.28, z);
    g.add(w);
  }
  return g;
}

// The whole outdoor scene: cobbles, flanking walls, an arch, scooters, and a shopfront at z=0
// with a real doorway. Returns pieces the intro animation needs.
export function buildStreet() {
  const root = new THREE.Group();

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(STREET_HALF * 2, STREET_LEN + 4), toon('#ffffff', { map: cobbleTexture(3, 14) }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, STREET_LEN / 2 + 1);
  root.add(ground);

  root.add(sideWall(-1));
  root.add(sideWall(1));
  root.add(archBridge(11));
  root.add(archBridge(21));

  const s1 = scooter('#d1342c'); s1.position.set(-2.3, 0, 14); s1.rotation.y = 0.15; root.add(s1);
  const s2 = scooter('#e8d6b0'); s2.position.set(2.5, 0, 7.5); s2.rotation.y = -0.2; root.add(s2);

  // Shopfront wall with a doorway, spanning wider than the street so it closes the view.
  const W = 9, H = 9, DW = 2.0, DH = 3.0;
  const shape = new THREE.Shape();
  shape.moveTo(-W, 0); shape.lineTo(-DW / 2, 0); shape.lineTo(-DW / 2, DH); shape.lineTo(DW / 2, DH); shape.lineTo(DW / 2, 0);
  shape.lineTo(W, 0); shape.lineTo(W, H); shape.lineTo(-W, H); shape.closePath();
  for (const cx of [-2.3, 2.3]) {
    const p = new THREE.Path();
    p.moveTo(cx - 0.9, 0.9); p.lineTo(cx + 0.9, 0.9); p.lineTo(cx + 0.9, 2.9); p.lineTo(cx - 0.9, 2.9); p.closePath();
    shape.holes.push(p);
  }
  const frontGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false });
  const uv = frontGeo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.18, uv.getY(i) * 0.18);
  const front = new THREE.Mesh(frontGeo, toon('#ffffff', { map: stoneTexture(1, 1) }));
  front.position.z = -0.5;
  root.add(front);

  // Warm glow behind the display windows.
  for (const cx of [-2.3, 2.3]) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.0), glow('#ffd9a0'));
    pane.position.set(cx, 1.9, -0.15);
    pane.material.transparent = true; pane.material.opacity = 0.55;
    root.add(pane);
  }

  // Door leaves hinged at the jambs, opening inward.
  const leafGeo = new THREE.BoxGeometry(DW / 2 - 0.02, DH - 0.02, 0.1);
  leafGeo.translate((DW / 2 - 0.02) / 2, 0, 0);
  const leaves = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * (DW / 2), DH / 2, -0.2);
    const leafMesh = new THREE.Mesh(leafGeo, toon('#2f5d50'));
    leafMesh.scale.x = -s;
    pivot.add(leafMesh);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.4), glow('#ffcf84'));
    glass.position.set(-s * 0.5, 0.35, 0.06);
    pivot.add(glass);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.05), toon('#d8b25c'));
    handle.position.set(-s * 0.9, -0.1, 0.1);
    pivot.add(handle);
    root.add(pivot);
    leaves.push({ pivot, side: s });
  }

  // Sticker-lettered sign above the door.
  const signTex = stickerTexture('CADENCE', { w: 1024, h: 256, size: 190 });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.05), new THREE.MeshBasicMaterial({ map: signTex, transparent: true }));
  sign.position.set(0, 4.35, 0.08);
  sign.rotation.z = -0.05;
  root.add(sign);
  const awning = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.12, 1.2), toon('#c4673d'));
  awning.position.set(0, 3.5, 0.6);
  awning.rotation.x = 0.12;
  root.add(awning);
  const fb = flowerBox(77, 1.6); fb.position.set(-4.4, 0.9, 0.35); root.add(fb);
  const fb2 = flowerBox(78, 1.6); fb2.position.set(4.4, 0.9, 0.35); root.add(fb2);
  root.add(lamp(-3.5 - 0.2, 3.7, 0.5, -1));
  root.add(lamp(3.5 + 0.2, 3.7, 0.5, 1));

  // the doorway lintel / jamb trim
  const trim = new THREE.Mesh(new THREE.BoxGeometry(DW + 0.3, 0.2, 0.6), toon('#3a2a22'));
  trim.position.set(0, DH + 0.1, -0.2);
  root.add(trim);

  return { root, leaves };
}
