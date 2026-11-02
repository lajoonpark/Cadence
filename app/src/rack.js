// The record picker: a long rack of sleeves on a table in the hall. Sleeves stand leaning in a row
// with their spines to you; slide the cursor along the rack and the one under it lifts out, turns
// to face you and shows its cover and a paper tag with the name. Click to play it.
import * as THREE from 'three';
import { toon, crisp } from './materials.js';
import { rng } from './rand.js';
import { brushStroke, INK, PAPER } from './controls.js';

export const RACK_POS = new THREE.Vector3(0, 0, -5.6);
const TABLE_H = 0.78;
const LEN = 2.1;               // trough length
const SLEEVE = 0.31, THICK = 0.014;
const BASE = TABLE_H + 0.03;   // sleeves stand on the trough floor
const REST_YAW = 1.3;          // mostly edge-on, a sliver of cover showing
const LIFT = 0.3, FORWARD = 0.22, TILT_BACK = -0.26;
const MAX_ITEMS = 24;
import { FONT } from './style.js';

const smooth = (rate, dt) => 1 - Math.exp(-rate * dt);
const easeOut = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

// Text that shrinks until it fits.
function fitText(g, text, x, y, maxW, size, weight = '') {
  let s = size;
  do { g.font = `${weight} ${s}px ${FONT}`; s -= 2; } while (g.measureText(text).width > maxW && s > 12);
  g.fillText(text, x, y);
}

// A torn-paper tag: cream card with a ragged edge, title in ink, artist in sepia.
function drawTag(g, w, h, item, seed) {
  const r = rng(seed);
  g.clearRect(0, 0, w, h);
  g.beginPath();
  const pad = 10;
  g.moveTo(pad, pad + r() * 6);
  for (let x = pad; x <= w - pad; x += 14) g.lineTo(x, pad + r() * 6);
  for (let y = pad; y <= h - pad; y += 14) g.lineTo(w - pad - r() * 6, y);
  for (let x = w - pad; x >= pad; x -= 14) g.lineTo(x, h - pad - r() * 6);
  for (let y = h - pad; y >= pad; y -= 14) g.lineTo(pad + r() * 6, y);
  g.closePath();
  g.fillStyle = '#f7efdd';
  g.fill();
  g.strokeStyle = 'rgba(120,90,60,.35)';
  g.lineWidth = 3;
  g.stroke();
  g.textBaseline = 'middle';
  g.fillStyle = '#2b2436';
  fitText(g, item.title, 34, h * 0.4, w - 68, 76);
  g.fillStyle = '#7a5a40';
  fitText(g, item.subtitle || '', 36, h * 0.76, w - 72, 44);
}

// Spine colour from the cover: the average, deepened a little so the row reads as a painted band.
function averageColor(img) {
  const [c, g] = canvas(8, 8);
  g.drawImage(img, 0, 0, 8, 8);
  const d = g.getImageData(0, 0, 8, 8).data;
  let R = 0, G = 0, B = 0;
  for (let i = 0; i < d.length; i += 4) { R += d[i]; G += d[i + 1]; B += d[i + 2]; }
  const n = d.length / 4;
  return new THREE.Color(`rgb(${Math.round(R / n)},${Math.round(G / n)},${Math.round(B / n)})`).offsetHSL(0, 0.08, -0.04);
}

// Square cover from any thumbnail (video thumbnails are 16:9: crop the middle).
function coverTexture(url, onColor) {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#d9cbb2';
  g.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (!url) return tex;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const s = Math.min(img.width, img.height);
    g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 512, 512);
    tex.needsUpdate = true;
    try { onColor(averageColor(img)); } catch { /* tainted canvas: keep the default spine */ }
  };
  img.src = url;
  tex.userData.loaded = new Promise((res) => { img.addEventListener('load', res); img.addEventListener('error', res); });
  return tex;
}

function buildTable() {
  const g = new THREE.Group();
  const wood = toon('#8a5a32'), top = toon('#a8743a'), trough = toon('#b98a52');
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  add(new THREE.BoxGeometry(2.4, 0.05, 0.62), top, 0, TABLE_H - 0.025, 0);
  for (const x of [-1.1, 1.1]) for (const z of [-0.24, 0.24]) add(new THREE.BoxGeometry(0.07, TABLE_H - 0.05, 0.07), wood, x, (TABLE_H - 0.05) / 2, z);
  add(new THREE.BoxGeometry(2.3, 0.1, 0.02), wood, 0, TABLE_H - 0.1, 0.29); // apron (the sign hangs here)
  add(new THREE.BoxGeometry(2.25, 0.03, 0.5), wood, 0, 0.18, 0);            // low shelf
  // the trough: floor, a low lip in front, a taller back and rounded ends
  add(new THREE.BoxGeometry(LEN, 0.03, 0.42), trough, 0, TABLE_H + 0.015, -0.02);
  add(new THREE.BoxGeometry(LEN, 0.07, 0.02), trough, 0, TABLE_H + 0.05, 0.19);
  add(new THREE.BoxGeometry(LEN, 0.17, 0.02), trough, 0, TABLE_H + 0.1, -0.23);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.025, 0.22, 0.44), trough, s * (LEN / 2 + 0.012), TABLE_H + 0.11, -0.02);
  return g;
}

export function createRack({ onPick }) {
  const root = new THREE.Group();
  root.position.copy(RACK_POS);
  root.add(buildTable());

  // shelf sign on the table apron (temporary way to see which shelf you are on)
  const [signC, signG] = canvas(1024, 128);
  const signTex = new THREE.CanvasTexture(signC);
  signTex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.15), crisp({ map: signTex, alphaTest: 0.4 }));
  sign.position.set(0, TABLE_H - 0.1, 0.302);
  root.add(sign);

  // one paper tag, moved to whichever sleeve is lifted
  const [tagC, tagG] = canvas(640, 190);
  const tagTex = new THREE.CanvasTexture(tagC);
  tagTex.colorSpace = THREE.SRGBColorSpace;
  tagTex.anisotropy = 8;
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.1), crisp({ map: tagTex, alphaTest: 0.4 }));
  tag.position.set(0.02, -SLEEVE / 2 - 0.03, THICK / 2 + 0.004);
  tag.rotation.z = 0.035;
  tag.visible = false;

  const discGeo = new THREE.CylinderGeometry(0.145, 0.145, 0.004, 40);
  discGeo.rotateX(Math.PI / 2);
  const discMat = toon('#26222a');
  const labelGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.005, 24);
  labelGeo.rotateX(Math.PI / 2);
  const sleeveGeo = new THREE.BoxGeometry(SLEEVE, SLEEVE, THICK);

  let sleeves = [];
  let shelf = null;
  let hovered = -1;
  let forced = null;   // ?hover=N for screenshots
  let playingId = null;
  const fontReady = document.fonts?.load(`64px ${FONT}`).catch(() => {}) ?? Promise.resolve();

  function clear() {
    for (const s of sleeves) {
      root.remove(s.mesh);
      s.cover.dispose();
      s.coverMat.dispose();
      s.spineMat.dispose();
    }
    sleeves = [];
  }

  function setShelf(next, { index = 0, total = 1 } = {}) {
    clear();
    shelf = next;
    hovered = -1;
    const items = next.items.slice(0, MAX_ITEMS);
    const n = items.length;
    const spacing = Math.min(0.085, (LEN - 0.3) / Math.max(1, n - 1));
    const x0 = -((n - 1) * spacing) / 2 - 0.03;
    const r = rng(n * 31 + next.title.length);
    items.forEach((item, i) => {
      const spineMat = toon(new THREE.Color().setHSL(r(), 0.3, 0.5));
      const cover = coverTexture(item.art, (c) => spineMat.color.copy(c));
      const coverMat = crisp({ map: cover });
      // box faces: +x, -x (spines), +y, -y, +z (cover), -z (back). The back shows the art too:
      // the rack is seen from the front, so half the row shows its backs.
      const mesh = new THREE.Mesh(sleeveGeo, [spineMat, spineMat, spineMat, spineMat, coverMat, coverMat]);
      mesh.castShadow = true;
      mesh.rotation.order = 'YXZ';
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.add(new THREE.Mesh(labelGeo, spineMat));
      mesh.add(disc);
      root.add(mesh);
      sleeves.push({
        item, mesh, disc, cover, coverMat, spineMat,
        x: x0 + i * spacing + (r() - 0.5) * 0.01,
        yaw: REST_YAW + (r() - 0.5) * 0.08,
        roll: (r() - 0.5) * 0.05,
        lift: 0, push: 0, peek: 0, bump: 0,
        appear: -i * 0.035, // staggered drop-in
      });
    });
    root.userData.spacing = spacing;
    root.userData.x0 = x0;
    fontReady.then(() => drawSign(next.title, index, total));
  }

  // The sign is painted like the buttons: paper letters left in an indigo brush stroke.
  function drawSign(title, index, total) {
    signG.clearRect(0, 0, 1024, 128);
    signG.font = `86px ${FONT}`;
    const w = Math.min(860, signG.measureText(title).width + 170);
    const plate = new Image();
    plate.onload = () => {
      signG.clearRect(0, 0, 1024, 128);
      signG.drawImage(plate, 512 - w / 2, 4, w, 120);
      signG.textAlign = 'center';
      signG.textBaseline = 'middle';
      signG.fillStyle = PAPER;
      signG.font = `80px ${FONT}`;
      signG.fillText(title, 512, 66, w - 150);
      if (total > 1) {
        signG.font = `40px ${FONT}`;
        signG.fillStyle = INK;
        signG.fillText('‹ tab', 512 - w / 2 - 70, 68);
        signG.fillText(`${index + 1}/${total} ›`, 512 + w / 2 + 70, 68);
      }
      signTex.needsUpdate = true;
    };
    plate.src = brushStroke(w / 2, 60, INK, 5 + index);
  }

  function showTag(i) {
    const s = sleeves[i];
    if (!s) { tag.visible = false; tag.removeFromParent(); return; }
    fontReady.then(() => { drawTag(tagG, 640, 190, s.item, i + 3); tagTex.needsUpdate = true; });
    s.mesh.add(tag);
    tag.visible = true;
  }

  // Which slot the cursor is over: intersect the view ray with the rack's front plane and read x.
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();
  function slotAt(pointer, camera) {
    if (!pointer || !sleeves.length) return -1;
    ray.setFromCamera(pointer, camera);
    plane.constant = -(RACK_POS.z + 0.05);
    if (!ray.ray.intersectPlane(plane, hit)) return -1;
    const lx = hit.x - RACK_POS.x, ly = hit.y - RACK_POS.y;
    if (ly < BASE - 0.05 || ly > BASE + SLEEVE + LIFT + 0.12) return -1;
    const i = Math.round((lx - root.userData.x0) / root.userData.spacing);
    // a little past either end still counts, so the end records are easy to reach
    if (i < -1 || i > sleeves.length) return -1;
    return Math.min(sleeves.length - 1, Math.max(0, i));
  }

  function update(dt, camera, pointer, active) {
    const want = forced ?? (active ? slotAt(pointer, camera) : -1);
    if (want !== hovered) {
      hovered = want;
      showTag(hovered);
    }
    const kLift = smooth(14, dt), kPush = smooth(10, dt);
    sleeves.forEach((s, i) => {
      s.appear = Math.min(1, s.appear + dt * 2.4);
      const d = hovered < 0 ? 0 : i - hovered;
      const lift = d === 0 && hovered >= 0 ? 1 : 0;
      // neighbours lean away to make room, fading out over a few slots
      const push = d === 0 || hovered < 0 ? 0 : Math.sign(d) * 0.065 * Math.max(0, 1 - (Math.abs(d) - 1) / 4);
      const peek = s.item.play?.videoId && s.item.play.videoId === playingId ? 1 : 0;
      s.lift += (lift - s.lift) * kLift;
      s.push += (push - s.push) * kPush;
      s.peek += (peek - s.peek) * kPush;
      s.bump = Math.max(0, s.bump - dt * 3);
      const drop = 1 - easeOut(s.appear);
      const L = s.lift, m = s.mesh;
      m.position.set(
        s.x + s.push,
        BASE + SLEEVE / 2 + LIFT * L + 0.045 * s.peek + 0.06 * Math.sin(s.bump * Math.PI) + drop * 0.7,
        -0.02 + FORWARD * L,
      );
      m.rotation.set(TILT_BACK * L, s.yaw * (1 - L), s.roll * (1 - L) - s.push * 1.6);
      m.visible = s.appear > 0;
      // the record slides up out of the sleeve as it lifts (and stays peeking while it plays)
      s.disc.position.set(0, 0.11 * L + 0.05 * s.peek * (1 - L), 0);
    });
    tag.scale.setScalar(0.6 + 0.4 * (sleeves[hovered]?.lift ?? 0));
  }

  function click() {
    const s = sleeves[hovered];
    if (!s) return false;
    s.bump = 1;
    onPick?.(s.item, hovered);
    return true;
  }

  return {
    root,
    setShelf,
    update,
    click,
    get hovered() { return hovered; },
    set forceHover(i) { forced = i; },
    setPlaying(videoId) { playingId = videoId; },
    // more shelves arrived: just repaint the "n/total" on the sign
    setShelfCount(index, total) { if (shelf) fontReady.then(() => drawSign(shelf.title, index, total)); },
    ready: () => Promise.all([fontReady, ...sleeves.map((s) => s.cover.userData.loaded)]),
  };
}
