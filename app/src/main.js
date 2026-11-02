import * as THREE from 'three';
import { buildStreet } from './street.js';
import { buildShop } from './shop.js';
import { WATERCOLOUR } from './style.js';
import { createWatercolour } from './watercolour.js';
import { createSky } from './sky.js';
import { createTimeOfDay } from './timeofday.js';
import { createRack, RACK_POS } from './rack.js';
import { createMusic } from './music.js';
import { createControls } from './controls.js';
import '@fontsource/caveat-brush';

const params = new URLSearchParams(location.search);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: params.has('shot') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const painter = WATERCOLOUR ? createWatercolour(renderer) : null;

const scene = new THREE.Scene();
const skyColor = new THREE.Color('#f4c98a');
scene.background = skyColor;
scene.fog = new THREE.Fog('#f1cf9b', 18, 52);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 120);
const rig = new THREE.Group();
rig.add(camera);
scene.add(rig);

// Light: warm low sun for the street, soft sky fill. Interior lamps live in shop.js.
const hemi = new THREE.HemisphereLight('#d6dcf2', '#b08a70', 1.55);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#ffc27a', 2.3);
// shadows cover the whole street and the shop behind it, so the vaults keep the sun out
sun.position.set(-20, 16, 30);
sun.target.position.set(0, 0, -1);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 110 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

const sky = createSky();
scene.add(sky.dome);

const street = buildStreet();
scene.add(street.root);
scene.add(buildShop());
const timeOfDay = createTimeOfDay({ scene, sun, hemi, sky });

// ---- music: the record rack, the buttons and YouTube Music (or the fake store in a browser) ----
const music = createMusic();
let player = {};
const rack = createRack({ onPick: (item) => music.play(item) });
scene.add(rack.root);
const controls = createControls({
  onCommand: (name, arg) => music.command(name, arg),
  onSignIn: () => music.signIn(),
});
music.onState((s) => {
  player = s;
  controls.setState(s, { real: music.real });
  rack.setPlaying(s.adPlaying ? null : s.videoId);
});

// Shelves ("Listen again", "Quick picks"...). Until the floating category words exist, Tab flips
// the rack to the next shelf.
let shelves = [];
let shelfAt = 0;
function showShelf(i) {
  if (!shelves.length) return;
  shelfAt = (i + shelves.length) % shelves.length;
  rack.setShelf(shelves[shelfAt], { index: shelfAt, total: shelves.length });
}
const SHELF_PAGES = 3;
async function loadShelves() {
  try {
    // show the first page as soon as it arrives, then add the rest behind it
    let page = await music.shelves();
    shelves = page.shelves;
    showShelf(0);
    for (let i = 1; i < SHELF_PAGES && page.next; i++) {
      page = await music.shelves(page.next);
      shelves.push(...page.shelves);
      rack.setShelfCount(shelfAt, shelves.length);
    }
  } catch (e) {
    console.warn('could not load shelves', e);
  }
}
loadShelves();
music.onSignedIn(loadShelves);
if (params.has('hover')) rack.forceHover = Number(params.get('hover'));
// for tests and the devtools console
window.__cadenceDebug = { get shelves() { return shelves; }, get player() { return player; }, rack, music };

// ---- intro timeline (seconds) ----
const T = { hold: 0.9, push: 4.4, doorStart: 3.0, doorEnd: 4.9, enter: 7.6, pick: 9.4 };
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;

function cameraAt(t) {
  const push = easeInOut(clamp01((t - T.hold) / (T.push - T.hold)));
  const enter = easeInOut(clamp01((t - T.push) / (T.enter - T.push)));
  const z = lerp(lerp(19.5, 2.6, push), -3.5, enter);
  const y = lerp(lerp(2.3, 1.75, push), 1.7, enter);
  // gentle sway while walking
  const sway = Math.sin(t * 1.7) * 0.04 * (push > 0 && enter < 1 ? 1 : 0);
  // then step up to the record rack and look down into it
  const pick = easeInOut(clamp01((t - T.enter) / (T.pick - T.enter)));
  const pos = new THREE.Vector3(sway, lerp(y, PICK.pos.y, pick), lerp(z, PICK.pos.z, pick));
  const target = new THREE.Vector3(0, lerp(lerp(2.0, 1.55, enter), PICK.target.y, pick), lerp(z - 10, PICK.target.z, pick));
  return { pos, target };
}
const PICK = {
  pos: new THREE.Vector3(0, 1.82, RACK_POS.z + 1.12),
  target: new THREE.Vector3(0, 0.98, RACK_POS.z - 0.12),
};

function doorAngle(t) {
  return easeInOut(clamp01((t - T.doorStart) / (T.doorEnd - T.doorStart))) * THREE.MathUtils.degToRad(105);
}

// ---- cursor tilt ----
const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
let pointer = null; // normalised device coords, for picking records
addEventListener('pointermove', (e) => {
  tilt.tx = (e.clientX / innerWidth) * 2 - 1;
  tilt.ty = (e.clientY / innerHeight) * 2 - 1;
  pointer = new THREE.Vector2(tilt.tx, -tilt.ty);
});
document.addEventListener('pointerleave', () => { pointer = null; });
renderer.domElement.addEventListener('click', () => rack.click());

// Keys: Space play/pause, arrows back/skip and volume, L like, Tab next shelf. Scroll = volume.
addEventListener('keydown', (e) => {
  const cmd = { ' ': 'toggle', ArrowRight: 'next', ArrowLeft: 'previous', l: 'like', L: 'like' }[e.key];
  if (cmd) { e.preventDefault(); music.command(cmd); return; }
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
    music.command('volume', (player.volume ?? 70) + (e.key === 'ArrowUp' ? 5 : -5));
  } else if (e.key === 'Tab') {
    e.preventDefault();
    showShelf(shelfAt + (e.shiftKey ? -1 : 1));
  }
});
// scroll keeps its own running volume (player state lags a few hundred ms behind)
let wheelVol = null, wheelIdle = 0;
addEventListener('wheel', (e) => {
  wheelVol = Math.min(100, Math.max(0, (wheelVol ?? player.volume ?? 70) - e.deltaY * 0.05));
  music.command('volume', wheelVol);
  clearTimeout(wheelIdle);
  wheelIdle = setTimeout(() => { wheelVol = null; }, 600);
}, { passive: true });

const lookM = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

// ?cam=x,y,z,tx,ty,tz pins the camera (for looking around the shop while the intro only reaches the hall)
const pinned = params.get('cam')?.split(',').map(Number);

let lastT = 0;
function frame(t, dtOverride) {
  const dt = dtOverride ?? Math.min(0.1, Math.max(0, t - lastT));
  lastT = t;
  timeOfDay.update(t);
  const c = pinned ? { pos: new THREE.Vector3(...pinned.slice(0, 3)), target: new THREE.Vector3(...pinned.slice(3, 6)) } : cameraAt(t);
  rig.position.copy(c.pos);
  // Matrix4.lookAt uses the camera convention (looks down -z); Object3D.lookAt on a group would face the other way.
  rig.quaternion.setFromRotationMatrix(lookM.lookAt(c.pos, c.target, UP));
  for (const { pivot, side } of street.leaves) pivot.rotation.y = side * -doorAngle(t);
  tilt.x += (tilt.tx - tilt.x) * 0.06;
  tilt.y += (tilt.ty - tilt.y) * 0.06;
  const settled = clamp01((t - T.push) / (T.enter - T.push));
  const picking = clamp01((t - T.enter) / (T.pick - T.enter));
  // gentle tilt outside, full tilt inside, calmer at the rack so records stay put under the cursor
  const k = (0.25 + 0.75 * settled) * (1 - 0.7 * picking);
  camera.rotation.order = 'YXZ';
  camera.rotation.set(-tilt.y * 0.09 * k, -tilt.x * 0.2 * k, 0);
  rig.updateMatrixWorld();
  rack.update(dt, camera, pointer, picking > 0.95 || !!pinned);
  controls.show(t > T.enter + 0.6 || !!pinned, params.has('shot'));
  controls.tilt(tilt.x, tilt.y);
  if (painter) painter.render(scene, camera, t);
  else renderer.render(scene, camera);
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  painter?.setSize();
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// Deterministic time for screenshots: ?shot, then window.__seek(seconds).
if (params.has('shot')) {
  // let covers and fonts arrive, then settle all animation (big dt) before the frame is captured
  window.__seek = async (t) => {
    await new Promise((r) => setTimeout(r, 300));
    await rack.ready();
    await controls.ready();
    frame(t, 10);
    await new Promise((r) => setTimeout(r, 100)); // tag and sign textures are drawn a tick later
    frame(t, 10);
    return true;
  };
  window.__ready = true;
} else {
  const start = performance.now() - (Number(params.get('t')) || 0) * 1000;
  renderer.setAnimationLoop(() => frame(Math.min((performance.now() - start) / 1000, T.enter + 9999)));
}
