// Shared building blocks for the record racks (src/racks/*.js).
//
// ---------------------------------------------------------------------------------------------
// API (short version; every rack module is `create<Style>Rack({ onPick }) -> contract`, see SPEC)
//
//   getCover(url, size = 256) -> { tex, loaded: Promise, color }   URL-keyed cache. 256 px for
//        resting sleeves, 512 px for the hovered one (LRU of 32). Videos' 16:9 thumbs are cropped to
//        the middle square. `color` = average cover colour once loaded (null before).
//   new Sleeve(item, index, { size = 0.31, thick = 0.014 })       sleeve mesh + vinyl disc.
//        .mesh (add it to your root; origin = centre of the sleeve, cover faces +z, top edge +y),
//        .disc (child group, the vinyl, slides out of the top), .lift/.peek/.bump/.appear (0..1,
//        smoothed for you), .empty (vinyl is in the suitcase), .big (512 px cover texture).
//        Pose it yourself every frame: mesh.position / mesh.rotation. Use s.drop for the drop-in.
//   createRackCore({ onPick, sign, tag, maxItems }) -> core        does everything the contract
//        needs except the furniture and the layout: core.root, core.sleeves, core.sign, core.tag,
//        core.picker, core.hovered. Finish with core.contract({ setup?, items, layout, pick? }):
//          items(core, items)            sleeves exist (added to core.root, hidden until `appear`
//                                        passes 0); place the rest-pose and fill core.picker.
//          layout(core, dt, camera, hovered)   every frame: pose each sleeve from s.lift etc.
//          pick?(core, pointer, camera)  override the hit test (default: core.picker boxes).
//        Returns the full contract (setShelf, update, click, hovered, forceHover, setPlaying,
//        ready, root). The vinyl pick animation and "vinyl goes back" are handled here.
//   rack.refreshArt(item)  (in every contract) the item's art changed after setShelf (a repaired
//        playlist cover): sleeves showing it (same object or same play.playlistId / videoId) get the
//        new 256 px cover (and 512 px if lifted) and spine colour in place. No re-drop, no re-layout.
//   createPicker() -> { clear(), add(i, restMatrix, halfSize, pad), pick(pointer, camera, root) }
//        generic hit test on REST-pose boxes in the rack root's local space (no scale in matrix),
//        so a sleeve lifting out never changes what is under the cursor. Nearest box wins.
//   createSign({ w, h, color, res }) -> { mesh, setTitle(t), ready }   shelf title as paper letters in an
//        indigo brush stroke. `ready` resolves when the current title is painted.
//   createTag({ w, h }) -> { mesh, show(item), hide(), ready }   paper name tag (crisp).
//   addBox(parent, [w,h,d], mat, [x,y,z], [rx,ry,rz]) -> Mesh     painted block, casts/receives.
//   instancedBoxes([{p,s,r,c}]) -> InstancedMesh  many filler blocks in one draw call.
//   s.hidden = true hides a sleeve (paged racks). picker ids >= 1000 are rack controls: core.control
//        holds the hovered one and def.control(core, id) runs on click.
//   core.camLocal  the camera in the root's space (valid inside layout()).
//   WOOD  shared toon wood materials (dark, top, light, pale, paint colours via paint(hex)).
//   fontReady  Promise (brush font loaded).  smooth(rate, dt), easeOut(t), clamp01.
// ---------------------------------------------------------------------------------------------
import * as THREE from 'three';
import { paintCover, coverSeed } from '../coverpaint.js';
import { toon, crisp } from '../materials.js';
import { rng } from '../rand.js';
import { brushStroke, INK, PAPER } from '../controls.js';
import { FONT } from '../style.js';

export const MAX_ITEMS = 24;
export const SLEEVE = 0.31;
export const THICK = 0.014;
export const smooth = (rate, dt) => 1 - Math.exp(-rate * dt);
export const clamp01 = (t) => Math.min(1, Math.max(0, t));
export const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
export const fontReady = (typeof document !== 'undefined' && document.fonts?.load(`64px ${FONT}`).catch(() => {})) || Promise.resolve();

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

// ---- covers -----------------------------------------------------------------------------------

const covers = new Map();   // `${size}|${url}` -> entry
const bigOrder = [];        // keys of 512 px entries, oldest first (LRU)
const BIG_KEEP = 32;
const [avgC, avgG] = typeof document !== 'undefined' ? canvas(8, 8) : [];

// Spine colour from the cover: the average, deepened a little so the row reads as a painted band.
function averageColor(img) {
  avgG.drawImage(img, 0, 0, 8, 8);
  const d = avgG.getImageData(0, 0, 8, 8).data;
  let R = 0, G = 0, B = 0;
  for (let i = 0; i < d.length; i += 4) { R += d[i]; G += d[i + 1]; B += d[i + 2]; }
  const n = d.length / 4;
  return new THREE.Color(`rgb(${Math.round(R / n)},${Math.round(G / n)},${Math.round(B / n)})`).offsetHSL(0, 0.08, -0.04);
}

// Square cover texture from any thumbnail. Cached by URL and size; textures are shared by every
// sleeve that shows the same art, so never dispose them yourself.
export function getCover(url, size = 256) {
  const key = `${size}|${url || ''}`;
  let e = covers.get(key);
  if (e) {
    if (size > 256) { bigOrder.splice(bigOrder.indexOf(key), 1); bigOrder.push(key); }
    return e;
  }
  const [c, g] = canvas(size, size);
  g.fillStyle = '#d9cbb2';
  g.fillRect(0, 0, size, size);
  if (!url) { // no art: a blank paper sleeve with a pencilled circle
    g.strokeStyle = 'rgba(120,90,60,.35)';
    g.lineWidth = size / 40;
    g.beginPath(); g.arc(size / 2, size / 2, size * 0.3, 0, Math.PI * 2); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = size > 256 ? 8 : 4;
  e = { tex, color: null, loaded: Promise.resolve() };
  covers.set(key, e);
  if (size > 256) {
    bigOrder.push(key);
    while (bigOrder.length > BIG_KEEP) {
      const old = bigOrder.shift();
      covers.get(old)?.tex.dispose();
      covers.delete(old);
    }
  }
  if (url) {
    e.loaded = new Promise((res) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const s = Math.min(img.width, img.height);
        g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        paintCover(g, size, coverSeed(url));
        tex.needsUpdate = true;
        if (size <= 256) { try { e.color = averageColor(img); } catch { /* tainted canvas: keep the default spine */ } }
        res();
      };
      img.onerror = res;
      img.src = url;
    });
  }
  return e;
}

// ---- vinyl --------------------------------------------------------------------------------------

let vinyl = null;
function vinylParts() {
  if (vinyl) return vinyl;
  // faint grooves and one soft sheen, so the disc reads as vinyl and not a black coin
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#25212a';
  g.fillRect(0, 0, 256, 256);
  for (let r = 40; r < 126; r += 3.2) {
    g.strokeStyle = `rgba(255,240,220,${0.03 + ((r * 7) % 5) * 0.012})`;
    g.lineWidth = 1;
    g.beginPath(); g.arc(128, 128, r, 0, Math.PI * 2); g.stroke();
  }
  const sheen = g.createLinearGradient(40, 40, 216, 216);
  sheen.addColorStop(0.35, 'rgba(255,245,230,0)');
  sheen.addColorStop(0.5, 'rgba(255,245,230,.16)');
  sheen.addColorStop(0.65, 'rgba(255,245,230,0)');
  g.fillStyle = sheen;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.CylinderGeometry(0.145, 0.145, 0.004, 40);
  geo.rotateX(Math.PI / 2);
  const labelGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.005, 24);
  labelGeo.rotateX(Math.PI / 2);
  vinyl = { geo, labelGeo, mat: toon('#ffffff', { map: tex }) };
  return vinyl;
}

const geoCache = new Map();
const sleeveGeo = (size, thick) => {
  const k = `${size}|${thick}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.BoxGeometry(size, size, thick));
  return geoCache.get(k);
};

// How far the vinyl is slid up (in a 0.31 m sleeve): peeking while hovered, completely clear to pick.
const DISC_HOVER = 0.11, DISC_OUT = 0.31;

export class Sleeve {
  constructor(item, index, { size = SLEEVE, thick = THICK, seed = index } = {}) {
    this.item = item;
    this.index = index;
    this.size = size;
    this.thick = thick;
    this.seed = seed;
    this.lift = 0; this.peek = 0; this.bump = 0; this.appear = 0; this.drop = 1;
    this.empty = false;      // the vinyl is away (playing / being picked)
    this.hot = false;
    this.art = item.art;
    const small = getCover(item.art, 256);
    this.small = small;
    this.big = null;
    this.spineMat = toon(small.color ?? new THREE.Color().setHSL(rng(seed * 7 + 3)(), 0.3, 0.5));
    if (!small.color) small.loaded.then(() => { if (small.color) this.spineMat.color.copy(small.color); });
    this.coverMat = crisp({ map: small.tex });
    // box faces: +x, -x, +y, -y (spine colour), +z (cover), -z (back: shows the art too, because
    // some racks are seen from behind)
    this.mesh = new THREE.Mesh(sleeveGeo(size, thick), [this.spineMat, this.spineMat, this.spineMat, this.spineMat, this.coverMat, this.coverMat]);
    this.mesh.castShadow = true;
    this.mesh.rotation.order = 'YXZ';
    this.mesh.visible = false;
    const v = vinylParts();
    this.disc = new THREE.Group();
    this.disc.add(new THREE.Mesh(v.geo, v.mat), new THREE.Mesh(v.labelGeo, this.spineMat));
    this.disc.scale.setScalar(size / SLEEVE);
    this.disc.visible = false;
    this.mesh.add(this.disc);
    this.discY = 0;          // current slide, in sleeve units of 0.31
    this.picking = false;
    this.onGone = null;
  }

  // The hovered sleeve shows the 512 px cover (swapped in as soon as it has loaded).
  setHot(on) {
    if (on === this.hot) return;
    this.hot = on;
    const use = (t) => { this.coverMat.map = t; this.coverMat.emissiveMap = t; };
    if (on) {
      this.big = getCover(this.art, 512);
      if (this.art) this.big.loaded.then(() => { if (this.hot) use(this.big.tex); });
      else use(this.big.tex);
    } else use(this.small.tex);
  }

  // 512 px cover for the record label of the flying disc.
  bigCover() { return (this.big ??= getCover(this.art, 512)).tex; }

  // The item's art changed after the sleeve was made (a repaired playlist cover): swap the cover
  // textures and the spine colour in place, nothing else moves.
  refreshArt(art) {
    if (art === this.art) return;
    this.art = art;
    this.small = getCover(art, 256);
    const upd = () => { if (this.small.color) this.spineMat.color.copy(this.small.color); };
    if (this.small.color) upd(); else this.small.loaded.then(upd);
    if (this.big) this.big = getCover(art, 512);
    // the 512 px one swaps in once loaded; the 256 px one is shown meanwhile
    this.coverMat.map = this.coverMat.emissiveMap = this.small.tex;
    if (this.hot && this.big) this.big.loaded.then(() => { if (this.hot && this.art === art) this.coverMat.map = this.coverMat.emissiveMap = this.big.tex; });
  }

  // The vinyl is gone (in the suitcase), instantly or sliding back in.
  setEmpty(on) {
    if (on === this.empty) return;
    this.empty = on;
    if (on) { this.discY = 0; this.disc.visible = false; }
    else { this.discY = DISC_OUT; this.disc.visible = true; this.picking = false; } // slides back in
  }

  // Click: the vinyl slides fully out, then is hidden and `done(discInfo)` is called.
  startPick(done) {
    if (this.picking || this.empty) return false;
    this.picking = true;
    this.onGone = done;
    this.disc.visible = true;
    return true;
  }

  step(dt, hovered) {
    const k = smooth(14, dt);
    this.appear = Math.min(1, this.appear + dt * 2.4);
    this.drop = 1 - easeOut(this.appear);
    this.lift += ((hovered ? 1 : 0) - this.lift) * k;
    this.peek += ((this.empty ? 1 : 0) - this.peek) * smooth(10, dt);
    this.bump = Math.max(0, this.bump - dt * 3);
    if (!this.hot && hovered) this.setHot(true);
    else if (this.hot && !hovered && this.lift < 0.02) this.setHot(false);
    if (this.empty && !this.picking) return;
    const target = this.picking ? DISC_OUT : DISC_HOVER * this.lift;
    this.discY += (target - this.discY) * smooth(this.picking ? 22 : 12, dt);
    this.disc.position.y = this.discY * (this.size / SLEEVE);
    this.disc.visible = this.discY > 0.004;
    if (this.picking && this.discY > DISC_OUT - 0.012) {
      // clear of the sleeve: report its world pose and hide it, the suitcase takes over
      this.picking = false;
      this.empty = true;
      this.discY = DISC_OUT;
      this.disc.position.y = DISC_OUT * (this.size / SLEEVE);
      this.disc.updateWorldMatrix(true, false);
      const info = { matrixWorld: this.disc.matrixWorld.clone(), cover: this.bigCover() };
      this.disc.visible = false;
      const cb = this.onGone;
      this.onGone = null;
      cb?.(info);
    }
  }

  dispose() {
    this.mesh.removeFromParent();
    this.spineMat.dispose();
    this.coverMat.dispose();
  }
}

// ---- picking ----------------------------------------------------------------------------------

const _v = new THREE.Vector3(), _box = new THREE.Box3(), _ray = new THREE.Ray(), _inv = new THREE.Matrix4(), _hit = new THREE.Vector3();

export function createPicker() {
  const boxes = [];
  const local = new THREE.Ray();
  const caster = new THREE.Raycaster();
  return {
    clear() { boxes.length = 0; },
    // restMatrix: the box centre and orientation in the rack ROOT's space; halfSize: [x, y, z]
    add(i, restMatrix, halfSize, pad = 0) {
      const m = restMatrix.isObject3D ? (restMatrix.updateMatrix(), restMatrix.matrix) : restMatrix;
      boxes.push({ i, inv: new THREE.Matrix4().copy(m).invert(), half: new THREE.Vector3(...halfSize).addScalar(pad) });
    },
    pick(pointer, camera, root) {
      if (!pointer || !boxes.length) return -1;
      caster.setFromCamera(pointer, camera);
      root.updateWorldMatrix(true, false);
      _inv.copy(root.matrixWorld).invert();
      local.copy(caster.ray).applyMatrix4(_inv);
      let best = -1, bestD = Infinity;
      for (const b of boxes) {
        _ray.copy(local).applyMatrix4(b.inv);
        _box.min.copy(b.half).negate();
        _box.max.copy(b.half);
        if (!_ray.intersectBox(_box, _hit)) continue;
        const d = _v.copy(_hit).sub(_ray.origin).lengthSq();
        if (d < bestD) { bestD = d; best = b.i; }
      }
      return best;
    },
  };
}

// ---- painted wood -----------------------------------------------------------------------------

export const WOOD = {
  dark: toon('#8a5a32'),
  top: toon('#a8743a'),
  light: toon('#b98a52'),
  pale: toon('#d2a672'),
  deep: toon('#5a3d24'),
  iron: toon('#2b2a2e'),
};
const paints = new Map();
export function paint(hex) {
  if (!paints.has(hex)) paints.set(hex, toon(hex));
  return paints.get(hex);
}

// Many small painted blocks as ONE draw call (filler records, slats...). list: [{ p:[x,y,z],
// s:[w,h,d], r:[rx,ry,rz], c:'#hex' }]. Colour comes per instance; the material is shared.
let instMat = null;
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const _im = new THREE.Matrix4(), _iq = new THREE.Quaternion(), _ie = new THREE.Euler(), _ic = new THREE.Color();
export function instancedBoxes(list) {
  instMat ??= toon('#ffffff');
  const mesh = new THREE.InstancedMesh(unitBox, instMat, Math.max(1, list.length));
  list.forEach((b, i) => {
    _ie.set(...(b.r ?? [0, 0, 0]));
    _im.compose(new THREE.Vector3(...b.p), _iq.setFromEuler(_ie), new THREE.Vector3(...b.s));
    mesh.setMatrixAt(i, _im);
    mesh.setColorAt(i, _ic.set(b.c));
  });
  mesh.count = list.length;
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

const boxGeos = new Map();
export function addBox(parent, [w, h, d], mat, [x, y, z] = [0, 0, 0], [rx, ry, rz] = [0, 0, 0]) {
  const k = `${w}|${h}|${d}`;
  if (!boxGeos.has(k)) boxGeos.set(k, new THREE.BoxGeometry(w, h, d));
  const m = new THREE.Mesh(boxGeos.get(k), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}

// ---- sign and tag -----------------------------------------------------------------------------

// Text that shrinks until it fits.
function fitText(g, text, x, y, maxW, size) {
  let s = size;
  do { g.font = `${s}px ${FONT}`; s -= 2; } while (g.measureText(text).width > maxW && s > 12);
  g.fillText(text, x, y);
}

// The shelf title, painted like the buttons: paper letters left in an indigo brush stroke.
export function createSign({ w = 1.2, h = 0.15, color = INK, res = 1024 } = {}) {
  const CW = res, CH = Math.round(res * h / w);
  const [c, g] = canvas(CW, CH);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), crisp({ map: tex, alphaTest: 0.4 }));
  const sign = { mesh, ready: Promise.resolve(), title: '' };
  let seq = 0;
  sign.setTitle = (title) => {
    sign.title = title;
    const my = ++seq;
    sign.ready = fontReady.then(() => new Promise((res) => {
      if (my !== seq) return res();
      const fs = CH * 0.62;
      g.font = `${fs}px ${FONT}`;
      const pw = Math.min(CW * 0.9, g.measureText(title).width + CH * 1.3);
      const plate = new Image();
      plate.onload = () => {
        if (my === seq) {
          g.clearRect(0, 0, CW, CH);
          g.drawImage(plate, CW / 2 - pw / 2, CH * 0.03, pw, CH * 0.94);
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillStyle = PAPER;
          g.font = `${fs}px ${FONT}`;
          g.fillText(title, CW / 2, CH * 0.52, pw - CH * 1.1);
          tex.needsUpdate = true;
        }
        res();
      };
      plate.onerror = res;
      plate.src = brushStroke(Math.round(pw / 2), Math.round(CH * 0.47), color, 5 + title.length);
    }));
  };
  return sign;
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

export function createTag({ w = 0.34, h = 0.1 } = {}) {
  const [c, g] = canvas(640, 190);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), crisp({ map: tex, alphaTest: 0.4 }));
  mesh.visible = false;
  let seq = 0;
  const tag = { mesh, ready: Promise.resolve() };
  tag.show = (item, seed = 3) => {
    const my = ++seq;
    mesh.visible = true;
    tag.ready = fontReady.then(() => { if (my === seq) { drawTag(g, 640, 190, item, seed); tex.needsUpdate = true; } });
  };
  tag.hide = () => { seq++; mesh.visible = false; mesh.removeFromParent(); };
  return tag;
}

// ---- playing state ----------------------------------------------------------------------------

// Which sleeves are empty: the playing one, plus the one just picked until the player confirms
// (the player's state lags a moment behind the click).
function createPlayTracker() {
  let playing = null, pendingId = null, pendingUntil = 0;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  return {
    set(id) { playing = id; if (id && id === pendingId) pendingId = null; },
    picked(item) { pendingId = item.play?.videoId ?? null; pendingUntil = now() + 4000; },
    isEmpty(item) {
      const id = item.play?.videoId;
      if (!id) return false;
      return id === playing || (id === pendingId && now() < pendingUntil);
    },
  };
}

// ---- screen keep-out ---------------------------------------------------------------------------

// A box on screen (CSS px, e.g. the suitcase and its caption) that lifted records must not float
// under. main.js sets it once: setScreenAvoid(() => rect | null, () => aimCamera).
// Records never move to dodge it: the rack reports how far they would have to move on screen
// (core.clearShift, metres along the view's right / up at the record) and main.js moves the camera
// the other way (left, or down), so the records stay put in the room and the view makes room instead.
// It is measured against the camera the view is heading to without that shift (cursor tilt plus the
// hover focus turn's target): measured against the live camera, the shift would change its own measure.
let avoidFn = null, avoidCamFn = null;
export function setScreenAvoid(fn, cameraFn = null) { avoidFn = fn; avoidCamFn = cameraFn; }

const _bb = new THREE.Box3(), _c = new THREE.Vector3(), _wp = new THREE.Vector3();
const AVOID_MARGIN = 14;
// How far a lifted sleeve (with its tag) must move to clear the box, both ways: out = { right, up } in
// metres at the sleeve's depth (0 when it already clears). Scaled by how far it is lifted, so the camera
// eases over as the record rises and back as it settles.
function measureClear(s, camera, rect, out) {
  out.right = out.up = 0;
  s.mesh.updateWorldMatrix(true, true);
  _bb.setFromObject(s.mesh);
  if (_bb.isEmpty()) return false;
  const W = innerWidth, H = innerHeight;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let k = 0; k < 8; k++) {
    _c.set(k & 1 ? _bb.max.x : _bb.min.x, k & 2 ? _bb.max.y : _bb.min.y, k & 4 ? _bb.max.z : _bb.min.z).project(camera);
    if (_c.z > 1) return false; // behind the camera: leave it
    const px = (_c.x + 1) / 2 * W, py = (1 - _c.y) / 2 * H;
    x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
  }
  const m = AVOID_MARGIN;
  if (x1 < rect.left - m || x0 > rect.right + m || y1 < rect.top - m || y0 > rect.bottom + m) return false;
  s.mesh.getWorldPosition(_wp);
  const depth = -_c.copy(_wp).applyMatrix4(camera.matrixWorldInverse).z;
  if (depth <= 0) return false;
  const perPx = (2 * depth * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / H;
  const L = s.lift, e = L * L * (3 - 2 * L);
  out.right = Math.max(0, rect.right + m - x0) * perPx * e;
  out.up = Math.max(0, y1 - (rect.top - m)) * perPx * e;
  return true;
}
const _need = { right: 0, up: 0 };
// The shift for all lifted sleeves together, in one direction. Sideways (camera left) is the rule:
// dropping the camera lifts the records into the side menu. Only when sideways would need more than
// the camera may move (CLEAR_MAX, as main.js clamps it) and up is shorter does it go up instead.
export const CLEAR_MAX = 1.0;
function clearShiftFor(core, camera, out) {
  out.x = out.y = 0;
  const rect = avoidFn?.();
  if (!rect || !rect.width) return out;
  let right = 0, up = 0, any = false;
  for (const s of core.sleeves) {
    if (s.lift < 0.01 || !s.mesh.visible) continue;
    if (!measureClear(s, camera, rect, _need)) continue;
    any = true;
    right = Math.max(right, _need.right);
    up = Math.max(up, _need.up);
  }
  if (!any) return out;
  if (right > CLEAR_MAX && up < right) out.y = up; else out.x = right;
  return out;
}

// ---- rack core ----------------------------------------------------------------------------------

const _hc = new THREE.Raycaster(), _hb = new THREE.Box3();
// The hovered sleeve, if it is well lifted and the cursor is over it as it is now. Racks can list
// more sleeves that count as held up (core.held, e.g. a fan of three): the nearest one under the cursor wins.
function heldUnder(core, pointer, camera) {
  const held = core.held ?? (core.hovered >= 0 ? [core.hovered] : []);
  if (!held.length) return -1;
  _hc.setFromCamera(pointer, camera);
  let best = -1, bestD = Infinity;
  for (const i of held) {
    const s = core.sleeves[i];
    if (!s || !s.mesh.visible) continue;
    if ((s.held ?? s.lift) < 0.5) continue;
    s.mesh.updateWorldMatrix(true, true);
    _hb.setFromObject(s.mesh);
    const hit = _hc.ray.intersectBox(_hb, _wp);
    if (!hit) continue;
    const d = hit.distanceToSquared(_hc.ray.origin);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

export function createRackCore({ onPick, sign = null, tag = {}, maxItems = MAX_ITEMS, sleeve = {}, tagOnSleeve = true } = {}) {
  const root = new THREE.Group();
  const core = {
    root,
    sleeves: [],
    picker: createPicker(),
    waitFor: [],                   // extra signs etc. (anything with a .ready promise) that ready() waits for
    sign: sign ? createSign(sign) : null,
    tag: createTag(tag),
    hovered: -1,
    control: -1,
    shelf: null,
    camLocal: new THREE.Vector3(), // the camera in the root's space, refreshed before layout()
    play: createPlayTracker(),
    clearShift: { x: 0, y: 0 },    // how far the lifted records would have to move to clear the suitcase (see measureClear)
  };
  if (core.sign) root.add(core.sign.mesh);

  let forced = null;

  function clear() {
    for (const s of core.sleeves) s.dispose();
    core.sleeves = [];
    core.picker.clear();
    core.tag.hide();
  }

  function setHovered(i) {
    if (i === core.hovered) return;
    core.hovered = i;
    const s = core.sleeves[i];
    if (!s) { core.tag.hide(); return; }
    core.tag.show(s.item, i + 3);
    if (tagOnSleeve) s.mesh.add(core.tag.mesh);
  }

  core.contract = (def) => {
    def.setup?.(core);
    return {
      root,
      setShelf(shelf) {
        clear();
        core.shelf = shelf;
        core.hovered = -1;
        const items = shelf.items.slice(0, maxItems);
        const sz = typeof sleeve === 'function' ? sleeve(items.length) : sleeve;
        items.forEach((item, i) => {
          const s = new Sleeve(item, i, { ...sz, seed: items.length * 31 + i });
          s.appear = -i * 0.035; // staggered drop-in
          s.setEmpty(core.play.isEmpty(item));
          if (s.empty) s.peek = 1;
          core.sleeves.push(s);
          root.add(s.mesh);
        });
        core.sign?.setTitle(shelf.title);
        def.items(core, items);
      },
      update(dt, camera, pointer, active) {
        const n = core.sleeves.length;
        let want = -1;
        if (forced !== null) want = forced < n ? forced : -1;
        else if (active && pointer && n) {
          // the record already held up wins while the cursor is on it, wherever it has moved to
          // (lifted toward you, slid clear of the suitcase): you click the song, not the rack behind it
          want = heldUnder(core, pointer, camera);
          if (want < 0) want = def.pick ? def.pick(core, pointer, camera) : core.picker.pick(pointer, camera, root);
        }
        // picks >= 1000 are controls of the rack itself (page arrows...): def.control(core, id) on click
        core.control = want >= 1000 ? want - 1000 : -1;
        if (want >= 1000) want = -1;
        setHovered(want);
        core.sleeves.forEach((s, i) => {
          s.empty !== core.play.isEmpty(s.item) && !s.picking && s.setEmpty(!s.empty);
          s.step(dt, i === want);
        });
        root.updateWorldMatrix(true, false);
        camera.getWorldPosition(core.camLocal); // world: the camera may sit in a rig (main.js)
        root.worldToLocal(core.camLocal);
        def.layout(core, dt, camera, want);
        core.sleeves.forEach((s) => { s.mesh.visible = s.appear > 0 && !s.hidden; });
        if (active) clearShiftFor(core, avoidCamFn?.() ?? camera, core.clearShift);
        else core.clearShift.x = core.clearShift.y = 0;
        if (core.tag.mesh.parent) core.tag.mesh.scale.setScalar(0.6 + 0.4 * (core.sleeves[want]?.lift ?? 0));
      },
      // the item's art changed (repaired playlist cover): re-skin its sleeve(s) without re-laying out
      refreshArt(item) {
        const id = (it) => it.play?.playlistId ?? it.play?.videoId ?? null;
        for (const s of core.sleeves) {
          if (s.item === item || (id(item) && id(s.item) === id(item))) { s.item.art = item.art; s.refreshArt(item.art); }
        }
      },
      click() {
        if (core.control >= 0) { def.control?.(core, core.control); return true; }
        const s = core.sleeves[core.hovered];
        if (!s || s.empty || s.picking) return false;
        const i = core.hovered;
        s.bump = 1;
        core.play.picked(s.item);
        s.startPick((disc) => onPick?.(s.item, i, disc));
        return true;
      },
      get hovered() { return core.hovered; },
      // metres the view should make room by (records move right = camera moves left; up = camera down)
      get clearShift() { return core.clearShift; },
      // where the hovered record is now (world), for the camera to turn toward; false if none
      focusPoint(out) {
        const s = core.sleeves[core.hovered];
        if (!s) return false;
        s.mesh.getWorldPosition(out);
        return true;
      },
      set forceHover(i) { forced = Number.isFinite(i) ? i : null; },
      setPlaying(videoId) { core.play.set(videoId); },
      setShelfCount() {}, // old main.js hook (the sign no longer shows tab hints)
      ready: () => Promise.all([fontReady, core.sign?.ready, ...core.waitFor.map((x) => x.ready), core.tag.ready, ...core.sleeves.map((s) => s.small.loaded), ...core.sleeves.map((s) => s.hot && s.big?.loaded)]),
    };
  };
  return core;
}
